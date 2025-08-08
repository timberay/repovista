/**
 * RepoVista - View Controller
 * Manages UI rendering and state synchronization
 */

(function(window) {
    'use strict';

    const { h, Components } = window.App;

    /**
     * Main View Controller
     * Orchestrates all UI rendering based on state
     */
    class ViewController {
        constructor() {
            this.renderEngine = null;
            this.store = null;
            this.emitter = null;
            this.errorHandler = null;
            this.containers = {
                main: null,
                searchBar: null,
                sortControls: null,
                repositoryGrid: null,
                pagination: null,
                loading: null,
                error: null
            };
            this.unsubscribe = [];
        }

        /**
         * Initialize view controller
         */
        init(dependencies) {
            const { renderEngine, store, emitter, errorHandler } = dependencies;
            
            this.renderEngine = renderEngine;
            this.store = store;
            this.emitter = emitter;
            this.errorHandler = errorHandler;

            // Register components with render engine
            Components.registerComponents(this.renderEngine);

            // Find containers
            this._findContainers();

            // Set up state subscriptions
            this._setupStateSubscriptions();

            // Set up event handlers
            this._setupEventHandlers();

            // Initial render
            this._renderAll();

            console.log('View controller initialized');
        }

        /**
         * Find DOM containers
         */
        _findContainers() {
            this.containers = {
                main: document.getElementById('app'),
                searchBar: document.getElementById('search-container'),
                sortControls: document.getElementById('sort-container'),
                repositoryGrid: document.getElementById('repositories-grid'),
                pagination: document.getElementById('pagination-container'),
                loading: document.getElementById('loading-container'),
                error: document.getElementById('error-container')
            };

            // Validate required containers
            const required = ['main', 'repositoryGrid'];
            required.forEach(key => {
                if (!this.containers[key]) {
                    throw new Error(`Required container not found: ${key}`);
                }
            });
        }

        /**
         * Set up state subscriptions
         */
        _setupStateSubscriptions() {
            // Subscribe to loading state
            this.unsubscribe.push(
                this.store.subscribe((prevState, newState) => {
                    if (prevState?.loading !== newState.loading) {
                        // Use RenderScheduler for optimal loading state updates
                        if (App.RenderScheduler) {
                            App.RenderScheduler.schedule(() => {
                                this._renderLoading(newState);
                            }, newState, 3); // High priority for loading states
                        } else {
                            this._renderLoading(newState);
                        }
                    }
                }, 'loading')
            );

            // Subscribe to error state
            this.unsubscribe.push(
                this.store.subscribe((prevState, newState) => {
                    if (prevState?.error !== newState.error) {
                        this._renderError(newState);
                    }
                }, 'error')
            );

            // Subscribe to repositories
            this.unsubscribe.push(
                this.store.subscribe((prevState, newState) => {
                    const reposChanged = prevState?.repositories !== newState.repositories;
                    const expansionChanged = prevState?.expandedRepositories !== newState.expandedRepositories;
                    
                    if (reposChanged || expansionChanged) {
                        // Use low priority for repository list updates
                        if (App.RenderScheduler) {
                            App.RenderScheduler.schedule(() => {
                                this._renderRepositories(newState);
                            }, newState, 1);
                        } else {
                            this._renderRepositories(newState);
                        }
                    }
                })
            );

            // Subscribe to search query
            this.unsubscribe.push(
                this.store.subscribe((prevState, newState) => {
                    if (prevState?.searchQuery !== newState.searchQuery) {
                        this._renderSearchBar(newState);
                    }
                }, 'searchQuery')
            );

            // Subscribe to sort options
            this.unsubscribe.push(
                this.store.subscribe((prevState, newState) => {
                    if (prevState?.sortBy !== newState.sortBy) {
                        this._renderSortControls(newState);
                    }
                }, 'sortBy')
            );

            // Subscribe to pagination changes
            this.unsubscribe.push(
                this.store.subscribe((prevState, newState) => {
                    const paginationChanged = 
                        prevState?.currentPage !== newState.currentPage ||
                        prevState?.totalPages !== newState.totalPages ||
                        prevState?.totalCount !== newState.totalCount ||
                        prevState?.pageSize !== newState.pageSize;
                    
                    if (paginationChanged) {
                        this._renderPagination(newState);
                    }
                })
            );
        }

        /**
         * Set up event handlers
         */
        _setupEventHandlers() {
            // Repository toggle
            this.emitter.on('repository:selected', ({ name }) => {
                this._handleRepositoryToggle(name);
            });

            // Tag selection
            this.emitter.on('tag:selected', ({ repository, tag }) => {
                this._handleTagSelection(repository, tag);
            });

            // Copy command
            this.emitter.on('clipboard:copy', ({ text }) => {
                this._handleCopySuccess(text);
            });

            // Search
            this.emitter.on('search:query', ({ query }) => {
                this._handleSearch(query);
            });

            // Sort
            this.emitter.on('sort:change', ({ sortBy }) => {
                this._handleSort(sortBy);
            });

            // Pagination
            this.emitter.on('pagination:change', ({ page }) => {
                this._handlePageChange(page);
            });

            this.emitter.on('pagesize:change', ({ pageSize }) => {
                this._handlePageSizeChange(pageSize);
            });

            // Data fetching
            this.emitter.on('data:fetch', () => {
                this._handleDataFetch();
            });

            // Error recovery
            this.emitter.on('error:retry', () => {
                this._handleErrorRetry();
            });
        }

        /**
         * Render all UI components
         */
        _renderAll() {
            const state = this.store.getState();
            
            this._renderSearchBar(state);
            this._renderSortControls(state);
            this._renderRepositories(state);
            this._renderPagination(state);
            this._renderLoading(state);
            this._renderError(state);
        }

        /**
         * Render search bar
         */
        _renderSearchBar(state) {
            if (!this.containers.searchBar) return;

            const searchBar = Components.SearchBar({
                value: state.searchQuery || '',
                placeholder: 'Search repositories...',
                onSearch: (query) => {
                    this.emitter.emit('search:query', { query });
                },
                onClear: () => {
                    this.emitter.emit('search:query', { query: '' });
                }
            });

            this.renderEngine.render(this.containers.searchBar, searchBar);
        }

        /**
         * Render sort controls
         */
        _renderSortControls(state) {
            if (!this.containers.sortControls) return;

            const sortControls = Components.SortControls({
                currentSort: state.sortBy || 'name-asc',
                onSortChange: (sortBy) => {
                    this.emitter.emit('sort:change', { sortBy });
                }
            });

            this.renderEngine.render(this.containers.sortControls, sortControls);
        }

        /**
         * Render repositories grid
         */
        _renderRepositories(state) {
            const { repositories = [], loading, error, expandedRepositories = new Set(), tags = new Map() } = state;

            if (loading) {
                return; // Loading is handled separately
            }

            if (error) {
                return; // Error is handled separately
            }

            if (repositories.length === 0) {
                const emptyState = Components.EmptyState({
                    title: state.searchQuery ? 'No repositories match your search' : 'No repositories found',
                    message: state.searchQuery ? 'Try adjusting your search terms' : 'No repositories are available'
                });
                
                this.renderEngine.render(this.containers.repositoryGrid, emptyState);
                return;
            }

            const repositoryCards = h('div', { className: 'repository-grid' },
                ...repositories.map(repository => {
                    const isExpanded = expandedRepositories.has(repository.name);
                    const repositoryTags = tags.get(repository.name) || [];

                    return Components.RepositoryCard({
                        key: repository.name,
                        repository,
                        tags: repositoryTags,
                        isExpanded,
                        onToggle: () => {
                            this.emitter.emit('repository:selected', { 
                                name: repository.name 
                            });
                        },
                        onTagSelect: ({ repository: repoName, tag }) => {
                            this.emitter.emit('tag:selected', { 
                                repository: repoName, 
                                tag 
                            });
                        },
                        onCopyCommand: (command) => {
                            this._copyToClipboard(command);
                        }
                    });
                })
            );

            this.renderEngine.render(this.containers.repositoryGrid, repositoryCards);
        }

        /**
         * Render pagination
         */
        _renderPagination(state) {
            if (!this.containers.pagination) return;

            const { 
                currentPage = 1, 
                totalPages = 1, 
                totalCount = 0, 
                pageSize = 20 
            } = state;

            if (totalCount === 0) {
                this.renderEngine.render(this.containers.pagination, null);
                return;
            }

            const pagination = Components.Pagination({
                currentPage,
                totalPages,
                totalItems: totalCount,
                pageSize,
                onPageChange: (page) => {
                    this.emitter.emit('pagination:change', { page });
                },
                onPageSizeChange: (newPageSize) => {
                    this.emitter.emit('pagesize:change', { pageSize: newPageSize });
                }
            });

            this.renderEngine.render(this.containers.pagination, pagination);
        }

        /**
         * Render loading state
         */
        _renderLoading(state) {
            if (!this.containers.loading) return;

            if (state.loading) {
                const loadingSpinner = Components.LoadingSpinner({
                    message: this.store.loadingMessage || 'Loading repositories...'
                });
                
                this.renderEngine.render(this.containers.loading, loadingSpinner);
                this.containers.loading.style.display = 'flex';
            } else {
                this.containers.loading.style.display = 'none';
            }
        }

        /**
         * Render error state
         */
        _renderError(state) {
            if (!this.containers.error) return;

            if (state.error) {
                const errorMessage = Components.ErrorMessage({
                    error: state.error,
                    onRetry: () => {
                        this.emitter.emit('error:retry');
                    },
                    onDismiss: () => {
                        this.store.setState({ error: null }, 'DISMISS_ERROR');
                    }
                });
                
                this.renderEngine.render(this.containers.error, errorMessage);
                this.containers.error.style.display = 'block';
            } else {
                this.containers.error.style.display = 'none';
            }
        }

        // Event Handlers

        /**
         * Handle repository toggle
         */
        _handleRepositoryToggle(repositoryName) {
            const state = this.store.getState();
            const expandedRepos = new Set(state.expandedRepositories);
            
            if (expandedRepos.has(repositoryName)) {
                expandedRepos.delete(repositoryName);
            } else {
                expandedRepos.add(repositoryName);
                
                // Load tags if not already loaded
                if (!state.tags.has(repositoryName)) {
                    this._loadRepositoryTags(repositoryName);
                }
            }
            
            this.store.setState({
                expandedRepositories: expandedRepos,
                selectedRepository: repositoryName
            }, 'TOGGLE_REPOSITORY');
        }

        /**
         * Handle tag selection
         */
        _handleTagSelection(repository, tag) {
            this.store.setState({
                selectedTag: { repository, tag }
            }, 'SELECT_TAG');

            // Emit for any listeners
            this.emitter.emit('tag:view', { repository, tag });
        }

        /**
         * Handle search input
         */
        _handleSearch(query) {
            // Debounced through integration layer
            this.store.setState({
                searchQuery: query,
                currentPage: 1
            }, 'SEARCH');
        }

        /**
         * Handle sort change
         */
        _handleSort(sortBy) {
            this.store.setState({
                sortBy: sortBy,
                currentPage: 1
            }, 'SORT');
        }

        /**
         * Handle page change
         */
        _handlePageChange(page) {
            this.store.setState({
                currentPage: page
            }, 'CHANGE_PAGE');
        }

        /**
         * Handle page size change
         */
        _handlePageSizeChange(pageSize) {
            this.store.setState({
                pageSize: pageSize,
                currentPage: 1
            }, 'CHANGE_PAGE_SIZE');
        }

        /**
         * Handle data fetch
         */
        _handleDataFetch() {
            const state = this.store.getState();
            const { searchQuery, sortBy, currentPage, pageSize } = state;
            
            this.store.setState({ loading: true, error: null }, 'FETCH_START');
            
            // Emit for API layer to handle
            this.emitter.emit('api:fetch-repositories', {
                query: searchQuery,
                sort: sortBy,
                page: currentPage,
                size: pageSize
            });
        }

        /**
         * Handle error retry
         */
        _handleErrorRetry() {
            this.store.setState({ error: null }, 'RETRY');
            this._handleDataFetch();
        }

        /**
         * Handle copy success
         */
        _handleCopySuccess(text) {
            // Show temporary success notification
            this._showNotification(`Copied: ${text.substring(0, 30)}...`, 'success');
        }

        /**
         * Load repository tags
         */
        async _loadRepositoryTags(repositoryName) {
            try {
                this.emitter.emit('api:fetch-tags', { repository: repositoryName });
            } catch (error) {
                console.error('Failed to load tags:', error);
            }
        }

        /**
         * Copy text to clipboard
         */
        async _copyToClipboard(text) {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                } else {
                    // Fallback
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
                
                this.emitter.emit('clipboard:copy', { text });
            } catch (error) {
                console.error('Failed to copy to clipboard:', error);
                this._showNotification('Failed to copy to clipboard', 'error');
            }
        }

        /**
         * Show notification
         */
        _showNotification(message, type = 'info') {
            // Simple notification - could be enhanced with a toast system
            console.log(`[${type.toUpperCase()}] ${message}`);
            
            // You could implement a toast notification system here
            this.emitter.emit('notification:show', { message, type });
        }

        /**
         * Clean up
         */
        cleanup() {
            // Unsubscribe from all state subscriptions
            this.unsubscribe.forEach(unsub => unsub());
            this.unsubscribe = [];

            // Clear render engine
            this.renderEngine?.clearCache();

            console.log('View controller cleaned up');
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.ViewController = ViewController;

})(window);