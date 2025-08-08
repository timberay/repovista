"""
Pydantic data models for Docker Registry API
"""

from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class RegistryErrorCode(str, Enum):
    """Docker Registry v2 API error codes"""
    BLOB_UNKNOWN = "BLOB_UNKNOWN"
    BLOB_UPLOAD_INVALID = "BLOB_UPLOAD_INVALID"
    BLOB_UPLOAD_UNKNOWN = "BLOB_UPLOAD_UNKNOWN"
    DIGEST_INVALID = "DIGEST_INVALID"
    MANIFEST_BLOB_UNKNOWN = "MANIFEST_BLOB_UNKNOWN"
    MANIFEST_INVALID = "MANIFEST_INVALID"
    MANIFEST_UNKNOWN = "MANIFEST_UNKNOWN"
    MANIFEST_UNVERIFIED = "MANIFEST_UNVERIFIED"
    NAME_INVALID = "NAME_INVALID"
    NAME_UNKNOWN = "NAME_UNKNOWN"
    SIZE_INVALID = "SIZE_INVALID"
    TAG_INVALID = "TAG_INVALID"
    UNAUTHORIZED = "UNAUTHORIZED"
    DENIED = "DENIED"
    UNSUPPORTED = "UNSUPPORTED"


class RegistryError(BaseModel):
    """Docker Registry error response model"""
    code: RegistryErrorCode
    message: str
    detail: Optional[Dict[str, Any]] = None


class RegistryErrorResponse(BaseModel):
    """Registry API error response wrapper"""
    errors: List[RegistryError]


class AuthChallenge(BaseModel):
    """Docker Registry authentication challenge"""
    realm: HttpUrl
    service: str
    scope: Optional[str] = None


class BearerToken(BaseModel):
    """Bearer token response from registry auth service"""
    token: str
    access_token: Optional[str] = None
    expires_in: Optional[int] = None
    issued_at: Optional[datetime] = None


class RepositoryCatalog(BaseModel):
    """Repository catalog response from /v2/_catalog"""
    repositories: List[str]


class TagsList(BaseModel):
    """Tags list response from /v2/{name}/tags/list"""
    name: str
    tags: List[str]


class ManifestConfig(BaseModel):
    """Manifest configuration layer"""
    media_type: str = Field(alias="mediaType")
    size: int
    digest: str


class ManifestLayer(BaseModel):
    """Manifest layer information"""
    media_type: str = Field(alias="mediaType")
    size: int
    digest: str


class ManifestV2(BaseModel):
    """Docker Image Manifest Version 2, Schema 2"""
    schema_version: int = Field(alias="schemaVersion")
    media_type: str = Field(alias="mediaType")
    config: ManifestConfig
    layers: List[ManifestLayer]


class ImageInfo(BaseModel):
    """Processed image information for general repository operations"""
    repository: str
    tag: str
    digest: str
    size: int
    created: Optional[datetime] = None
    architecture: Optional[str] = None
    os: Optional[str] = None
    pull_command: str


class TagResponse(BaseModel):
    """
    Enhanced response model for tag information with formatted size and detailed metadata
    
    This model provides comprehensive tag information including both raw and formatted data
    for optimal API response presentation.
    """
    repository: str = Field(
        ...,
        description="Repository name (e.g., 'nginx', 'library/ubuntu', 'mycompany/myapp')",
        example="nginx"
    )
    tag: str = Field(
        ..., 
        description="Tag name/version identifier",
        example="latest"
    )
    digest: str = Field(
        ...,
        description="SHA256 digest of the image manifest",
        example="sha256:abc123def456789...",
        min_length=64,
        max_length=71  # sha256: prefix + 64 hex chars
    )
    size_bytes: int = Field(
        ...,
        description="Image size in bytes",
        example=104857600,
        ge=0
    )
    size_formatted: str = Field(
        ...,
        description="Human-readable image size",
        example="100.0 MB"
    )
    created: Optional[datetime] = Field(
        None,
        description="Image creation timestamp (ISO 8601 format)",
        example="2023-01-01T12:00:00Z"
    )
    created_formatted: Optional[str] = Field(
        None,
        description="Human-readable creation date",
        example="2 days ago"
    )
    architecture: Optional[str] = Field(
        "amd64",
        description="Target CPU architecture",
        example="amd64"
    )
    os: Optional[str] = Field(
        "linux", 
        description="Target operating system",
        example="linux"
    )
    pull_command: str = Field(
        ...,
        description="Complete Docker pull command",
        example="docker pull nginx:latest"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "repository": "nginx",
                "tag": "latest", 
                "digest": "sha256:abc123def456789012345678901234567890123456789012345678901234",
                "size_bytes": 104857600,
                "size_formatted": "100.0 MB",
                "created": "2023-01-01T12:00:00Z",
                "created_formatted": "2 days ago",
                "architecture": "amd64",
                "os": "linux",
                "pull_command": "docker pull nginx:latest"
            }
        }




