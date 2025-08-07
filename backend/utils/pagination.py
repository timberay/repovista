"""
Pagination utility functions for API responses
"""

from typing import List, TypeVar, Generic, Callable, Any, Optional
from fastapi import Query
from pydantic import BaseModel

from ..models.schemas import PaginationRequest, PaginationResponse, SortRequest, SearchRequest

T = TypeVar('T')


class PaginatedResult(BaseModel, Generic[T]):
    """Generic paginated result container"""
    items: List[T]
    pagination: PaginationResponse
    
    class Config:
        arbitrary_types_allowed = True


def paginate_list(
    items: List[T],
    page: int,
    page_size: int
) -> PaginatedResult[T]:
    """
    Paginate a list of items
    
    Args:
        items: List of items to paginate
        page: Current page number (1-based)
        page_size: Number of items per page
        
    Returns:
        PaginatedResult with items and pagination info
    """
    total_count = len(items)
    
    # Calculate pagination boundaries
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    
    # Get page items
    page_items = items[start_index:end_index]
    
    # Create pagination info
    pagination = PaginationResponse.create(page, page_size, total_count)
    
    return PaginatedResult(items=page_items, pagination=pagination)


def sort_items(
    items: List[T],
    sort_key: Callable[[T], Any],
    descending: bool = False
) -> List[T]:
    """
    Sort a list of items using a key function
    
    Args:
        items: List of items to sort
        sort_key: Function to extract sort key from each item
        descending: Whether to sort in descending order
        
    Returns:
        Sorted list of items
    """
    return sorted(items, key=sort_key, reverse=descending)


def filter_items(
    items: List[T],
    filter_func: Callable[[T], bool]
) -> List[T]:
    """
    Filter a list of items using a filter function
    
    Args:
        items: List of items to filter
        filter_func: Function that returns True for items to keep
        
    Returns:
        Filtered list of items
    """
    return [item for item in items if filter_func(item)]


def create_search_filter(search_term: Optional[str], search_fields: List[Callable[[T], str]]) -> Callable[[T], bool]:
    """
    Create a search filter function for multiple fields
    
    Args:
        search_term: Search term (case-insensitive)
        search_fields: List of functions to extract searchable text from items
        
    Returns:
        Filter function that returns True if search term is found in any field
    """
    if not search_term:
        return lambda item: True
    
    search_lower = search_term.lower()
    
    def search_filter(item: T) -> bool:
        for field_func in search_fields:
            try:
                field_value = field_func(item)
                if field_value and search_lower in field_value.lower():
                    return True
            except (AttributeError, TypeError):
                # Skip fields that can't be converted to string
                continue
        return False
    
    return search_filter


def create_sort_key(sort_field: str, item_type: type) -> Callable[[Any], Any]:
    """
    Create a sort key function for a given field name
    
    Args:
        sort_field: Name of the field to sort by
        item_type: Type of items being sorted (for validation)
        
    Returns:
        Sort key function
        
    Raises:
        ValueError: If sort_field is not valid for the item type
    """
    def sort_key_func(item: Any) -> Any:
        try:
            value = getattr(item, sort_field)
            # Handle None values by putting them at the end
            return (value is None, value)
        except AttributeError:
            raise ValueError(f"Invalid sort field '{sort_field}' for {item_type.__name__}")
    
    return sort_key_func


class PaginationHelper:
    """Helper class for common pagination operations"""
    
    @staticmethod
    def parse_query_params(
        search: Optional[str] = Query(None, description="Search term to filter repository names"),
        sort_by: Optional[str] = Query("name", description="Field to sort by"),
        sort_order: Optional[str] = Query("asc", description="Sort order (asc, desc)"),
        page: int = Query(1, ge=1, description="Page number (1-based)"),
        page_size: int = Query(20, ge=1, le=100, description="Number of items per page")
    ) -> tuple[PaginationRequest, SortRequest, SearchRequest]:
        """
        Parse common query parameters for pagination, sorting, and searching
        
        Args:
            search: Search term
            sort_by: Sort field
            sort_order: Sort order
            page: Page number
            page_size: Page size
            
        Returns:
            Tuple of (PaginationRequest, SortRequest, SearchRequest)
        """
        pagination = PaginationRequest(page=page, page_size=page_size)
        sort_req = SortRequest(sort_by=sort_by, sort_order=sort_order)
        search_req = SearchRequest(search=search)
        
        return pagination, sort_req, search_req
    
    @staticmethod
    def process_repository_list(
        repositories: List[str],
        pagination: PaginationRequest,
        sort_req: SortRequest,
        search_req: SearchRequest
    ) -> tuple[List[str], PaginationResponse]:
        """
        Process repository list with search, sort, and pagination
        
        Args:
            repositories: List of repository names
            pagination: Pagination parameters
            sort_req: Sort parameters
            search_req: Search parameters
            
        Returns:
            Tuple of (paginated_repositories, pagination_response)
        """
        # Validate sort parameters
        valid_sort_fields = ["name"]  # For basic string sorting
        sort_req.validate_sort_field(valid_sort_fields)
        sort_req.validate_sort_order()
        
        # Filter by search term
        if search_req.search:
            filtered_repos = [repo for repo in repositories if search_req.matches(repo)]
        else:
            filtered_repos = repositories
        
        # Sort repositories
        if sort_req.sort_by == "name":
            filtered_repos.sort(reverse=sort_req.is_descending)
        
        # Apply pagination
        result = paginate_list(filtered_repos, pagination.page, pagination.page_size)
        
        return result.items, result.pagination


def validate_pagination_params(page: int, page_size: int) -> None:
    """
    Validate pagination parameters
    
    Args:
        page: Page number
        page_size: Page size
        
    Raises:
        ValueError: If parameters are invalid
    """
    if page < 1:
        raise ValueError("Page number must be at least 1")
    
    if page_size < 1:
        raise ValueError("Page size must be at least 1")
    
    if page_size > 100:
        raise ValueError("Page size cannot exceed 100")


def create_pagination_links(
    base_url: str,
    pagination: PaginationResponse,
    query_params: Optional[dict] = None
) -> dict[str, Optional[str]]:
    """
    Create pagination links for API responses
    
    Args:
        base_url: Base URL for the API endpoint
        pagination: Pagination information
        query_params: Additional query parameters to include
        
    Returns:
        Dictionary with next/prev/first/last page URLs
    """
    if query_params is None:
        query_params = {}
    
    def build_url(page_num: Optional[int]) -> Optional[str]:
        if page_num is None:
            return None
        
        params = query_params.copy()
        params['page'] = page_num
        params['page_size'] = pagination.page_size
        
        query_string = '&'.join([f"{k}={v}" for k, v in params.items() if v is not None])
        return f"{base_url}?{query_string}" if query_string else base_url
    
    return {
        "first": build_url(1) if pagination.total_pages > 0 else None,
        "prev": build_url(pagination.prev_page),
        "next": build_url(pagination.next_page),
        "last": build_url(pagination.total_pages) if pagination.total_pages > 0 else None
    }