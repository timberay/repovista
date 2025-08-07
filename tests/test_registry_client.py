"""
Unit tests for RegistryClient class
"""
import pytest
import time
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timezone

import httpx

from backend.services.registry import (
    RegistryClient, RegistryException, RegistryAuthError,
    RegistryNotFoundError, RegistryConnectionError, RegistryTimeoutError,
    RegistryPermissionError, RegistryRateLimitError, RegistryServerError,
    RegistryValidationError, RegistryUnavailableError
)
from backend.models.schemas import ImageInfo, RepositoryInfo


class TestRegistryClient:
    """Test cases for RegistryClient initialization and basic functionality"""
    
    def test_init_with_defaults(self):
        """Test client initialization with default parameters"""
        client = RegistryClient("https://registry.example.com")
        
        assert client.registry_url == "https://registry.example.com"
        assert client.username is None
        assert client.password is None
        assert client.timeout == 30.0
        assert client.max_retries == 3
        assert client.retry_delay == 1.0
        assert client._circuit_breaker_threshold == 5
        assert client._circuit_breaker_timeout == 60
        assert client._cache_ttl == 300
        assert client._max_cache_size == 1000
        
    def test_init_with_credentials(self, registry_url, username, password):
        """Test client initialization with credentials"""
        client = RegistryClient(registry_url, username, password)
        
        assert client.registry_url == registry_url
        assert client.username == username
        assert client.password == password
        
    def test_init_custom_params(self):
        """Test client initialization with custom parameters"""
        client = RegistryClient(
            "https://registry.example.com",
            timeout=15.0,
            max_retries=5,
            retry_delay=0.5
        )
        
        assert client.timeout == 15.0
        assert client.max_retries == 5
        assert client.retry_delay == 0.5


class TestCacheManagement:
    """Test cases for cache functionality"""
    
    def test_cache_miss(self, registry_client):
        """Test cache miss scenario"""
        result = registry_client._get_cached("nonexistent_key")
        assert result is None
        assert registry_client._cache_stats["misses"] == 1
        assert registry_client._cache_stats["hits"] == 0
        
    def test_cache_hit(self, registry_client):
        """Test cache hit scenario"""
        # Set cache entry
        registry_client._set_cache("test_key", "test_value", 60)
        
        # Get cached value
        result = registry_client._get_cached("test_key")
        assert result == "test_value"
        assert registry_client._cache_stats["hits"] == 1
        assert registry_client._cache_stats["misses"] == 0
        
    def test_cache_expiration(self, registry_client):
        """Test cache expiration"""
        # Set cache entry with short TTL
        registry_client._set_cache("test_key", "test_value", 0.1)
        
        # Wait for expiration
        time.sleep(0.2)
        
        result = registry_client._get_cached("test_key")
        assert result is None
        assert registry_client._cache_stats["evictions"] == 1
        
    def test_cache_size_limit(self, registry_client):
        """Test cache size limitation"""
        registry_client.configure_cache(max_size=3)
        
        # Fill cache beyond limit
        for i in range(5):
            registry_client._set_cache(f"key_{i}", f"value_{i}", 60)
        
        # Should have evicted oldest entries
        assert len(registry_client._cache) <= 3
        assert registry_client._cache_stats["evictions"] > 0
        
    def test_clear_cache_all(self, registry_client):
        """Test clearing entire cache"""
        # Add some cache entries
        for i in range(3):
            registry_client._set_cache(f"key_{i}", f"value_{i}", 60)
        
        registry_client.clear_cache()
        
        assert len(registry_client._cache) == 0
        assert registry_client._cache_stats["size"] == 0
        
    def test_clear_cache_pattern(self, registry_client):
        """Test clearing cache with pattern matching"""
        # Add mixed cache entries
        registry_client._set_cache("repo:test1", "value1", 60)
        registry_client._set_cache("repo:test2", "value2", 60)
        registry_client._set_cache("manifest:test", "value3", 60)
        
        # Clear only repo entries
        registry_client.clear_cache("^repo:")
        
        assert len(registry_client._cache) == 1
        assert "manifest:test" in registry_client._cache
        
    def test_cache_stats(self, registry_client):
        """Test cache statistics"""
        # Generate some cache activity
        registry_client._set_cache("key1", "value1", 60)
        registry_client._get_cached("key1")  # hit
        registry_client._get_cached("key2")  # miss
        
        stats = registry_client.get_cache_stats()
        
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["size"] == 1
        assert stats["hit_rate"] == 50.0
        assert stats["total_requests"] == 2


