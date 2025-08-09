/**
 * Sort Utilities Module
 * Handles client-side sorting for repositories and tags
 */

window.App = window.App || {};
App.SortUtils = (function() {
    'use strict';

    /**
     * Sort functions for different data types
     */
    const sortFunctions = {
        /**
         * Sort repositories by name
         * @param {Array} repositories - Array of repository objects
         * @param {string} direction - 'asc' or 'desc'
         * @returns {Array} Sorted array
         */
        sortByName: function(repositories, direction = 'asc') {
            return repositories.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                
                if (direction === 'desc') {
                    return nameB.localeCompare(nameA);
                }
                return nameA.localeCompare(nameB);
            });
        },

        /**
         * Sort repositories by date (last updated or created)
         * @param {Array} repositories - Array of repository objects
         * @param {string} direction - 'asc' or 'desc'
         * @returns {Array} Sorted array
         */
        sortByDate: function(repositories, direction = 'asc') {
            return repositories.sort((a, b) => {
                // Try last_updated first, fall back to created_at, then to current date
                const dateA = new Date(a.last_updated || a.created_at || a.updated_at || Date.now());
                const dateB = new Date(b.last_updated || b.created_at || b.updated_at || Date.now());
                
                if (direction === 'desc') {
                    return dateB.getTime() - dateA.getTime();
                }
                return dateA.getTime() - dateB.getTime();
            });
        },

        /**
         * Sort repositories by tag count
         * @param {Array} repositories - Array of repository objects
         * @param {string} direction - 'asc' or 'desc'
         * @returns {Array} Sorted array
         */
        sortByTagCount: function(repositories, direction = 'asc') {
            return repositories.sort((a, b) => {
                const countA = a.tag_count || a.tags_count || 0;
                const countB = b.tag_count || b.tags_count || 0;
                
                if (direction === 'desc') {
                    return countB - countA;
                }
                return countA - countB;
            });
        },

        /**
         * Sort repositories by size
         * @param {Array} repositories - Array of repository objects
         * @param {string} direction - 'asc' or 'desc'
         * @returns {Array} Sorted array
         */
        sortBySize: function(repositories, direction = 'asc') {
            return repositories.sort((a, b) => {
                const sizeA = a.size || 0;
                const sizeB = b.size || 0;
                
                if (direction === 'desc') {
                    return sizeB - sizeA;
                }
                return sizeA - sizeB;
            });
        }
    };

    /**
     * Sort functions for tags
     */
    const tagSortFunctions = {
        /**
         * Sort tags by name
         * @param {Array} tags - Array of tag objects
         * @param {string} direction - 'asc' or 'desc'
         * @returns {Array} Sorted array
         */
        sortByName: function(tags, direction = 'asc') {
            return tags.sort((a, b) => {
                const nameA = (a.name || a.tag || '').toLowerCase();
                const nameB = (b.name || b.tag || '').toLowerCase();
                
                if (direction === 'desc') {
                    return nameB.localeCompare(nameA);
                }
                return nameA.localeCompare(nameB);
            });
        },

        /**
         * Sort tags by date (created/updated)
         * @param {Array} tags - Array of tag objects
         * @param {string} direction - 'asc' or 'desc'
         * @returns {Array} Sorted array
         */
        sortByDate: function(tags, direction = 'asc') {
            return tags.sort((a, b) => {
                const dateA = new Date(a.created_at || a.last_updated || a.updated_at || Date.now());
                const dateB = new Date(b.created_at || b.last_updated || b.updated_at || Date.now());
                
                if (direction === 'desc') {
                    return dateB.getTime() - dateA.getTime();
                }
                return dateA.getTime() - dateB.getTime();
            });
        },

        /**
         * Sort tags by size
         * @param {Array} tags - Array of tag objects
         * @param {string} direction - 'asc' or 'desc'
         * @returns {Array} Sorted array
         */
        sortBySize: function(tags, direction = 'asc') {
            return tags.sort((a, b) => {
                const sizeA = a.size || 0;
                const sizeB = b.size || 0;
                
                if (direction === 'desc') {
                    return sizeB - sizeA;
                }
                return sizeA - sizeB;
            });
        }
    };

    /**
     * Parse sort string into field and direction
     * @param {string} sortBy - Sort string like 'name-asc', 'date-desc'
     * @returns {Object} Object with field and direction properties
     */
    function parseSortString(sortBy) {
        if (!sortBy || typeof sortBy !== 'string') {
            return { field: 'name', direction: 'asc' };
        }

        const parts = sortBy.split('-');
        const field = parts[0] || 'name';
        const direction = parts[1] || 'asc';

        return { field, direction };
    }

    /**
     * Apply sorting to repositories array
     * @param {Array} repositories - Array of repository objects
     * @param {string} sortBy - Sort string like 'name-asc', 'date-desc'
     * @returns {Array} Sorted repositories array
     */
    function sortRepositories(repositories, sortBy = 'name-asc') {
        if (!Array.isArray(repositories) || repositories.length === 0) {
            return repositories;
        }

        const { field, direction } = parseSortString(sortBy);
        
        try {
            // Create a copy to avoid mutating original array
            const repositoriesCopy = [...repositories];

            switch (field) {
                case 'name':
                    return sortFunctions.sortByName(repositoriesCopy, direction);
                case 'date':
                    return sortFunctions.sortByDate(repositoriesCopy, direction);
                case 'tags':
                    return sortFunctions.sortByTagCount(repositoriesCopy, direction);
                case 'size':
                    return sortFunctions.sortBySize(repositoriesCopy, direction);
                default:
                    console.warn(`Unknown sort field: ${field}, falling back to name sorting`);
                    return sortFunctions.sortByName(repositoriesCopy, direction);
            }
        } catch (error) {
            console.error('Error sorting repositories:', error);
            return repositories;
        }
    }

    /**
     * Apply sorting to tags array
     * @param {Array} tags - Array of tag objects
     * @param {string} sortBy - Sort string like 'name-asc', 'date-desc'
     * @returns {Array} Sorted tags array
     */
    function sortTags(tags, sortBy = 'name-asc') {
        if (!Array.isArray(tags) || tags.length === 0) {
            return tags;
        }

        const { field, direction } = parseSortString(sortBy);
        
        try {
            // Create a copy to avoid mutating original array
            const tagsCopy = [...tags];

            switch (field) {
                case 'name':
                    return tagSortFunctions.sortByName(tagsCopy, direction);
                case 'date':
                    return tagSortFunctions.sortByDate(tagsCopy, direction);
                case 'size':
                    return tagSortFunctions.sortBySize(tagsCopy, direction);
                default:
                    console.warn(`Unknown sort field for tags: ${field}, falling back to name sorting`);
                    return tagSortFunctions.sortByName(tagsCopy, direction);
            }
        } catch (error) {
            console.error('Error sorting tags:', error);
            return tags;
        }
    }

    /**
     * Get available sort options for repositories
     * @returns {Array} Array of sort option objects
     */
    function getRepositorySortOptions() {
        return [
            { value: 'name-asc', label: 'Name (A-Z)', icon: '🔤', field: 'name', direction: 'asc' },
            { value: 'name-desc', label: 'Name (Z-A)', icon: '🔤', field: 'name', direction: 'desc' },
            { value: 'date-desc', label: 'Newest First', icon: '📅', field: 'date', direction: 'desc' },
            { value: 'date-asc', label: 'Oldest First', icon: '📅', field: 'date', direction: 'asc' },
            { value: 'tags-desc', label: 'Most Tags', icon: '🏷️', field: 'tags', direction: 'desc' },
            { value: 'tags-asc', label: 'Least Tags', icon: '🏷️', field: 'tags', direction: 'asc' }
        ];
    }

    /**
     * Get available sort options for tags
     * @returns {Array} Array of sort option objects
     */
    function getTagSortOptions() {
        return [
            { value: 'name-asc', label: 'Name (A-Z)', icon: '🔤', field: 'name', direction: 'asc' },
            { value: 'name-desc', label: 'Name (Z-A)', icon: '🔤', field: 'name', direction: 'desc' },
            { value: 'date-desc', label: 'Newest First', icon: '📅', field: 'date', direction: 'desc' },
            { value: 'date-asc', label: 'Oldest First', icon: '📅', field: 'date', direction: 'asc' },
            { value: 'size-desc', label: 'Largest First', icon: '📦', field: 'size', direction: 'desc' },
            { value: 'size-asc', label: 'Smallest First', icon: '📦', field: 'size', direction: 'asc' }
        ];
    }

    /**
     * Validate sort string
     * @param {string} sortBy - Sort string to validate
     * @param {string} type - 'repositories' or 'tags'
     * @returns {boolean} True if valid
     */
    function isValidSortString(sortBy, type = 'repositories') {
        const options = type === 'tags' ? getTagSortOptions() : getRepositorySortOptions();
        return options.some(option => option.value === sortBy);
    }

    /**
     * Normalize sort string from URL parameter
     * @param {string} sortBy - Sort string from URL
     * @param {string} type - 'repositories' or 'tags'
     * @returns {string} Normalized sort string
     */
    function normalizeSortString(sortBy, type = 'repositories') {
        // If no sort string provided, return default
        if (!sortBy || typeof sortBy !== 'string') {
            return 'name-asc';
        }

        // If valid, return as-is
        if (isValidSortString(sortBy, type)) {
            return sortBy;
        }

        // Try to parse and fix common variations
        const { field, direction } = parseSortString(sortBy);
        
        // Validate field
        const validFields = type === 'tags' ? ['name', 'date', 'size'] : ['name', 'date', 'tags', 'size'];
        const normalizedField = validFields.includes(field) ? field : 'name';
        
        // Validate direction
        const validDirections = ['asc', 'desc'];
        const normalizedDirection = validDirections.includes(direction) ? direction : 'asc';
        
        return `${normalizedField}-${normalizedDirection}`;
    }

    /**
     * Convert sort string for URL parameter
     * @param {string} sortBy - Sort string to convert
     * @returns {string} URL-safe sort string or null for default
     */
    function getSortForURL(sortBy) {
        const normalized = normalizeSortString(sortBy);
        // Return null for default sort to keep URL clean
        return normalized === 'name-asc' ? null : normalized;
    }

    // Public API
    return {
        sortRepositories,
        sortTags,
        parseSortString,
        getRepositorySortOptions,
        getTagSortOptions,
        isValidSortString,
        normalizeSortString,
        getSortForURL
    };
})();