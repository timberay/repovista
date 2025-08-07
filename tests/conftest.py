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