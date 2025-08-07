"""
Unit tests for RegistryClient API methods with mocking
"""
import pytest
import json
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timezone

import httpx

from backend.services.registry import (
    RegistryClient, RegistryException, RegistryAuthError,
    RegistryNotFoundError, RegistryValidationError
)
from backend.models.schemas import (
    RepositoryCatalog, TagsList, ManifestV2, ImageInfo,
    BearerToken, AuthChallenge
)


@pytest.mark.asyncio
class TestAuthenticationFlow:
    """Test cases for authentication flow"""
    
    async def test_handle_auth_challenge_success(self, registry_client, sample_bearer_token):
        """Test successful authentication challenge handling"""
        # Mock response with auth challenge
        response = Mock()
        response.headers = {
            "WWW-Authenticate": 'Bearer realm="https://auth.example.com/token",service="registry.example.com",scope="repository:test:pull"'
        }
        
        # Mock token request
        with patch.object(registry_client, '_obtain_bearer_token', new_callable=AsyncMock) as mock_obtain:
            await registry_client._handle_auth_challenge(response)
            
            # Verify auth challenge was parsed
            assert registry_client._auth_challenge is not None
            assert registry_client._auth_challenge.realm == "https://auth.example.com/token"
            assert registry_client._auth_challenge.service == "registry.example.com"
            assert registry_client._auth_challenge.scope == "repository:test:pull"
            
            mock_obtain.assert_called_once()
            
    async def test_handle_auth_challenge_invalid(self, registry_client):
        """Test authentication challenge with invalid header"""
        response = Mock()
        response.headers = {"WWW-Authenticate": "Basic realm=test"}
        
        with pytest.raises(RegistryAuthError, match="Invalid authentication challenge"):
            await registry_client._handle_auth_challenge(response)
            
    async def test_obtain_bearer_token_success(self, registry_client):
        """Test successful bearer token obtainment"""
        # Set up auth challenge
        registry_client._auth_challenge = AuthChallenge(
            realm="https://auth.example.com/token",
            service="registry.example.com",
            scope="repository:test:pull"
        )
        
        # Mock token response
        mock_response = Mock()
        mock_response.json.return_value = {
            "token": "jwt-token-here",
            "expires_in": 3600
        }
        mock_response.raise_for_status = Mock()
        
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client
            
            await registry_client._obtain_bearer_token()
            
            assert registry_client._auth_token == "jwt-token-here"
            assert registry_client._token_expires_at is not None
            
    async def test_obtain_bearer_token_no_challenge(self, registry_client):
        """Test bearer token request without challenge"""
        registry_client._auth_challenge = None
        
        with pytest.raises(RegistryAuthError, match="No authentication challenge"):
            await registry_client._obtain_bearer_token()
            
    async def test_obtain_bearer_token_no_credentials(self, registry_client):
        """Test bearer token request without credentials"""
        registry_client.username = None
        registry_client.password = None
        registry_client._auth_challenge = AuthChallenge(
            realm="https://auth.example.com/token",
            service="registry.example.com"
        )
        
        with pytest.raises(RegistryAuthError, match="Username and password required"):
            await registry_client._obtain_bearer_token()


