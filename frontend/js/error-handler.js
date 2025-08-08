/**
 * RepoVista - Error Boundary and Global Error Handling System
 * Comprehensive error handling with recovery strategies
 */

(function(window) {
    'use strict';

    /**
     * Error types enumeration
     */
    const ErrorTypes = {
        API_ERROR: 'API_ERROR',
        RENDER_ERROR: 'RENDER_ERROR',
        EVENT_ERROR: 'EVENT_ERROR',
        NETWORK_ERROR: 'NETWORK_ERROR',
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        PERMISSION_ERROR: 'PERMISSION_ERROR',
        TIMEOUT_ERROR: 'TIMEOUT_ERROR',
        UNKNOWN_ERROR: 'UNKNOWN_ERROR'
    };

    /**
     * Error severity levels
     */
    const ErrorSeverity = {
        LOW: 'low',       // Can be ignored or logged
        MEDIUM: 'medium', // Should be handled but not critical
        HIGH: 'high',     // Must be handled, affects functionality
        CRITICAL: 'critical' // Application breaking, needs immediate attention
    };

    /**
     * ErrorBoundary Class
     * Catches and handles errors in application components
     */
    class ErrorBoundary {
        constructor(options = {}) {
            this.errors = [];
            this.maxErrors = options.maxErrors || 100;
            this.fallbackUI = options.fallbackUI || this._defaultFallbackUI;
            this.onError = options.onError || (() => {});
            this.recoveryStrategies = new Map();
            this.errorFilters = [];
            this.retryAttempts = new Map();
            this.maxRetries = options.maxRetries || 3;
            
            this._initializeDefaultStrategies();
        }

        /**
         * Wrap a function with error boundary
         */
        wrap(fn, context = null, options = {}) {
            const { 
                errorType = ErrorTypes.UNKNOWN_ERROR,
                severity = ErrorSeverity.MEDIUM,
                retry = true,
                fallback = null 
            } = options;

            return (...args) => {
                try {
                    const result = fn.apply(context || this, args);
                    
                    // Handle promises
                    if (result && typeof result.then === 'function') {
                        return result.catch(error => {
                            return this._handleError(error, {
                                type: errorType,
                                severity,
                                retry,
                                fallback,
                                context: { function: fn.name, args }
                            });
                        });
                    }
                    
                    return result;
                } catch (error) {
                    return this._handleError(error, {
                        type: errorType,
                        severity,
                        retry,
                        fallback,
                        context: { function: fn.name, args }
                    });
                }
            };
        }

        /**
         * Wrap async function with error boundary
         */
        wrapAsync(fn, context = null, options = {}) {
            const wrapped = this.wrap(fn, context, options);
            
            return async (...args) => {
                try {
                    return await wrapped(...args);
                } catch (error) {
                    // Error already handled by wrap
                    throw error;
                }
            };
        }

        /**
         * Handle error with recovery strategy
         */
        _handleError(error, options = {}) {
            const errorInfo = this._createErrorInfo(error, options);
            
            // Apply filters
            if (this._shouldFilterError(errorInfo)) {
                console.log('Error filtered:', errorInfo);
                return options.fallback ? options.fallback() : null;
            }
            
            // Log error
            this._logError(errorInfo);
            
            // Store error
            this._storeError(errorInfo);
            
            // Notify listeners
            this.onError(errorInfo);
            
            // Attempt recovery
            const recovered = this._attemptRecovery(errorInfo);
            if (recovered !== undefined) {
                return recovered;
            }
            
            // Use fallback if available
            if (options.fallback) {
                return typeof options.fallback === 'function' ? options.fallback() : options.fallback;
            }
            
            // Show fallback UI for critical errors
            if (options.severity === ErrorSeverity.CRITICAL) {
                this._showFallbackUI(errorInfo);
            }
            
            // Re-throw if no recovery
            if (options.severity === ErrorSeverity.CRITICAL && !options.fallback) {
                throw error;
            }
            
            return null;
        }

        /**
         * Create error info object
         */
        _createErrorInfo(error, options) {
            return {
                id: this._generateErrorId(),
                timestamp: Date.now(),
                error: {
                    message: error.message || 'Unknown error',
                    stack: error.stack || '',
                    name: error.name || 'Error',
                    code: error.code
                },
                type: options.type || ErrorTypes.UNKNOWN_ERROR,
                severity: options.severity || ErrorSeverity.MEDIUM,
                context: options.context || {},
                retry: options.retry !== false,
                retryCount: this.retryAttempts.get(error.message) || 0,
                userAgent: navigator.userAgent,
                url: window.location.href
            };
        }

        /**
         * Attempt to recover from error
         */
        _attemptRecovery(errorInfo) {
            const strategy = this.recoveryStrategies.get(errorInfo.type);
            
            if (strategy) {
                try {
                    return strategy(errorInfo);
                } catch (recoveryError) {
                    console.error('Recovery strategy failed:', recoveryError);
                }
            }
            
            // Generic retry logic
            if (errorInfo.retry && errorInfo.retryCount < this.maxRetries) {
                this.retryAttempts.set(errorInfo.error.message, errorInfo.retryCount + 1);
                
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, errorInfo.retryCount), 10000);
                
                return new Promise(resolve => {
                    setTimeout(() => {
                        console.log(`Retrying after ${delay}ms...`);
                        resolve(undefined); // Let the original function retry
                    }, delay);
                });
            }
            
            return undefined;
        }

        /**
         * Register recovery strategy
         */
        registerRecoveryStrategy(errorType, strategy) {
            this.recoveryStrategies.set(errorType, strategy);
        }

        /**
         * Add error filter
         */
        addErrorFilter(filter) {
            this.errorFilters.push(filter);
        }

        /**
         * Check if error should be filtered
         */
        _shouldFilterError(errorInfo) {
            return this.errorFilters.some(filter => filter(errorInfo));
        }

        /**
         * Store error for analysis
         */
        _storeError(errorInfo) {
            this.errors.push(errorInfo);
            
            // Limit stored errors
            if (this.errors.length > this.maxErrors) {
                this.errors.shift();
            }
            
            // Persist critical errors
            if (errorInfo.severity === ErrorSeverity.CRITICAL) {
                this._persistError(errorInfo);
            }
        }

        /**
         * Persist error to localStorage
         */
        _persistError(errorInfo) {
            try {
                const errors = JSON.parse(localStorage.getItem('repovista_errors') || '[]');
                errors.push({
                    ...errorInfo,
                    error: {
                        message: errorInfo.error.message,
                        name: errorInfo.error.name,
                        code: errorInfo.error.code
                    }
                });
                
                // Keep only last 10 critical errors
                if (errors.length > 10) {
                    errors.shift();
                }
                
                localStorage.setItem('repovista_errors', JSON.stringify(errors));
            } catch (e) {
                console.error('Failed to persist error:', e);
            }
        }

        /**
         * Log error with appropriate level
         */
        _logError(errorInfo) {
            const logMethod = {
                [ErrorSeverity.LOW]: 'log',
                [ErrorSeverity.MEDIUM]: 'warn',
                [ErrorSeverity.HIGH]: 'error',
                [ErrorSeverity.CRITICAL]: 'error'
            }[errorInfo.severity] || 'error';
            
            console[logMethod](`[${errorInfo.type}]`, errorInfo.error.message, errorInfo);
        }

        /**
         * Show fallback UI
         */
        _showFallbackUI(errorInfo) {
            const container = document.getElementById('error-boundary-fallback');
            if (container) {
                container.innerHTML = this.fallbackUI(errorInfo);
                container.style.display = 'block';
            }
        }

        /**
         * Default fallback UI
         */
        _defaultFallbackUI(errorInfo) {
            return `
                <div class="error-boundary-fallback">
                    <div class="error-icon">⚠️</div>
                    <h2>Something went wrong</h2>
                    <p>${this._getUserFriendlyMessage(errorInfo)}</p>
                    <div class="error-actions">
                        <button onclick="window.location.reload()" class="btn-retry">
                            Reload Page
                        </button>
                        <button onclick="this.parentElement.parentElement.style.display='none'" class="btn-dismiss">
                            Dismiss
                        </button>
                    </div>
                    <details class="error-details">
                        <summary>Technical Details</summary>
                        <pre>${errorInfo.error.message}\n${errorInfo.error.stack}</pre>
                    </details>
                </div>
            `;
        }

        /**
         * Get user-friendly error message
         */
        _getUserFriendlyMessage(errorInfo) {
            const messages = {
                [ErrorTypes.API_ERROR]: 'We encountered an issue connecting to the server. Please try again later.',
                [ErrorTypes.RENDER_ERROR]: 'We had trouble displaying this content. Please refresh the page.',
                [ErrorTypes.EVENT_ERROR]: 'An interaction error occurred. Please try again.',
                [ErrorTypes.NETWORK_ERROR]: 'Network connection issue. Please check your internet connection.',
                [ErrorTypes.VALIDATION_ERROR]: 'The provided data is invalid. Please check your input.',
                [ErrorTypes.PERMISSION_ERROR]: 'You don\'t have permission to perform this action.',
                [ErrorTypes.TIMEOUT_ERROR]: 'The operation took too long. Please try again.',
                [ErrorTypes.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.'
            };
            
            return messages[errorInfo.type] || messages[ErrorTypes.UNKNOWN_ERROR];
        }

        /**
         * Initialize default recovery strategies
         */
        _initializeDefaultStrategies() {
            // API Error recovery
            this.registerRecoveryStrategy(ErrorTypes.API_ERROR, (errorInfo) => {
                if (errorInfo.error.code === 401) {
                    // Unauthorized - might need to refresh token
                    window.App?.Events?.emit('auth:refresh');
                } else if (errorInfo.error.code === 503) {
                    // Service unavailable - show maintenance message
                    window.App?.Events?.emit('maintenance:show');
                }
            });
            
            // Network Error recovery
            this.registerRecoveryStrategy(ErrorTypes.NETWORK_ERROR, (errorInfo) => {
                // Check if we're back online
                if (navigator.onLine) {
                    return undefined; // Allow retry
                } else {
                    window.App?.Events?.emit('offline:detected');
                }
            });
            
            // Render Error recovery
            this.registerRecoveryStrategy(ErrorTypes.RENDER_ERROR, (errorInfo) => {
                // Clear problematic DOM and re-render
                const element = errorInfo.context.element;
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                    window.App?.Events?.emit('render:retry', errorInfo.context);
                }
            });
        }

        /**
         * Generate unique error ID
         */
        _generateErrorId() {
            return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        /**
         * Get error statistics
         */
        getStatistics() {
            const stats = {
                total: this.errors.length,
                byType: {},
                bySeverity: {},
                recent: this.errors.slice(-10)
            };
            
            this.errors.forEach(error => {
                stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
                stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
            });
            
            return stats;
        }

        /**
         * Clear error history
         */
        clearErrors() {
            this.errors = [];
            this.retryAttempts.clear();
            localStorage.removeItem('repovista_errors');
        }
    }

    /**
     * Global Error Handler
     * Manages application-wide error handling
     */
    class GlobalErrorHandler {
        constructor(options = {}) {
            this.errorBoundary = new ErrorBoundary(options);
            this.initialized = false;
            this.originalHandlers = {};
        }

        /**
         * Initialize global error handling
         */
        init() {
            if (this.initialized) {
                console.warn('Global error handler already initialized');
                return;
            }
            
            // Store original handlers
            this.originalHandlers.error = window.onerror;
            this.originalHandlers.unhandledrejection = window.onunhandledrejection;
            
            // Global error handler
            window.onerror = (message, source, lineno, colno, error) => {
                this.errorBoundary._handleError(error || new Error(message), {
                    type: ErrorTypes.UNKNOWN_ERROR,
                    severity: ErrorSeverity.HIGH,
                    context: { source, lineno, colno }
                });
                
                // Call original handler if exists
                if (this.originalHandlers.error) {
                    return this.originalHandlers.error(message, source, lineno, colno, error);
                }
                
                return true; // Prevent default browser error handling
            };
            
            // Unhandled promise rejection handler
            window.addEventListener('unhandledrejection', (event) => {
                this.errorBoundary._handleError(new Error(event.reason), {
                    type: ErrorTypes.API_ERROR,
                    severity: ErrorSeverity.HIGH,
                    context: { promise: event.promise }
                });
                
                // Prevent default browser handling
                event.preventDefault();
            });
            
            // Network error detection
            window.addEventListener('offline', () => {
                this.errorBoundary._handleError(new Error('Network connection lost'), {
                    type: ErrorTypes.NETWORK_ERROR,
                    severity: ErrorSeverity.MEDIUM,
                    retry: false
                });
            });
            
            window.addEventListener('online', () => {
                console.log('Network connection restored');
                window.App?.Events?.emit('online:restored');
            });
            
            this.initialized = true;
            console.log('Global error handler initialized');
        }

        /**
         * Wrap all functions in an object with error boundary
         */
        wrapObject(obj, options = {}) {
            const wrapped = {};
            
            for (const key in obj) {
                if (typeof obj[key] === 'function') {
                    wrapped[key] = this.errorBoundary.wrap(obj[key], obj, options);
                } else {
                    wrapped[key] = obj[key];
                }
            }
            
            return wrapped;
        }

        /**
         * Create safe event handler
         */
        safeEventHandler(handler, options = {}) {
            return this.errorBoundary.wrap(handler, null, {
                ...options,
                type: ErrorTypes.EVENT_ERROR
            });
        }

        /**
         * Create safe API call wrapper
         */
        safeApiCall(apiFunction, options = {}) {
            return this.errorBoundary.wrapAsync(apiFunction, null, {
                ...options,
                type: ErrorTypes.API_ERROR
            });
        }

        /**
         * Create safe render function
         */
        safeRender(renderFunction, options = {}) {
            return this.errorBoundary.wrap(renderFunction, null, {
                ...options,
                type: ErrorTypes.RENDER_ERROR
            });
        }

        /**
         * Get error boundary instance
         */
        getErrorBoundary() {
            return this.errorBoundary;
        }

        /**
         * Clean up global error handling
         */
        cleanup() {
            if (this.originalHandlers.error) {
                window.onerror = this.originalHandlers.error;
            }
            
            this.initialized = false;
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.ErrorTypes = ErrorTypes;
    window.App.ErrorSeverity = ErrorSeverity;
    window.App.ErrorBoundary = ErrorBoundary;
    window.App.GlobalErrorHandler = GlobalErrorHandler;

})(window);