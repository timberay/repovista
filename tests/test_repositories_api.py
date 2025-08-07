"""
Test cases for repository API endpoints
"""
import pytest
import json
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from fastapi import status

from backend.main import app
from backend.services.registry import RegistryClient, RegistryException
from backend.services.repository_service import RepositoryService
from backend.models.schemas import (
    RepositoryInfo, PaginationResponse, 
    PaginationRequest, SearchRequest, SortRequest
)


@pytest.fixture
def client():
    """Test client fixture"""
    return TestClient(app)


@pytest.fixture
def mock_registry_client():
    """Mock registry client"""
    client = Mock(spec=RegistryClient)
    client.list_repositories = AsyncMock()
    client.get_repository_info = AsyncMock()
    return client


@pytest.fixture
def mock_repository_service():
    """Mock repository service"""
    service = Mock(spec=RepositoryService)
    service.search_and_list_repositories = AsyncMock()
    service.get_search_suggestions = AsyncMock()
    service.get_available_sort_fields = Mock()
    service.get_repository_stats = AsyncMock()
    return service


@pytest.fixture
def sample_repository_data():
    """Sample repository data for testing"""
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
def sample_pagination_response():
    """Sample pagination response"""
    return PaginationResponse(
        page=1,
        page_size=20,
        total_count=3,
        total_pages=1,
        has_next=False,
        has_prev=False,
        next_page=None,
        prev_page=None
    )


class TestListRepositoriesEndpoint:
    """Test cases for GET /api/repositories/ endpoint"""
    
    def test_list_repositories_success(self, sample_repository_data, sample_pagination_response):
        """Test successful repository listing"""
        # Create mock repository service
        mock_service = Mock()
        mock_service.search_and_list_repositories = AsyncMock(
            return_value=(sample_repository_data, sample_pagination_response)
        )
        
        # Override the dependency
        from backend.api.repositories import get_repository_service
        app.dependency_overrides[get_repository_service] = lambda: mock_service
        
        try:
            client = TestClient(app)
            response = client.get("/api/repositories/")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert "repositories" in data
            assert "pagination" in data
            assert len(data["repositories"]) == 3
            
            # Check first repository
            repo1 = data["repositories"][0]
            assert repo1["name"] == "nginx"
            assert repo1["tag_count"] == 15
            assert repo1["last_updated"] is not None
            assert repo1["size_bytes"] == 142857600
        finally:
            # Clean up the override
            app.dependency_overrides.clear()
            
    def test_list_repositories_with_search(self, client, sample_repository_data, sample_pagination_response):
        """Test repository listing with search parameter"""
        filtered_data = [repo for repo in sample_repository_data if "nginx" in repo["name"]]
        
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                return_value=(filtered_data, sample_pagination_response)
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/?search=nginx")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert len(data["repositories"]) == 1
            assert data["repositories"][0]["name"] == "nginx"
            
            # Verify service was called with correct search request
            mock_service.search_and_list_repositories.assert_called_once()
            call_args = mock_service.search_and_list_repositories.call_args
            search_req = call_args.kwargs["search_req"]
            assert search_req.search == "nginx"
            
    def test_list_repositories_with_sorting(self, client, sample_repository_data, sample_pagination_response):
        """Test repository listing with sorting parameters"""
        # Sort by tag_count descending
        sorted_data = sorted(sample_repository_data, key=lambda x: x["tag_count"], reverse=True)
        
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                return_value=(sorted_data, sample_pagination_response)
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/?sort_by=tag_count&sort_order=desc")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            # Should be sorted by tag_count descending
            assert data["repositories"][0]["name"] == "nginx"  # 15 tags
            assert data["repositories"][1]["name"] == "library/postgres"  # 12 tags
            assert data["repositories"][2]["name"] == "ubuntu"  # 8 tags
            
            # Verify service was called with correct sort request
            call_args = mock_service.search_and_list_repositories.call_args
            sort_req = call_args.kwargs["sort_req"]
            assert sort_req.sort_by == "tag_count"
            assert sort_req.sort_order == "desc"
            
    def test_list_repositories_with_pagination(self, client, sample_repository_data):
        """Test repository listing with pagination parameters"""
        paginated_response = PaginationResponse(
            page=2,
            page_size=2,
            total_count=3,
            total_pages=2,
            has_next=False,
            has_prev=True,
            next_page=None,
            prev_page=1
        )
        
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                return_value=(sample_repository_data[:1], paginated_response)  # Only 1 item on page 2
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/?page=2&page_size=2")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert len(data["repositories"]) == 1
            assert data["pagination"]["page"] == 2
            assert data["pagination"]["page_size"] == 2
            assert data["pagination"]["has_prev"] == True
            assert data["pagination"]["has_next"] == False
            
    def test_list_repositories_with_metadata(self, client, sample_repository_data, sample_pagination_response):
        """Test repository listing with metadata inclusion"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                return_value=(sample_repository_data, sample_pagination_response)
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/?include_metadata=true")
            
            assert response.status_code == status.HTTP_200_OK
            
            # Verify service was called with metadata flag
            call_args = mock_service.search_and_list_repositories.call_args
            assert call_args.kwargs["include_metadata"] == True
            
    def test_list_repositories_invalid_pagination(self, client):
        """Test repository listing with invalid pagination parameters"""
        response = client.get("/api/repositories/?page=0")  # Invalid page
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        response = client.get("/api/repositories/?page_size=0")  # Invalid page_size
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        response = client.get("/api/repositories/?page_size=101")  # Too large page_size
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
    def test_list_repositories_registry_exception(self, client):
        """Test repository listing with registry exception"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                side_effect=RegistryException("Registry unavailable")
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/")
            
            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
            data = response.json()
            assert "error" in data["detail"]
            assert "message" in data["detail"]


