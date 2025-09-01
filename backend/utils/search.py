"""
Advanced search and filtering utilities for repository data
"""

import re
from typing import List, Dict, Any, Callable, Optional, TypeVar
from functools import lru_cache
from datetime import datetime

T = TypeVar('T')


class SearchEngine:
    """Advanced search engine with multiple search strategies"""
    
    @staticmethod
    def exact_match(text: str, term: str, case_sensitive: bool = False) -> bool:
        """
        Exact string matching
        
        Args:
            text: Text to search in
            term: Search term
            case_sensitive: Whether search should be case sensitive
            
        Returns:
            True if exact match is found
        """
        if not case_sensitive:
            return term.lower() == text.lower()
        return term == text
    
    @staticmethod
    def contains_match(text: str, term: str, case_sensitive: bool = False) -> bool:
        """
        Substring matching
        
        Args:
            text: Text to search in
            term: Search term
            case_sensitive: Whether search should be case sensitive
            
        Returns:
            True if substring is found
        """
        if not case_sensitive:
            return term.lower() in text.lower()
        return term in text
    
    @staticmethod
    def prefix_match(text: str, term: str, case_sensitive: bool = False) -> bool:
        """
        Prefix matching
        
        Args:
            text: Text to search in
            term: Search term
            case_sensitive: Whether search should be case sensitive
            
        Returns:
            True if text starts with term
        """
        if not case_sensitive:
            return text.lower().startswith(term.lower())
        return text.startswith(term)
    
    @staticmethod
    def suffix_match(text: str, term: str, case_sensitive: bool = False) -> bool:
        """
        Suffix matching
        
        Args:
            text: Text to search in
            term: Search term
            case_sensitive: Whether search should be case sensitive
            
        Returns:
            True if text ends with term
        """
        if not case_sensitive:
            return text.lower().endswith(term.lower())
        return text.endswith(term)
    
    @staticmethod
    def regex_match(text: str, pattern: str, case_sensitive: bool = False) -> bool:
        """
        Regular expression matching
        
        Args:
            text: Text to search in
            pattern: Regex pattern
            case_sensitive: Whether search should be case sensitive
            
        Returns:
            True if pattern matches
        """
        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            return bool(re.search(pattern, text, flags))
        except re.error:
            # Invalid regex pattern, fall back to contains search
            return SearchEngine.contains_match(text, pattern, case_sensitive)
    
    @staticmethod
    def wildcard_match(text: str, pattern: str, case_sensitive: bool = False) -> bool:
        """
        Wildcard matching (* and ? support)
        
        Args:
            text: Text to search in
            pattern: Wildcard pattern (* = any characters, ? = single character)
            case_sensitive: Whether search should be case sensitive
            
        Returns:
            True if wildcard pattern matches
        """
        # Convert wildcard pattern to regex
        regex_pattern = pattern.replace('*', '.*').replace('?', '.')
        regex_pattern = f"^{regex_pattern}$"
        
        return SearchEngine.regex_match(text, regex_pattern, case_sensitive)


