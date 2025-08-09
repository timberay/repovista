/**
 * RepoVista - Main Application Module
 * Modular JavaScript application architecture with namespace pattern
 */

// Main application namespace
window.App = window.App || {};

/**
 * Core Application Module
 * Manages global application state, configuration, and module coordination
 */
App.Core = (function() {
    'use strict';

    // Application configuration
    const config = {
        apiUrl: '/api',
        defaultPageSize: 20,
        maxRetryAttempts: 3,
        debounceDelay: 300,
        version: '1.0.0'
    };

    // Module registry for dependency management
    const moduleRegistry = new Map();
    const dependencyGraph = new Map();

    return {
        // Configuration management
        getConfig: function(key) {
            return key ? config[key] : { ...config };
        },

        setConfig: function(key, value) {
            if (typeof key === 'object') {
                Object.assign(config, key);
            } else {
                config[key] = value;
            }
        },

        // Module registration and dependency management
        registerModule: function(name, module, dependencies = []) {
            if (moduleRegistry.has(name)) {
                console.warn(`Module ${name} is already registered`);
                return false;
            }

            moduleRegistry.set(name, {
                instance: module,
                dependencies: dependencies,
                initialized: false
            });

            dependencyGraph.set(name, dependencies);
            return true;
        },

        getModule: function(name) {
            const moduleData = moduleRegistry.get(name);
            return moduleData ? moduleData.instance : null;
        },

        // Initialize modules in dependency order
        initializeModules: function() {
            const sorted = this._topologicalSort(dependencyGraph);
            
            sorted.forEach(moduleName => {
                const moduleData = moduleRegistry.get(moduleName);
                if (moduleData && !moduleData.initialized) {
                    if (typeof moduleData.instance.init === 'function') {
                        moduleData.instance.init();
                        moduleData.initialized = true;
                        console.log(`Initialized module: ${moduleName}`);
                    }
                }
            });
        },

        // Topological sort for dependency resolution
        _topologicalSort: function(graph) {
            const visited = new Set();
            const temp = new Set();
            const result = [];

            const visit = (node) => {
                if (temp.has(node)) {
                    throw new Error(`Circular dependency detected involving ${node}`);
                }
                if (!visited.has(node)) {
                    temp.add(node);
                    const dependencies = graph.get(node) || [];
                    dependencies.forEach(dep => visit(dep));
                    temp.delete(node);
                    visited.add(node);
                    result.push(node);
                }
            };

            Array.from(graph.keys()).forEach(node => visit(node));
            return result;
        }
    };
})();

/**
 * State Management Module
 * Handles application state, data caching, and state synchronization
 */
App.State = (function() {
    'use strict';

    // Application state
    const state = {
        repositories: [],
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        pageSize: App.Core.getConfig('defaultPageSize'),
        searchQuery: '',
        sortBy: 'name-asc',
        loading: false,
        error: null,
        selectedRepository: null,
        cache: new Map()
    };

    // State change listeners
    const listeners = new Map();

    return {
        // State getters
        get: function(key) {
            return key ? state[key] : { ...state };
        },

        // State setters with change notification
        set: function(key, value) {
            const oldValue = state[key];
            state[key] = value;
            this._notifyListeners(key, value, oldValue);
        },

        // Batch state updates
        setState: function(updates) {
            const changes = {};
            Object.keys(updates).forEach(key => {
                changes[key] = { old: state[key], new: updates[key] };
                state[key] = updates[key];
            });

            Object.keys(changes).forEach(key => {
                this._notifyListeners(key, changes[key].new, changes[key].old);
            });
        },

        // State change listeners
        subscribe: function(key, callback) {
            if (!listeners.has(key)) {
                listeners.set(key, new Set());
            }
            listeners.get(key).add(callback);

            // Return unsubscribe function
            return () => {
                const keyListeners = listeners.get(key);
                if (keyListeners) {
                    keyListeners.delete(callback);
                }
            };
        },

        // Cache management
        setCache: function(key, value, ttl = 300000) { // 5 minutes default TTL
            state.cache.set(key, {
                value: value,
                timestamp: Date.now(),
                ttl: ttl
            });
        },

        getCache: function(key) {
            const cached = state.cache.get(key);
            if (!cached) return null;

            if (Date.now() - cached.timestamp > cached.ttl) {
                state.cache.delete(key);
                return null;
            }

            return cached.value;
        },

        clearCache: function(pattern = null) {
            if (pattern) {
                const regex = new RegExp(pattern);
                Array.from(state.cache.keys()).forEach(key => {
                    if (regex.test(key)) {
                        state.cache.delete(key);
                    }
                });
            } else {
                state.cache.clear();
            }
        },

        // Private methods
        _notifyListeners: function(key, newValue, oldValue) {
            const keyListeners = listeners.get(key);
            if (keyListeners) {
                keyListeners.forEach(callback => {
                    try {
                        callback(newValue, oldValue, key);
                    } catch (error) {
                        console.error(`Error in state listener for ${key}:`, error);
                    }
                });
            }
        },

        init: function() {
            console.log('State module initialized');
        }
    };
})();

/**
 * Event Management Module
 * Handles DOM events, custom events, and event delegation
 */
App.Events = (function() {
    'use strict';

    const eventHandlers = new Map();
    const customEventListeners = new Map();

    return {
        // DOM event handling with delegation
        delegate: function(container, selector, event, handler) {
            const containerElement = typeof container === 'string' ? 
                document.querySelector(container) : container;

            if (!containerElement) {
                console.warn(`Container not found: ${container}`);
                return null;
            }

            const delegatedHandler = function(e) {
                const target = e.target.closest(selector);
                if (target && containerElement.contains(target)) {
                    handler.call(target, e);
                }
            };

            containerElement.addEventListener(event, delegatedHandler);

            // Store handler for cleanup
            const handlerId = `${container}-${selector}-${event}`;
            eventHandlers.set(handlerId, {
                container: containerElement,
                event: event,
                handler: delegatedHandler
            });

            return handlerId;
        },

        // Direct event binding
        on: function(element, event, handler) {
            const targetElement = typeof element === 'string' ? 
                document.querySelector(element) : element;

            if (!targetElement) {
                console.warn(`Element not found: ${element}`);
                return null;
            }

            targetElement.addEventListener(event, handler);

            const handlerId = `direct-${Date.now()}-${Math.random()}`;
            eventHandlers.set(handlerId, {
                container: targetElement,
                event: event,
                handler: handler
            });

            return handlerId;
        },

        // Remove event handler
        off: function(handlerId) {
            const handlerData = eventHandlers.get(handlerId);
            if (handlerData) {
                handlerData.container.removeEventListener(
                    handlerData.event, 
                    handlerData.handler
                );
                eventHandlers.delete(handlerId);
                return true;
            }
            return false;
        },

        // Custom event system
        emit: function(eventName, data = null, target = window) {
            const customEvent = new CustomEvent(eventName, {
                detail: data,
                bubbles: true,
                cancelable: true
            });

            target.dispatchEvent(customEvent);
        },

        // Custom event listeners
        listen: function(eventName, handler, target = window) {
            const targetElement = typeof target === 'string' ? 
                document.querySelector(target) : target;

            targetElement.addEventListener(eventName, handler);

            const listenerId = `${eventName}-${Date.now()}-${Math.random()}`;
            customEventListeners.set(listenerId, {
                target: targetElement,
                event: eventName,
                handler: handler
            });

            return listenerId;
        },

        // Remove custom event listener
        unlisten: function(listenerId) {
            const listenerData = customEventListeners.get(listenerId);
            if (listenerData) {
                listenerData.target.removeEventListener(
                    listenerData.event,
                    listenerData.handler
                );
                customEventListeners.delete(listenerId);
                return true;
            }
            return false;
        },

        // Cleanup all event handlers
        cleanup: function() {
            eventHandlers.forEach((handlerData, handlerId) => {
                this.off(handlerId);
            });

            customEventListeners.forEach((listenerData, listenerId) => {
                this.unlisten(listenerId);
            });
        },

        init: function() {
            console.log('Events module initialized');
        }
    };
})();

/**
 * Rendering Module
 * Handles DOM manipulation, template rendering, and UI updates
 */
App.Render = (function() {
    'use strict';

    const templates = new Map();
    const renderCache = new Map();

    return {
        // Template registration and management
        registerTemplate: function(name, templateFunction) {
            templates.set(name, templateFunction);
        },

        getTemplate: function(name) {
            return templates.get(name);
        },

        // DOM element creation with attributes
        createElement: function(tag, attributes = {}, children = []) {
            const element = document.createElement(tag);

            // Set attributes
            Object.keys(attributes).forEach(key => {
                if (key === 'className') {
                    element.className = attributes[key];
                } else if (key === 'dataset') {
                    Object.keys(attributes[key]).forEach(dataKey => {
                        element.dataset[dataKey] = attributes[key][dataKey];
                    });
                } else if (key.startsWith('on') && typeof attributes[key] === 'function') {
                    element.addEventListener(key.slice(2).toLowerCase(), attributes[key]);
                } else {
                    element.setAttribute(key, attributes[key]);
                }
            });

            // Add children
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else if (child instanceof Node) {
                    element.appendChild(child);
                }
            });

            return element;
        },

        // Render content to container
        render: function(container, content, options = {}) {
            const targetElement = typeof container === 'string' ? 
                document.querySelector(container) : container;

            if (!targetElement) {
                console.warn(`Render target not found: ${container}`);
                return;
            }

            const { append = false, animate = false } = options;

            if (!append) {
                targetElement.innerHTML = '';
            }

            if (typeof content === 'string') {
                if (append) {
                    targetElement.insertAdjacentHTML('beforeend', content);
                } else {
                    targetElement.innerHTML = content;
                }
            } else if (content instanceof Node) {
                targetElement.appendChild(content);
            } else if (Array.isArray(content)) {
                content.forEach(item => {
                    if (typeof item === 'string') {
                        targetElement.insertAdjacentHTML('beforeend', item);
                    } else if (item instanceof Node) {
                        targetElement.appendChild(item);
                    }
                });
            }

            if (animate) {
                this._animateIn(targetElement);
            }
        },

        // Show/hide elements with optional animation
        show: function(element, animate = true) {
            const targetElement = typeof element === 'string' ? 
                document.querySelector(element) : element;

            if (targetElement) {
                targetElement.style.display = '';
                if (animate) {
                    this._animateIn(targetElement);
                }
            }
        },

        hide: function(element, animate = true) {
            const targetElement = typeof element === 'string' ? 
                document.querySelector(element) : element;

            if (targetElement) {
                if (animate) {
                    this._animateOut(targetElement, () => {
                        targetElement.style.display = 'none';
                    });
                } else {
                    targetElement.style.display = 'none';
                }
            }
        },

        // Update element content
        update: function(element, content) {
            const targetElement = typeof element === 'string' ? 
                document.querySelector(element) : element;

            if (targetElement) {
                if (typeof content === 'string') {
                    targetElement.textContent = content;
                } else if (content instanceof Node) {
                    targetElement.innerHTML = '';
                    targetElement.appendChild(content);
                }
            }
        },

        // Animation helpers
        _animateIn: function(element) {
            element.style.opacity = '0';
            element.style.transform = 'translateY(10px)';
            element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

            requestAnimationFrame(() => {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            });
        },

        _animateOut: function(element, callback) {
            element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            element.style.opacity = '0';
            element.style.transform = 'translateY(-10px)';

            setTimeout(() => {
                if (callback) callback();
                element.style.transition = '';
                element.style.transform = '';
            }, 300);
        },

        init: function() {
            console.log('Render module initialized');
        }
    };
})();

