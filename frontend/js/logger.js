/**
 * RepoVista - Advanced Logging System and Debugging Tools
 * Comprehensive logging with performance metrics, remote logging, and developer tools
 */

(function(window) {
    'use strict';

    /**
     * Log Levels enumeration
     */
    const LogLevel = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4
    };

    /**
     * Log Level Names
     */
    const LogLevelNames = {
        [LogLevel.DEBUG]: 'DEBUG',
        [LogLevel.INFO]: 'INFO',
        [LogLevel.WARN]: 'WARN',
        [LogLevel.ERROR]: 'ERROR',
        [LogLevel.FATAL]: 'FATAL'
    };

    /**
     * Environment Types
     */
    const Environment = {
        DEVELOPMENT: 'development',
        STAGING: 'staging',
        PRODUCTION: 'production'
    };

    /**
     * Advanced Logger Class
     * Feature-rich logging system with multiple outputs and filtering
     */
    class Logger {
        constructor(options = {}) {
            this.options = {
                level: options.level || LogLevel.INFO,
                environment: options.environment || this._detectEnvironment(),
                enableConsole: options.enableConsole !== false,
                enableStorage: options.enableStorage || false,
                enableRemote: options.enableRemote || false,
                maxStorageEntries: options.maxStorageEntries || 1000,
                remoteEndpoint: options.remoteEndpoint || null,
                contextSize: options.contextSize || 10,
                enablePerformance: options.enablePerformance || true,
                enableGrouping: options.enableGrouping !== false,
                enableStackTrace: options.enableStackTrace !== false,
                timestampFormat: options.timestampFormat || 'ISO',
                ...options
            };

            // Internal state
            this.logs = [];
            this.contexts = new Map();
            this.groups = [];
            this.timers = new Map();
            this.counters = new Map();
            this.remoteQueue = [];
            this.remoteBuffer = [];
            this.isRemoteConnected = false;
            this.filters = new Set();
            this.transformers = new Set();

            // Performance tracking
            this.performanceMetrics = {
                logCount: 0,
                errorCount: 0,
                warningCount: 0,
                averageLogTime: 0,
                totalLogTime: 0
            };

            // Initialize subsystems
            this._initializeStorage();
            this._initializeRemoteLogging();
            this._setupGlobalErrorHandling();
            this._setupPerformanceMonitoring();

            this.info('Logger initialized', { 
                level: LogLevelNames[this.options.level],
                environment: this.options.environment,
                features: this._getEnabledFeatures()
            });
        }

        // Core Logging Methods

        /**
         * Debug level logging
         */
        debug(message, data = null, context = null) {
            this._log(LogLevel.DEBUG, message, data, context);
        }

        /**
         * Info level logging
         */
        info(message, data = null, context = null) {
            this._log(LogLevel.INFO, message, data, context);
        }

        /**
         * Warning level logging
         */
        warn(message, data = null, context = null) {
            this._log(LogLevel.WARN, message, data, context);
            this.performanceMetrics.warningCount++;
        }

        /**
         * Error level logging
         */
        error(message, data = null, context = null) {
            this._log(LogLevel.ERROR, message, data, context);
            this.performanceMetrics.errorCount++;
        }

        /**
         * Fatal level logging
         */
        fatal(message, data = null, context = null) {
            this._log(LogLevel.FATAL, message, data, context);
            this.performanceMetrics.errorCount++;
        }

        // Grouped Logging

        /**
         * Start a log group
         */
        group(title, collapsed = false) {
            if (!this.options.enableGrouping) return;

            this.groups.push(title);
            
            if (this._shouldLog(LogLevel.INFO)) {
                if (collapsed && console.groupCollapsed) {
                    console.groupCollapsed(`📁 ${title}`);
                } else if (console.group) {
                    console.group(`📁 ${title}`);
                }
            }
        }

        /**
         * End current log group
         */
        groupEnd() {
            if (!this.options.enableGrouping || this.groups.length === 0) return;

            this.groups.pop();
            
            if (console.groupEnd) {
                console.groupEnd();
            }
        }

        // Performance Logging

        /**
         * Start a timer
         */
        time(label) {
            if (!this.options.enablePerformance) return;

            this.timers.set(label, {
                start: performance.now(),
                timestamp: Date.now()
            });
        }

        /**
         * End a timer and log duration
         */
        timeEnd(label) {
            if (!this.options.enablePerformance) return;

            const timer = this.timers.get(label);
            if (!timer) {
                this.warn(`Timer '${label}' not found`);
                return;
            }

            const duration = performance.now() - timer.start;
            this.timers.delete(label);

            this.info(`⏱️ ${label}`, {
                duration: `${duration.toFixed(3)}ms`,
                start: timer.timestamp
            }, 'performance');

            return duration;
        }

        /**
         * Log current timer without ending it
         */
        timeLog(label, data = null) {
            if (!this.options.enablePerformance) return;

            const timer = this.timers.get(label);
            if (!timer) {
                this.warn(`Timer '${label}' not found`);
                return;
            }

            const duration = performance.now() - timer.start;
            this.info(`⏱️ ${label} (ongoing)`, {
                duration: `${duration.toFixed(3)}ms`,
                ...data
            }, 'performance');

            return duration;
        }

        /**
         * Count occurrences
         */
        count(label = 'default') {
            const current = this.counters.get(label) || 0;
            const newCount = current + 1;
            this.counters.set(label, newCount);
            
            this.info(`🔢 ${label}: ${newCount}`, null, 'counter');
            return newCount;
        }

        /**
         * Reset counter
         */
        countReset(label = 'default') {
            this.counters.delete(label);
            this.info(`🔄 Counter '${label}' reset`, null, 'counter');
        }

        // Advanced Logging Features

        /**
         * Log with custom styling
         */
        styled(message, styles, data = null) {
            if (!this._shouldLog(LogLevel.INFO)) return;

            const logEntry = this._createLogEntry(LogLevel.INFO, message, data, null);
            
            if (this.options.enableConsole && console.log) {
                console.log(`%c${message}`, styles, data || '');
            }

            this._processLogEntry(logEntry);
        }

        /**
         * Log table data
         */
        table(data, columns = null) {
            if (!this._shouldLog(LogLevel.INFO)) return;

            const logEntry = this._createLogEntry(LogLevel.INFO, 'Table Data', data, 'table');
            
            if (this.options.enableConsole && console.table) {
                console.table(data, columns);
            }

            this._processLogEntry(logEntry);
        }

        /**
         * Trace execution path
         */
        trace(message = 'Trace', data = null) {
            if (!this._shouldLog(LogLevel.DEBUG)) return;

            const logEntry = this._createLogEntry(LogLevel.DEBUG, message, data, 'trace');
            
            if (this.options.enableConsole && console.trace) {
                console.trace(message, data);
            }

            this._processLogEntry(logEntry);
        }

        /**
         * Assert condition
         */
        assert(condition, message, data = null) {
            if (condition) return;

            this.error(`Assertion failed: ${message}`, data, 'assertion');
            
            if (this.options.enableConsole && console.assert) {
                console.assert(condition, message, data);
            }
        }

        // Context Management

        /**
         * Set logging context
         */
        setContext(key, value) {
            this.contexts.set(key, value);
        }

        /**
         * Remove logging context
         */
        removeContext(key) {
            this.contexts.delete(key);
        }

        /**
         * Clear all contexts
         */
        clearContext() {
            this.contexts.clear();
        }

        /**
         * Get current context
         */
        getContext() {
            return Object.fromEntries(this.contexts);
        }

        // Filtering and Transformation

        /**
         * Add log filter
         */
        addFilter(filter) {
            if (typeof filter === 'function') {
                this.filters.add(filter);
            } else {
                throw new TypeError('Filter must be a function');
            }
        }

        /**
         * Remove log filter
         */
        removeFilter(filter) {
            this.filters.delete(filter);
        }

        /**
         * Add log transformer
         */
        addTransformer(transformer) {
            if (typeof transformer === 'function') {
                this.transformers.add(transformer);
            } else {
                throw new TypeError('Transformer must be a function');
            }
        }

        /**
         * Remove log transformer
         */
        removeTransformer(transformer) {
            this.transformers.delete(transformer);
        }

        // Configuration Management

        /**
         * Update logger configuration
         */
        configure(newOptions) {
            this.options = { ...this.options, ...newOptions };
            this.info('Logger configuration updated', newOptions);
        }

        /**
         * Set log level
         */
        setLevel(level) {
            this.options.level = level;
            this.info(`Log level changed to ${LogLevelNames[level]}`);
        }

        /**
         * Enable/disable console output
         */
        setConsoleEnabled(enabled) {
            this.options.enableConsole = enabled;
            this.info(`Console logging ${enabled ? 'enabled' : 'disabled'}`);
        }

        // Query and Export

        /**
         * Get logs by level
         */
        getLogsByLevel(level) {
            return this.logs.filter(log => log.level === level);
        }

        /**
         * Get logs by context
         */
        getLogsByContext(context) {
            return this.logs.filter(log => log.context === context);
        }

        /**
         * Get logs in date range
         */
        getLogsByDateRange(startDate, endDate) {
            const start = new Date(startDate).getTime();
            const end = new Date(endDate).getTime();
            
            return this.logs.filter(log => {
                const logTime = new Date(log.timestamp).getTime();
                return logTime >= start && logTime <= end;
            });
        }

        /**
         * Search logs
         */
        searchLogs(query, options = {}) {
            const { 
                caseSensitive = false, 
                includeData = true, 
                contextFilter = null 
            } = options;
            
            const searchTerm = caseSensitive ? query : query.toLowerCase();
            
            return this.logs.filter(log => {
                if (contextFilter && log.context !== contextFilter) {
                    return false;
                }
                
                const message = caseSensitive ? log.message : log.message.toLowerCase();
                let dataMatch = false;
                
                if (includeData && log.data) {
                    const dataStr = caseSensitive 
                        ? JSON.stringify(log.data) 
                        : JSON.stringify(log.data).toLowerCase();
                    dataMatch = dataStr.includes(searchTerm);
                }
                
                return message.includes(searchTerm) || dataMatch;
            });
        }

        /**
         * Export logs
         */
        exportLogs(format = 'json', options = {}) {
            const { 
                level = null, 
                context = null, 
                dateRange = null,
                includeMetrics = false 
            } = options;
            
            let logs = [...this.logs];
            
            // Apply filters
            if (level !== null) {
                logs = logs.filter(log => log.level >= level);
            }
            
            if (context) {
                logs = logs.filter(log => log.context === context);
            }
            
            if (dateRange) {
                logs = this._filterByDateRange(logs, dateRange.start, dateRange.end);
            }
            
            const exportData = {
                logs,
                exportedAt: new Date().toISOString(),
                totalCount: logs.length,
                ...(includeMetrics && { metrics: this.getMetrics() })
            };
            
            switch (format.toLowerCase()) {
                case 'json':
                    return JSON.stringify(exportData, null, 2);
                    
                case 'csv':
                    return this._convertToCSV(logs);
                    
                case 'text':
                    return logs.map(log => 
                        `[${log.timestamp}] ${LogLevelNames[log.level]}: ${log.message}`
                    ).join('\n');
                    
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
        }

        /**
         * Get performance metrics
         */
        getMetrics() {
            return {
                ...this.performanceMetrics,
                totalLogs: this.logs.length,
                logsByLevel: {
                    debug: this.getLogsByLevel(LogLevel.DEBUG).length,
                    info: this.getLogsByLevel(LogLevel.INFO).length,
                    warn: this.getLogsByLevel(LogLevel.WARN).length,
                    error: this.getLogsByLevel(LogLevel.ERROR).length,
                    fatal: this.getLogsByLevel(LogLevel.FATAL).length
                },
                activeTimers: this.timers.size,
                activeCounters: this.counters.size,
                contexts: Array.from(this.contexts.keys()),
                remoteQueueSize: this.remoteQueue.length,
                isRemoteConnected: this.isRemoteConnected
            };
        }

        /**
         * Clear all logs
         */
        clear() {
            this.logs = [];
            this.timers.clear();
            this.counters.clear();
            this.remoteQueue = [];
            
            // Reset metrics
            this.performanceMetrics = {
                logCount: 0,
                errorCount: 0,
                warningCount: 0,
                averageLogTime: 0,
                totalLogTime: 0
            };
            
            if (this.options.enableConsole && console.clear) {
                console.clear();
            }
            
            this.info('Logger cleared');
        }

        // Private Methods

        /**
         * Core logging implementation
         */
        _log(level, message, data = null, context = null) {
            if (!this._shouldLog(level)) return;

            const startTime = performance.now();
            
            // Create log entry
            const logEntry = this._createLogEntry(level, message, data, context);
            
            // Apply filters
            if (!this._applyFilters(logEntry)) return;
            
            // Apply transformers
            const transformedEntry = this._applyTransformers(logEntry);
            
            // Output to console
            if (this.options.enableConsole) {
                this._outputToConsole(transformedEntry);
            }
            
            // Process log entry
            this._processLogEntry(transformedEntry);
            
            // Update performance metrics
            const logTime = performance.now() - startTime;
            this._updatePerformanceMetrics(logTime);
        }

        /**
         * Check if should log at level
         */
        _shouldLog(level) {
            return level >= this.options.level;
        }

        /**
         * Create log entry object
         */
        _createLogEntry(level, message, data, context) {
            const timestamp = Date.now();
            const isoTimestamp = new Date(timestamp).toISOString();
            
            return {
                id: this._generateLogId(),
                level,
                levelName: LogLevelNames[level],
                message,
                data: data ? this._deepClone(data) : null,
                context: context || this._getActiveContext(),
                timestamp,
                isoTimestamp,
                userAgent: navigator.userAgent,
                url: window.location.href,
                sessionId: this._getSessionId(),
                stackTrace: this.options.enableStackTrace ? this._getStackTrace() : null,
                globalContext: this.getContext(),
                group: this.groups.length > 0 ? [...this.groups] : null
            };
        }

        /**
         * Apply filters to log entry
         */
        _applyFilters(logEntry) {
            for (const filter of this.filters) {
                try {
                    if (!filter(logEntry)) {
                        return false;
                    }
                } catch (error) {
                    console.error('Filter error:', error);
                }
            }
            return true;
        }

        /**
         * Apply transformers to log entry
         */
        _applyTransformers(logEntry) {
            let transformed = { ...logEntry };
            
            for (const transformer of this.transformers) {
                try {
                    transformed = transformer(transformed) || transformed;
                } catch (error) {
                    console.error('Transformer error:', error);
                }
            }
            
            return transformed;
        }

        /**
         * Output log to console
         */
        _outputToConsole(logEntry) {
            const { level, message, data, group } = logEntry;
            const groupPrefix = group && group.length > 0 ? '  '.repeat(group.length) : '';
            const icon = this._getLevelIcon(level);
            const timestamp = this._formatTimestamp(logEntry.timestamp);
            
            const consoleMessage = `${groupPrefix}${icon} [${timestamp}] ${message}`;
            
            try {
                switch (level) {
                    case LogLevel.DEBUG:
                        if (console.debug) {
                            console.debug(consoleMessage, data || '');
                        } else {
                            console.log(consoleMessage, data || '');
                        }
                        break;
                        
                    case LogLevel.INFO:
                        console.info(consoleMessage, data || '');
                        break;
                        
                    case LogLevel.WARN:
                        console.warn(consoleMessage, data || '');
                        break;
                        
                    case LogLevel.ERROR:
                    case LogLevel.FATAL:
                        console.error(consoleMessage, data || '');
                        break;
                        
                    default:
                        console.log(consoleMessage, data || '');
                }
            } catch (error) {
                // Fallback for environments where console methods might not exist
                console.log(consoleMessage, data || '');
            }
        }

        /**
         * Process log entry (storage, remote)
         */
        _processLogEntry(logEntry) {
            // Add to internal logs
            this.logs.push(logEntry);
            
            // Limit log storage
            if (this.logs.length > this.options.maxStorageEntries) {
                this.logs.shift();
            }
            
            // Store to localStorage if enabled
            if (this.options.enableStorage) {
                this._storeLog(logEntry);
            }
            
            // Send to remote if enabled
            if (this.options.enableRemote) {
                this._sendToRemote(logEntry);
            }
        }

        /**
         * Update performance metrics
         */
        _updatePerformanceMetrics(logTime) {
            this.performanceMetrics.logCount++;
            this.performanceMetrics.totalLogTime += logTime;
            this.performanceMetrics.averageLogTime = 
                this.performanceMetrics.totalLogTime / this.performanceMetrics.logCount;
        }

        /**
         * Initialize storage subsystem
         */
        _initializeStorage() {
            if (!this.options.enableStorage) return;
            
            try {
                const stored = localStorage.getItem('repovista_logs');
                if (stored) {
                    const parsedLogs = JSON.parse(stored);
                    this.logs.push(...parsedLogs.slice(-100)); // Keep last 100 logs
                }
            } catch (error) {
                console.error('Failed to initialize log storage:', error);
            }
        }

        /**
         * Store log to localStorage
         */
        _storeLog(logEntry) {
            try {
                const recentLogs = this.logs.slice(-100); // Keep last 100
                localStorage.setItem('repovista_logs', JSON.stringify(recentLogs));
            } catch (error) {
                console.error('Failed to store log:', error);
            }
        }

        /**
         * Initialize remote logging
         */
        _initializeRemoteLogging() {
            if (!this.options.enableRemote || !this.options.remoteEndpoint) return;
            
            // Set up periodic flush
            setInterval(() => {
                this._flushRemoteQueue();
            }, 5000); // Flush every 5 seconds
            
            // Test connection
            this._testRemoteConnection();
        }

        /**
         * Send log to remote endpoint
         */
        _sendToRemote(logEntry) {
            if (!this.options.remoteEndpoint) return;
            
            this.remoteQueue.push(logEntry);
            
            // Flush if queue is full
            if (this.remoteQueue.length >= 10) {
                this._flushRemoteQueue();
            }
        }

        /**
         * Flush remote log queue
         */
        async _flushRemoteQueue() {
            if (this.remoteQueue.length === 0 || !this.options.remoteEndpoint) return;
            
            const logsToSend = [...this.remoteQueue];
            this.remoteQueue = [];
            
            try {
                const response = await fetch(this.options.remoteEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        logs: logsToSend,
                        metadata: {
                            userAgent: navigator.userAgent,
                            url: window.location.href,
                            timestamp: Date.now(),
                            sessionId: this._getSessionId()
                        }
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Remote logging failed: ${response.status}`);
                }
                
                this.isRemoteConnected = true;
            } catch (error) {
                // Re-queue failed logs
                this.remoteQueue.unshift(...logsToSend);
                this.isRemoteConnected = false;
                console.error('Remote logging error:', error);
            }
        }

        /**
         * Test remote connection
         */
        async _testRemoteConnection() {
            if (!this.options.remoteEndpoint) return;
            
            try {
                const response = await fetch(this.options.remoteEndpoint, {
                    method: 'HEAD'
                });
                this.isRemoteConnected = response.ok;
            } catch (error) {
                this.isRemoteConnected = false;
            }
        }

        /**
         * Setup global error handling
         */
        _setupGlobalErrorHandling() {
            // Capture unhandled errors
            window.addEventListener('error', (event) => {
                this.error('Unhandled Error', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    error: event.error?.stack
                }, 'global');
            });
            
            // Capture unhandled promise rejections
            window.addEventListener('unhandledrejection', (event) => {
                this.error('Unhandled Promise Rejection', {
                    reason: event.reason,
                    promise: event.promise
                }, 'global');
            });
        }

        /**
         * Setup performance monitoring
         */
        _setupPerformanceMonitoring() {
            if (!this.options.enablePerformance) return;
            
            // Monitor page load performance
            window.addEventListener('load', () => {
                setTimeout(() => {
                    const perfData = performance.getEntriesByType('navigation')[0];
                    if (perfData) {
                        this.info('Page Load Performance', {
                            domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
                            loadComplete: perfData.loadEventEnd - perfData.loadEventStart,
                            totalTime: perfData.loadEventEnd - perfData.fetchStart
                        }, 'performance');
                    }
                }, 0);
            });
            
            // Monitor memory usage (if available)
            if (performance.memory) {
                setInterval(() => {
                    const memory = performance.memory;
                    if (memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.9) {
                        this.warn('High Memory Usage', {
                            used: this._formatBytes(memory.usedJSHeapSize),
                            limit: this._formatBytes(memory.jsHeapSizeLimit),
                            percentage: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)
                        }, 'performance');
                    }
                }, 30000); // Check every 30 seconds
            }
        }

        // Utility Methods

        /**
         * Detect environment
         */
        _detectEnvironment() {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return Environment.DEVELOPMENT;
            }
            
            if (window.location.hostname.includes('staging') || window.location.hostname.includes('dev')) {
                return Environment.STAGING;
            }
            
            return Environment.PRODUCTION;
        }

        /**
         * Get enabled features
         */
        _getEnabledFeatures() {
            return {
                console: this.options.enableConsole,
                storage: this.options.enableStorage,
                remote: this.options.enableRemote,
                performance: this.options.enablePerformance,
                grouping: this.options.enableGrouping,
                stackTrace: this.options.enableStackTrace
            };
        }

        /**
         * Generate unique log ID
         */
        _generateLogId() {
            return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        /**
         * Get session ID
         */
        _getSessionId() {
            let sessionId = sessionStorage.getItem('repovista_session_id');
            if (!sessionId) {
                sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                sessionStorage.setItem('repovista_session_id', sessionId);
            }
            return sessionId;
        }

        /**
         * Get active context from call stack
         */
        _getActiveContext() {
            try {
                const stack = new Error().stack;
                const lines = stack.split('\n');
                
                // Find first non-logger line
                for (let i = 3; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.includes('Logger.') && !line.includes('_log')) {
                        const match = line.match(/at\s+(.+?)\s+\(/);
                        if (match) {
                            return match[1];
                        }
                    }
                }
            } catch (error) {
                // Ignore stack trace errors
            }
            return null;
        }

        /**
         * Get stack trace
         */
        _getStackTrace() {
            try {
                throw new Error();
            } catch (error) {
                return error.stack;
            }
        }

        /**
         * Get level icon
         */
        _getLevelIcon(level) {
            const icons = {
                [LogLevel.DEBUG]: '🐛',
                [LogLevel.INFO]: '💡',
                [LogLevel.WARN]: '⚠️',
                [LogLevel.ERROR]: '❌',
                [LogLevel.FATAL]: '💀'
            };
            return icons[level] || '📝';
        }

        /**
         * Format timestamp
         */
        _formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            switch (this.options.timestampFormat) {
                case 'ISO':
                    return date.toISOString();
                case 'locale':
                    return date.toLocaleString();
                case 'time':
                    return date.toLocaleTimeString();
                default:
                    return date.toISOString();
            }
        }

        /**
         * Format bytes
         */
        _formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        /**
         * Deep clone object
         */
        _deepClone(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return new Date(obj);
            if (obj instanceof Array) return obj.map(item => this._deepClone(item));
            
            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this._deepClone(obj[key]);
                }
            }
            return cloned;
        }

        /**
         * Convert logs to CSV
         */
        _convertToCSV(logs) {
            if (logs.length === 0) return '';
            
            const headers = ['timestamp', 'level', 'message', 'context', 'data'];
            const csvRows = [headers.join(',')];
            
            logs.forEach(log => {
                const row = [
                    `"${log.isoTimestamp}"`,
                    `"${log.levelName}"`,
                    `"${log.message.replace(/"/g, '""')}"`,
                    `"${log.context || ''}"`,
                    `"${log.data ? JSON.stringify(log.data).replace(/"/g, '""') : ''}"`
                ];
                csvRows.push(row.join(','));
            });
            
            return csvRows.join('\n');
        }

        /**
         * Filter logs by date range
         */
        _filterByDateRange(logs, startDate, endDate) {
            const start = new Date(startDate).getTime();
            const end = new Date(endDate).getTime();
            
            return logs.filter(log => {
                const logTime = new Date(log.timestamp).getTime();
                return logTime >= start && logTime <= end;
            });
        }
    }

    // Export to global scope
    window.App = window.App || {};
    window.App.LogLevel = LogLevel;
    window.App.LogLevelNames = LogLevelNames;
    window.App.Environment = Environment;
    window.App.Logger = Logger;

})(window);