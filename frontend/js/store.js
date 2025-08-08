/**
 * RepoVista - Enhanced State Management Store
 * Implements immutable state management with Observer pattern
 */

(function(window) {
    'use strict';

    /**
     * Store Class
     * Central state management with immutability and persistence
     */
    class Store {
        constructor(initialState = {}, options = {}) {
            this._state = this._deepFreeze(this._deepClone(initialState));
            this._observers = new Map();
            this._middleware = [];
            this._history = [];
            this._historyIndex = -1;
            this._maxHistorySize = options.maxHistorySize || 50;
            this._persistKey = options.persistKey || 'repovista_state';
            this._enablePersistence = options.enablePersistence || false;
            this._enableDevTools = options.enableDevTools || false;

            // Load persisted state if enabled
            if (this._enablePersistence) {
                this._loadPersistedState();
            }

            // Connect to Redux DevTools if available and enabled
            if (this._enableDevTools && window.__REDUX_DEVTOOLS_EXTENSION__) {
                this._connectDevTools();
            }

            // Save initial state to history
            this._saveToHistory(this._state);
        }

        /**
         * Get current state or specific property
         */
        getState(path = null) {
            if (!path) {
                return this._deepClone(this._state);
            }

            const value = this._getValueByPath(this._state, path);
            return this._deepClone(value);
        }

        /**
         * Update state immutably
         */
        setState(updater, actionName = 'SET_STATE') {
            const prevState = this._state;
            let newState;

            if (typeof updater === 'function') {
                // Updater function pattern
                const draft = this._deepClone(prevState);
                updater(draft);
                newState = draft;
            } else {
                // Direct update object pattern
                newState = this._deepMerge(prevState, updater);
            }

            // Ensure immutability
            newState = this._deepFreeze(this._deepClone(newState));

            // Apply middleware
            for (const middleware of this._middleware) {
                const result = middleware(actionName, prevState, newState);
                if (result === false) {
                    return; // Middleware cancelled the update
                }
                if (result && typeof result === 'object') {
                    newState = this._deepFreeze(result);
                }
            }

            // Update state
            this._state = newState;

            // Save to history
            this._saveToHistory(newState, actionName);

            // Persist if enabled
            if (this._enablePersistence) {
                this._persistState();
            }

            // Notify observers
            this._notifyObservers(prevState, newState, actionName);

            // Update DevTools
            if (this._devTools) {
                this._devTools.send(actionName, newState);
            }
        }

        /**
         * Subscribe to state changes
         */
        subscribe(observer, filter = null) {
            if (typeof observer !== 'function') {
                throw new TypeError('Observer must be a function');
            }

            const id = Symbol('observer');
            this._observers.set(id, { callback: observer, filter });

            // Return unsubscribe function
            return () => {
                this._observers.delete(id);
            };
        }

        /**
         * Add middleware for state updates
         */
        use(middleware) {
            if (typeof middleware !== 'function') {
                throw new TypeError('Middleware must be a function');
            }
            this._middleware.push(middleware);
        }

        /**
         * Create a computed property
         */
        computed(name, selector, dependencies = []) {
            let cachedValue;
            let cachedDeps = [];

            const computeValue = () => {
                const currentDeps = dependencies.map(dep => 
                    this._getValueByPath(this._state, dep)
                );

                const depsChanged = !this._arrayEquals(currentDeps, cachedDeps);
                
                if (depsChanged) {
                    cachedDeps = currentDeps;
                    cachedValue = selector(this._state);
                }

                return cachedValue;
            };

            // Define getter on store
            Object.defineProperty(this, name, {
                get: computeValue,
                enumerable: true,
                configurable: true
            });

            return computeValue;
        }

        /**
         * Time travel - undo
         */
        undo() {
            if (this._historyIndex > 0) {
                this._historyIndex--;
                const historicState = this._history[this._historyIndex];
                this._state = this._deepFreeze(this._deepClone(historicState.state));
                this._notifyObservers(null, this._state, 'UNDO');
                
                if (this._devTools) {
                    this._devTools.send('UNDO', this._state);
                }
            }
        }

        /**
         * Time travel - redo
         */
        redo() {
            if (this._historyIndex < this._history.length - 1) {
                this._historyIndex++;
                const historicState = this._history[this._historyIndex];
                this._state = this._deepFreeze(this._deepClone(historicState.state));
                this._notifyObservers(null, this._state, 'REDO');
                
                if (this._devTools) {
                    this._devTools.send('REDO', this._state);
                }
            }
        }

        /**
         * Reset state to initial
         */
        reset() {
            if (this._history.length > 0) {
                const initialState = this._history[0];
                this._state = this._deepFreeze(this._deepClone(initialState.state));
                this._history = [initialState];
                this._historyIndex = 0;
                this._notifyObservers(null, this._state, 'RESET');
                
                if (this._devTools) {
                    this._devTools.send('RESET', this._state);
                }
            }
        }

        /**
         * Create a scoped store for specific state slice
         */
        createScope(path) {
            const scopedStore = {
                getState: () => this.getState(path),
                setState: (updater, actionName) => {
                    this.setState(state => {
                        const current = this._getValueByPath(state, path);
                        const updated = typeof updater === 'function' 
                            ? updater(current) 
                            : { ...current, ...updater };
                        this._setValueByPath(state, path, updated);
                    }, actionName);
                },
                subscribe: (observer) => {
                    return this.subscribe((prevState, newState) => {
                        const prevValue = this._getValueByPath(prevState, path);
                        const newValue = this._getValueByPath(newState, path);
                        if (!this._deepEquals(prevValue, newValue)) {
                            observer(prevValue, newValue);
                        }
                    });
                }
            };

            return scopedStore;
        }

        // Private methods

        _notifyObservers(prevState, newState, actionName) {
            this._observers.forEach(({ callback, filter }) => {
                let shouldNotify = true;

                if (filter) {
                    if (typeof filter === 'string') {
                        // Path filter
                        const prevValue = prevState ? this._getValueByPath(prevState, filter) : undefined;
                        const newValue = this._getValueByPath(newState, filter);
                        shouldNotify = !this._deepEquals(prevValue, newValue);
                    } else if (typeof filter === 'function') {
                        // Custom filter function
                        shouldNotify = filter(prevState, newState, actionName);
                    }
                }

                if (shouldNotify) {
                    try {
                        callback(prevState, newState, actionName);
                    } catch (error) {
                        console.error('Observer error:', error);
                    }
                }
            });
        }

        _saveToHistory(state, actionName = 'INIT') {
            // Remove future history if we're not at the end
            if (this._historyIndex < this._history.length - 1) {
                this._history = this._history.slice(0, this._historyIndex + 1);
            }

            // Add new state to history
            this._history.push({
                state: this._deepClone(state),
                action: actionName,
                timestamp: Date.now()
            });

            // Limit history size
            if (this._history.length > this._maxHistorySize) {
                this._history.shift();
            } else {
                this._historyIndex++;
            }
        }

        _persistState() {
            try {
                const serialized = JSON.stringify({
                    state: this._state,
                    timestamp: Date.now()
                });
                localStorage.setItem(this._persistKey, serialized);
            } catch (error) {
                console.error('Failed to persist state:', error);
            }
        }

        _loadPersistedState() {
            try {
                const serialized = localStorage.getItem(this._persistKey);
                if (serialized) {
                    const { state, timestamp } = JSON.parse(serialized);
                    const age = Date.now() - timestamp;
                    
                    // Only load if less than 24 hours old
                    if (age < 24 * 60 * 60 * 1000) {
                        this._state = this._deepFreeze(state);
                        this._saveToHistory(this._state, 'LOAD_PERSISTED');
                    } else {
                        localStorage.removeItem(this._persistKey);
                    }
                }
            } catch (error) {
                console.error('Failed to load persisted state:', error);
                localStorage.removeItem(this._persistKey);
            }
        }

        _connectDevTools() {
            this._devTools = window.__REDUX_DEVTOOLS_EXTENSION__.connect({
                name: 'RepoVista Store',
                features: {
                    pause: true,
                    lock: true,
                    persist: true,
                    export: true,
                    import: 'custom',
                    jump: true,
                    skip: false,
                    reorder: false,
                    dispatch: true,
                    test: false
                }
            });

            this._devTools.init(this._state);

            // Subscribe to DevTools actions
            this._devTools.subscribe((message) => {
                if (message.type === 'DISPATCH') {
                    switch (message.payload.type) {
                        case 'JUMP_TO_ACTION':
                        case 'JUMP_TO_STATE':
                            this._historyIndex = message.payload.actionId;
                            this._state = this._deepFreeze(
                                this._deepClone(this._history[this._historyIndex].state)
                            );
                            this._notifyObservers(null, this._state, 'DEVTOOLS_JUMP');
                            break;
                    }
                }
            });
        }

        // Utility methods

        _deepClone(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return new Date(obj);
            if (obj instanceof Array) return obj.map(item => this._deepClone(item));
            if (obj instanceof Set) return new Set(Array.from(obj).map(item => this._deepClone(item)));
            if (obj instanceof Map) {
                const cloned = new Map();
                obj.forEach((value, key) => {
                    cloned.set(key, this._deepClone(value));
                });
                return cloned;
            }

            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this._deepClone(obj[key]);
                }
            }
            return cloned;
        }

        _deepFreeze(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            
            Object.freeze(obj);
            Object.getOwnPropertyNames(obj).forEach(prop => {
                if (obj[prop] !== null && typeof obj[prop] === 'object') {
                    this._deepFreeze(obj[prop]);
                }
            });

            return obj;
        }

        _deepMerge(target, source) {
            const result = this._deepClone(target);

            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        result[key] = result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
                            ? this._deepMerge(result[key], source[key])
                            : source[key];
                    } else {
                        result[key] = source[key];
                    }
                }
            }

            return result;
        }

        _deepEquals(a, b) {
            if (a === b) return true;
            if (a === null || b === null) return false;
            if (typeof a !== typeof b) return false;
            
            if (typeof a !== 'object') return a === b;
            
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            
            if (Array.isArray(a)) {
                if (a.length !== b.length) return false;
                return a.every((item, index) => this._deepEquals(item, b[index]));
            }
            
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            
            if (keysA.length !== keysB.length) return false;
            
            return keysA.every(key => this._deepEquals(a[key], b[key]));
        }

        _arrayEquals(a, b) {
            if (a.length !== b.length) return false;
            return a.every((item, index) => this._deepEquals(item, b[index]));
        }

        _getValueByPath(obj, path) {
            if (!path) return obj;
            
            const keys = path.split('.');
            let current = obj;
            
            for (const key of keys) {
                if (current === null || current === undefined) {
                    return undefined;
                }
                current = current[key];
            }
            
            return current;
        }

        _setValueByPath(obj, path, value) {
            const keys = path.split('.');
            const lastKey = keys.pop();
            let current = obj;
            
            for (const key of keys) {
                if (!current[key]) {
                    current[key] = {};
                }
                current = current[key];
            }
            
            current[lastKey] = value;
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.Store = Store;

})(window);