/**
 * Search Keyboard Handler Module
 * Handles global keyboard shortcuts for search functionality
 */
App.SearchKeyboard = (function() {
    'use strict';

    return {
        // Initialize keyboard event listeners
        init: function() {
            // Global keyboard shortcuts
            document.addEventListener('keydown', this.handleGlobalKeyboard.bind(this));
            
            // Search-specific keyboard handlers
            const searchInput = document.querySelector('#search-input');
            if (searchInput) {
                searchInput.addEventListener('keydown', this.handleSearchKeyboard.bind(this));
            }
        },

        // Handle global keyboard shortcuts
        handleGlobalKeyboard: function(event) {
            // Ctrl/Cmd + K: Focus search input
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                this.focusSearchInput();
                return;
            }
            
            // Escape: Clear search if input is focused
            if (event.key === 'Escape') {
                const activeElement = document.activeElement;
                if (activeElement && activeElement.id === 'search-input') {
                    this.clearSearch();
                }
                return;
            }
        },

        // Handle search input specific keyboard events
        handleSearchKeyboard: function(event) {
            const input = event.target;
            
            // Escape: Clear search
            if (event.key === 'Escape') {
                this.clearSearch();
                return;
            }
            
            // Enter: Focus first result if any
            if (event.key === 'Enter') {
                event.preventDefault();
                const firstResult = document.querySelector('.repository-card');
                if (firstResult) {
                    firstResult.focus();
                } else if (input.value.trim()) {
                    // If no results but has query, might want to trigger search
                    App.Events.emit('search:submit', { query: input.value.trim() });
                }
                return;
            }
        },

        // Focus search input and select its content
        focusSearchInput: function() {
            const input = document.querySelector('#search-input');
            if (input) {
                input.focus();
                input.select();
                
                // Emit focus event for other modules
                App.Events.emit('search:focus', { input });
            }
        },

        // Clear search and restore focus
        clearSearch: function() {
            const input = document.querySelector('#search-input');
            const clearButton = document.querySelector('#search-clear');
            
            if (input) {
                input.value = '';
                input.focus();
                
                // Hide clear button
                if (clearButton) {
                    clearButton.style.display = 'none';
                }
                
                // Emit clear event
                App.Events.emit('search:clear', { manually: true });
            }
        },

        // Cleanup event listeners
        cleanup: function() {
            document.removeEventListener('keydown', this.handleGlobalKeyboard.bind(this));
            const searchInput = document.querySelector('#search-input');
            if (searchInput) {
                searchInput.removeEventListener('keydown', this.handleSearchKeyboard.bind(this));
            }
        }
    };
})();

/**
 * Search Input Handler Module
 * Handles search input events, validation, and state management
 */
App.SearchInput = (function() {
    'use strict';

    let searchTimeout = null;
    
    return {
        // Initialize search input handlers
        init: function() {
            // Initialize enhanced debounced search
            this.initDebouncedSearch();
            
            const searchInput = document.querySelector('#search-input');
            const searchClear = document.querySelector('#search-clear');
            
            if (searchInput) {
                searchInput.addEventListener('input', this.handleInput.bind(this));
                searchInput.addEventListener('focus', this.handleFocus.bind(this));
                searchInput.addEventListener('blur', this.handleBlur.bind(this));
            }
            
            if (searchClear) {
                searchClear.addEventListener('click', this.handleClear.bind(this));
            }
            
            // Listen to search events from other modules
            App.Events.listen('search:clear', this.handleClearEvent.bind(this));
            App.Events.listen('search:focus', this.handleFocusEvent.bind(this));
        },

        // Handle input events with validation
        handleInput: function(event) {
            const input = event.target;
            const rawValue = input.value;
            
            // Validate and normalize input
            const normalizedValue = this.validateAndNormalizeInput(rawValue);
            
            // Update clear button visibility
            this.updateClearButton(normalizedValue);
            
            // Update search info
            this.updateSearchInfo(normalizedValue);
            
            // Update application state
            if (App.State) {
                App.State.set('searchQuery', normalizedValue);
            }
            
            // Emit search change event with debouncing
            this.emitSearchEvent(normalizedValue);
        },

        // Validate and normalize search input
        validateAndNormalizeInput: function(value) {
            if (!value || typeof value !== 'string') {
                return '';
            }
            
            // Trim whitespace
            let normalized = value.trim();
            
            // Limit length (reasonable limit for search queries)
            if (normalized.length > 200) {
                normalized = normalized.substring(0, 200);
            }
            
            // Basic sanitization - remove dangerous characters
            normalized = normalized.replace(/[<>]/g, '');
            
            return normalized;
        },

        // Update clear button visibility
        updateClearButton: function(query) {
            const clearButton = document.querySelector('#search-clear');
            if (clearButton) {
                if (query && query.length > 0) {
                    clearButton.style.display = 'block';
                    clearButton.setAttribute('tabindex', '0');
                } else {
                    clearButton.style.display = 'none';
                    clearButton.setAttribute('tabindex', '-1');
                }
            }
        },

        // Update search results info
        updateSearchInfo: function(query) {
            const searchInfo = document.querySelector('#search-info');
            const searchQuery = document.querySelector('#search-query');
            
            if (searchInfo && searchQuery) {
                if (query && query.length > 0) {
                    searchQuery.textContent = `for "${query}"`;
                    // searchInfo visibility will be controlled by search results
                } else {
                    searchInfo.style.display = 'none';
                    searchQuery.textContent = '';
                }
            }
        },

        // Enhanced debounced search function
        debouncedSearchEmit: null,
        
        // Initialize debounced search
        initDebouncedSearch: function() {
            if (App.Utils && App.Utils.debounceEnhanced) {
                this.debouncedSearchEmit = App.Utils.debounceEnhanced(
                    (query, timestamp) => {
                        App.Events.emit('search:query', { 
                            query: query,
                            timestamp: timestamp
                        });
                    },
                    App.Core.getConfig('debounceDelay') || 300,
                    {
                        trailing: true,
                        maxWait: 1000  // Force execution after 1s of continuous typing
                    }
                );
            }
        },

        // Emit search event with enhanced debouncing
        emitSearchEvent: function(query) {
            if (this.debouncedSearchEmit) {
                this.debouncedSearchEmit(query, Date.now());
            } else {
                // Fallback to basic timeout-based debounce
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                
                searchTimeout = setTimeout(() => {
                    App.Events.emit('search:query', { 
                        query: query,
                        timestamp: Date.now()
                    });
                }, App.Core.getConfig('debounceDelay') || 300);
            }
        },

        // Handle focus events
        handleFocus: function(event) {
            const input = event.target;
            input.classList.add('focused');
            
            // Show recent searches or suggestions if implemented
            App.Events.emit('search:focused', { input });
        },

        // Handle blur events
        handleBlur: function(event) {
            const input = event.target;
            input.classList.remove('focused');
            
            App.Events.emit('search:blurred', { input });
        },

        // Handle clear button click
        handleClear: function(event) {
            event.preventDefault();
            this.clearSearch();
        },

        // Clear search functionality
        clearSearch: function() {
            const input = document.querySelector('#search-input');
            if (input) {
                input.value = '';
                this.updateClearButton('');
                this.updateSearchInfo('');
                
                // Update state
                if (App.State) {
                    App.State.set('searchQuery', '');
                }
                
                // Focus back on input
                input.focus();
                
                // Emit clear event
                App.Events.emit('search:cleared', { manually: true });
            }
        },

        // Handle clear events from other modules
        handleClearEvent: function(data) {
            if (data && data.detail && !data.detail.manually) {
                // Clear was triggered externally, update UI accordingly
                this.clearSearch();
            }
        },

        // Handle focus events from other modules
        handleFocusEvent: function(data) {
            const input = document.querySelector('#search-input');
            if (input && input !== document.activeElement) {
                input.focus();
                input.select();
            }
        },

        // Get current search query
        getQuery: function() {
            const input = document.querySelector('#search-input');
            return input ? this.validateAndNormalizeInput(input.value) : '';
        },

        // Set search query programmatically
        setQuery: function(query) {
            const input = document.querySelector('#search-input');
            if (input) {
                const normalized = this.validateAndNormalizeInput(query);
                input.value = normalized;
                this.updateClearButton(normalized);
                this.updateSearchInfo(normalized);
                
                // Update state
                if (App.State) {
                    App.State.set('searchQuery', normalized);
                }
                
                // Emit search event
                this.emitSearchEvent(normalized);
            }
        },

        // Cleanup
        cleanup: function() {
            // Cancel enhanced debounced function
            if (this.debouncedSearchEmit && typeof this.debouncedSearchEmit.cancel === 'function') {
                this.debouncedSearchEmit.cancel();
            }
            
            // Clean up fallback timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
                searchTimeout = null;
            }
            
            const searchInput = document.querySelector('#search-input');
            const searchClear = document.querySelector('#search-clear');
            
            if (searchInput) {
                searchInput.removeEventListener('input', this.handleInput.bind(this));
                searchInput.removeEventListener('focus', this.handleFocus.bind(this));
                searchInput.removeEventListener('blur', this.handleBlur.bind(this));
            }
            
            if (searchClear) {
                searchClear.removeEventListener('click', this.handleClear.bind(this));
            }
        }
    };
})();

/**
 * Search State Sync Module
 * Handles URL synchronization and search state management
 */
