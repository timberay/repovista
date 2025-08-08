"""
Repository name handling utilities
"""

import re
import urllib.parse
from typing import Tuple, Optional, Dict, Any, List


class RepositoryNameValidator:
    """
    Validator for Docker repository names according to Docker Registry v2 API specification
    """
    
    # Docker repository name components patterns
    COMPONENT_PATTERN = re.compile(r'^[a-z0-9]+(?:[._-][a-z0-9]+)*$')
    NAME_PATTERN = re.compile(r'^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$')
    
    # Registry hostname patterns
    HOSTNAME_PATTERN = re.compile(
        r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?::[0-9]{1,5})?$'
    )
    
    @classmethod
    def is_valid_repository_name(cls, name: str) -> bool:
        """
        Validate if a repository name follows Docker naming conventions
        
        Args:
            name: Repository name to validate
            
        Returns:
            True if valid, False otherwise
        """
        if not name or len(name) > 255:  # Max length for repository names
            return False
            
        # Check for valid characters and structure
        return bool(cls.NAME_PATTERN.match(name.lower()))
    
    @classmethod
    def is_valid_hostname(cls, hostname: str) -> bool:
        """
        Validate if a hostname is valid for registry URLs
        
        Args:
            hostname: Hostname to validate
            
        Returns:
            True if valid, False otherwise
        """
        if not hostname:
            return False
            
        return bool(cls.HOSTNAME_PATTERN.match(hostname))
    
    @classmethod
    def validate_repository_components(cls, name: str) -> Dict[str, Any]:
        """
        Validate repository name and return detailed analysis
        
        Args:
            name: Repository name to analyze
            
        Returns:
            Dictionary with validation results and details
        """
        result = {
            "valid": False,
            "name": name,
            "issues": [],
            "suggestions": []
        }
        
        if not name:
            result["issues"].append("Repository name cannot be empty")
            return result
        
        if len(name) > 255:
            result["issues"].append(f"Repository name too long ({len(name)} > 255 chars)")
        
        # Check for uppercase characters
        if name != name.lower():
            result["issues"].append("Repository name must be lowercase")
            result["suggestions"].append(f"Use: {name.lower()}")
        
        # Check for invalid characters
        if not cls.NAME_PATTERN.match(name.lower()):
            result["issues"].append("Repository name contains invalid characters")
            result["suggestions"].append("Use only lowercase letters, numbers, dots, underscores, and hyphens")
        
        # Check for consecutive special characters
        if re.search(r'[._-]{2,}', name):
            result["issues"].append("Consecutive special characters not allowed")
        
        # Check start/end characters
        if name.startswith(('.', '_', '-')) or name.endswith(('.', '_', '-')):
            result["issues"].append("Repository name cannot start or end with special characters")
        
        # If no issues found, it's valid
        result["valid"] = len(result["issues"]) == 0
        
        return result


