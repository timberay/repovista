/**
 * RepoVista - Component Registry and Factory System
 * Advanced component management with factories, mixins, and dependency injection
 */

(function(window) {
    'use strict';

    /**
     * Component Registry
     * Central registry for component definitions and instances
     */
    class ComponentRegistry {
        constructor() {
            this.components = new Map();
            this.instances = new Map();
            this.factories = new Map();
            this.mixins = new Map();
            this.middlewares = [];
            this.dependencies = new Map();
        }

        /**
         * Register a component class
         */
        register(name, componentClass, options = {}) {
            if (this.components.has(name)) {
                console.warn(`Component ${name} is already registered`);
                return false;
            }

            const config = {
                class: componentClass,
                singleton: options.singleton || false,
                dependencies: options.dependencies || [],
                mixins: options.mixins || [],
                factory: options.factory || null,
                lazy: options.lazy || false,
                ...options
            };

            this.components.set(name, config);
            
            // Register factory if provided
            if (config.factory) {
                this.factories.set(name, config.factory);
            } else {
                this.factories.set(name, (props, options) => 
                    new componentClass(props, options)
                );
            }

            console.log(`Registered component: ${name}`);
            return true;
        }

        /**
         * Create component instance
         */
        create(name, props = {}, options = {}) {
            const config = this.components.get(name);
            if (!config) {
                throw new Error(`Component ${name} not found in registry`);
            }

            // Check for singleton
            if (config.singleton && this.instances.has(name)) {
                return this.instances.get(name);
            }

            // Apply middlewares
            const processedProps = this._applyMiddlewares(name, props, options);

            // Resolve dependencies
            const dependencies = this._resolveDependencies(config.dependencies);

            // Apply mixins
            let ComponentClass = config.class;
            if (config.mixins.length > 0) {
                ComponentClass = this._createMixedClass(ComponentClass, config.mixins);
            }

            // Create instance
            const factory = this.factories.get(name);
            const instance = factory(
                { ...processedProps, dependencies }, 
                options
            );

            // Store singleton
            if (config.singleton) {
                this.instances.set(name, instance);
            }

            // Track instance
            const instanceId = instance.id || this._generateId();
            this.instances.set(instanceId, instance);

            return instance;
        }

        /**
         * Get component configuration
         */
        getComponent(name) {
            return this.components.get(name);
        }

        /**
         * Get all registered components
         */
        getComponents() {
            return Array.from(this.components.keys());
        }

        /**
         * Check if component is registered
         */
        has(name) {
            return this.components.has(name);
        }

        /**
         * Unregister component
         */
        unregister(name) {
            this.components.delete(name);
            this.factories.delete(name);
            
            // Clean up singleton instance
            if (this.instances.has(name)) {
                const instance = this.instances.get(name);
                if (instance.destroy) {
                    instance.destroy();
                }
                this.instances.delete(name);
            }
        }

        /**
         * Register mixin
         */
        registerMixin(name, mixin) {
            this.mixins.set(name, mixin);
        }

        /**
         * Add middleware
         */
        addMiddleware(middleware) {
            this.middlewares.push(middleware);
        }

        /**
         * Register dependency
         */
        registerDependency(name, dependency) {
            this.dependencies.set(name, dependency);
        }

        /**
         * Apply middlewares to props
         */
        _applyMiddlewares(componentName, props, options) {
            return this.middlewares.reduce((acc, middleware) => {
                return middleware(componentName, acc, options) || acc;
            }, props);
        }

        /**
         * Resolve component dependencies
         */
        _resolveDependencies(dependencyNames) {
            const resolved = {};
            
            dependencyNames.forEach(depName => {
                if (this.dependencies.has(depName)) {
                    resolved[depName] = this.dependencies.get(depName);
                } else if (this.components.has(depName)) {
                    resolved[depName] = this.create(depName);
                } else {
                    console.warn(`Dependency ${depName} not found`);
                }
            });

            return resolved;
        }

        /**
         * Create class with mixins
         */
        _createMixedClass(BaseClass, mixinNames) {
            const mixins = mixinNames
                .map(name => this.mixins.get(name))
                .filter(Boolean);

            if (mixins.length === 0) {
                return BaseClass;
            }

            class MixedClass extends BaseClass {}

            mixins.forEach(mixin => {
                if (typeof mixin === 'function') {
                    mixin(MixedClass.prototype);
                } else {
                    Object.assign(MixedClass.prototype, mixin);
                }
            });

            return MixedClass;
        }

        /**
         * Generate unique ID
         */
        _generateId() {
            return `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        /**
         * Clear all components and instances
         */
        clear() {
            // Destroy all instances
            this.instances.forEach(instance => {
                if (instance.destroy) {
                    instance.destroy();
                }
            });

            this.components.clear();
            this.instances.clear();
            this.factories.clear();
            this.middlewares = [];
        }
    }

    /**
     * Component Factory
     * Advanced factory for creating components with configuration
     */
    class ComponentFactory {
        constructor(registry) {
            this.registry = registry;
            this.templates = new Map();
            this.presets = new Map();
        }

        /**
         * Create component with template
         */
        createFromTemplate(templateName, props = {}, options = {}) {
            const template = this.templates.get(templateName);
            if (!template) {
                throw new Error(`Template ${templateName} not found`);
            }

            const mergedProps = { ...template.props, ...props };
            const mergedOptions = { ...template.options, ...options };

            return this.registry.create(template.component, mergedProps, mergedOptions);
        }

        /**
         * Register component template
         */
        registerTemplate(name, config) {
            this.templates.set(name, {
                component: config.component,
                props: config.props || {},
                options: config.options || {},
                description: config.description
            });
        }

        /**
         * Create multiple components
         */
        createBatch(configs) {
            return configs.map(config => {
                if (typeof config === 'string') {
                    return this.registry.create(config);
                }
                return this.registry.create(config.name, config.props, config.options);
            });
        }

        /**
         * Create component tree
         */
        createTree(treeConfig, parentContainer = null) {
            const { component, props = {}, options = {}, children = [] } = treeConfig;
            
            // Create root component
            const rootComponent = this.registry.create(component, props, options);
            
            // Mount to container if provided
            if (parentContainer) {
                rootComponent.mount(parentContainer);
            }

            // Create and add children
            children.forEach((childConfig, index) => {
                const child = this.createTree(childConfig);
                rootComponent.addChild(child, childConfig.key || `child-${index}`);
            });

            return rootComponent;
        }

        /**
         * Register preset configuration
         */
        registerPreset(name, config) {
            this.presets.set(name, config);
        }

        /**
         * Create from preset
         */
        createFromPreset(presetName, overrides = {}) {
            const preset = this.presets.get(presetName);
            if (!preset) {
                throw new Error(`Preset ${presetName} not found`);
            }

            const mergedConfig = this._deepMerge(preset, overrides);
            
            if (mergedConfig.tree) {
                return this.createTree(mergedConfig.tree);
            }
            
            return this.registry.create(
                mergedConfig.component, 
                mergedConfig.props, 
                mergedConfig.options
            );
        }

        /**
         * Deep merge objects
         */
        _deepMerge(target, source) {
            const result = { ...target };
            
            Object.keys(source).forEach(key => {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this._deepMerge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            });

            return result;
        }
    }

    /**
     * Component Mixins
     * Reusable component behaviors
     */
    const ComponentMixins = {
        /**
         * Observable mixin - adds reactive properties
         */
        Observable: function(prototype) {
            prototype.addObservable = function(property, initialValue) {
                let value = initialValue;
                const observers = new Set();

                Object.defineProperty(this, property, {
                    get() {
                        return value;
                    },
                    set(newValue) {
                        const oldValue = value;
                        value = newValue;
                        observers.forEach(observer => observer(newValue, oldValue));
                        
                        if (this.isMounted) {
                            this.update();
                        }
                    }
                });

                this[`${property}Observers`] = observers;
                
                this[`observe${property.charAt(0).toUpperCase() + property.slice(1)}`] = 
                    (observer) => {
                        observers.add(observer);
                        return () => observers.delete(observer);
                    };
            };
        },

        /**
         * Draggable mixin - adds drag and drop functionality
         */
        Draggable: function(prototype) {
            prototype.makeDraggable = function(options = {}) {
                const { handle, onDragStart, onDrag, onDragEnd } = options;
                
                this.addLifecycleHook('mounted', () => {
                    const dragHandle = handle ? this.element.querySelector(handle) : this.element;
                    
                    if (!dragHandle) return;

                    let isDragging = false;
                    let startX, startY, startLeft, startTop;

                    dragHandle.style.cursor = 'move';
                    
                    dragHandle.addEventListener('mousedown', (e) => {
                        isDragging = true;
                        startX = e.clientX;
                        startY = e.clientY;
                        
                        const rect = this.element.getBoundingClientRect();
                        startLeft = rect.left;
                        startTop = rect.top;
                        
                        this.element.style.position = 'absolute';
                        this.element.style.zIndex = '1000';
                        
                        if (onDragStart) onDragStart(e, this);
                        
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                    });

                    const handleMouseMove = (e) => {
                        if (!isDragging) return;
                        
                        const deltaX = e.clientX - startX;
                        const deltaY = e.clientY - startY;
                        
                        this.element.style.left = (startLeft + deltaX) + 'px';
                        this.element.style.top = (startTop + deltaY) + 'px';
                        
                        if (onDrag) onDrag(e, this, { deltaX, deltaY });
                    };

                    const handleMouseUp = (e) => {
                        isDragging = false;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        
                        if (onDragEnd) onDragEnd(e, this);
                    };
                });
            };
        },

        /**
         * Resizable mixin - adds resize functionality
         */
        Resizable: function(prototype) {
            prototype.makeResizable = function(options = {}) {
                const { minWidth = 100, minHeight = 100, onResize } = options;
                
                this.addLifecycleHook('mounted', () => {
                    const resizeHandle = document.createElement('div');
                    resizeHandle.className = 'resize-handle';
                    resizeHandle.style.cssText = `
                        position: absolute;
                        right: 0;
                        bottom: 0;
                        width: 10px;
                        height: 10px;
                        cursor: se-resize;
                        background: linear-gradient(-45deg, transparent 30%, #ccc 30%, #ccc 70%, transparent 70%);
                    `;
                    
                    this.element.style.position = 'relative';
                    this.element.appendChild(resizeHandle);
                    
                    let isResizing = false;
                    
                    resizeHandle.addEventListener('mousedown', (e) => {
                        isResizing = true;
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startWidth = this.element.offsetWidth;
                        const startHeight = this.element.offsetHeight;
                        
                        const handleMouseMove = (e) => {
                            if (!isResizing) return;
                            
                            const width = Math.max(minWidth, startWidth + (e.clientX - startX));
                            const height = Math.max(minHeight, startHeight + (e.clientY - startY));
                            
                            this.element.style.width = width + 'px';
                            this.element.style.height = height + 'px';
                            
                            if (onResize) onResize({ width, height }, this);
                        };
                        
                        const handleMouseUp = () => {
                            isResizing = false;
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                        };
                        
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                    });
                });
            };
        },

        /**
         * Tooltip mixin - adds tooltip functionality
         */
        Tooltip: function(prototype) {
            prototype.addTooltip = function(text, options = {}) {
                const { position = 'top', delay = 500 } = options;
                
                this.addLifecycleHook('mounted', () => {
                    let tooltip = null;
                    let showTimeout = null;
                    
                    const showTooltip = (e) => {
                        showTimeout = setTimeout(() => {
                            tooltip = document.createElement('div');
                            tooltip.className = 'component-tooltip';
                            tooltip.textContent = text;
                            tooltip.style.cssText = `
                                position: absolute;
                                background: #333;
                                color: white;
                                padding: 4px 8px;
                                border-radius: 4px;
                                font-size: 12px;
                                pointer-events: none;
                                z-index: 10000;
                            `;
                            
                            document.body.appendChild(tooltip);
                            
                            const rect = this.element.getBoundingClientRect();
                            const tooltipRect = tooltip.getBoundingClientRect();
                            
                            let left, top;
                            switch (position) {
                                case 'top':
                                    left = rect.left + rect.width / 2 - tooltipRect.width / 2;
                                    top = rect.top - tooltipRect.height - 5;
                                    break;
                                case 'bottom':
                                    left = rect.left + rect.width / 2 - tooltipRect.width / 2;
                                    top = rect.bottom + 5;
                                    break;
                                case 'left':
                                    left = rect.left - tooltipRect.width - 5;
                                    top = rect.top + rect.height / 2 - tooltipRect.height / 2;
                                    break;
                                case 'right':
                                    left = rect.right + 5;
                                    top = rect.top + rect.height / 2 - tooltipRect.height / 2;
                                    break;
                            }
                            
                            tooltip.style.left = left + 'px';
                            tooltip.style.top = top + 'px';
                        }, delay);
                    };
                    
                    const hideTooltip = () => {
                        if (showTimeout) {
                            clearTimeout(showTimeout);
                            showTimeout = null;
                        }
                        if (tooltip) {
                            document.body.removeChild(tooltip);
                            tooltip = null;
                        }
                    };
                    
                    this.element.addEventListener('mouseenter', showTooltip);
                    this.element.addEventListener('mouseleave', hideTooltip);
                });
            };
        }
    };

    /**
     * Component Manager
     * High-level component management API
     */
    class ComponentManager {
        constructor() {
            this.registry = new ComponentRegistry();
            this.factory = new ComponentFactory(this.registry);
            this.rootComponents = new Set();
        }

        /**
         * Initialize with built-in components
         */
        init() {
            // Register mixins
            Object.keys(ComponentMixins).forEach(name => {
                this.registry.registerMixin(name, ComponentMixins[name]);
            });

            // Add default middlewares
            this.registry.addMiddleware(this._loggingMiddleware);
            this.registry.addMiddleware(this._validationMiddleware);

            console.log('Component manager initialized');
        }

        /**
         * Register component
         */
        register(name, componentClass, options) {
            return this.registry.register(name, componentClass, options);
        }

        /**
         * Create component
         */
        create(name, props, options) {
            return this.registry.create(name, props, options);
        }

        /**
         * Create and mount root component
         */
        mount(name, container, props, options) {
            const component = this.create(name, props, options);
            component.mount(container);
            this.rootComponents.add(component);
            return component;
        }

        /**
         * Cleanup all components
         */
        cleanup() {
            this.rootComponents.forEach(component => {
                component.destroy();
            });
            this.rootComponents.clear();
            this.registry.clear();
        }

        /**
         * Get registry
         */
        getRegistry() {
            return this.registry;
        }

        /**
         * Get factory
         */
        getFactory() {
            return this.factory;
        }

        /**
         * Logging middleware
         */
        _loggingMiddleware(componentName, props, options) {
            if (options.debug) {
                console.log(`Creating component: ${componentName}`, props);
            }
            return props;
        }

        /**
         * Validation middleware
         */
        _validationMiddleware(componentName, props, options) {
            // Add validation logic here
            return props;
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.ComponentRegistry = ComponentRegistry;
    window.App.ComponentFactory = ComponentFactory;
    window.App.ComponentMixins = ComponentMixins;
    window.App.ComponentManager = ComponentManager;

})(window);