App.SearchStateSync = (function() {
    'use strict';
    
    let isUpdatingURL = false;  // Prevent infinite loops
    
    return {
        // Initialize URL state synchronization
        init: function() {
            // Restore state from URL on page load
            this.restoreFromURL();
            
            // Listen to popstate events (browser back/forward)
            window.addEventListener('popstate', this.handlePopState.bind(this));
            
            // Listen to search state changes to update URL
            if (App.State && App.State.subscribe) {
                App.State.subscribe('searchQuery', this.handleSearchQueryChange.bind(this));
                App.State.subscribe('currentPage', this.handlePaginationChange.bind(this));
                App.State.subscribe('pageSize', this.handlePaginationChange.bind(this));
                App.State.subscribe('sortBy', this.handleSortChange.bind(this));
            }
            
            // Listen to search events to update URL
            App.Events.listen('search:query', this.handleSearchEvent.bind(this));
            App.Events.listen('search:cleared', this.handleSearchClear.bind(this));
            
            // Listen to data load events to validate page numbers
            App.Events.listen('data:loaded', this.handleDataLoaded.bind(this));
        },
        
        // Restore search state from URL parameters
        restoreFromURL: function() {
            const params = new URLSearchParams(window.location.search);
            const query = params.get('q') || '';
            
            // Validate and sanitize page number
            let page = this.validatePageNumber(parseInt(params.get('page')));
            
            // Get page size from URL first, then fallback to localStorage, then to default
            let size = this.validatePageSize(parseInt(params.get('size')));
            if (!size) {
                const storedSize = this.getStoredPageSize();
                size = storedSize || 20;
            }
            
            const sort = params.get('sort') || 'name-asc';
            
            // Update application state without triggering URL update
            isUpdatingURL = true;
            
            if (App.State) {
                App.State.setState({
                    searchQuery: query,
                    currentPage: page,
                    pageSize: size,
                    sortBy: sort
                });
            }
            
            // Update search input UI
            if (query && App.SearchInput) {
                App.SearchInput.setQuery(query);
            }
            
            isUpdatingURL = false;
            
            return { query, page, size, sort };
        },
        
        // Update URL with current search state
        updateURL: function() {
            if (isUpdatingURL) return; // Prevent loops
            
            const query = App.State ? App.State.get('searchQuery') : '';
            const currentPage = App.State ? App.State.get('currentPage') : 1;
            const pageSize = App.State ? App.State.get('pageSize') : 20;
            const sortBy = App.State ? App.State.get('sortBy') : 'name-asc';
            
            const params = new URLSearchParams(window.location.search);
            
            // Update or remove query parameter
            if (query && query.trim()) {
                params.set('q', query.trim());
            } else {
                params.delete('q');
            }
            
            // Update or remove page parameter (only if not first page)
            if (currentPage && currentPage > 1) {
                params.set('page', currentPage.toString());
            } else {
                params.delete('page');
            }
            
            // Update or remove size parameter (only if not default)
            if (pageSize && pageSize !== 20) {
                params.set('size', pageSize.toString());
            } else {
                params.delete('size');
            }
            
            // Update or remove sort parameter (only if not default)
            if (sortBy && sortBy !== 'name-asc') {
                params.set('sort', sortBy);
            } else {
                params.delete('sort');
            }
            
            // Construct new URL
            const queryString = params.toString();
            const newURL = `${window.location.pathname}${queryString ? '?' + queryString : ''}`;
            
            // Update URL without causing page reload
            if (newURL !== window.location.pathname + window.location.search) {
                window.history.replaceState(
                    { 
                        searchQuery: query, 
                        currentPage: currentPage, 
                        pageSize: pageSize,
                        sortBy: sortBy 
                    },
                    '',
                    newURL
                );
                
                // Update page title if searching
                if (query && query.trim()) {
                    document.title = `RepoVista - Search: ${query}`;
                } else {
                    document.title = 'RepoVista - Docker Registry Browser';
                }
            }
        },
        
        // Handle popstate events (browser navigation)
        handlePopState: function(event) {
            if (event.state) {
                // Restore from history state
                const { searchQuery, currentPage, pageSize, sortBy } = event.state;
                this.restoreStateFromHistory(searchQuery, currentPage, pageSize, sortBy);
            } else {
                // No state available, restore from URL
                this.restoreFromURL();
            }
        },
        
        // Restore state from browser history
        restoreStateFromHistory: function(searchQuery, currentPage, pageSize, sortBy) {
            isUpdatingURL = true;
            
            // Use stored page size as fallback if not provided in history
            if (!pageSize) {
                pageSize = this.getStoredPageSize() || 20;
            }
            
            if (App.State) {
                App.State.setState({
                    searchQuery: searchQuery || '',
                    currentPage: currentPage || 1,
                    pageSize: pageSize,
                    sortBy: sortBy || 'name-asc'
                });
            }
            
            // Update search input UI
            if (App.SearchInput) {
                App.SearchInput.setQuery(searchQuery || '');
            }
            
            // Trigger search with new state
            App.Events.emit('search:restored', {
                query: searchQuery || '',
                page: currentPage || 1,
                size: pageSize || 20,
                sort: sortBy || 'name-asc'
            });
            
            isUpdatingURL = false;
        },
        
        // Handle search query state changes
        handleSearchQueryChange: function(newValue, oldValue, key) {
            if (!isUpdatingURL) {
                this.updateURL();
            }
        },
        
        // Handle search events
        handleSearchEvent: function(data) {
            if (!isUpdatingURL && data && data.detail) {
                // Reset to first page on new search
                if (App.State && data.detail.query) {
                    App.State.set('currentPage', 1);
                }
                this.updateURL();
            }
        },
        
        // Handle search clear events
        handleSearchClear: function(data) {
            if (!isUpdatingURL) {
                // Reset pagination on clear
                if (App.State) {
                    App.State.set('currentPage', 1);
                }
                this.updateURL();
            }
        },
        
        // Handle pagination state changes
        handlePaginationChange: function(newValue, oldValue, key) {
            if (!isUpdatingURL) {
                // Store page size in localStorage when it changes
                if (key === 'pageSize' && newValue !== oldValue) {
                    this.storePageSize(newValue);
                }
                this.updateURL();
            }
        },
        
        // Handle sort state changes
        handleSortChange: function(newValue, oldValue, key) {
            if (!isUpdatingURL) {
                this.updateURL();
            }
        },
        
        // Get current URL parameters as object
        getURLParams: function() {
            const params = new URLSearchParams(window.location.search);
            return {
                query: params.get('q') || '',
                page: parseInt(params.get('page')) || 1,
                size: parseInt(params.get('size')) || 20,
                sort: params.get('sort') || 'name-asc'
            };
        },
        
        // Set URL parameters programmatically
        setURLParams: function(newParams) {
            isUpdatingURL = true;
            
            const { query, page, size, sort } = newParams;
            
            if (App.State) {
                App.State.setState({
                    searchQuery: query || '',
                    currentPage: page || 1,
                    pageSize: size || 20,
                    sortBy: sort || 'name-asc'
                });
            }
            
            if (App.SearchInput && query !== undefined) {
                App.SearchInput.setQuery(query || '');
            }
            
            this.updateURL();
            isUpdatingURL = false;
        },
        
        // Create bookmarkable URL for current search state
        getBookmarkableURL: function() {
            const query = App.State ? App.State.get('searchQuery') : '';
            const currentPage = App.State ? App.State.get('currentPage') : 1;
            const pageSize = App.State ? App.State.get('pageSize') : 20;
            const sortBy = App.State ? App.State.get('sortBy') : 'name-asc';
            
            const params = new URLSearchParams();
            if (query && query.trim()) params.set('q', query.trim());
            if (currentPage > 1) params.set('page', currentPage.toString());
            if (pageSize !== 20) params.set('size', pageSize.toString());
            if (sortBy !== 'name-asc') params.set('sort', sortBy);
            
            const queryString = params.toString();
            return `${window.location.origin}${window.location.pathname}${queryString ? '?' + queryString : ''}`;
        },
        
        // LocalStorage helpers
        getStoredPageSize: function() {
            try {
                const stored = localStorage.getItem('repovista-page-size');
                if (stored) {
                    const size = parseInt(stored);
                    // Validate that it's one of the allowed sizes
                    if ([20, 50, 100].includes(size)) {
                        return size;
                    }
                }
            } catch (error) {
                console.warn('Error reading from localStorage:', error);
            }
            return null;
        },
        
        storePageSize: function(pageSize) {
            try {
                // Only store if it's one of the allowed sizes and not the default
                if ([20, 50, 100].includes(pageSize)) {
                    localStorage.setItem('repovista-page-size', pageSize.toString());
                }
            } catch (error) {
                console.warn('Error writing to localStorage:', error);
            }
        },
        
        // Handle data loaded to validate page numbers
        handleDataLoaded: function(data) {
            if (!isUpdatingURL && App.State) {
                const currentPage = App.State.get('currentPage');
                const totalPages = App.State.get('totalPages') || 1;
                
                // Validate current page against total pages
                const validPage = this.validateAndFixPageNumber(currentPage, totalPages);
                
                if (validPage !== currentPage) {
                    // Update state and URL if page was invalid
                    App.State.set('currentPage', validPage);
                    this.updateURL();
                }
            }
        },
        
        // Validation helpers for URL parameters
        validatePageNumber: function(page) {
            // Handle invalid, negative, or zero page numbers
            if (!page || isNaN(page) || page < 1) {
                return 1;
            }
            
            // For now, just ensure it's a positive integer
            // We'll validate against totalPages later when we have that data
            return Math.max(1, Math.floor(page));
        },
        
        validatePageSize: function(size) {
            // Only allow valid page sizes
            if (!size || isNaN(size)) {
                return null;
            }
            
            const allowedSizes = [20, 50, 100];
            if (allowedSizes.includes(size)) {
                return size;
            }
            
            // Return closest valid size
            const closest = allowedSizes.reduce((prev, curr) => 
                Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev
            );
            
            return closest;
        },
        
        // Validate page against total pages and redirect if necessary
        validateAndFixPageNumber: function(page, totalPages) {
            if (!totalPages || totalPages < 1) {
                return 1;
            }
            
            if (page > totalPages) {
                // Redirect to last valid page
                console.warn(`Page ${page} exceeds total pages ${totalPages}, redirecting to page ${totalPages}`);
                return totalPages;
            }
            
            if (page < 1) {
                console.warn(`Invalid page ${page}, redirecting to page 1`);
                return 1;
            }
            
            return page;
        },
        
        // Cleanup
        cleanup: function() {
            window.removeEventListener('popstate', this.handlePopState.bind(this));
            
            if (App.State && App.State.unsubscribe) {
                App.State.unsubscribe('searchQuery', this.handleSearchQueryChange.bind(this));
                App.State.unsubscribe('currentPage', this.handlePaginationChange.bind(this));
                App.State.unsubscribe('pageSize', this.handlePaginationChange.bind(this));
                App.State.unsubscribe('sortBy', this.handleSortChange.bind(this));
            }
        }
    };
})();

