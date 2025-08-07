"""
Docker Registry v2 API Client

This module provides a comprehensive client for interacting with Docker Registry v2 API,
including authentication, repository listing, and tag management.
"""

import asyncio
import base64
import json
import time
from typing import Dict, List, Optional, Tuple, Any
from urllib.parse import urljoin, urlparse, parse_qs

import httpx
from httpx import AsyncClient, Response

from ..models.schemas import (
    AuthChallenge, BearerToken, RepositoryCatalog, TagsList, 
    ManifestV2, ImageInfo, RepositoryInfo, PaginationInfo,
    RegistryErrorResponse, RegistryError
)


class RegistryException(Exception):
    """Base exception for Registry operations"""
    def __init__(
        self, 
        message: str, 
        status_code: Optional[int] = None, 
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses"""
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "status_code": self.status_code,
            "error_code": self.error_code,
            "details": self.details
        }
    
    def __str__(self) -> str:
        base_msg = self.message
        if self.status_code:
            base_msg += f" (HTTP {self.status_code})"
        if self.error_code:
            base_msg += f" [Code: {self.error_code}]"
        return base_msg


class RegistryAuthError(RegistryException):
    """Authentication failed"""
    def __init__(self, message: str = "Authentication failed", **kwargs):
        super().__init__(message, **kwargs)


class RegistryNotFoundError(RegistryException):
    """Resource not found"""
    def __init__(self, message: str = "Resource not found", **kwargs):
        kwargs.setdefault('status_code', 404)
        super().__init__(message, **kwargs)


class RegistryConnectionError(RegistryException):
    """Connection or network error"""
    def __init__(self, message: str = "Connection error", **kwargs):
        super().__init__(message, **kwargs)


class RegistryTimeoutError(RegistryException):
    """Request timeout"""
    def __init__(self, message: str = "Request timeout", **kwargs):
        kwargs.setdefault('status_code', 408)
        super().__init__(message, **kwargs)


class RegistryPermissionError(RegistryException):
    """Permission denied or access forbidden"""
    def __init__(self, message: str = "Permission denied", **kwargs):
        kwargs.setdefault('status_code', 403)
        super().__init__(message, **kwargs)


class RegistryRateLimitError(RegistryException):
    """Rate limit exceeded"""
    def __init__(self, message: str = "Rate limit exceeded", **kwargs):
        kwargs.setdefault('status_code', 429)
        super().__init__(message, **kwargs)


class RegistryServerError(RegistryException):
    """Server error from registry"""
    def __init__(self, message: str = "Registry server error", **kwargs):
        super().__init__(message, **kwargs)


class RegistryValidationError(RegistryException):
    """Data validation error"""
    def __init__(self, message: str = "Validation error", **kwargs):
        kwargs.setdefault('status_code', 422)
        super().__init__(message, **kwargs)


class RegistryUnavailableError(RegistryException):
    """Registry service unavailable"""
    def __init__(self, message: str = "Registry unavailable", **kwargs):
        kwargs.setdefault('status_code', 503)
        super().__init__(message, **kwargs)


class RegistryClient:
    """
    Docker Registry v2 API Client
    
    Provides methods to interact with Docker Registry including:
    - Bearer token authentication
    - Repository listing with pagination
    - Tag information retrieval
    - Image manifest parsing
    - Retry logic and error handling
    """
    
    def __init__(
        self,
        registry_url: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        verify_ssl: bool = True,
    ):
        """
        Initialize Registry client
        
        Args:
            registry_url: Base URL of the Docker Registry
            username: Registry username (optional for public registries)
            password: Registry password or token
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            retry_delay: Base delay between retries (exponential backoff)
            verify_ssl: Whether to verify SSL certificates
        """
        self.registry_url = registry_url.rstrip('/')
        self.username = username
        self.password = password
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        # Session configuration
        self.client_config = {
            "timeout": httpx.Timeout(timeout),
            "verify": verify_ssl,
            "follow_redirects": True,
        }
        
        # Authentication state
        self._auth_token: Optional[str] = None
        self._token_expires_at: Optional[float] = None
        self._auth_challenge: Optional[AuthChallenge] = None
        
        # Default headers
        self.default_headers = {
            "User-Agent": "RepoVista/1.0.0",
            "Accept": "application/vnd.docker.distribution.manifest.v2+json",
        }
        
        # In-memory cache for responses
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._cache_ttl = 300  # 5 minutes default TTL
        self._cache_stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "size": 0
        }
        self._max_cache_size = 1000  # Maximum cache entries
        
        # Circuit breaker state
        self._failure_count = 0
        self._last_failure_time = 0
        self._last_success_time = time.time()
        self._circuit_breaker_threshold = 5
        self._circuit_breaker_timeout = 60
        self._circuit_breaker_half_open_max_calls = 3
        self._circuit_breaker_half_open_calls = 0
        self._circuit_breaker_state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
        
        # Enhanced retry configuration
        self._retry_on_status_codes = {408, 429, 500, 502, 503, 504}
        self._retry_exceptions = (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError)
        self._max_retry_delay = 60.0  # Maximum delay between retries
    
    def _get_circuit_breaker_state(self) -> str:
        """Get current circuit breaker state and update if needed"""
        current_time = time.time()
        
        if self._circuit_breaker_state == "CLOSED":
            # Check if we need to open the circuit
            if self._failure_count >= self._circuit_breaker_threshold:
                self._circuit_breaker_state = "OPEN"
                self._last_failure_time = current_time
                
        elif self._circuit_breaker_state == "OPEN":
            # Check if we should try half-open
            if current_time - self._last_failure_time > self._circuit_breaker_timeout:
                self._circuit_breaker_state = "HALF_OPEN"
                self._circuit_breaker_half_open_calls = 0
                
        elif self._circuit_breaker_state == "HALF_OPEN":
            # Half-open state is managed by success/failure recording
            pass
            
        return self._circuit_breaker_state
    
    def _is_circuit_open(self) -> bool:
        """Check if circuit breaker is open"""
        state = self._get_circuit_breaker_state()
        return state == "OPEN"
    
    def _can_make_request(self) -> bool:
        """Check if request can be made based on circuit breaker state"""
        state = self._get_circuit_breaker_state()
        
        if state == "CLOSED":
            return True
        elif state == "OPEN":
            return False
        elif state == "HALF_OPEN":
            # Allow limited requests in half-open state
            return self._circuit_breaker_half_open_calls < self._circuit_breaker_half_open_max_calls
            
        return False
    
    def _record_failure(self, is_retriable: bool = True):
        """
        Record a failure for circuit breaker
        
        Args:
            is_retriable: Whether the failure is retriable (affects circuit breaker logic)
        """
        current_time = time.time()
        self._last_failure_time = current_time
        
        if self._circuit_breaker_state == "CLOSED":
            self._failure_count += 1
            
        elif self._circuit_breaker_state == "HALF_OPEN":
            # Any failure in half-open state opens the circuit again
            self._circuit_breaker_state = "OPEN"
            self._failure_count = self._circuit_breaker_threshold  # Ensure circuit stays open
            self._circuit_breaker_half_open_calls = 0
            
        # Non-retriable errors (auth, permission, validation) should not affect circuit breaker
        # Only network/server errors should influence circuit state
        if not is_retriable:
            # Reset failure count for non-retriable errors to prevent unnecessary circuit opening
            if self._circuit_breaker_state == "CLOSED":
                self._failure_count = max(0, self._failure_count - 1)
    
    def _record_success(self):
        """Record a success, update circuit breaker state"""
        current_time = time.time()
        self._last_success_time = current_time
        
        if self._circuit_breaker_state == "CLOSED":
            # Reset failure count on success
            self._failure_count = 0
            
        elif self._circuit_breaker_state == "HALF_OPEN":
            self._circuit_breaker_half_open_calls += 1
            
            # If we've had enough successful calls in half-open state, close the circuit
            if self._circuit_breaker_half_open_calls >= self._circuit_breaker_half_open_max_calls:
                self._circuit_breaker_state = "CLOSED"
                self._failure_count = 0
                self._circuit_breaker_half_open_calls = 0
    
    def _get_circuit_breaker_info(self) -> Dict[str, Any]:
        """Get circuit breaker status information for monitoring"""
        return {
            "state": self._get_circuit_breaker_state(),
            "failure_count": self._failure_count,
            "threshold": self._circuit_breaker_threshold,
            "last_failure_time": self._last_failure_time,
            "last_success_time": self._last_success_time,
            "half_open_calls": self._circuit_breaker_half_open_calls,
            "timeout": self._circuit_breaker_timeout
        }
    
    def _get_cached(self, key: str) -> Optional[Any]:
        """Get item from cache if not expired"""
        if key in self._cache:
            value, expires_at = self._cache[key]
            if time.time() < expires_at:
                self._cache_stats["hits"] += 1
                return value
            else:
                del self._cache[key]
                self._cache_stats["evictions"] += 1
                self._cache_stats["size"] = len(self._cache)
        
        self._cache_stats["misses"] += 1
        return None
    
    def _set_cache(self, key: str, value: Any, ttl: Optional[float] = None):
        """Set item in cache with TTL"""
        if ttl is None:
            ttl = self._cache_ttl
        
        # Check cache size limit
        if len(self._cache) >= self._max_cache_size:
            self._evict_expired_cache_entries()
            
            # If still at limit, evict oldest entries
            if len(self._cache) >= self._max_cache_size:
                self._evict_oldest_cache_entries(int(self._max_cache_size * 0.1))  # Evict 10%
        
        expires_at = time.time() + ttl
        self._cache[key] = (value, expires_at)
        self._cache_stats["size"] = len(self._cache)
    
    def _evict_expired_cache_entries(self):
        """Remove expired entries from cache"""
        current_time = time.time()
        expired_keys = []
        
        for key, (_, expires_at) in self._cache.items():
            if current_time >= expires_at:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self._cache[key]
            self._cache_stats["evictions"] += 1
        
        self._cache_stats["size"] = len(self._cache)
    
    def _evict_oldest_cache_entries(self, count: int):
        """Remove oldest cache entries"""
        if count <= 0 or not self._cache:
            return
            
        # Sort by expiration time and remove oldest
        sorted_entries = sorted(self._cache.items(), key=lambda x: x[1][1])
        keys_to_remove = [key for key, _ in sorted_entries[:count]]
        
        for key in keys_to_remove:
            del self._cache[key]
            self._cache_stats["evictions"] += 1
        
        self._cache_stats["size"] = len(self._cache)
    
    def clear_cache(self, pattern: Optional[str] = None):
        """Clear cache entries, optionally matching a pattern"""
        if pattern is None:
            # Clear all cache
            cleared_count = len(self._cache)
            self._cache.clear()
            self._cache_stats["evictions"] += cleared_count
        else:
            # Clear entries matching pattern
            import re
            pattern_re = re.compile(pattern)
            keys_to_remove = [key for key in self._cache.keys() if pattern_re.search(key)]
            
            for key in keys_to_remove:
                del self._cache[key]
                self._cache_stats["evictions"] += 1
        
        self._cache_stats["size"] = len(self._cache)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_requests = self._cache_stats["hits"] + self._cache_stats["misses"]
        hit_rate = (self._cache_stats["hits"] / total_requests * 100) if total_requests > 0 else 0
        
        return {
            "hits": self._cache_stats["hits"],
            "misses": self._cache_stats["misses"],
            "evictions": self._cache_stats["evictions"],
            "size": self._cache_stats["size"],
            "max_size": self._max_cache_size,
            "hit_rate": round(hit_rate, 2),
            "total_requests": total_requests
        }
    
    def configure_cache(self, max_size: int = 1000, default_ttl: int = 300):
        """Configure cache parameters"""
        self._max_cache_size = max_size
        self._cache_ttl = default_ttl
        
        # Evict entries if new max size is smaller
        if len(self._cache) > max_size:
            excess_count = len(self._cache) - max_size
            self._evict_oldest_cache_entries(excess_count)
    
    async def _make_request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> Response:
        """
        Make HTTP request with retry logic and circuit breaker
        
        Args:
            method: HTTP method
            url: Request URL
            headers: Additional headers
            **kwargs: Additional arguments for httpx request
            
        Returns:
            HTTP response
            
        Raises:
            RegistryException: On various error conditions
        """
        # Check circuit breaker state
        if not self._can_make_request():
            circuit_info = self._get_circuit_breaker_info()
            if circuit_info["state"] == "OPEN":
                time_remaining = self._circuit_breaker_timeout - (time.time() - self._last_failure_time)
                raise RegistryConnectionError(
                    f"Circuit breaker is open (retry in {time_remaining:.1f}s)", 
                    details=circuit_info
                )
            else:
                raise RegistryConnectionError("Circuit breaker limits exceeded", details=circuit_info)
        
        # Prepare headers
        request_headers = self.default_headers.copy()
        if headers:
            request_headers.update(headers)
        
        # Add authentication if available
        if self._auth_token:
            request_headers["Authorization"] = f"Bearer {self._auth_token}"
        elif self.username and self.password:
            # Basic auth fallback
            auth_string = base64.b64encode(f"{self.username}:{self.password}".encode()).decode()
            request_headers["Authorization"] = f"Basic {auth_string}"
        
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                async with AsyncClient(**self.client_config) as client:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=request_headers,
                        **kwargs
                    )
                    
                    # Handle authentication challenges
                    if response.status_code == 401:
                        await self._handle_auth_challenge(response)
                        # Retry with new token
                        if self._auth_token and attempt < self.max_retries:
                            request_headers["Authorization"] = f"Bearer {self._auth_token}"
                            continue
                    
                    # Check for other errors
                    if response.status_code >= 400:
                        await self._handle_error_response(response)
                    
                    self._record_success()
                    return response
                    
            except httpx.TimeoutException as e:
                last_exception = RegistryTimeoutError(f"Request timeout: {e}")
            except httpx.RequestError as e:
                last_exception = RegistryConnectionError(f"Connection error: {e}")
            except RegistryException as e:
                # Check if this error is retriable
                if self._is_retriable_error(e) and attempt < self.max_retries:
                    last_exception = e
                else:
                    raise  # Re-raise non-retriable exceptions immediately
            except Exception as e:
                last_exception = RegistryException(f"Unexpected error: {e}")
            
            # Check if we should retry this error
            if last_exception and not self._is_retriable_error(last_exception):
                break
            
            # Wait before retry with improved backoff calculation
            if attempt < self.max_retries:
                wait_time = self._get_retry_delay(attempt, last_exception)
                await asyncio.sleep(wait_time)
        
        # All retries failed - record failure with proper retriable status
        is_retriable = last_exception and self._is_retriable_error(last_exception)
        self._record_failure(is_retriable)
        
        if last_exception:
            raise last_exception
        else:
            raise RegistryException("All retry attempts failed")
    
    async def _handle_auth_challenge(self, response: Response):
        """
        Handle WWW-Authenticate header and obtain Bearer token
        
        Args:
            response: HTTP response with authentication challenge
        """
        auth_header = response.headers.get("WWW-Authenticate")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise RegistryAuthError("Invalid authentication challenge")
        
        # Parse authentication challenge
        challenge_params = {}
        challenge_str = auth_header[7:]  # Remove "Bearer "
        
        for param in challenge_str.split(','):
            if '=' in param:
                key, value = param.split('=', 1)
                challenge_params[key.strip()] = value.strip().strip('"')
        
        if 'realm' not in challenge_params:
            raise RegistryAuthError("Authentication realm not provided")
        
        # Store challenge for future use
        self._auth_challenge = AuthChallenge(**challenge_params)
        
        # Request Bearer token
        await self._obtain_bearer_token()
    
    async def _obtain_bearer_token(self):
        """
        Obtain Bearer token from authentication service
        """
        if not self._auth_challenge:
            raise RegistryAuthError("No authentication challenge available")
        
        if not self.username or not self.password:
            raise RegistryAuthError("Username and password required for authentication")
        
        # Prepare token request
        token_url = str(self._auth_challenge.realm)
        params = {"service": self._auth_challenge.service}
        
        if self._auth_challenge.scope:
            params["scope"] = self._auth_challenge.scope
        
        # Basic authentication for token endpoint
        auth_string = base64.b64encode(f"{self.username}:{self.password}".encode()).decode()
        headers = {
            "Authorization": f"Basic {auth_string}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        
        try:
            async with AsyncClient(**self.client_config) as client:
                response = await client.get(token_url, params=params, headers=headers)
                response.raise_for_status()
                
                token_data = response.json()
                bearer_token = BearerToken(**token_data)
                
                # Store token
                self._auth_token = bearer_token.access_token or bearer_token.token
                
                # Calculate expiration time
                if bearer_token.expires_in:
                    self._token_expires_at = time.time() + bearer_token.expires_in - 60  # 1 min buffer
                
        except httpx.HTTPStatusError as e:
            raise RegistryAuthError(f"Token request failed: {e}")
        except Exception as e:
            raise RegistryAuthError(f"Failed to obtain bearer token: {e}")
    
    async def _handle_error_response(self, response: Response):
        """
        Handle error responses from Registry API with comprehensive error mapping
        
        Args:
            response: HTTP error response
            
        Raises:
            Appropriate RegistryException subclass based on status code and error details
        """
        status_code = response.status_code
        
        # Try to parse Registry v2 API error response first
        error_details = {}
        error_code = None
        detailed_message = None
        
        try:
            error_data = response.json()
            if "errors" in error_data:
                error_response = RegistryErrorResponse(**error_data)
                errors = error_response.errors
                
                if errors:
                    # Use the first error for primary details
                    primary_error = errors[0]
                    error_code = primary_error.code.value if primary_error.code else None
                    detailed_message = primary_error.message
                    
                    # Collect all error details
                    error_details = {
                        "registry_errors": [
                            {
                                "code": err.code.value if err.code else "UNKNOWN",
                                "message": err.message,
                                "detail": err.detail
                            } for err in errors
                        ]
                    }
                    
                    # If multiple errors, create combined message
                    if len(errors) > 1:
                        detailed_message = "; ".join([f"{err.code.value if err.code else 'UNKNOWN'}: {err.message}" for err in errors])
                        
        except (json.JSONDecodeError, ValueError, Exception):
            # If we can't parse the error response, use generic handling
            pass
        
        # Map status codes to specific exception types with user-friendly messages
        if status_code == 400:
            message = detailed_message or "Bad request - invalid parameters or malformed request"
            raise RegistryValidationError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 401:
            message = detailed_message or "Authentication required - invalid credentials or expired token"
            raise RegistryAuthError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 403:
            message = detailed_message or "Permission denied - insufficient privileges to access this resource"
            raise RegistryPermissionError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 404:
            # Provide more specific 404 messages based on context
            if error_code == "NAME_UNKNOWN":
                message = detailed_message or "Repository not found"
            elif error_code == "MANIFEST_UNKNOWN":
                message = detailed_message or "Image manifest not found"
            elif error_code == "BLOB_UNKNOWN":
                message = detailed_message or "Image layer or blob not found"
            else:
                message = detailed_message or "Resource not found"
            raise RegistryNotFoundError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 405:
            message = detailed_message or "Method not allowed - the requested operation is not supported"
            raise RegistryException(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 409:
            message = detailed_message or "Conflict - resource already exists or concurrent modification"
            raise RegistryException(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 416:
            message = detailed_message or "Range not satisfiable - invalid byte range requested"
            raise RegistryException(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 429:
            message = detailed_message or "Rate limit exceeded - too many requests"
            # Extract rate limit information from headers if available
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                error_details["retry_after"] = retry_after
                message += f" (retry after {retry_after} seconds)"
            raise RegistryRateLimitError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 500:
            message = detailed_message or "Internal server error - registry encountered an unexpected condition"
            raise RegistryServerError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 502:
            message = detailed_message or "Bad gateway - registry received invalid response from upstream server"
            raise RegistryServerError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 503:
            message = detailed_message or "Service unavailable - registry is temporarily overloaded or down for maintenance"
            # Extract retry information from headers if available
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                error_details["retry_after"] = retry_after
                message += f" (retry after {retry_after} seconds)"
            raise RegistryUnavailableError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code == 504:
            message = detailed_message or "Gateway timeout - registry did not receive timely response from upstream server"
            raise RegistryTimeoutError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        elif status_code >= 500:
            message = detailed_message or f"Server error - registry returned status {status_code}"
            raise RegistryServerError(message, status_code=status_code, error_code=error_code, details=error_details)
            
        else:
            # Generic client error for 4xx codes not specifically handled
            message = detailed_message or f"Client error - HTTP {status_code}"
            if hasattr(response, 'reason_phrase'):
                message += f": {response.reason_phrase}"
            raise RegistryException(message, status_code=status_code, error_code=error_code, details=error_details)
    
    def _is_token_expired(self) -> bool:
        """Check if current token is expired"""
        if not self._auth_token:
            return True
        
        if self._token_expires_at:
            return time.time() >= self._token_expires_at
        
        # If no expiration time, assume token is still valid
        return False
    
    async def _ensure_authenticated(self):
        """Ensure client is authenticated (refresh token if needed)"""
        if self._is_token_expired():
            self._auth_token = None
            self._token_expires_at = None
            
            # Token will be obtained on next request via auth challenge
    
    def _create_user_friendly_error_message(self, exception: RegistryException, context: str = "") -> str:
        """
        Create user-friendly error messages for common registry errors
        
        Args:
            exception: The registry exception that occurred
            context: Additional context (e.g., repository name, operation)
            
        Returns:
            User-friendly error message
        """
        base_message = str(exception)
        
        if isinstance(exception, RegistryAuthError):
            if context:
                return f"Authentication failed while {context}. Please check your registry credentials."
            return "Authentication failed. Please check your registry credentials."
            
        elif isinstance(exception, RegistryNotFoundError):
            if "repository" in context.lower():
                return f"Repository not found. Please verify the repository name is correct."
            elif "tag" in context.lower():
                return f"Tag not found. The specified tag may not exist in this repository."
            elif context:
                return f"Resource not found while {context}."
            return "The requested resource was not found."
            
        elif isinstance(exception, RegistryPermissionError):
            if context:
                return f"Access denied while {context}. You don't have permission to access this resource."
            return "Access denied. You don't have permission to access this resource."
            
        elif isinstance(exception, RegistryRateLimitError):
            retry_info = ""
            if exception.details.get("retry_after"):
                retry_info = f" Please try again in {exception.details['retry_after']} seconds."
            return f"Rate limit exceeded.{retry_info}"
            
        elif isinstance(exception, RegistryUnavailableError):
            retry_info = ""
            if exception.details.get("retry_after"):
                retry_info = f" Please try again in {exception.details['retry_after']} seconds."
            return f"Registry service is temporarily unavailable.{retry_info}"
            
        elif isinstance(exception, RegistryTimeoutError):
            if context:
                return f"Request timeout while {context}. The registry may be slow or overloaded."
            return "Request timeout. The registry may be slow or overloaded."
            
        elif isinstance(exception, RegistryConnectionError):
            if context:
                return f"Connection error while {context}. Please check your network connection and registry URL."
            return "Connection error. Please check your network connection and registry URL."
            
        elif isinstance(exception, RegistryServerError):
            if context:
                return f"Registry server error while {context}. Please try again later."
            return "Registry server error. Please try again later."
            
        elif isinstance(exception, RegistryValidationError):
            if context:
                return f"Invalid request while {context}. Please check your parameters."
            return "Invalid request. Please check your parameters."
            
        # Default to the original message
        return base_message
    
    def _is_retriable_error(self, exception: Exception) -> bool:
        """
        Determine if an error is retriable
        
        Args:
            exception: The exception that occurred
            
        Returns:
            True if the error should be retried
        """
        # Network and timeout errors are retriable
        if isinstance(exception, (RegistryConnectionError, RegistryTimeoutError)):
            return True
            
        # Server errors (5xx) are retriable
        if isinstance(exception, (RegistryServerError, RegistryUnavailableError)):
            return True
            
        # Rate limit errors are retriable (but with backoff)
        if isinstance(exception, RegistryRateLimitError):
            return True
            
        # Check registry exceptions with specific status codes
        if isinstance(exception, RegistryException):
            if exception.status_code and self._should_retry_status_code(exception.status_code):
                return True
                
        # Check HTTPX specific errors using utility method
        if self._should_retry_exception(exception):
            return True
            
        return False
    
    def _get_retry_delay(self, attempt: int, exception: Optional[Exception] = None) -> float:
        """
        Calculate retry delay with exponential backoff
        
        Args:
            attempt: Current retry attempt (0-based)
            exception: The exception that triggered the retry
            
        Returns:
            Delay in seconds before next retry
        """
        base_delay = self.retry_delay
        
        # Special handling for rate limit errors
        if isinstance(exception, RegistryRateLimitError) and exception.details.get("retry_after"):
            try:
                return float(exception.details["retry_after"])
            except (ValueError, TypeError):
                pass
                
        # Special handling for service unavailable
        if isinstance(exception, RegistryUnavailableError) and exception.details.get("retry_after"):
            try:
                return float(exception.details["retry_after"])
            except (ValueError, TypeError):
                pass
        
        # Exponential backoff with jitter
        import random
        delay = base_delay * (2 ** attempt)
        
        # Cap the delay at maximum value
        delay = min(delay, self._max_retry_delay)
        
        # Add up to 25% jitter to prevent thundering herd
        jitter = delay * 0.25 * random.random()
        
        return delay + jitter
    
    def _parse_datetime(self, datetime_str: str) -> Optional['datetime']:
        """
        Parse datetime string from various Docker Registry formats
        
        Args:
            datetime_str: Datetime string in various formats
            
        Returns:
            Parsed datetime object or None if parsing fails
        """
        if not datetime_str:
            return None
            
        try:
            from datetime import datetime
            
            # Try different datetime formats
            formats_to_try = [
                "%Y-%m-%dT%H:%M:%S.%fZ",      # 2023-01-01T12:00:00.123456Z
                "%Y-%m-%dT%H:%M:%SZ",         # 2023-01-01T12:00:00Z
                "%Y-%m-%dT%H:%M:%S%z",        # 2023-01-01T12:00:00+00:00
                "%Y-%m-%dT%H:%M:%S.%f%z",     # 2023-01-01T12:00:00.123456+00:00
                "%Y-%m-%dT%H:%M:%S",          # 2023-01-01T12:00:00
            ]
            
            # Handle Z suffix (Zulu time)
            clean_str = datetime_str
            if clean_str.endswith('Z'):
                clean_str = clean_str[:-1] + '+00:00'
            
            # Try parsing with different formats
            for fmt in formats_to_try:
                try:
                    if '+' in clean_str or '-' in clean_str[-6:]:
                        # Has timezone info
                        return datetime.fromisoformat(clean_str)
                    else:
                        # No timezone, try strptime
                        return datetime.strptime(clean_str, fmt)
                except ValueError:
                    continue
            
            # Last resort: use fromisoformat
            return datetime.fromisoformat(clean_str)
            
        except (ValueError, ImportError, AttributeError):
            return None
    
    def _format_size(self, size_bytes: int) -> str:
        """
        Format size in bytes to human-readable string
        
        Args:
            size_bytes: Size in bytes
            
        Returns:
            Human-readable size string
        """
        if size_bytes == 0:
            return "0 B"
        
        units = ["B", "KB", "MB", "GB", "TB", "PB"]
        size = float(size_bytes)
        unit_index = 0
        
        while size >= 1024.0 and unit_index < len(units) - 1:
            size /= 1024.0
            unit_index += 1
        
        if unit_index == 0:
            return f"{int(size)} {units[unit_index]}"
        else:
            return f"{size:.1f} {units[unit_index]}"
    
    def _parse_manifest_metadata(self, manifest: ManifestV2, config_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Extract metadata from manifest and optional config data
        
        Args:
            manifest: Docker manifest v2 data
            config_data: Optional configuration blob data
            
        Returns:
            Dictionary with extracted metadata
        """
        # Calculate sizes
        config_size = manifest.config.size
        layers_size = sum(layer.size for layer in manifest.layers)
        total_size = config_size + layers_size
        
        metadata = {
            "total_size": total_size,
            "config_size": config_size,
            "layers_size": layers_size,
            "layers_count": len(manifest.layers),
            "schema_version": manifest.schema_version,
            "media_type": manifest.media_type,
            "config_digest": manifest.config.digest,
            "layer_digests": [layer.digest for layer in manifest.layers],
            "formatted_size": self._format_size(total_size),
        }
        
        # Extract additional info from config if available
        if config_data:
            # Image creation date
            if "created" in config_data:
                created_date = self._parse_datetime(config_data["created"])
                metadata["created"] = created_date
                metadata["created_str"] = config_data["created"] if created_date else None
            
            # Architecture and OS
            metadata["architecture"] = config_data.get("architecture")
            metadata["os"] = config_data.get("os")
            metadata["variant"] = config_data.get("variant")
            
            # Image config
            image_config = config_data.get("config", {})
            metadata["env"] = image_config.get("Env", [])
            metadata["cmd"] = image_config.get("Cmd", [])
            metadata["entrypoint"] = image_config.get("Entrypoint", [])
            metadata["exposed_ports"] = list(image_config.get("ExposedPorts", {}).keys())
            metadata["working_dir"] = image_config.get("WorkingDir")
            metadata["user"] = image_config.get("User")
            
            # Root filesystem
            rootfs = config_data.get("rootfs", {})
            metadata["rootfs_type"] = rootfs.get("type")
            metadata["rootfs_diff_ids"] = rootfs.get("diff_ids", [])
            
            # History (layer commands)
            history = config_data.get("history", [])
            metadata["history"] = history
            metadata["history_count"] = len(history)
        
        return metadata
    
    def _create_image_info_from_metadata(
        self, 
        repository: str, 
        tag: str, 
        digest: str,
        metadata: Dict[str, Any]
    ) -> ImageInfo:
        """
        Create ImageInfo object from parsed metadata
        
        Args:
            repository: Repository name
            tag: Tag name
            digest: Image digest
            metadata: Parsed metadata dictionary
            
        Returns:
            ImageInfo object
        """
        return ImageInfo(
            repository=repository,
            tag=tag,
            digest=digest,
            size=metadata.get("total_size", 0),
            created=metadata.get("created"),
            architecture=metadata.get("architecture"),
            os=metadata.get("os"),
            pull_command=f"docker pull {repository}:{tag}"
        )
    
    def _validate_manifest_data(self, manifest_data: Dict[str, Any]) -> bool:
        """
        Validate manifest data structure
        
        Args:
            manifest_data: Raw manifest data from API
            
        Returns:
            True if valid, False otherwise
        """
        required_fields = ["schemaVersion", "mediaType", "config", "layers"]
        
        # Check required top-level fields
        for field in required_fields:
            if field not in manifest_data:
                return False
        
        # Validate config structure
        config = manifest_data.get("config", {})
        if not isinstance(config, dict):
            return False
        
        config_required = ["mediaType", "size", "digest"]
        for field in config_required:
            if field not in config:
                return False
        
        # Validate layers structure
        layers = manifest_data.get("layers", [])
        if not isinstance(layers, list):
            return False
        
        for layer in layers:
            if not isinstance(layer, dict):
                return False
            layer_required = ["mediaType", "size", "digest"]
            for field in layer_required:
                if field not in layer:
                    return False
        
        return True
    
    def _parse_registry_error_response(self, response_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Parse Registry v2 API error response
        
        Args:
            response_data: Raw error response data
            
        Returns:
            List of parsed error dictionaries
        """
        errors = []
        
        if "errors" in response_data:
            for error in response_data["errors"]:
                parsed_error = {
                    "code": error.get("code", "UNKNOWN"),
                    "message": error.get("message", "Unknown error"),
                    "detail": error.get("detail")
                }
                errors.append(parsed_error)
        
        return errors
            
    def _parse_link_header(self, link_header: str) -> Optional[str]:
        """
        Parse Link header to extract next page URL
        
        Args:
            link_header: Link header value from HTTP response
            
        Returns:
            Next page URL if available
        """
        if not link_header:
            return None
            
        # Link header format: </v2/_catalog?n=100&last=repo99>; rel="next"
        for link in link_header.split(','):
            link = link.strip()
            if 'rel="next"' in link:
                # Extract URL from angle brackets
                start = link.find('<')
                end = link.find('>')
                if start != -1 and end != -1:
                    return link[start + 1:end]
        
        return None
    
    async def list_repositories(
        self,
        limit: Optional[int] = None,
        last_repository: Optional[str] = None,
        fetch_all: bool = False
    ) -> Tuple[List[str], PaginationInfo]:
        """
        List repositories from Docker Registry
        
        Args:
            limit: Maximum number of repositories to return per page (registry default: 100)
            last_repository: Last repository name for pagination (start after this)
            fetch_all: If True, fetch all repositories across multiple pages
            
        Returns:
            Tuple of (repository_list, pagination_info)
            
        Raises:
            RegistryException: On API errors or network issues
        """
        await self._ensure_authenticated()
        
        # Check cache first
        cache_key = f"repositories:{limit}:{last_repository}:{fetch_all}"
        cached_result = self._get_cached(cache_key)
        if cached_result:
            return cached_result
        
        all_repositories = []
        pagination_info = PaginationInfo()
        
        # Prepare initial request parameters
        url = f"{self.registry_url}/v2/_catalog"
        params = {}
        
        if limit is not None:
            params["n"] = limit
        if last_repository:
            params["last"] = last_repository
        
        while True:
            try:
                # Make request to catalog endpoint
                response = await self._make_request("GET", url, params=params)
                
                # Parse response
                catalog_data = response.json()
                catalog = RepositoryCatalog(**catalog_data)
                
                # Add repositories to result
                all_repositories.extend(catalog.repositories)
                
                # Check for pagination
                link_header = response.headers.get("Link", "")
                next_url = self._parse_link_header(link_header)
                
                if not fetch_all or not next_url:
                    # Single page request or no more pages
                    pagination_info.has_next = bool(next_url)
                    pagination_info.next_url = next_url
                    break
                
                # Prepare for next page
                if next_url:
                    # Parse next URL for parameters
                    from urllib.parse import urlparse, parse_qs
                    parsed = urlparse(next_url)
                    next_params = parse_qs(parsed.query)
                    
                    params = {}
                    if 'n' in next_params:
                        params["n"] = next_params['n'][0]
                    if 'last' in next_params:
                        params["last"] = next_params['last'][0]
                else:
                    break
            
            except RegistryException:
                raise
            except Exception as e:
                raise RegistryException(f"Failed to list repositories: {e}")
        
        result = (all_repositories, pagination_info)
        
        # Cache result
        cache_ttl = 60 if fetch_all else 30  # Cache longer for complete lists
        self._set_cache(cache_key, result, cache_ttl)
        
        return result
    
    async def get_repository_info(self, repository_name: str) -> RepositoryInfo:
        """
        Get detailed information about a specific repository
        
        Args:
            repository_name: Name of the repository
            
        Returns:
            Repository information with metadata
            
        Raises:
            RegistryException: On API errors or network issues
        """
        await self._ensure_authenticated()
        
        # Check cache first
        cache_key = f"repo_info:{repository_name}"
        cached_result = self._get_cached(cache_key)
        if cached_result:
            return cached_result
        
        try:
            # Get tags list to determine tag count
            tags_response = await self._make_request(
                "GET", 
                f"{self.registry_url}/v2/{repository_name}/tags/list"
            )
            
            tags_data = tags_response.json()
            tags_list = TagsList(**tags_data)
            
            # Basic repository info
            repo_info = RepositoryInfo(
                name=repository_name,
                tag_count=len(tags_list.tags),
                last_updated=None,  # Will be populated by tag analysis
                size_bytes=None     # Will be calculated from manifests
            )
            
            # Cache result
            self._set_cache(cache_key, repo_info, 300)  # 5 minutes TTL
            
            return repo_info
            
        except RegistryNotFoundError:
            raise RegistryNotFoundError(f"Repository '{repository_name}' not found")
        except RegistryException:
            raise
        except Exception as e:
            raise RegistryException(f"Failed to get repository info for '{repository_name}': {e}")
    
    async def list_tags(self, repository_name: str) -> TagsList:
        """
        List tags for a specific repository
        
        Args:
            repository_name: Name of the repository
            
        Returns:
            TagsList with repository name and tags
            
        Raises:
            RegistryException: On API errors or network issues
        """
        await self._ensure_authenticated()
        
        # Check cache first
        cache_key = f"tags:{repository_name}"
        cached_result = self._get_cached(cache_key)
        if cached_result:
            return cached_result
        
        try:
            response = await self._make_request(
                "GET",
                f"{self.registry_url}/v2/{repository_name}/tags/list"
            )
            
            tags_data = response.json()
            tags_list = TagsList(**tags_data)
            
            # Cache result for 2 minutes (tags change less frequently)
            self._set_cache(cache_key, tags_list, 120)
            
            return tags_list
            
        except RegistryNotFoundError:
            raise RegistryNotFoundError(f"Repository '{repository_name}' not found")
        except RegistryException:
            raise
        except Exception as e:
            raise RegistryException(f"Failed to list tags for '{repository_name}': {e}")
    
    async def get_manifest(
        self, 
        repository_name: str, 
        tag: str,
        media_type: str = "application/vnd.docker.distribution.manifest.v2+json"
    ) -> Tuple[ManifestV2, str]:
        """
        Get manifest for a specific repository and tag
        
        Args:
            repository_name: Name of the repository
            tag: Tag name or digest
            media_type: Accepted media type for manifest
            
        Returns:
            Tuple of (manifest_data, digest)
            
        Raises:
            RegistryException: On API errors or network issues
        """
        await self._ensure_authenticated()
        
        # Check cache first
        cache_key = f"manifest:{repository_name}:{tag}:{media_type}"
        cached_result = self._get_cached(cache_key)
        if cached_result:
            return cached_result
        
        try:
            headers = {"Accept": media_type}
            
            response = await self._make_request(
                "GET",
                f"{self.registry_url}/v2/{repository_name}/manifests/{tag}",
                headers=headers
            )
            
            # Get manifest digest from response headers
            manifest_digest = response.headers.get("Docker-Content-Digest", "")
            
            manifest_data = response.json()
            
            # Validate manifest structure
            if not self._validate_manifest_data(manifest_data):
                raise RegistryValidationError(f"Invalid manifest structure for '{repository_name}:{tag}'")
            
            manifest = ManifestV2(**manifest_data)
            
            result = (manifest, manifest_digest)
            
            # Cache manifest for 10 minutes (manifests are immutable)
            self._set_cache(cache_key, result, 600)
            
            return result
            
        except RegistryNotFoundError:
            raise RegistryNotFoundError(f"Tag '{tag}' not found in repository '{repository_name}'")
        except RegistryException:
            raise
        except Exception as e:
            raise RegistryException(f"Failed to get manifest for '{repository_name}:{tag}': {e}")
    
    async def get_image_info(self, repository_name: str, tag: str) -> ImageInfo:
        """
        Get comprehensive image information including manifest details
        
        Args:
            repository_name: Name of the repository
            tag: Tag name
            
        Returns:
            ImageInfo with complete image metadata
            
        Raises:
            RegistryException: On API errors or network issues
        """
        await self._ensure_authenticated()
        
        # Check cache first
        cache_key = f"image_info:{repository_name}:{tag}"
        cached_result = self._get_cached(cache_key)
        if cached_result:
            return cached_result
        
        try:
            # Get manifest information
            manifest, digest = await self.get_manifest(repository_name, tag)
            
            # Calculate total image size (config + all layers)
            total_size = manifest.config.size
            for layer in manifest.layers:
                total_size += layer.size
            
            # Get config blob for additional metadata (if needed in future)
            # For now, we'll use available manifest information
            
            # Create image info
            image_info = ImageInfo(
                repository=repository_name,
                tag=tag,
                digest=digest,
                size=total_size,
                created=None,  # Would need to fetch config blob for creation time
                architecture=None,  # Would need to fetch config blob for architecture
                os=None,  # Would need to fetch config blob for OS
                pull_command=f"docker pull {repository_name}:{tag}"
            )
            
            # Cache result for 5 minutes
            self._set_cache(cache_key, image_info, 300)
            
            return image_info
            
        except RegistryException:
            raise
        except Exception as e:
            raise RegistryException(f"Failed to get image info for '{repository_name}:{tag}': {e}")
    
    async def get_config_blob(self, repository_name: str, config_digest: str) -> Dict[str, Any]:
        """
        Get configuration blob for detailed image metadata
        
        Args:
            repository_name: Name of the repository
            config_digest: Digest of the configuration blob
            
        Returns:
            Configuration blob data as dictionary
            
        Raises:
            RegistryException: On API errors or network issues
        """
        await self._ensure_authenticated()
        
        # Check cache first
        cache_key = f"config_blob:{repository_name}:{config_digest}"
        cached_result = self._get_cached(cache_key)
        if cached_result:
            return cached_result
        
        try:
            response = await self._make_request(
                "GET",
                f"{self.registry_url}/v2/{repository_name}/blobs/{config_digest}"
            )
            
            config_data = response.json()
            
            # Cache config blob for 1 hour (configs are immutable)
            self._set_cache(cache_key, config_data, 3600)
            
            return config_data
            
        except RegistryNotFoundError:
            raise RegistryNotFoundError(f"Config blob '{config_digest}' not found in repository '{repository_name}'")
        except RegistryException:
            raise
        except Exception as e:
            raise RegistryException(f"Failed to get config blob '{config_digest}' for '{repository_name}': {e}")
    
    async def get_detailed_image_info(self, repository_name: str, tag: str) -> ImageInfo:
        """
        Get detailed image information including creation date and architecture
        
        Args:
            repository_name: Name of the repository
            tag: Tag name
            
        Returns:
            ImageInfo with detailed metadata from config blob
            
        Raises:
            RegistryException: On API errors or network issues
        """
        await self._ensure_authenticated()
        
        # Check cache first
        cache_key = f"detailed_image_info:{repository_name}:{tag}"
        cached_result = self._get_cached(cache_key)
        if cached_result:
            return cached_result
        
        try:
            # Get manifest and config blob
            manifest, digest = await self.get_manifest(repository_name, tag)
            config_data = await self.get_config_blob(repository_name, manifest.config.digest)
            
            # Parse metadata using utility method
            metadata = self._parse_manifest_metadata(manifest, config_data)
            
            # Create detailed image info using utility method
            image_info = self._create_image_info_from_metadata(repository_name, tag, digest, metadata)
            
            # Cache result for 10 minutes
            self._set_cache(cache_key, image_info, 600)
            
            return image_info
            
        except RegistryException:
            raise
        except Exception as e:
            raise RegistryException(f"Failed to get detailed image info for '{repository_name}:{tag}': {e}")
    
    def parse_image_reference(self, image_ref: str) -> Dict[str, str]:
        """
        Parse Docker image reference into components
        
        Args:
            image_ref: Docker image reference (e.g., "registry.com/repo:tag", "repo:tag", "repo@sha256:...")
            
        Returns:
            Dictionary with parsed components (registry, repository, tag, digest)
        """
        components = {
            "registry": None,
            "repository": None,
            "tag": None,
            "digest": None,
            "original": image_ref
        }
        
        # Handle digest references (@sha256:...)
        if "@" in image_ref:
            ref_part, digest_part = image_ref.rsplit("@", 1)
            components["digest"] = digest_part
        else:
            ref_part = image_ref
        
        # Handle tag references (:tag)
        if ":" in ref_part and not ref_part.count(":") > 1:
            # Simple case: no port in registry
            repo_part, tag = ref_part.rsplit(":", 1)
            components["tag"] = tag
        elif ":" in ref_part:
            # Complex case: might have registry with port
            parts = ref_part.split("/")
            if len(parts) > 1 and ":" in parts[0] and "." in parts[0]:
                # First part looks like registry with port
                repo_part = ref_part
                components["tag"] = "latest"
            else:
                # Last colon is tag separator
                repo_part, tag = ref_part.rsplit(":", 1)
                components["tag"] = tag
        else:
            repo_part = ref_part
            components["tag"] = "latest"
        
        # Split registry and repository
        if "/" in repo_part:
            parts = repo_part.split("/", 1)
            if "." in parts[0] or ":" in parts[0] or parts[0] == "localhost":
                # First part is registry
                components["registry"] = parts[0]
                components["repository"] = parts[1]
            else:
                # No explicit registry, assume Docker Hub
                components["repository"] = repo_part
        else:
            components["repository"] = repo_part
        
        return components
    
    def create_pull_command(self, repository: str, tag: str, registry_url: Optional[str] = None) -> str:
        """
        Create docker pull command for an image
        
        Args:
            repository: Repository name
            tag: Tag name
            registry_url: Optional registry URL (uses instance registry if not provided)
            
        Returns:
            Docker pull command string
        """
        if registry_url:
            # Remove protocol from registry URL for pull command
            registry = registry_url.replace("https://", "").replace("http://", "")
            return f"docker pull {registry}/{repository}:{tag}"
        else:
            # Use instance registry URL
            registry = self.registry_url.replace("https://", "").replace("http://", "")
            return f"docker pull {registry}/{repository}:{tag}"
    
    def get_image_layers_info(self, manifest: ManifestV2) -> List[Dict[str, Any]]:
        """
        Extract detailed layer information from manifest
        
        Args:
            manifest: Docker manifest v2 data
            
        Returns:
            List of layer information dictionaries
        """
        layers_info = []
        
        for i, layer in enumerate(manifest.layers):
            layer_info = {
                "index": i,
                "media_type": layer.media_type,
                "size": layer.size,
                "digest": layer.digest,
                "formatted_size": self._format_size(layer.size),
                "is_compressed": "gzip" in layer.media_type.lower() or "zstd" in layer.media_type.lower()
            }
            layers_info.append(layer_info)
        
        return layers_info
    
    def extract_image_commands(self, config_data: Dict[str, Any]) -> List[str]:
        """
        Extract build commands from image history
        
        Args:
            config_data: Image configuration data
            
        Returns:
            List of build commands
        """
        commands = []
        history = config_data.get("history", [])
        
        for entry in history:
            if "created_by" in entry and not entry.get("empty_layer", False):
                command = entry["created_by"]
                # Clean up common Docker build prefixes
                if command.startswith("/bin/sh -c "):
                    command = command[11:]  # Remove "/bin/sh -c "
                elif command.startswith("sh -c "):
                    command = command[6:]   # Remove "sh -c "
                
                commands.append(command)
        
        return commands
    
    def get_repository_summary(self, repositories: List[str]) -> Dict[str, Any]:
        """
        Create summary statistics for repository list
        
        Args:
            repositories: List of repository names
            
        Returns:
            Dictionary with summary statistics
        """
        if not repositories:
            return {
                "total_count": 0,
                "unique_namespaces": 0,
                "namespaces": [],
                "sample_repositories": []
            }
        
        # Extract namespaces
        namespaces = set()
        for repo in repositories:
            if "/" in repo:
                namespace = repo.split("/")[0]
                namespaces.add(namespace)
        
        return {
            "total_count": len(repositories),
            "unique_namespaces": len(namespaces),
            "namespaces": sorted(list(namespaces)),
            "sample_repositories": repositories[:10]  # First 10 as sample
        }
    
    def configure_circuit_breaker(
        self,
        threshold: int = 5,
        timeout: int = 60,
        half_open_max_calls: int = 3
    ):
        """
        Configure circuit breaker parameters
        
        Args:
            threshold: Number of failures before opening circuit
            timeout: Time in seconds to wait before trying half-open
            half_open_max_calls: Max calls allowed in half-open state
        """
        self._circuit_breaker_threshold = threshold
        self._circuit_breaker_timeout = timeout
        self._circuit_breaker_half_open_max_calls = half_open_max_calls
    
    def configure_retry_policy(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        retry_status_codes: Optional[set] = None
    ):
        """
        Configure retry policy parameters
        
        Args:
            max_retries: Maximum number of retry attempts
            base_delay: Base delay between retries in seconds
            max_delay: Maximum delay between retries in seconds
            retry_status_codes: Set of HTTP status codes that should trigger retries
        """
        self.max_retries = max_retries
        self.retry_delay = base_delay
        self._max_retry_delay = max_delay
        if retry_status_codes:
            self._retry_on_status_codes = retry_status_codes
    
    def reset_circuit_breaker(self):
        """Manually reset circuit breaker to closed state"""
        self._circuit_breaker_state = "CLOSED"
        self._failure_count = 0
        self._circuit_breaker_half_open_calls = 0
        self._last_failure_time = 0
        self._last_success_time = time.time()
    
    def get_health_status(self) -> Dict[str, Any]:
        """
        Get comprehensive health status including circuit breaker and retry info
        
        Returns:
            Dictionary with health status information
        """
        current_time = time.time()
        circuit_info = self._get_circuit_breaker_info()
        
        return {
            "circuit_breaker": circuit_info,
            "cache": self.get_cache_stats(),
            "auth": {
                "has_token": bool(self._auth_token),
                "token_expired": self._is_token_expired(),
                "token_expires_at": self._token_expires_at
            },
            "config": {
                "registry_url": self.registry_url,
                "timeout": self.timeout,
                "max_retries": self.max_retries,
                "retry_delay": self.retry_delay,
                "max_retry_delay": self._max_retry_delay
            },
            "stats": {
                "uptime": current_time - self._last_success_time if hasattr(self, '_last_success_time') else 0
            }
        }
    
    def _should_retry_status_code(self, status_code: int) -> bool:
        """Check if a status code should trigger a retry"""
        return status_code in self._retry_on_status_codes
    
    def _should_retry_exception(self, exception: Exception) -> bool:
        """Check if an exception should trigger a retry"""
        return isinstance(exception, self._retry_exceptions)
    
    async def close(self):
        """Clean up resources"""
        self._cache.clear()
        self._auth_token = None
        self._token_expires_at = None
        # Reset circuit breaker on close
        self.reset_circuit_breaker()