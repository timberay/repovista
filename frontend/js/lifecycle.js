/**
 * RepoVista - Component Lifecycle Management System
 * Advanced component lifecycle with state management and hierarchy
 */

(function(window) {
    'use strict';

    /**
     * Component State enumeration
     */
    const ComponentState = {
        CREATED: 'created',
        MOUNTING: 'mounting',
        MOUNTED: 'mounted',
        UPDATING: 'updating',
        UPDATED: 'updated',
        UNMOUNTING: 'unmounting',
        UNMOUNTED: 'unmounted',
        ERROR: 'error',
        DESTROYED: 'destroyed'
    };

    /**
     * BaseComponent Class
     * Provides lifecycle management for reusable components
     */
    class BaseComponent {
        constructor(props = {}, options = {}) {
            this.id = this._generateId();
            this.props = this._freezeProps(props);
            this.state = {};
            this.prevProps = null;
            this.prevState = null;
            this.element = null;
            this.parent = null;
            this.children = new Map();
            this.refs = new Map();
            this.subscriptions = new Set();
            this.lifecycleState = ComponentState.CREATED;
            this.isMounted = false;
            this.isDestroyed = false;
            
            // Configuration
            this.options = {
                shouldUpdate: true,
                errorBoundary: true,
                profiling: false,
                ...options
            };

            // Lifecycle hooks
            this.lifecycleHooks = new Map();
            this.errorHandlers = new Set();
            
            // Performance tracking
            this.performanceMetrics = {
                mountTime: 0,
                updateCount: 0,
                lastUpdateTime: 0,
                renderTime: 0
            };

            // Auto-bind methods
            this._bindMethods();
            
            // Initialize component
            this._initialize();
        }

        // Lifecycle Methods (to be overridden by subclasses)

        /**
         * Called before component is mounted
         */
        beforeMount() {
            // Override in subclass
        }

        /**
         * Called after component is mounted
         */
        mounted() {
            // Override in subclass
        }

        /**
         * Called before component updates
         */
        beforeUpdate(prevProps, prevState) {
            // Override in subclass
            return true; // Return false to cancel update
        }

        /**
         * Called after component updates
         */
        updated(prevProps, prevState) {
            // Override in subclass
        }

        /**
         * Called before component unmounts
         */
        beforeUnmount() {
            // Override in subclass
        }

        /**
         * Called after component unmounts
         */
        unmounted() {
            // Override in subclass
        }

        /**
         * Handle component errors
         */
        onError(error, errorInfo) {
            // Override in subclass
            console.error(`Component ${this.constructor.name} error:`, error, errorInfo);
        }

        /**
         * Render method (must be implemented by subclasses)
         */
        render() {
            throw new Error(`${this.constructor.name} must implement render() method`);
        }

        /**
         * Check if component should update
         */
        shouldUpdate(nextProps, nextState) {
            // Default shallow comparison
            return !this._shallowEqual(this.props, nextProps) || 
                   !this._shallowEqual(this.state, nextState);
        }

        // Public API Methods

        /**
         * Mount component to DOM element
         */
        async mount(container, renderEngine = null) {
            if (this.isMounted || this.isDestroyed) {
                console.warn(`Component ${this.id} is already mounted or destroyed`);
                return;
            }

            try {
                this._setLifecycleState(ComponentState.MOUNTING);
                const startTime = performance.now();

                // Resolve container
                this.container = typeof container === 'string' 
                    ? document.querySelector(container) 
                    : container;

                if (!this.container) {
                    throw new Error(`Mount container not found: ${container}`);
                }

                // Before mount hook
                await this._executeLifecycleHook('beforeMount');
                this.beforeMount();

                // Render component
                const renderResult = this.render();
                
                if (renderEngine) {
                    // Use provided render engine
                    renderEngine.render(this.container, renderResult);
                    this.element = this.container.firstElementChild;
                } else {
                    // Direct DOM manipulation
                    if (typeof renderResult === 'string') {
                        this.container.innerHTML = renderResult;
                        this.element = this.container.firstElementChild;
                    } else if (renderResult instanceof Node) {
                        this.container.appendChild(renderResult);
                        this.element = renderResult;
                    } else {
                        throw new Error('Invalid render result');
                    }
                }

                // Set up refs
                this._setupRefs();

                // Mount children
                await this._mountChildren();

                // Mark as mounted
                this.isMounted = true;
                this._setLifecycleState(ComponentState.MOUNTED);

                // Performance tracking
                this.performanceMetrics.mountTime = performance.now() - startTime;

                // After mount hook
                await this._executeLifecycleHook('mounted');
                this.mounted();

                // Emit mount event
                this._emit('mounted', { component: this });

                return this;
            } catch (error) {
                this._handleError(error, { phase: 'mount' });
                throw error;
            }
        }

        /**
         * Update component with new props
         */
        async update(newProps = {}, force = false) {
            if (!this.isMounted || this.isDestroyed) {
                console.warn(`Component ${this.id} is not mounted`);
                return;
            }

            try {
                this._setLifecycleState(ComponentState.UPDATING);
                const startTime = performance.now();

                // Prepare new props and state
                const nextProps = this._freezeProps({ ...this.props, ...newProps });
                const nextState = { ...this.state };

                // Check if update should proceed
                if (!force && this.options.shouldUpdate && !this.shouldUpdate(nextProps, nextState)) {
                    return this;
                }

                // Before update hook
                const shouldContinue = this.beforeUpdate(this.props, this.state);
                if (shouldContinue === false) {
                    return this;
                }

                await this._executeLifecycleHook('beforeUpdate', this.props, this.state);

                // Store previous values
                this.prevProps = this.props;
                this.prevState = this.state;

                // Update props
                this.props = nextProps;

                // Re-render
                const renderResult = this.render();
                
                // Update DOM (simplified approach)
                if (this.container) {
                    if (typeof renderResult === 'string') {
                        this.container.innerHTML = renderResult;
                        this.element = this.container.firstElementChild;
                    }
                }

                // Update refs
                this._setupRefs();

                // Update children
                await this._updateChildren();

                // Mark as updated
                this._setLifecycleState(ComponentState.UPDATED);
                this.performanceMetrics.updateCount++;
                this.performanceMetrics.lastUpdateTime = performance.now() - startTime;

                // After update hook
                await this._executeLifecycleHook('updated', this.prevProps, this.prevState);
                this.updated(this.prevProps, this.prevState);

                // Emit update event
                this._emit('updated', { component: this, prevProps: this.prevProps });

                return this;
            } catch (error) {
                this._handleError(error, { phase: 'update', props: newProps });
                throw error;
            }
        }

        /**
         * Set component state and trigger update
         */
        async setState(stateUpdater, callback = null) {
            if (!this.isMounted || this.isDestroyed) {
                return;
            }

            try {
                let newState;
                
                if (typeof stateUpdater === 'function') {
                    newState = stateUpdater(this.state);
                } else {
                    newState = { ...this.state, ...stateUpdater };
                }

                // Check if state actually changed
                if (this._shallowEqual(this.state, newState)) {
                    if (callback) callback();
                    return;
                }

                this.state = newState;
                await this.update({}, false);
                
                if (callback) callback();
            } catch (error) {
                this._handleError(error, { phase: 'setState', stateUpdater });
            }
        }

        /**
         * Unmount component
         */
        async unmount() {
            if (!this.isMounted || this.isDestroyed) {
                return;
            }

            try {
                this._setLifecycleState(ComponentState.UNMOUNTING);

                // Before unmount hook
                await this._executeLifecycleHook('beforeUnmount');
                this.beforeUnmount();

                // Unmount children first
                await this._unmountChildren();

                // Clean up subscriptions
                this._cleanupSubscriptions();

                // Remove from DOM
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }

                // Clean up refs
                this.refs.clear();

                // Mark as unmounted
                this.isMounted = false;
                this._setLifecycleState(ComponentState.UNMOUNTED);

                // After unmount hook
                await this._executeLifecycleHook('unmounted');
                this.unmounted();

                // Emit unmount event
                this._emit('unmounted', { component: this });

            } catch (error) {
                this._handleError(error, { phase: 'unmount' });
            }
        }

        /**
         * Destroy component completely
         */
        destroy() {
            if (this.isDestroyed) return;

            this.unmount();
            this.lifecycleHooks.clear();
            this.errorHandlers.clear();
            this.children.clear();
            this.parent = null;
            this.isDestroyed = true;
            this._setLifecycleState(ComponentState.DESTROYED);

            this._emit('destroyed', { component: this });
        }

        // Child Management

        /**
         * Add child component
         */
        addChild(child, key = null) {
            if (!(child instanceof BaseComponent)) {
                throw new Error('Child must be a BaseComponent instance');
            }

            const childKey = key || child.id;
            child.parent = this;
            this.children.set(childKey, child);

            // Mount child if parent is mounted
            if (this.isMounted && !child.isMounted) {
                const childContainer = this.element?.querySelector(`[data-child="${childKey}"]`);
                if (childContainer) {
                    child.mount(childContainer);
                }
            }

            return child;
        }

        /**
         * Remove child component
         */
        removeChild(key) {
            const child = this.children.get(key);
            if (child) {
                child.unmount();
                child.parent = null;
                this.children.delete(key);
            }
        }

        /**
         * Get child component
         */
        getChild(key) {
            return this.children.get(key);
        }

        /**
         * Get all children
         */
        getChildren() {
            return Array.from(this.children.values());
        }

        // Event System

        /**
         * Add event listener
         */
        on(event, handler) {
            if (!this._eventListeners) {
                this._eventListeners = new Map();
            }
            
            if (!this._eventListeners.has(event)) {
                this._eventListeners.set(event, new Set());
            }
            
            this._eventListeners.get(event).add(handler);
            
            return () => this.off(event, handler);
        }

        /**
         * Remove event listener
         */
        off(event, handler) {
            if (this._eventListeners?.has(event)) {
                this._eventListeners.get(event).delete(handler);
            }
        }

        /**
         * Emit event
         */
        _emit(event, data) {
            if (this._eventListeners?.has(event)) {
                this._eventListeners.get(event).forEach(handler => {
                    try {
                        handler(data);
                    } catch (error) {
                        console.error(`Event handler error for ${event}:`, error);
                    }
                });
            }

            // Bubble up to parent
            if (this.parent && event !== 'destroyed') {
                this.parent._emit(`child:${event}`, { ...data, child: this });
            }
        }

        // Lifecycle Hook Management

        /**
         * Add lifecycle hook
         */
        addLifecycleHook(phase, hook) {
            if (!this.lifecycleHooks.has(phase)) {
                this.lifecycleHooks.set(phase, new Set());
            }
            this.lifecycleHooks.get(phase).add(hook);
        }

        /**
         * Execute lifecycle hooks
         */
        async _executeLifecycleHook(phase, ...args) {
            if (this.lifecycleHooks.has(phase)) {
                const hooks = Array.from(this.lifecycleHooks.get(phase));
                for (const hook of hooks) {
                    try {
                        await hook.call(this, ...args);
                    } catch (error) {
                        console.error(`Lifecycle hook error (${phase}):`, error);
                    }
                }
            }
        }

        // Refs Management

        /**
         * Create ref
         */
        createRef() {
            return { current: null };
        }

        /**
         * Set up refs from rendered DOM
         */
        _setupRefs() {
            if (!this.element) return;

            const refElements = this.element.querySelectorAll('[data-ref]');
            refElements.forEach(el => {
                const refName = el.getAttribute('data-ref');
                if (refName) {
                    this.refs.set(refName, el);
                }
            });
        }

        /**
         * Get ref by name
         */
        getRef(name) {
            return this.refs.get(name);
        }

        // Utility Methods

        /**
         * Generate unique component ID
         */
        _generateId() {
            return `${this.constructor.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        /**
         * Initialize component
         */
        _initialize() {
            // Set up error boundary
            if (this.options.errorBoundary) {
                this._setupErrorBoundary();
            }

            this._emit('created', { component: this });
        }

        /**
         * Bind methods to component instance
         */
        _bindMethods() {
            const methods = [
                'mount', 'unmount', 'update', 'setState', 'render',
                'beforeMount', 'mounted', 'beforeUpdate', 'updated',
                'beforeUnmount', 'unmounted', 'onError'
            ];

            methods.forEach(method => {
                if (typeof this[method] === 'function') {
                    this[method] = this[method].bind(this);
                }
            });
        }

        /**
         * Set lifecycle state
         */
        _setLifecycleState(state) {
            this.lifecycleState = state;
            this._emit('lifecycleStateChanged', { state, component: this });
        }

        /**
         * Freeze props for immutability
         */
        _freezeProps(props) {
            return Object.freeze({ ...props });
        }

        /**
         * Shallow equality check
         */
        _shallowEqual(obj1, obj2) {
            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);

            if (keys1.length !== keys2.length) {
                return false;
            }

            return keys1.every(key => obj1[key] === obj2[key]);
        }

        /**
         * Handle component errors
         */
        _handleError(error, context = {}) {
            this._setLifecycleState(ComponentState.ERROR);
            
            const errorInfo = {
                componentId: this.id,
                componentName: this.constructor.name,
                lifecycleState: this.lifecycleState,
                context,
                timestamp: Date.now(),
                stack: error.stack
            };

            // Call error handlers
            this.errorHandlers.forEach(handler => {
                try {
                    handler(error, errorInfo);
                } catch (handlerError) {
                    console.error('Error handler failed:', handlerError);
                }
            });

            // Call component's onError method
            this.onError(error, errorInfo);

            // Emit error event
            this._emit('error', { error, errorInfo, component: this });
        }

        /**
         * Setup error boundary
         */
        _setupErrorBoundary() {
            window.addEventListener('error', (event) => {
                if (this.element?.contains(event.target)) {
                    this._handleError(event.error, { type: 'global', event });
                }
            });

            window.addEventListener('unhandledrejection', (event) => {
                this._handleError(new Error(event.reason), { type: 'promise', event });
            });
        }

        /**
         * Mount children components
         */
        async _mountChildren() {
            const mountPromises = Array.from(this.children.values()).map(child => {
                const childContainer = this.element?.querySelector(`[data-child="${child.id}"]`);
                if (childContainer && !child.isMounted) {
                    return child.mount(childContainer);
                }
            });

            await Promise.all(mountPromises.filter(Boolean));
        }

        /**
         * Update children components
         */
        async _updateChildren() {
            const updatePromises = Array.from(this.children.values())
                .filter(child => child.isMounted)
                .map(child => child.update());

            await Promise.all(updatePromises);
        }

        /**
         * Unmount children components
         */
        async _unmountChildren() {
            const unmountPromises = Array.from(this.children.values())
                .filter(child => child.isMounted)
                .map(child => child.unmount());

            await Promise.all(unmountPromises);
        }

        /**
         * Cleanup subscriptions
         */
        _cleanupSubscriptions() {
            this.subscriptions.forEach(unsubscribe => {
                try {
                    unsubscribe();
                } catch (error) {
                    console.error('Subscription cleanup error:', error);
                }
            });
            this.subscriptions.clear();
        }

        // Static Methods

        /**
         * Create component factory
         */
        static createFactory() {
            return (props, options) => new this(props, options);
        }

        /**
         * Mixin functionality
         */
        static mixin(mixinClass) {
            Object.getOwnPropertyNames(mixinClass.prototype).forEach(name => {
                if (name !== 'constructor') {
                    this.prototype[name] = mixinClass.prototype[name];
                }
            });
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.ComponentState = ComponentState;
    window.App.BaseComponent = BaseComponent;

})(window);