/**
 * Search History Manager Module
 * Manages search history and suggestions
 */
App.SearchHistory = (function() {
    'use strict';
    
    const STORAGE_KEY = 'repovista_search_history';
    const MAX_HISTORY_ITEMS = 10;
    
    let searchHistory = [];
    
    return {
        // Initialize search history
        init: function() {
            // Load history from localStorage
            this.loadHistory();
            
            // Listen to search events to add to history
            App.Events.listen('search:query', this.handleSearchQuery.bind(this));
        },
        
        // Load search history from localStorage
        loadHistory: function() {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    searchHistory = JSON.parse(stored);
                    // Validate history items
                    searchHistory = searchHistory.filter(item => 
                        item && typeof item === 'object' && 
                        item.query && typeof item.query === 'string'
                    ).slice(0, MAX_HISTORY_ITEMS);
                }
            } catch (error) {
                console.warn('Failed to load search history:', error);
                searchHistory = [];
            }
        },
        
        // Save search history to localStorage
        saveHistory: function() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(searchHistory));
            } catch (error) {
                console.warn('Failed to save search history:', error);
            }
        },
        
        // Add search query to history
        addToHistory: function(query, resultCount = 0) {
            if (!query || typeof query !== 'string' || query.trim().length < 2) {
                return; // Don't add empty or very short queries
            }
            
            const normalizedQuery = query.trim();
            const timestamp = Date.now();
            
            // Remove existing entry if it exists
            searchHistory = searchHistory.filter(item => 
                item.query.toLowerCase() !== normalizedQuery.toLowerCase()
            );
            
            // Add new entry at the beginning
            searchHistory.unshift({
                query: normalizedQuery,
                timestamp: timestamp,
                resultCount: resultCount
            });
            
            // Limit history size
            if (searchHistory.length > MAX_HISTORY_ITEMS) {
                searchHistory = searchHistory.slice(0, MAX_HISTORY_ITEMS);
            }
            
            // Save to localStorage
            this.saveHistory();
            
            // Emit history updated event
            App.Events.emit('search:history-updated', { 
                history: this.getHistory() 
            });
        },
        
        // Handle search query events
        handleSearchQuery: function(data) {
            if (data && data.detail && data.detail.query) {
                // Add to history after a delay to get result count
                setTimeout(() => {
                    const resultCount = App.State ? 
                        (App.State.get('repositories') || []).length : 0;
                    this.addToHistory(data.detail.query, resultCount);
                }, 1000);
            }
        },
        
        // Get search history
        getHistory: function() {
            return [...searchHistory]; // Return copy
        },
        
        // Get recent searches (limited)
        getRecentSearches: function(limit = 5) {
            return searchHistory.slice(0, limit);
        },
        
        // Clear search history
        clearHistory: function() {
            searchHistory = [];
            this.saveHistory();
            
            App.Events.emit('search:history-cleared', {});
        },
        
        // Remove specific item from history
        removeFromHistory: function(query) {
            const originalLength = searchHistory.length;
            searchHistory = searchHistory.filter(item => 
                item.query.toLowerCase() !== query.toLowerCase()
            );
            
            if (searchHistory.length !== originalLength) {
                this.saveHistory();
                App.Events.emit('search:history-updated', { 
                    history: this.getHistory() 
                });
            }
        },
        
        // Get search suggestions based on input
        getSuggestions: function(partialQuery, limit = 5) {
            if (!partialQuery || partialQuery.length < 1) {
                return this.getRecentSearches(limit);
            }
            
            const query = partialQuery.toLowerCase();
            return searchHistory
                .filter(item => item.query.toLowerCase().includes(query))
                .slice(0, limit)
                .map(item => ({
                    ...item,
                    type: 'history'
                }));
        }
    };
})();

/**
 * Filter Engine Module
 * Provides comprehensive search and filtering capabilities with fuzzy matching
 */