class TestCircuitBreaker:
    """Test cases for circuit breaker functionality"""
    
    def test_initial_state_closed(self, registry_client):
        """Test circuit breaker starts in closed state"""
        info = registry_client._get_circuit_breaker_info()
        assert info["state"] == "CLOSED"
        assert info["failure_count"] == 0
        
    def test_circuit_breaker_open_after_failures(self, registry_client):
        """Test circuit breaker opens after threshold failures"""
        # Simulate failures
        for _ in range(registry_client._circuit_breaker_threshold):
            registry_client._record_failure(is_retriable=True)
            
        info = registry_client._get_circuit_breaker_info()
        assert info["state"] == "OPEN"
        
    def test_circuit_breaker_half_open_after_timeout(self, registry_client):
        """Test circuit breaker transitions to half-open after timeout"""
        # Set short timeout for testing
        registry_client.configure_circuit_breaker(threshold=1, timeout=0.1)
        
        # Trigger circuit open
        registry_client._record_failure(is_retriable=True)
        assert registry_client._get_circuit_breaker_state() == "OPEN"
        
        # Wait for timeout
        time.sleep(0.2)
        
        state = registry_client._get_circuit_breaker_state()
        assert state == "HALF_OPEN"
        
    def test_circuit_breaker_success_closes_circuit(self, registry_client):
        """Test successful requests close circuit from half-open"""
        registry_client._circuit_breaker_state = "HALF_OPEN"
        
        # Simulate enough successful calls
        for _ in range(registry_client._circuit_breaker_half_open_max_calls):
            registry_client._record_success()
        
        info = registry_client._get_circuit_breaker_info()
        assert info["state"] == "CLOSED"
        
    def test_circuit_breaker_reset(self, registry_client):
        """Test manual circuit breaker reset"""
        # Open circuit
        for _ in range(registry_client._circuit_breaker_threshold):
            registry_client._record_failure(is_retriable=True)
            
        assert registry_client._get_circuit_breaker_state() == "OPEN"
        
        # Reset circuit
        registry_client.reset_circuit_breaker()
        
        info = registry_client._get_circuit_breaker_info()
        assert info["state"] == "CLOSED"
        assert info["failure_count"] == 0


