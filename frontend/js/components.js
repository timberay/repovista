/**
 * RepoVista - UI Components
 * Reusable components for rendering repository data
 */

(function(window) {
    'use strict';

    const { h, html } = window.App;

    /**
     * Repository Card Component
     * Renders a repository with expandable tag details
     */
    const RepositoryCard = (props) => {
        const { 
            repository, 
            tags = [], 
            isExpanded = false,
            onToggle,
            onTagSelect,
            onCopyCommand
        } = props;

        const tagCount = tags.length;
        const lastUpdated = repository.lastUpdated 
            ? new Date(repository.lastUpdated).toLocaleDateString()
            : 'Unknown';

        return h('div', {
            className: `repository-card ${isExpanded ? 'expanded' : ''}`,
            'data-repository': repository.name,
            key: repository.name
        },
            // Card Header
            h('div', {
                className: 'repository-header',
                onClick: onToggle
            },
                h('div', { className: 'repository-info' },
                    h('h3', { className: 'repository-name' },
                        h('span', { className: 'repository-icon' }, '📦'),
                        App.text(repository.name)
                    ),
                    h('div', { className: 'repository-meta' },
                        h('span', { className: 'tag-count' },
                            h('span', { className: 'icon' }, '🏷️'),
                            App.text(`${tagCount} tags`)
                        ),
                        h('span', { className: 'last-updated' },
                            h('span', { className: 'icon' }, '📅'),
                            App.text(`Updated: ${lastUpdated}`)
                        )
                    )
                ),
                h('button', {
                    className: 'expand-toggle',
                    'aria-expanded': isExpanded,
                    'aria-label': isExpanded ? 'Collapse' : 'Expand'
                },
                    h('span', { className: 'expand-icon' },
                        App.text(isExpanded ? '▼' : '▶')
                    )
                )
            ),
            
            // Expandable Content
            isExpanded && h('div', { className: 'repository-content' },
                h('div', { className: 'tags-section' },
                    h('h4', { className: 'section-title' }, 
                        App.text('Available Tags')
                    ),
                    tags.length > 0 
                        ? TagList({ 
                            tags, 
                            repository: repository.name,
                            onTagSelect,
                            onCopyCommand
                        })
                        : h('p', { className: 'no-tags' }, 
                            App.text('No tags available')
                        )
                ),
                
                // Repository Details
                repository.description && h('div', { className: 'repository-description' },
                    h('h4', { className: 'section-title' }, 
                        App.text('Description')
                    ),
                    h('p', {}, App.text(repository.description))
                )
            )
        );
    };

    /**
     * Tag List Component
     * Renders a list of tags with their details
     */
    const TagList = (props) => {
        const { 
            tags, 
            repository,
            onTagSelect,
            onCopyCommand 
        } = props;

        // Use virtual scrolling for large tag lists (>50 items)
        if (tags.length > 50 && App.VirtualScroller) {
            return h('div', { 
                className: 'tag-list virtual-scroll-container',
                id: `tag-list-${repository.replace(/[^a-zA-Z0-9]/g, '-')}`
            });
        }

        return h('div', { className: 'tag-list' },
            ...tags.map(tag => TagItem({
                tag,
                repository,
                onSelect: onTagSelect,
                onCopy: onCopyCommand
            }))
        );
    };

    /**
     * Tag Item Component
     * Individual tag with pull command
     */
    const TagItem = (props) => {
        const { tag, repository, onSelect, onCopy } = props;
        
        // State for pull command (will be updated with registry URL)
        let displayCommand = `docker pull ${repository}:${tag.name}`;
        const sizeFormatted = formatBytes(tag.size || 0);
        const createdDate = tag.created 
            ? new Date(tag.created).toLocaleDateString()
            : 'Unknown';

        // Enhanced copy functionality with visual feedback
        const handleCopyClick = async (e) => {
            e.stopPropagation();
            
            const button = e.currentTarget;
            const copyIcon = button.querySelector('.copy-icon');
            const copyText = button.querySelector('.copy-text');
            
            // Disable button temporarily
            button.disabled = true;
            
            try {
                // Generate proper pull command with registry URL
                let fullPullCommand;
                if (App.Utils && App.Utils.generatePullCommand) {
                    fullPullCommand = await App.Utils.generatePullCommand(repository, tag.name);
                } else {
                    fullPullCommand = pullCommand;
                }
                
                // Copy to clipboard
                const success = await App.Utils.copyToClipboard(fullPullCommand);
                
                if (success) {
                    // Visual feedback - change to checkmark
                    if (copyIcon) copyIcon.textContent = '✅';
                    if (copyText) copyText.textContent = 'Copied!';
                    
                    // Show success toast
                    if (App.Utils && App.Utils.toast) {
                        App.Utils.toast.success('Docker pull command copied to clipboard!');
                    }
                    
                    // Reset after 2 seconds
                    setTimeout(() => {
                        if (copyIcon) copyIcon.textContent = '📋';
                        if (copyText) copyText.textContent = 'Copy';
                        button.disabled = false;
                    }, 2000);
                    
                    // Call original onCopy callback if provided
                    if (onCopy) onCopy(fullPullCommand);
                } else {
                    throw new Error('Clipboard API failed');
                }
                
            } catch (error) {
                console.error('Copy failed:', error);
                
                // Show error toast with fallback instructions
                if (App.Utils && App.Utils.toast) {
                    App.Utils.toast.error('Failed to copy. Please select and copy manually.');
                }
                
                // Reset button
                button.disabled = false;
            }
        };

        return h('div', {
            className: 'tag-item',
            'data-tag': tag.name,
            key: `${repository}-${tag.name}`,
            onClick: () => onSelect && onSelect({ repository, tag: tag.name })
        },
            h('div', { className: 'tag-header' },
                h('span', { className: 'tag-name' },
                    h('span', { className: 'tag-icon' }, '🔖'),
                    App.text(tag.name)
                ),
                h('span', { className: 'tag-metadata' },
                    h('span', { className: 'tag-size' }, 
                        App.text(sizeFormatted)
                    ),
                    h('span', { className: 'tag-date' }, 
                        App.text(createdDate)
                    )
                )
            ),
            
            h('div', { className: 'tag-command' },
                h('code', { 
                    className: 'pull-command',
                    style: 'word-break: break-all; overflow-wrap: anywhere; white-space: pre-wrap;'
                },
                    App.text(displayCommand)
                ),
                h('button', {
                    className: 'copy-button',
                    'data-copy-text': displayCommand,
                    onClick: handleCopyClick,
                    'aria-label': 'Copy pull command',
                    title: 'Copy Docker pull command'
                },
                    h('span', { className: 'copy-icon' }, '📋'),
                    h('span', { className: 'copy-text' }, 
                        App.text('Copy')
                    )
                )
            ),
            
            tag.digest && h('div', { className: 'tag-digest' },
                h('span', { className: 'digest-label' }, 
                    App.text('Digest: ')
                ),
                h('code', { className: 'digest-value' },
                    App.text(tag.digest.substring(0, 12) + '...')
                )
            )
        );
    };

    /**
     * Pagination Component
     * Renders pagination controls
     */
    const Pagination = (props) => {
        const {
            currentPage,
            totalPages,
            totalItems,
            pageSize,
            onPageChange,
            onPageSizeChange
        } = props;

        // Calculate page range
        const pageRange = calculatePageRange(currentPage, totalPages);
        
        // Calculate item range
        const startItem = (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalItems);

        return h('div', { className: 'pagination-container' },
            // Item count
            h('div', { className: 'pagination-info' },
                h('span', { className: 'item-count' },
                    App.text(`Showing ${startItem}-${endItem} of ${totalItems} repositories`)
                )
            ),
            
            // Pagination controls
            h('div', { className: 'pagination-controls' },
                // Previous button
                h('button', {
                    className: 'page-button prev',
                    disabled: currentPage === 1,
                    onClick: () => onPageChange(currentPage - 1),
                    'aria-label': 'Previous page'
                },
                    h('span', {}, App.text('← Previous'))
                ),
                
                // Page numbers
                h('div', { className: 'page-numbers' },
                    ...pageRange.map(page => {
                        if (page === '...') {
                            return h('span', { 
                                className: 'page-ellipsis',
                                key: `ellipsis-${Math.random()}`
                            }, App.text('...'));
                        }
                        
                        return h('button', {
                            className: `page-button ${page === currentPage ? 'active' : ''}`,
                            'data-page': page,
                            key: `page-${page}`,
                            onClick: () => onPageChange(page),
                            'aria-label': `Go to page ${page}`,
                            'aria-current': page === currentPage ? 'page' : undefined
                        }, App.text(page.toString()));
                    })
                ),
                
                // Next button
                h('button', {
                    className: 'page-button next',
                    disabled: currentPage === totalPages,
                    onClick: () => onPageChange(currentPage + 1),
                    'aria-label': 'Next page'
                },
                    h('span', {}, App.text('Next →'))
                )
            ),
            
            // Page size selector
            h('div', { className: 'page-size-selector' },
                h('label', { htmlFor: 'page-size' },
                    App.text('Items per page:')
                ),
                h('select', {
                    id: 'page-size',
                    value: pageSize,
                    onChange: (e) => onPageSizeChange(parseInt(e.target.value, 10))
                },
                    h('option', { value: 10 }, App.text('10')),
                    h('option', { value: 20 }, App.text('20')),
                    h('option', { value: 50 }, App.text('50')),
                    h('option', { value: 100 }, App.text('100'))
                )
            )
        );
    };

    /**
     * Search Bar Component
     */
    const SearchBar = (props) => {
        const { 
            value = '', 
            placeholder = 'Search repositories...', 
            onSearch,
            onClear 
        } = props;

        return h('div', { className: 'search-bar' },
            h('div', { className: 'search-input-wrapper' },
                h('span', { className: 'search-icon' }, '🔍'),
                h('input', {
                    type: 'text',
                    className: 'search-input',
                    id: 'search-input',
                    placeholder: placeholder,
                    value: value,
                    onInput: (e) => onSearch && onSearch(e.target.value),
                    'aria-label': 'Search repositories'
                }),
                value && h('button', {
                    className: 'clear-button',
                    onClick: () => {
                        onClear && onClear();
                        onSearch && onSearch('');
                    },
                    'aria-label': 'Clear search'
                },
                    h('span', {}, App.text('✕'))
                )
            )
        );
    };

    /**
     * Sort Controls Component
     */
    const SortControls = (props) => {
        const { currentSort = 'name-asc', onSortChange } = props;

        const sortOptions = [
            { value: 'name-asc', label: 'Name (A-Z)', icon: '🔤' },
            { value: 'name-desc', label: 'Name (Z-A)', icon: '🔤' },
            { value: 'date-desc', label: 'Newest First', icon: '📅' },
            { value: 'date-asc', label: 'Oldest First', icon: '📅' },
            { value: 'tags-desc', label: 'Most Tags', icon: '🏷️' },
            { value: 'tags-asc', label: 'Least Tags', icon: '🏷️' }
        ];

        return h('div', { className: 'sort-controls' },
            h('label', { className: 'sort-label' },
                h('span', { className: 'sort-icon' }, '↕️'),
                App.text('Sort by:')
            ),
            h('div', { className: 'sort-options' },
                ...sortOptions.map(option => 
                    h('button', {
                        className: `sort-option ${currentSort === option.value ? 'active' : ''}`,
                        'data-sort': option.value,
                        key: option.value,
                        onClick: () => onSortChange(option.value),
                        'aria-label': `Sort by ${option.label}`,
                        'aria-pressed': currentSort === option.value
                    },
                        h('span', { className: 'option-icon' }, 
                            App.text(option.icon)
                        ),
                        h('span', { className: 'option-label' }, 
                            App.text(option.label)
                        )
                    )
                )
            )
        );
    };

    /**
     * Loading Spinner Component
     */
    const LoadingSpinner = (props) => {
        const { message = 'Loading...' } = props;

        return h('div', { className: 'loading-container' },
            h('div', { className: 'loading-spinner' },
                h('div', { className: 'spinner' }),
                h('p', { className: 'loading-message' },
                    App.text(message)
                )
            )
        );
    };

    /**
     * Error Message Component
     */
    const ErrorMessage = (props) => {
        const { error, onRetry, onDismiss } = props;

        return h('div', { className: 'error-container' },
            h('div', { className: 'error-content' },
                h('span', { className: 'error-icon' }, '⚠️'),
                h('h3', { className: 'error-title' },
                    App.text('Something went wrong')
                ),
                h('p', { className: 'error-message' },
                    App.text(error.message || 'An unexpected error occurred')
                ),
                h('div', { className: 'error-actions' },
                    onRetry && h('button', {
                        className: 'btn btn-primary',
                        onClick: onRetry
                    },
                        App.text('Try Again')
                    ),
                    onDismiss && h('button', {
                        className: 'btn btn-secondary',
                        onClick: onDismiss
                    },
                        App.text('Dismiss')
                    )
                )
            )
        );
    };

    /**
     * Empty State Component
     */
    const EmptyState = (props) => {
        const { 
            title = 'No repositories found',
            message = 'Try adjusting your search or filters',
            icon = '📭'
        } = props;

        return h('div', { className: 'empty-state' },
            h('div', { className: 'empty-state-content' },
                h('span', { className: 'empty-icon' }, App.text(icon)),
                h('h3', { className: 'empty-title' }, App.text(title)),
                h('p', { className: 'empty-message' }, App.text(message))
            )
        );
    };

    // Helper Functions

    /**
     * Calculate page range for pagination
     */
    function calculatePageRange(current, total, delta = 2) {
        const range = [];
        const rangeWithDots = [];
        let l;

        range.push(1);

        if (total <= 1) return range;

        for (let i = current - delta; i <= current + delta; i++) {
            if (i < total && i > 1) {
                range.push(i);
            }
        }
        
        range.push(total);

        range.forEach((i) => {
            if (l) {
                if (i - l === 2) {
                    rangeWithDots.push(l + 1);
                } else if (i - l !== 1) {
                    rangeWithDots.push('...');
                }
            }
            rangeWithDots.push(i);
            l = i;
        });

        return rangeWithDots;
    }

    /**
     * Format bytes to human readable
     */
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Register components
    const registerComponents = (renderEngine) => {
        renderEngine.registerComponent('RepositoryCard', RepositoryCard);
        renderEngine.registerComponent('TagList', TagList);
        renderEngine.registerComponent('TagItem', TagItem);
        renderEngine.registerComponent('Pagination', Pagination);
        renderEngine.registerComponent('SearchBar', SearchBar);
        renderEngine.registerComponent('SortControls', SortControls);
        renderEngine.registerComponent('LoadingSpinner', LoadingSpinner);
        renderEngine.registerComponent('ErrorMessage', ErrorMessage);
        renderEngine.registerComponent('EmptyState', EmptyState);
    };

    // Export to global scope
    window.App = window.App || {};
    window.App.Components = {
        RepositoryCard,
        TagList,
        TagItem,
        Pagination,
        SearchBar,
        SortControls,
        LoadingSpinner,
        ErrorMessage,
        EmptyState,
        registerComponents
    };

})(window);