App.FilterEngine = (function() {
    'use strict';

    // Configuration constants
    const CONFIG = {
        FUZZY_THRESHOLD: 0.6,           // Minimum similarity score for fuzzy matches
        MAX_RESULTS: 1000,              // Maximum number of results to process
        CACHE_TTL: 300000,              // Cache TTL: 5 minutes
        MIN_QUERY_LENGTH: 1,            // Minimum query length to trigger search
        SCORE_WEIGHTS: {
            exact: 1.0,                 // Exact matches get full score
            prefix: 0.9,                // Prefix matches
            substring: 0.8,             // Substring matches
            fuzzy: 0.7,                 // Fuzzy matches
            tag: 0.6                    // Tag matches get lower weight
        }
    };

    // Search result cache
    const searchCache = new Map();
    
    // Pre-built search indices for faster lookup
    let repositoryIndex = null;
    let lastIndexTime = 0;
    const INDEX_REBUILD_INTERVAL = 60000; // Rebuild index every minute

    return {
        /**
         * Main search method - filters and ranks results
         * @param {string} query - Search query
         * @param {Array} repositories - Array of repository objects
         * @param {Object} options - Search options
         * @returns {Array} Filtered and ranked results
         */
        search: function(query, repositories = [], options = {}) {
            const startTime = performance.now();
            
            // Validate inputs
            if (!query || typeof query !== 'string' || query.length < CONFIG.MIN_QUERY_LENGTH) {
                return repositories;
            }
            
            if (!Array.isArray(repositories) || repositories.length === 0) {
                return [];
            }

            // Normalize query
            const normalizedQuery = this._normalizeQuery(query);
            if (!normalizedQuery) {
                return repositories;
            }

            // Check cache first
            const cacheKey = this._getCacheKey(normalizedQuery, repositories.length, options);
            const cached = this._getFromCache(cacheKey);
            if (cached) {
                return cached;
            }

            // Prepare search options
            const searchOptions = {
                fuzzyThreshold: options.fuzzyThreshold || CONFIG.FUZZY_THRESHOLD,
                maxResults: options.maxResults || CONFIG.MAX_RESULTS,
                categories: options.categories || ['name', 'tags', 'description'],
                sortBy: options.sortBy || 'relevance'
            };

            try {
                // Rebuild index if needed
                this._rebuildIndexIfNeeded(repositories);

                // Perform search with multiple strategies
                const results = this._performSearch(normalizedQuery, repositories, searchOptions);
                
                // Sort and limit results
                const finalResults = this._sortAndLimitResults(results, searchOptions);

                // Cache results
                this._setCache(cacheKey, finalResults);

                // Log performance
                const duration = performance.now() - startTime;
                if (App.Core && App.Core.getModule && App.Core.getModule('Logger')) {
                    App.Core.getModule('Logger').debug('Search completed', {
                        query: normalizedQuery,
                        resultCount: finalResults.length,
                        duration: `${duration.toFixed(2)}ms`
                    });
                }

                return finalResults;
            } catch (error) {
                console.error('Search failed:', error);
                return repositories; // Fallback to original list
            }
        },

        /**
         * Fuzzy match implementation using enhanced string similarity
         * @param {string} query - Search query
         * @param {string} target - Target string to match against
         * @param {number} threshold - Minimum similarity threshold
         * @returns {Object|null} Match result with score
         */
        fuzzyMatch: function(query, target, threshold = CONFIG.FUZZY_THRESHOLD) {
            if (!query || !target) return null;

            const normalizedQuery = query.toLowerCase().trim();
            const normalizedTarget = target.toLowerCase().trim();

            // Exact match
            if (normalizedTarget === normalizedQuery) {
                return { score: CONFIG.SCORE_WEIGHTS.exact, type: 'exact' };
            }

            // Prefix match
            if (normalizedTarget.startsWith(normalizedQuery)) {
                return { score: CONFIG.SCORE_WEIGHTS.prefix, type: 'prefix' };
            }

            // Substring match
            if (normalizedTarget.includes(normalizedQuery)) {
                return { score: CONFIG.SCORE_WEIGHTS.substring, type: 'substring' };
            }

            // Fuzzy match using Levenshtein distance
            const similarity = this._calculateSimilarity(normalizedQuery, normalizedTarget);
            if (similarity >= threshold) {
                return { 
                    score: similarity * CONFIG.SCORE_WEIGHTS.fuzzy, 
                    type: 'fuzzy',
                    similarity: similarity
                };
            }

            return null;
        },

        /**
         * Calculate relevance score for a repository
         * @param {string} query - Search query
         * @param {Object} repository - Repository object
         * @returns {Object} Score details
         */
        calculateScore: function(query, repository) {
            if (!query || !repository) {
                return { total: 0, details: {} };
            }

            const scores = {
                name: 0,
                tags: 0,
                description: 0
            };

            const normalizedQuery = query.toLowerCase().trim();

            // Score repository name
            if (repository.name) {
                const nameMatch = this.fuzzyMatch(normalizedQuery, repository.name);
                if (nameMatch) {
                    scores.name = nameMatch.score * 2; // Name matches get double weight
                }
            }

            // Score tags
            if (repository.tags && Array.isArray(repository.tags)) {
                let maxTagScore = 0;
                repository.tags.forEach(tag => {
                    if (tag && tag.name) {
                        const tagMatch = this.fuzzyMatch(normalizedQuery, tag.name);
                        if (tagMatch) {
                            maxTagScore = Math.max(maxTagScore, tagMatch.score * CONFIG.SCORE_WEIGHTS.tag);
                        }
                    }
                });
                scores.tags = maxTagScore;
            }

            // Score description
            if (repository.description) {
                const descMatch = this.fuzzyMatch(normalizedQuery, repository.description);
                if (descMatch) {
                    scores.description = descMatch.score * 0.5; // Description gets lower weight
                }
            }

            const totalScore = scores.name + scores.tags + scores.description;
            
            return {
                total: totalScore,
                details: scores,
                hasMatch: totalScore > 0
            };
        },

        /**
         * Filter repositories by category
         * @param {Array} repositories - Repository list
         * @param {string} category - Category to filter by
         * @param {string} query - Search query
         * @returns {Array} Filtered repositories
         */
        filterByCategory: function(repositories, category, query) {
            if (!repositories || !Array.isArray(repositories)) {
                return [];
            }

            if (!query || !category) {
                return repositories;
            }

            return repositories.filter(repo => {
                switch (category.toLowerCase()) {
                    case 'name':
                        return repo.name && this.fuzzyMatch(query, repo.name);
                    case 'tags':
                        return repo.tags && repo.tags.some(tag => 
                            tag.name && this.fuzzyMatch(query, tag.name)
                        );
                    case 'description':
                        return repo.description && this.fuzzyMatch(query, repo.description);
                    default:
                        return this.calculateScore(query, repo).hasMatch;
                }
            });
        },

        /**
         * Clear search cache
         */
        clearCache: function() {
            searchCache.clear();
            repositoryIndex = null;
            lastIndexTime = 0;
        },

        /**
         * Get cache statistics
         */
        getCacheStats: function() {
            return {
                size: searchCache.size,
                indexAge: Date.now() - lastIndexTime,
                hasIndex: !!repositoryIndex
            };
        },

        // Private methods

        /**
         * Normalize search query
         * @private
         */
        _normalizeQuery: function(query) {
            if (!query || typeof query !== 'string') {
                return '';
            }

            return query.trim()
                .toLowerCase()
                .replace(/[^\w\s-_.]/g, '') // Remove special characters except common ones
                .replace(/\s+/g, ' ') // Normalize whitespace
                .substring(0, 200); // Limit length
        },

        /**
         * Generate cache key
         * @private
         */
        _getCacheKey: function(query, repositoryCount, options) {
            const optionsHash = JSON.stringify(options);
            return `search:${query}:${repositoryCount}:${btoa(optionsHash)}`;
        },

        /**
         * Get from cache with TTL check
         * @private
         */
        _getFromCache: function(key) {
            const cached = searchCache.get(key);
            if (!cached) return null;

            if (Date.now() - cached.timestamp > CONFIG.CACHE_TTL) {
                searchCache.delete(key);
                return null;
            }

            return cached.data;
        },

        /**
         * Set cache with timestamp
         * @private
         */
        _setCache: function(key, data) {
            // Limit cache size
            if (searchCache.size >= 100) {
                const firstKey = searchCache.keys().next().value;
                searchCache.delete(firstKey);
            }

            searchCache.set(key, {
                data: data,
                timestamp: Date.now()
            });
        },

        /**
         * Rebuild search index if needed
         * @private
         */
        _rebuildIndexIfNeeded: function(repositories) {
            const now = Date.now();
            if (!repositoryIndex || (now - lastIndexTime) > INDEX_REBUILD_INTERVAL) {
                repositoryIndex = this._buildSearchIndex(repositories);
                lastIndexTime = now;
            }
        },

        /**
         * Build search index for faster lookups
         * @private
         */
        _buildSearchIndex: function(repositories) {
            const index = {
                names: new Map(),
                tags: new Map(),
                descriptions: new Map()
            };

            repositories.forEach((repo, idx) => {
                // Index repository names
                if (repo.name) {
                    const normalized = repo.name.toLowerCase();
                    if (!index.names.has(normalized)) {
                        index.names.set(normalized, []);
                    }
                    index.names.get(normalized).push(idx);
                }

                // Index tags
                if (repo.tags && Array.isArray(repo.tags)) {
                    repo.tags.forEach(tag => {
                        if (tag && tag.name) {
                            const normalized = tag.name.toLowerCase();
                            if (!index.tags.has(normalized)) {
                                index.tags.set(normalized, []);
                            }
                            index.tags.get(normalized).push(idx);
                        }
                    });
                }

                // Index descriptions (word-based)
                if (repo.description) {
                    const words = repo.description.toLowerCase().split(/\s+/);
                    words.forEach(word => {
                        if (word.length > 2) { // Skip short words
                            if (!index.descriptions.has(word)) {
                                index.descriptions.set(word, []);
                            }
                            index.descriptions.get(word).push(idx);
                        }
                    });
                }
            });

            return index;
        },

        /**
         * Perform search using multiple strategies
         * @private
         */
        _performSearch: function(query, repositories, options) {
            const results = new Map(); // Use Map to avoid duplicates

            // Strategy 1: Direct matches using index
            if (repositoryIndex) {
                this._searchUsingIndex(query, repositories, options, results);
            }

            // Strategy 2: Full fuzzy search for remaining items
            repositories.forEach((repo, idx) => {
                if (!results.has(idx)) {
                    const scoreResult = this.calculateScore(query, repo);
                    if (scoreResult.hasMatch) {
                        results.set(idx, {
                            repository: repo,
                            score: scoreResult.total,
                            scoreDetails: scoreResult.details,
                            index: idx
                        });
                    }
                }
            });

            return Array.from(results.values());
        },

        /**
         * Search using pre-built index
         * @private
         */
        _searchUsingIndex: function(query, repositories, options, results) {
            const normalizedQuery = query.toLowerCase();

            // Search in names
            for (const [name, indices] of repositoryIndex.names.entries()) {
                if (name.includes(normalizedQuery)) {
                    indices.forEach(idx => {
                        if (!results.has(idx)) {
                            const repo = repositories[idx];
                            const scoreResult = this.calculateScore(query, repo);
                            if (scoreResult.hasMatch) {
                                results.set(idx, {
                                    repository: repo,
                                    score: scoreResult.total,
                                    scoreDetails: scoreResult.details,
                                    index: idx
                                });
                            }
                        }
                    });
                }
            }

            // Search in tags
            for (const [tag, indices] of repositoryIndex.tags.entries()) {
                if (tag.includes(normalizedQuery)) {
                    indices.forEach(idx => {
                        if (!results.has(idx)) {
                            const repo = repositories[idx];
                            const scoreResult = this.calculateScore(query, repo);
                            if (scoreResult.hasMatch) {
                                results.set(idx, {
                                    repository: repo,
                                    score: scoreResult.total,
                                    scoreDetails: scoreResult.details,
                                    index: idx
                                });
                            }
                        }
                    });
                }
            }
        },

        /**
         * Sort and limit search results
         * @private
         */
        _sortAndLimitResults: function(results, options) {
            // Sort by score (highest first)
            results.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                // Secondary sort by name for consistent ordering
                return a.repository.name.localeCompare(b.repository.name);
            });

            // Limit results
            const limitedResults = results.slice(0, options.maxResults);

            // Return repository objects with score metadata
            return limitedResults.map(result => ({
                ...result.repository,
                _searchScore: result.score,
                _scoreDetails: result.scoreDetails
            }));
        },

        /**
         * Calculate string similarity using Levenshtein distance
         * @private
         */
        _calculateSimilarity: function(str1, str2) {
            if (str1 === str2) return 1.0;
            if (str1.length === 0 || str2.length === 0) return 0.0;

            // Use Levenshtein distance for similarity calculation
            const distance = this._levenshteinDistance(str1, str2);
            const maxLength = Math.max(str1.length, str2.length);
            
            return 1.0 - (distance / maxLength);
        },

        /**
         * Calculate Levenshtein distance between two strings
         * @private
         */
        _levenshteinDistance: function(str1, str2) {
            const len1 = str1.length;
            const len2 = str2.length;
            
            // Create matrix
            const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
            
            // Initialize first row and column
            for (let i = 0; i <= len1; i++) matrix[0][i] = i;
            for (let j = 0; j <= len2; j++) matrix[j][0] = j;
            
            // Fill matrix
            for (let j = 1; j <= len2; j++) {
                for (let i = 1; i <= len1; i++) {
                    const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                    matrix[j][i] = Math.min(
                        matrix[j - 1][i] + 1,     // deletion
                        matrix[j][i - 1] + 1,     // insertion
                        matrix[j - 1][i - 1] + cost // substitution
                    );
                }
            }
            
            return matrix[len2][len1];
        },

        /**
         * Initialize the FilterEngine module
         */
        init: function() {
            // Clear any existing cache
            this.clearCache();
            
            // Listen for repository data changes to invalidate cache
            if (App.Events) {
                App.Events.listen('repositories:updated', () => {
                    this.clearCache();
                });
            }

            console.log('FilterEngine module initialized');
        }
    };
})();

/**
 * Search Controller Module
 * Handles search operations using FilterEngine and coordinates with UI updates
 */