class TestDataParsing:
    """Test cases for data parsing utilities"""
    
    def test_parse_datetime_formats(self, registry_client):
        """Test parsing various datetime formats"""
        test_cases = [
            "2023-01-01T12:00:00.123456Z",
            "2023-01-01T12:00:00Z",
            "2023-01-01T12:00:00+00:00",
            "2023-01-01T12:00:00.123456+00:00",
            "2023-01-01T12:00:00"
        ]
        
        for datetime_str in test_cases:
            result = registry_client._parse_datetime(datetime_str)
            assert result is not None
            assert isinstance(result, datetime)
            
    def test_parse_datetime_invalid(self, registry_client):
        """Test parsing invalid datetime"""
        result = registry_client._parse_datetime("invalid-datetime")
        assert result is None
        
        result = registry_client._parse_datetime("")
        assert result is None
        
        result = registry_client._parse_datetime(None)
        assert result is None
        
    def test_format_size(self, registry_client):
        """Test size formatting"""
        test_cases = [
            (0, "0 B"),
            (512, "512 B"),
            (1024, "1.0 KB"),
            (1536, "1.5 KB"),
            (1048576, "1.0 MB"),
            (1073741824, "1.0 GB")
        ]
        
        for size_bytes, expected in test_cases:
            result = registry_client._format_size(size_bytes)
            assert result == expected
            
    def test_validate_manifest_data_valid(self, registry_client, sample_manifest_data):
        """Test manifest data validation with valid data"""
        result = registry_client._validate_manifest_data(sample_manifest_data)
        assert result is True
        
    def test_validate_manifest_data_invalid(self, registry_client):
        """Test manifest data validation with invalid data"""
        invalid_cases = [
            {},  # Empty
            {"schemaVersion": 2},  # Missing fields
            {"schemaVersion": 2, "mediaType": "test", "config": "invalid"},  # Invalid config
            {"schemaVersion": 2, "mediaType": "test", "config": {}, "layers": "invalid"}  # Invalid layers
        ]
        
        for invalid_data in invalid_cases:
            result = registry_client._validate_manifest_data(invalid_data)
            assert result is False
            
    def test_parse_manifest_metadata(self, registry_client, sample_manifest, sample_config_data):
        """Test manifest metadata parsing"""
        metadata = registry_client._parse_manifest_metadata(sample_manifest, sample_config_data)
        
        assert metadata["total_size"] == 9234  # 1234 + 5000 + 3000
        assert metadata["layers_count"] == 2
        assert metadata["architecture"] == "amd64"
        assert metadata["os"] == "linux"
        assert metadata["created"] is not None
        assert isinstance(metadata["env"], list)
        assert isinstance(metadata["cmd"], list)
        
    def test_create_image_info_from_metadata(self, registry_client):
        """Test ImageInfo creation from metadata"""
        metadata = {
            "total_size": 1000,
            "created": datetime.now(timezone.utc),
            "architecture": "amd64",
            "os": "linux"
        }
        
        image_info = registry_client._create_image_info_from_metadata(
            "test-repo", "latest", "sha256:digest", metadata
        )
        
        assert isinstance(image_info, ImageInfo)
        assert image_info.repository == "test-repo"
        assert image_info.tag == "latest"
        assert image_info.size == 1000
        assert image_info.architecture == "amd64"
        
    def test_parse_image_reference(self, registry_client):
        """Test image reference parsing"""
        test_cases = [
            ("nginx:latest", {"registry": None, "repository": "nginx", "tag": "latest", "digest": None}),
            ("registry.io/nginx:latest", {"registry": "registry.io", "repository": "nginx", "tag": "latest", "digest": None}),
            ("nginx@sha256:abc123", {"registry": None, "repository": "nginx", "tag": None, "digest": "sha256:abc123"}),
            ("localhost:5000/nginx:latest", {"registry": "localhost:5000", "repository": "nginx", "tag": "latest", "digest": None})
        ]
        
        for image_ref, expected in test_cases:
            result = registry_client.parse_image_reference(image_ref)
            for key, value in expected.items():
                assert result[key] == value


class TestErrorHandling:
    """Test cases for error handling"""
    
    def test_user_friendly_error_messages(self, registry_client):
        """Test user-friendly error message generation"""
        auth_error = RegistryAuthError("Authentication failed")
        message = registry_client._create_user_friendly_error_message(auth_error, "accessing repository")
        assert "Authentication failed while accessing repository" in message
        
        not_found_error = RegistryNotFoundError("Repository not found")
        message = registry_client._create_user_friendly_error_message(not_found_error, "repository access")
        assert "Repository not found" in message
        
    def test_is_retriable_error(self, registry_client):
        """Test retriable error detection"""
        # Retriable errors
        retriable_errors = [
            RegistryConnectionError("Connection error"),
            RegistryTimeoutError("Timeout"),
            RegistryServerError("Server error"),
            RegistryRateLimitError("Rate limited")
        ]
        
        for error in retriable_errors:
            assert registry_client._is_retriable_error(error) is True
            
        # Non-retriable errors
        non_retriable_errors = [
            RegistryAuthError("Auth failed"),
            RegistryNotFoundError("Not found"),
            RegistryPermissionError("Permission denied"),
            RegistryValidationError("Validation error")
        ]
        
        for error in non_retriable_errors:
            assert registry_client._is_retriable_error(error) is False
            
    def test_get_retry_delay(self, registry_client):
        """Test retry delay calculation"""
        # Test exponential backoff
        delay0 = registry_client._get_retry_delay(0)
        delay1 = registry_client._get_retry_delay(1)
        delay2 = registry_client._get_retry_delay(2)
        
        assert delay0 < delay1 < delay2
        assert delay2 <= registry_client._max_retry_delay  # Should not exceed max
        
        # Test rate limit retry-after
        rate_limit_error = RegistryRateLimitError("Rate limited", details={"retry_after": "10"})
        delay = registry_client._get_retry_delay(0, rate_limit_error)
        assert delay == 10.0


