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