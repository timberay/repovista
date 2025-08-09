"""
Mock registry service for development and testing
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
import random
import hashlib
from ..models.schemas import RepositoryInfo, ImageInfo


class MockRegistryClient:
    """Mock registry client that provides sample data for development"""
    
    def __init__(self):
        """Initialize mock registry client with sample data"""
        self.repositories = self._generate_mock_repositories()
        self.tags = self._generate_mock_tags()
    
    def _generate_mock_repositories(self) -> List[Dict[str, Any]]:
        """Generate mock repository data"""
        repos = [
            {"name": "nginx", "description": "Official NGINX Docker image", "base_tags": 15},
            {"name": "alpine", "description": "A minimal Docker image based on Alpine Linux", "base_tags": 25},
            {"name": "ubuntu", "description": "Ubuntu is a Debian-based Linux operating system", "base_tags": 30},
            {"name": "python", "description": "Python is an interpreted, high-level programming language", "base_tags": 50},
            {"name": "node", "description": "Node.js JavaScript runtime", "base_tags": 40},
            {"name": "postgres", "description": "PostgreSQL object-relational database system", "base_tags": 20},
            {"name": "mysql", "description": "MySQL is a widely used, open-source relational database", "base_tags": 18},
            {"name": "redis", "description": "Redis is an open source, in-memory data structure store", "base_tags": 12},
            {"name": "mongodb", "description": "MongoDB document database", "base_tags": 22},
            {"name": "elasticsearch", "description": "Open Source, Distributed, RESTful Search Engine", "base_tags": 16},
            {"name": "rabbitmq", "description": "RabbitMQ is a message broker", "base_tags": 10},
            {"name": "jenkins", "description": "Jenkins automation server", "base_tags": 35},
            {"name": "gitlab", "description": "GitLab is a web-based DevOps lifecycle tool", "base_tags": 28},
            {"name": "traefik", "description": "Traefik is a modern HTTP reverse proxy and load balancer", "base_tags": 15},
            {"name": "prometheus", "description": "Prometheus monitoring system and time series database", "base_tags": 8},
            {"name": "grafana", "description": "Grafana is the open source analytics & monitoring solution", "base_tags": 12},
            {"name": "consul", "description": "Consul is a distributed, highly available, and data center aware solution", "base_tags": 14},
            {"name": "vault", "description": "Tool for secrets management, encryption as a service", "base_tags": 10},
            {"name": "kafka", "description": "Apache Kafka is a distributed streaming platform", "base_tags": 18},
            {"name": "zookeeper", "description": "Apache ZooKeeper is a centralized service", "base_tags": 8},
            {"name": "app/frontend", "description": "Custom frontend application", "base_tags": 5},
            {"name": "app/backend", "description": "Custom backend API service", "base_tags": 7},
            {"name": "app/worker", "description": "Background job processing worker", "base_tags": 3},
            {"name": "app/database", "description": "Database migration and seed container", "base_tags": 2},
            {"name": "tools/backup", "description": "Backup utility container", "base_tags": 4},
        ]
        
        # Add random metadata to each repository
        now = datetime.now(timezone.utc)
        for repo in repos:
            # Random last update within the past 30 days
            days_ago = random.randint(0, 30)
            hours_ago = random.randint(0, 23)
            repo["last_updated"] = now - timedelta(days=days_ago, hours=hours_ago)
            
            # Random size between 10MB and 500MB per tag
            base_size = random.randint(10 * 1024 * 1024, 500 * 1024 * 1024)
            repo["size_bytes"] = base_size * repo["base_tags"]
            
            # Actual tag count may vary slightly from base
            repo["tag_count"] = repo["base_tags"] + random.randint(-2, 5)
            repo["tag_count"] = max(1, repo["tag_count"])  # Ensure at least 1 tag
        
        return repos
    
    def _generate_mock_tags(self) -> Dict[str, List[Dict[str, Any]]]:
        """Generate mock tag data for each repository"""
        tags_data = {}
        
        common_tags = ["latest", "stable", "dev", "staging", "prod", "v1.0.0", "v1.1.0", "v2.0.0", 
                      "alpine", "slim", "bullseye", "jammy", "focal", "bionic"]
        
        for repo in self.repositories:
            repo_name = repo["name"]
            tag_count = repo["tag_count"]
            
            tags = []
            # Always include 'latest' tag
            tags.append(self._create_tag("latest", repo_name))
            
            # Add other tags
            remaining_tags = min(tag_count - 1, len(common_tags) - 1)
            selected_tags = random.sample(common_tags[1:], remaining_tags)
            
            for tag_name in selected_tags:
                tags.append(self._create_tag(tag_name, repo_name))
            
            # Sort tags by created date (newest first)
            tags.sort(key=lambda x: x["created"], reverse=True)
            tags_data[repo_name] = tags
        
        return tags_data
    
    def _create_tag(self, tag_name: str, repo_name: str) -> Dict[str, Any]:
        """Create a mock tag with metadata"""
        now = datetime.now(timezone.utc)
        
        # Generate a fake but consistent digest
        content = f"{repo_name}:{tag_name}"
        digest = hashlib.sha256(content.encode()).hexdigest()
        
        # Random creation date within the past 60 days
        days_ago = random.randint(0, 60)
        created = now - timedelta(days=days_ago)
        
        # Random size between 10MB and 500MB
        size_bytes = random.randint(10 * 1024 * 1024, 500 * 1024 * 1024)
        
        return {
            "tag": tag_name,
            "digest": f"sha256:{digest}",
            "size_bytes": size_bytes,
            "created": created,
            "architecture": random.choice(["amd64", "arm64", "amd64"]),  # More amd64
            "os": "linux"
        }
    
    async def list_repositories(
        self,
        limit: Optional[int] = None,
        last_repository: Optional[str] = None,
        fetch_all: bool = False
    ):
        """List all repository names with pagination support"""
        from ..models.schemas import PaginationInfo
        
        repo_names = [repo["name"] for repo in self.repositories]
        
        # Handle pagination
        start_index = 0
        if last_repository:
            try:
                start_index = repo_names.index(last_repository) + 1
            except ValueError:
                start_index = 0
        
        # Get the requested page
        if fetch_all:
            result = repo_names[start_index:]
        else:
            end_index = start_index + (limit or 100)
            result = repo_names[start_index:end_index]
        
        # Create pagination info
        total_items = len(repo_names)
        page_size = limit or 100
        current_page = (start_index // page_size) + 1
        total_pages = (total_items + page_size - 1) // page_size
        
        pagination = PaginationInfo(
            page=current_page,
            page_size=page_size,
            total_pages=total_pages,
            total_items=total_items,
            has_next=len(result) < len(repo_names[start_index:]),
            has_previous=start_index > 0
        )
        
        return result, pagination
    
    async def get_repository_info(self, repository: str) -> RepositoryInfo:
        """Get repository information"""
        for repo in self.repositories:
            if repo["name"] == repository:
                return RepositoryInfo(
                    name=repo["name"],
                    tag_count=repo["tag_count"],
                    last_updated=repo["last_updated"],
                    size_bytes=repo["size_bytes"]
                )
        
        # Repository not found
        raise ValueError(f"Repository '{repository}' not found")
    
    async def get_repository_tags(
        self, 
        repository_name: str, 
        with_metadata: bool = True
    ) -> List[ImageInfo]:
        """Get tags for a repository with metadata"""
        if repository_name not in self.tags:
            raise ValueError(f"Repository '{repository_name}' not found")
        
        tags = self.tags[repository_name]
        
        # Return ImageInfo objects as expected by the API
        result = []
        for tag in tags:
            image_info = ImageInfo(
                repository=repository_name,
                tag=tag["tag"],
                digest=tag["digest"],
                size=tag["size_bytes"],
                created=tag["created"],
                architecture=tag.get("architecture", "amd64"),
                os=tag.get("os", "linux"),
                pull_command=f"docker pull localhost:5000/{repository_name}:{tag['tag']}"
            )
            result.append(image_info)
        
        return result
    
    async def list_tags(self, repository: str, limit: Optional[int] = None) -> List[ImageInfo]:
        """List tags for a repository"""
        if repository not in self.tags:
            raise ValueError(f"Repository '{repository}' not found")
        
        tags = self.tags[repository]
        if limit:
            tags = tags[:limit]
        
        return [
            ImageInfo(
                repository=repository,
                tag=tag["tag"],
                digest=tag["digest"],
                size=tag["size_bytes"],
                created=tag["created"],
                architecture=tag.get("architecture"),
                os=tag.get("os"),
                pull_command=f"docker pull localhost:5000/{repository}:{tag['tag']}"
            )
            for tag in tags
        ]
    
    async def get_tag_info(self, repository: str, tag: str) -> ImageInfo:
        """Get information about a specific tag"""
        if repository not in self.tags:
            raise ValueError(f"Repository '{repository}' not found")
        
        for tag_data in self.tags[repository]:
            if tag_data["tag"] == tag:
                return ImageInfo(
                    repository=repository,
                    tag=tag_data["tag"],
                    digest=tag_data["digest"],
                    size=tag_data["size_bytes"],
                    created=tag_data["created"],
                    architecture=tag_data.get("architecture"),
                    os=tag_data.get("os"),
                    pull_command=f"docker pull localhost:5000/{repository}:{tag_data['tag']}"
                )
        
        raise ValueError(f"Tag '{tag}' not found in repository '{repository}'")
    
    async def get_detailed_image_info(self, repository: str, tag: str) -> ImageInfo:
        """Get detailed information about a specific tag"""
        return await self.get_tag_info(repository, tag)
    
    def create_pull_command(self, repository: str, tag: str) -> str:
        """Create a docker pull command"""
        return f"docker pull localhost:5000/{repository}:{tag}"
    
    async def ping(self) -> bool:
        """Check if registry is available (always returns True for mock)"""
        return True
    
    async def close(self):
        """Close the client (no-op for mock)"""
        pass