"""
Test configuration and fixtures
"""
import pytest
import json
from unittest.mock import Mock, AsyncMock
from datetime import datetime, timezone

from backend.services.registry import RegistryClient
from backend.models.schemas import (
    ManifestV2, ManifestConfig, ManifestLayer, 
    RepositoryCatalog, TagsList, BearerToken, AuthChallenge
)


@pytest.fixture
def registry_url():
    """Registry URL for testing"""
    return "https://registry.example.com"


@pytest.fixture
def username():
    """Registry username for testing"""
    return "testuser"


@pytest.fixture
def password():
    """Registry password for testing"""
    return "testpassword"


@pytest.fixture
def registry_client(registry_url, username, password):
    """Create a registry client instance for testing"""
    client = RegistryClient(
        registry_url=registry_url,
        username=username,
        password=password,
        timeout=10.0,
        max_retries=2,
        retry_delay=0.1
    )
    return client


@pytest.fixture
def sample_manifest():
    """Sample Docker manifest v2 for testing"""
    return ManifestV2(
        schemaVersion=2,
        mediaType="application/vnd.docker.distribution.manifest.v2+json",
        config=ManifestConfig(
            mediaType="application/vnd.docker.container.image.v1+json",
            size=1234,
            digest="sha256:config123456"
        ),
        layers=[
            ManifestLayer(
                mediaType="application/vnd.docker.image.rootfs.diff.tar.gzip",
                size=5000,
                digest="sha256:layer123456"
            ),
            ManifestLayer(
                mediaType="application/vnd.docker.image.rootfs.diff.tar.gzip", 
                size=3000,
                digest="sha256:layer789012"
            )
        ]
    )


@pytest.fixture
def sample_manifest_data():
    """Sample manifest data as dictionary"""
    return {
        "schemaVersion": 2,
        "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
        "config": {
            "mediaType": "application/vnd.docker.container.image.v1+json",
            "size": 1234,
            "digest": "sha256:config123456"
        },
        "layers": [
            {
                "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
                "size": 5000,
                "digest": "sha256:layer123456"
            },
            {
                "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
                "size": 3000,
                "digest": "sha256:layer789012"
            }
        ]
    }


@pytest.fixture
def sample_config_data():
    """Sample image config data"""
    return {
        "created": "2023-01-01T12:00:00.123456Z",
        "architecture": "amd64",
        "os": "linux",
        "config": {
            "Env": ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
            "Cmd": ["/bin/bash"],
            "Entrypoint": ["/docker-entrypoint.sh"],
            "ExposedPorts": {
                "80/tcp": {},
                "443/tcp": {}
            },
            "WorkingDir": "/app",
            "User": "1000"
        },
        "rootfs": {
            "type": "layers",
            "diff_ids": [
                "sha256:diff123456",
                "sha256:diff789012"
            ]
        },
        "history": [
            {
                "created": "2023-01-01T12:00:00Z",
                "created_by": "/bin/sh -c apt-get update",
                "empty_layer": False
            },
            {
                "created": "2023-01-01T12:01:00Z",
                "created_by": "/bin/sh -c apt-get install -y nginx",
                "empty_layer": False
            }
        ]
    }


@pytest.fixture
def sample_catalog():
    """Sample repository catalog"""
    return RepositoryCatalog(
        repositories=["repo1", "repo2", "namespace/repo3"]
    )


@pytest.fixture
def sample_tags():
    """Sample tags list"""
    return TagsList(
        name="test-repo",
        tags=["latest", "v1.0", "v1.1"]
    )


@pytest.fixture
def sample_bearer_token():
    """Sample bearer token"""
    return BearerToken(
        token="sample-jwt-token",
        access_token=None,
        expires_in=3600,
        issued_at=datetime.now(timezone.utc)
    )


@pytest.fixture
def sample_auth_challenge():
    """Sample authentication challenge"""
    return AuthChallenge(
        realm="https://auth.example.com/token",
        service="registry.example.com",
        scope="repository:test-repo:pull"
    )


@pytest.fixture
def mock_response():
    """Mock HTTP response"""
    def create_response(status_code=200, json_data=None, headers=None):
        response = Mock()
        response.status_code = status_code
        response.headers = headers or {}
        response.json.return_value = json_data or {}
        response.raise_for_status = Mock()
        if status_code >= 400:
            response.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
        return response
    return create_response


@pytest.fixture
def mock_httpx_client():
    """Mock HTTPX AsyncClient"""
    client = AsyncMock()
    client.request = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    return client


# Additional fixtures for API testing

