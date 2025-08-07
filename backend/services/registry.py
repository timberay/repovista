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
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class RegistryAuthError(RegistryException):
    """Authentication failed"""
    pass


class RegistryNotFoundError(RegistryException):
    """Resource not found"""
    pass


class RegistryConnectionError(RegistryException):
    """Connection or network error"""
    pass


class RegistryTimeoutError(RegistryException):
    """Request timeout"""
    pass


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
        
        # Circuit breaker state
        self._failure_count = 0
        self._last_failure_time = 0
        self._circuit_breaker_threshold = 5
        self._circuit_breaker_timeout = 60
    
    def _is_circuit_open(self) -> bool:
        """Check if circuit breaker is open"""
        if self._failure_count < self._circuit_breaker_threshold:
            return False
        
        if time.time() - self._last_failure_time > self._circuit_breaker_timeout:
            self._failure_count = 0
            return False
        
        return True
    
    def _record_failure(self):
        """Record a failure for circuit breaker"""
        self._failure_count += 1
        self._last_failure_time = time.time()
    
    def _record_success(self):
        """Record a success, reset circuit breaker"""
        self._failure_count = 0
    
    def _get_cached(self, key: str) -> Optional[Any]:
        """Get item from cache if not expired"""
        if key in self._cache:
            value, expires_at = self._cache[key]
            if time.time() < expires_at:
                return value
            else:
                del self._cache[key]
        return None
    
    def _set_cache(self, key: str, value: Any, ttl: Optional[float] = None):
        """Set item in cache with TTL"""
        if ttl is None:
            ttl = self._cache_ttl
        expires_at = time.time() + ttl
        self._cache[key] = (value, expires_at)
    
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
        if self._is_circuit_open():
            raise RegistryConnectionError("Circuit breaker is open")
        
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
            except RegistryException:
                raise  # Re-raise our own exceptions
            except Exception as e:
                last_exception = RegistryException(f"Unexpected error: {e}")
            
            # Wait before retry (exponential backoff)
            if attempt < self.max_retries:
                wait_time = self.retry_delay * (2 ** attempt)
                await asyncio.sleep(wait_time)
        
        # All retries failed
        self._record_failure()
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
        Handle error responses from Registry API
        
        Args:
            response: HTTP error response
            
        Raises:
            Appropriate RegistryException subclass
        """
        if response.status_code == 401:
            raise RegistryAuthError("Authentication failed")
        elif response.status_code == 404:
            raise RegistryNotFoundError("Resource not found")
        elif response.status_code >= 500:
            raise RegistryConnectionError(f"Server error: {response.status_code}")
        
        # Try to parse error details
        try:
            error_data = response.json()
            if "errors" in error_data:
                error_response = RegistryErrorResponse(**error_data)
                error_messages = [f"{err.code}: {err.message}" for err in error_response.errors]
                raise RegistryException("; ".join(error_messages), response.status_code)
        except (json.JSONDecodeError, ValueError):
            pass
        
        # Generic error
        raise RegistryException(f"HTTP {response.status_code}: {response.reason_phrase}", response.status_code)
    
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
            
    async def close(self):
        """Clean up resources"""
        self._cache.clear()
        self._auth_token = None
        self._token_expires_at = None