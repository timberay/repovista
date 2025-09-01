"""
Advanced sorting utilities for repository data
"""

from typing import List, Dict, Any, Callable, Optional, Union, TypeVar
from datetime import datetime
import re

T = TypeVar('T')


class SortStrategy:
    """Collection of sorting strategies for different data types"""
    
    @staticmethod
    def string_sort(value: Any, case_sensitive: bool = False) -> str:
        """
        Convert value to string for sorting
        
        Args:
            value: Value to convert
            case_sensitive: Whether sorting should be case sensitive
            
        Returns:
            String representation for sorting
        """
        if value is None:
            return ""
        
        str_value = str(value)
        return str_value if case_sensitive else str_value.lower()
    
    @staticmethod
    def numeric_sort(value: Any) -> Union[int, float]:
        """
        Convert value to number for sorting
        
        Args:
            value: Value to convert
            
        Returns:
            Numeric representation for sorting
        """
        if value is None:
            return 0
        
        if isinstance(value, (int, float)):
            return value
        
        try:
            # Try to convert string to number
            if isinstance(value, str):
                # Handle common size suffixes
                if value.lower().endswith(('k', 'kb')):
                    return float(value[:-1]) * 1024 if value[:-1] else 0
                elif value.lower().endswith(('m', 'mb')):
                    return float(value[:-1]) * 1024 * 1024 if value[:-1] else 0
                elif value.lower().endswith(('g', 'gb')):
                    return float(value[:-1]) * 1024 * 1024 * 1024 if value[:-1] else 0
                else:
                    return float(value)
            
            return float(value)
        except (ValueError, TypeError):
            return 0
    
    @staticmethod
    def datetime_sort(value: Any) -> datetime:
        """
        Convert value to datetime for sorting
        
        Args:
            value: Value to convert (datetime, string, or timestamp)
            
        Returns:
            Datetime object for sorting
        """
        if value is None:
            return datetime.min
        
        if isinstance(value, datetime):
            return value
        
        if isinstance(value, (int, float)):
            # Assume Unix timestamp
            try:
                return datetime.fromtimestamp(value)
            except (ValueError, OSError):
                return datetime.min
        
        if isinstance(value, str):
            # Try to parse datetime string
            try:
                # Common ISO formats
                for fmt in [
                    "%Y-%m-%dT%H:%M:%S.%fZ",
                    "%Y-%m-%dT%H:%M:%SZ",
                    "%Y-%m-%dT%H:%M:%S",
                    "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d"
                ]:
                    try:
                        return datetime.strptime(value, fmt)
                    except ValueError:
                        continue
                
                # Try fromisoformat as last resort
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                return datetime.min
        
        return datetime.min
    
    @staticmethod
    def version_sort(value: Any) -> tuple:
        """
        Sort version strings naturally (e.g., v1.2.10 > v1.2.2)
        
        Args:
            value: Version string or tag name
            
        Returns:
            Tuple for natural version sorting
        """
        if value is None:
            return (0,)
        
        version_str = str(value)
        
        # Extract version numbers using regex
        version_pattern = r'(\d+)'
        version_parts = re.findall(version_pattern, version_str)
        
        if not version_parts:
            # No version numbers found, sort alphabetically
            return (0, version_str.lower())
        
        # Convert to integers for proper numeric sorting
        try:
            numeric_parts = tuple(int(part) for part in version_parts)
            return numeric_parts
        except ValueError:
            return (0, version_str.lower())


