// Global variables
let currentPage = 1;
let totalPages = 1;
let repositories = [];
let allRepositories = []; // Complete unfiltered list for tree display
let searchTerm = '';
let isLoading = false;
let registryUrl = 'localhost:5000'; // Default registry URL

// API configuration
const API_BASE_URL = '/api';

// Utility functions
const utils = {
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    formatDate(dateString) {
        if (!dateString) return 'No date';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'No date';
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) + ' ' + date.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false
            });
        } catch (error) {
            return 'No date';
        }
    },

    showNotification(message, type = 'success') {
        try {
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 3000);
        } catch (error) {
            console.error('Failed to show notification:', error);
        }
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// API functions
const api = {
    async fetchRegistryConfig() {
        try {
            const response = await fetch(`${API_BASE_URL}/repositories/config`);
            if (response.ok) {
                const config = await response.json();
                if (config.registry_url) {
                    // Extract hostname and port from registry URL
                    const url = new URL(config.registry_url);
                    registryUrl = url.host || url.hostname;
                }
            }
        } catch (error) {
            console.warn('Failed to fetch registry config, using default:', error);
        }
    },

    async fetchRepositories(page = 1, search = '', forceRefresh = false) {
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                page_size: '20',
                include_metadata: 'true',
                force_refresh: forceRefresh.toString()
            });

            if (search && search.trim()) {
                params.append('search', search.trim());
            }

            const response = await fetch(`${API_BASE_URL}/repositories/?${params}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    },

    async fetchTags(repositoryName) {
        try {
            if (!repositoryName) {
                throw new Error('Repository name is required.');
            }

            const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repositoryName)}/tags?page_size=50`);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to fetch tags:', error);
            throw error;
        }
    }
};