class RepositoryInfo(BaseModel):
    """Repository information with metadata"""
    name: str
    tag_count: int
    last_updated: Optional[datetime] = None
    size_bytes: Optional[int] = None


class PaginationInfo(BaseModel):
    """Pagination information for API responses"""
    has_next: bool = False
    next_url: Optional[str] = None
    total_count: Optional[int] = None


class PaginationRequest(BaseModel):
    """Request model for pagination parameters"""
    page: int = Field(default=1, ge=1, description="Page number (1-based)")
    page_size: int = Field(default=20, ge=1, le=100, description="Number of items per page")
    
    @property
    def offset(self) -> int:
        """Calculate offset for database queries"""
        return (self.page - 1) * self.page_size
    
    @property
    def limit(self) -> int:
        """Get limit for database queries"""
        return self.page_size


class PaginationResponse(BaseModel):
    """Enhanced pagination response model"""
    page: int = Field(description="Current page number")
    page_size: int = Field(description="Number of items per page")
    total_count: int = Field(description="Total number of items")
    total_pages: int = Field(description="Total number of pages")
    has_next: bool = Field(description="Whether there is a next page")
    has_prev: bool = Field(description="Whether there is a previous page")
    next_page: Optional[int] = Field(None, description="Next page number if available")
    prev_page: Optional[int] = Field(None, description="Previous page number if available")
    
    @classmethod
    def create(
        cls,
        page: int,
        page_size: int,
        total_count: int
    ) -> "PaginationResponse":
        """
        Create pagination response from basic parameters
        
        Args:
            page: Current page number
            page_size: Items per page
            total_count: Total number of items
            
        Returns:
            PaginationResponse instance
        """
        total_pages = (total_count + page_size - 1) // page_size
        has_next = page < total_pages
        has_prev = page > 1
        
        return cls(
            page=page,
            page_size=page_size,
            total_count=total_count,
            total_pages=total_pages,
            has_next=has_next,
            has_prev=has_prev,
            next_page=page + 1 if has_next else None,
            prev_page=page - 1 if has_prev else None
        )


class TagListResponse(PaginationResponse):
    """
    Paginated response model for tag listing with enhanced tag information
    
    Provides a paginated list of tags with comprehensive metadata including
    formatted sizes, creation dates, and pull commands.
    """
    tags: List[TagResponse] = Field(
        ...,
        description="List of tags with detailed metadata"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "tags": [
                    {
                        "repository": "nginx",
                        "tag": "latest",
                        "digest": "sha256:abc123def456789012345678901234567890123456789012345678901234",
                        "size_bytes": 104857600,
                        "size_formatted": "100.0 MB", 
                        "created": "2023-01-01T12:00:00Z",
                        "created_formatted": "2 days ago",
                        "architecture": "amd64",
                        "os": "linux",
                        "pull_command": "docker pull nginx:latest"
                    }
                ],
                "page": 1,
                "page_size": 20,
                "total_count": 45,
                "total_pages": 3,
                "has_next": True,
                "has_prev": False,
                "next_page": 2,
                "prev_page": None
            }
        }


class SortRequest(BaseModel):
    """Request model for sorting parameters"""
    sort_by: str = Field(default="name", description="Field to sort by")
    sort_order: str = Field(default="asc", description="Sort order (asc or desc)")
    
    def validate_sort_field(self, valid_fields: List[str]) -> None:
        """
        Validate that sort_by is in the list of valid fields
        
        Args:
            valid_fields: List of allowed sort fields
            
        Raises:
            ValueError: If sort_by is not in valid_fields
        """
        if self.sort_by not in valid_fields:
            raise ValueError(f"Invalid sort_by field. Must be one of: {', '.join(valid_fields)}")
    
    def validate_sort_order(self) -> None:
        """
        Validate that sort_order is either 'asc' or 'desc'
        
        Raises:
            ValueError: If sort_order is invalid
        """
        if self.sort_order not in ["asc", "desc"]:
            raise ValueError("Invalid sort_order. Must be 'asc' or 'desc'")
    
    @property
    def is_descending(self) -> bool:
        """Check if sort order is descending"""
        return self.sort_order == "desc"