class TestHealthStatus:
    """Test cases for health status reporting"""
    
    def test_health_status(self, registry_client):
        """Test health status reporting"""
        status = registry_client.get_health_status()
        
        assert "circuit_breaker" in status
        assert "cache" in status
        assert "auth" in status
        assert "config" in status
        assert "stats" in status
        
        # Check circuit breaker info
        assert "state" in status["circuit_breaker"]
        assert "failure_count" in status["circuit_breaker"]
        
        # Check cache info
        assert "hits" in status["cache"]
        assert "misses" in status["cache"]
        assert "size" in status["cache"]
        
        # Check config info
        assert "registry_url" in status["config"]
        assert "timeout" in status["config"]


@pytest.mark.asyncio
class TestAsyncOperations:
    """Test cases for async registry operations"""
    
    async def test_close_cleanup(self, registry_client):
        """Test client cleanup on close"""
        # Add some cache entries
        registry_client._set_cache("key1", "value1", 60)
        registry_client._auth_token = "test-token"
        
        await registry_client.close()
        
        assert len(registry_client._cache) == 0
        assert registry_client._auth_token is None
        assert registry_client._get_circuit_breaker_state() == "CLOSED"


class TestUtilityMethods:
    """Test cases for utility methods"""
    
    def test_create_pull_command(self, registry_client):
        """Test pull command creation"""
        # Test with instance registry
        command = registry_client.create_pull_command("nginx", "latest")
        assert "docker pull" in command
        assert "nginx:latest" in command
        
        # Test with custom registry
        command = registry_client.create_pull_command("nginx", "latest", "https://custom.registry.com")
        assert "custom.registry.com/nginx:latest" in command
        
    def test_get_image_layers_info(self, registry_client, sample_manifest):
        """Test image layers info extraction"""
        layers_info = registry_client.get_image_layers_info(sample_manifest)
        
        assert len(layers_info) == 2
        assert layers_info[0]["index"] == 0
        assert layers_info[0]["size"] == 5000
        assert layers_info[1]["index"] == 1
        assert layers_info[1]["size"] == 3000
        assert "formatted_size" in layers_info[0]
        assert "is_compressed" in layers_info[0]
        
    def test_extract_image_commands(self, registry_client, sample_config_data):
        """Test image command extraction"""
        commands = registry_client.extract_image_commands(sample_config_data)
        
        assert len(commands) == 2
        assert "apt-get update" in commands[0]
        assert "apt-get install -y nginx" in commands[1]
        
    def test_get_repository_summary(self, registry_client):
        """Test repository summary generation"""
        repositories = ["nginx", "apache/httpd", "redis", "apache/tomcat"]
        summary = registry_client.get_repository_summary(repositories)
        
        assert summary["total_count"] == 4
        assert summary["unique_namespaces"] == 1  # Just "apache"
        assert "apache" in summary["namespaces"]
        assert len(summary["sample_repositories"]) == 4
        
    def test_get_repository_summary_empty(self, registry_client):
        """Test repository summary with empty list"""
        summary = registry_client.get_repository_summary([])
        
        assert summary["total_count"] == 0
        assert summary["unique_namespaces"] == 0
        assert summary["namespaces"] == []