class RepositorySearchFilter:
    """Specialized search filter for repository data"""
    
    def __init__(
        self,
        search_term: Optional[str] = None,
        search_strategy: str = "contains",
        case_sensitive: bool = False,
        search_fields: Optional[List[str]] = None
    ):
        """
        Initialize repository search filter
        
        Args:
            search_term: Term to search for
            search_strategy: Search strategy (exact, contains, prefix, suffix, regex, wildcard)
            case_sensitive: Whether search is case sensitive
            search_fields: Fields to search in (default: name only)
        """
        self.search_term = search_term
        self.search_strategy = search_strategy
        self.case_sensitive = case_sensitive
        self.search_fields = search_fields or ["name"]
        
        # Map strategy names to functions
        self._strategy_map = {
            "exact": SearchEngine.exact_match,
            "contains": SearchEngine.contains_match,
            "prefix": SearchEngine.prefix_match,
            "suffix": SearchEngine.suffix_match,
            "regex": SearchEngine.regex_match,
            "wildcard": SearchEngine.wildcard_match
        }
        
        if search_strategy not in self._strategy_map:
            raise ValueError(f"Invalid search strategy. Must be one of: {list(self._strategy_map.keys())}")
    
    def matches(self, repository_data: Dict[str, Any]) -> bool:
        """
        Check if repository data matches search criteria
        
        Args:
            repository_data: Repository data dictionary
            
        Returns:
            True if repository matches search criteria
        """
        if not self.search_term:
            return True
        
        search_func = self._strategy_map[self.search_strategy]
        
        # Check each specified field
        for field_name in self.search_fields:
            field_value = repository_data.get(field_name)
            if field_value is not None:
                # Convert to string for searching
                text_value = str(field_value)
                if search_func(text_value, self.search_term, self.case_sensitive):
                    return True
        
        return False
    
    def filter_repositories(self, repositories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter list of repositories based on search criteria
        
        Args:
            repositories: List of repository data dictionaries
            
        Returns:
            Filtered list of repositories
        """
        if not self.search_term:
            return repositories
        
        return [repo for repo in repositories if self.matches(repo)]


class RepositorySearchBuilder:
    """Builder pattern for complex repository searches"""
    
    def __init__(self):
        self._filters: List[RepositorySearchFilter] = []
        self._name_filter: Optional[RepositorySearchFilter] = None
        self._namespace_filter: Optional[RepositorySearchFilter] = None
    
    def search_name(
        self,
        term: str,
        strategy: str = "contains",
        case_sensitive: bool = False
    ) -> "RepositorySearchBuilder":
        """Add name search filter"""
        self._name_filter = RepositorySearchFilter(
            search_term=term,
            search_strategy=strategy,
            case_sensitive=case_sensitive,
            search_fields=["name"]
        )
        return self
    
    def search_namespace(
        self,
        term: str,
        strategy: str = "prefix",
        case_sensitive: bool = False
    ) -> "RepositorySearchBuilder":
        """Add namespace search filter"""
        self._namespace_filter = RepositorySearchFilter(
            search_term=term,
            search_strategy=strategy,
            case_sensitive=case_sensitive,
            search_fields=["name"]  # Namespace is part of repository name
        )
        return self
    
    def add_custom_filter(self, filter_instance: RepositorySearchFilter) -> "RepositorySearchBuilder":
        """Add custom search filter"""
        self._filters.append(filter_instance)
        return self
    
    def build(self) -> Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]]:
        """
        Build combined search function
        
        Returns:
            Function that applies all filters to repository list
        """
        all_filters = []
        
        if self._name_filter:
            all_filters.append(self._name_filter)
        if self._namespace_filter:
            all_filters.append(self._namespace_filter)
        all_filters.extend(self._filters)
        
        def combined_filter(repositories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            result = repositories
            for filter_instance in all_filters:
                result = filter_instance.filter_repositories(result)
            return result
        
        return combined_filter


def parse_repository_namespace(repository_name: str) -> Dict[str, str]:
    """
    Parse repository name into namespace and image components
    
    Args:
        repository_name: Full repository name (e.g., "library/nginx", "nginx")
        
    Returns:
        Dictionary with namespace and image keys
    """
    if '/' in repository_name:
        parts = repository_name.split('/', 1)
        return {
            "namespace": parts[0],
            "image": parts[1],
            "full_name": repository_name
        }
    else:
        return {
            "namespace": "",
            "image": repository_name,
            "full_name": repository_name
        }


@lru_cache(maxsize=1000)
def cached_namespace_parse(repository_name: str) -> tuple[str, str]:
    """
    Cached version of namespace parsing for performance
    
    Args:
        repository_name: Repository name to parse
        
    Returns:
        Tuple of (namespace, image_name)
    """
    parsed = parse_repository_namespace(repository_name)
    return parsed["namespace"], parsed["image"]


def create_repository_search_function(
    search_term: Optional[str],
    search_strategy: str = "contains",
    case_sensitive: bool = False
) -> Callable[[str], bool]:
    """
    Create optimized search function for repository names
    
    Args:
        search_term: Search term
        search_strategy: Search strategy
        case_sensitive: Case sensitivity
        
    Returns:
        Function that checks if repository name matches criteria
    """
    if not search_term:
        return lambda name: True
    
    # Get search function
    strategy_map = {
        "exact": SearchEngine.exact_match,
        "contains": SearchEngine.contains_match,
        "prefix": SearchEngine.prefix_match,
        "suffix": SearchEngine.suffix_match,
        "regex": SearchEngine.regex_match,
        "wildcard": SearchEngine.wildcard_match
    }
    
    search_func = strategy_map.get(search_strategy, SearchEngine.contains_match)
    
    def repository_matcher(repository_name: str) -> bool:
        # Search in full repository name
        if search_func(repository_name, search_term, case_sensitive):
            return True
        
        # Also search in namespace and image parts separately
        namespace, image = cached_namespace_parse(repository_name)
        
        # Search in namespace
        if namespace and search_func(namespace, search_term, case_sensitive):
            return True
        
        # Search in image name
        if search_func(image, search_term, case_sensitive):
            return True
        
        return False
    
    return repository_matcher


def create_multi_field_search(
    search_terms: Dict[str, str],
    default_strategy: str = "contains"
) -> Callable[[Dict[str, Any]], bool]:
    """
    Create search function for multiple fields with different terms
    
    Args:
        search_terms: Dictionary mapping field names to search terms
        default_strategy: Default search strategy to use
        
    Returns:
        Function that checks if item matches all search criteria
    """
    field_matchers = {}
    
    for field_name, term in search_terms.items():
        if term:
            strategy_map = {
                "exact": SearchEngine.exact_match,
                "contains": SearchEngine.contains_match,
                "prefix": SearchEngine.prefix_match,
                "suffix": SearchEngine.suffix_match,
                "regex": SearchEngine.regex_match,
                "wildcard": SearchEngine.wildcard_match
            }
            
            search_func = strategy_map.get(default_strategy, SearchEngine.contains_match)
            field_matchers[field_name] = lambda value, t=term: search_func(str(value), t, False)
    
    def multi_field_matcher(item: Dict[str, Any]) -> bool:
        # All specified fields must match (AND operation)
        for field_name, matcher in field_matchers.items():
            field_value = item.get(field_name)
            if field_value is None or not matcher(field_value):
                return False
        return True
    
    return multi_field_matcher


def create_search_suggestions(
    repositories: List[str],
    search_term: str,
    max_suggestions: int = 5
) -> List[str]:
    """
    Create search suggestions based on repository names
    
    Args:
        repositories: List of repository names
        search_term: Partial search term
        max_suggestions: Maximum number of suggestions to return
        
    Returns:
        List of suggested repository names
    """
    if not search_term:
        return []
    
    search_lower = search_term.lower()
    suggestions = []
    
    # Score repositories based on match quality
    scored_repos = []
    
    for repo in repositories:
        repo_lower = repo.lower()
        
        # Calculate match score
        score = 0
        
        # Exact match gets highest score
        if repo_lower == search_lower:
            score = 1000
        # Prefix match gets high score
        elif repo_lower.startswith(search_lower):
            score = 500 + (100 - len(repo))  # Shorter names score higher
        # Contains match gets medium score
        elif search_lower in repo_lower:
            # Earlier position gets higher score
            position = repo_lower.index(search_lower)
            score = 300 - position
        # Namespace or image name match
        else:
            namespace, image = cached_namespace_parse(repo)
            
            if namespace.lower().startswith(search_lower):
                score = 200
            elif image.lower().startswith(search_lower):
                score = 250
            elif search_lower in namespace.lower():
                score = 100
            elif search_lower in image.lower():
                score = 150
        
        if score > 0:
            scored_repos.append((repo, score))
    
    # Sort by score (descending) and take top suggestions
    scored_repos.sort(key=lambda x: x[1], reverse=True)
    suggestions = [repo for repo, _ in scored_repos[:max_suggestions]]
    
    return suggestions


def highlight_search_term(text: str, search_term: str, highlight_tag: str = "mark") -> str:
    """
    Highlight search term in text for UI display
    
    Args:
        text: Text to highlight in
        search_term: Term to highlight
        highlight_tag: HTML tag to use for highlighting
        
    Returns:
        Text with highlighted search terms
    """
    if not search_term:
        return text
    
    # Escape HTML characters in the original text
    import html
    escaped_text = html.escape(text)
    escaped_term = html.escape(search_term)
    
    # Case-insensitive replacement
    pattern = re.compile(re.escape(escaped_term), re.IGNORECASE)
    highlighted = pattern.sub(
        lambda m: f"<{highlight_tag}>{m.group()}</{highlight_tag}>",
        escaped_text
    )
    
    return highlighted


class SearchPerformanceTracker:
    """Track search performance metrics"""
    
    def __init__(self):
        self.search_stats = {
            "total_searches": 0,
            "cache_hits": 0,
            "average_response_time": 0.0,
            "popular_terms": {},
            "last_searches": []
        }
        self._max_recent_searches = 100
    
    def record_search(
        self,
        search_term: str,
        result_count: int,
        response_time: float,
        cache_hit: bool = False
    ):
        """
        Record search metrics
        
        Args:
            search_term: The search term used
            result_count: Number of results returned
            response_time: Time taken for search in seconds
            cache_hit: Whether result came from cache
        """
        self.search_stats["total_searches"] += 1
        
        if cache_hit:
            self.search_stats["cache_hits"] += 1
        
        # Update average response time
        current_avg = self.search_stats["average_response_time"]
        total_searches = self.search_stats["total_searches"]
        self.search_stats["average_response_time"] = (
            (current_avg * (total_searches - 1) + response_time) / total_searches
        )
        
        # Track popular search terms
        if search_term:
            term_lower = search_term.lower()
            self.search_stats["popular_terms"][term_lower] = (
                self.search_stats["popular_terms"].get(term_lower, 0) + 1
            )
        
        # Keep recent searches
        search_record = {
            "term": search_term,
            "result_count": result_count,
            "response_time": response_time,
            "cache_hit": cache_hit,
            "timestamp": datetime.now().isoformat()
        }
        
        self.search_stats["last_searches"].append(search_record)
        
        # Limit recent searches list size
        if len(self.search_stats["last_searches"]) > self._max_recent_searches:
            self.search_stats["last_searches"] = self.search_stats["last_searches"][-self._max_recent_searches:]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get search performance statistics"""
        total_searches = self.search_stats["total_searches"]
        cache_hit_rate = (
            (self.search_stats["cache_hits"] / total_searches * 100)
            if total_searches > 0 else 0
        )
        
        # Get top search terms
        top_terms = sorted(
            self.search_stats["popular_terms"].items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]
        
        return {
            "total_searches": total_searches,
            "cache_hit_rate": round(cache_hit_rate, 2),
            "average_response_time": round(self.search_stats["average_response_time"], 3),
            "top_search_terms": [{"term": term, "count": count} for term, count in top_terms],
            "recent_searches": self.search_stats["last_searches"][-10:]  # Last 10 searches
        }


# Global search performance tracker instance
search_tracker = SearchPerformanceTracker()