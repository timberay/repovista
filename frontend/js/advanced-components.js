/**
 * RepoVista - Advanced Component Implementations
 * Practical components built on the BaseComponent lifecycle system
 */

(function(window) {
    'use strict';

    const { BaseComponent, h } = window.App;

    /**
     * RepositoryCardComponent
     * Lifecycle-aware repository card component
     */
    class RepositoryCardComponent extends BaseComponent {
        constructor(props, options) {
            super(props, options);
            
            // Initialize component state
            this.state = {
                expanded: props.expanded || false,
                loading: false,
                tags: props.tags || [],
                error: null
            };

            // Bind event handlers
            this.handleToggle = this.handleToggle.bind(this);
            this.handleTagClick = this.handleTagClick.bind(this);
            this.loadTags = this.loadTags.bind(this);
        }

        // Lifecycle hooks
        beforeMount() {
            // Pre-load tags if repository is already expanded
            if (this.state.expanded && this.state.tags.length === 0) {
                this.loadTags();
            }
        }

        mounted() {
            // Set up observers for external state changes
            if (this.props.store) {
                const unsubscribe = this.props.store.subscribe((prevState, newState) => {
                    const repoData = newState.repositories?.find(r => r.name === this.props.repository.name);
                    if (repoData && repoData !== this.prevRepoData) {
                        this.update({ repository: repoData });
                        this.prevRepoData = repoData;
                    }
                });
                this.subscriptions.add(unsubscribe);
            }

            // Add performance monitoring
            if (this.options.profiling) {
                this._startPerformanceMonitoring();
            }
        }

        shouldUpdate(nextProps, nextState) {
            // Optimize re-renders
            return (
                nextProps.repository !== this.props.repository ||
                nextState.expanded !== this.state.expanded ||
                nextState.tags !== this.state.tags ||
                nextState.loading !== this.state.loading ||
                nextState.error !== this.state.error
            );
        }

        updated(prevProps, prevState) {
            // Handle expansion state changes
            if (this.state.expanded !== prevState.expanded) {
                if (this.state.expanded && this.state.tags.length === 0) {
                    this.loadTags();
                }
                
                // Emit state change
                this._emit('expansionChanged', { 
                    expanded: this.state.expanded,
                    repository: this.props.repository
                });
            }
        }

        onError(error, errorInfo) {
            // Handle component-specific errors
            this.setState({ error: error.message, loading: false });
            
            // Emit error for parent handling
            this._emit('error', { error, errorInfo, repository: this.props.repository });
        }

        // Event handlers
        async handleToggle() {
            await this.setState(prevState => ({ 
                expanded: !prevState.expanded,
                error: null
            }));
        }

        handleTagClick(tag) {
            this._emit('tagSelected', { 
                repository: this.props.repository, 
                tag 
            });
        }

        async loadTags() {
            if (this.state.loading) return;

            try {
                await this.setState({ loading: true, error: null });
                
                // Simulate API call or use actual API
                const tags = await this.props.api?.getTags(this.props.repository.name) || [];
                
                await this.setState({ 
                    tags, 
                    loading: false 
                });
            } catch (error) {
                await this.setState({ 
                    loading: false, 
                    error: error.message 
                });
            }
        }

        render() {
            const { repository } = this.props;
            const { expanded, loading, tags, error } = this.state;
            
            return h('div', {
                className: `repository-card ${expanded ? 'expanded' : ''} ${loading ? 'loading' : ''}`,
                'data-repository': repository.name,
                'data-ref': 'card'
            },
                // Header
                h('div', {
                    className: 'repository-header',
                    onClick: this.handleToggle
                },
                    h('div', { className: 'repository-info' },
                        h('h3', { className: 'repository-name' },
                            h('span', { className: 'repository-icon' }, '📦'),
                            repository.name
                        ),
                        h('div', { className: 'repository-meta' },
                            h('span', { className: 'tag-count' },
                                `${tags.length} tags`
                            ),
                            repository.lastUpdated && h('span', { className: 'last-updated' },
                                `Updated: ${new Date(repository.lastUpdated).toLocaleDateString()}`
                            )
                        )
                    ),
                    h('button', {
                        className: 'expand-toggle',
                        'aria-expanded': expanded
                    },
                        expanded ? '▼' : '▶'
                    )
                ),
                
                // Expandable content
                expanded && h('div', { className: 'repository-content' },
                    loading && h('div', { className: 'loading-spinner' }, 'Loading tags...'),
                    
                    error && h('div', { className: 'error-message' },
                        `Error: ${error}`,
                        h('button', { onClick: this.loadTags }, 'Retry')
                    ),
                    
                    !loading && !error && h('div', { className: 'tags-list' },
                        tags.length === 0 
                            ? h('p', {}, 'No tags available')
                            : tags.map((tag, index) =>
                                h('div', {
                                    key: tag.name || index,
                                    className: 'tag-item',
                                    onClick: () => this.handleTagClick(tag)
                                },
                                    h('span', { className: 'tag-name' }, tag.name),
                                    tag.size && h('span', { className: 'tag-size' }, 
                                        this._formatBytes(tag.size)
                                    )
                                )
                            )
                    )
                )
            );
        }

        // Utility methods
        _formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        _startPerformanceMonitoring() {
            const observer = new PerformanceObserver(list => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    if (entry.name.includes('repository-card')) {
                        console.log(`Repository card performance: ${entry.duration}ms`);
                    }
                });
            });
            
            observer.observe({ entryTypes: ['measure'] });
        }
    }

    /**
     * SearchComponent
     * Lifecycle-aware search component with debouncing
     */
    class SearchComponent extends BaseComponent {
        constructor(props, options) {
            super(props, options);
            
            this.state = {
                query: props.initialQuery || '',
                focused: false,
                suggestions: []
            };

            this.handleInput = this.handleInput.bind(this);
            this.handleFocus = this.handleFocus.bind(this);
            this.handleBlur = this.handleBlur.bind(this);
            this.handleClear = this.handleClear.bind(this);
            this.handleSuggestionClick = this.handleSuggestionClick.bind(this);
            
            // Debounced search
            this.debouncedSearch = this._debounce(this.performSearch.bind(this), 300);
        }

        mounted() {
            // Focus on mount if requested
            if (this.props.autoFocus) {
                const input = this.getRef('searchInput');
                if (input) input.focus();
            }

            // Set up keyboard shortcuts
            if (this.props.keyboardShortcut) {
                this._setupKeyboardShortcut();
            }
        }

        beforeUnmount() {
            // Clean up debounced function
            if (this.debouncedSearch.cancel) {
                this.debouncedSearch.cancel();
            }
        }

        async handleInput(event) {
            const query = event.target.value;
            await this.setState({ query });
            
            // Trigger debounced search
            this.debouncedSearch(query);
        }

        async handleFocus() {
            await this.setState({ focused: true });
            this._emit('focus', { query: this.state.query });
        }

        async handleBlur() {
            // Delay to allow suggestion clicks
            setTimeout(async () => {
                await this.setState({ focused: false, suggestions: [] });
                this._emit('blur', { query: this.state.query });
            }, 200);
        }

        async handleClear() {
            await this.setState({ query: '', suggestions: [] });
            this.debouncedSearch('');
            
            const input = this.getRef('searchInput');
            if (input) input.focus();
        }

        handleSuggestionClick(suggestion) {
            this.setState({ query: suggestion, suggestions: [] });
            this.performSearch(suggestion);
        }

        async performSearch(query) {
            this._emit('search', { query });
            
            // Load suggestions if enabled
            if (this.props.suggestions && query.length > 2) {
                try {
                    const suggestions = await this.props.suggestions(query);
                    if (this.state.focused) {
                        await this.setState({ suggestions });
                    }
                } catch (error) {
                    console.error('Failed to load suggestions:', error);
                }
            }
        }

        render() {
            const { placeholder = 'Search...', disabled = false } = this.props;
            const { query, focused, suggestions } = this.state;

            return h('div', { className: `search-component ${focused ? 'focused' : ''}` },
                h('div', { className: 'search-input-container' },
                    h('input', {
                        type: 'search',
                        className: 'search-input',
                        placeholder,
                        value: query,
                        disabled,
                        onInput: this.handleInput,
                        onFocus: this.handleFocus,
                        onBlur: this.handleBlur,
                        'data-ref': 'searchInput'
                    }),
                    
                    query && h('button', {
                        className: 'search-clear',
                        onClick: this.handleClear,
                        'aria-label': 'Clear search'
                    }, '✕')
                ),
                
                // Suggestions dropdown
                focused && suggestions.length > 0 && h('div', { className: 'search-suggestions' },
                    suggestions.map((suggestion, index) =>
                        h('div', {
                            key: index,
                            className: 'suggestion-item',
                            onClick: () => this.handleSuggestionClick(suggestion)
                        }, suggestion)
                    )
                )
            );
        }

        _debounce(func, delay) {
            let timeoutId;
            const debounced = (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => func.apply(this, args), delay);
            };
            debounced.cancel = () => clearTimeout(timeoutId);
            return debounced;
        }

        _setupKeyboardShortcut() {
            const handleKeydown = (event) => {
                if (event.key === this.props.keyboardShortcut && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    const input = this.getRef('searchInput');
                    if (input) input.focus();
                }
            };

            document.addEventListener('keydown', handleKeydown);
            this.subscriptions.add(() => {
                document.removeEventListener('keydown', handleKeydown);
            });
        }
    }

    /**
     * PaginationComponent
     * Advanced pagination with accessibility and keyboard navigation
     */
    class PaginationComponent extends BaseComponent {
        constructor(props, options) {
            super(props, options);
            
            this.state = {
                currentPage: props.currentPage || 1,
                hoveredPage: null
            };

            this.handlePageClick = this.handlePageClick.bind(this);
            this.handlePrevious = this.handlePrevious.bind(this);
            this.handleNext = this.handleNext.bind(this);
            this.handleKeyDown = this.handleKeyDown.bind(this);
        }

        shouldUpdate(nextProps, nextState) {
            return (
                nextProps.currentPage !== this.props.currentPage ||
                nextProps.totalPages !== this.props.totalPages ||
                nextProps.totalItems !== this.props.totalItems ||
                nextState.hoveredPage !== this.state.hoveredPage
            );
        }

        updated(prevProps) {
            if (prevProps.currentPage !== this.props.currentPage) {
                this.setState({ currentPage: this.props.currentPage });
            }
        }

        handlePageClick(page) {
            if (page !== this.state.currentPage && page >= 1 && page <= this.props.totalPages) {
                this._emit('pageChange', { page });
            }
        }

        handlePrevious() {
            const prevPage = this.state.currentPage - 1;
            if (prevPage >= 1) {
                this.handlePageClick(prevPage);
            }
        }

        handleNext() {
            const nextPage = this.state.currentPage + 1;
            if (nextPage <= this.props.totalPages) {
                this.handlePageClick(nextPage);
            }
        }

        handleKeyDown(event) {
            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    this.handlePrevious();
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    this.handleNext();
                    break;
                case 'Home':
                    event.preventDefault();
                    this.handlePageClick(1);
                    break;
                case 'End':
                    event.preventDefault();
                    this.handlePageClick(this.props.totalPages);
                    break;
            }
        }

        render() {
            const { totalPages, totalItems, itemsPerPage = 20 } = this.props;
            const { currentPage } = this.state;
            
            if (totalPages <= 1) {
                return null;
            }

            const pageRange = this._calculatePageRange(currentPage, totalPages);
            const startItem = (currentPage - 1) * itemsPerPage + 1;
            const endItem = Math.min(currentPage * itemsPerPage, totalItems);

            return h('nav', {
                className: 'pagination-component',
                'aria-label': 'Pagination navigation',
                onKeyDown: this.handleKeyDown,
                tabIndex: 0
            },
                // Items info
                h('div', { className: 'pagination-info' },
                    `Showing ${startItem}-${endItem} of ${totalItems} items`
                ),
                
                // Pagination controls
                h('div', { className: 'pagination-controls' },
                    // Previous button
                    h('button', {
                        className: `pagination-btn ${currentPage === 1 ? 'disabled' : ''}`,
                        onClick: this.handlePrevious,
                        disabled: currentPage === 1,
                        'aria-label': 'Go to previous page'
                    }, '← Previous'),
                    
                    // Page numbers
                    h('div', { className: 'page-numbers' },
                        pageRange.map(page => {
                            if (page === '...') {
                                return h('span', {
                                    key: `ellipsis-${Math.random()}`,
                                    className: 'page-ellipsis'
                                }, '...');
                            }
                            
                            return h('button', {
                                key: page,
                                className: `page-btn ${page === currentPage ? 'active' : ''}`,
                                onClick: () => this.handlePageClick(page),
                                'aria-label': `Go to page ${page}`,
                                'aria-current': page === currentPage ? 'page' : undefined
                            }, page.toString());
                        })
                    ),
                    
                    // Next button
                    h('button', {
                        className: `pagination-btn ${currentPage === totalPages ? 'disabled' : ''}`,
                        onClick: this.handleNext,
                        disabled: currentPage === totalPages,
                        'aria-label': 'Go to next page'
                    }, 'Next →')
                )
            );
        }

        _calculatePageRange(current, total, delta = 2) {
            const range = [];
            const rangeWithDots = [];

            range.push(1);

            if (total <= 1) return range;

            for (let i = current - delta; i <= current + delta; i++) {
                if (i < total && i > 1) {
                    range.push(i);
                }
            }
            
            range.push(total);

            let l;
            range.forEach((i) => {
                if (l) {
                    if (i - l === 2) {
                        rangeWithDots.push(l + 1);
                    } else if (i - l !== 1) {
                        rangeWithDots.push('...');
                    }
                }
                rangeWithDots.push(i);
                l = i;
            });

            return rangeWithDots;
        }
    }

    // Register components with manager
    const registerAdvancedComponents = (componentManager) => {
        componentManager.register('RepositoryCard', RepositoryCardComponent, {
            mixins: ['Observable', 'Tooltip']
        });
        
        componentManager.register('Search', SearchComponent, {
            mixins: ['Observable']
        });
        
        componentManager.register('Pagination', PaginationComponent, {
            mixins: ['Observable']
        });

        // Register component templates
        const factory = componentManager.getFactory();
        
        factory.registerTemplate('expandable-repository-card', {
            component: 'RepositoryCard',
            props: { expanded: true },
            options: { profiling: true },
            description: 'Repository card that starts expanded'
        });

        factory.registerTemplate('search-with-suggestions', {
            component: 'Search',
            props: { autoFocus: true, keyboardShortcut: 'k' },
            options: {},
            description: 'Search component with auto-focus and keyboard shortcut'
        });
    };

    // Export to global scope
    window.App = window.App || {};
    window.App.AdvancedComponents = {
        RepositoryCardComponent,
        SearchComponent, 
        PaginationComponent,
        registerAdvancedComponents
    };

})(window);