@pytest.mark.asyncio
class TestRepositoryOperations:
    """Test cases for repository operations"""
    
    async def test_list_repositories_success(self, registry_client, sample_catalog):
        """Test successful repository listing"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "repositories": ["repo1", "repo2", "namespace/repo3"]
        }
        mock_response.headers = {}
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            repositories, pagination = await registry_client.list_repositories(limit=10)
            
            assert len(repositories) == 3
            assert "repo1" in repositories
            assert "namespace/repo3" in repositories
            assert not pagination.has_next
            
            mock_request.assert_called_once()
            args, kwargs = mock_request.call_args
            assert args[0] == "GET"
            assert "v2/_catalog" in args[1]
            assert kwargs.get("params", {}).get("n") == 10
            
    async def test_list_repositories_with_pagination(self, registry_client):
        """Test repository listing with pagination"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "repositories": ["repo1", "repo2"]
        }
        mock_response.headers = {
            "Link": '</v2/_catalog?n=2&last=repo2>; rel="next"'
        }
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            repositories, pagination = await registry_client.list_repositories(limit=2)
            
            assert len(repositories) == 2
            assert pagination.has_next
            assert pagination.next_url == "/v2/_catalog?n=2&last=repo2"
            
    async def test_list_repositories_fetch_all(self, registry_client):
        """Test fetching all repositories across pages"""
        responses = [
            # First page
            Mock(
                json=Mock(return_value={"repositories": ["repo1", "repo2"]}),
                headers={"Link": '</v2/_catalog?n=2&last=repo2>; rel="next"'}
            ),
            # Second page
            Mock(
                json=Mock(return_value={"repositories": ["repo3", "repo4"]}),
                headers={}
            )
        ]
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.side_effect = responses
            
            repositories, pagination = await registry_client.list_repositories(limit=2, fetch_all=True)
            
            assert len(repositories) == 4
            assert "repo1" in repositories
            assert "repo4" in repositories
            assert not pagination.has_next  # Final state
            
            assert mock_request.call_count == 2
            
    async def test_get_repository_info_success(self, registry_client):
        """Test successful repository info retrieval"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "name": "test-repo",
            "tags": ["latest", "v1.0", "v1.1"]
        }
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            repo_info = await registry_client.get_repository_info("test-repo")
            
            assert repo_info.name == "test-repo"
            assert repo_info.tag_count == 3
            
            mock_request.assert_called_once()
            args, kwargs = mock_request.call_args
            assert "test-repo/tags/list" in args[1]


@pytest.mark.asyncio 
class TestTagOperations:
    """Test cases for tag operations"""
    
    async def test_list_tags_success(self, registry_client, sample_tags):
        """Test successful tag listing"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "name": "test-repo",
            "tags": ["latest", "v1.0", "v1.1"]
        }
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            tags_list = await registry_client.list_tags("test-repo")
            
            assert tags_list.name == "test-repo"
            assert len(tags_list.tags) == 3
            assert "latest" in tags_list.tags
            assert "v1.1" in tags_list.tags
            
            mock_request.assert_called_once()
            args, kwargs = mock_request.call_args
            assert "test-repo/tags/list" in args[1]
            
    async def test_list_tags_not_found(self, registry_client):
        """Test tag listing for non-existent repository"""
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.side_effect = RegistryNotFoundError("Repository not found")
            
            with pytest.raises(RegistryNotFoundError, match="Repository 'nonexistent' not found"):
                await registry_client.list_tags("nonexistent")


