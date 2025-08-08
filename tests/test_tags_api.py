"""
Unit tests for Tags API endpoints
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.models.schemas import ImageInfo, TagResponse
from backend.services.registry import (
    RegistryNotFoundError, RegistryAuthError, RegistryConnectionError,
    RegistryTimeoutError, RegistryRateLimitError, RegistryServerError,
    RegistryPermissionError
)
from backend.api.tags import (
    format_file_size, format_relative_time, convert_image_info_to_tag_response,
    get_registry_client
)


class TestTagsAPI:
    """Test cases for tag listing and search/sort functionality"""

    @pytest.fixture
    def client(self):
        """Test client fixture"""
        return TestClient(app)

    @pytest.fixture
    def sample_tags(self):
        """Sample tag data for testing"""
        base_time = datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        
        return [
            ImageInfo(
                repository="nginx",
                tag="latest",
                digest="sha256:abc123",
                size=100*1024*1024,  # 100MB
                created=base_time,
                architecture="amd64",
                os="linux",
                pull_command="docker pull nginx:latest"
            ),
            ImageInfo(
                repository="nginx",
                tag="alpine",
                digest="sha256:def456",
                size=50*1024*1024,  # 50MB
                created=base_time.replace(day=2),
                architecture="amd64", 
                os="linux",
                pull_command="docker pull nginx:alpine"
            ),
            ImageInfo(
                repository="nginx",
                tag="1.21",
                digest="sha256:ghi789",
                size=120*1024*1024,  # 120MB
                created=base_time.replace(day=3),
                architecture="amd64",
                os="linux", 
                pull_command="docker pull nginx:1.21"
            ),
            ImageInfo(
                repository="nginx",
                tag="1.20-alpine",
                digest="sha256:jkl012",
                size=45*1024*1024,  # 45MB
                created=base_time.replace(day=4),
                architecture="amd64",
                os="linux",
                pull_command="docker pull nginx:1.20-alpine"
            )
        ]

    @patch('backend.api.tags.get_registry_client')
    def test_get_repository_tags_basic(self, mock_registry_client, client, sample_tags):
        """Test basic tag listing without filters"""
        # Mock registry client
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Make request
        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "tags" in data
        assert "page" in data
        assert "total_count" in data
        assert len(data["tags"]) == 4
        
        # Verify tags are returned (default sort by tag name ascending)
        tag_names = [tag["tag"] for tag in data["tags"]]
        assert tag_names == ["1.20-alpine", "1.21", "alpine", "latest"]

    @patch('backend.api.tags.get_registry_client')
    def test_tag_search_functionality(self, mock_registry_client, client, sample_tags):
        """Test tag search filtering"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test search for "alpine" tags
        response = client.get("/api/repositories/nginx/tags?search=alpine")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should only return tags containing "alpine"
        assert len(data["tags"]) == 2
        tag_names = [tag["tag"] for tag in data["tags"]]
        assert "alpine" in tag_names
        assert "1.20-alpine" in tag_names

    @patch('backend.api.tags.get_registry_client')
    def test_tag_search_case_insensitive(self, mock_registry_client, client, sample_tags):
        """Test case-insensitive search"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test case-insensitive search
        response = client.get("/api/repositories/nginx/tags?search=ALPINE")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return same results as lowercase search
        assert len(data["tags"]) == 2
        tag_names = [tag["tag"] for tag in data["tags"]]
        assert "alpine" in tag_names
        assert "1.20-alpine" in tag_names

    @patch('backend.api.tags.get_registry_client')
    def test_tag_search_no_results(self, mock_registry_client, client, sample_tags):
        """Test search with no matching results"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Search for non-existent tag
        response = client.get("/api/repositories/nginx/tags?search=nonexistent")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return empty results
        assert len(data["tags"]) == 0
        assert data["total_count"] == 0

    @patch('backend.api.tags.get_registry_client')
    def test_sort_by_tag_name(self, mock_registry_client, client, sample_tags):
        """Test sorting by tag name"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test ascending sort (default)
        response = client.get("/api/repositories/nginx/tags?sort_by=tag&sort_order=asc")
        
        assert response.status_code == 200
        data = response.json()
        
        tag_names = [tag["tag"] for tag in data["tags"]]
        assert tag_names == sorted(tag_names)

        # Test descending sort
        response = client.get("/api/repositories/nginx/tags?sort_by=tag&sort_order=desc")
        
        assert response.status_code == 200
        data = response.json()
        
        tag_names = [tag["tag"] for tag in data["tags"]]
        assert tag_names == sorted(tag_names, reverse=True)

    @patch('backend.api.tags.get_registry_client')
    def test_sort_by_created_date(self, mock_registry_client, client, sample_tags):
        """Test sorting by creation date"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test ascending sort by creation date
        response = client.get("/api/repositories/nginx/tags?sort_by=created&sort_order=asc")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be ordered by creation date (oldest first)
        tag_names = [tag["tag"] for tag in data["tags"]]
        assert tag_names == ["latest", "alpine", "1.21", "1.20-alpine"]

        # Test descending sort by creation date  
        response = client.get("/api/repositories/nginx/tags?sort_by=created&sort_order=desc")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be ordered by creation date (newest first)
        tag_names = [tag["tag"] for tag in data["tags"]]
        assert tag_names == ["1.20-alpine", "1.21", "alpine", "latest"]

    @patch('backend.api.tags.get_registry_client')
    def test_sort_by_size(self, mock_registry_client, client, sample_tags):
        """Test sorting by image size"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test ascending sort by size
        response = client.get("/api/repositories/nginx/tags?sort_by=size&sort_order=asc")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be ordered by size (smallest first)
        sizes = [tag["size"] for tag in data["tags"]]
        assert sizes == sorted(sizes)

        # Test descending sort by size
        response = client.get("/api/repositories/nginx/tags?sort_by=size&sort_order=desc")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be ordered by size (largest first)
        sizes = [tag["size"] for tag in data["tags"]]
        assert sizes == sorted(sizes, reverse=True)

    @patch('backend.api.tags.get_registry_client')
    def test_pagination_functionality(self, mock_registry_client, client, sample_tags):
        """Test pagination with search and sort"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test first page with page_size=2
        response = client.get("/api/repositories/nginx/tags?page=1&page_size=2")
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["tags"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total_count"] == 4
        assert data["total_pages"] == 2
        assert data["has_next"] is True
        assert data["has_prev"] is False

        # Test second page
        response = client.get("/api/repositories/nginx/tags?page=2&page_size=2")
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["tags"]) == 2
        assert data["page"] == 2
        assert data["has_next"] is False
        assert data["has_prev"] is True

    @patch('backend.api.tags.get_registry_client') 
    def test_search_and_sort_combined(self, mock_registry_client, client, sample_tags):
        """Test combining search and sort functionality"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Search for "alpine" and sort by size descending
        response = client.get("/api/repositories/nginx/tags?search=alpine&sort_by=size&sort_order=desc")
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["tags"]) == 2
        # Should return alpine tags sorted by size (largest first)
        tag_names = [tag["tag"] for tag in data["tags"]]
        sizes = [tag["size"] for tag in data["tags"]]
        
        # Both contain "alpine"
        assert all("alpine" in name.lower() for name in tag_names)
        # Should be sorted by size descending
        assert sizes == sorted(sizes, reverse=True)

    @patch('backend.api.tags.get_registry_client')
    def test_invalid_sort_field(self, mock_registry_client, client, sample_tags):
        """Test validation of invalid sort field"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test invalid sort field
        response = client.get("/api/repositories/nginx/tags?sort_by=invalid_field")
        
        assert response.status_code == 400
        assert "Invalid sort_by field" in response.json()["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_invalid_sort_order(self, mock_registry_client, client, sample_tags):
        """Test validation of invalid sort order"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = sample_tags
        mock_registry_client.return_value = mock_client

        # Test invalid sort order
        response = client.get("/api/repositories/nginx/tags?sort_order=invalid_order")
        
        assert response.status_code == 400
        assert "Invalid sort_order" in response.json()["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_repository_not_found(self, mock_registry_client, client):
        """Test handling of non-existent repository"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryNotFoundError("Repository not found")
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nonexistent/tags")
        
        assert response.status_code == 404
        assert "Repository not found" in response.json()["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_registry_connection_error(self, mock_registry_client, client):
        """Test handling of registry connection errors"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryConnectionError("Connection failed")
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 503
        assert "Connection failed" in response.json()["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_registry_auth_error(self, mock_registry_client, client):
        """Test handling of authentication errors"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryAuthError("Authentication failed")
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 401
        assert "Authentication failed" in response.json()["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_repository_name_with_slashes(self, mock_registry_client, client, sample_tags):
        """Test handling repository names with slashes (namespaces)"""
        # Update sample tags for namespaced repository
        namespaced_tags = []
        for tag in sample_tags:
            tag.repository = "mycompany/myapp"
            tag.pull_command = f"docker pull registry.example.com/mycompany/myapp:{tag.tag}"
            namespaced_tags.append(tag)
        
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = namespaced_tags
        mock_registry_client.return_value = mock_client

        # Test with namespaced repository name
        response = client.get("/api/repositories/mycompany/myapp/tags")
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["tags"]) == 4
        # Verify all tags belong to the namespaced repository
        for tag in data["tags"]:
            assert tag["repository"] == "mycompany/myapp"
            assert "mycompany/myapp" in tag["pull_command"]


class TestTagSearchRequest:
    """Test cases for SearchRequest model functionality"""

    def test_search_request_matches_basic(self):
        """Test basic string matching in SearchRequest"""
        from backend.models.schemas import SearchRequest
        
        search = SearchRequest(search="alpine")
        
        assert search.matches("nginx:alpine") is True
        assert search.matches("alpine-linux") is True
        assert search.matches("ubuntu") is False

    def test_search_request_case_insensitive(self):
        """Test case insensitive matching"""
        from backend.models.schemas import SearchRequest
        
        search = SearchRequest(search="ALPINE")
        
        assert search.matches("nginx:alpine") is True
        assert search.matches("Alpine-Linux") is True
        assert search.matches("ALPINE") is True

    def test_search_request_empty_search(self):
        """Test behavior with empty search term"""
        from backend.models.schemas import SearchRequest
        
        search = SearchRequest(search=None)
        
        # Should match everything when search is None/empty
        assert search.matches("anything") is True
        assert search.matches("") is True

    def test_search_request_empty_string(self):
        """Test behavior with empty string search"""
        from backend.models.schemas import SearchRequest
        
        search = SearchRequest(search="")
        
        # Empty string should match everything
        assert search.matches("anything") is True


class TestSortRequest:
    """Test cases for SortRequest model functionality"""

    def test_sort_request_valid_fields(self):
        """Test sort field validation with valid fields"""
        from backend.models.schemas import SortRequest
        
        sort = SortRequest(sort_by="tag")
        
        # Should not raise exception for valid field
        try:
            sort.validate_sort_field(["tag", "created", "size"])
        except ValueError:
            pytest.fail("validate_sort_field raised ValueError unexpectedly")

    def test_sort_request_invalid_fields(self):
        """Test sort field validation with invalid fields"""
        from backend.models.schemas import SortRequest
        
        sort = SortRequest(sort_by="invalid_field")
        
        # Should raise ValueError for invalid field
        with pytest.raises(ValueError, match="Invalid sort_by field"):
            sort.validate_sort_field(["tag", "created", "size"])

    def test_sort_request_valid_orders(self):
        """Test sort order validation with valid orders"""
        from backend.models.schemas import SortRequest
        
        for order in ["asc", "desc"]:
            sort = SortRequest(sort_order=order)
            
            # Should not raise exception for valid order
            try:
                sort.validate_sort_order()
            except ValueError:
                pytest.fail("validate_sort_order raised ValueError unexpectedly")

    def test_sort_request_invalid_orders(self):
        """Test sort order validation with invalid orders"""
        from backend.models.schemas import SortRequest
        
        sort = SortRequest(sort_order="invalid_order")
        
        # Should raise ValueError for invalid order
        with pytest.raises(ValueError, match="Invalid sort_order"):
            sort.validate_sort_order()

    def test_sort_request_is_descending(self):
        """Test is_descending property"""
        from backend.models.schemas import SortRequest
        
        asc_sort = SortRequest(sort_order="asc")
        desc_sort = SortRequest(sort_order="desc")
        
        assert asc_sort.is_descending is False
        assert desc_sort.is_descending is True


class TestTagResponseFormatting:
    """Test cases for TagResponse formatting and helper functions"""

    def test_format_file_size(self):
        """Test file size formatting function"""
        test_cases = [
            (0, "0 B"),
            (512, "512 B"),
            (1024, "1.00 KB"),
            (1536, "1.50 KB"),
            (1048576, "1.00 MB"),
            (104857600, "100 MB"),
            (1073741824, "1.00 GB"),
            (5368709120, "5.00 GB")
        ]
        
        for size_bytes, expected in test_cases:
            result = format_file_size(size_bytes)
            assert result == expected, f"Expected {expected}, got {result} for {size_bytes} bytes"

    def test_format_relative_time(self):
        """Test relative time formatting function"""
        from datetime import timedelta
        
        now = datetime.now(timezone.utc)
        
        test_cases = [
            (None, None),
            (now - timedelta(seconds=30), "just now"),
            (now - timedelta(minutes=5), "5 minutes ago"),
            (now - timedelta(minutes=1), "1 minute ago"),
            (now - timedelta(hours=2), "2 hours ago"),
            (now - timedelta(hours=1), "1 hour ago"),
            (now - timedelta(days=3), "3 days ago"),
            (now - timedelta(days=1), "1 day ago"),
        ]
        
        for dt, expected in test_cases:
            result = format_relative_time(dt)
            assert result == expected, f"Expected {expected}, got {result}"

    def test_convert_image_info_to_tag_response(self):
        """Test conversion from ImageInfo to TagResponse"""
        # Create sample ImageInfo
        created_time = datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        image_info = ImageInfo(
            repository="nginx",
            tag="latest",
            digest="sha256:abc123def456789012345678901234567890123456789012345678901234",
            size=104857600,  # 100 MB
            created=created_time,
            architecture="amd64",
            os="linux",
            pull_command="docker pull nginx:latest"
        )
        
        # Convert to TagResponse
        tag_response = convert_image_info_to_tag_response(image_info)
        
        # Verify conversion
        assert isinstance(tag_response, TagResponse)
        assert tag_response.repository == "nginx"
        assert tag_response.tag == "latest"
        assert tag_response.digest == "sha256:abc123def456789012345678901234567890123456789012345678901234"
        assert tag_response.size_bytes == 104857600
        assert tag_response.size_formatted == "100 MB"
        assert tag_response.created == created_time
        assert tag_response.created_formatted is not None  # Should be a relative time string
        assert tag_response.architecture == "amd64"
        assert tag_response.os == "linux"
        assert tag_response.pull_command == "docker pull nginx:latest"

    def test_tag_response_model_validation(self):
        """Test TagResponse model validation"""
        # Test valid TagResponse creation
        tag_response = TagResponse(
            repository="nginx",
            tag="latest",
            digest="sha256:abc123def456789012345678901234567890123456789012345678901234",
            size_bytes=104857600,
            size_formatted="100 MB",
            created=datetime.now(timezone.utc),
            created_formatted="2 days ago",
            architecture="amd64",
            os="linux",
            pull_command="docker pull nginx:latest"
        )
        
        assert tag_response.repository == "nginx"
        assert tag_response.tag == "latest"
        assert tag_response.size_bytes == 104857600
        assert tag_response.size_formatted == "100 MB"

    def test_tag_response_model_validation_errors(self):
        """Test TagResponse model validation with invalid data"""
        # Test invalid digest (too short)
        with pytest.raises(ValueError):
            TagResponse(
                repository="nginx",
                tag="latest",
                digest="sha256:short",  # Too short
                size_bytes=104857600,
                size_formatted="100 MB",
                pull_command="docker pull nginx:latest"
            )
        
        # Test negative size
        with pytest.raises(ValueError):
            TagResponse(
                repository="nginx", 
                tag="latest",
                digest="sha256:abc123def456789012345678901234567890123456789012345678901234",
                size_bytes=-1,  # Negative size
                size_formatted="100 MB",
                pull_command="docker pull nginx:latest"
            )

    def test_convert_with_none_created_date(self):
        """Test conversion when created date is None"""
        image_info = ImageInfo(
            repository="nginx",
            tag="latest", 
            digest="sha256:abc123def456789012345678901234567890123456789012345678901234",
            size=104857600,
            created=None,  # None created date
            architecture="amd64",
            os="linux",
            pull_command="docker pull nginx:latest"
        )
        
        tag_response = convert_image_info_to_tag_response(image_info)
        
        assert tag_response.created is None
        assert tag_response.created_formatted is None

    def test_convert_with_naive_datetime(self):
        """Test conversion with timezone-naive datetime"""
        # Create naive datetime (no timezone)
        naive_time = datetime(2023, 1, 1, 12, 0, 0)
        
        image_info = ImageInfo(
            repository="nginx",
            tag="latest",
            digest="sha256:abc123def456789012345678901234567890123456789012345678901234",
            size=104857600,
            created=naive_time,
            architecture="amd64", 
            os="linux",
            pull_command="docker pull nginx:latest"
        )
        
        tag_response = convert_image_info_to_tag_response(image_info)
        
        # Should handle naive datetime gracefully
        assert tag_response.created == naive_time
        assert tag_response.created_formatted is not None


class TestTagsAPIErrorHandling:
    """Test cases for error handling in Tags API endpoints"""

    def test_repository_not_found_error(self, api_test_client):
        """Test handling of RegistryNotFoundError (repository not found)"""
        # Mock the registry client
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryNotFoundError(
            "Repository 'nonexistent/repo' not found"
        )
        
        # Override dependency
        app.dependency_overrides[get_registry_client] = lambda: mock_client

        try:
            response = api_test_client.get("/api/repositories/nonexistent/repo/tags")
            
            assert response.status_code == 404
            data = response.json()
            assert "not found in registry" in data["detail"]
            assert "nonexistent/repo" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_tag_not_found_error(self, api_test_client):
        """Test handling of RegistryNotFoundError (tag not found)"""
        # Mock the registry client for tag details endpoint
        mock_client = AsyncMock()
        mock_client.get_detailed_image_info.side_effect = RegistryNotFoundError(
            "Tag 'nonexistent' not found in repository 'nginx'"
        )
        
        # Override dependency
        app.dependency_overrides[get_registry_client] = lambda: mock_client

        try:
            response = api_test_client.get("/api/repositories/nginx/tags/nonexistent")
            
            assert response.status_code == 404
            data = response.json()
            assert "Tag 'nonexistent' not found" in data["detail"]
            assert "repository 'nginx'" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_registry_auth_error(self, api_test_client):
        """Test handling of RegistryAuthError"""
        # Mock the registry client
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryAuthError(
            "Authentication failed - invalid credentials"
        )
        
        # Override dependency
        app.dependency_overrides[get_registry_client] = lambda: mock_client

        try:
            response = api_test_client.get("/api/repositories/nginx/tags")
            
            assert response.status_code == 401
            data = response.json()
            assert "Authentication failed" in data["detail"]
        finally:
            app.dependency_overrides.clear()

    @patch('backend.api.tags.get_registry_client')
    def test_registry_permission_error(self, mock_registry_client, client):
        """Test handling of RegistryPermissionError"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryPermissionError(
            "Access denied to private repository"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/private/repo/tags")
        
        assert response.status_code == 403
        data = response.json()
        assert "Access denied" in data["detail"]
        assert "private/repo" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_registry_connection_error(self, mock_registry_client, client):
        """Test handling of RegistryConnectionError"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryConnectionError(
            "Connection refused - registry unavailable"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 503
        data = response.json()
        assert "Unable to connect to registry" in data["detail"]
        assert "try again later" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_registry_timeout_error(self, mock_registry_client, client):
        """Test handling of RegistryTimeoutError"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryTimeoutError(
            "Request timeout - registry took too long to respond"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 504
        data = response.json()
        assert "Request timeout" in data["detail"]
        assert "slow or overloaded" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_registry_rate_limit_error(self, mock_registry_client, client):
        """Test handling of RegistryRateLimitError"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryRateLimitError(
            "Rate limit exceeded - too many requests"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 429
        data = response.json()
        assert "Rate limit exceeded" in data["detail"]
        assert "wait before making additional requests" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_registry_server_error(self, mock_registry_client, client):
        """Test handling of RegistryServerError"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = RegistryServerError(
            "Internal server error in registry"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 502
        data = response.json()
        assert "Registry server error" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_invalid_repository_name_error(self, mock_registry_client, client):
        """Test handling of invalid repository name (ValueError)"""
        # This test simulates validation errors that result in ValueError
        mock_client = AsyncMock()
        mock_registry_client.return_value = mock_client

        # Test with clearly invalid characters that should trigger validation
        response = client.get("/api/repositories/invalid<>characters/tags")
        
        assert response.status_code == 400
        data = response.json()
        assert "Invalid repository name" in data["detail"] or "Bad Request" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_generic_exception_error(self, mock_registry_client, client):
        """Test handling of unexpected generic exceptions"""
        mock_client = AsyncMock()
        mock_client.get_repository_tags.side_effect = Exception(
            "Unexpected error occurred"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 500
        data = response.json()
        assert "Failed to retrieve tags" in data["detail"]
        assert "nginx" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_tag_details_connection_error(self, mock_registry_client, client):
        """Test connection error for tag details endpoint"""
        mock_client = AsyncMock()
        mock_client.get_detailed_image_info.side_effect = RegistryConnectionError(
            "Connection refused"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags/latest")
        
        assert response.status_code == 503
        data = response.json()
        assert "Unable to connect to registry" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_tag_details_timeout_error(self, mock_registry_client, client):
        """Test timeout error for tag details endpoint"""
        mock_client = AsyncMock()
        mock_client.get_detailed_image_info.side_effect = RegistryTimeoutError(
            "Request timeout"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags/latest")
        
        assert response.status_code == 504
        data = response.json()
        assert "Request timeout" in data["detail"]
        assert "latest" in data["detail"]
        assert "nginx" in data["detail"]

    @patch('backend.api.tags.get_registry_client')
    def test_tag_details_generic_error(self, mock_registry_client, client):
        """Test generic error for tag details endpoint"""
        mock_client = AsyncMock()
        mock_client.get_detailed_image_info.side_effect = Exception(
            "Unexpected error"
        )
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags/latest")
        
        assert response.status_code == 500
        data = response.json()
        assert "Failed to get details for tag" in data["detail"]
        assert "latest" in data["detail"]
        assert "nginx" in data["detail"]


class TestRepositoryNamePatterns:
    """Test cases for various repository name patterns and edge cases"""

    @pytest.fixture
    def client(self):
        """Test client fixture"""
        return TestClient(app)

    @pytest.fixture
    def sample_tag(self):
        """Sample tag for pattern testing"""
        return ImageInfo(
            repository="test/repo",
            tag="latest",
            digest="sha256:abc123def456789012345678901234567890123456789012345678901234",
            size=104857600,
            created=datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
            architecture="amd64",
            os="linux",
            pull_command="docker pull test/repo:latest"
        )

    @patch('backend.api.tags.get_registry_client')
    def test_simple_repository_name(self, mock_registry_client, client, sample_tag):
        """Test simple repository name without namespace"""
        sample_tag.repository = "nginx"
        sample_tag.pull_command = "docker pull nginx:latest"
        
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = [sample_tag]
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/nginx/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tags"]) == 1
        assert data["tags"][0]["repository"] == "nginx"

    @patch('backend.api.tags.get_registry_client')
    def test_namespaced_repository_name(self, mock_registry_client, client, sample_tag):
        """Test namespaced repository name (user/repo)"""
        sample_tag.repository = "myuser/myapp"
        sample_tag.pull_command = "docker pull myuser/myapp:latest"
        
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = [sample_tag]
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/myuser/myapp/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tags"]) == 1
        assert data["tags"][0]["repository"] == "myuser/myapp"

    @patch('backend.api.tags.get_registry_client')
    def test_deep_nested_repository_name(self, mock_registry_client, client, sample_tag):
        """Test deeply nested repository name (org/team/project)"""
        sample_tag.repository = "myorg/myteam/myproject"
        sample_tag.pull_command = "docker pull myorg/myteam/myproject:latest"
        
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = [sample_tag]
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/myorg/myteam/myproject/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tags"]) == 1
        assert data["tags"][0]["repository"] == "myorg/myteam/myproject"

    @patch('backend.api.tags.get_registry_client')
    def test_library_repository_name(self, mock_registry_client, client, sample_tag):
        """Test library repository name (Docker Hub official images)"""
        sample_tag.repository = "library/ubuntu"
        sample_tag.pull_command = "docker pull ubuntu:latest"  # Note: library prefix removed
        
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = [sample_tag]
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/library/ubuntu/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tags"]) == 1
        assert data["tags"][0]["repository"] == "library/ubuntu"

    @patch('backend.api.tags.get_registry_client')
    def test_repository_with_numbers_and_hyphens(self, mock_registry_client, client, sample_tag):
        """Test repository names with numbers, hyphens, and underscores"""
        sample_tag.repository = "my-org_123/my-app_v2-test"
        sample_tag.pull_command = "docker pull my-org_123/my-app_v2-test:latest"
        
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = [sample_tag]
        mock_registry_client.return_value = mock_client

        response = client.get("/api/repositories/my-org_123/my-app_v2-test/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tags"]) == 1
        assert data["tags"][0]["repository"] == "my-org_123/my-app_v2-test"

    @patch('backend.api.tags.get_registry_client')
    def test_url_encoded_repository_name(self, mock_registry_client, client, sample_tag):
        """Test URL-encoded characters in repository names"""
        sample_tag.repository = "myorg/my.app"
        sample_tag.pull_command = "docker pull myorg/my.app:latest"
        
        mock_client = AsyncMock()
        mock_client.get_repository_tags.return_value = [sample_tag]
        mock_registry_client.return_value = mock_client

        # Test with URL-encoded period (%2E)
        response = client.get("/api/repositories/myorg/my%2Eapp/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tags"]) == 1

    def test_empty_repository_name(self, client):
        """Test empty repository name handling"""
        response = client.get("/api/repositories//tags")
        
        # Should return 404 as empty repository name is invalid
        assert response.status_code == 404

    def test_repository_name_with_trailing_slash(self, client):
        """Test repository name with trailing slash"""
        response = client.get("/api/repositories/nginx//tags")
        
        # Should handle the double slash gracefully
        # The exact behavior depends on FastAPI path handling
        assert response.status_code in [400, 404, 422]