class TestSearchSuggestionsEndpoint:
    """Test cases for GET /api/repositories/search/suggestions endpoint"""
    
    def test_get_search_suggestions_success(self, client):
        """Test successful search suggestions"""
        suggestions = [
            {"name": "nginx", "match_score": 1.0, "match_type": "exact"},
            {"name": "nginx-proxy", "match_score": 0.8, "match_type": "prefix"}
        ]
        
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.get_search_suggestions = AsyncMock(return_value=suggestions)
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/search/suggestions?q=nginx")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert len(data) == 2
            assert data[0]["name"] == "nginx"
            assert data[0]["match_score"] == 1.0
            
            mock_service.get_search_suggestions.assert_called_once_with("nginx", 5)
            
    def test_get_search_suggestions_with_max_results(self, client):
        """Test search suggestions with custom max_results"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.get_search_suggestions = AsyncMock(return_value=[])
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/search/suggestions?q=test&max_results=10")
            
            assert response.status_code == status.HTTP_200_OK
            
            mock_service.get_search_suggestions.assert_called_once_with("test", 10)
            
    def test_get_search_suggestions_empty_query(self, client):
        """Test search suggestions with empty query"""
        response = client.get("/api/repositories/search/suggestions?q=")
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
    def test_get_search_suggestions_missing_query(self, client):
        """Test search suggestions without query parameter"""
        response = client.get("/api/repositories/search/suggestions")
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestSortFieldsEndpoint:
    """Test cases for GET /api/repositories/sort/fields endpoint"""
    
    def test_get_sort_fields_success(self, client):
        """Test successful sort fields retrieval"""
        available_fields = ["name", "tag_count", "last_updated"]
        
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.get_available_sort_fields = Mock(return_value=available_fields)
            mock_service_dep.return_value = mock_service
            
            with patch("backend.api.repositories.get_sort_field_info") as mock_field_info:
                mock_field_info.return_value = {
                    "name": {"description": "Repository name", "type": "string"},
                    "tag_count": {"description": "Number of tags", "type": "integer"},
                    "last_updated": {"description": "Last update time", "type": "datetime"}
                }
                
                response = client.get("/api/repositories/sort/fields")
                
                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                
                assert "available_fields" in data
                assert "field_info" in data
                assert "default_field" in data
                assert "default_order" in data
                
                assert len(data["available_fields"]) == 3
                assert "name" in data["available_fields"]
                assert data["default_field"] == "name"
                assert data["default_order"] == "asc"
                
    def test_get_sort_fields_with_metadata(self, client):
        """Test sort fields with metadata inclusion"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.get_available_sort_fields = Mock(return_value=["name", "tag_count"])
            mock_service_dep.return_value = mock_service
            
            with patch("backend.api.repositories.get_sort_field_info") as mock_field_info:
                mock_field_info.return_value = {}
                
                response = client.get("/api/repositories/sort/fields?include_metadata=true")
                
                assert response.status_code == status.HTTP_200_OK
                
                mock_service.get_available_sort_fields.assert_called_once_with(True)


class TestRepositoryStatsEndpoint:
    """Test cases for GET /api/repositories/stats endpoint"""
    
    def test_get_repository_stats_success(self, client):
        """Test successful repository stats retrieval"""
        stats = {
            "total_repositories": 42,
            "total_tags": 158,
            "average_tags_per_repo": 3.76,
            "largest_repository": {"name": "ubuntu", "size_bytes": 267534336},
            "most_recent_update": "2023-12-02T14:15:00Z",
            "search_stats": {
                "total_searches": 125,
                "popular_terms": ["nginx", "postgres", "ubuntu"]
            }
        }
        
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.get_repository_stats = AsyncMock(return_value=stats)
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/stats")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert data["total_repositories"] == 42
            assert data["total_tags"] == 158
            assert "search_stats" in data
            assert len(data["search_stats"]["popular_terms"]) == 3