App.SearchController = (function() {
    'use strict';

    let lastSearchQuery = '';
    let originalRepositories = [];
    let isSearching = false;

    return {
        /**
         * Initialize the Search Controller
         */
        init: function() {
            // Listen to search events
            App.Events.listen('search:query', this.handleSearchQuery.bind(this));
            App.Events.listen('search:cleared', this.handleSearchCleared.bind(this));
            App.Events.listen('repositories:loaded', this.handleRepositoriesLoaded.bind(this));
            
            console.log('SearchController module initialized');
        },

        /**
         * Handle search query events
         */
        handleSearchQuery: function(data) {
            if (!data || !data.detail || typeof data.detail.query !== 'string') {
                return;
            }

            const query = data.detail.query.trim();
            lastSearchQuery = query;

            // If no query, show all repositories
            if (!query) {
                this.showAllRepositories();
                return;
            }

            // Perform search
            this.performSearch(query);
        },

        /**
         * Handle search cleared events
         */
        handleSearchCleared: function(data) {
            lastSearchQuery = '';
            this.showAllRepositories();
        },

        /**
         * Handle repositories loaded event to store original data
         */
        handleRepositoriesLoaded: function(data) {
            if (data && data.detail && Array.isArray(data.detail.repositories)) {
                originalRepositories = [...data.detail.repositories];
                
                // If there's an active search, reapply it
                if (lastSearchQuery) {
                    this.performSearch(lastSearchQuery);
                }
            }
        },

        /**
         * Perform search using FilterEngine
         */
        performSearch: function(query) {
            if (isSearching) {
                return; // Prevent concurrent searches
            }

            isSearching = true;
            const startTime = performance.now();

            try {
                // Get current repositories from state
                let repositories = originalRepositories;
                if (App.State) {
                    const stateRepos = App.State.get('repositories');
                    if (Array.isArray(stateRepos) && stateRepos.length > 0) {
                        repositories = stateRepos;
                    }
                }

                if (!Array.isArray(repositories) || repositories.length === 0) {
                    this.updateSearchResults([], query);
                    return;
                }

                // Use FilterEngine to search
                const filterEngine = App.Core.getModule('FilterEngine');
                if (!filterEngine) {
                    console.warn('FilterEngine not available, performing basic search');
                    this.performBasicSearch(query, repositories);
                    return;
                }

                // Configure search options
                const searchOptions = {
                    fuzzyThreshold: 0.6,
                    maxResults: 1000,
                    categories: ['name', 'tags', 'description'],
                    sortBy: 'relevance'
                };

                // Perform the search
                const results = filterEngine.search(query, repositories, searchOptions);
                
                // Update UI with results
                this.updateSearchResults(results, query);

                // Log search performance
                const duration = performance.now() - startTime;
                this.logSearchPerformance(query, results.length, duration);

            } catch (error) {
                console.error('Search failed:', error);
                this.handleSearchError(query, error);
            } finally {
                isSearching = false;
            }
        },

        /**
         * Perform basic search fallback when FilterEngine is not available
         */
        performBasicSearch: function(query, repositories) {
            const normalizedQuery = query.toLowerCase().trim();
            
            const results = repositories.filter(repo => {
                // Basic name matching
                if (repo.name && repo.name.toLowerCase().includes(normalizedQuery)) {
                    return true;
                }
                
                // Basic tag matching
                if (repo.tags && Array.isArray(repo.tags)) {
                    return repo.tags.some(tag => 
                        tag.name && tag.name.toLowerCase().includes(normalizedQuery)
                    );
                }
                
                // Basic description matching
                if (repo.description && repo.description.toLowerCase().includes(normalizedQuery)) {
                    return true;
                }
                
                return false;
            });

            this.updateSearchResults(results, query);
        },

        /**
         * Show all repositories (clear search)
         */
        showAllRepositories: function() {
            let repositories = originalRepositories;
            if (App.State) {
                const stateRepos = App.State.get('repositories');
                if (Array.isArray(stateRepos) && stateRepos.length > 0) {
                    repositories = stateRepos;
                }
            }

            this.updateSearchResults(repositories, '');
        },

        /**
         * Update UI with search results
         */
        updateSearchResults: function(results, query) {
            // Update application state
            if (App.State) {
                App.State.setState({
                    repositories: results,
                    searchQuery: query,
                    totalCount: results.length
                });
            }

            // Update search info display
            this.updateSearchInfo(results.length, query);

            // Emit search results event for other modules
            App.Events.emit('search:results', {
                results: results,
                query: query,
                count: results.length,
                timestamp: Date.now()
            });

            // Trigger UI re-render
            if (App.Render) {
                App.Render.renderRepositories();
            }
        },

        /**
         * Update search info display
         */
        updateSearchInfo: function(count, query) {
            const searchInfoEl = document.querySelector('#search-info');
            const searchCountEl = document.querySelector('#search-count');
            const searchQueryEl = document.querySelector('#search-query');

            if (!searchInfoEl || !searchCountEl) {
                return;
            }

            if (query && query.trim()) {
                // Show search results info
                searchInfoEl.style.display = 'block';
                
                // Update count
                const countText = count === 1 ? '1 repository found' : `${count} repositories found`;
                searchCountEl.textContent = countText;
                
                // Update query display
                if (searchQueryEl) {
                    searchQueryEl.textContent = `for "${query}"`;
                }
                
                // Update accessibility
                searchInfoEl.setAttribute('aria-live', 'polite');
                searchInfoEl.setAttribute('aria-atomic', 'true');
                
            } else {
                // Hide search info when no query
                searchInfoEl.style.display = 'none';
            }
        },

        /**
         * Handle search errors
         */
        handleSearchError: function(query, error) {
            console.error('Search error for query:', query, error);
            
            // Show error message to user
            if (App.Utils && App.Utils.toast) {
                App.Utils.toast.error('Search failed. Please try again.');
            }
            
            // Emit error event
            App.Events.emit('search:error', {
                query: query,
                error: error.message,
                timestamp: Date.now()
            });

            // Fallback to showing all repositories
            this.showAllRepositories();
        },

        /**
         * Log search performance metrics
         */
        logSearchPerformance: function(query, resultCount, duration) {
            const logger = App.Core.getModule('Logger');
            if (logger) {
                logger.debug('Search performance', {
                    query: query,
                    resultCount: resultCount,
                    duration: `${duration.toFixed(2)}ms`,
                    avgTimePerResult: resultCount > 0 ? `${(duration / resultCount).toFixed(2)}ms` : 'N/A'
                });
            }

            // Track performance metrics
            if (App.Utils && App.Utils.performance) {
                App.Utils.performance.mark(`search-end-${query}`);
                App.Utils.performance.measure(
                    `search-duration-${query}`, 
                    `search-start-${query}`, 
                    `search-end-${query}`
                );
            }
        },

        /**
         * Get current search query
         */
        getCurrentQuery: function() {
            return lastSearchQuery;
        },

        /**
         * Get search results statistics
         */
        getSearchStats: function() {
            const filterEngine = App.Core.getModule('FilterEngine');
            const cacheStats = filterEngine ? filterEngine.getCacheStats() : null;
            
            return {
                currentQuery: lastSearchQuery,
                isSearching: isSearching,
                originalRepositoryCount: originalRepositories.length,
                cacheStats: cacheStats
            };
        },

        /**
         * Clear all search state
         */
        reset: function() {
            lastSearchQuery = '';
            originalRepositories = [];
            isSearching = false;
            
            // Clear FilterEngine cache
            const filterEngine = App.Core.getModule('FilterEngine');
            if (filterEngine) {
                filterEngine.clearCache();
            }
        }
    };
})();

/**
 * Search Animations Module
 * Provides smooth animations for search operations and state transitions
 */
