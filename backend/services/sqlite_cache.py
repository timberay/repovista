"""
SQLite-based caching service for Docker Registry data
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy import select, delete

from backend.models.database import (
    Repository, Tag, CacheMetadata, db_manager
)

logger = logging.getLogger(__name__)


class SQLiteCacheService:
    """SQLite-based cache service for repository and tag data"""
    
    def __init__(self, cache_ttl_hours: int = 24):
        """Initialize SQLite cache service
        
        Args:
            cache_ttl_hours: Cache time-to-live in hours (default: 24)
        """
        self.cache_ttl = timedelta(hours=cache_ttl_hours)
        self.db_manager = db_manager
    
    async def init(self):
        """Initialize database"""
        await self.db_manager.init_db()
        logger.info("SQLite cache initialized")
    
    async def is_cache_valid(self, cache_key: str = "repositories") -> bool:
        """Check if cache is still valid based on TTL
        
        Args:
            cache_key: Cache key to check
            
        Returns:
            True if cache is valid, False otherwise
        """
        async with await self.db_manager.get_session() as session:
            # Check cache metadata
            result = await session.execute(
                select(CacheMetadata).where(CacheMetadata.key == f"last_refresh_{cache_key}")
            )
            metadata = result.scalar_one_or_none()
            
            if not metadata:
                return False
            
            # Check if cache is expired
            cache_age = datetime.utcnow() - metadata.updated_at
            return cache_age < self.cache_ttl
    
    async def get_repositories(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Dict[str, Any]:
        """Get repositories from cache
        
        Args:
            page: Page number
            page_size: Items per page
            search: Search term
            sort_by: Sort field
            sort_order: Sort order (asc/desc)
            
        Returns:
            Dictionary with repositories and pagination info
        """
        async with await self.db_manager.get_session() as session:
            # Build query
            query = select(Repository)
            
            # Apply search filter
            if search:
                query = query.where(Repository.name.ilike(f"%{search}%"))
            
            # Apply sorting
            order_column = getattr(Repository, sort_by, Repository.name)
            if sort_order == "desc":
                query = query.order_by(order_column.desc())
            else:
                query = query.order_by(order_column.asc())
            
            # Count total items
            count_query = select(Repository)
            if search:
                count_query = count_query.where(Repository.name.ilike(f"%{search}%"))
            
            total_result = await session.execute(count_query)
            total_items = len(total_result.scalars().all())
            
            # Apply pagination
            offset = (page - 1) * page_size
            query = query.offset(offset).limit(page_size)
            
            # Execute query
            result = await session.execute(query)
            repositories = result.scalars().all()
            
            # Convert to dict
            repo_list = [repo.to_dict() for repo in repositories]
            
            # Calculate pagination
            total_pages = (total_items + page_size - 1) // page_size
            
            return {
                "repositories": repo_list,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_count": total_items,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1,
                    "next_page": page + 1 if page < total_pages else None,
                    "prev_page": page - 1 if page > 1 else None
                }
            }
    
    async def get_tags(self, repository_name: str) -> List[Dict[str, Any]]:
        """Get tags for a repository from cache
        
        Args:
            repository_name: Repository name
            
        Returns:
            List of tag dictionaries
        """
        async with await self.db_manager.get_session() as session:
            # Query tags
            result = await session.execute(
                select(Tag)
                .where(Tag.repository_name == repository_name)
                .order_by(Tag.tag.desc())
            )
            tags = result.scalars().all()
            
            return [tag.to_dict() for tag in tags]
    
    async def save_repositories(self, repositories_data: List[Dict[str, Any]]):
        """Save repositories to cache
        
        Args:
            repositories_data: List of repository data from Docker Registry
        """
        async with await self.db_manager.get_session() as session:
            try:
                # Clear existing repositories
                await session.execute(delete(Repository))
                
                # Insert new repositories
                for repo_data in repositories_data:
                    # Handle last_updated which might be datetime or string
                    last_updated = repo_data.get("last_updated")
                    if last_updated:
                        if isinstance(last_updated, str):
                            last_updated = datetime.fromisoformat(last_updated)
                        elif not isinstance(last_updated, datetime):
                            last_updated = None
                    
                    repository = Repository(
                        name=repo_data["name"],
                        tag_count=repo_data.get("tag_count", 0),
                        size_bytes=repo_data.get("size_bytes"),
                        last_updated=last_updated,
                        cached_at=datetime.utcnow(),
                        extra_metadata=repo_data.get("metadata", {})
                    )
                    session.add(repository)
                
                # Update cache metadata
                metadata = await session.execute(
                    select(CacheMetadata).where(CacheMetadata.key == "last_refresh_repositories")
                )
                cache_meta = metadata.scalar_one_or_none()
                
                if cache_meta:
                    cache_meta.value = datetime.utcnow().isoformat()
                    cache_meta.updated_at = datetime.utcnow()
                else:
                    cache_meta = CacheMetadata(
                        key="last_refresh_repositories",
                        value=datetime.utcnow().isoformat(),
                        updated_at=datetime.utcnow()
                    )
                    session.add(cache_meta)
                
                await session.commit()
                logger.info(f"Saved {len(repositories_data)} repositories to cache")
                
            except Exception as e:
                await session.rollback()
                logger.error(f"Error saving repositories to cache: {e}")
                raise
    
    async def save_tags(self, repository_name: str, tags_data: List[Dict[str, Any]]):
        """Save tags for a repository to cache
        
        Args:
            repository_name: Repository name
            tags_data: List of tag data from Docker Registry
        """
        async with await self.db_manager.get_session() as session:
            try:
                # Delete existing tags for this repository
                await session.execute(
                    delete(Tag).where(Tag.repository_name == repository_name)
                )
                
                # Insert new tags
                for tag_data in tags_data:
                    # Handle created which might be datetime or string
                    created = tag_data.get("created")
                    if created:
                        if isinstance(created, str):
                            created = datetime.fromisoformat(created)
                        elif not isinstance(created, datetime):
                            created = None
                    
                    tag = Tag(
                        repository_name=repository_name,
                        tag=tag_data["tag"],
                        digest=tag_data.get("digest"),
                        size_bytes=tag_data.get("size_bytes"),
                        created=created,
                        cached_at=datetime.utcnow(),
                        extra_metadata=tag_data.get("metadata", {})
                    )
                    session.add(tag)
                
                # Update repository tag count
                repo_result = await session.execute(
                    select(Repository).where(Repository.name == repository_name)
                )
                repository = repo_result.scalar_one_or_none()
                if repository:
                    repository.tag_count = len(tags_data)
                
                await session.commit()
                logger.info(f"Saved {len(tags_data)} tags for repository {repository_name}")
                
            except Exception as e:
                await session.rollback()
                logger.error(f"Error saving tags to cache: {e}")
                raise
    
    async def clear_cache(self):
        """Clear all cached data"""
        async with await self.db_manager.get_session() as session:
            try:
                # Clear all tables
                await session.execute(delete(Tag))
                await session.execute(delete(Repository))
                await session.execute(delete(CacheMetadata))
                
                await session.commit()
                logger.info("Cache cleared successfully")
                
            except Exception as e:
                await session.rollback()
                logger.error(f"Error clearing cache: {e}")
                raise
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics
        
        Returns:
            Dictionary with cache statistics
        """
        async with await self.db_manager.get_session() as session:
            # Count repositories
            repo_result = await session.execute(select(Repository))
            repo_count = len(repo_result.scalars().all())
            
            # Count tags
            tag_result = await session.execute(select(Tag))
            tag_count = len(tag_result.scalars().all())
            
            # Get last refresh time
            metadata_result = await session.execute(
                select(CacheMetadata).where(CacheMetadata.key == "last_refresh_repositories")
            )
            last_refresh = metadata_result.scalar_one_or_none()
            
            return {
                "repository_count": repo_count,
                "tag_count": tag_count,
                "last_refresh": last_refresh.value if last_refresh else None,
                "cache_ttl_hours": self.cache_ttl.total_seconds() / 3600,
                "cache_valid": await self.is_cache_valid()
            }


# Global SQLite cache instance
sqlite_cache = SQLiteCacheService()