class SearchRequest(BaseModel):
    """Request model for search parameters"""
    search: Optional[str] = Field(None, description="Search term to filter results")
    search_strategy: str = Field(default="contains", description="Search strategy (exact, contains, prefix, suffix, wildcard)")
    case_sensitive: bool = Field(default=False, description="Whether search should be case sensitive")
    
    def matches(self, text: str) -> bool:
        """
        Check if text matches the search term
        
        Args:
            text: Text to search in
            
        Returns:
            True if search term is found in text (case-insensitive)
        """
        if not self.search:
            return True
        
        return self.search.lower() in text.lower()
    
    def validate_search_strategy(self) -> None:
        """
        Validate search strategy parameter
        
        Raises:
            ValueError: If search strategy is invalid
        """
        valid_strategies = ["exact", "contains", "prefix", "suffix", "regex", "wildcard"]
        if self.search_strategy not in valid_strategies:
            raise ValueError(f"Invalid search strategy. Must be one of: {', '.join(valid_strategies)}")


class AdvancedSearchRequest(BaseModel):
    """Advanced search request with multiple criteria"""
    name: Optional[str] = Field(None, description="Repository name search term")
    namespace: Optional[str] = Field(None, description="Namespace search term")
    tag_count_min: Optional[int] = Field(None, ge=0, description="Minimum tag count")
    tag_count_max: Optional[int] = Field(None, ge=0, description="Maximum tag count")
    updated_after: Optional[datetime] = Field(None, description="Show repositories updated after this date")
    updated_before: Optional[datetime] = Field(None, description="Show repositories updated before this date")
    size_min: Optional[int] = Field(None, ge=0, description="Minimum size in bytes")
    size_max: Optional[int] = Field(None, ge=0, description="Maximum size in bytes")
    
    def has_filters(self) -> bool:
        """Check if any search filters are applied"""
        return any([
            self.name, self.namespace, self.tag_count_min, self.tag_count_max,
            self.updated_after, self.updated_before, self.size_min, self.size_max
        ])
    
    def matches_repository(self, repo_data: Dict[str, Any]) -> bool:
        """
        Check if repository matches all search criteria
        
        Args:
            repo_data: Repository data dictionary
            
        Returns:
            True if repository matches all criteria
        """
        # Name filter
        if self.name:
            repo_name = repo_data.get("name", "")
            if self.name.lower() not in repo_name.lower():
                return False
        
        # Namespace filter
        if self.namespace:
            repo_namespace = repo_data.get("namespace", "")
            if self.namespace.lower() not in repo_namespace.lower():
                return False
        
        # Tag count filters
        tag_count = repo_data.get("tag_count", 0)
        if self.tag_count_min is not None and tag_count < self.tag_count_min:
            return False
        if self.tag_count_max is not None and tag_count > self.tag_count_max:
            return False
        
        # Date filters
        last_updated = repo_data.get("last_updated")
        if last_updated:
            if self.updated_after and last_updated < self.updated_after:
                return False
            if self.updated_before and last_updated > self.updated_before:
                return False
        
        # Size filters
        size_bytes = repo_data.get("size_bytes", 0)
        if self.size_min is not None and size_bytes < self.size_min:
            return False
        if self.size_max is not None and size_bytes > self.size_max:
            return False
        
        return True


class RepositoryListRequest(BaseModel):
    """Combined request model for repository listing"""
    pagination: PaginationRequest = Field(default_factory=PaginationRequest)
    sort: SortRequest = Field(default_factory=SortRequest)
    search: SearchRequest = Field(default_factory=SearchRequest)
    
    def validate(self, valid_sort_fields: List[str]) -> None:
        """
        Validate all request parameters
        
        Args:
            valid_sort_fields: List of allowed sort fields
            
        Raises:
            ValueError: If any validation fails
        """
        self.sort.validate_sort_field(valid_sort_fields)
        self.sort.validate_sort_order()