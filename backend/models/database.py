"""
SQLite database models for RepoVista cache
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, 
    JSON, ForeignKey, BigInteger, Index, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

Base = declarative_base()


class Repository(Base):
    """Repository model for caching Docker registry repositories"""
    __tablename__ = "repositories"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    tag_count = Column(Integer, default=0)
    size_bytes = Column(BigInteger, nullable=True)
    last_updated = Column(DateTime, nullable=True)
    cached_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    extra_metadata = Column(JSON, nullable=True)
    
    # Relationship
    tags = relationship("Tag", back_populates="repository", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Repository(name='{self.name}', tags={self.tag_count})>"
    
    def to_dict(self):
        """Convert to dictionary for API response"""
        return {
            "name": self.name,
            "tag_count": self.tag_count,
            "size_bytes": self.size_bytes,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
            "cached_at": self.cached_at.isoformat() if self.cached_at else None,
            "metadata": self.extra_metadata
        }


class Tag(Base):
    """Tag model for caching Docker image tags"""
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_name = Column(String(255), ForeignKey("repositories.name", ondelete="CASCADE"), nullable=False)
    tag = Column(String(255), nullable=False)
    digest = Column(String(500), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    created = Column(DateTime, nullable=True)
    cached_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    extra_metadata = Column(JSON, nullable=True)
    
    # Relationship
    repository = relationship("Repository", back_populates="tags")
    
    # Unique constraint for repository_name + tag combination
    __table_args__ = (
        UniqueConstraint('repository_name', 'tag', name='_repository_tag_uc'),
        Index('idx_repository_tag', 'repository_name', 'tag'),
    )
    
    def __repr__(self):
        return f"<Tag(repo='{self.repository_name}', tag='{self.tag}')>"
    
    def to_dict(self):
        """Convert to dictionary for API response"""
        return {
            "repository_name": self.repository_name,
            "tag": self.tag,
            "digest": self.digest,
            "size_bytes": self.size_bytes,
            "created": self.created.isoformat() if self.created else None,
            "cached_at": self.cached_at.isoformat() if self.cached_at else None,
            "metadata": self.extra_metadata
        }


class CacheMetadata(Base):
    """Metadata for cache management"""
    __tablename__ = "cache_metadata"
    
    key = Column(String(255), primary_key=True)
    value = Column(String(1000), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<CacheMetadata(key='{self.key}', value='{self.value}')>"


# Database connection management
class DatabaseManager:
    """Manage database connections and sessions"""
    
    def __init__(self, database_url: str = "sqlite+aiosqlite:///./backend/data/repovista.db"):
        """Initialize database manager
        
        Args:
            database_url: Database connection URL
        """
        self.database_url = database_url
        self.engine = None
        self.async_session_maker = None
    
    async def init_db(self):
        """Initialize database and create tables"""
        # Create async engine
        self.engine = create_async_engine(
            self.database_url,
            echo=False,  # Set to True for SQL debugging
            future=True
        )
        
        # Create session maker
        self.async_session_maker = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        
        # Create tables if they don't exist
        # Using checkfirst=True to avoid errors when tables already exist
        async with self.engine.begin() as conn:
            # Check if tables exist first
            def create_tables(connection):
                # This will only create tables that don't already exist
                Base.metadata.create_all(bind=connection, checkfirst=True)
            
            await conn.run_sync(create_tables)
    
    async def get_session(self) -> AsyncSession:
        """Get async database session"""
        if not self.async_session_maker:
            await self.init_db()
        return self.async_session_maker()
    
    async def close(self):
        """Close database connections"""
        if self.engine:
            await self.engine.dispose()


# Global database manager instance
db_manager = DatabaseManager()