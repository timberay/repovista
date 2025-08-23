# Docker Registry Client Design

## Overview

The `RegistryClient` class provides a comprehensive interface to Docker Registry v2 API with robust error handling, authentication, and caching capabilities.

## Architecture

### Current Implementation

```python
Services Architecture
├── RegistryClient (registry.py)
│   ├── Basic authentication
│   ├── HTTP client with retry logic
│   ├── Docker Registry v2 API integration
│   └── Implemented API methods
│       ├── list_repositories()
│       ├── list_tags()
│       ├── get_manifest()
│       └── get_blob_size()
├── MockRegistry (mock_registry.py)
│   ├── Development/testing mock data
│   ├── 50+ sample repositories
│   └── Realistic tag information
├── SQLiteCache (sqlite_cache.py)
│   ├── Persistent caching layer
│   ├── TTL-based expiration
│   └── Thread-safe operations
└── RepositoryService (repository_service.py)
    ├── Business logic layer
    ├── Cache integration
    └── Mock/real registry switching
```

### Key Design Decisions

1. **Async/Await Pattern**: All methods use async/await for non-blocking I/O operations
2. **Comprehensive Error Handling**: Custom exception hierarchy for different error types
3. **Authentication Flow**: Basic authentication with fallback support
4. **Retry Logic**: Exponential backoff with configurable retry attempts (implemented)
5. **SQLite Caching**: Persistent cache with TTL instead of in-memory (better for production)
6. **Mock Registry**: Built-in mock data provider for development and testing
7. **Type Safety**: Full Pydantic model integration for request/response validation
8. **Service Layer**: Repository service abstracts registry details from API layer

## Data Models

### Core Models

- `RegistryClient`: Main client class
- `AuthChallenge`: WWW-Authenticate header parsing
- `BearerToken`: Authentication token response
- `RegistryErrorResponse`: Error response wrapper

### API Response Models

- `RepositoryCatalog`: Repository listing response
- `TagsList`: Tag listing response  
- `ManifestV2`: Docker image manifest
- `ImageInfo`: Processed image metadata
- `RepositoryInfo`: Repository metadata
- `PaginationInfo`: Pagination state

### Exception Hierarchy

```text
RegistryException (base)
├── RegistryAuthError (401, authentication issues)
├── RegistryNotFoundError (404, missing resources)
├── RegistryConnectionError (network, server errors)
└── RegistryTimeoutError (request timeouts)
```

## Configuration

### Client Initialization

```python
client = RegistryClient(
    registry_url="https://registry.example.com",
    username="user",
    password="token", 
    timeout=30.0,
    max_retries=3,
    retry_delay=1.0,
    verify_ssl=True
)
```

### Authentication Methods

1. **Bearer Token**: Primary method using OAuth2-like flow
2. **Basic Auth**: Fallback for simple authentication
3. **Anonymous**: For public registries

### Retry Strategy (Implemented)

- **Max Retries**: Configurable (default: 3)
- **Backoff**: Exponential (1s, 2s, 4s delays)
- **Retry on**: Connection errors, timeouts, 5xx responses
- **Skip retry on**: Authentication errors (401), not found (404)

## Usage Patterns

### Basic Usage

```python
async with RegistryClient(registry_url, username, password) as client:
    # Client methods will be implemented in subsequent tasks
    repositories = await client.list_repositories()
    tags = await client.list_tags("myapp")
    manifest = await client.get_manifest("myapp", "latest")
```

### Error Handling

```python
try:
    result = await client.list_repositories()
except RegistryAuthError:
    # Handle authentication failure
    pass
except RegistryNotFoundError:
    # Handle missing resource
    pass
except RegistryConnectionError:
    # Handle network/server issues
    pass
```

## Implementation Status

### ✅ Completed Features

- [x] Core RegistryClient class structure
- [x] Basic authentication implementation
- [x] Error handling system with custom exceptions
- [x] Retry logic with exponential backoff
- [x] SQLite-based caching infrastructure
- [x] Pydantic data models for all entities
- [x] Type annotations and comprehensive docstrings
- [x] Repository listing API (`list_repositories`)
- [x] Tag information API (`list_tags`)
- [x] Manifest retrieval (`get_manifest`)
- [x] Blob size calculation
- [x] Mock registry for development/testing
- [x] Repository service layer with business logic
- [x] Pagination support
- [x] Search and filtering
- [x] Sorting capabilities

### 🚀 Additional Features Implemented

- **SQLite Cache System**: Persistent caching with configurable TTL
- **Mock Data Mode**: 50+ sample repositories for development
- **Service Layer**: Clean separation of concerns
- **Utility Modules**: Pagination, search, sorting helpers
- **Thread Safety**: Connection pooling and thread-safe cache operations

## Testing Strategy

### Unit Tests (Implemented)

- [x] Mock HTTP responses for all API endpoints
- [x] Authentication flow testing
- [x] Error handling scenarios
- [x] Retry logic validation
- [x] Cache behavior verification
- [x] Mock registry testing
- [x] Service layer testing

### E2E Tests (Implemented with Playwright)

- [x] Repository listing validation
- [x] Tag expansion and details
- [x] Search functionality
- [x] Pagination controls
- [x] Sorting options
- [x] Cross-browser compatibility

### Performance Tests (Implemented)

- [x] Load testing with concurrent users
- [x] Response time measurements
- [x] Cache effectiveness validation

## Performance Optimizations (Implemented)

1. **Connection Pooling**: httpx AsyncClient with connection reuse
2. **SQLite Caching**: Persistent cache with 5-minute TTL (configurable)
3. **Concurrent Requests**: Async design supports parallel operations
4. **Database Connection Pool**: Thread-safe SQLite connections
5. **Request Optimization**: Minimal headers and efficient authentication
6. **Mock Mode**: Zero-latency development with realistic data
7. **Lazy Loading**: On-demand tag fetching reduces initial load

## Security Features

1. **SSL Verification**: Configurable SSL certificate validation
2. **Token Security**: Secure storage and automatic expiration handling  
3. **Credential Management**: No credential logging or exposure
4. **Error Sanitization**: Safe error messages without credential leaks
