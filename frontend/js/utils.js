/**
 * RepoVista - Utility Functions
 * Common utility functions and helpers used throughout the application
 */

// Ensure App namespace exists
window.App = window.App || {};

/**
 * Utility Functions Module
 * Provides common utility functions for the application
 */
App.Utils = (function() {
    'use strict';

    return {
        /**
         * Debounce function to limit the rate of function calls
         */
        debounce(func, delay) {
            let timeoutId;
            return function(...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => func.apply(this, args), delay);
            };
        },

        /**
         * Throttle function to limit function execution frequency
         */
        throttle(func, delay) {
            let lastCall = 0;
            return function(...args) {
                const now = Date.now();
                if (now - lastCall >= delay) {
                    lastCall = now;
                    return func.apply(this, args);
                }
            };
        },

        /**
         * Deep clone an object or array
         */
        deepClone(obj) {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }

            if (obj instanceof Date) {
                return new Date(obj.getTime());
            }

            if (obj instanceof Array) {
                return obj.map(item => this.deepClone(item));
            }

            if (typeof obj === 'object') {
                const clonedObj = {};
                Object.keys(obj).forEach(key => {
                    clonedObj[key] = this.deepClone(obj[key]);
                });
                return clonedObj;
            }
        },

        /**
         * Format bytes to human readable format
         */
        formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';

            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        },

        /**
         * Format date to relative time (e.g., "2 hours ago")
         */
        formatRelativeTime(date) {
            const now = new Date();
            const targetDate = new Date(date);
            const diffInSeconds = Math.floor((now - targetDate) / 1000);

            if (diffInSeconds < 60) {
                return 'just now';
            }

            const intervals = {
                year: 31536000,
                month: 2592000,
                week: 604800,
                day: 86400,
                hour: 3600,
                minute: 60
            };

            for (const [unit, seconds] of Object.entries(intervals)) {
                const interval = Math.floor(diffInSeconds / seconds);
                if (interval >= 1) {
                    return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
                }
            }

            return 'just now';
        },

        /**
         * Format date to locale string
         */
        formatDate(date, options = {}) {
            const defaultOptions = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };

            return new Date(date).toLocaleDateString('en-US', { ...defaultOptions, ...options });
        },

        /**
         * Escape HTML characters to prevent XSS
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        /**
         * Sanitize string for use in CSS selectors or IDs
         */
        sanitizeId(str) {
            return str.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '');
        },

        /**
         * Generate a random UUID v4
         */
        generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        /**
         * Copy text to clipboard
         */
        async copyToClipboard(text) {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                    return true;
                } else {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();

                    const success = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    return success;
                }
            } catch (error) {
                console.error('Failed to copy text to clipboard:', error);
                return false;
            }
        },

        /**
         * Generate Docker pull command with registry URL
         */
        async generatePullCommand(repositoryName, tagName = 'latest', registryUrl = null) {
            try {
                // Get registry URL if not provided
                if (!registryUrl) {
                    if (App.API) {
                        const config = await App.API.getRegistryConfig();
                        registryUrl = config.registry_url;
                    }
                }

                // Clean up registry URL (remove protocol and trailing slash)
                if (registryUrl) {
                    registryUrl = registryUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                }

                // Generate the pull command
                const fullImageName = registryUrl ? 
                    `${registryUrl}/${repositoryName}:${tagName}` : 
                    `${repositoryName}:${tagName}`;

                return `docker pull ${fullImageName}`;
            } catch (error) {
                console.error('Failed to generate pull command:', error);
                // Fallback to basic command
                return `docker pull ${repositoryName}:${tagName}`;
            }
        },

        /**
         * Validate email address format
         */
        isValidEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },

        /**
         * Validate URL format
         */
        isValidUrl(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        },

        /**
         * Create query string from object
         */
        createQueryString(params) {
            const searchParams = new URLSearchParams();
            Object.keys(params).forEach(key => {
                const value = params[key];
                if (value !== null && value !== undefined && value !== '') {
                    searchParams.set(key, value.toString());
                }
            });
            return searchParams.toString();
        },

        /**
         * Parse query string to object
         */
        parseQueryString(queryString = window.location.search) {
            const params = {};
            const searchParams = new URLSearchParams(queryString);
            
            for (const [key, value] of searchParams.entries()) {
                params[key] = value;
            }
            
            return params;
        },

        /**
         * Truncate text to specified length
         */
        truncateText(text, maxLength, suffix = '...') {
            if (!text || text.length <= maxLength) {
                return text;
            }
            return text.substring(0, maxLength - suffix.length) + suffix;
        },

        /**
         * Check if element is in viewport
         */
        isInViewport(element) {
            const rect = element.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        },

        /**
         * Smooth scroll to element
         */
        scrollToElement(element, options = {}) {
            const targetElement = typeof element === 'string' ? 
                document.querySelector(element) : element;

            if (targetElement) {
                const defaultOptions = {
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'nearest'
                };

                targetElement.scrollIntoView({ ...defaultOptions, ...options });
            }
        },

        /**
         * Get element position relative to document
         */
        getElementPosition(element) {
            const targetElement = typeof element === 'string' ? 
                document.querySelector(element) : element;

            if (!targetElement) return null;

            const rect = targetElement.getBoundingClientRect();
            return {
                top: rect.top + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                height: rect.height
            };
        },

        /**
         * Local storage helpers with error handling
         */
        storage: {
            set(key, value) {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                    return true;
                } catch (error) {
                    console.error('Failed to save to localStorage:', error);
                    return false;
                }
            },

            get(key, defaultValue = null) {
                try {
                    const item = localStorage.getItem(key);
                    return item ? JSON.parse(item) : defaultValue;
                } catch (error) {
                    console.error('Failed to read from localStorage:', error);
                    return defaultValue;
                }
            },

            remove(key) {
                try {
                    localStorage.removeItem(key);
                    return true;
                } catch (error) {
                    console.error('Failed to remove from localStorage:', error);
                    return false;
                }
            },

            clear() {
                try {
                    localStorage.clear();
                    return true;
                } catch (error) {
                    console.error('Failed to clear localStorage:', error);
                    return false;
                }
            }
        },

        /**
         * Performance measurement helpers
         */
        performance: {
            mark(name) {
                if (window.performance && window.performance.mark) {
                    window.performance.mark(name);
                }
            },

            measure(name, startMark, endMark = null) {
                if (window.performance && window.performance.measure) {
                    if (endMark) {
                        window.performance.measure(name, startMark, endMark);
                    } else {
                        window.performance.measure(name, startMark);
                    }
                }
            },

            getEntries() {
                return window.performance ? window.performance.getEntries() : [];
            }
        },

        /**
         * Toast notification system
         */
        toast: {
            container: null,

            // Initialize toast container
            init() {
                if (!this.container) {
                    this.container = document.createElement('div');
                    this.container.className = 'toast-container';
                    this.container.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        z-index: 10000;
                        pointer-events: none;
                    `;
                    document.body.appendChild(this.container);
                }
            },

            // Show toast notification
            show(message, type = 'info', duration = 3000) {
                this.init();

                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                
                // Base styles for all toasts
                const baseStyles = `
                    padding: 12px 16px;
                    margin-bottom: 8px;
                    border-radius: 6px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    color: white;
                    font-size: 14px;
                    line-height: 1.4;
                    max-width: 300px;
                    word-wrap: break-word;
                    opacity: 0;
                    transform: translateX(100%);
                    transition: all 0.3s ease;
                    pointer-events: auto;
                `;

                // Type-specific styles
                const typeStyles = {
                    success: 'background-color: #10b981;',
                    error: 'background-color: #ef4444;',
                    warning: 'background-color: #f59e0b;',
                    info: 'background-color: #3b82f6;'
                };

                toast.style.cssText = baseStyles + (typeStyles[type] || typeStyles.info);
                toast.textContent = message;

                this.container.appendChild(toast);

                // Animate in
                setTimeout(() => {
                    toast.style.opacity = '1';
                    toast.style.transform = 'translateX(0)';
                }, 10);

                // Auto remove
                setTimeout(() => {
                    this.remove(toast);
                }, duration);

                // Allow manual removal on click
                toast.addEventListener('click', () => this.remove(toast));

                return toast;
            },

            // Remove toast with animation
            remove(toast) {
                if (toast && toast.parentNode) {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateX(100%)';
                    setTimeout(() => {
                        if (toast.parentNode) {
                            toast.parentNode.removeChild(toast);
                        }
                    }, 300);
                }
            },

            // Convenience methods
            success(message, duration) {
                return this.show(message, 'success', duration);
            },

            error(message, duration) {
                return this.show(message, 'error', duration);
            },

            warning(message, duration) {
                return this.show(message, 'warning', duration);
            },

            info(message, duration) {
                return this.show(message, 'info', duration);
            }
        },

        /**
         * Initialize utility module
         */
        init() {
            // Initialize toast system
            this.toast.init();
            console.log('Utils module initialized');
        }
    };
})();

// Register Utils module with the application core
if (App.Core) {
    App.Core.registerModule('Utils', App.Utils);
}