class TestGetRepositoryEndpoint:
    """Test cases for GET /api/repositories/{repository} endpoint"""
    
    def test_get_repository_success(self, client):
        """Test successful repository retrieval"""
        repo_info = RepositoryInfo(
            name="nginx",
            tag_count=15,
            last_updated=datetime(2023, 12, 1, 12, 0, 0, tzinfo=timezone.utc),
            size_bytes=142857600
        )
        
        with patch("backend.api.repositories.get_registry_client") as mock_client_dep:
            mock_client = Mock()
            mock_client.get_repository_info = AsyncMock(return_value=repo_info)
            mock_client_dep.return_value = mock_client
            
            response = client.get("/api/repositories/nginx")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert data["name"] == "nginx"
            assert data["tag_count"] == 15
            assert data["size_bytes"] == 142857600
            assert data["last_updated"] is not None
            
    def test_get_repository_with_namespace(self, client):
        """Test repository retrieval with namespace"""
        repo_info = RepositoryInfo(
            name="library/postgres",
            tag_count=12,
            last_updated=datetime(2023, 12, 2, 14, 15, 0, tzinfo=timezone.utc),
            size_bytes=267534336
        )
        
        with patch("backend.api.repositories.get_registry_client") as mock_client_dep:
            mock_client = Mock()
            mock_client.get_repository_info = AsyncMock(return_value=repo_info)
            mock_client_dep.return_value = mock_client
            
            response = client.get("/api/repositories/library/postgres")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert data["name"] == "library/postgres"
            
    def test_get_repository_not_found(self, client):
        """Test repository retrieval for non-existent repository"""
        from backend.services.registry import RegistryNotFoundError
        
        with patch("backend.api.repositories.get_registry_client") as mock_client_dep:
            mock_client = Mock()
            mock_client.get_repository_info = AsyncMock(
                side_effect=RegistryNotFoundError("Repository not found")
            )
            mock_client_dep.return_value = mock_client
            
            response = client.get("/api/repositories/nonexistent")
            
            assert response.status_code == status.HTTP_404_NOT_FOUND
            data = response.json()
            assert "error" in data["detail"]
            assert "message" in data["detail"]
            
    def test_get_repository_auth_error(self, client):
        """Test repository retrieval with authentication error"""
        from backend.services.registry import RegistryAuthError
        
        with patch("backend.api.repositories.get_registry_client") as mock_client_dep:
            mock_client = Mock()
            mock_client.get_repository_info = AsyncMock(
                side_effect=RegistryAuthError("Authentication required")
            )
            mock_client_dep.return_value = mock_client
            
            response = client.get("/api/repositories/private-repo")
            
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            data = response.json()
            assert "error" in data["detail"]
            assert "Authentication required" in data["detail"]["message"]


class TestErrorHandling:
    """Test cases for error handling across all endpoints"""
    
    def test_unexpected_error_handling(self, client):
        """Test handling of unexpected errors"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                side_effect=Exception("Unexpected error")
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/")
            
            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
            data = response.json()
            assert data["detail"]["error"] == "InternalServerError"
            assert "An unexpected error occurred" in data["detail"]["message"]
            
    def test_registry_auth_error_mapping(self, client):
        """Test registry authentication error mapping"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                side_effect=RegistryException("Authentication failed")
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/")
            
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            
    def test_registry_permission_error_mapping(self, client):
        """Test registry permission error mapping"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                side_effect=RegistryException("Permission denied")
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/")
            
            assert response.status_code == status.HTTP_403_FORBIDDEN
            
    def test_registry_unavailable_error_mapping(self, client):
        """Test registry unavailable error mapping"""
        with patch("backend.api.repositories.get_repository_service") as mock_service_dep:
            mock_service = Mock()
            mock_service.search_and_list_repositories = AsyncMock(
                side_effect=RegistryException("Registry unavailable")
            )
            mock_service_dep.return_value = mock_service
            
            response = client.get("/api/repositories/")
            
            assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


class TestOpenAPIDocumentation:
    """Test cases to verify OpenAPI documentation generation"""
    
    def test_openapi_schema_generation(self, client):
        """Test that OpenAPI schema is properly generated"""
        response = client.get("/openapi.json")
        assert response.status_code == status.HTTP_200_OK
        
        schema = response.json()
        assert "paths" in schema
        assert "/api/repositories/" in schema["paths"]
        assert "get" in schema["paths"]["/api/repositories/"]
        
    def test_swagger_docs_accessible(self, client):
        """Test that Swagger documentation is accessible"""
        response = client.get("/api/docs")
        assert response.status_code == status.HTTP_200_OK
        
    def test_redoc_accessible(self, client):
        """Test that ReDoc documentation is accessible"""
        response = client.get("/api/redoc")
        assert response.status_code == status.HTTP_200_OK