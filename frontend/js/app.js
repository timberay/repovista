// Global variables
let currentPage = 1;
let totalPages = 1;
let repositories = [];
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

    async fetchRepositories(page = 1, search = '') {
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                page_size: '20',
                include_metadata: 'true'
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
                <div class="empty-state">
                    <h3>No repositories found</h3>
                    <p>${searchTerm ? 'Try changing your search criteria.' : 'No repositories in the registry.'}</p>
                </div>
            `;
            return;
        }

        // Render all cards with staggered animation
        repositoriesDiv.innerHTML = repos.map((repo, index) => {
            const cardHtml = this.renderRepositoryCard(repo);
            // Add animation delay based on index
            return cardHtml.replace(
                'class="repository-card"',
                `class="repository-card" style="animation-delay: ${index * 0.1}s"`
            );
        }).join('');
        
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
        
        if (!pagination || pagination.total_pages <= 1) {
            paginationDiv.style.display = 'none';
            return;
        }

        paginationDiv.style.display = 'flex';
        
        // Generate page numbers
        let pageNumbers = '';
        const startPage = Math.max(1, pagination.page - 2);
        const endPage = Math.min(pagination.total_pages, pagination.page + 2);

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === pagination.page ? 'active' : '';
            pageNumbers += `<button class="page-btn ${activeClass}" onclick="goToPage(${i})">${i}</button>`;
        }

        pageNumbersDiv.innerHTML = pageNumbers;

        // Update prev/next button states
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        
        if (prevBtn) prevBtn.disabled = pagination.page <= 1;
        if (nextBtn) nextBtn.disabled = pagination.page >= pagination.total_pages;
    }
};

// Main functions
async function loadRepositories() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        ui.showLoading();
        
        const response = await api.fetchRepositories(currentPage, searchTerm);
        
        repositories = response.repositories || [];
        totalPages = response.pagination?.total_pages || 1;
        
        ui.renderRepositories(repositories, response.pagination);
        
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
        const themeIcon = document.getElementById('theme-icon');
        const themeIconInline = document.getElementById('theme-icon-inline');
        const themeText = document.getElementById('theme-text');
        
        if (theme === 'dark') {
            if (themeIcon) {
                themeIcon.className = 'fas fa-sun';
            }
            if (themeIconInline) {
                themeIconInline.className = 'fas fa-sun';
            }
            if (themeText) {
                themeText.textContent = 'Light';
            }
        } else {
            if (themeIcon) {
                themeIcon.className = 'fas fa-moon';
            }
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
        
        // Add theme toggle event listeners
        const themeToggle = document.getElementById('theme-toggle');
        const themeToggleInline = document.getElementById('theme-toggle-inline');
        
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
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
        
        // First fetch registry configuration
        await api.fetchRegistryConfig();
        
        // Initial load
        loadRepositories();

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
                loadRepositories();
            });
        }
        
        // Search button click event
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                if (isLoading) return;
                if (searchInput) {
                    searchTerm = searchInput.value;
                }
                currentPage = 1;
                loadRepositories();
            });
        }
        
        // Search with Enter key
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !isLoading) {
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

// Export as global functions
window.loadRepositories = loadRepositories;
window.toggleExpand = toggleExpand;
window.goToPage = goToPage;
window.copyPullCommand = copyPullCommand;
window.copyImageId = copyImageId;