class RepositorySorter:
    """Specialized sorter for repository data with multiple sort strategies"""
    
    def __init__(self):
        self.sort_strategies = {
            "name": self._sort_by_name,
            "tag_count": self._sort_by_tag_count,
            "last_updated": self._sort_by_last_updated,
            "size": self._sort_by_size,
            "namespace": self._sort_by_namespace,
            "popularity": self._sort_by_popularity
        }
    
    def _sort_by_name(self, repo: Dict[str, Any]) -> tuple:
        """Sort by repository name (namespace-aware)"""
        name = repo.get("name", "")
        namespace, image = self._parse_repo_name(name)
        
        # Sort by namespace first, then image name
        return (
            SortStrategy.string_sort(namespace),
            SortStrategy.string_sort(image)
        )
    
    def _sort_by_tag_count(self, repo: Dict[str, Any]) -> tuple:
        """Sort by tag count (numeric)"""
        tag_count = repo.get("tag_count", 0)
        return (SortStrategy.numeric_sort(tag_count), SortStrategy.string_sort(repo.get("name", "")))
    
    def _sort_by_last_updated(self, repo: Dict[str, Any]) -> tuple:
        """Sort by last updated time"""
        last_updated = repo.get("last_updated")
        return (SortStrategy.datetime_sort(last_updated), SortStrategy.string_sort(repo.get("name", "")))
    
    def _sort_by_size(self, repo: Dict[str, Any]) -> tuple:
        """Sort by repository size"""
        size = repo.get("size_bytes", 0)
        return (SortStrategy.numeric_sort(size), SortStrategy.string_sort(repo.get("name", "")))
    
    def _sort_by_namespace(self, repo: Dict[str, Any]) -> tuple:
        """Sort by namespace, then image name"""
        name = repo.get("name", "")
        namespace, image = self._parse_repo_name(name)
        return (
            SortStrategy.string_sort(namespace),
            SortStrategy.string_sort(image)
        )
    
    def _sort_by_popularity(self, repo: Dict[str, Any]) -> tuple:
        """Sort by estimated popularity (tag count + recency)"""
        tag_count = repo.get("tag_count", 0)
        last_updated = repo.get("last_updated")
        
        # Simple popularity score: tag_count + recency_factor
        recency_factor = 0
        if last_updated:
            try:
                days_since_update = (datetime.now() - SortStrategy.datetime_sort(last_updated)).days
                recency_factor = max(0, 365 - days_since_update) / 365 * 100  # Max 100 points for recency
            except:
                recency_factor = 0
        
        popularity_score = tag_count + recency_factor
        return (-popularity_score, SortStrategy.string_sort(repo.get("name", "")))  # Negative for descending
    
    @staticmethod
    def _parse_repo_name(name: str) -> tuple[str, str]:
        """Parse repository name into namespace and image"""
        if '/' in name:
            parts = name.split('/', 1)
            return parts[0], parts[1]
        return "", name
    
    def sort_repositories(
        self,
        repositories: List[Dict[str, Any]],
        sort_by: str,
        descending: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Sort repositories using specified strategy
        
        Args:
            repositories: List of repository data
            sort_by: Sort field name
            descending: Whether to sort in descending order
            
        Returns:
            Sorted list of repositories
        """
        if sort_by not in self.sort_strategies:
            # Fall back to string sorting by the field name
            sort_func = lambda repo: SortStrategy.string_sort(repo.get(sort_by, ""))
        else:
            sort_func = self.sort_strategies[sort_by]
        
        sorted_repos = sorted(repositories, key=sort_func, reverse=descending)
        return sorted_repos
    
    def get_available_sort_fields(self) -> List[str]:
        """Get list of available sort fields"""
        return list(self.sort_strategies.keys())


class MultiLevelSorter:
    """Support for multi-level sorting (primary, secondary, tertiary keys)"""
    
    def __init__(self):
        self.sorter = RepositorySorter()
    
    def sort_with_fallback(
        self,
        repositories: List[Dict[str, Any]],
        primary_sort: tuple[str, bool],
        secondary_sort: Optional[tuple[str, bool]] = None,
        tertiary_sort: Optional[tuple[str, bool]] = None
    ) -> List[Dict[str, Any]]:
        """
        Sort with multiple fallback criteria
        
        Args:
            repositories: List of repository data
            primary_sort: Tuple of (field_name, descending)
            secondary_sort: Optional secondary sort criteria
            tertiary_sort: Optional tertiary sort criteria
            
        Returns:
            Sorted list of repositories
        """
        def multi_key_func(repo: Dict[str, Any]) -> tuple:
            keys = []
            
            # Primary sort key
            primary_field, primary_desc = primary_sort
            primary_key = self._get_sort_key(repo, primary_field)
            if primary_desc:
                # For descending, negate numeric values or reverse strings
                primary_key = self._reverse_key(primary_key)
            keys.append(primary_key)
            
            # Secondary sort key
            if secondary_sort:
                secondary_field, secondary_desc = secondary_sort
                secondary_key = self._get_sort_key(repo, secondary_field)
                if secondary_desc:
                    secondary_key = self._reverse_key(secondary_key)
                keys.append(secondary_key)
            
            # Tertiary sort key
            if tertiary_sort:
                tertiary_field, tertiary_desc = tertiary_sort
                tertiary_key = self._get_sort_key(repo, tertiary_field)
                if tertiary_desc:
                    tertiary_key = self._reverse_key(tertiary_key)
                keys.append(tertiary_key)
            
            return tuple(keys)
        
        return sorted(repositories, key=multi_key_func)
    
    def _get_sort_key(self, repo: Dict[str, Any], field: str) -> Any:
        """Get sort key for a repository field"""
        value = repo.get(field)
        
        # Use appropriate conversion based on field type
        if field in ["tag_count", "size", "size_bytes"]:
            return SortStrategy.numeric_sort(value)
        elif field in ["last_updated", "created", "updated_at"]:
            return SortStrategy.datetime_sort(value)
        elif field in ["version", "tag"]:
            return SortStrategy.version_sort(value)
        else:
            return SortStrategy.string_sort(value)
    
    def _reverse_key(self, key: Any) -> Any:
        """Reverse sort key for descending order"""
        if isinstance(key, (int, float)):
            return -key
        elif isinstance(key, str):
            # For strings, we'll use a wrapper that reverses comparison
            return ReverseString(key)
        elif isinstance(key, datetime):
            # For datetime, use timestamp and negate
            return -key.timestamp()
        elif isinstance(key, tuple):
            # For tuples, reverse each element
            return tuple(self._reverse_key(item) for item in key)
        else:
            return key


class ReverseString:
    """Wrapper for strings to enable reverse sorting"""
    
    def __init__(self, value: str):
        self.value = value
    
    def __lt__(self, other):
        if isinstance(other, ReverseString):
            return self.value > other.value
        return self.value > str(other)
    
    def __eq__(self, other):
        if isinstance(other, ReverseString):
            return self.value == other.value
        return self.value == str(other)
    
    def __str__(self):
        return self.value


def create_repository_sorter(
    sort_field: str,
    descending: bool = False,
    secondary_sort: Optional[str] = None
) -> Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]]:
    """
    Create a repository sorting function
    
    Args:
        sort_field: Primary field to sort by
        descending: Whether to sort in descending order
        secondary_sort: Optional secondary sort field (always ascending)
        
    Returns:
        Function that sorts repository list
    """
    sorter = RepositorySorter()
    
    if secondary_sort:
        multi_sorter = MultiLevelSorter()
        
        def sort_func(repositories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            return multi_sorter.sort_with_fallback(
                repositories,
                primary_sort=(sort_field, descending),
                secondary_sort=(secondary_sort, False)  # Secondary always ascending
            )
        
        return sort_func
    else:
        def sort_func(repositories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            return sorter.sort_repositories(repositories, sort_field, descending)
        
        return sort_func


def get_sort_field_info() -> Dict[str, Dict[str, Any]]:
    """
    Get information about available sort fields
    
    Returns:
        Dictionary with sort field metadata
    """
    return {
        "name": {
            "type": "string",
            "description": "Repository name (namespace-aware)",
            "example": "library/nginx",
            "default_order": "asc"
        },
        "tag_count": {
            "type": "numeric",
            "description": "Number of tags in repository",
            "example": 15,
            "default_order": "desc"
        },
        "last_updated": {
            "type": "datetime",
            "description": "Last update timestamp",
            "example": "2023-12-01T10:30:00Z",
            "default_order": "desc"
        },
        "size": {
            "type": "numeric",
            "description": "Repository total size in bytes",
            "example": 1048576,
            "default_order": "desc"
        },
        "namespace": {
            "type": "string",
            "description": "Repository namespace",
            "example": "library",
            "default_order": "asc"
        },
        "popularity": {
            "type": "computed",
            "description": "Computed popularity score (tag count + recency)",
            "example": 150.5,
            "default_order": "desc"
        }
    }


def validate_sort_parameters(
    sort_by: str,
    sort_order: str,
    available_fields: Optional[List[str]] = None
) -> None:
    """
    Validate sort parameters
    
    Args:
        sort_by: Field to sort by
        sort_order: Sort order (asc/desc)
        available_fields: List of available sort fields
        
    Raises:
        ValueError: If parameters are invalid
    """
    # Validate sort order
    if sort_order not in ["asc", "desc"]:
        raise ValueError("Sort order must be 'asc' or 'desc'")
    
    # Validate sort field
    if available_fields and sort_by not in available_fields:
        raise ValueError(f"Invalid sort field '{sort_by}'. Available fields: {', '.join(available_fields)}")


class RepositorySearchAndSort:
    """Combined search and sort functionality for repositories"""
    
    def __init__(self):
        self.sorter = RepositorySorter()
        self._cache: Dict[str, Any] = {}
        self._cache_size_limit = 100
    
    def process_repositories(
        self,
        repositories: List[str],
        search_term: Optional[str] = None,
        search_strategy: str = "contains",
        sort_by: str = "name",
        sort_order: str = "asc",
        enable_cache: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Process repository list with search and sort
        
        Args:
            repositories: List of repository names
            search_term: Optional search term
            search_strategy: Search strategy to use
            sort_by: Field to sort by
            sort_order: Sort order
            enable_cache: Whether to use caching
            
        Returns:
            Processed and sorted list of repository data
        """
        # Create cache key
        cache_key = f"{len(repositories)}:{search_term}:{search_strategy}:{sort_by}:{sort_order}"
        
        if enable_cache and cache_key in self._cache:
            return self._cache[cache_key]
        
        # Convert repository names to data objects
        repo_data = []
        for repo_name in repositories:
            namespace, image = self._parse_repository_name(repo_name)
            
            repo_dict = {
                "name": repo_name,
                "namespace": namespace,
                "image": image,
                "tag_count": 0,  # Will be populated by metadata collection
                "last_updated": None,
                "size_bytes": None
            }
            repo_data.append(repo_dict)
        
        # Apply search filter
        if search_term:
            from .search import create_repository_search_function
            search_func = create_repository_search_function(
                search_term=search_term,
                search_strategy=search_strategy,
                case_sensitive=False
            )
            repo_data = [repo for repo in repo_data if search_func(repo["name"])]
        
        # Apply sorting
        descending = (sort_order == "desc")
        sorted_repos = self.sorter.sort_repositories(repo_data, sort_by, descending)
        
        # Cache result if enabled
        if enable_cache:
            # Limit cache size
            if len(self._cache) >= self._cache_size_limit:
                # Remove oldest cache entries
                old_keys = list(self._cache.keys())[:10]
                for old_key in old_keys:
                    del self._cache[old_key]
            
            self._cache[cache_key] = sorted_repos
        
        return sorted_repos
    
    @staticmethod
    def _parse_repository_name(name: str) -> tuple[str, str]:
        """Parse repository name into namespace and image"""
        if '/' in name:
            parts = name.split('/', 1)
            return parts[0], parts[1]
        return "", name
    
    def clear_cache(self):
        """Clear sorting cache"""
        self._cache.clear()
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            "cache_size": len(self._cache),
            "cache_limit": self._cache_size_limit,
            "cache_keys": list(self._cache.keys())[-5:]  # Last 5 cache keys
        }


