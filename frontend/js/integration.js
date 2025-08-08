/**
 * RepoVista - Integration Module
 * Connects Store, Events, and Error Handling systems
 */

(function(window) {
    'use strict';

    /**
     * Application Integration Layer
     * Orchestrates communication between all modules
     */
    class AppIntegration {
        constructor() {
            this.store = null;
            this.emitter = null;
            this.delegator = null;
            this.errorHandler = null;
            this.initialized = false;
        }

        /**
         * Initialize integration
         */
        init() {
            if (this.initialized) {
                console.warn('Integration already initialized');
                return;
            }

            // Get module references
            this.store = App.Core.getModule('Store');
            this.emitter = App.Core.getModule('EventEmitter');
            this.delegator = App.Core.getModule('EventDelegator');
            this.errorHandler = App.Core.getModule('ErrorHandler');

            if (!this.store || !this.emitter || !this.delegator || !this.errorHandler) {
                throw new Error('Required modules not found for integration');
            }

            // Set up event-to-state mappings
            this._setupEventStateBindings();

            // Set up error recovery strategies
            this._setupErrorRecoveryStrategies();

            // Set up middleware for store
            this._setupStoreMiddleware();

            // Set up computed properties
            this._setupComputedProperties();

            this.initialized = true;
            console.log('Application integration initialized');
        }

        /**
         * Set up event to state bindings
         */
        _setupEventStateBindings() {
            // Repository selection
            this.emitter.on('repository:selected', ({ name, element }) => {
                this.store.setState(state => {
                    state.selectedRepository = name;
                    
                    // Toggle expanded state
                    if (state.expandedRepositories.has(name)) {
                        state.expandedRepositories.delete(name);
                    } else {
                        state.expandedRepositories.add(name);
                    }
                }, 'SELECT_REPOSITORY');
            });

            // Tag selection
            this.emitter.on('tag:selected', ({ repository, tag }) => {
                this.store.setState({
                    selectedTag: { repository, tag }
                }, 'SELECT_TAG');
            });

            // Search query change
            this.emitter.on('search:query', ({ query }) => {
                this.store.setState({
                    searchQuery: query,
                    currentPage: 1 // Reset to first page on search
                }, 'UPDATE_SEARCH');
            });

            // Pagination change
            this.emitter.on('pagination:change', ({ page }) => {
                this.store.setState({
                    currentPage: page
                }, 'CHANGE_PAGE');
            });

            // Page size change
            this.emitter.on('pagesize:change', ({ pageSize }) => {
                this.store.setState({
                    pageSize: pageSize,
                    currentPage: 1 // Reset to first page
                }, 'CHANGE_PAGE_SIZE');
            });

            // Sort change
            this.emitter.on('sort:change', ({ sortBy }) => {
                this.store.setState({
                    sortBy: sortBy,
                    currentPage: 1 // Reset to first page
                }, 'CHANGE_SORT');
            });

            // Loading state
            this.emitter.on('loading:start', () => {
                this.store.setState({ loading: true, error: null }, 'START_LOADING');
            });

            this.emitter.on('loading:end', () => {
                this.store.setState({ loading: false }, 'END_LOADING');
            });

            // Error handling
            this.emitter.on('error:occurred', ({ error }) => {
                this.store.setState({ 
                    loading: false, 
                    error: error 
                }, 'ERROR_OCCURRED');
            });

            // Data updates
            this.emitter.on('repositories:loaded', ({ repositories, total, page }) => {
                this.store.setState(state => {
                    state.repositories = repositories;
                    state.totalCount = total;
                    state.currentPage = page;
                    state.totalPages = Math.ceil(total / state.pageSize);
                    state.loading = false;
                    state.error = null;
                }, 'REPOSITORIES_LOADED');
            });

            // Tags loaded
            this.emitter.on('tags:loaded', ({ repository, tags }) => {
                this.store.setState(state => {
                    state.tags.set(repository, tags);
                }, 'TAGS_LOADED');
            });
        }

        /**
         * Set up error recovery strategies
         */
        _setupErrorRecoveryStrategies() {
            const errorBoundary = this.errorHandler.getErrorBoundary();

            // API retry strategy
            errorBoundary.registerRecoveryStrategy(App.ErrorTypes.API_ERROR, (errorInfo) => {
                if (errorInfo.error.code === 429) {
                    // Rate limited - wait and retry
                    const retryAfter = errorInfo.context.retryAfter || 5000;
                    this.emitter.emit('notification:show', {
                        type: 'warning',
                        message: `Rate limited. Retrying in ${retryAfter / 1000} seconds...`
                    });
                    
                    return new Promise(resolve => {
                        setTimeout(() => {
                            this.emitter.emit('api:retry', errorInfo.context);
                            resolve();
                        }, retryAfter);
                    });
                }
            });

            // Render recovery strategy
            errorBoundary.registerRecoveryStrategy(App.ErrorTypes.RENDER_ERROR, (errorInfo) => {
                // Clear cache and re-render
                this.store.setState(state => {
                    state.renderCache = new Map();
                }, 'CLEAR_RENDER_CACHE');
                
                this.emitter.emit('render:refresh');
            });

            // Add error filters
            errorBoundary.addErrorFilter((errorInfo) => {
                // Filter out canceled requests
                return errorInfo.error.message === 'Request canceled';
            });

            errorBoundary.addErrorFilter((errorInfo) => {
                // Filter out known browser quirks
                return errorInfo.error.message.includes('ResizeObserver loop limit exceeded');
            });
        }

        /**
         * Set up store middleware
         */
        _setupStoreMiddleware() {
            // Logging middleware
            this.store.use((action, prevState, newState) => {
                if (App.Core.getConfig('debug')) {
                    console.log(`[Store] ${action}`, {
                        prev: prevState,
                        next: newState
                    });
                }
                return newState;
            });

            // Validation middleware
            this.store.use((action, prevState, newState) => {
                // Validate page numbers
                if (newState.currentPage < 1) {
                    newState.currentPage = 1;
                }
                if (newState.currentPage > newState.totalPages && newState.totalPages > 0) {
                    newState.currentPage = newState.totalPages;
                }

                // Validate page size
                const validPageSizes = [10, 20, 50, 100];
                if (!validPageSizes.includes(newState.pageSize)) {
                    newState.pageSize = 20;
                }

                return newState;
            });

            // Side effects middleware
            this.store.use((action, prevState, newState) => {
                // Trigger data fetch on filter changes
                const filtersChanged = 
                    prevState.searchQuery !== newState.searchQuery ||
                    prevState.sortBy !== newState.sortBy ||
                    prevState.currentPage !== newState.currentPage ||
                    prevState.pageSize !== newState.pageSize;

                if (filtersChanged && !newState.loading) {
                    // Debounced fetch
                    this._debouncedFetch();
                }

                return newState;
            });
        }

        /**
         * Set up computed properties
         */
        _setupComputedProperties() {
            // Filtered repositories
            this.store.computed('filteredRepositories', (state) => {
                if (!state.searchQuery) {
                    return state.repositories;
                }

                const query = state.searchQuery.toLowerCase();
                return state.repositories.filter(repo => 
                    repo.name.toLowerCase().includes(query)
                );
            }, ['repositories', 'searchQuery']);

            // Pagination info
            this.store.computed('paginationInfo', (state) => {
                const start = (state.currentPage - 1) * state.pageSize + 1;
                const end = Math.min(state.currentPage * state.pageSize, state.totalCount);
                
                return {
                    start,
                    end,
                    total: state.totalCount,
                    hasNext: state.currentPage < state.totalPages,
                    hasPrev: state.currentPage > 1
                };
            }, ['currentPage', 'pageSize', 'totalCount', 'totalPages']);

            // Loading message
            this.store.computed('loadingMessage', (state) => {
                if (!state.loading) return null;
                
                if (state.searchQuery) {
                    return `Searching for "${state.searchQuery}"...`;
                }
                
                return 'Loading repositories...';
            }, ['loading', 'searchQuery']);
        }

        /**
         * Debounced fetch helper
         */
        _debouncedFetch = (() => {
            let timeoutId;
            return () => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    this.emitter.emit('data:fetch');
                }, 300);
            };
        })();

        /**
         * Get integration status
         */
        getStatus() {
            return {
                initialized: this.initialized,
                modules: {
                    store: !!this.store,
                    emitter: !!this.emitter,
                    delegator: !!this.delegator,
                    errorHandler: !!this.errorHandler
                },
                storeState: this.store?.getState(),
                errorStats: this.errorHandler?.getErrorBoundary().getStatistics()
            };
        }

        /**
         * Clean up integration
         */
        cleanup() {
            // Clean up event listeners
            this.emitter?.removeAllListeners();
            
            // Clean up delegations
            this.delegator?.cleanup();
            
            // Clear store
            this.store?.reset();
            
            this.initialized = false;
            console.log('Integration cleaned up');
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.Integration = AppIntegration;

})(window);