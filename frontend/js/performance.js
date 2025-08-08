/**
 * RepoVista Performance Optimization System
 * 
 * Comprehensive performance monitoring, optimization, and memory management
 * for the RepoVista Docker Registry Web UI application.
 */

// Performance optimization namespace
window.App = window.App || {};

/**
 * Performance Levels Enum
 */
App.PerformanceLevel = {
    IDLE: 'idle',
    LOW: 'low', 
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Render Scheduler using requestAnimationFrame
 * Batches DOM updates for optimal performance
 */
App.RenderScheduler = (function() {
    'use strict';

    let renderQueue = [];
    let isScheduled = false;
    let frameId = null;
    let lastFrameTime = 0;
    let frameCount = 0;
    let fps = 0;
    let renderMetrics = {
        totalRenders: 0,
        avgRenderTime: 0,
        maxRenderTime: 0,
        droppedFrames: 0
    };

    /**
     * Process queued render tasks
     */
    function processRenderQueue() {
        const startTime = performance.now();
        const frameStart = performance.now();
        
        try {
            // Calculate FPS
            calculateFPS();
            
            // Process renders with time budget (16ms for 60fps)
            const timeBudget = 16;
            let processedCount = 0;
            
            while (renderQueue.length > 0 && (performance.now() - frameStart) < timeBudget) {
                const task = renderQueue.shift();
                
                try {
                    if (task.callback && typeof task.callback === 'function') {
                        task.callback(task.data);
                    }
                    processedCount++;
                } catch (error) {
                    const logger = App.Core?.getModule('Logger');
                    if (logger) {
                        logger.error('Render task error', {
                            task: task.id || 'unknown',
                            error: error.message,
                            stack: error.stack
                        });
                    }
                }
            }

            // Update metrics
            const renderTime = performance.now() - startTime;
            updateRenderMetrics(renderTime, processedCount);
            
            // Schedule next frame if queue not empty
            if (renderQueue.length > 0) {
                scheduleRender();
            } else {
                isScheduled = false;
            }
            
        } catch (error) {
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.error('Render queue processing error', {
                    error: error.message,
                    queueLength: renderQueue.length
                });
            }
            isScheduled = false;
        }
    }

    /**
     * Calculate FPS and detect dropped frames
     */
    function calculateFPS() {
        const now = performance.now();
        
        if (lastFrameTime) {
            const delta = now - lastFrameTime;
            frameCount++;
            
            // Calculate FPS every 60 frames
            if (frameCount >= 60) {
                fps = Math.round(1000 / (delta / frameCount));
                
                // Detect dropped frames (< 50fps is concerning)
                if (fps < 50) {
                    renderMetrics.droppedFrames++;
                }
                
                frameCount = 0;
            }
        }
        
        lastFrameTime = now;
    }

    /**
     * Update render performance metrics
     */
    function updateRenderMetrics(renderTime, processedCount) {
        renderMetrics.totalRenders++;
        renderMetrics.avgRenderTime = (renderMetrics.avgRenderTime + renderTime) / 2;
        renderMetrics.maxRenderTime = Math.max(renderMetrics.maxRenderTime, renderTime);
        
        // Log performance warnings
        const logger = App.Core?.getModule('Logger');
        if (logger) {
            if (renderTime > 16) {
                logger.warn('Slow render detected', {
                    renderTime: `${renderTime.toFixed(2)}ms`,
                    processedTasks: processedCount,
                    queueLength: renderQueue.length
                });
            }
            
            if (renderMetrics.droppedFrames > 10) {
                logger.warn('Multiple dropped frames detected', {
                    droppedFrames: renderMetrics.droppedFrames,
                    currentFPS: fps
                });
            }
        }
    }

    /**
     * Schedule a render if not already scheduled
     */
    function scheduleRender() {
        if (!isScheduled) {
            isScheduled = true;
            frameId = requestAnimationFrame(processRenderQueue);
        }
    }

    return {
        /**
         * Schedule a render task
         */
        schedule: function(callback, data, priority = 0) {
            const task = {
                id: `render_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                callback,
                data,
                priority,
                timestamp: performance.now()
            };

            // Insert based on priority (higher priority first)
            let inserted = false;
            for (let i = 0; i < renderQueue.length; i++) {
                if (renderQueue[i].priority < priority) {
                    renderQueue.splice(i, 0, task);
                    inserted = true;
                    break;
                }
            }
            
            if (!inserted) {
                renderQueue.push(task);
            }

            scheduleRender();
            return task.id;
        },

        /**
         * Cancel a scheduled render task
         */
        cancel: function(taskId) {
            const index = renderQueue.findIndex(task => task.id === taskId);
            if (index !== -1) {
                renderQueue.splice(index, 1);
                return true;
            }
            return false;
        },

        /**
         * Clear all pending render tasks
         */
        clear: function() {
            renderQueue = [];
            if (frameId) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            isScheduled = false;
        },

        /**
         * Get current performance metrics
         */
        getMetrics: function() {
            return {
                ...renderMetrics,
                currentFPS: fps,
                queueLength: renderQueue.length,
                isScheduled,
                lastFrameTime
            };
        },

        /**
         * Reset performance metrics
         */
        resetMetrics: function() {
            renderMetrics = {
                totalRenders: 0,
                avgRenderTime: 0,
                maxRenderTime: 0,
                droppedFrames: 0
            };
            frameCount = 0;
            fps = 0;
        }
    };
})();

/**
 * Memory Manager
 * Tracks and prevents memory leaks
 */
App.MemoryManager = (function() {
    'use strict';

    let memoryMetrics = {
        components: new Map(),
        listeners: new Map(),
        observers: new Map(),
        timers: new Set(),
        intervals: new Set(),
        weakRefs: new Set()
    };

    let monitoringEnabled = false;
    let monitoringInterval = null;
    let memoryThresholds = {
        warning: 50 * 1024 * 1024,    // 50MB
        critical: 100 * 1024 * 1024   // 100MB
    };

    /**
     * Start memory monitoring
     */
    function startMonitoring() {
        if (monitoringEnabled) return;
        
        monitoringEnabled = true;
        monitoringInterval = setInterval(checkMemoryUsage, 5000); // Check every 5 seconds
        memoryMetrics.intervals.add(monitoringInterval);
        
        const logger = App.Core?.getModule('Logger');
        if (logger) {
            logger.info('Memory monitoring started', {
                interval: '5 seconds',
                thresholds: memoryThresholds
            });
        }
    }

    /**
     * Check current memory usage
     */
    function checkMemoryUsage() {
        if (!performance.memory) return;
        
        const memory = performance.memory;
        const usage = {
            used: memory.usedJSHeapSize,
            total: memory.totalJSHeapSize,
            limit: memory.jsHeapSizeLimit,
            percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
        };

        const logger = App.Core?.getModule('Logger');
        
        // Check thresholds
        if (usage.used > memoryThresholds.critical) {
            if (logger) {
                logger.error('Critical memory usage detected', {
                    usage: `${(usage.used / 1024 / 1024).toFixed(2)}MB`,
                    percentage: `${usage.percentage.toFixed(1)}%`,
                    components: memoryMetrics.components.size,
                    listeners: memoryMetrics.listeners.size
                });
            }
            
            // Trigger garbage collection if available
            if (window.gc) {
                window.gc();
            }
            
            // Emergency cleanup
            performEmergencyCleanup();
            
        } else if (usage.used > memoryThresholds.warning) {
            if (logger) {
                logger.warn('High memory usage detected', {
                    usage: `${(usage.used / 1024 / 1024).toFixed(2)}MB`,
                    percentage: `${usage.percentage.toFixed(1)}%`
                });
            }
        }

        // Store metrics for analysis
        if (logger) {
            logger.debug('Memory metrics', usage);
        }
    }

    /**
     * Emergency cleanup when memory is critical
     */
    function performEmergencyCleanup() {
        const logger = App.Core?.getModule('Logger');
        let cleanedCount = 0;

        // Clean up dead weak references
        for (const weakRef of memoryMetrics.weakRefs) {
            if (!weakRef.deref()) {
                memoryMetrics.weakRefs.delete(weakRef);
                cleanedCount++;
            }
        }

        // Clean up orphaned listeners
        const activeElements = document.querySelectorAll('*');
        const activeElementsSet = new Set(activeElements);
        
        for (const [element, listeners] of memoryMetrics.listeners) {
            if (!activeElementsSet.has(element)) {
                // Element no longer in DOM, clean up listeners
                listeners.forEach(listenerInfo => {
                    element.removeEventListener(listenerInfo.type, listenerInfo.handler);
                });
                memoryMetrics.listeners.delete(element);
                cleanedCount++;
            }
        }

        if (logger) {
            logger.info('Emergency cleanup completed', {
                cleanedItems: cleanedCount,
                remainingComponents: memoryMetrics.components.size,
                remainingListeners: memoryMetrics.listeners.size
            });
        }
    }

    return {
        /**
         * Initialize memory manager
         */
        init: function() {
            startMonitoring();
            
            // Set up window unload cleanup
            window.addEventListener('beforeunload', this.cleanup.bind(this));
        },

        /**
         * Register a component for memory tracking
         */
        registerComponent: function(component) {
            const id = component.id || `component_${Date.now()}`;
            memoryMetrics.components.set(id, {
                component: new WeakRef(component),
                createdAt: Date.now(),
                type: component.constructor.name
            });
            
            const weakRef = new WeakRef(component);
            memoryMetrics.weakRefs.add(weakRef);
            
            return id;
        },

        /**
         * Unregister a component
         */
        unregisterComponent: function(componentId) {
            return memoryMetrics.components.delete(componentId);
        },

        /**
         * Register an event listener for tracking
         */
        registerListener: function(element, type, handler, options = {}) {
            if (!memoryMetrics.listeners.has(element)) {
                memoryMetrics.listeners.set(element, []);
            }
            
            const listenerInfo = {
                type,
                handler,
                options,
                createdAt: Date.now()
            };
            
            memoryMetrics.listeners.get(element).push(listenerInfo);
            element.addEventListener(type, handler, options);
            
            return listenerInfo;
        },

        /**
         * Unregister an event listener
         */
        unregisterListener: function(element, type, handler) {
            const listeners = memoryMetrics.listeners.get(element);
            if (listeners) {
                const index = listeners.findIndex(l => l.type === type && l.handler === handler);
                if (index !== -1) {
                    listeners.splice(index, 1);
                    element.removeEventListener(type, handler);
                    
                    // Clean up empty listener arrays
                    if (listeners.length === 0) {
                        memoryMetrics.listeners.delete(element);
                    }
                    return true;
                }
            }
            return false;
        },

        /**
         * Register a timer for tracking
         */
        registerTimer: function(timerId) {
            memoryMetrics.timers.add(timerId);
        },

        /**
         * Register an interval for tracking
         */
        registerInterval: function(intervalId) {
            memoryMetrics.intervals.add(intervalId);
        },

        /**
         * Get current memory statistics
         */
        getMemoryStats: function() {
            const stats = {
                components: memoryMetrics.components.size,
                listeners: Array.from(memoryMetrics.listeners.values()).reduce((sum, arr) => sum + arr.length, 0),
                observers: memoryMetrics.observers.size,
                timers: memoryMetrics.timers.size,
                intervals: memoryMetrics.intervals.size,
                weakRefs: memoryMetrics.weakRefs.size
            };

            if (performance.memory) {
                stats.jsHeap = {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit,
                    percentage: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
                };
            }

            return stats;
        },

        /**
         * Perform comprehensive cleanup
         */
        cleanup: function() {
            const logger = App.Core?.getModule('Logger');
            let cleanedCount = 0;

            // Clear timers
            for (const timerId of memoryMetrics.timers) {
                clearTimeout(timerId);
                cleanedCount++;
            }
            memoryMetrics.timers.clear();

            // Clear intervals
            for (const intervalId of memoryMetrics.intervals) {
                clearInterval(intervalId);
                cleanedCount++;
            }
            memoryMetrics.intervals.clear();

            // Clear listeners
            for (const [element, listeners] of memoryMetrics.listeners) {
                listeners.forEach(listenerInfo => {
                    element.removeEventListener(listenerInfo.type, listenerInfo.handler);
                    cleanedCount++;
                });
            }
            memoryMetrics.listeners.clear();

            // Clear component references
            memoryMetrics.components.clear();
            memoryMetrics.observers.clear();
            memoryMetrics.weakRefs.clear();

            // Stop monitoring
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
                monitoringInterval = null;
                monitoringEnabled = false;
            }

            if (logger) {
                logger.info('Memory cleanup completed', {
                    cleanedItems: cleanedCount
                });
            }
        },

        /**
         * Detect potential memory leaks
         */
        detectLeaks: function() {
            const leaks = [];
            const now = Date.now();
            const threshold = 5 * 60 * 1000; // 5 minutes

            // Check for long-lived components
            for (const [id, info] of memoryMetrics.components) {
                if (now - info.createdAt > threshold) {
                    if (!info.component.deref()) {
                        leaks.push({
                            type: 'component',
                            id,
                            age: now - info.createdAt,
                            componentType: info.type
                        });
                    }
                }
            }

            // Check for orphaned listeners
            for (const [element, listeners] of memoryMetrics.listeners) {
                if (!document.contains(element)) {
                    leaks.push({
                        type: 'listener',
                        element: element.tagName,
                        count: listeners.length,
                        age: Math.min(...listeners.map(l => now - l.createdAt))
                    });
                }
            }

            const logger = App.Core?.getModule('Logger');
            if (leaks.length > 0 && logger) {
                logger.warn('Potential memory leaks detected', {
                    leakCount: leaks.length,
                    leaks: leaks.slice(0, 5) // Show first 5
                });
            }

            return leaks;
        },

        /**
         * Get performance level based on current metrics
         */
        getPerformanceLevel: function() {
            const stats = this.getMemoryStats();
            const renderMetrics = App.RenderScheduler.getMetrics();
            
            // Calculate performance score
            let score = 100;
            
            if (stats.jsHeap) {
                if (stats.jsHeap.percentage > 80) score -= 30;
                else if (stats.jsHeap.percentage > 60) score -= 15;
            }
            
            if (renderMetrics.droppedFrames > 10) score -= 20;
            if (renderMetrics.avgRenderTime > 16) score -= 15;
            if (stats.listeners > 100) score -= 10;
            
            // Return performance level
            if (score >= 90) return App.PerformanceLevel.IDLE;
            if (score >= 70) return App.PerformanceLevel.LOW;
            if (score >= 50) return App.PerformanceLevel.MEDIUM;
            if (score >= 30) return App.PerformanceLevel.HIGH;
            return App.PerformanceLevel.CRITICAL;
        }
    };
})();

/**
 * Event Listener Optimizer
 * Manages and optimizes event listener performance
 */
App.EventOptimizer = (function() {
    'use strict';

    let listenerCache = new Map();
    let delegatedHandlers = new Map();
    let passiveSupported = null;

    /**
     * Test passive event listener support
     */
    function testPassiveSupport() {
        if (passiveSupported !== null) return passiveSupported;
        
        try {
            let opts = Object.defineProperty({}, 'passive', {
                get: function() {
                    passiveSupported = true;
                    return true;
                }
            });
            window.addEventListener('test', null, opts);
            window.removeEventListener('test', null, opts);
        } catch (e) {
            passiveSupported = false;
        }
        
        return passiveSupported;
    }

    /**
     * Optimize event listener options
     */
    function optimizeOptions(type, options = {}) {
        const optimized = { ...options };
        
        // Add passive for touch/scroll events if supported
        if (testPassiveSupport()) {
            const passiveEvents = ['touchstart', 'touchmove', 'scroll', 'wheel'];
            if (passiveEvents.includes(type) && !optimized.hasOwnProperty('passive')) {
                optimized.passive = true;
            }
        }
        
        return optimized;
    }

    return {
        /**
         * Add optimized event listener
         */
        addEventListener: function(element, type, handler, options = {}) {
            const optimizedOptions = optimizeOptions(type, options);
            const memoryManager = App.Core?.getModule('MemoryManager');
            
            if (memoryManager) {
                memoryManager.registerListener(element, type, handler, optimizedOptions);
            } else {
                element.addEventListener(type, handler, optimizedOptions);
            }
            
            // Cache for potential reuse
            const cacheKey = `${type}_${handler.toString().slice(0, 50)}`;
            listenerCache.set(cacheKey, { type, handler, options: optimizedOptions });
        },

        /**
         * Remove event listener with cleanup
         */
        removeEventListener: function(element, type, handler) {
            const memoryManager = App.Core?.getModule('MemoryManager');
            
            if (memoryManager) {
                memoryManager.unregisterListener(element, type, handler);
            } else {
                element.removeEventListener(type, handler);
            }
        },

        /**
         * Set up efficient event delegation
         */
        setupDelegation: function(container, selectors) {
            const delegationKey = container.tagName + '_' + Object.keys(selectors).join('_');
            
            if (delegatedHandlers.has(delegationKey)) {
                return delegatedHandlers.get(delegationKey);
            }

            const delegatedHandler = function(event) {
                const target = event.target.closest ? event.target : event.target.parentNode;
                
                for (const [selector, handler] of Object.entries(selectors)) {
                    const matched = target.closest(selector);
                    if (matched && container.contains(matched)) {
                        handler.call(matched, event);
                        break;
                    }
                }
            };

            this.addEventListener(container, 'click', delegatedHandler);
            delegatedHandlers.set(delegationKey, delegatedHandler);
            
            return delegatedHandler;
        },

        /**
         * Clean up all cached listeners
         */
        cleanup: function() {
            listenerCache.clear();
            delegatedHandlers.clear();
        },

        /**
         * Get listener statistics
         */
        getStats: function() {
            return {
                cachedListeners: listenerCache.size,
                delegatedHandlers: delegatedHandlers.size,
                passiveSupported
            };
        }
    };
})();

/**
 * Resource Preloader
 * Manages resource prefetching and caching
 */
App.ResourcePreloader = (function() {
    'use strict';

    let preloadCache = new Map();
    let preloadQueue = [];
    let isProcessing = false;
    let cacheStrategy = {
        maxAge: 30 * 60 * 1000, // 30 minutes
        maxSize: 50, // Max cached items
        priority: {
            images: 3,
            scripts: 2,
            styles: 1,
            data: 4
        }
    };

    /**
     * Process preload queue
     */
    function processQueue() {
        if (isProcessing || preloadQueue.length === 0) return;
        
        isProcessing = true;
        const item = preloadQueue.shift();
        
        preloadResource(item).finally(() => {
            isProcessing = false;
            // Process next item
            if (preloadQueue.length > 0) {
                setTimeout(processQueue, 100);
            }
        });
    }

    /**
     * Preload a single resource
     */
    async function preloadResource(item) {
        const { url, type, priority } = item;
        const cacheKey = `${type}_${url}`;
        
        try {
            let resource;
            
            switch (type) {
                case 'image':
                    resource = await preloadImage(url);
                    break;
                case 'script':
                    resource = await preloadScript(url);
                    break;
                case 'style':
                    resource = await preloadStyle(url);
                    break;
                case 'data':
                    resource = await preloadData(url);
                    break;
                default:
                    throw new Error(`Unknown resource type: ${type}`);
            }
            
            // Cache the resource
            preloadCache.set(cacheKey, {
                resource,
                timestamp: Date.now(),
                hits: 0,
                priority
            });
            
            // Manage cache size
            manageCacheSize();
            
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.debug('Resource preloaded', {
                    url,
                    type,
                    cacheSize: preloadCache.size
                });
            }
            
        } catch (error) {
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.error('Resource preload failed', {
                    url,
                    type,
                    error: error.message
                });
            }
        }
    }

    /**
     * Preload image
     */
    function preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    /**
     * Preload script
     */
    function preloadScript(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'script';
            link.href = url;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    /**
     * Preload stylesheet
     */
    function preloadStyle(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'style';
            link.href = url;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    /**
     * Preload data via fetch
     */
    async function preloadData(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Manage cache size and expiration
     */
    function manageCacheSize() {
        const now = Date.now();
        
        // Remove expired items
        for (const [key, item] of preloadCache) {
            if (now - item.timestamp > cacheStrategy.maxAge) {
                preloadCache.delete(key);
            }
        }
        
        // Remove least used items if over size limit
        if (preloadCache.size > cacheStrategy.maxSize) {
            const sortedItems = Array.from(preloadCache.entries())
                .sort((a, b) => {
                    // Sort by priority (higher first), then by hits (higher first), then by age (newer first)
                    if (a[1].priority !== b[1].priority) {
                        return b[1].priority - a[1].priority;
                    }
                    if (a[1].hits !== b[1].hits) {
                        return b[1].hits - a[1].hits;
                    }
                    return b[1].timestamp - a[1].timestamp;
                });
            
            // Remove least valuable items
            const itemsToRemove = sortedItems.slice(cacheStrategy.maxSize);
            for (const [key] of itemsToRemove) {
                preloadCache.delete(key);
            }
        }
    }

    return {
        /**
         * Queue a resource for preloading
         */
        preload: function(url, type, priority = 1) {
            const cacheKey = `${type}_${url}`;
            
            // Check if already cached
            if (preloadCache.has(cacheKey)) {
                const cached = preloadCache.get(cacheKey);
                cached.hits++;
                return Promise.resolve(cached.resource);
            }
            
            // Add to queue
            preloadQueue.push({ url, type, priority });
            
            // Sort queue by priority
            preloadQueue.sort((a, b) => b.priority - a.priority);
            
            // Start processing
            processQueue();
            
            return new Promise((resolve) => {
                const checkCache = () => {
                    if (preloadCache.has(cacheKey)) {
                        resolve(preloadCache.get(cacheKey).resource);
                    } else {
                        setTimeout(checkCache, 100);
                    }
                };
                checkCache();
            });
        },

        /**
         * Get cached resource
         */
        getFromCache: function(url, type) {
            const cacheKey = `${type}_${url}`;
            const cached = preloadCache.get(cacheKey);
            
            if (cached) {
                cached.hits++;
                return cached.resource;
            }
            
            return null;
        },

        /**
         * Preload critical resources
         */
        preloadCritical: function() {
            // Preload common UI assets
            const criticalResources = [
                { url: '/api/repositories?limit=20', type: 'data', priority: 4 },
                { url: 'css/styles.css', type: 'style', priority: 2 }
            ];
            
            criticalResources.forEach(resource => {
                this.preload(resource.url, resource.type, resource.priority);
            });
        },

        /**
         * Clear cache
         */
        clearCache: function() {
            preloadCache.clear();
            preloadQueue = [];
        },

        /**
         * Get cache statistics
         */
        getCacheStats: function() {
            return {
                cacheSize: preloadCache.size,
                queueLength: preloadQueue.length,
                totalHits: Array.from(preloadCache.values()).reduce((sum, item) => sum + item.hits, 0),
                cacheEfficiency: preloadCache.size > 0 ? 
                    Array.from(preloadCache.values()).reduce((sum, item) => sum + item.hits, 0) / preloadCache.size : 0
            };
        }
    };
})();

/**
 * Performance Monitor
 * Central performance monitoring and optimization coordinator
 */
App.PerformanceMonitor = (function() {
    'use strict';

    let monitoring = false;
    let performanceData = {
        pageLoad: null,
        renderMetrics: null,
        memoryUsage: null,
        networkLatency: null,
        userInteractions: []
    };

    return {
        /**
         * Initialize performance monitoring
         */
        init: function() {
            if (monitoring) return;
            
            monitoring = true;
            
            // Initialize memory manager
            App.MemoryManager.init();
            
            // Start preloading critical resources
            App.ResourcePreloader.preloadCritical();
            
            // Set up performance observers if available
            this.setupPerformanceObservers();
            
            // Monitor page load performance
            this.measurePageLoad();
            
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.info('Performance monitoring initialized', {
                    renderScheduler: 'active',
                    memoryManager: 'active',
                    resourcePreloader: 'active'
                });
            }
        },

        /**
         * Set up performance observers
         */
        setupPerformanceObservers: function() {
            if (!window.PerformanceObserver) return;
            
            try {
                // Observe navigation timing
                const navObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach(entry => {
                        if (entry.entryType === 'navigation') {
                            performanceData.pageLoad = {
                                loadComplete: entry.loadEventEnd - entry.fetchStart,
                                domComplete: entry.domContentLoadedEventEnd - entry.fetchStart,
                                firstPaint: entry.responseEnd - entry.fetchStart
                            };
                        }
                    });
                });
                navObserver.observe({ entryTypes: ['navigation'] });
                
                // Observe resource timing
                const resourceObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach(entry => {
                        if (entry.duration > 100) { // Log slow resources
                            const logger = App.Core?.getModule('Logger');
                            if (logger) {
                                logger.warn('Slow resource detected', {
                                    name: entry.name,
                                    duration: `${entry.duration.toFixed(2)}ms`,
                                    size: entry.transferSize || 'unknown'
                                });
                            }
                        }
                    });
                });
                resourceObserver.observe({ entryTypes: ['resource'] });
                
            } catch (error) {
                const logger = App.Core?.getModule('Logger');
                if (logger) {
                    logger.warn('Performance observers setup failed', {
                        error: error.message
                    });
                }
            }
        },

        /**
         * Measure page load performance
         */
        measurePageLoad: function() {
            if (document.readyState === 'complete') {
                this.calculatePageLoadMetrics();
            } else {
                window.addEventListener('load', () => {
                    this.calculatePageLoadMetrics();
                });
            }
        },

        /**
         * Calculate page load metrics
         */
        calculatePageLoadMetrics: function() {
            const timing = performance.timing;
            const navigation = performance.getEntriesByType('navigation')[0];
            
            performanceData.pageLoad = {
                total: timing.loadEventEnd - timing.navigationStart,
                dns: timing.domainLookupEnd - timing.domainLookupStart,
                tcp: timing.connectEnd - timing.connectStart,
                request: timing.responseStart - timing.requestStart,
                response: timing.responseEnd - timing.responseStart,
                domProcessing: timing.domComplete - timing.domLoading,
                onLoad: timing.loadEventEnd - timing.loadEventStart
            };
            
            if (navigation) {
                performanceData.pageLoad.firstContentfulPaint = navigation.responseEnd - navigation.fetchStart;
            }
            
            const logger = App.Core?.getModule('Logger');
            if (logger) {
                logger.info('Page load performance measured', performanceData.pageLoad);
            }
        },

        /**
         * Track user interaction performance
         */
        trackInteraction: function(type, startTime, endTime, metadata = {}) {
            const duration = endTime - startTime;
            
            performanceData.userInteractions.push({
                type,
                duration,
                timestamp: startTime,
                metadata
            });
            
            // Keep only last 100 interactions
            if (performanceData.userInteractions.length > 100) {
                performanceData.userInteractions = performanceData.userInteractions.slice(-100);
            }
            
            // Log slow interactions
            if (duration > 100) {
                const logger = App.Core?.getModule('Logger');
                if (logger) {
                    logger.warn('Slow user interaction detected', {
                        type,
                        duration: `${duration.toFixed(2)}ms`,
                        metadata
                    });
                }
            }
        },

        /**
         * Get comprehensive performance report
         */
        getPerformanceReport: function() {
            return {
                pageLoad: performanceData.pageLoad,
                rendering: App.RenderScheduler.getMetrics(),
                memory: App.MemoryManager.getMemoryStats(),
                events: App.EventOptimizer.getStats(),
                cache: App.ResourcePreloader.getCacheStats(),
                interactions: {
                    count: performanceData.userInteractions.length,
                    avgDuration: performanceData.userInteractions.length > 0 ? 
                        performanceData.userInteractions.reduce((sum, i) => sum + i.duration, 0) / performanceData.userInteractions.length : 0
                },
                performanceLevel: App.MemoryManager.getPerformanceLevel(),
                recommendations: this.getOptimizationRecommendations()
            };
        },

        /**
         * Get optimization recommendations
         */
        getOptimizationRecommendations: function() {
            const recommendations = [];
            const renderMetrics = App.RenderScheduler.getMetrics();
            const memoryStats = App.MemoryManager.getMemoryStats();
            
            // Rendering recommendations
            if (renderMetrics.avgRenderTime > 16) {
                recommendations.push({
                    type: 'rendering',
                    severity: 'high',
                    message: 'Average render time exceeds 16ms target',
                    action: 'Consider reducing DOM complexity or implementing virtualization'
                });
            }
            
            if (renderMetrics.droppedFrames > 5) {
                recommendations.push({
                    type: 'rendering',
                    severity: 'medium',
                    message: 'Multiple dropped frames detected',
                    action: 'Review render queue batching and reduce work per frame'
                });
            }
            
            // Memory recommendations
            if (memoryStats.jsHeap && memoryStats.jsHeap.percentage > 70) {
                recommendations.push({
                    type: 'memory',
                    severity: 'high',
                    message: 'High memory usage detected',
                    action: 'Review component cleanup and event listener management'
                });
            }
            
            if (memoryStats.listeners > 50) {
                recommendations.push({
                    type: 'memory',
                    severity: 'medium',
                    message: 'High number of event listeners',
                    action: 'Consider using more event delegation'
                });
            }
            
            // Interaction recommendations
            const avgInteractionTime = performanceData.userInteractions.length > 0 ? 
                performanceData.userInteractions.reduce((sum, i) => sum + i.duration, 0) / performanceData.userInteractions.length : 0;
            
            if (avgInteractionTime > 50) {
                recommendations.push({
                    type: 'interaction',
                    severity: 'medium',
                    message: 'Slow user interactions detected',
                    action: 'Optimize event handlers and reduce synchronous work'
                });
            }
            
            return recommendations;
        },

        /**
         * Stop monitoring and cleanup
         */
        cleanup: function() {
            monitoring = false;
            App.MemoryManager.cleanup();
            App.EventOptimizer.cleanup();
            App.ResourcePreloader.clearCache();
            App.RenderScheduler.clear();
        }
    };
})();

/**
 * Export performance utilities to global App namespace
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RenderScheduler: App.RenderScheduler,
        MemoryManager: App.MemoryManager,
        EventOptimizer: App.EventOptimizer,
        ResourcePreloader: App.ResourcePreloader,
        PerformanceMonitor: App.PerformanceMonitor,
        PerformanceLevel: App.PerformanceLevel
    };
}