@pytest.mark.asyncio
class TestManifestOperations:
    """Test cases for manifest operations"""
    
    async def test_get_manifest_success(self, registry_client, sample_manifest_data):
        """Test successful manifest retrieval"""
        mock_response = Mock()
        mock_response.json.return_value = sample_manifest_data
        mock_response.headers = {
            "Docker-Content-Digest": "sha256:manifest123456"
        }
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            manifest, digest = await registry_client.get_manifest("test-repo", "latest")
            
            assert manifest.schema_version == 2
            assert len(manifest.layers) == 2
            assert digest == "sha256:manifest123456"
            
            mock_request.assert_called_once()
            args, kwargs = mock_request.call_args
            assert "test-repo/manifests/latest" in args[1]
            assert kwargs.get("headers", {}).get("Accept") == "application/vnd.docker.distribution.manifest.v2+json"
            
    async def test_get_manifest_validation_error(self, registry_client):
        """Test manifest retrieval with invalid data"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "schemaVersion": 2  # Missing required fields
        }
        mock_response.headers = {"Docker-Content-Digest": "sha256:test"}
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            with pytest.raises(RegistryValidationError, match="Invalid manifest structure"):
                await registry_client.get_manifest("test-repo", "latest")
                
    async def test_get_config_blob_success(self, registry_client, sample_config_data):
        """Test successful config blob retrieval"""
        mock_response = Mock()
        mock_response.json.return_value = sample_config_data
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            config_data = await registry_client.get_config_blob("test-repo", "sha256:config123")
            
            assert config_data["architecture"] == "amd64"
            assert config_data["os"] == "linux"
            assert "config" in config_data
            
            mock_request.assert_called_once()
            args, kwargs = mock_request.call_args
            assert "test-repo/blobs/sha256:config123" in args[1]


@pytest.mark.asyncio
class TestImageInfoOperations:
    """Test cases for image info operations"""
    
    async def test_get_image_info_success(self, registry_client, sample_manifest, sample_manifest_data):
        """Test successful basic image info retrieval"""
        mock_response = Mock()
        mock_response.json.return_value = sample_manifest_data
        mock_response.headers = {"Docker-Content-Digest": "sha256:digest123"}
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            image_info = await registry_client.get_image_info("test-repo", "latest")
            
            assert isinstance(image_info, ImageInfo)
            assert image_info.repository == "test-repo"
            assert image_info.tag == "latest"
            assert image_info.digest == "sha256:digest123"
            assert image_info.size == 9234  # 1234 + 5000 + 3000
            assert image_info.pull_command == "docker pull test-repo:latest"
            
    async def test_get_detailed_image_info_success(self, registry_client, sample_manifest_data, sample_config_data):
        """Test successful detailed image info retrieval"""
        # Mock manifest response
        manifest_response = Mock()
        manifest_response.json.return_value = sample_manifest_data
        manifest_response.headers = {"Docker-Content-Digest": "sha256:digest123"}
        
        # Mock config response
        config_response = Mock()
        config_response.json.return_value = sample_config_data
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.side_effect = [manifest_response, config_response]
            
            image_info = await registry_client.get_detailed_image_info("test-repo", "latest")
            
            assert isinstance(image_info, ImageInfo)
            assert image_info.repository == "test-repo"
            assert image_info.tag == "latest"
            assert image_info.architecture == "amd64"
            assert image_info.os == "linux"
            assert image_info.created is not None
            
            # Should have made two requests (manifest + config)
            assert mock_request.call_count == 2


@pytest.mark.asyncio
class TestErrorHandling:
    """Test cases for error handling during API operations"""
    
    async def test_make_request_with_circuit_breaker_open(self, registry_client):
        """Test request blocked by open circuit breaker"""
        # Force circuit breaker open
        registry_client._circuit_breaker_state = "OPEN"
        registry_client._last_failure_time = time.time()
        
        with pytest.raises(RegistryConnectionError, match="Circuit breaker is open"):
            await registry_client._make_request("GET", "http://test.com/api")
            
    async def test_make_request_retry_on_failure(self, registry_client):
        """Test request retry on retriable failure"""
        registry_client.max_retries = 2
        registry_client.retry_delay = 0.01  # Fast retry for testing
        
        responses = [
            httpx.TimeoutException("Timeout 1"),
            httpx.TimeoutException("Timeout 2"), 
            Mock(status_code=200)  # Success on third try
        ]
        
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client.request = AsyncMock(side_effect=responses)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client
            
            response = await registry_client._make_request("GET", "http://test.com/api")
            
            assert response.status_code == 200
            assert mock_client.request.call_count == 3
            
    async def test_make_request_max_retries_exceeded(self, registry_client):
        """Test request failure after max retries"""
        registry_client.max_retries = 1
        registry_client.retry_delay = 0.01
        
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client.request = AsyncMock(side_effect=httpx.TimeoutException("Persistent timeout"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client
            
            with pytest.raises(RegistryTimeoutError, match="Request timeout"):
                await registry_client._make_request("GET", "http://test.com/api")
                
            assert mock_client.request.call_count == 2  # Initial + 1 retry


@pytest.mark.asyncio  
class TestCacheIntegration:
    """Test cases for cache integration with API methods"""
    
    async def test_list_repositories_cached(self, registry_client, sample_catalog):
        """Test repository list caching"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "repositories": ["repo1", "repo2"]
        }
        mock_response.headers = {}
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            # First call
            repos1, _ = await registry_client.list_repositories(limit=10)
            
            # Second call (should use cache)
            repos2, _ = await registry_client.list_repositories(limit=10)
            
            assert repos1 == repos2
            assert mock_request.call_count == 1  # Only one actual request
            assert registry_client._cache_stats["hits"] == 1
            
    async def test_get_manifest_cached(self, registry_client, sample_manifest_data):
        """Test manifest caching"""
        mock_response = Mock()
        mock_response.json.return_value = sample_manifest_data
        mock_response.headers = {"Docker-Content-Digest": "sha256:test"}
        
        with patch.object(registry_client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_response
            
            # First call
            manifest1, digest1 = await registry_client.get_manifest("test-repo", "latest")
            
            # Second call (should use cache)
            manifest2, digest2 = await registry_client.get_manifest("test-repo", "latest")
            
            assert manifest1.schema_version == manifest2.schema_version
            assert digest1 == digest2
            assert mock_request.call_count == 1  # Only one actual request
            assert registry_client._cache_stats["hits"] == 1