App.SearchAnimations = (function() {
    'use strict';

    // Animation configuration
    const ANIMATION_CONFIG = {
        duration: {
            fast: 200,
            normal: 300,
            slow: 500
        },
        easing: {
            easeOut: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            easeIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
            easeInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)'
        },
        delays: {
            stagger: 50,        // Delay between staggered animations
            clearDelay: 100,    // Delay before showing cleared state
            loadingDelay: 150   // Delay before showing loading state
        }
    };

    // Animation state tracking
    let currentAnimations = new Set();
    let isAnimating = false;

    return {
        /**
         * Initialize the Search Animations module
         */
        init: function() {
            // Listen to search events for animation triggers
            App.Events.listen('search:query', this.handleSearchStart.bind(this));
            App.Events.listen('search:results', this.handleSearchResults.bind(this));
            App.Events.listen('search:cleared', this.handleSearchCleared.bind(this));
            App.Events.listen('search:focus', this.handleSearchFocus.bind(this));
            App.Events.listen('search:error', this.handleSearchError.bind(this));

            // Set up CSS animations
            this.injectAnimationCSS();

            console.log('SearchAnimations module initialized');
        },

        /**
         * Handle search start - show loading state
         */
        handleSearchStart: function(data) {
            if (!data || !data.detail || !data.detail.query) return;

            const query = data.detail.query.trim();
            if (!query) return;

            // Show loading state for the search
            this.showSearchLoading();
        },

        /**
         * Handle search results - animate in new results
         */
        handleSearchResults: function(data) {
            if (!data || !data.detail) return;

            const { results, query, count } = data.detail;

            // Hide loading state
            this.hideSearchLoading();

            // Animate search results
            if (query && query.trim()) {
                this.animateSearchResults(results, count > 0);
            } else {
                this.animateSearchClear();
            }

            // Update search info with animation
            this.animateSearchInfo(count, query);
        },

        /**
         * Handle search cleared - animate clear state
         */
        handleSearchCleared: function(data) {
            this.hideSearchLoading();
            this.animateSearchClear();
            this.animateSearchInfo(0, '');
        },

        /**
         * Handle search focus - animate focus state
         */
        handleSearchFocus: function(data) {
            this.animateSearchFocus(true);
        },

        /**
         * Handle search error - animate error state
         */
        handleSearchError: function(data) {
            this.hideSearchLoading();
            this.animateSearchError();
        },

        /**
         * Show search loading state with animation
         */
        showSearchLoading: function() {
            if (isAnimating) return;

            const searchContainer = document.querySelector('#search-container');
            const repositoriesGrid = document.querySelector('#repositories-grid');

            if (searchContainer) {
                searchContainer.classList.add('searching');
                
                // Add loading indicator to search input
                this.addLoadingIndicator();
            }

            if (repositoriesGrid) {
                // Add loading class with fade effect
                repositoriesGrid.classList.add('loading');
                this.fadeOut(repositoriesGrid, ANIMATION_CONFIG.duration.fast);
            }
        },

        /**
         * Hide search loading state
         */
        hideSearchLoading: function() {
            const searchContainer = document.querySelector('#search-container');
            const repositoriesGrid = document.querySelector('#repositories-grid');

            if (searchContainer) {
                searchContainer.classList.remove('searching');
                this.removeLoadingIndicator();
            }

            if (repositoriesGrid) {
                repositoriesGrid.classList.remove('loading');
            }
        },

        /**
         * Add loading indicator to search input
         */
        addLoadingIndicator: function() {
            const searchInput = document.querySelector('#search-input');
            if (!searchInput) return;

            // Remove existing loading indicator
            this.removeLoadingIndicator();

            // Create loading spinner
            const loadingSpinner = document.createElement('div');
            loadingSpinner.className = 'search-loading-spinner';
            loadingSpinner.innerHTML = '<div class="spinner"></div>';

            // Insert after search input
            searchInput.parentNode.insertBefore(loadingSpinner, searchInput.nextSibling);

            // Animate in
            setTimeout(() => {
                loadingSpinner.classList.add('visible');
            }, 10);
        },

        /**
         * Remove loading indicator
         */
        removeLoadingIndicator: function() {
            const existing = document.querySelector('.search-loading-spinner');
            if (existing) {
                this.fadeOut(existing, ANIMATION_CONFIG.duration.fast, () => {
                    existing.remove();
                });
            }
        },

        /**
         * Animate search results display
         */
        animateSearchResults: function(results, hasResults) {
            const repositoriesGrid = document.querySelector('#repositories-grid');
            if (!repositoriesGrid) return;

            isAnimating = true;

            // Fade out existing content first
            this.fadeOut(repositoriesGrid, ANIMATION_CONFIG.duration.fast, () => {
                // Content will be updated by the render system
                // Then fade in the new content
                setTimeout(() => {
                    this.fadeIn(repositoriesGrid, ANIMATION_CONFIG.duration.normal, () => {
                        // Stagger animate individual repository cards
                        this.staggerAnimateRepositoryCards();
                        isAnimating = false;
                    });
                }, 50);
            });
        },

        /**
         * Animate search clear state
         */
        animateSearchClear: function() {
            const repositoriesGrid = document.querySelector('#repositories-grid');
            const searchInput = document.querySelector('#search-input');

            isAnimating = true;

            // Animate clear search input
            if (searchInput) {
                this.animateSearchInputClear(searchInput);
            }

            // Animate repositories grid
            if (repositoriesGrid) {
                this.fadeOut(repositoriesGrid, ANIMATION_CONFIG.duration.fast, () => {
                    setTimeout(() => {
                        this.fadeIn(repositoriesGrid, ANIMATION_CONFIG.duration.normal, () => {
                            this.staggerAnimateRepositoryCards();
                            isAnimating = false;
                        });
                    }, ANIMATION_CONFIG.delays.clearDelay);
                });
            }
        },

        /**
         * Animate search input clear
         */
        animateSearchInputClear: function(input) {
            // Add clear animation class
            input.classList.add('clearing');

            // Animate the clear action
            const clearButton = document.querySelector('#search-clear');
            if (clearButton) {
                clearButton.classList.add('clicked');
                
                setTimeout(() => {
                    clearButton.classList.remove('clicked');
                }, ANIMATION_CONFIG.duration.fast);
            }

            // Remove clearing class after animation
            setTimeout(() => {
                input.classList.remove('clearing');
            }, ANIMATION_CONFIG.duration.normal);
        },

        /**
         * Animate search info panel
         */
        animateSearchInfo: function(count, query) {
            const searchInfo = document.querySelector('#search-info');
            if (!searchInfo) return;

            if (query && query.trim()) {
                // Show search info with animation
                if (searchInfo.style.display === 'none' || !searchInfo.style.display) {
                    searchInfo.style.display = 'block';
                    this.slideDown(searchInfo, ANIMATION_CONFIG.duration.normal);
                } else {
                    // Update existing info with fade transition
                    this.fadeOut(searchInfo, ANIMATION_CONFIG.duration.fast, () => {
                        // Content will be updated by SearchController
                        this.fadeIn(searchInfo, ANIMATION_CONFIG.duration.fast);
                    });
                }
            } else {
                // Hide search info with animation
                if (searchInfo.style.display !== 'none') {
                    this.slideUp(searchInfo, ANIMATION_CONFIG.duration.normal, () => {
                        searchInfo.style.display = 'none';
                    });
                }
            }
        },

        /**
         * Animate search focus state
         */
        animateSearchFocus: function(focused) {
            const searchContainer = document.querySelector('#search-container');
            const searchInput = document.querySelector('#search-input');

            if (searchContainer) {
                if (focused) {
                    searchContainer.classList.add('focused');
                } else {
                    searchContainer.classList.remove('focused');
                }
            }

            if (searchInput) {
                this.pulseElement(searchInput, ANIMATION_CONFIG.duration.fast);
            }
        },

        /**
         * Animate search error state
         */
        animateSearchError: function() {
            const searchInput = document.querySelector('#search-input');
            if (searchInput) {
                searchInput.classList.add('error');
                this.shakeElement(searchInput);

                setTimeout(() => {
                    searchInput.classList.remove('error');
                }, 2000);
            }
        },

        /**
         * Stagger animate repository cards
         */
        staggerAnimateRepositoryCards: function() {
            const cards = document.querySelectorAll('.repository-card');
            
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                
                setTimeout(() => {
                    this.fadeIn(card, ANIMATION_CONFIG.duration.normal);
                    card.style.transform = 'translateY(0)';
                }, index * ANIMATION_CONFIG.delays.stagger);
            });
        },

        // Utility animation methods

        /**
         * Fade out element
         */
        fadeOut: function(element, duration = ANIMATION_CONFIG.duration.normal, callback) {
            element.style.transition = `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`;
            element.style.opacity = '0';

            const timeoutId = setTimeout(() => {
                if (callback) callback();
                currentAnimations.delete(timeoutId);
            }, duration);

            currentAnimations.add(timeoutId);
        },

        /**
         * Fade in element
         */
        fadeIn: function(element, duration = ANIMATION_CONFIG.duration.normal, callback) {
            element.style.transition = `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`;
            element.style.opacity = '1';

            const timeoutId = setTimeout(() => {
                if (callback) callback();
                element.style.transition = '';
                currentAnimations.delete(timeoutId);
            }, duration);

            currentAnimations.add(timeoutId);
        },

        /**
         * Slide down element
         */
        slideDown: function(element, duration = ANIMATION_CONFIG.duration.normal, callback) {
            const height = element.scrollHeight;
            element.style.height = '0';
            element.style.overflow = 'hidden';
            element.style.transition = `height ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`;

            requestAnimationFrame(() => {
                element.style.height = height + 'px';
            });

            const timeoutId = setTimeout(() => {
                element.style.height = '';
                element.style.overflow = '';
                element.style.transition = '';
                if (callback) callback();
                currentAnimations.delete(timeoutId);
            }, duration);

            currentAnimations.add(timeoutId);
        },

        /**
         * Slide up element
         */
        slideUp: function(element, duration = ANIMATION_CONFIG.duration.normal, callback) {
            const height = element.scrollHeight;
            element.style.height = height + 'px';
            element.style.overflow = 'hidden';
            element.style.transition = `height ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`;

            requestAnimationFrame(() => {
                element.style.height = '0';
            });

            const timeoutId = setTimeout(() => {
                element.style.height = '';
                element.style.overflow = '';
                element.style.transition = '';
                if (callback) callback();
                currentAnimations.delete(timeoutId);
            }, duration);

            currentAnimations.add(timeoutId);
        },

        /**
         * Pulse element animation
         */
        pulseElement: function(element, duration = ANIMATION_CONFIG.duration.fast) {
            element.classList.add('pulse-animation');
            
            const timeoutId = setTimeout(() => {
                element.classList.remove('pulse-animation');
                currentAnimations.delete(timeoutId);
            }, duration);

            currentAnimations.add(timeoutId);
        },

        /**
         * Shake element animation for errors
         */
        shakeElement: function(element, duration = 600) {
            element.classList.add('shake-animation');
            
            const timeoutId = setTimeout(() => {
                element.classList.remove('shake-animation');
                currentAnimations.delete(timeoutId);
            }, duration);

            currentAnimations.add(timeoutId);
        },

        /**
         * Inject animation CSS styles
         */
        injectAnimationCSS: function() {
            if (document.querySelector('#search-animations-css')) {
                return; // Already injected
            }

            const style = document.createElement('style');
            style.id = 'search-animations-css';
            style.textContent = `
                /* Search Container States */
                #search-container.searching .search-input {
                    background-color: #f8f9fa;
                }

                #search-container.focused {
                    transform: scale(1.02);
                    transition: transform 200ms ease-out;
                }

                /* Loading Spinner */
                .search-loading-spinner {
                    position: absolute;
                    right: 45px;
                    top: 50%;
                    transform: translateY(-50%);
                    opacity: 0;
                    transition: opacity 200ms ease-out;
                }

                .search-loading-spinner.visible {
                    opacity: 1;
                }

                .search-loading-spinner .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #e9ecef;
                    border-top-color: #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* Search Input States */
                .search-input.clearing {
                    animation: searchClear 300ms ease-out;
                }

                .search-input.error {
                    border-color: #dc3545 !important;
                    box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.25) !important;
                }

                @keyframes searchClear {
                    0% { transform: scale(1); }
                    50% { transform: scale(0.98); }
                    100% { transform: scale(1); }
                }

                /* Clear Button Animation */
                .search-clear.clicked {
                    animation: clearButtonClick 200ms ease-out;
                }

                @keyframes clearButtonClick {
                    0% { transform: scale(1) rotate(0deg); }
                    50% { transform: scale(1.2) rotate(90deg); }
                    100% { transform: scale(1) rotate(180deg); }
                }

                /* Repository Cards */
                .repositories-grid.loading {
                    pointer-events: none;
                }

                .repository-card {
                    transition: transform 300ms ease-out, opacity 300ms ease-out;
                }

                /* Pulse Animation */
                .pulse-animation {
                    animation: pulse 200ms ease-out;
                }

                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }

                /* Shake Animation */
                .shake-animation {
                    animation: shake 600ms ease-in-out;
                }

                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
                    20%, 40%, 60%, 80% { transform: translateX(2px); }
                }

                /* Search Info Panel */
                #search-info {
                    overflow: hidden;
                    transition: all 300ms ease-out;
                }

                /* Hover Effects */
                .search-clear:hover {
                    transform: scale(1.1);
                    transition: transform 150ms ease-out;
                }

                .search-input:focus {
                    transform: translateY(-1px);
                    transition: transform 200ms ease-out;
                }

                /* Loading State Overlay */
                .search-container.searching::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
                    animation: searchShimmer 1.5s infinite;
                    pointer-events: none;
                }

                @keyframes searchShimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }

                /* Responsive Animations */
                @media (prefers-reduced-motion: reduce) {
                    * {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                    }
                }
            `;

            document.head.appendChild(style);
        },

        /**
         * Cancel all current animations
         */
        cancelAllAnimations: function() {
            currentAnimations.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            currentAnimations.clear();
            isAnimating = false;
        },

        /**
         * Check if animations are currently running
         */
        isAnimating: function() {
            return isAnimating || currentAnimations.size > 0;
        },

        /**
         * Cleanup animations on module destruction
         */
        cleanup: function() {
            this.cancelAllAnimations();
            
            // Remove injected CSS
            const style = document.querySelector('#search-animations-css');
            if (style) {
                style.remove();
            }
        }
    };
})();

/**
 * Application Bootstrap and Initialization
 */
