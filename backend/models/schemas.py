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
    """Processed image information"""
    repository: str
    tag: str
    digest: str
    size: int
    created: Optional[datetime] = None
    architecture: Optional[str] = None
    os: Optional[str] = None
    pull_command: str


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