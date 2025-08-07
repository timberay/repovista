"""
RepoVista - Docker Registry Web UI Service
Main FastAPI application entry point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from typing import Dict

# Load environment variables
load_dotenv()

# Create FastAPI application
app = FastAPI(
    title="RepoVista API",
    description="Docker Registry Web UI Service API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
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

# Root endpoint
@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint"""
    return {"message": "RepoVista API - Docker Registry Web UI Service"}

# Import and include routers (to be added)
# from api import repositories, tags
# app.include_router(repositories.router, prefix="/api/repositories", tags=["repositories"])
# app.include_router(tags.router, prefix="/api/tags", tags=["tags"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", 8000))
    )