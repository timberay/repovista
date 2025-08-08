/**
 * RepoVista - API Communication Module
 * Handles HTTP requests to the backend API with error handling and caching
 */

// Ensure App namespace exists
window.App = window.App || {};

/**
 * API Module
 * Provides methods for communicating with the RepoVista backend API
 */
App.API = (function() {
    'use strict';

    // API configuration
    let apiConfig = {
        baseUrl: '/api',
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000
    };

    /**
     * HTTP Client with retry logic and error handling
     */
    const httpClient = {
        async request(url, options = {}) {
            const config = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), apiConfig.timeout);

            try {
                const response = await fetch(url, {
                    ...config,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                } else {
                    return await response.text();
                }
            } catch (error) {
                clearTimeout(timeoutId);

                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${apiConfig.timeout}ms`);
                }

                throw error;
            }
        },

        async requestWithRetry(url, options = {}, attempt = 1) {
            try {
                return await this.request(url, options);
            } catch (error) {
                if (attempt < apiConfig.retryAttempts) {
                    console.warn(`Request failed (attempt ${attempt}/${apiConfig.retryAttempts}):`, error.message);
                    await this.delay(apiConfig.retryDelay * attempt);
                    return this.requestWithRetry(url, options, attempt + 1);
                }
                throw error;
            }
        },

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };

    // Debounce utility for search operations
    const debounceTimers = new Map();
    
    function debounce(key, fn, delay = 300) {
        return function(...args) {
            // Cancel previous timer for this key
            if (debounceTimers.has(key)) {
                clearTimeout(debounceTimers.get(key));
            }
            
            // Set new timer
            return new Promise((resolve, reject) => {
                const timerId = setTimeout(async () => {
                    try {
                        const result = await fn.apply(this, args);
                        debounceTimers.delete(key);
                        resolve(result);
                    } catch (error) {
                        debounceTimers.delete(key);
                        reject(error);
                    }
                }, delay);
                
                debounceTimers.set(key, timerId);
            });
        };
    }

    return {
        /**
         * Configure API settings
         */
        configure(config) {
            apiConfig = { ...apiConfig, ...config };
        },

        /**
         * Get list of repositories with pagination and filtering
         */
        async getRepositories(params = {}) {
            const queryParams = new URLSearchParams();
            
            // Add pagination parameters
            if (params.page) queryParams.set('page', params.page);
            if (params.limit) queryParams.set('limit', params.limit);
            if (params.offset) queryParams.set('offset', params.offset);
            
            // Add filtering parameters
            if (params.search) queryParams.set('search', params.search);
            if (params.sort) queryParams.set('sort', params.sort);
            if (params.order) queryParams.set('order', params.order);

            const url = `${apiConfig.baseUrl}/repositories?${queryParams.toString()}`;
            
            try {
                const cacheKey = `repositories:${queryParams.toString()}`;
                const cached = App.State ? App.State.getCache(cacheKey) : null;
                
                if (cached) {
                    return cached;
                }

                const data = await httpClient.requestWithRetry(url);
                
                // Cache the response if State module is available
                if (App.State) {
                    App.State.setCache(cacheKey, data, 300000); // 5 minutes
                }

                return data;
            } catch (error) {
                console.error('Failed to fetch repositories:', error);
                throw new Error(`Failed to load repositories: ${error.message}`);
            }
        },

        /**
         * Get tags for a specific repository
         */
        async getRepositoryTags(repositoryName, params = {}) {
            if (!repositoryName) {
                throw new Error('Repository name is required');
            }

            const queryParams = new URLSearchParams();
            if (params.page) queryParams.set('page', params.page);
            if (params.limit) queryParams.set('limit', params.limit);

            const encodedName = encodeURIComponent(repositoryName);
            const url = `${apiConfig.baseUrl}/repositories/${encodedName}/tags?${queryParams.toString()}`;
            
            try {
                const cacheKey = `tags:${repositoryName}:${queryParams.toString()}`;
                const cached = App.State ? App.State.getCache(cacheKey) : null;
                
                if (cached) {
                    return cached;
                }

                const data = await httpClient.requestWithRetry(url);
                
                // Cache the response
                if (App.State) {
                    App.State.setCache(cacheKey, data, 180000); // 3 minutes
                }

                return data;
            } catch (error) {
                console.error(`Failed to fetch tags for ${repositoryName}:`, error);
                throw new Error(`Failed to load tags: ${error.message}`);
            }
        },

        /**
         * Get repository manifest/details
         */
        async getRepositoryManifest(repositoryName, tag = 'latest') {
            if (!repositoryName) {
                throw new Error('Repository name is required');
            }

            const encodedName = encodeURIComponent(repositoryName);
            const encodedTag = encodeURIComponent(tag);
            const url = `${apiConfig.baseUrl}/repositories/${encodedName}/manifests/${encodedTag}`;
            
            try {
                const cacheKey = `manifest:${repositoryName}:${tag}`;
                const cached = App.State ? App.State.getCache(cacheKey) : null;
                
                if (cached) {
                    return cached;
                }

                const data = await httpClient.requestWithRetry(url);
                
                // Cache the response
                if (App.State) {
                    App.State.setCache(cacheKey, data, 600000); // 10 minutes (manifests don't change often)
                }

                return data;
            } catch (error) {
                console.error(`Failed to fetch manifest for ${repositoryName}:${tag}:`, error);
                throw new Error(`Failed to load repository manifest: ${error.message}`);
            }
        },

        /**
         * Search repositories by name or other criteria
         */
        async searchRepositories(query, params = {}) {
            if (!query || query.trim() === '') {
                return this.getRepositories(params);
            }

            const searchParams = {
                ...params,
                search: query.trim()
            };

            return this.getRepositories(searchParams);
        },

        /**
         * Debounced search repositories - optimized for real-time search input
         */
        searchRepositoriesDebounced: null, // Will be initialized with debounce function

        /**
         * Get API health/status
         */
        async getHealth() {
            const url = `${apiConfig.baseUrl}/health`;
            
            try {
                return await httpClient.request(url);
            } catch (error) {
                console.error('Health check failed:', error);
                throw new Error(`API health check failed: ${error.message}`);
            }
        },

        /**
         * Clear API cache
         */
        clearCache(pattern = null) {
            if (App.State) {
                App.State.clearCache(pattern);
            }
        },

        /**
         * Cancel pending debounced requests
         */
        cancelDebouncedRequests() {
            debounceTimers.forEach((timerId, key) => {
                clearTimeout(timerId);
            });
            debounceTimers.clear();
        },

        /**
         * Get current API configuration
         */
        getConfig() {
            return { ...apiConfig };
        },

        /**
         * Initialize API module
         */
        init() {
            // Initialize debounced search method
            this.searchRepositoriesDebounced = debounce('search', this.searchRepositories.bind(this), 300);

            // Configure based on app configuration
            if (App.Core) {
                const appConfig = App.Core.getConfig();
                if (appConfig.apiUrl) {
                    this.configure({ baseUrl: appConfig.apiUrl });
                }
            }

            // Listen for network events
            if (App.Events) {
                // Clear cache on network reconnection
                window.addEventListener('online', () => {
                    console.log('Network reconnected, clearing cache');
                    this.clearCache();
                    App.Events.emit('api:network-reconnected');
                });

                window.addEventListener('offline', () => {
                    console.log('Network disconnected');
                    App.Events.emit('api:network-disconnected');
                });
            }

            console.log('API module initialized');
        }
    };
})();

// Register API module with the application core
if (App.Core) {
    App.Core.registerModule('API', App.API, ['State', 'Events']);
}