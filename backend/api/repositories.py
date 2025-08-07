"""
Repository listing API endpoints
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import logging

from ..services.registry import RegistryClient, RegistryException
from ..services.repository_service import RepositoryService, create_repository_service
from ..models.schemas import (
    RepositoryInfo, PaginationInfo, PaginationRequest, 
    PaginationResponse, SortRequest, SearchRequest
)
from ..utils.pagination import PaginationHelper, validate_pagination_params
from ..utils.search import search_tracker
from ..utils.sorting import get_sort_field_info
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repositories", tags=["repositories"])


class RepositoryResponse(BaseModel):
    """Response model for repository listing"""
    name: str = Field(..., description="Repository name", example="nginx")
    tag_count: int = Field(..., description="Number of tags in repository", example=15)
    last_updated: Optional[datetime] = Field(None, description="Last update timestamp", example="2023-12-01T12:00:00Z")
    size_bytes: Optional[int] = Field(None, description="Total repository size in bytes", example=142857600)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
        schema_extra = {
            "example": {
                "name": "nginx",
                "tag_count": 15,
                "last_updated": "2023-12-01T12:00:00Z",
                "size_bytes": 142857600
            }
        }


class RepositoryListResponse(BaseModel):
    """Response model for paginated repository list"""
    repositories: List[RepositoryResponse] = Field(..., description="List of repositories")
    pagination: PaginationResponse = Field(..., description="Pagination information")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
        schema_extra = {
            "example": {
                "repositories": [
                    {
                        "name": "nginx",
                        "tag_count": 15,
                        "last_updated": "2023-12-01T12:00:00Z",
                        "size_bytes": 142857600
                    },
                    {
                        "name": "ubuntu",
                        "tag_count": 8,
                        "last_updated": "2023-11-28T10:30:00Z",
                        "size_bytes": 72351744
                    }
                ],
                "pagination": {
                    "page": 1,
                    "page_size": 20,
                    "total_pages": 1,
                    "total_items": 2,
                    "has_next": False,
                    "has_previous": False,
                    "next_url": None,
                    "previous_url": None
                }
            }
        }


class ErrorResponse(BaseModel):
    """Error response model"""
    error: str = Field(..., description="Error type", example="RegistryAuthError")
    message: str = Field(..., description="Human-readable error message", example="Authentication required")
    status_code: int = Field(..., description="HTTP status code", example=401)
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    
    class Config:
        schema_extra = {
            "example": {
                "error": "RegistryAuthError",
                "message": "Authentication required",
                "status_code": 401,
                "details": {}
            }
        }


async def get_registry_client() -> RegistryClient:
    """
    Dependency injection for registry client
    
    Returns:
        Configured RegistryClient instance
    """
    client = RegistryClient(
        registry_url=settings.registry_url,
        username=settings.registry_username,
        password=settings.registry_password,
        timeout=30.0,
        max_retries=3
    )
    return client


async def get_repository_service(
    registry_client: RegistryClient = Depends(get_registry_client)
) -> RepositoryService:
    """
    Dependency injection for repository service
    
    Args:
        registry_client: Registry client (injected)
        
    Returns:
        Configured RepositoryService instance
    """
    return create_repository_service(registry_client)


@router.get(
    "/",
    response_model=RepositoryListResponse,
    responses={
        200: {"description": "Successful response", "model": RepositoryListResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        401: {"description": "Authentication required", "model": ErrorResponse},
        403: {"description": "Permission denied", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
        503: {"description": "Registry unavailable", "model": ErrorResponse}
    },
    summary="List repositories",
    description="Get a paginated list of repositories with optional search and sorting"
)
async def list_repositories(
    search: Optional[str] = Query(None, description="Search term to filter repository names"),
    sort_by: Optional[str] = Query("name", description="Field to sort by (name, tag_count, last_updated, relevance)"),
    sort_order: Optional[str] = Query("asc", description="Sort order (asc, desc)"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
    include_metadata: bool = Query(False, description="Include repository metadata (tag count, last updated)"),
    repo_service: RepositoryService = Depends(get_repository_service)
) -> RepositoryListResponse:
    """
    List repositories from Docker Registry with pagination, search, and sorting
    
    Args:
        search: Optional search term to filter repository names
        sort_by: Field to sort by (name, tag_count, last_updated, relevance)
        sort_order: Sort order (asc, desc)
        page: Page number (1-based)
        page_size: Number of items per page (1-100)
        include_metadata: Whether to fetch repository metadata
        repo_service: Repository service (injected)
        
    Returns:
        RepositoryListResponse with repositories and pagination info
        
    Raises:
        HTTPException: On various error conditions
    """
    try:
        # Validate pagination parameters
        validate_pagination_params(page, page_size)
        
        # Create request objects
        search_req = SearchRequest(search=search)
        sort_req = SortRequest(sort_by=sort_by, sort_order=sort_order)
        pagination_req = PaginationRequest(page=page, page_size=page_size)
        
        # Use repository service for enhanced search and sort
        repo_data, pagination_response = await repo_service.search_and_list_repositories(
            search_req=search_req,
            sort_req=sort_req,
            pagination_req=pagination_req,
            include_metadata=include_metadata
        )
        
        # Convert to response objects
        repo_responses = []
        for repo in repo_data:
            repo_response = RepositoryResponse(
                name=repo["name"],
                tag_count=repo.get("tag_count", 0),
                last_updated=repo.get("last_updated"),
                size_bytes=repo.get("size_bytes")
            )
            repo_responses.append(repo_response)
        
        return RepositoryListResponse(
            repositories=repo_responses,
            pagination=pagination_response
        )
        
    except RegistryException as e:
        # Map registry exceptions to HTTP exceptions
        logger.error(f"Registry error: {e}")
        
        # Determine appropriate status code based on exception type
        if "auth" in str(e).lower():
            status_code = status.HTTP_401_UNAUTHORIZED
        elif "permission" in str(e).lower():
            status_code = status.HTTP_403_FORBIDDEN
        elif "not found" in str(e).lower():
            status_code = status.HTTP_404_NOT_FOUND
        elif "unavailable" in str(e).lower():
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        else:
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        
        raise HTTPException(
            status_code=status_code,
            detail={
                "error": e.__class__.__name__,
                "message": str(e),
                "details": e.to_dict() if hasattr(e, 'to_dict') else {}
            }
        )
    
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    
    except Exception as e:
        # Catch any unexpected errors
        logger.error(f"Unexpected error in list_repositories: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "InternalServerError",
                "message": "An unexpected error occurred",
                "details": {"original_error": str(e)}
            }
        )


@router.get(
    "/search/suggestions",
    response_model=List[Dict[str, Any]],
    summary="Get search suggestions",
    description="Get repository name suggestions based on partial search term"
)
async def get_search_suggestions(
    q: str = Query(..., min_length=1, description="Partial search term"),
    max_results: int = Query(5, ge=1, le=20, description="Maximum number of suggestions"),
    repo_service: RepositoryService = Depends(get_repository_service)
) -> List[Dict[str, Any]]:
    """
    Get search suggestions for repository names
    
    Args:
        q: Partial search term
        max_results: Maximum number of suggestions to return
        repo_service: Repository service (injected)
        
    Returns:
        List of search suggestions with match information
    """
    try:
        suggestions = await repo_service.get_search_suggestions(q, max_results)
        return suggestions
        
    except Exception as e:
        logger.error(f"Error getting search suggestions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "SearchSuggestionsError",
                "message": "Failed to generate search suggestions",
                "details": {"original_error": str(e)}
            }
        )


@router.get(
    "/sort/fields",
    response_model=Dict[str, Any],
    summary="Get available sort fields",
    description="Get information about available sort fields and their properties"
)
async def get_sort_fields(
    include_metadata: bool = Query(False, description="Include metadata-dependent sort fields"),
    repo_service: RepositoryService = Depends(get_repository_service)
) -> Dict[str, Any]:
    """
    Get available sort fields and their information
    
    Args:
        include_metadata: Whether to include metadata-dependent fields
        repo_service: Repository service (injected)
        
    Returns:
        Dictionary with sort field information
    """
    try:
        available_fields = repo_service.get_available_sort_fields(include_metadata)
        field_info = get_sort_field_info()
        
        # Filter field info based on available fields
        filtered_info = {
            field: info for field, info in field_info.items()
            if field in available_fields
        }
        
        return {
            "available_fields": available_fields,
            "field_info": filtered_info,
            "default_field": "name",
            "default_order": "asc"
        }
        
    except Exception as e:
        logger.error(f"Error getting sort fields: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "SortFieldsError",
                "message": "Failed to get sort fields information",
                "details": {"original_error": str(e)}
            }
        )


@router.get(
    "/stats",
    response_model=Dict[str, Any],
    summary="Get repository statistics",
    description="Get repository and search statistics for analytics"
)
async def get_repository_stats(
    repo_service: RepositoryService = Depends(get_repository_service)
) -> Dict[str, Any]:
    """
    Get repository and search statistics
    
    Args:
        repo_service: Repository service (injected)
        
    Returns:
        Dictionary with statistics
    """
    try:
        stats = await repo_service.get_repository_stats()
        return stats
        
    except Exception as e:
        logger.error(f"Error getting repository stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "StatsError",
                "message": "Failed to get repository statistics",
                "details": {"original_error": str(e)}
            }
        )


@router.get(
    "/{repository:path}",
    response_model=RepositoryResponse,
    responses={
        200: {"description": "Successful response", "model": RepositoryResponse},
        404: {"description": "Repository not found", "model": ErrorResponse},
        401: {"description": "Authentication required", "model": ErrorResponse},
        403: {"description": "Permission denied", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse}
    },
    summary="Get repository details",
    description="Get detailed information about a specific repository"
)
async def get_repository(
    repository: str,
    client: RegistryClient = Depends(get_registry_client)
) -> RepositoryResponse:
    """
    Get detailed information about a specific repository
    
    Args:
        repository: Repository name (can include namespace like 'library/nginx')
        client: Registry client (injected)
        
    Returns:
        RepositoryResponse with repository details
        
    Raises:
        HTTPException: On various error conditions
    """
    try:
        # Get repository information
        repo_info = await client.get_repository_info(repository)
        
        return RepositoryResponse(
            name=repo_info.name,
            tag_count=repo_info.tag_count,
            last_updated=repo_info.last_updated,
            size_bytes=repo_info.size_bytes
        )
        
    except RegistryException as e:
        logger.error(f"Registry error getting repository {repository}: {e}")
        
        # Map to appropriate HTTP status
        if "not found" in str(e).lower():
            status_code = status.HTTP_404_NOT_FOUND
        elif "auth" in str(e).lower():
            status_code = status.HTTP_401_UNAUTHORIZED
        elif "permission" in str(e).lower():
            status_code = status.HTTP_403_FORBIDDEN
        else:
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        
        raise HTTPException(
            status_code=status_code,
            detail={
                "error": e.__class__.__name__,
                "message": str(e),
                "details": e.to_dict() if hasattr(e, 'to_dict') else {}
            }
        )
    
    except Exception as e:
        logger.error(f"Unexpected error getting repository {repository}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "InternalServerError",
                "message": "An unexpected error occurred",
                "details": {"original_error": str(e)}
            }
        )