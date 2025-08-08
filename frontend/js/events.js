/**
 * RepoVista - Enhanced Event System
 * EventEmitter implementation with event delegation and performance utilities
 */

(function(window) {
    'use strict';

    /**
     * EventEmitter Class
     * Custom event emitter for component communication
     */
    class EventEmitter {
        constructor(options = {}) {
            this._events = new Map();
            this._maxListeners = options.maxListeners || 10;
            this._wildcardEvents = new Map();
            this._onceEvents = new Map();
        }

        /**
         * Register an event listener
         */
        on(event, listener, options = {}) {
            if (typeof listener !== 'function') {
                throw new TypeError('Listener must be a function');
            }

            const { once = false, priority = 0 } = options;

            if (event.includes('*')) {
                // Wildcard event
                this._addWildcardListener(event, listener, priority);
            } else {
                // Regular event
                if (!this._events.has(event)) {
                    this._events.set(event, []);
                }

                const listeners = this._events.get(event);
                
                // Check max listeners
                if (listeners.length >= this._maxListeners) {
                    console.warn(`MaxListenersExceeded: ${event} has ${listeners.length} listeners`);
                }

                listeners.push({ listener, priority, once });
                listeners.sort((a, b) => b.priority - a.priority);
            }

            return this;
        }

        /**
         * Register a one-time event listener
         */
        once(event, listener, options = {}) {
            return this.on(event, listener, { ...options, once: true });
        }

        /**
         * Remove event listener
         */
        off(event, listener) {
            if (event.includes('*')) {
                // Remove wildcard listener
                this._removeWildcardListener(event, listener);
            } else {
                // Remove regular listener
                const listeners = this._events.get(event);
                if (listeners) {
                    const index = listeners.findIndex(l => l.listener === listener);
                    if (index !== -1) {
                        listeners.splice(index, 1);
                    }
                    if (listeners.length === 0) {
                        this._events.delete(event);
                    }
                }
            }

            return this;
        }

        /**
         * Emit an event
         */
        emit(event, ...args) {
            const results = [];

            // Emit to exact listeners
            const listeners = this._events.get(event);
            if (listeners) {
                const listenersToCall = [...listeners];
                listenersToCall.forEach(({ listener, once }) => {
                    try {
                        const result = listener.apply(this, args);
                        results.push(result);
                        if (once) {
                            this.off(event, listener);
                        }
                    } catch (error) {
                        console.error(`Error in event listener for ${event}:`, error);
                        this.emit('error', error);
                    }
                });
            }

            // Emit to wildcard listeners
            this._wildcardEvents.forEach((listeners, pattern) => {
                if (this._matchWildcard(event, pattern)) {
                    listeners.forEach(({ listener }) => {
                        try {
                            const result = listener.apply(this, [event, ...args]);
                            results.push(result);
                        } catch (error) {
                            console.error(`Error in wildcard listener for ${pattern}:`, error);
                            this.emit('error', error);
                        }
                    });
                }
            });

            return results;
        }

        /**
         * Remove all listeners
         */
        removeAllListeners(event) {
            if (event) {
                this._events.delete(event);
                this._wildcardEvents.forEach((listeners, pattern) => {
                    if (this._matchWildcard(event, pattern)) {
                        this._wildcardEvents.delete(pattern);
                    }
                });
            } else {
                this._events.clear();
                this._wildcardEvents.clear();
            }

            return this;
        }

        /**
         * Get listener count
         */
        listenerCount(event) {
            const exact = this._events.get(event);
            let count = exact ? exact.length : 0;

            this._wildcardEvents.forEach((listeners, pattern) => {
                if (this._matchWildcard(event, pattern)) {
                    count += listeners.length;
                }
            });

            return count;
        }

        /**
         * Get all event names
         */
        eventNames() {
            return [...this._events.keys(), ...this._wildcardEvents.keys()];
        }

        // Private methods

        _addWildcardListener(pattern, listener, priority) {
            if (!this._wildcardEvents.has(pattern)) {
                this._wildcardEvents.set(pattern, []);
            }
            const listeners = this._wildcardEvents.get(pattern);
            listeners.push({ listener, priority });
            listeners.sort((a, b) => b.priority - a.priority);
        }

        _removeWildcardListener(pattern, listener) {
            const listeners = this._wildcardEvents.get(pattern);
            if (listeners) {
                const index = listeners.findIndex(l => l.listener === listener);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
                if (listeners.length === 0) {
                    this._wildcardEvents.delete(pattern);
                }
            }
        }

        _matchWildcard(event, pattern) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(event);
        }
    }

    /**
     * Enhanced Event Delegation System
     */
    class EventDelegator {
        constructor() {
            this._delegations = new Map();
            this._debounceTimers = new Map();
            this._throttleTimers = new Map();
        }

        /**
         * Set up event delegation
         */
        delegate(container, selector, eventType, handler, options = {}) {
            const containerEl = this._getElement(container);
            if (!containerEl) {
                throw new Error(`Container not found: ${container}`);
            }

            const {
                capture = false,
                passive = false,
                once = false,
                debounce = 0,
                throttle = 0,
                preventDefault = false,
                stopPropagation = false
            } = options;

            // Create wrapped handler
            let wrappedHandler = (event) => {
                const target = event.target.closest(selector);
                if (target && containerEl.contains(target)) {
                    // Handle preventDefault and stopPropagation
                    if (preventDefault) event.preventDefault();
                    if (stopPropagation) event.stopPropagation();

                    // Call handler with proper context
                    handler.call(target, event, target);
                }
            };

            // Apply debounce if specified
            if (debounce > 0) {
                wrappedHandler = this._debounce(wrappedHandler, debounce);
            }

            // Apply throttle if specified
            if (throttle > 0) {
                wrappedHandler = this._throttle(wrappedHandler, throttle);
            }

            // Add event listener with optimization
            if (App.EventOptimizer) {
                App.EventOptimizer.addEventListener(containerEl, eventType, wrappedHandler, {
                    capture,
                    passive,
                    once
                });
            } else {
                containerEl.addEventListener(eventType, wrappedHandler, {
                    capture,
                    passive,
                    once
                });
            }

            // Store delegation info for cleanup
            const delegationId = this._generateId();
            this._delegations.set(delegationId, {
                container: containerEl,
                selector,
                eventType,
                handler: wrappedHandler,
                originalHandler: handler,
                options: { capture, passive, once }
            });

            return delegationId;
        }

        /**
         * Remove event delegation
         */
        undelegate(delegationId) {
            const delegation = this._delegations.get(delegationId);
            if (delegation) {
                // Use EventOptimizer for removal if available
                if (App.EventOptimizer) {
                    App.EventOptimizer.removeEventListener(
                        delegation.container,
                        delegation.eventType,
                        delegation.handler
                    );
                } else {
                    delegation.container.removeEventListener(
                        delegation.eventType,
                        delegation.handler,
                        delegation.options
                    );
                }
                this._delegations.delete(delegationId);
                
                // Clean up debounce/throttle timers
                this._clearTimer(delegationId);
                
                return true;
            }
            return false;
        }

        /**
         * Set up multiple delegations at once
         */
        delegateMultiple(container, delegations) {
            const ids = [];
            
            for (const [selector, events] of Object.entries(delegations)) {
                for (const [eventType, handler] of Object.entries(events)) {
                    const id = this.delegate(container, selector, eventType, handler);
                    ids.push(id);
                }
            }
            
            return ids;
        }

        /**
         * Debounce utility
         */
        _debounce(func, delay) {
            const timerId = Symbol('debounce');
            
            return (...args) => {
                clearTimeout(this._debounceTimers.get(timerId));
                
                const timer = setTimeout(() => {
                    func.apply(this, args);
                    this._debounceTimers.delete(timerId);
                }, delay);
                
                this._debounceTimers.set(timerId, timer);
            };
        }

        /**
         * Throttle utility
         */
        _throttle(func, limit) {
            const timerId = Symbol('throttle');
            let inThrottle = false;
            
            return (...args) => {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    
                    const timer = setTimeout(() => {
                        inThrottle = false;
                        this._throttleTimers.delete(timerId);
                    }, limit);
                    
                    this._throttleTimers.set(timerId, timer);
                }
            };
        }

        /**
         * Clear timers
         */
        _clearTimer(delegationId) {
            const debounceTimer = this._debounceTimers.get(delegationId);
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                this._debounceTimers.delete(delegationId);
            }
            
            const throttleTimer = this._throttleTimers.get(delegationId);
            if (throttleTimer) {
                clearTimeout(throttleTimer);
                this._throttleTimers.delete(delegationId);
            }
        }

        /**
         * Get element helper
         */
        _getElement(selector) {
            if (typeof selector === 'string') {
                return document.querySelector(selector);
            }
            return selector;
        }

        /**
         * Generate unique ID
         */
        _generateId() {
            return `delegation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        /**
         * Clean up all delegations
         */
        cleanup() {
            this._delegations.forEach((delegation, id) => {
                this.undelegate(id);
            });
            
            // Clear all timers
            this._debounceTimers.forEach(timer => clearTimeout(timer));
            this._debounceTimers.clear();
            
            this._throttleTimers.forEach(timer => clearTimeout(timer));
            this._throttleTimers.clear();
        }
    }

    /**
     * Core Event Handlers for RepoVista
     */
    class CoreEventHandlers {
        constructor(emitter, delegator) {
            this.emitter = emitter;
            this.delegator = delegator;
            this._handlers = new Map();
        }

        /**
         * Initialize core event handlers
         */
        init() {
            // Repository card click
            this._handlers.set('repo-click', 
                this.delegator.delegate(
                    '#repositories-grid',
                    '.repository-card',
                    'click',
                    (event, target) => {
                        const repoName = target.dataset.repository;
                        this.emitter.emit('repository:selected', { name: repoName, element: target });
                    },
                    { preventDefault: true }
                )
            );

            // Tag selection
            this._handlers.set('tag-click',
                this.delegator.delegate(
                    '#repositories-grid',
                    '.tag-item',
                    'click',
                    (event, target) => {
                        const tagName = target.dataset.tag;
                        const repoName = target.closest('.repository-card').dataset.repository;
                        this.emitter.emit('tag:selected', { repository: repoName, tag: tagName, element: target });
                    },
                    { preventDefault: true, stopPropagation: true }
                )
            );

            // Search input
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', 
                    this._createDebounced((event) => {
                        this.emitter.emit('search:query', { query: event.target.value });
                    }, 300)
                );
            }

            // Pagination controls
            this._handlers.set('pagination',
                this.delegator.delegate(
                    '.pagination-controls',
                    '.page-button',
                    'click',
                    (event, target) => {
                        const page = parseInt(target.dataset.page, 10);
                        this.emitter.emit('pagination:change', { page });
                    },
                    { preventDefault: true }
                )
            );

            // Sort controls
            this._handlers.set('sort',
                this.delegator.delegate(
                    '.sort-controls',
                    '.sort-option',
                    'click',
                    (event, target) => {
                        const sortBy = target.dataset.sort;
                        this.emitter.emit('sort:change', { sortBy });
                    },
                    { preventDefault: true }
                )
            );

            // Page size selector
            const pageSizeSelector = document.getElementById('page-size');
            if (pageSizeSelector) {
                pageSizeSelector.addEventListener('change', (event) => {
                    const pageSize = parseInt(event.target.value, 10);
                    this.emitter.emit('pagesize:change', { pageSize });
                });
            }

            // Copy to clipboard
            this._handlers.set('copy',
                this.delegator.delegate(
                    'body',
                    '.copy-button',
                    'click',
                    (event, target) => {
                        const text = target.dataset.copyText || target.previousElementSibling?.textContent;
                        this._copyToClipboard(text);
                        this.emitter.emit('clipboard:copy', { text, element: target });
                    },
                    { preventDefault: true }
                )
            );

            // Accordion toggle
            this._handlers.set('accordion',
                this.delegator.delegate(
                    '#repositories-grid',
                    '.accordion-toggle',
                    'click',
                    (event, target) => {
                        const content = target.nextElementSibling;
                        const isExpanded = target.getAttribute('aria-expanded') === 'true';
                        
                        target.setAttribute('aria-expanded', !isExpanded);
                        content.style.display = isExpanded ? 'none' : 'block';
                        
                        this.emitter.emit('accordion:toggle', { 
                            element: target, 
                            expanded: !isExpanded 
                        });
                    },
                    { preventDefault: true }
                )
            );

            console.log('Core event handlers initialized');
        }

        /**
         * Clean up event handlers
         */
        cleanup() {
            this._handlers.forEach(id => {
                this.delegator.undelegate(id);
            });
            this._handlers.clear();
        }

        /**
         * Create debounced function
         */
        _createDebounced(func, delay) {
            let timeoutId;
            return function(...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => func.apply(this, args), delay);
            };
        }

        /**
         * Copy text to clipboard
         */
        async _copyToClipboard(text) {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                } else {
                    // Fallback for older browsers
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
                
                this.emitter.emit('notification:show', { 
                    type: 'success', 
                    message: 'Copied to clipboard!' 
                });
            } catch (error) {
                console.error('Failed to copy to clipboard:', error);
                this.emitter.emit('notification:show', { 
                    type: 'error', 
                    message: 'Failed to copy to clipboard' 
                });
            }
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.EventEmitter = EventEmitter;
    window.App.EventDelegator = EventDelegator;
    window.App.CoreEventHandlers = CoreEventHandlers;

})(window);