def sort_repositories_by_relevance(
    repositories: List[Dict[str, Any]],
    search_term: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Sort repositories by search relevance score
    
    Args:
        repositories: List of repository data
        search_term: Search term used for relevance scoring
        
    Returns:
        Repositories sorted by relevance
    """
    if not search_term:
        # No search term, sort by name
        return sorted(repositories, key=lambda x: x.get("name", "").lower())
    
    def calculate_relevance_score(repo: Dict[str, Any]) -> float:
        """Calculate relevance score for a repository"""
        name = repo.get("name", "")
        score = 0.0
        search_lower = search_term.lower()
        name_lower = name.lower()
        
        # Exact match gets highest score
        if name_lower == search_lower:
            score += 1000
        
        # Prefix match gets high score
        elif name_lower.startswith(search_lower):
            score += 500
        
        # Contains match gets medium score
        elif search_lower in name_lower:
            # Earlier position gets higher score
            position = name_lower.index(search_lower)
            score += 300 - position
        
        # Check namespace and image separately
        namespace, image = RepositorySearchAndSort._parse_repository_name(name)
        
        if namespace.lower() == search_lower:
            score += 400
        elif image.lower() == search_lower:
            score += 450
        elif namespace.lower().startswith(search_lower):
            score += 200
        elif image.lower().startswith(search_lower):
            score += 250
        
        # Boost score based on popularity indicators
        tag_count = repo.get("tag_count", 0)
        if tag_count > 0:
            score += min(tag_count * 2, 100)  # Max 100 points for tag count
        
        return score
    
    # Sort by relevance score (descending)
    return sorted(repositories, key=calculate_relevance_score, reverse=True)


# Global repository search and sort instance
repository_processor = RepositorySearchAndSort()