"""
RepoVista - Docker Registry Web UI Service
Main FastAPI application entry point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
import asyncio
from typing import Dict, Any

# Load environment variables
load_dotenv()

# Import cache services
from .services.cache import cache_service, periodic_cache_cleanup
from .services.sqlite_cache import sqlite_cache

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown"""
    # Startup
    # Initialize SQLite cache
    await sqlite_cache.init()
    print("Initialized SQLite cache")
    
    # Start memory cache cleanup task
    cleanup_task = asyncio.create_task(periodic_cache_cleanup(60))
    print("Started memory cache cleanup task")
    
    yield
    
    # Shutdown
    cleanup_task.cancel()
    await cache_service.clear()
    print("Cleaned up cache and stopped background tasks")

# Create FastAPI application
app = FastAPI(
    title="RepoVista API",
    description="Docker Registry Web UI Service API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# Configure CORS
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/api/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint"""
    return {"status": "healthy", "service": "RepoVista API"}

# Cache stats endpoint
@app.get("/api/cache/stats")
async def cache_stats() -> Dict[str, Any]:
    """Get cache statistics"""
    memory_stats = await cache_service.get_stats()
    sqlite_stats = await sqlite_cache.get_cache_stats()
    return {
        "memory_cache": memory_stats,
        "sqlite_cache": sqlite_stats
    }

# Clear cache endpoint (for manual refresh)
@app.post("/api/cache/clear")
async def clear_cache(pattern: str = None) -> Dict[str, Any]:
    """Clear cache entries"""
    count = await cache_service.clear(pattern)
    return {"cleared": count, "pattern": pattern}


# Root endpoint
@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint"""
    return {"message": "RepoVista API - Docker Registry Web UI Service"}

# Import and include routers
from .api import repositories, tags
# Include tags router first to ensure specific routes are matched before catch-all
app.include_router(tags.router)
app.include_router(repositories.router, tags=["repositories"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", 8000))
    )