// UI rendering functions
const ui = {
    showLoading() {
        const repositoriesDiv = document.getElementById('repositories');
        if (repositoriesDiv) {
            repositoriesDiv.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading repositories...</p>
                </div>
            `;
        }
    },

    showError(message) {
        const repositoriesDiv = document.getElementById('repositories');
        if (repositoriesDiv) {
            repositoriesDiv.innerHTML = `
                <div class="error">
                    <h3>An error occurred</h3>
                    <p>${utils.escapeHtml(message)}</p>
                    <button onclick="loadRepositories()">Try Again</button>
                </div>
            `;
        }
    },

    renderRepositories(repos, pagination) {
        const repositoriesDiv = document.getElementById('repositories');
        if (!repositoriesDiv) return;
        
        if (!repos || repos.length === 0) {
            repositoriesDiv.innerHTML = `
                <div class="repositories-content">
                    <div class="empty-state">
                        <h3>No repositories found</h3>
                        <p>${searchTerm ? 'Try changing your search criteria.' : 'No repositories in the registry.'}</p>
                    </div>
                </div>
            `;
            return;
        }

        // Render all cards with staggered animation, wrapped in content container
        repositoriesDiv.innerHTML = `
            <div class="repositories-content">
                ${repos.map((repo, index) => {
                    const cardHtml = this.renderRepositoryCard(repo);
                    // Add animation delay based on index
                    return cardHtml.replace(
                        'class="repository-card"',
                        `class="repository-card" style="animation-delay: ${index * 0.1}s"`
                    );
                }).join('')}
            </div>
        `;
        
        // Update pagination
        this.renderPagination(pagination);
    },

    renderRepositoryCard(repo) {
        if (!repo || !repo.name) return '';
        
        const sizeFormatted = repo.size_bytes ? utils.formatFileSize(repo.size_bytes) : 'Size unknown';
        const lastUpdated = utils.formatDate(repo.last_updated);
        const tagCount = repo.tag_count || 0;
        
        // Create match indicator if this is a search result
        let matchIndicator = '';
        if (repo.match_type === 'tag_name' && repo.matched_tags && repo.matched_tags.length > 0) {
            const matchedTagsText = repo.matched_tags.slice(0, 3).join(', ');
            const moreCount = repo.matched_tags.length > 3 ? ` +${repo.matched_tags.length - 3} more` : '';
            matchIndicator = `
                <div class="match-indicator">
                    <span class="match-badge">🏷️ Tag match: ${utils.escapeHtml(matchedTagsText)}${moreCount}</span>
                </div>
            `;
        }
        
        return `
            <div class="repository-card" data-repo="${utils.escapeHtml(repo.name)}">
                <div class="repo-header" onclick="toggleExpand(this)">
                    <div class="repo-info">
                        <div class="repo-name">
                            <span>📦</span>
                            <span>${utils.escapeHtml(repo.name)}</span>
                            <span class="badge">${tagCount} tags</span>
                        </div>
                        ${matchIndicator}
                        <div class="repo-meta">
                            <span>💾 Total size: ${sizeFormatted}</span>
                            <span>📅 Last updated: ${lastUpdated}</span>
                        </div>
                    </div>
                    <span class="expand-icon">▼</span>
                </div>
                <div class="tags-table">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>Loading tags...</p>
                    </div>
                </div>
            </div>
        `;
    },

    renderTagsTable(repoName, tags, matchedTags = []) {
        if (!tags || tags.length === 0) {
            return `
                <div class="empty-state">
                    <h3>No tags found</h3>
                    <p>This repository has no tags.</p>
                </div>
            `;
        }

        return `
            <table>
                <thead>
                    <tr>
                        <th>Tag</th>
                        <th>Image ID</th>
                        <th>Size</th>
                        <th>Created</th>
                        <th>Pull Command</th>
                    </tr>
                </thead>
                <tbody>
                    ${tags.map(tag => {
                        const tagName = tag.tag || 'N/A';
                        const digest = tag.digest ? tag.digest.substring(0, 12) + '...' : 'N/A';
                        const size = tag.size_formatted || utils.formatFileSize(tag.size_bytes) || 'N/A';
                        const created = tag.created_formatted || utils.formatDate(tag.created) || 'N/A';
                        const pullCommand = `docker pull ${registryUrl}/${repoName}:${tagName}`;
                        
                        // Check if this tag was matched in the search
                        const isMatched = matchedTags.includes(tagName);
                        const rowClass = isMatched ? 'matched-tag-row' : '';
                        const tagClass = isMatched ? 'matched-tag-name' : 'tag-name';
                        
                        return `
                            <tr class="${rowClass}">
                                <td class="${tagClass}">
                                    ${isMatched ? '🏷️ ' : ''}${utils.escapeHtml(tagName)}
                                </td>
                                <td class="image-id">
                                    <span>${utils.escapeHtml(digest)}</span>
                                    <button class="copy-btn-inline" onclick="copyImageId('${utils.escapeHtml(tag.digest || '')}')">
                                        <i class="far fa-copy"></i>
                                    </button>
                                </td>
                                <td>${utils.escapeHtml(size)}</td>
                                <td>${utils.escapeHtml(created)}</td>
                                <td class="pull-command">
                                    <span class="command-text">${utils.escapeHtml(pullCommand)}</span>
                                    <button class="copy-btn-inline" onclick="copyPullCommand('${utils.escapeHtml(repoName)}', '${utils.escapeHtml(tagName)}')">
                                        <i class="far fa-copy"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },

    renderPagination(pagination) {
        const paginationDiv = document.getElementById('pagination');
        const pageNumbersDiv = document.getElementById('page-numbers');
        
        if (!paginationDiv || !pageNumbersDiv) return;
        
        // Always show pagination
        paginationDiv.style.display = 'flex';
        
        // Set default values if pagination data is missing
        const currentPage = pagination?.page || 1;
        const totalPages = pagination?.total_pages || 1;
        
        // Generate page numbers
        let pageNumbers = '';
        
        if (!pagination || totalPages === 0) {
            // Show page 1 as disabled when no data
            pageNumbers = '<button class="page-btn active" disabled>1</button>';
        } else if (totalPages === 1) {
            // Show single page as active
            pageNumbers = '<button class="page-btn active">1</button>';
        } else {
            // Multiple pages - existing logic
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);

            for (let i = startPage; i <= endPage; i++) {
                const activeClass = i === currentPage ? 'active' : '';
                pageNumbers += `<button class="page-btn ${activeClass}" onclick="goToPage(${i})">${i}</button>`;
            }
        }

        pageNumbersDiv.innerHTML = pageNumbers;

        // Update prev/next button states
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        
        if (prevBtn) {
            // Disable prev button on first page or when no data
            prevBtn.disabled = currentPage <= 1 || !pagination || totalPages === 0;
        }
        if (nextBtn) {
            // Disable next button on last page or when no data
            nextBtn.disabled = currentPage >= totalPages || !pagination || totalPages === 0;
        }
    }
};

// Registry tree builder and renderer
const registryTree = {
    treeData: null,
    expandedPaths: new Set(['Registries']), // Track expanded paths, root is always expanded
    
    // Build tree from repositories data with optional search highlighting
    buildTree(repositories, searchTerm = '') {
        const root = { 
            name: 'Registries', 
            children: {}, 
            expanded: true,
            isRoot: true 
        };
        
        const searchLower = searchTerm.toLowerCase();
        
        repositories.forEach(repo => {
            const parts = repo.name.split('/');
            let current = root;
            
            // Check if this repository matches the search term
            const isMatched = searchTerm && repo.name.toLowerCase().includes(searchLower);
            
            // Build path nodes
            parts.forEach((part, index) => {
                if (!current.children[part]) {
                    const fullPath = parts.slice(0, index + 1).join('/');
                    current.children[part] = {
                        name: part,
                        path: fullPath,
                        children: {},
                        expanded: this.expandedPaths.has(fullPath), // Use saved expansion state
                        isRepo: index === parts.length - 1,
                        repoData: index === parts.length - 1 ? repo : null,
                        isHighlighted: isMatched && index === parts.length - 1 // Highlight matching repos
                    };
                }
                current = current.children[part];
            });
        });
        
        this.treeData = root;
        return root;
    },
    
    // Toggle node expansion
    toggleNode(element, event) {
        if (event) {
            event.stopPropagation(); // Prevent triggering parent click handlers
        }
        
        const nodeDiv = element.closest('.tree-node');
        const childrenDiv = nodeDiv.querySelector(':scope > .tree-children');
        const expandIcon = nodeDiv.querySelector('.tree-expand-icon');
        const nodePath = nodeDiv.getAttribute('data-path') || 'Registries';
        
        if (childrenDiv) {
            const isExpanded = !childrenDiv.classList.contains('collapsed');
            if (isExpanded) {
                childrenDiv.classList.add('collapsed');
                expandIcon.textContent = '▶';
                // Remove from expanded paths
                this.expandedPaths.delete(nodePath);
            } else {
                childrenDiv.classList.remove('collapsed');
                expandIcon.textContent = '▼';
                // Add to expanded paths
                this.expandedPaths.add(nodePath);
            }
        }
    },
    
    // Capture current expansion state from DOM
    captureExpandedState() {
        const expandedNodes = document.querySelectorAll('.tree-node .tree-children:not(.collapsed)');
        this.expandedPaths.clear();
        this.expandedPaths.add('Registries'); // Root is always expanded
        
        expandedNodes.forEach(node => {
            const parentNode = node.closest('.tree-node');
            if (parentNode) {
                const path = parentNode.getAttribute('data-path');
                if (path) {
                    this.expandedPaths.add(path);
                }
            }
        });
    },
    
    // Search by repository when clicking on tree node name
    searchByRepository(repoPath, event) {
        if (event) {
            event.stopPropagation(); // Prevent triggering parent click handlers
        }
        
        // Capture current expansion state before rebuilding tree
        this.captureExpandedState();
        
        // Update search input field
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = repoPath;
        }
        
        // Update global search term and trigger search
        searchTerm = repoPath;
        currentPage = 1;
        loadRepositories();
    }
};

// Tree renderer
const treeRenderer = {
    renderTree(node, level = 0) {
        if (level === 0) {
            return `<div class="tree-root">${this.renderNode(node, level)}</div>`;
        }
        return this.renderNode(node, level);
    },
    
    renderNode(node, level) {
        const hasChildren = Object.keys(node.children).length > 0;
        // Repository nodes don't have expand icon since they don't have children
        const expandIcon = hasChildren && !node.isRepo ? (node.expanded ? '▼' : '▶') : '';
        const nodeClass = node.isRepo ? 'repo-node' : (node.isRoot ? 'root-node' : 'path-node');
        const highlightClass = node.isHighlighted ? 'tree-node-highlighted' : '';
        const icon = node.isRepo ? '📦' : (node.isRoot ? '🌐' : '📁');
        
        // Determine if this node should be clickable for search
        const isSearchable = node.isRepo || (node.path && !node.isRoot);
        
        let html = `
            <div class="tree-node ${nodeClass} ${highlightClass}" data-level="${level}" data-path="${node.path || ''}" data-is-repo="${node.isRepo || false}">
                <div class="tree-node-content">
                    <span class="tree-indent" style="width: ${level * 20}px"></span>
                    ${hasChildren && !node.isRepo ? `
                        <span class="tree-expand-icon" onclick="registryTree.toggleNode(this, event)">${expandIcon}</span>
                    ` : '<span class="tree-expand-icon-placeholder"></span>'}
                    <span class="tree-icon">${icon}</span>
                    <span class="tree-label ${isSearchable ? 'tree-label-clickable' : ''} ${node.isHighlighted ? 'tree-label-highlighted' : ''}" 
                          ${isSearchable ? `onclick="registryTree.searchByRepository('${node.path || node.name}', event)"` : ''}>
                        ${utils.escapeHtml(node.name)}
                    </span>
                    ${node.isRepo && node.repoData ? `<span class="tree-badge">${node.repoData.tag_count || 0} tags</span>` : ''}
                </div>
                ${hasChildren && !node.isRepo ? `
                    <div class="tree-children ${node.expanded ? '' : 'collapsed'}">
                        ${Object.values(node.children).map(child => 
                            this.renderNode(child, level + 1)
                        ).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        
        return html;
    }
};

// Main functions
async function loadRepositories(forceRefresh = false) {
    if (isLoading) return;
    
    try {
        isLoading = true;
        ui.showLoading();
        
        const response = await api.fetchRepositories(currentPage, searchTerm, forceRefresh);
        
        repositories = response.repositories || [];
        totalPages = response.pagination?.total_pages || 1;
        
        // Always ensure we have allRepositories for the tree
        // Fetch it once on initial load or when refreshing
        if (allRepositories.length === 0 || forceRefresh || !searchTerm) {
            // Fetch all repositories for the tree (use reasonable page_size)
            const params = new URLSearchParams({
                page: '1',
                page_size: '100', // Use reasonable limit that backend supports
                include_metadata: 'true',
                force_refresh: forceRefresh.toString()
            });
            
            const allReposResponse = await fetch(`${API_BASE_URL}/repositories/?${params}`);
            if (allReposResponse.ok) {
                const data = await allReposResponse.json();
                allRepositories = data.repositories || [];
            } else {
                console.error('Failed to fetch all repositories:', allReposResponse.status);
                // Fallback to using current repositories if fetch fails
                if (!searchTerm) {
                    allRepositories = repositories;
                }
            }
        }
        
        ui.renderRepositories(repositories, response.pagination);
        
        // Build tree from complete list, not filtered results
        const treeData = registryTree.buildTree(allRepositories, searchTerm);
        const treeContainer = document.querySelector('.registries-tree .tree-container');
        if (!treeContainer) {
            const mainTreeContainer = document.querySelector('.registries-tree');
            if (mainTreeContainer) {
                // Tree container might not exist yet, ensure it's there
                mainTreeContainer.innerHTML = `
                    <h3>Registry Navigation</h3>
                    <div class="tree-container">
                        ${treeRenderer.renderTree(treeData)}
                    </div>
                `;
            }
        } else {
            // Update existing tree container
            treeContainer.innerHTML = treeRenderer.renderTree(treeData);
        }
        
    } catch (error) {
        console.error('Failed to load repositories:', error);
        ui.showError(error.message || 'An unknown error occurred.');
    } finally {
        isLoading = false;
    }
}

async function loadTags(repoName, cardElement) {
    if (!repoName || !cardElement) return;
    
    try {
        const response = await api.fetchTags(repoName);
        const tagsTable = cardElement.querySelector('.tags-table');
        
        // Get the repository data to check for matched tags
        const repoData = repositories.find(r => r.name === repoName);
        const matchedTags = repoData?.matched_tags || [];
        
        if (tagsTable) {
            tagsTable.innerHTML = ui.renderTagsTable(repoName, response.tags || [], matchedTags);
        }
        
    } catch (error) {
        console.error('Failed to load tags:', error);
        const tagsTable = cardElement.querySelector('.tags-table');
        if (tagsTable) {
            tagsTable.innerHTML = `
                <div class="error">
                    <h3>Failed to load tags</h3>
                    <p>${utils.escapeHtml(error.message || 'An unknown error occurred.')}</p>
                </div>
            `;
        }
    }
}

function toggleExpand(element) {
    if (!element) return;
    
    const card = element.closest('.repository-card');
    if (!card) return;
    
    const repoName = card.dataset.repo;
    if (!repoName) return;
    
    if (card.classList.contains('expanded')) {
        card.classList.remove('expanded');
    } else {
        card.classList.add('expanded');
        
        // Load tags only if not already loaded
        const tagsTable = card.querySelector('.tags-table');
        if (tagsTable && tagsTable.querySelector('.loading')) {
            loadTags(repoName, card);
        }
    }
}

function goToPage(page) {
    if (page < 1 || page > totalPages || isLoading) return;
    currentPage = page;
    loadRepositories();
}

function copyPullCommand(repoName, tagName) {
    if (!repoName || !tagName) {
        utils.showNotification('Repository name and tag are required.', 'error');
        return;
    }
    
    const command = `docker pull ${registryUrl}/${repoName}:${tagName}`;
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(command).then(() => {
            utils.showNotification('Pull command copied to clipboard.');
        }).catch(() => {
            alert(`Pull command:\n${command}`);
        });
    } else {
        alert(`Pull command:\n${command}`);
    }
}

function copyImageId(imageId) {
    if (!imageId) {
        utils.showNotification('No image ID available.', 'error');
        return;
    }
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(imageId).then(() => {
            utils.showNotification('Image ID copied to clipboard.');
        }).catch(() => {
            alert(`Image ID:\n${imageId}`);
        });
    } else {
        alert(`Image ID:\n${imageId}`);
    }
}

// Theme management
const themeManager = {
    // Get current theme from localStorage or system preference
    getCurrentTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme;
        }
        
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        
        return 'light';
    },
    
    // Apply theme to document
    applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        
        // Update theme toggle buttons
        this.updateThemeButtons(theme);
        
        // Save to localStorage
        localStorage.setItem('theme', theme);
    },
    
    // Update theme toggle button icons and text
    updateThemeButtons(theme) {
        const themeIconInline = document.getElementById('theme-icon-inline');
        const themeText = document.getElementById('theme-text');
        
        if (theme === 'dark') {
            if (themeIconInline) {
                themeIconInline.className = 'fas fa-sun';
            }
            if (themeText) {
                themeText.textContent = 'Light';
            }
        } else {
            if (themeIconInline) {
                themeIconInline.className = 'fas fa-moon';
            }
            if (themeText) {
                themeText.textContent = 'Dark';
            }
        }
    },
    
    // Toggle theme between light and dark
    toggleTheme() {
        const currentTheme = this.getCurrentTheme();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        
        // Show notification
        utils.showNotification(`Switched to ${newTheme} mode`);
    },
    
    // Initialize theme on page load
    init() {
        const theme = this.getCurrentTheme();
        this.applyTheme(theme);
        
        // Add theme toggle event listener
        const themeToggleInline = document.getElementById('theme-toggle-inline');
        
        if (themeToggleInline) {
            themeToggleInline.addEventListener('click', () => this.toggleTheme());
        }
        
        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                // Only apply if user hasn't manually set a preference
                if (!localStorage.getItem('theme')) {
                    this.applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }
};

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize theme
        themeManager.init();
        
        // Initialize pagination display (show default state)
        ui.renderPagination(null);
        
        // First fetch registry configuration
        await api.fetchRegistryConfig();
        
        // Initial load - await it to ensure tree is populated
        await loadRepositories();

        // Setup search events
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        
        // Refresh button click event
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (isLoading) return;
                if (searchInput) {
                    searchInput.value = '';
                }
                searchTerm = '';
                currentPage = 1;
                loadRepositories(true); // Pass forceRefresh=true when refresh button is clicked
            });
        }
        
        // Search button click event
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                if (isLoading) return;
                // Capture tree expansion state before search
                registryTree.captureExpandedState();
                if (searchInput) {
                    searchTerm = searchInput.value;
                }
                currentPage = 1;
                loadRepositories();
            });
        }
        
        // Real-time search with debounce
        if (searchInput) {
            // Debounced search - triggers after 500ms of no typing
            const debouncedSearch = utils.debounce(() => {
                if (isLoading) return;
                
                const newSearchTerm = searchInput.value.trim();
                
                // Search when 2+ characters or empty (show all)
                if (newSearchTerm.length >= 2 || newSearchTerm === '') {
                    // Only search if term changed
                    if (newSearchTerm !== searchTerm) {
                        // Capture tree expansion state before search
                        registryTree.captureExpandedState();
                        searchTerm = newSearchTerm;
                        currentPage = 1;
                        loadRepositories();
                    }
                }
            }, 500);
            
            // Add input event for real-time search
            searchInput.addEventListener('input', debouncedSearch);
            
            // Search with Enter key (immediate)
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !isLoading) {
                    // Capture tree expansion state before search
                    registryTree.captureExpandedState();
                    searchTerm = e.target.value;
                    currentPage = 1;
                    loadRepositories();
                }
            });
        }

        // Pagination events
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                goToPage(currentPage - 1);
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                goToPage(currentPage + 1);
            });
        }
        
    } catch (error) {
        console.error('Event listener setup failed:', error);
        ui.showError('An error occurred during page initialization.');
    }
});

// Sidebar toggle functionality
const sidebarToggle = {
    isVisible: true,
    
    init() {
        const toggleBtn = document.getElementById('sidebar-toggle');
        const sidebar = document.querySelector('.registries-tree');
        const mainBody = document.querySelector('.registries-body');
        const mainContent = document.querySelector('.main-content');
        
        if (!toggleBtn || !sidebar || !mainBody || !mainContent) {
            console.error('Sidebar toggle elements not found');
            return;
        }
        
        // Load saved state from localStorage
        const savedState = localStorage.getItem('sidebarVisible');
        if (savedState !== null) {
            this.isVisible = savedState === 'true';
            this.updateUI(toggleBtn, sidebar, mainBody, mainContent, false);
        }
        
        // Add click event listener
        toggleBtn.addEventListener('click', () => {
            this.toggle(toggleBtn, sidebar, mainBody, mainContent);
        });
        
        // Add keyboard shortcut (Ctrl+B or Cmd+B)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                this.toggle(toggleBtn, sidebar, mainBody, mainContent);
            }
        });
    },
    
    toggle(toggleBtn, sidebar, mainBody, mainContent) {
        this.isVisible = !this.isVisible;
        this.updateUI(toggleBtn, sidebar, mainBody, mainContent, true);
        
        // Save state to localStorage
        localStorage.setItem('sidebarVisible', this.isVisible.toString());
    },
    
    updateUI(toggleBtn, sidebar, mainBody, mainContent, animate = true) {
        if (this.isVisible) {
            sidebar.classList.remove('collapsed');
            mainBody.classList.remove('full-width');
            mainContent.classList.remove('sidebar-hidden');
            toggleBtn.classList.remove('active');
            toggleBtn.setAttribute('aria-expanded', 'true');
        } else {
            sidebar.classList.add('collapsed');
            mainBody.classList.add('full-width');
            mainContent.classList.add('sidebar-hidden');
            toggleBtn.classList.add('active');
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
        
        // Add animation class if needed
        if (animate) {
            sidebar.style.transition = 'width 0.3s ease, transform 0.3s ease, opacity 0.3s ease';
            mainBody.style.transition = 'width 0.3s ease';
        } else {
            // Remove transition for initial load
            sidebar.style.transition = 'none';
            mainBody.style.transition = 'none';
            
            // Re-enable transitions after a delay
            setTimeout(() => {
                sidebar.style.transition = '';
                mainBody.style.transition = '';
            }, 100);
        }
    }
};

// Initialize sidebar toggle on page load
document.addEventListener('DOMContentLoaded', () => {
    sidebarToggle.init();
});

// Export as global functions
window.loadRepositories = loadRepositories;
window.toggleExpand = toggleExpand;
window.goToPage = goToPage;
window.copyPullCommand = copyPullCommand;
window.copyImageId = copyImageId;
window.sidebarToggle = sidebarToggle;