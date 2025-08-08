/**
 * RepoVista Lazy Loading System
 * 
 * Intelligent lazy loading and code splitting preparation
 * for optimal resource utilization and performance.
 */

// Lazy loading namespace
window.App = window.App || {};

/**
 * Intersection Observer based Lazy Loader
 */
App.LazyLoader = (function() {
    'use strict';

    let observer = null;
    let observedElements = new WeakMap();
    let loadingQueue = new Map();
    let loadStrategies = new Map();
    let isInitialized = false;

    // Default configuration
    const defaultConfig = {
        rootMargin: '50px 0px',
        threshold: 0.1,
        enablePreload: true,
        enableProgress: true,
        retryAttempts: 3,
        retryDelay: 1000
    };

    /**
     * Initialize Intersection Observer
     */
    function initializeObserver(config = {}) {
        if (!window.IntersectionObserver) {
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.warn('IntersectionObserver not supported, falling back to scroll-based detection');
            }
            return false;
        }

        const observerConfig = { ...defaultConfig, ...config };
        
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    const loadConfig = observedElements.get(element);
                    
                    if (loadConfig && !loadConfig.loaded) {
                        loadElement(element, loadConfig);
                        observer.unobserve(element);
                    }
                }
            });
        }, {
            root: observerConfig.root || null,
            rootMargin: observerConfig.rootMargin,
            threshold: observerConfig.threshold
        });

        isInitialized = true;
        return true;
    }

    /**
     * Load an element with its configured strategy
     */
    async function loadElement(element, config) {
        const startTime = performance.now();
        const logger = App.Core?.getModule('Logger');
        
        try {
            config.loaded = true;
            config.loading = true;
            
            // Add loading state
            element.classList.add('lazy-loading');
            
            if (logger) {
                logger.debug('Lazy loading started', {
                    element: element.tagName,
                    strategy: config.strategy,
                    src: config.src || config.href
                });
            }

            // Execute loading strategy
            const strategy = loadStrategies.get(config.strategy);
            if (strategy) {
                await strategy(element, config);
            } else {
                await defaultLoadStrategy(element, config);
            }

            // Update state
            config.loading = false;
            config.loadTime = performance.now() - startTime;
            element.classList.remove('lazy-loading');
            element.classList.add('lazy-loaded');
            
            // Fire load event
            element.dispatchEvent(new CustomEvent('lazy:loaded', {
                detail: { loadTime: config.loadTime, config }
            }));

            if (logger) {
                logger.debug('Lazy loading completed', {
                    element: element.tagName,
                    loadTime: `${config.loadTime.toFixed(2)}ms`,
                    strategy: config.strategy
                });
            }

        } catch (error) {
            config.loading = false;
            config.error = error.message;
            element.classList.remove('lazy-loading');
            element.classList.add('lazy-error');
            
            if (logger) {
                logger.error('Lazy loading failed', {
                    element: element.tagName,
                    error: error.message,
                    strategy: config.strategy,
                    retryAttempt: config.retryAttempt || 0
                });
            }

            // Retry logic
            if ((config.retryAttempt || 0) < (config.retryAttempts || defaultConfig.retryAttempts)) {
                config.retryAttempt = (config.retryAttempt || 0) + 1;
                
                setTimeout(() => {
                    config.loaded = false;
                    config.error = null;
                    element.classList.remove('lazy-error');
                    loadElement(element, config);
                }, (config.retryDelay || defaultConfig.retryDelay) * config.retryAttempt);
            }
        }
    }

    /**
     * Default loading strategy for images and content
     */
    async function defaultLoadStrategy(element, config) {
        if (element.tagName === 'IMG') {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    element.src = config.src;
                    resolve();
                };
                img.onerror = reject;
                img.src = config.src;
            });
        } else if (config.content) {
            element.innerHTML = config.content;
        } else if (config.src) {
            const response = await fetch(config.src);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            element.innerHTML = await response.text();
        }
    }

    return {
        /**
         * Initialize lazy loader
         */
        init: function(config = {}) {
            if (isInitialized) return true;
            return initializeObserver(config);
        },

        /**
         * Register a custom loading strategy
         */
        registerStrategy: function(name, strategyFunction) {
            if (typeof strategyFunction !== 'function') {
                throw new Error('Strategy must be a function');
            }
            loadStrategies.set(name, strategyFunction);
        },

        /**
         * Add element for lazy loading
         */
        observe: function(element, config = {}) {
            if (!observer) {
                throw new Error('Lazy loader not initialized. Call init() first.');
            }

            const loadConfig = {
                strategy: config.strategy || 'default',
                src: config.src || element.dataset.src,
                content: config.content,
                loaded: false,
                loading: false,
                retryAttempts: config.retryAttempts || defaultConfig.retryAttempts,
                retryDelay: config.retryDelay || defaultConfig.retryDelay
            };

            observedElements.set(element, loadConfig);
            observer.observe(element);

            // Add lazy class for CSS styling
            element.classList.add('lazy-target');
        },

        /**
         * Unobserve an element
         */
        unobserve: function(element) {
            if (observer) {
                observer.unobserve(element);
            }
            observedElements.delete(element);
            element.classList.remove('lazy-target', 'lazy-loading', 'lazy-loaded', 'lazy-error');
        },

        /**
         * Load element immediately (bypass lazy loading)
         */
        loadNow: function(element) {
            const config = observedElements.get(element);
            if (config && !config.loaded) {
                this.unobserve(element);
                return loadElement(element, config);
            }
        },

        /**
         * Get loading statistics
         */
        getStats: function() {
            const elements = Array.from(observedElements.entries());
            const loaded = elements.filter(([_, config]) => config.loaded).length;
            const loading = elements.filter(([_, config]) => config.loading).length;
            const errors = elements.filter(([_, config]) => config.error).length;
            
            return {
                total: elements.length,
                loaded,
                loading,
                errors,
                pending: elements.length - loaded - loading,
                avgLoadTime: elements
                    .filter(([_, config]) => config.loadTime)
                    .reduce((sum, [_, config]) => sum + config.loadTime, 0) / 
                    Math.max(1, loaded)
            };
        },

        /**
         * Cleanup and disconnect observer
         */
        cleanup: function() {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            observedElements = new WeakMap();
            loadingQueue.clear();
            isInitialized = false;
        }
    };
})();