def parse_repository_reference(repo_ref: str) -> Dict[str, Optional[str]]:
    """
    Parse a full repository reference into components
    
    Args:
        repo_ref: Repository reference (e.g., "registry.com/namespace/repo:tag")
        
    Returns:
        Dictionary with parsed components
    """
    components = {
        "registry": None,
        "namespace": None,
        "repository": None,
        "full_name": None,
        "tag": None,
        "digest": None,
        "original": repo_ref
    }
    
    # Handle digest references (@sha256:...)
    if "@" in repo_ref:
        ref_part, digest_part = repo_ref.rsplit("@", 1)
        components["digest"] = digest_part
    else:
        ref_part = repo_ref
    
    # Handle tag references (:tag)
    if ":" in ref_part:
        # Check if this is a registry with port (registry.com:5000) or a tag (repo:v1.0)
        parts = ref_part.split("/")
        if len(parts) > 1 and ":" in parts[0] and ("." in parts[0] or parts[0].startswith("localhost")):
            # Likely registry with port
            repo_part = ref_part
            components["tag"] = "latest"
        else:
            # Tag reference
            repo_part, tag = ref_part.rsplit(":", 1)
            components["tag"] = tag
    else:
        repo_part = ref_part
        components["tag"] = "latest"
    
    # Split registry and repository
    if "/" in repo_part:
        parts = repo_part.split("/")
        
        # Check if first part looks like a registry (has dots, colons, or is localhost)
        first_part = parts[0]
        if ("." in first_part or ":" in first_part or 
            first_part == "localhost" or first_part.startswith("localhost:")):
            components["registry"] = first_part
            remaining_parts = parts[1:]
        else:
            # No explicit registry
            remaining_parts = parts
        
        # Split namespace and repository
        if len(remaining_parts) > 1:
            components["namespace"] = "/".join(remaining_parts[:-1])
            components["repository"] = remaining_parts[-1]
            components["full_name"] = "/".join(remaining_parts)
        else:
            components["repository"] = remaining_parts[0]
            components["full_name"] = remaining_parts[0]
    else:
        components["repository"] = repo_part
        components["full_name"] = repo_part
    
    return components


def normalize_repository_name(name: str) -> str:
    """
    Normalize repository name for consistent handling
    
    Args:
        name: Raw repository name from URL path
        
    Returns:
        Normalized repository name
    """
    # URL decode if needed
    decoded_name = urllib.parse.unquote(name)
    
    # Convert to lowercase
    normalized = decoded_name.lower().strip()
    
    # Remove duplicate slashes
    normalized = re.sub(r'/+', '/', normalized)
    
    # Remove leading/trailing slashes
    normalized = normalized.strip('/')
    
    return normalized


def create_repository_url_path(repo_name: str) -> str:
    """
    Create URL-safe path for repository name
    
    Args:
        repo_name: Repository name
        
    Returns:
        URL-encoded path suitable for use in API endpoints
    """
    # URL encode the repository name, keeping slashes as path separators
    return urllib.parse.quote(repo_name, safe='/')


def extract_namespace_and_repo(full_name: str) -> Tuple[Optional[str], str]:
    """
    Extract namespace and repository name from full repository name
    
    Args:
        full_name: Full repository name (e.g., "library/nginx")
        
    Returns:
        Tuple of (namespace, repo_name)
    """
    if "/" in full_name:
        parts = full_name.split("/")
        if len(parts) >= 2:
            namespace = "/".join(parts[:-1])
            repo_name = parts[-1]
            return namespace, repo_name
    
    return None, full_name


def is_official_repository(repo_name: str) -> bool:
    """
    Check if a repository is an official Docker Hub repository
    
    Args:
        repo_name: Repository name to check
        
    Returns:
        True if it's likely an official repository
    """
    # Official repositories typically have no namespace or use 'library' namespace
    namespace, _ = extract_namespace_and_repo(repo_name)
    return namespace is None or namespace == "library"


def format_repository_display_name(repo_name: str) -> str:
    """
    Format repository name for display purposes
    
    Args:
        repo_name: Repository name
        
    Returns:
        Formatted display name
    """
    # For official repositories, show just the repo name
    if is_official_repository(repo_name):
        _, display_name = extract_namespace_and_repo(repo_name)
        return display_name
    
    return repo_name


def repository_name_to_breadcrumb(repo_name: str) -> List[Dict[str, str]]:
    """
    Convert repository name to breadcrumb navigation items
    
    Args:
        repo_name: Repository name (e.g., "registry.com/namespace/repo")
        
    Returns:
        List of breadcrumb items with name and path
    """
    breadcrumbs = []
    parts = repo_name.split("/")
    
    current_path = ""
    for i, part in enumerate(parts):
        if i > 0:
            current_path += "/"
        current_path += part
        
        breadcrumbs.append({
            "name": part,
            "path": current_path,
            "is_last": i == len(parts) - 1
        })
    
    return breadcrumbs