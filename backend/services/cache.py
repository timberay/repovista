"""
Caching service for Docker Registry API responses
"""
import hashlib
import json
import time
from typing import Any, Optional, Dict
from functools import wraps
import asyncio


class CacheService:
    """In-memory cache service with TTL support"""
    
    def __init__(self, default_ttl: int = 300):
        """
        Initialize cache service
        
        Args:
            default_ttl: Default time-to-live in seconds (5 minutes)
        """
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._default_ttl = default_ttl
        self._lock = asyncio.Lock()
        
    def _get_cache_key(self, prefix: str, params: dict) -> str:
        """Generate cache key from prefix and parameters"""
        # Sort params for consistent key generation
        sorted_params = json.dumps(params, sort_keys=True)
        hash_digest = hashlib.md5(sorted_params.encode()).hexdigest()[:8]
        return f"{prefix}:{hash_digest}"
    
    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if expired/not found
        """
        async with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if entry['expires_at'] > time.time():
                    entry['hits'] = entry.get('hits', 0) + 1
                    return entry['value']
                else:
                    # Remove expired entry
                    del self._cache[key]
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """
        Set value in cache
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (uses default if not specified)
        """
        ttl = ttl or self._default_ttl
        async with self._lock:
            self._cache[key] = {
                'value': value,
                'expires_at': time.time() + ttl,
                'created_at': time.time(),
                'hits': 0
            }
    
    async def delete(self, key: str) -> bool:
        """
        Delete entry from cache
        
        Args:
            key: Cache key
            
        Returns:
            True if deleted, False if not found
        """
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    async def clear(self, pattern: Optional[str] = None) -> int:
        """
        Clear cache entries
        
        Args:
            pattern: Optional key pattern to match (prefix)
            
        Returns:
            Number of entries cleared
        """
        async with self._lock:
            if pattern:
                keys_to_delete = [
                    key for key in self._cache.keys() 
                    if key.startswith(pattern)
                ]
                for key in keys_to_delete:
                    del self._cache[key]
                return len(keys_to_delete)
            else:
                count = len(self._cache)
                self._cache.clear()
                return count
    
    async def cleanup_expired(self) -> int:
        """
        Remove expired entries from cache
        
        Returns:
            Number of entries removed
        """
        async with self._lock:
            current_time = time.time()
            expired_keys = [
                key for key, entry in self._cache.items()
                if entry['expires_at'] <= current_time
            ]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)
    
    async def get_stats(self) -> dict:
        """
        Get cache statistics
        
        Returns:
            Dictionary with cache stats
        """
        async with self._lock:
            total_entries = len(self._cache)
            current_time = time.time()
            
            expired_count = sum(
                1 for entry in self._cache.values()
                if entry['expires_at'] <= current_time
            )
            
            total_hits = sum(
                entry.get('hits', 0) for entry in self._cache.values()
            )
            
            # Calculate memory usage (approximate)
            memory_bytes = sum(
                len(json.dumps(entry['value'])) 
                for entry in self._cache.values()
            )
            
            return {
                'total_entries': total_entries,
                'expired_entries': expired_count,
                'active_entries': total_entries - expired_count,
                'total_hits': total_hits,
                'memory_bytes': memory_bytes,
                'memory_mb': round(memory_bytes / (1024 * 1024), 2)
            }


# Global cache instance
cache_service = CacheService()


def cache_result(ttl: int = 300, key_prefix: str = ""):
    """
    Decorator for caching async function results
    
    Args:
        ttl: Time-to-live in seconds
        key_prefix: Prefix for cache key
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            cache_key_data = {
                'func': func.__name__,
                'args': str(args),
                'kwargs': str(kwargs)
            }
            cache_key = cache_service._get_cache_key(
                key_prefix or func.__name__,
                cache_key_data
            )
            
            # Try to get from cache
            cached = await cache_service.get(cache_key)
            if cached is not None:
                return cached
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            await cache_service.set(cache_key, result, ttl)
            return result
        
        return wrapper
    return decorator


class ETAGCache:
    """HTTP ETag-based caching support"""
    
    def __init__(self):
        self._etags: Dict[str, str] = {}
        self._lock = asyncio.Lock()
    
    def generate_etag(self, content: Any) -> str:
        """Generate ETag from content"""
        content_str = json.dumps(content, sort_keys=True)
        return f'W/"{hashlib.md5(content_str.encode()).hexdigest()}"'
    
    async def get_etag(self, key: str) -> Optional[str]:
        """Get stored ETag for a key"""
        async with self._lock:
            return self._etags.get(key)
    
    async def set_etag(self, key: str, etag: str) -> None:
        """Store ETag for a key"""
        async with self._lock:
            self._etags[key] = etag
    
    async def validate_etag(self, key: str, client_etag: str) -> bool:
        """Check if client ETag matches stored ETag"""
        stored_etag = await self.get_etag(key)
        return stored_etag == client_etag if stored_etag else False


# Global ETag cache instance
etag_cache = ETAGCache()


# Periodic cleanup task
async def periodic_cache_cleanup(interval: int = 60):
    """
    Periodically clean up expired cache entries
    
    Args:
        interval: Cleanup interval in seconds
    """
    while True:
        await asyncio.sleep(interval)
        removed = await cache_service.cleanup_expired()
        if removed > 0:
            print(f"Cache cleanup: Removed {removed} expired entries")