"""
Tag listing API endpoints for Docker Registry
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from typing import Optional
from datetime import datetime, timezone

from ..models.schemas import (
    ImageInfo,
    TagResponse, 
    TagListResponse,
    PaginationRequest,
    PaginationResponse,
    SortRequest,
    SearchRequest,
    RegistryErrorResponse
)
from ..services.registry import (
    RegistryClient,
    RegistryNotFoundError,
    RegistryAuthError,
    RegistryPermissionError,
    RegistryConnectionError,
    RegistryTimeoutError,
    RegistryRateLimitError,
    RegistryServerError
)
from ..utils.repository import (
    normalize_repository_name,
    RepositoryNameValidator
)
from ..config import settings

router = APIRouter(
    prefix="/api/repositories",
    tags=["tags"],
    responses={
        401: {"model": RegistryErrorResponse, "description": "Unauthorized"},
        404: {"model": RegistryErrorResponse, "description": "Repository not found"},
        500: {"model": RegistryErrorResponse, "description": "Internal server error"}
    }
)


async def get_registry_client() -> RegistryClient:
    """
    Dependency to get Docker Registry client instance with mock support
    
    Returns:
        RegistryClient: Configured registry client (or mock in development mode)
    """
    from ..services.mock_registry import MockRegistryClient
    import logging
    
    logger = logging.getLogger(__name__)
    
    # Use mock data if configured
    if settings.use_mock_data:
        logger.info("Using mock registry data (USE_MOCK_DATA=true)")
        return MockRegistryClient()
    
    # Try to connect to real registry
    username = settings.registry_username if settings.registry_username else None
    password = settings.registry_password if settings.registry_password else None
    
    client = RegistryClient(
        registry_url=settings.registry_url,
        username=username,
        password=password,
        verify_ssl=True
    )
    
    # Check if registry is available
    try:
        if await client.ping():
            return client
    except Exception as e:
        logger.warning(f"Registry at {settings.registry_url} is not available: {e}")
        
        # Fallback to mock data for development
        if "localhost" in settings.registry_url or "127.0.0.1" in settings.registry_url:
            logger.info("Falling back to mock registry data for development")
            await client.close()
            return MockRegistryClient()
        
        # For production registries, raise the error
        raise
    
    return client


def format_file_size(size_bytes: int) -> str:
    """
    Format file size in bytes to human-readable format
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        Human-readable size string (e.g., "1.2 MB", "512 KB")
    """
    if size_bytes == 0:
        return "0 B"
    
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(size_bytes)
    unit_index = 0
    
    while size >= 1024.0 and unit_index < len(units) - 1:
        size /= 1024.0
        unit_index += 1
    
    # Format with appropriate decimal places
    if size >= 100:
        return f"{size:.0f} {units[unit_index]}"
    elif size >= 10:
        return f"{size:.1f} {units[unit_index]}"
    else:
        return f"{size:.2f} {units[unit_index]}"


def format_relative_time(dt: Optional[datetime]) -> Optional[str]:
    """
    Format datetime to relative time string
    
    Args:
        dt: Datetime to format
        
    Returns:
        Relative time string (e.g., "2 days ago", "3 hours ago") or None
    """
    if dt is None:
        return None
    
    now = datetime.now(timezone.utc)
    
    # Ensure dt is timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    diff = now - dt
    seconds = diff.total_seconds()
    
    if seconds < 60:
        return "just now"
    elif seconds < 3600:  # Less than 1 hour
        minutes = int(seconds // 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    elif seconds < 86400:  # Less than 1 day
        hours = int(seconds // 3600)
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif seconds < 2592000:  # Less than 30 days
        days = int(seconds // 86400)
        return f"{days} day{'s' if days != 1 else ''} ago"
    elif seconds < 31536000:  # Less than 1 year
        months = int(seconds // 2592000)
        return f"{months} month{'s' if months != 1 else ''} ago"
    else:
        years = int(seconds // 31536000)
        return f"{years} year{'s' if years != 1 else ''} ago"


def convert_image_info_to_tag_response(image_info: ImageInfo) -> TagResponse:
    """
    Convert ImageInfo object to TagResponse with enhanced formatting
    
    Args:
        image_info: ImageInfo object from registry service
        
    Returns:
        TagResponse with formatted size and creation date
    """
    return TagResponse(
        repository=image_info.repository,
        tag=image_info.tag,
        digest=image_info.digest,
        size_bytes=image_info.size,
        size_formatted=format_file_size(image_info.size),
        created=image_info.created,
        created_formatted=format_relative_time(image_info.created),
        architecture=image_info.architecture,
        os=image_info.os,
        pull_command=image_info.pull_command
    )


@router.get("/{repository_name:path}/tags", response_model=TagListResponse)
async def get_repository_tags(
    repository_name: str = Path(..., description="Repository name (e.g., 'library/nginx' or 'myapp')"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
    sort_by: str = Query("tag", description="Sort field (tag, created, size)"),
    sort_order: str = Query("asc", description="Sort order (asc or desc)"),
    search: Optional[str] = Query(None, description="Search term to filter tags"),
    registry: RegistryClient = Depends(get_registry_client)
) -> TagListResponse:
    """
    Get a list of tags for a specific repository with pagination and sorting.
    
    This endpoint retrieves all available tags for the specified Docker repository
    from the configured Docker Registry. The results can be paginated, sorted,
    and filtered based on the provided parameters.
    
    Args:
        repository_name: Name of the repository (e.g., 'library/nginx' or 'myapp')
        page: Page number for pagination (1-based)
        page_size: Number of tags to return per page
        sort_by: Field to sort by (tag, created, size)
        sort_order: Sort order (asc or desc)
        search: Optional search term to filter tags
        registry: Docker Registry client (injected)
    
    Returns:
        TagListResponse: Paginated list of tags with metadata
        
    Raises:
        HTTPException: 404 if repository not found, 401 if unauthorized, 500 for server errors
    """
    try:
        # Normalize and validate repository name
        normalized_repo_name = normalize_repository_name(repository_name)
        
        # Validate repository name format
        validation = RepositoryNameValidator.validate_repository_components(normalized_repo_name)
        if not validation["valid"]:
            error_detail = f"Invalid repository name: {'; '.join(validation['issues'])}"
            if validation["suggestions"]:
                error_detail += f". Suggestions: {'; '.join(validation['suggestions'])}"
            raise HTTPException(status_code=400, detail=error_detail)
        
        # Create request models for validation
        pagination = PaginationRequest(page=page, page_size=page_size)
        sort = SortRequest(sort_by=sort_by, sort_order=sort_order)
        search_request = SearchRequest(search=search)
        
        # Validate sort field
        valid_sort_fields = ["tag", "created", "size"]
        sort.validate_sort_field(valid_sort_fields)
        sort.validate_sort_order()
        
        # Get tags from registry with detailed metadata
        all_tags = await registry.get_repository_tags(
            repository_name=normalized_repo_name,
            with_metadata=True  # Get full metadata including creation date
        )
        
        # Filter tags based on search term
        if search_request.search:
            all_tags = [tag for tag in all_tags if search_request.matches(tag.tag)]
        
        # Sort tags based on requested field
        if sort.sort_by == "tag":
            all_tags.sort(key=lambda x: x.tag, reverse=sort.is_descending)
        elif sort.sort_by == "created":
            # Sort by creation date (handle None values)
            all_tags.sort(
                key=lambda x: x.created if x.created else datetime.min,
                reverse=sort.is_descending
            )
        elif sort.sort_by == "size":
            all_tags.sort(key=lambda x: x.size, reverse=sort.is_descending)
        
        # Calculate pagination
        total_count = len(all_tags)
        start_idx = pagination.offset
        end_idx = start_idx + pagination.limit
        paginated_tags = all_tags[start_idx:end_idx]
        
        # Convert ImageInfo objects to TagResponse objects with enhanced formatting
        formatted_tags = [
            convert_image_info_to_tag_response(tag) 
            for tag in paginated_tags
        ]
        
        # Create pagination response
        pagination_info = PaginationResponse.create(
            page=pagination.page,
            page_size=pagination.page_size,
            total_count=total_count
        )
        
        # Create and return response
        return TagListResponse(
            tags=formatted_tags,
            page=pagination_info.page,
            page_size=pagination_info.page_size,
            total_count=pagination_info.total_count,
            total_pages=pagination_info.total_pages,
            has_next=pagination_info.has_next,
            has_prev=pagination_info.has_prev,
            next_page=pagination_info.next_page,
            prev_page=pagination_info.prev_page
        )
        
    except RegistryNotFoundError as e:
        # Repository not found - provide helpful error message
        raise HTTPException(
            status_code=404, 
            detail=f"Repository '{repository_name}' not found in registry. Please verify the repository name is correct."
        )
    except RegistryAuthError as e:
        raise HTTPException(
            status_code=401, 
            detail=f"Authentication failed: {str(e)}"
        )
    except RegistryPermissionError as e:
        raise HTTPException(
            status_code=403, 
            detail=f"Access denied to repository '{repository_name}': {str(e)}"
        )
    except RegistryConnectionError as e:
        raise HTTPException(
            status_code=503, 
            detail=f"Unable to connect to registry. Please try again later. Details: {str(e)}"
        )
    except RegistryTimeoutError as e:
        raise HTTPException(
            status_code=504, 
            detail=f"Request timeout while retrieving tags for repository '{repository_name}'. The registry may be slow or overloaded. Please try again later."
        )
    except RegistryRateLimitError as e:
        raise HTTPException(
            status_code=429, 
            detail="Rate limit exceeded. Please wait before making additional requests."
        )
    except RegistryServerError as e:
        raise HTTPException(
            status_code=502, 
            detail=f"Registry server error: {str(e)}"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log the error (logging will be implemented later)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve tags for repository '{repository_name}': {str(e)}"
        )


@router.get("/{repository_name:path}/tags/{tag_name}", response_model=TagResponse)
async def get_tag_details(
    repository_name: str = Path(..., description="Repository name"),
    tag_name: str = Path(..., description="Tag name"),
    registry: RegistryClient = Depends(get_registry_client)
) -> TagResponse:
    """
    Get detailed information about a specific tag.
    
    This endpoint retrieves detailed information about a specific tag
    within a repository, including digest, size, creation date, and
    architecture information.
    
    Args:
        repository_name: Name of the repository
        tag_name: Name of the tag
        registry: Docker Registry client (injected)
    
    Returns:
        ImageInfo: Detailed tag information
        
    Raises:
        HTTPException: 404 if tag not found, 401 if unauthorized
    """
    try:
        # Normalize and validate repository name
        normalized_repo_name = normalize_repository_name(repository_name)
        
        # Validate repository name format
        validation = RepositoryNameValidator.validate_repository_components(normalized_repo_name)
        if not validation["valid"]:
            error_detail = f"Invalid repository name: {'; '.join(validation['issues'])}"
            if validation["suggestions"]:
                error_detail += f". Suggestions: {'; '.join(validation['suggestions'])}"
            raise HTTPException(status_code=400, detail=error_detail)
        
        # Get detailed image information from registry
        image_info = await registry.get_detailed_image_info(normalized_repo_name, tag_name)
        
        # Update pull command with registry URL
        image_info.pull_command = registry.create_pull_command(normalized_repo_name, tag_name)
        
        # Convert to TagResponse with enhanced formatting
        return convert_image_info_to_tag_response(image_info)
        
    except RegistryNotFoundError as e:
        # Could be repository or tag not found - provide helpful error message
        raise HTTPException(
            status_code=404, 
            detail=f"Tag '{tag_name}' not found in repository '{repository_name}'. Please verify both the repository and tag names are correct."
        )
    except RegistryAuthError as e:
        raise HTTPException(
            status_code=401, 
            detail=f"Authentication failed: {str(e)}"
        )
    except RegistryPermissionError as e:
        raise HTTPException(
            status_code=403, 
            detail=f"Access denied to repository '{repository_name}': {str(e)}"
        )
    except RegistryConnectionError as e:
        raise HTTPException(
            status_code=503, 
            detail=f"Unable to connect to registry. Please try again later. Details: {str(e)}"
        )
    except RegistryTimeoutError as e:
        raise HTTPException(
            status_code=504, 
            detail=f"Request timeout while retrieving tag '{tag_name}' in repository '{repository_name}'. The registry may be slow or overloaded. Please try again later."
        )
    except RegistryRateLimitError as e:
        raise HTTPException(
            status_code=429, 
            detail="Rate limit exceeded. Please wait before making additional requests."
        )
    except RegistryServerError as e:
        raise HTTPException(
            status_code=502, 
            detail=f"Registry server error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get details for tag '{tag_name}' in repository '{repository_name}': {str(e)}"
        )