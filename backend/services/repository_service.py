"""
Repository service layer for business logic and data processing
"""

import time
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import logging

from .registry import RegistryClient, RegistryException
from ..models.schemas import (
    PaginationRequest, PaginationResponse,
    SortRequest, SearchRequest
)
from ..utils.search import (
    create_repository_search_function,
    search_tracker, create_search_suggestions
)
from ..utils.sorting import (
    RepositorySorter, repository_processor, sort_repositories_by_relevance,
    validate_sort_parameters
)
from ..utils.pagination import paginate_list

logger = logging.getLogger(__name__)


class RepositoryService:
    """Service layer for repository operations with search, sort, and caching"""
    
    def __init__(self, registry_client: RegistryClient):
        """
        Initialize repository service
        
        Args:
            registry_client: Configured registry client
        """
        self.registry_client = registry_client
        self.sorter = RepositorySorter()
        
        # Service-level cache for expensive operations
        self._repo_metadata_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 300  # 5 minutes
        self._cache_timestamps: Dict[str, float] = {}
        
        # Batch processing configuration
        self._batch_size = 10
        self._concurrent_limit = 5
        
        # Metadata collection statistics
        self._metadata_stats = {
            "cache_hits": 0,
            "cache_misses": 0,
            "batch_requests": 0,
            "failed_requests": 0,
            "avg_response_time": 0.0,
            "last_refresh": None
        }
    
    async def search_and_list_repositories(
        self,
        search_req: SearchRequest,
        sort_req: SortRequest,
        pagination_req: PaginationRequest,
        include_metadata: bool = False
    ) -> Tuple[List[Dict[str, Any]], PaginationResponse]:
        """
        Search, sort, and paginate repositories with optional metadata
        
        Args:
            search_req: Search parameters
            sort_req: Sort parameters
            pagination_req: Pagination parameters
            include_metadata: Whether to fetch repository metadata (tag count, last updated)
            
        Returns:
            Tuple of (repository_list, pagination_response)
        """
        start_time = time.time()
        
        try:
            # Validate sort parameters
            available_sort_fields = self.get_available_sort_fields(include_metadata)
            validate_sort_parameters(sort_req.sort_by, sort_req.sort_order, available_sort_fields)
            
            # Fetch all repositories from registry
            repositories, _ = await self.registry_client.list_repositories(fetch_all=True)
            
            # Convert to repository data objects
            repo_data = await self._convert_to_repository_data(repositories, include_metadata)
            
            # Apply search filter
            if search_req.search:
                search_func = create_repository_search_function(
                    search_term=search_req.search,
                    search_strategy="contains",
                    case_sensitive=False
                )
                repo_data = [repo for repo in repo_data if search_func(repo["name"])]
            
            # Apply sorting
            if search_req.search and sort_req.sort_by == "relevance":
                # Special relevance-based sorting
                repo_data = sort_repositories_by_relevance(repo_data, search_req.search)
            else:
                # Standard field-based sorting
                repo_data = self.sorter.sort_repositories(
                    repo_data, 
                    sort_req.sort_by, 
                    sort_req.is_descending
                )
            
            # Apply pagination
            paginated_result = paginate_list(repo_data, pagination_req.page, pagination_req.page_size)
            
            # Record search metrics
            response_time = time.time() - start_time
            search_tracker.record_search(
                search_term=search_req.search,
                result_count=len(repo_data),
                response_time=response_time,
                cache_hit=False  # TODO: Implement cache hit detection
            )
            
            return paginated_result.items, paginated_result.pagination
            
        except Exception as e:
            logger.error(f"Error in search_and_list_repositories: {e}", exc_info=True)
            raise
    
    async def _convert_to_repository_data(
        self,
        repository_names: List[str],
        include_metadata: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Convert repository names to data objects with optional metadata
        
        Args:
            repository_names: List of repository names
            include_metadata: Whether to fetch metadata
            
        Returns:
            List of repository data dictionaries
        """
        repo_data = []
        
        # Use batch metadata fetching for better performance when metadata is needed
        if include_metadata:
            # Batch fetch all metadata
            metadata_results = await self.batch_get_metadata(repository_names)
            
            for repo_name in repository_names:
                # Parse namespace components
                namespace, image = self._parse_repository_name(repo_name)
                
                # Get metadata from batch results
                metadata = metadata_results.get(repo_name, {})
                
                # Create repository data with metadata
                repo_dict = {
                    "name": repo_name,
                    "namespace": namespace,
                    "image": image,
                    "tag_count": metadata.get("tag_count", 0),
                    "last_updated": metadata.get("last_updated"),
                    "size_bytes": metadata.get("size_bytes"),
                    "status": metadata.get("status", "unknown")
                }
                
                repo_data.append(repo_dict)
        else:
            # No metadata needed, just create basic objects
            for repo_name in repository_names:
                # Parse namespace components
                namespace, image = self._parse_repository_name(repo_name)
                
                # Create basic repository data
                repo_dict = {
                    "name": repo_name,
                    "namespace": namespace,
                    "image": image,
                    "tag_count": 0,
                    "last_updated": None,
                    "size_bytes": None
                }
                
                repo_data.append(repo_dict)
        
        return repo_data
    
    async def _get_repository_metadata(self, repository_name: str) -> Dict[str, Any]:
        """
        Get repository metadata with enhanced caching and validation
        
        Args:
            repository_name: Repository name
            
        Returns:
            Dictionary with metadata
        """
        start_time = time.time()
        
        # Check cache first
        current_time = time.time()
        if repository_name in self._repo_metadata_cache:
            cache_time = self._cache_timestamps.get(repository_name, 0)
            if current_time - cache_time < self._cache_ttl:
                self._metadata_stats["cache_hits"] += 1
                return self._repo_metadata_cache[repository_name]
        
        self._metadata_stats["cache_misses"] += 1
        
        try:
            # Fetch repository info from registry
            repo_info = await self.registry_client.get_repository_info(repository_name)
            
            # Enhanced metadata collection
            metadata = {
                "tag_count": repo_info.tag_count,
                "last_updated": repo_info.last_updated,
                "size_bytes": repo_info.size_bytes,
                "cached_at": datetime.now(),
                "fetch_time": time.time() - start_time,
                "status": "success"
            }
            
            # Validate metadata
            validated_metadata = self._validate_metadata(metadata, repository_name)
            
            # Cache the result
            self._repo_metadata_cache[repository_name] = validated_metadata
            self._cache_timestamps[repository_name] = current_time
            
            # Update statistics
            self._update_metadata_stats(time.time() - start_time)
            
            # Clean up old cache entries
            self._cleanup_cache()
            
            return validated_metadata
            
        except RegistryException as e:
            self._metadata_stats["failed_requests"] += 1
            logger.warning(f"Registry error getting metadata for {repository_name}: {e}")
            
            # Return fallback metadata with error information
            fallback_metadata = {
                "tag_count": 0,
                "last_updated": None,
                "size_bytes": None,
                "cached_at": datetime.now(),
                "fetch_time": time.time() - start_time,
                "status": "error",
                "error": str(e)
            }
            
            # Cache failed result for short period to avoid repeated failures
            self._repo_metadata_cache[repository_name] = fallback_metadata
            self._cache_timestamps[repository_name] = current_time - (self._cache_ttl - 60)  # Cache for 1 minute
            
            return fallback_metadata
    
    def _cleanup_cache(self):
        """Remove expired cache entries with size limit management"""
        current_time = time.time()
        expired_keys = []
        
        # Remove expired entries
        for repo_name, cache_time in self._cache_timestamps.items():
            if current_time - cache_time > self._cache_ttl:
                expired_keys.append(repo_name)
        
        for key in expired_keys:
            self._repo_metadata_cache.pop(key, None)
            self._cache_timestamps.pop(key, None)
        
        # Enforce cache size limit (LRU eviction)
        max_cache_size = 1000
        if len(self._repo_metadata_cache) > max_cache_size:
            # Sort by timestamp and remove oldest entries
            sorted_entries = sorted(
                self._cache_timestamps.items(),
                key=lambda x: x[1]
            )
            
            entries_to_remove = len(self._repo_metadata_cache) - max_cache_size
            for repo_name, _ in sorted_entries[:entries_to_remove]:
                self._repo_metadata_cache.pop(repo_name, None)
                self._cache_timestamps.pop(repo_name, None)
    
    @staticmethod
    def _parse_repository_name(name: str) -> Tuple[str, str]:
        """Parse repository name into namespace and image"""
        if '/' in name:
            parts = name.split('/', 1)
            return parts[0], parts[1]
        return "", name
    
    def get_available_sort_fields(self, include_metadata: bool = False) -> List[str]:
        """
        Get list of available sort fields
        
        Args:
            include_metadata: Whether metadata fields are available
            
        Returns:
            List of available sort field names
        """
        basic_fields = ["name", "namespace"]
        
        if include_metadata:
            metadata_fields = ["tag_count", "last_updated", "size", "popularity"]
            return basic_fields + metadata_fields
        
        return basic_fields
    
    async def get_search_suggestions(
        self,
        partial_term: str,
        max_suggestions: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Get search suggestions based on partial term
        
        Args:
            partial_term: Partial search term
            max_suggestions: Maximum number of suggestions
            
        Returns:
            List of suggestion dictionaries
        """
        try:
            # Get all repositories for suggestions
            repositories, _ = await self.registry_client.list_repositories(fetch_all=True)
            
            # Generate suggestions
            suggestions = create_search_suggestions(repositories, partial_term, max_suggestions)
            
            # Convert to structured format
            suggestion_data = []
            for suggestion in suggestions:
                namespace, image = self._parse_repository_name(suggestion)
                suggestion_data.append({
                    "name": suggestion,
                    "namespace": namespace,
                    "image": image,
                    "match_type": self._determine_match_type(suggestion, partial_term)
                })
            
            return suggestion_data
            
        except Exception as e:
            logger.error(f"Error generating search suggestions: {e}")
            return []
    
    def _determine_match_type(self, repository_name: str, search_term: str) -> str:
        """Determine how the repository matches the search term"""
        repo_lower = repository_name.lower()
        term_lower = search_term.lower()
        
        if repo_lower == term_lower:
            return "exact"
        elif repo_lower.startswith(term_lower):
            return "prefix"
        elif term_lower in repo_lower:
            return "contains"
        else:
            namespace, image = self._parse_repository_name(repository_name)
            if namespace.lower().startswith(term_lower) or image.lower().startswith(term_lower):
                return "component_prefix"
            return "component_contains"
    
    async def get_repository_stats(self) -> Dict[str, Any]:
        """
        Get repository statistics for analytics
        
        Returns:
            Dictionary with repository statistics
        """
        try:
            repositories, _ = await self.registry_client.list_repositories(fetch_all=True)
            
            # Calculate statistics
            total_repos = len(repositories)
            namespaces = set()
            
            for repo in repositories:
                namespace, _ = self._parse_repository_name(repo)
                if namespace:
                    namespaces.add(namespace)
            
            return {
                "total_repositories": total_repos,
                "unique_namespaces": len(namespaces),
                "namespaces": sorted(list(namespaces)),
                "cache_stats": self.get_cache_stats(),
                "search_stats": search_tracker.get_stats(),
                "metadata_stats": self._metadata_stats
            }
            
        except Exception as e:
            logger.error(f"Error getting repository stats: {e}")
            return {
                "total_repositories": 0,
                "unique_namespaces": 0,
                "namespaces": [],
                "error": str(e)
            }
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get service cache statistics"""
        return {
            "metadata_cache_size": len(self._repo_metadata_cache),
            "cache_ttl": self._cache_ttl,
            "cached_repositories": list(self._repo_metadata_cache.keys())[-10:]  # Last 10 cached repos
        }
    
    async def batch_get_metadata(self, repository_names: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Batch fetch metadata for multiple repositories with concurrency control
        
        Args:
            repository_names: List of repository names to fetch metadata for
            
        Returns:
            Dictionary mapping repository names to their metadata
        """
        start_time = time.time()
        self._metadata_stats["batch_requests"] += 1
        
        # Filter out already cached repositories
        uncached_repos = []
        result = {}
        current_time = time.time()
        
        for repo_name in repository_names:
            if repo_name in self._repo_metadata_cache:
                cache_time = self._cache_timestamps.get(repo_name, 0)
                if current_time - cache_time < self._cache_ttl:
                    result[repo_name] = self._repo_metadata_cache[repo_name]
                    self._metadata_stats["cache_hits"] += 1
                else:
                    uncached_repos.append(repo_name)
            else:
                uncached_repos.append(repo_name)
        
        if not uncached_repos:
            return result
        
        # Process in batches with concurrency control
        semaphore = asyncio.Semaphore(self._concurrent_limit)
        
        async def fetch_single_metadata(repo_name: str) -> Tuple[str, Dict[str, Any]]:
            """Fetch metadata for a single repository with semaphore control"""
            async with semaphore:
                try:
                    metadata = await self._get_repository_metadata(repo_name)
                    return repo_name, metadata
                except Exception as e:
                    logger.error(f"Error fetching metadata for {repo_name}: {e}")
                    return repo_name, {
                        "tag_count": 0,
                        "last_updated": None,
                        "size_bytes": None,
                        "status": "error",
                        "error": str(e)
                    }
        
        # Execute batch requests with concurrency control
        tasks = [fetch_single_metadata(repo_name) for repo_name in uncached_repos]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for batch_result in batch_results:
            if isinstance(batch_result, Exception):
                logger.error(f"Batch metadata fetch error: {batch_result}")
                continue
                
            repo_name, metadata = batch_result
            result[repo_name] = metadata
        
        batch_time = time.time() - start_time
        logger.info(f"Batch metadata fetch completed: {len(uncached_repos)} repos in {batch_time:.2f}s")
        
        return result
    
    def _validate_metadata(self, metadata: Dict[str, Any], repository_name: str) -> Dict[str, Any]:
        """
        Validate and normalize metadata
        
        Args:
            metadata: Raw metadata dictionary
            repository_name: Repository name for context
            
        Returns:
            Validated and normalized metadata
        """
        validated = metadata.copy()
        
        # Validate tag count
        tag_count = validated.get("tag_count", 0)
        if not isinstance(tag_count, int) or tag_count < 0:
            validated["tag_count"] = 0
            logger.warning(f"Invalid tag_count for {repository_name}: {tag_count}")
        
        # Validate size
        size_bytes = validated.get("size_bytes")
        if size_bytes is not None:
            if not isinstance(size_bytes, (int, float)) or size_bytes < 0:
                validated["size_bytes"] = None
                logger.warning(f"Invalid size_bytes for {repository_name}: {size_bytes}")
        
        # Validate last_updated
        last_updated = validated.get("last_updated")
        if last_updated is not None:
            if isinstance(last_updated, str):
                try:
                    validated["last_updated"] = datetime.fromisoformat(last_updated.replace('Z', '+00:00'))
                except ValueError:
                    validated["last_updated"] = None
                    logger.warning(f"Invalid last_updated format for {repository_name}: {last_updated}")
            elif not isinstance(last_updated, datetime):
                validated["last_updated"] = None
                logger.warning(f"Invalid last_updated type for {repository_name}: {type(last_updated)}")
        
        return validated
    
    def _update_metadata_stats(self, response_time: float):
        """
        Update metadata collection statistics
        
        Args:
            response_time: Time taken for the request
        """
        # Update average response time
        total_requests = self._metadata_stats["cache_misses"] + self._metadata_stats["failed_requests"]
        if total_requests > 0:
            current_avg = self._metadata_stats["avg_response_time"]
            self._metadata_stats["avg_response_time"] = (
                (current_avg * (total_requests - 1) + response_time) / total_requests
            )
        
        self._metadata_stats["last_refresh"] = datetime.now().isoformat()
    
    async def warm_metadata_cache(self, repository_names: List[str]) -> Dict[str, bool]:
        """
        Pre-warm metadata cache for a list of repositories
        
        Args:
            repository_names: List of repository names to cache
            
        Returns:
            Dictionary indicating success/failure for each repository
        """
        logger.info(f"Warming metadata cache for {len(repository_names)} repositories")
        
        # Use batch fetching for cache warming
        metadata_results = await self.batch_get_metadata(repository_names)
        
        # Return success status for each repository
        cache_status = {}
        for repo_name in repository_names:
            metadata = metadata_results.get(repo_name, {})
            cache_status[repo_name] = metadata.get("status") == "success"
        
        return cache_status
    
    def is_metadata_cached(self, repository_name: str) -> bool:
        """
        Check if repository metadata is cached and not expired
        
        Args:
            repository_name: Repository name to check
            
        Returns:
            True if metadata is cached and valid
        """
        if repository_name not in self._repo_metadata_cache:
            return False
        
        cache_time = self._cache_timestamps.get(repository_name, 0)
        current_time = time.time()
        return (current_time - cache_time) < self._cache_ttl
    
    def get_cached_repositories(self) -> List[str]:
        """
        Get list of repositories with cached metadata
        
        Returns:
            List of repository names with valid cached metadata
        """
        cached_repos = []
        current_time = time.time()
        
        for repo_name, cache_time in self._cache_timestamps.items():
            if (current_time - cache_time) < self._cache_ttl:
                cached_repos.append(repo_name)
        
        return cached_repos
    
    async def refresh_stale_cache(self, max_age_minutes: int = 240) -> Dict[str, Any]:
        """
        Refresh cache entries older than specified age
        
        Args:
            max_age_minutes: Maximum age in minutes before refresh
            
        Returns:
            Statistics about the refresh operation
        """
        start_time = time.time()
        current_time = time.time()
        stale_threshold = max_age_minutes * 60
        
        # Find stale entries
        stale_repos = []
        for repo_name, cache_time in self._cache_timestamps.items():
            if (current_time - cache_time) > stale_threshold:
                stale_repos.append(repo_name)
        
        if not stale_repos:
            return {
                "refreshed_count": 0,
                "refresh_time": 0,
                "errors": []
            }
        
        logger.info(f"Refreshing {len(stale_repos)} stale cache entries")
        
        # Refresh stale entries using batch processing
        refresh_results = await self.batch_get_metadata(stale_repos)
        
        # Count successful refreshes
        successful_refreshes = sum(
            1 for metadata in refresh_results.values()
            if metadata.get("status") == "success"
        )
        
        refresh_time = time.time() - start_time
        
        return {
            "refreshed_count": successful_refreshes,
            "attempted_count": len(stale_repos),
            "refresh_time": refresh_time,
            "errors": [
                {"repo": repo, "error": metadata.get("error")}
                for repo, metadata in refresh_results.items()
                if metadata.get("status") == "error"
            ]
        }
    
    def clear_cache(self):
        """Clear all service caches and reset statistics"""
        """Clear all service caches"""
        self._repo_metadata_cache.clear()
        self._cache_timestamps.clear()
        repository_processor.clear_cache()


def create_repository_service(registry_client: RegistryClient) -> RepositoryService:
    """
    Factory function to create repository service
    
    Args:
        registry_client: Configured registry client
        
    Returns:
        RepositoryService instance
    """
    return RepositoryService(registry_client)