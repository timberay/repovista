/**
 * RepoVista - Advanced Render Engine
 * Virtual DOM-inspired rendering with efficient updates and template literals
 */

(function(window) {
    'use strict';

    /**
     * Virtual Node representation
     */
    class VNode {
        constructor(type, props = {}, children = []) {
            this.type = type;
            this.props = props;
            this.children = children;
            this.key = props.key || null;
            this.ref = props.ref || null;
        }

        static text(content) {
            return new VNode('TEXT', { content }, []);
        }

        static element(type, props, children) {
            return new VNode(type, props, children);
        }

        static component(component, props) {
            return new VNode(component, props, []);
        }
    }

    /**
     * DOM Diff Algorithm
     * Efficiently calculates minimal DOM updates
     */
    class DOMDiff {
        /**
         * Diff two virtual trees
         */
        static diff(oldVNode, newVNode) {
            const patches = [];
            this._diffNode(oldVNode, newVNode, patches, []);
            return patches;
        }

        static _diffNode(oldNode, newNode, patches, path) {
            // If nodes are identical, no patch needed
            if (oldNode === newNode) return;

            // Handle null cases
            if (!oldNode) {
                patches.push({ type: 'CREATE', path, node: newNode });
                return;
            }

            if (!newNode) {
                patches.push({ type: 'REMOVE', path });
                return;
            }

            // Handle text nodes
            if (oldNode.type === 'TEXT' && newNode.type === 'TEXT') {
                if (oldNode.props.content !== newNode.props.content) {
                    patches.push({ 
                        type: 'TEXT', 
                        path, 
                        content: newNode.props.content 
                    });
                }
                return;
            }

            // Handle different types
            if (oldNode.type !== newNode.type) {
                patches.push({ type: 'REPLACE', path, node: newNode });
                return;
            }

            // Diff props
            this._diffProps(oldNode.props, newNode.props, patches, path);

            // Diff children
            this._diffChildren(oldNode.children, newNode.children, patches, path);
        }

        static _diffProps(oldProps, newProps, patches, path) {
            const allProps = new Set([
                ...Object.keys(oldProps || {}),
                ...Object.keys(newProps || {})
            ]);

            const propsPatch = {};
            let hasChanges = false;

            allProps.forEach(prop => {
                if (prop === 'key' || prop === 'ref' || prop === 'children') return;

                const oldValue = oldProps[prop];
                const newValue = newProps[prop];

                if (oldValue !== newValue) {
                    propsPatch[prop] = newValue;
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                patches.push({ type: 'PROPS', path, props: propsPatch });
            }
        }

        static _diffChildren(oldChildren, newChildren, patches, path) {
            const oldKeyed = this._getKeyedChildren(oldChildren);
            const newKeyed = this._getKeyedChildren(newChildren);

            // Handle keyed children
            if (oldKeyed.size > 0 || newKeyed.size > 0) {
                this._diffKeyedChildren(oldChildren, newChildren, patches, path);
            } else {
                // Simple diff for non-keyed children
                const maxLength = Math.max(oldChildren.length, newChildren.length);
                for (let i = 0; i < maxLength; i++) {
                    this._diffNode(
                        oldChildren[i], 
                        newChildren[i], 
                        patches, 
                        [...path, i]
                    );
                }
            }
        }

        static _diffKeyedChildren(oldChildren, newChildren, patches, path) {
            const oldKeyed = this._getKeyedChildren(oldChildren);
            const newKeyed = this._getKeyedChildren(newChildren);

            // Track moves
            const moves = [];
            
            newChildren.forEach((newChild, newIndex) => {
                if (newChild.key) {
                    const oldIndex = oldKeyed.get(newChild.key);
                    if (oldIndex !== undefined && oldIndex !== newIndex) {
                        moves.push({ 
                            from: oldIndex, 
                            to: newIndex, 
                            key: newChild.key 
                        });
                    }
                }
            });

            if (moves.length > 0) {
                patches.push({ type: 'REORDER', path, moves });
            }

            // Diff individual children
            newChildren.forEach((newChild, index) => {
                const oldChild = newChild.key 
                    ? oldChildren[oldKeyed.get(newChild.key)]
                    : oldChildren[index];
                
                this._diffNode(oldChild, newChild, patches, [...path, index]);
            });

            // Remove old children not in new list
            oldChildren.forEach((oldChild, index) => {
                if (oldChild.key && !newKeyed.has(oldChild.key)) {
                    patches.push({ type: 'REMOVE', path: [...path, index] });
                }
            });
        }

        static _getKeyedChildren(children) {
            const keyed = new Map();
            children.forEach((child, index) => {
                if (child && child.key) {
                    keyed.set(child.key, index);
                }
            });
            return keyed;
        }
    }

    /**
     * Patch Applicator
     * Applies calculated patches to actual DOM
     */
    class PatchApplicator {
        static apply(rootElement, patches) {
            // Sort patches by path depth (deepest first for removals)
            const sortedPatches = patches.sort((a, b) => {
                if (a.type === 'REMOVE' && b.type !== 'REMOVE') return -1;
                if (a.type !== 'REMOVE' && b.type === 'REMOVE') return 1;
                return b.path.length - a.path.length;
            });

            sortedPatches.forEach(patch => {
                this._applyPatch(rootElement, patch);
            });
        }

        static _applyPatch(rootElement, patch) {
            const element = this._getElementByPath(rootElement, patch.path);

            switch (patch.type) {
                case 'CREATE':
                    const newElement = this._createElement(patch.node);
                    if (patch.path.length === 0) {
                        rootElement.replaceWith(newElement);
                    } else {
                        const parent = this._getElementByPath(
                            rootElement, 
                            patch.path.slice(0, -1)
                        );
                        parent.appendChild(newElement);
                    }
                    break;

                case 'REMOVE':
                    if (element && element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                    break;

                case 'REPLACE':
                    const replacement = this._createElement(patch.node);
                    if (element && element.parentNode) {
                        element.parentNode.replaceChild(replacement, element);
                    }
                    break;

                case 'TEXT':
                    if (element) {
                        element.textContent = patch.content;
                    }
                    break;

                case 'PROPS':
                    if (element) {
                        this._updateProps(element, patch.props);
                    }
                    break;

                case 'REORDER':
                    if (element) {
                        this._reorderChildren(element, patch.moves);
                    }
                    break;
            }
        }

        static _getElementByPath(rootElement, path) {
            let element = rootElement;
            for (const index of path) {
                element = element?.childNodes[index];
                if (!element) break;
            }
            return element;
        }

        static _createElement(vnode) {
            if (vnode.type === 'TEXT') {
                return document.createTextNode(vnode.props.content);
            }

            const element = document.createElement(vnode.type);
            
            // Set properties
            Object.keys(vnode.props).forEach(prop => {
                if (prop === 'key' || prop === 'ref' || prop === 'children') return;
                
                if (prop === 'className') {
                    element.className = vnode.props[prop];
                } else if (prop.startsWith('on')) {
                    const event = prop.slice(2).toLowerCase();
                    element.addEventListener(event, vnode.props[prop]);
                } else if (prop === 'style' && typeof vnode.props[prop] === 'object') {
                    Object.assign(element.style, vnode.props[prop]);
                } else if (prop in element) {
                    element[prop] = vnode.props[prop];
                } else {
                    element.setAttribute(prop, vnode.props[prop]);
                }
            });

            // Add children
            vnode.children.forEach(child => {
                if (child) {
                    element.appendChild(this._createElement(child));
                }
            });

            // Handle ref
            if (vnode.ref) {
                vnode.ref.current = element;
            }

            return element;
        }

        static _updateProps(element, props) {
            Object.keys(props).forEach(prop => {
                const value = props[prop];
                
                if (value === null || value === undefined) {
                    element.removeAttribute(prop);
                } else if (prop === 'className') {
                    element.className = value;
                } else if (prop.startsWith('on')) {
                    // Skip event handlers in patches (handle separately)
                } else if (prop === 'style' && typeof value === 'object') {
                    Object.assign(element.style, value);
                } else if (prop in element) {
                    element[prop] = value;
                } else {
                    element.setAttribute(prop, value);
                }
            });
        }

        static _reorderChildren(element, moves) {
            const children = Array.from(element.childNodes);
            
            moves.forEach(move => {
                const child = children[move.from];
                const referenceChild = children[move.to];
                
                if (child && referenceChild && child !== referenceChild) {
                    element.insertBefore(child, referenceChild);
                }
            });
        }
    }

    /**
     * Template Engine
     * Template literal based component rendering
     */
    class TemplateEngine {
        constructor() {
            this.templates = new Map();
            this.cache = new Map();
        }

        /**
         * Register a template
         */
        register(name, templateFn) {
            this.templates.set(name, templateFn);
        }

        /**
         * Render a template
         */
        render(name, data) {
            const template = this.templates.get(name);
            if (!template) {
                throw new Error(`Template "${name}" not found`);
            }

            const cacheKey = `${name}_${JSON.stringify(data)}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const result = template(data);
            this.cache.set(cacheKey, result);
            
            // Limit cache size
            if (this.cache.size > 100) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }

            return result;
        }

        /**
         * HTML template tag for safe rendering
         */
        static html(strings, ...values) {
            let result = '';
            
            strings.forEach((string, i) => {
                result += string;
                
                if (i < values.length) {
                    const value = values[i];
                    
                    if (Array.isArray(value)) {
                        result += value.join('');
                    } else if (value != null) {
                        result += TemplateEngine.escape(value);
                    }
                }
            });
            
            return result;
        }

        /**
         * Escape HTML for safe rendering
         */
        static escape(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * Clear template cache
         */
        clearCache() {
            this.cache.clear();
        }
    }

    /**
     * Render Queue
     * Batches render updates for performance
     */
    class RenderQueue {
        constructor() {
            this.queue = [];
            this.isProcessing = false;
            this.rafId = null;
        }

        /**
         * Add render task to queue
         */
        enqueue(task, priority = 0) {
            // Use global RenderScheduler if available for better performance
            if (App.RenderScheduler) {
                App.RenderScheduler.schedule(task, null, priority);
            } else {
                this.queue.push({ task, priority, timestamp: Date.now() });
                
                // Sort by priority (higher first)
                this.queue.sort((a, b) => b.priority - a.priority);
                
                this._scheduleFlush();
            }
        }

        /**
         * Schedule queue flush
         */
        _scheduleFlush() {
            if (this.rafId || this.isProcessing) return;
            
            this.rafId = requestAnimationFrame(() => {
                this.rafId = null;
                this._flush();
            });
        }

        /**
         * Process all queued renders
         */
        _flush() {
            if (this.isProcessing || this.queue.length === 0) return;
            
            this.isProcessing = true;
            const startTime = performance.now();
            const maxTime = 16; // Target 60fps
            
            while (this.queue.length > 0) {
                const { task } = this.queue.shift();
                
                try {
                    task();
                } catch (error) {
                    console.error('Render task error:', error);
                }
                
                // Yield if taking too long
                if (performance.now() - startTime > maxTime && this.queue.length > 0) {
                    this._scheduleFlush();
                    break;
                }
            }
            
            this.isProcessing = false;
        }

        /**
         * Clear the queue
         */
        clear() {
            this.queue = [];
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
        }
    }

    /**
     * Main Render Engine
     */
    class RenderEngine {
        constructor() {
            this.vdom = new Map(); // Virtual DOM cache
            this.templates = new TemplateEngine();
            this.queue = new RenderQueue();
            this.components = new Map();
            this.refs = new Map();
        }

        /**
         * Register a component
         */
        registerComponent(name, component) {
            this.components.set(name, component);
        }

        /**
         * Render with virtual DOM diffing
         */
        render(container, vnode, options = {}) {
            const containerEl = typeof container === 'string' 
                ? document.querySelector(container) 
                : container;

            if (!containerEl) {
                throw new Error(`Container not found: ${container}`);
            }

            const { immediate = false } = options;

            const renderTask = () => {
                const oldVNode = this.vdom.get(containerEl);
                
                if (oldVNode) {
                    // Diff and patch
                    const patches = DOMDiff.diff(oldVNode, vnode);
                    PatchApplicator.apply(containerEl, patches);
                } else {
                    // Initial render
                    const element = this._createDOMElement(vnode);
                    containerEl.innerHTML = '';
                    containerEl.appendChild(element);
                }
                
                this.vdom.set(containerEl, vnode);
            };

            if (immediate) {
                renderTask();
            } else {
                this.queue.enqueue(renderTask, options.priority || 0);
            }
        }

        /**
         * Create DOM element from VNode
         */
        _createDOMElement(vnode) {
            if (!vnode) return null;

            if (vnode.type === 'TEXT') {
                return document.createTextNode(vnode.props.content);
            }

            if (typeof vnode.type === 'function') {
                // Component
                const component = vnode.type;
                const rendered = component(vnode.props);
                return this._createDOMElement(rendered);
            }

            const element = document.createElement(vnode.type);

            // Set properties
            Object.keys(vnode.props).forEach(prop => {
                if (prop === 'key' || prop === 'ref' || prop === 'children') return;

                if (prop === 'className') {
                    element.className = vnode.props[prop];
                } else if (prop.startsWith('on')) {
                    const event = prop.slice(2).toLowerCase();
                    element.addEventListener(event, vnode.props[prop]);
                } else if (prop === 'style' && typeof vnode.props[prop] === 'object') {
                    Object.assign(element.style, vnode.props[prop]);
                } else if (prop === 'dangerouslySetInnerHTML') {
                    element.innerHTML = vnode.props[prop];
                } else if (prop in element) {
                    element[prop] = vnode.props[prop];
                } else {
                    element.setAttribute(prop, vnode.props[prop]);
                }
            });

            // Add children
            vnode.children.forEach(child => {
                const childElement = this._createDOMElement(child);
                if (childElement) {
                    element.appendChild(childElement);
                }
            });

            // Handle ref
            if (vnode.ref) {
                this.refs.set(vnode.ref, element);
            }

            return element;
        }

        /**
         * Helper to create VNodes with JSX-like syntax
         */
        h(type, props, ...children) {
            return new VNode(type, props || {}, children.flat());
        }

        /**
         * Create text VNode
         */
        text(content) {
            return VNode.text(content);
        }

        /**
         * Batch multiple renders
         */
        batchRender(renders) {
            renders.forEach(({ container, vnode, options }) => {
                this.render(container, vnode, options);
            });
        }

        /**
         * Force immediate render flush
         */
        flush() {
            this.queue._flush();
        }

        /**
         * Clear all caches
         */
        clearCache() {
            this.vdom.clear();
            this.templates.clearCache();
            this.refs.clear();
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.VNode = VNode;
    window.App.DOMDiff = DOMDiff;
    window.App.TemplateEngine = TemplateEngine;
    window.App.RenderQueue = RenderQueue;
    window.App.RenderEngine = RenderEngine;

    // Export convenience functions
    window.App.h = (type, props, ...children) => 
        new VNode(type, props || {}, children.flat());
    window.App.html = TemplateEngine.html;

})(window);