App.Bootstrap = (function() {
    'use strict';

    return {
        init: function() {
            console.log('Initializing RepoVista application...');

            try {
                // Initialize Logger first for comprehensive logging
                const logger = new App.Logger({
                    level: App.LogLevel.DEBUG,
                    environment: 'development',
                    enableConsole: true,
                    enableStorage: true,
                    enablePerformance: true,
                    enableGrouping: true,
                    enableStackTrace: true,
                    maxStorageEntries: 1000
                });
                App.Core.registerModule('Logger', logger);

                logger.group('RepoVista Application Initialization');
                logger.info('Starting RepoVista application bootstrap', {
                    version: App.Core.getConfig('version'),
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                });

                // Initialize global error handler first
                const globalErrorHandler = new App.GlobalErrorHandler({
                    maxErrors: 100,
                    maxRetries: 3,
                    enableDevTools: true,
                    onError: (errorInfo) => {
                        // Send error to monitoring service if configured
                        if (App.Core.getConfig('errorReporting')) {
                            logger.error('Error reported to monitoring service', errorInfo);
                        }
                    }
                });
                globalErrorHandler.init();
                App.Core.registerModule('ErrorHandler', globalErrorHandler);
                logger.info('Global error handler initialized');

                // Initialize Performance Optimization Systems
                logger.time('Performance Systems Initialization');
                App.PerformanceOptimizer.init({
                    renderScheduling: true,
                    memoryManagement: true,
                    eventOptimization: true,
                    lazyLoading: true,
                    resourcePreloading: true,
                    virtualScrolling: false // Enable when needed for large lists
                });
                App.Core.registerModule('PerformanceOptimizer', App.PerformanceOptimizer);
                logger.timeEnd('Performance Systems Initialization');
                logger.info('Performance optimization systems initialized');

                // Initialize enhanced Store
                const store = new App.Store({
                    repositories: [],
                    currentPage: 1,
                    totalPages: 1,
                    totalCount: 0,
                    pageSize: App.Core.getConfig('defaultPageSize'),
                    searchQuery: '',
                    sortBy: 'name-asc',
                    loading: false,
                    error: null,
                    selectedRepository: null,
                    expandedRepositories: new Set(),
                    tags: new Map()
                }, {
                    enablePersistence: true,
                    persistKey: 'repovista_state',
                    maxHistorySize: 50,
                    enableDevTools: true
                });
                App.Core.registerModule('Store', store);
                logger.info('Enhanced Store initialized with persistence and DevTools support');

                // Initialize Render Engine
                const renderEngine = new App.RenderEngine();
                App.Core.registerModule('RenderEngine', renderEngine);
                logger.info('Render Engine initialized with virtual DOM support');

                // Initialize Component Manager
                const componentManager = new App.ComponentManager();
                componentManager.init();
                App.Core.registerModule('ComponentManager', componentManager);
                logger.info('Component Manager initialized with registry and factory');

                // Register advanced components
                App.AdvancedComponents.registerAdvancedComponents(componentManager);
                logger.info('Advanced components registered', {
                    components: ['RepositoryCard', 'Search', 'Pagination']
                });

                // Initialize View Controller
                const viewController = new App.ViewController();
                App.Core.registerModule('ViewController', viewController);
                logger.info('View Controller initialized');

                // Initialize EventEmitter and Delegator
                const eventEmitter = new App.EventEmitter({ maxListeners: 20 });
                const eventDelegator = new App.EventDelegator();
                const coreEventHandlers = new App.CoreEventHandlers(eventEmitter, eventDelegator);
                
                App.Core.registerModule('EventEmitter', eventEmitter);
                App.Core.registerModule('EventDelegator', eventDelegator);
                App.Core.registerModule('CoreEventHandlers', coreEventHandlers);
                logger.info('Event system initialized', {
                    maxListeners: 20,
                    features: ['EventEmitter', 'EventDelegator', 'CoreEventHandlers']
                });

                // Register original modules with dependencies
                App.Core.registerModule('State', App.State);
                App.Core.registerModule('Events', App.Events, ['State']);
                App.Core.registerModule('Render', App.Render, ['State']);
                App.Core.registerModule('SearchKeyboard', App.SearchKeyboard, ['Events']);
                App.Core.registerModule('SearchInput', App.SearchInput, ['Events', 'State']);
                App.Core.registerModule('SearchStateSync', App.SearchStateSync, ['State', 'Events', 'SearchInput']);
                App.Core.registerModule('SearchHistory', App.SearchHistory, ['Events']);
                App.Core.registerModule('FilterEngine', App.FilterEngine, ['Events']);
                App.Core.registerModule('SearchController', App.SearchController, ['Events', 'State', 'FilterEngine']);
                App.Core.registerModule('SearchAnimations', App.SearchAnimations, ['Events']);

                // Initialize modules in dependency order
                logger.time('Module Initialization');
                App.Core.initializeModules();
                logger.timeEnd('Module Initialization');
                logger.info('All modules initialized in dependency order');

                // Initialize core event handlers
                coreEventHandlers.init();
                logger.info('Core event handlers initialized');

                // Set up state subscriptions
                this._setupStateSubscriptions(store, eventEmitter, logger);

                // Initialize view controller with dependencies
                viewController.init({
                    renderEngine,
                    store,
                    emitter: eventEmitter,
                    errorHandler: globalErrorHandler,
                    componentManager,
                    logger
                });
                logger.info('View Controller initialized with all dependencies');

                // Initialize integration layer
                const integration = new App.Integration();
                integration.init();
                App.Core.registerModule('Integration', integration);
                logger.info('Integration layer initialized');

                // Set up component lifecycle hooks
                this._setupComponentLifecycleHooks(componentManager, eventEmitter, logger);

                // Emit application ready event
                eventEmitter.emit('app:ready', {
                    version: App.Core.getConfig('version'),
                    timestamp: new Date().toISOString()
                });

                logger.groupEnd();
                logger.info('🎉 RepoVista application initialized successfully', {
                    modules: Array.from(App.Core.moduleRegistry?.keys() || []),
                    performance: logger.getMetrics(),
                    timestamp: new Date().toISOString()
                });

                console.log('RepoVista application initialized successfully');
            } catch (error) {
                console.error('Application initialization failed:', error);
                const logger = App.Core.getModule('Logger');
                if (logger) {
                    logger.fatal('Application initialization failed', {
                        error: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    });
                }
                if (App.Core.getModule('EventEmitter')) {
                    App.Core.getModule('EventEmitter').emit('app:error', { error: error.message });
                }
            }
        },

        /**
         * Set up state subscriptions for reactive updates
         */
        _setupStateSubscriptions: function(store, emitter, logger) {
            // Subscribe to loading state changes
            store.subscribe((prevState, newState) => {
                if (prevState?.loading !== newState.loading) {
                    emitter.emit('loading:change', { loading: newState.loading });
                    logger.debug('Loading state changed', { loading: newState.loading });
                }
            }, 'loading');

            // Subscribe to repository selection
            store.subscribe((prevState, newState) => {
                if (prevState?.selectedRepository !== newState.selectedRepository) {
                    emitter.emit('repository:changed', { 
                        repository: newState.selectedRepository 
                    });
                    logger.debug('Repository selection changed', { 
                        repository: newState.selectedRepository?.name || null 
                    });
                }
            }, 'selectedRepository');

            // Subscribe to search query changes
            store.subscribe((prevState, newState) => {
                if (prevState?.searchQuery !== newState.searchQuery) {
                    emitter.emit('search:changed', { 
                        query: newState.searchQuery 
                    });
                    logger.debug('Search query changed', { 
                        query: newState.searchQuery,
                        length: newState.searchQuery?.length || 0
                    });
                }
            }, 'searchQuery');

            // Subscribe to error state
            store.subscribe((prevState, newState) => {
                if (newState.error && prevState?.error !== newState.error) {
                    emitter.emit('error:occurred', { error: newState.error });
                    logger.error('Application error occurred', { error: newState.error });
                }
            }, 'error');

            // Subscribe to data changes for re-rendering
            store.subscribe((prevState, newState) => {
                // Trigger renders through the view controller
                const dataChanged = 
                    prevState?.repositories !== newState.repositories ||
                    prevState?.tags !== newState.tags;
                    
                if (dataChanged) {
                    emitter.emit('data:updated', { 
                        repositories: newState.repositories,
                        tags: newState.tags 
                    });
                    logger.debug('Data updated', { 
                        repositoriesCount: newState.repositories?.length || 0,
                        tagsCount: newState.tags?.size || 0
                    });
                }
            });

            logger.info('State subscriptions initialized', {
                subscriptions: ['loading', 'selectedRepository', 'searchQuery', 'error', 'data']
            });
        },

        /**
         * Set up component lifecycle hooks
         */
        _setupComponentLifecycleHooks: function(componentManager, emitter, logger) {
            // Global component event handlers
            emitter.on('component:mounted', ({ component }) => {
                logger.debug('Component mounted', { 
                    component: component.constructor.name,
                    id: component.id || 'unknown'
                });
            });

            emitter.on('component:updated', ({ component, prevProps }) => {
                logger.debug('Component updated', { 
                    component: component.constructor.name,
                    id: component.id || 'unknown',
                    hasChanges: !!prevProps
                });
            });

            emitter.on('component:unmounted', ({ component }) => {
                logger.debug('Component unmounted', { 
                    component: component.constructor.name,
                    id: component.id || 'unknown'
                });
            });

            emitter.on('component:error', ({ error, component }) => {
                logger.error('Component error', {
                    component: component.constructor.name,
                    id: component.id || 'unknown',
                    error: error.message,
                    stack: error.stack
                });
            });

            // Register component dependencies
            const registry = componentManager.getRegistry();
            
            // Register API dependency
            registry.registerDependency('api', App.Core.getModule('API'));
            
            // Register store dependency
            registry.registerDependency('store', App.Core.getModule('Store'));
            
            // Register emitter dependency
            registry.registerDependency('emitter', emitter);

            logger.info('Component lifecycle hooks initialized', {
                hooks: ['mounted', 'updated', 'unmounted', 'error'],
                dependencies: ['api', 'store', 'emitter']
            });
        },

        /**
         * Cleanup all systems and resources
         */
        cleanup: function() {
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.group('Application Cleanup');
                logger.info('Starting application cleanup');
            }

            try {
                // Cleanup performance systems
                if (App.PerformanceOptimizer) {
                    App.PerformanceOptimizer.cleanup();
                    if (logger) logger.info('✅ Performance systems cleaned up');
                }

                // Cleanup all registered modules
                const moduleRegistry = App.Core.moduleRegistry;
                if (moduleRegistry) {
                    for (const [name, module] of moduleRegistry) {
                        if (module && typeof module.cleanup === 'function') {
                            module.cleanup();
                            if (logger) logger.debug(`Module cleaned up: ${name}`);
                        }
                    }
                }

                // Clear Core registry
                if (App.Core && typeof App.Core.cleanup === 'function') {
                    App.Core.cleanup();
                }

                if (logger) {
                    logger.info('Application cleanup completed');
                    logger.groupEnd();
                }

            } catch (error) {
                console.error('Error during cleanup:', error);
                if (logger) {
                    logger.error('Cleanup error', {
                        error: error.message,
                        stack: error.stack
                    });
                }
            }
        }
    };
})();

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.Bootstrap.init);
} else {
    App.Bootstrap.init();
}

// Setup cleanup on page unload
window.addEventListener('beforeunload', () => {
    App.Bootstrap.cleanup();
});

// Setup performance monitoring for development
if (window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
    // Add performance monitoring for development
    setTimeout(() => {
        const logger = App.Core?.getModule('Logger');
        if (logger && App.PerformanceOptimizer) {
            const report = App.PerformanceOptimizer.getPerformanceReport();
            logger.info('Performance Report (5s after init)', report);
        }
    }, 5000);
}

// Note: Global error handling is now managed by GlobalErrorHandler in error-handler.js
// The GlobalErrorHandler is initialized in App.Bootstrap.init()