@pytest.fixture
def sample_repository_list():
    """Sample repository list for API testing"""
    return [
        {
            "name": "nginx",
            "tag_count": 15,
            "last_updated": datetime(2023, 12, 1, 12, 0, 0, tzinfo=timezone.utc),
            "size_bytes": 142857600
        },
        {
            "name": "ubuntu", 
            "tag_count": 8,
            "last_updated": datetime(2023, 11, 28, 10, 30, 0, tzinfo=timezone.utc),
            "size_bytes": 72351744
        },
        {
            "name": "library/postgres",
            "tag_count": 12,
            "last_updated": datetime(2023, 12, 2, 14, 15, 0, tzinfo=timezone.utc),
            "size_bytes": 267534336
        }
    ]


@pytest.fixture 
def sample_repository_service():
    """Mock repository service for API testing"""
    from backend.services.repository_service import RepositoryService
    from backend.models.schemas import PaginationResponse
    
    service = Mock(spec=RepositoryService)
    
    # Mock successful response for search_and_list_repositories
    sample_data = [
        {
            "name": "nginx",
            "tag_count": 15,
            "last_updated": datetime(2023, 12, 1, 12, 0, 0, tzinfo=timezone.utc),
            "size_bytes": 142857600
        }
    ]
    
    sample_pagination = PaginationResponse(
        page=1,
        page_size=20,
        total_pages=1,
        total_items=1,
        has_next=False,
        has_previous=False,
        next_url=None,
        previous_url=None
    )
    
    service.search_and_list_repositories = AsyncMock(
        return_value=(sample_data, sample_pagination)
    )
    service.get_search_suggestions = AsyncMock(
        return_value=[{"name": "nginx", "match_score": 1.0, "match_type": "exact"}]
    )
    service.get_available_sort_fields = Mock(
        return_value=["name", "tag_count", "last_updated"]
    )
    service.get_repository_stats = AsyncMock(
        return_value={
            "total_repositories": 1,
            "total_tags": 15,
            "average_tags_per_repo": 15.0,
            "search_stats": {"total_searches": 0, "popular_terms": []}
        }
    )
    
    return service


@pytest.fixture
def sample_registry_errors():
    """Sample registry errors for testing error handling"""
    from backend.services.registry import (
        RegistryException, RegistryAuthError, RegistryNotFoundError,
        RegistryValidationError, RegistryConnectionError, RegistryTimeoutError
    )
    
    return {
        "auth_error": RegistryAuthError("Authentication failed"),
        "not_found": RegistryNotFoundError("Repository not found"),
        "validation_error": RegistryValidationError("Invalid data"),
        "connection_error": RegistryConnectionError("Connection failed"),
        "timeout_error": RegistryTimeoutError("Request timeout"),
        "generic_error": RegistryException("Generic registry error")
    }


@pytest.fixture
def api_test_client():
    """FastAPI test client for API testing"""
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def sample_openapi_examples():
    """Sample data for OpenAPI documentation examples"""
    return {
        "repository_list_response": {
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
        },
        "search_suggestions_response": [
            {"name": "nginx", "match_score": 1.0, "match_type": "exact"},
            {"name": "nginx-proxy", "match_score": 0.8, "match_type": "prefix"}
        ],
        "sort_fields_response": {
            "available_fields": ["name", "tag_count", "last_updated"],
            "field_info": {
                "name": {"description": "Repository name", "type": "string"},
                "tag_count": {"description": "Number of tags", "type": "integer"},
                "last_updated": {"description": "Last update time", "type": "datetime"}
            },
            "default_field": "name",
            "default_order": "asc"
        },
        "stats_response": {
            "total_repositories": 42,
            "total_tags": 158,
            "average_tags_per_repo": 3.76,
            "largest_repository": {"name": "ubuntu", "size_bytes": 267534336},
            "most_recent_update": "2023-12-02T14:15:00Z",
            "search_stats": {
                "total_searches": 125,
                "popular_terms": ["nginx", "postgres", "ubuntu"]
            }
        },
        "error_responses": {
            "400": {
                "error": "ValidationError",
                "message": "Invalid query parameters",
                "status_code": 400,
                "details": {"field": "page", "issue": "must be greater than 0"}
            },
            "401": {
                "error": "RegistryAuthError", 
                "message": "Authentication required",
                "status_code": 401,
                "details": {}
            },
            "404": {
                "error": "RegistryNotFoundError",
                "message": "Repository not found",
                "status_code": 404,
                "details": {}
            },
            "500": {
                "error": "InternalServerError",
                "message": "An unexpected error occurred",
                "status_code": 500,
                "details": {"original_error": "Database connection failed"}
            }
        }
    }