/**
 * Code Splitting Preparation System
 */
App.CodeSplitter = (function() {
    'use strict';

    let modules = new Map();
    let loadedChunks = new Set();
    let pendingChunks = new Map();
    let chunkDependencies = new Map();

    /**
     * Dynamic import polyfill for older browsers
     */
    function dynamicImportPolyfill(modulePath) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = modulePath;
            
            script.onload = () => {
                // Module should export to window.App
                resolve(window.App);
                document.head.removeChild(script);
            };
            
            script.onerror = () => {
                reject(new Error(`Failed to load module: ${modulePath}`));
                document.head.removeChild(script);
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Load module with dependencies
     */
    async function loadModuleWithDependencies(moduleName) {
        const moduleInfo = modules.get(moduleName);
        if (!moduleInfo) {
            throw new Error(`Module not registered: ${moduleName}`);
        }

        // Load dependencies first
        if (moduleInfo.dependencies && moduleInfo.dependencies.length > 0) {
            const dependencyPromises = moduleInfo.dependencies.map(dep => 
                loadedChunks.has(dep) ? Promise.resolve() : loadModuleWithDependencies(dep)
            );
            await Promise.all(dependencyPromises);
        }

        // Load the module if not already loaded
        if (!loadedChunks.has(moduleName)) {
            if (pendingChunks.has(moduleName)) {
                return pendingChunks.get(moduleName);
            }

            const loadPromise = loadChunk(moduleInfo);
            pendingChunks.set(moduleName, loadPromise);
            
            try {
                await loadPromise;
                loadedChunks.add(moduleName);
                pendingChunks.delete(moduleName);
            } catch (error) {
                pendingChunks.delete(moduleName);
                throw error;
            }
        }
    }

    /**
     * Load a code chunk
     */
    async function loadChunk(moduleInfo) {
        const logger = App.Core?.getModule('Logger');
        const startTime = performance.now();
        
        try {
            if (logger) {
                logger.debug('Loading code chunk', {
                    module: moduleInfo.name,
                    path: moduleInfo.path,
                    dependencies: moduleInfo.dependencies
                });
            }

            let moduleExports;
            
            if (moduleInfo.path.endsWith('.js')) {
                // Use dynamic import for ES modules
                if (window.import) {
                    moduleExports = await import(moduleInfo.path);
                } else {
                    moduleExports = await dynamicImportPolyfill(moduleInfo.path);
                }
            } else {
                // Load as regular script
                moduleExports = await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = moduleInfo.path;
                    script.onload = () => resolve(window.App);
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            const loadTime = performance.now() - startTime;
            
            if (logger) {
                logger.info('Code chunk loaded successfully', {
                    module: moduleInfo.name,
                    loadTime: `${loadTime.toFixed(2)}ms`,
                    size: moduleInfo.estimatedSize || 'unknown'
                });
            }

            // Initialize module if it has an init function
            if (moduleExports && moduleExports.init && typeof moduleExports.init === 'function') {
                await moduleExports.init();
            }

            return moduleExports;

        } catch (error) {
            if (logger) {
                logger.error('Code chunk loading failed', {
                    module: moduleInfo.name,
                    path: moduleInfo.path,
                    error: error.message
                });
            }
            throw error;
        }
    }

    return {
        /**
         * Register a module for code splitting
         */
        registerModule: function(name, path, dependencies = [], estimatedSize = null) {
            modules.set(name, {
                name,
                path,
                dependencies,
                estimatedSize,
                registeredAt: Date.now()
            });
            
            // Register dependencies
            if (dependencies.length > 0) {
                chunkDependencies.set(name, dependencies);
            }
        },

        /**
         * Load a module dynamically
         */
        loadModule: async function(moduleName) {
            try {
                await loadModuleWithDependencies(moduleName);
                return true;
            } catch (error) {
                const logger = App.Core?.getModule('Logger');
                if (logger) {
                    logger.error('Module loading failed', {
                        module: moduleName,
                        error: error.message
                    });
                }
                return false;
            }
        },

        /**
         * Preload modules based on user behavior
         */
        preloadModules: function(moduleNames, priority = 'low') {
            const preloadPromises = moduleNames.map(async (moduleName) => {
                if (!loadedChunks.has(moduleName)) {
                    try {
                        await this.loadModule(moduleName);
                    } catch (error) {
                        // Silent preload failures
                        const logger = App.Core?.getModule('Logger');
                        if (logger) {
                            logger.debug('Module preload failed', {
                                module: moduleName,
                                priority,
                                error: error.message
                            });
                        }
                    }
                }
            });

            return Promise.allSettled(preloadPromises);
        },

        /**
         * Check if module is loaded
         */
        isLoaded: function(moduleName) {
            return loadedChunks.has(moduleName);
        },

        /**
         * Get loading statistics
         */
        getStats: function() {
            return {
                registeredModules: modules.size,
                loadedChunks: loadedChunks.size,
                pendingChunks: pendingChunks.size,
                dependencies: chunkDependencies.size,
                loadedModules: Array.from(loadedChunks),
                pendingModules: Array.from(pendingChunks.keys())
            };
        },

        /**
         * Cleanup code splitter
         */
        cleanup: function() {
            modules.clear();
            loadedChunks.clear();
            pendingChunks.clear();
            chunkDependencies.clear();
        }
    };
})();

/**
 * Virtual Scrolling System
 * For handling large lists efficiently
 */
App.VirtualScroller = (function() {
    'use strict';

    return {
        /**
         * Create virtual scrolling for large data sets
         */
        create: function(container, options = {}) {
            const config = {
                itemHeight: options.itemHeight || 50,
                overscan: options.overscan || 5,
                threshold: options.threshold || 100,
                renderItem: options.renderItem || ((item, index) => `<div>Item ${index}</div>`),
                ...options
            };

            let data = [];
            let scrollTop = 0;
            let containerHeight = 0;
            let viewportHeight = 0;
            let startIndex = 0;
            let endIndex = 0;
            let virtualHeight = 0;

            // Create virtual scroll container
            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'virtual-scroll-container';
            scrollContainer.style.cssText = `
                height: 100%;
                overflow-y: auto;
                position: relative;
            `;

            const viewport = document.createElement('div');
            viewport.className = 'virtual-scroll-viewport';
            viewport.style.cssText = `
                position: relative;
                will-change: transform;
            `;

            const spacer = document.createElement('div');
            spacer.className = 'virtual-scroll-spacer';

            scrollContainer.appendChild(spacer);
            scrollContainer.appendChild(viewport);
            container.appendChild(scrollContainer);

            /**
             * Calculate visible range
             */
            function calculateRange() {
                viewportHeight = scrollContainer.clientHeight;
                const itemsInViewport = Math.ceil(viewportHeight / config.itemHeight);
                
                startIndex = Math.max(0, Math.floor(scrollTop / config.itemHeight) - config.overscan);
                endIndex = Math.min(data.length - 1, startIndex + itemsInViewport + (config.overscan * 2));
                
                virtualHeight = data.length * config.itemHeight;
                spacer.style.height = `${virtualHeight}px`;
            }

            /**
             * Render visible items
             */
            function renderItems() {
                const fragment = document.createDocumentFragment();
                
                for (let i = startIndex; i <= endIndex; i++) {
                    if (data[i]) {
                        const itemElement = document.createElement('div');
                        itemElement.className = 'virtual-scroll-item';
                        itemElement.style.cssText = `
                            position: absolute;
                            top: ${i * config.itemHeight}px;
                            width: 100%;
                            height: ${config.itemHeight}px;
                        `;
                        itemElement.innerHTML = config.renderItem(data[i], i);
                        fragment.appendChild(itemElement);
                    }
                }

                // Clear previous items
                viewport.innerHTML = '';
                viewport.appendChild(fragment);
            }

            /**
             * Handle scroll events
             */
            function handleScroll() {
                const newScrollTop = scrollContainer.scrollTop;
                if (Math.abs(newScrollTop - scrollTop) > config.itemHeight / 2) {
                    scrollTop = newScrollTop;
                    
                    const prevStartIndex = startIndex;
                    calculateRange();
                    
                    if (prevStartIndex !== startIndex) {
                        // Schedule render for next frame
                        App.RenderScheduler.schedule(() => {
                            renderItems();
                        }, null, 2); // High priority for scrolling
                    }
                }
            }

            // Set up optimized scroll listener
            let scrollTimeout;
            App.EventOptimizer.addEventListener(scrollContainer, 'scroll', () => {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(handleScroll, 16); // ~60fps
            }, { passive: true });

            return {
                /**
                 * Set data for virtual scrolling
                 */
                setData: function(newData) {
                    data = newData || [];
                    scrollTop = 0;
                    scrollContainer.scrollTop = 0;
                    calculateRange();
                    renderItems();
                },

                /**
                 * Scroll to specific item
                 */
                scrollToItem: function(index) {
                    if (index >= 0 && index < data.length) {
                        scrollContainer.scrollTop = index * config.itemHeight;
                    }
                },

                /**
                 * Update item height and recalculate
                 */
                updateItemHeight: function(newHeight) {
                    config.itemHeight = newHeight;
                    calculateRange();
                    renderItems();
                },

                /**
                 * Get current virtual scroll metrics
                 */
                getMetrics: function() {
                    return {
                        dataLength: data.length,
                        startIndex,
                        endIndex,
                        renderedItems: endIndex - startIndex + 1,
                        viewportHeight,
                        virtualHeight,
                        scrollTop,
                        itemHeight: config.itemHeight
                    };
                },

                /**
                 * Cleanup virtual scroller
                 */
                cleanup: function() {
                    data = [];
                    container.removeChild(scrollContainer);
                }
            };
        }
    };
})();

/**
 * Progressive Image Loading
 * Advanced image loading with blur-up technique
 */
App.ProgressiveImageLoader = (function() {
    'use strict';

    // Register as lazy loading strategy
    function progressiveImageStrategy(element, config) {
        return new Promise((resolve, reject) => {
            // Create low-quality placeholder if provided
            if (config.placeholder) {
                const placeholder = new Image();
                placeholder.onload = () => {
                    element.src = config.placeholder;
                    element.classList.add('blur-placeholder');
                };
                placeholder.src = config.placeholder;
            }

            // Load high-quality image
            const highQualityImg = new Image();
            
            highQualityImg.onload = () => {
                // Smooth transition from placeholder to high-quality
                element.style.transition = 'filter 0.3s ease';
                element.src = config.src;
                element.classList.remove('blur-placeholder');
                resolve();
            };
            
            highQualityImg.onerror = reject;
            highQualityImg.src = config.src;
        });
    }

    return {
        /**
         * Initialize progressive image loading
         */
        init: function() {
            // Register strategy with lazy loader
            if (App.LazyLoader) {
                App.LazyLoader.registerStrategy('progressive-image', progressiveImageStrategy);
            }

            // Add CSS for blur effect
            this.addProgressiveImageStyles();
        },

        /**
         * Add CSS styles for progressive loading
         */
        addProgressiveImageStyles: function() {
            if (document.getElementById('progressive-image-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'progressive-image-styles';
            style.textContent = `
                .lazy-target img,
                .lazy-target.blur-placeholder {
                    transition: filter 0.3s ease;
                }
                
                .blur-placeholder {
                    filter: blur(5px);
                }
                
                .lazy-loading::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                    background-size: 200% 100%;
                    animation: loading-shimmer 1.5s infinite;
                }
                
                @keyframes loading-shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * Setup progressive loading for images
         */
        setupImages: function(container = document) {
            const images = container.querySelectorAll('img[data-src]');
            
            images.forEach(img => {
                if (App.LazyLoader) {
                    App.LazyLoader.observe(img, {
                        strategy: 'progressive-image',
                        src: img.dataset.src,
                        placeholder: img.dataset.placeholder
                    });
                }
            });
        }
    };
})();

/**
 * Performance Optimization Coordinator
 * Central coordinator for all performance optimizations
 */
App.PerformanceOptimizer = (function() {
    'use strict';

    let optimizationLevel = 'auto';
    let isActive = false;
    let optimizations = {
        renderScheduling: true,
        memoryManagement: true,
        eventOptimization: true,
        lazyLoading: true,
        resourcePreloading: true,
        virtualScrolling: false // Enable for large lists
    };

    return {
        /**
         * Initialize all performance optimizations
         */
        init: function(config = {}) {
            if (isActive) return;
            
            const mergedConfig = { ...optimizations, ...config };
            isActive = true;

            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.group('Performance Optimization Initialization');
                logger.info('Starting performance optimization systems', mergedConfig);
            }

            // Initialize render scheduling
            if (mergedConfig.renderScheduling) {
                // RenderScheduler is automatically active
                if (logger) logger.info('✅ Render scheduling active');
            }

            // Initialize memory management
            if (mergedConfig.memoryManagement) {
                App.MemoryManager.init();
                if (logger) logger.info('✅ Memory management active');
            }

            // Initialize lazy loading
            if (mergedConfig.lazyLoading) {
                App.LazyLoader.init();
                App.ProgressiveImageLoader.init();
                if (logger) logger.info('✅ Lazy loading systems active');
            }

            // Initialize performance monitoring
            App.PerformanceMonitor.init();
            if (logger) {
                logger.info('✅ Performance monitoring active');
                logger.groupEnd();
            }

            // Set up automatic optimization based on performance level
            this.setupAdaptiveOptimization();
        },

        /**
         * Setup adaptive optimization based on performance metrics
         */
        setupAdaptiveOptimization: function() {
            const memoryManager = App.Core?.getModule('MemoryManager');
            
            setInterval(() => {
                const performanceLevel = App.MemoryManager.getPerformanceLevel();
                const renderMetrics = App.RenderScheduler.getMetrics();
                
                // Adaptive optimizations based on performance level
                switch (performanceLevel) {
                    case App.PerformanceLevel.CRITICAL:
                        // Emergency mode: aggressive cleanup
                        App.MemoryManager.detectLeaks();
                        App.RenderScheduler.clear();
                        break;
                        
                    case App.PerformanceLevel.HIGH:
                        // Reduce render queue processing
                        if (renderMetrics.queueLength > 10) {
                            App.RenderScheduler.clear();
                        }
                        break;
                        
                    case App.PerformanceLevel.MEDIUM:
                        // Optimize event delegation
                        if (App.MemoryManager.getMemoryStats().listeners > 50) {
                            const logger = App.Core?.getModule('Logger');
                            if (logger) {
                                logger.info('High listener count detected, consider more event delegation');
                            }
                        }
                        break;
                }
            }, 10000); // Check every 10 seconds
        },

        /**
         * Get comprehensive performance report
         */
        getPerformanceReport: function() {
            return {
                optimizationLevel,
                activeOptimizations: optimizations,
                renderScheduler: App.RenderScheduler.getMetrics(),
                memoryManager: App.MemoryManager.getMemoryStats(),
                lazyLoader: App.LazyLoader?.getStats(),
                codeSplitter: App.CodeSplitter?.getStats(),
                resourcePreloader: App.ResourcePreloader?.getCacheStats(),
                performanceLevel: App.MemoryManager.getPerformanceLevel(),
                recommendations: App.PerformanceMonitor.getOptimizationRecommendations()
            };
        },

        /**
         * Enable/disable specific optimizations
         */
        configure: function(newConfig) {
            optimizations = { ...optimizations, ...newConfig };
            
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.info('Performance optimization configuration updated', optimizations);
            }
        },

        /**
         * Cleanup all performance systems
         */
        cleanup: function() {
            isActive = false;
            App.PerformanceMonitor.cleanup();
            App.LazyLoader?.cleanup();
            App.CodeSplitter?.cleanup();
            App.ResourcePreloader?.clearCache();
        }
    };
})();

/**
 * Export performance systems to global App namespace
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RenderScheduler: App.RenderScheduler,
        MemoryManager: App.MemoryManager,
        EventOptimizer: App.EventOptimizer,
        LazyLoader: App.LazyLoader,
        CodeSplitter: App.CodeSplitter,
        ProgressiveImageLoader: App.ProgressiveImageLoader,
        VirtualScroller: App.VirtualScroller,
        PerformanceOptimizer: App.PerformanceOptimizer,
        PerformanceLevel: App.PerformanceLevel
    };
}