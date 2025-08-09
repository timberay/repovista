/**
 * Sort Functionality Tests
 * Simple test suite for validating sorting functionality
 */

window.App = window.App || {};
App.SortTests = (function() {
    'use strict';

    /**
     * Mock repository data for testing
     */
    const mockRepositories = [
        { 
            name: 'zebra-app', 
            last_updated: '2024-01-15T10:00:00Z', 
            tag_count: 5,
            size: 1024000 
        },
        { 
            name: 'alpha-service', 
            last_updated: '2024-01-20T14:30:00Z', 
            tag_count: 12,
            size: 2048000 
        },
        { 
            name: 'beta-tool', 
            last_updated: '2024-01-10T08:15:00Z', 
            tag_count: 3,
            size: 512000 
        }
    ];

    /**
     * Mock tag data for testing
     */
    const mockTags = [
        { 
            name: 'v2.1.0', 
            created_at: '2024-01-15T10:00:00Z', 
            size: 512000 
        },
        { 
            name: 'v1.0.0', 
            created_at: '2024-01-10T08:15:00Z', 
            size: 256000 
        },
        { 
            name: 'latest', 
            created_at: '2024-01-20T14:30:00Z', 
            size: 1024000 
        }
    ];

    /**
     * Test sorting by name
     */
    function testNameSorting() {
        console.group('Testing Name Sorting');
        
        if (!App.SortUtils) {
            console.error('App.SortUtils not available');
            return false;
        }

        try {
            // Test ascending
            const ascResult = App.SortUtils.sortRepositories(mockRepositories, 'name-asc');
            const ascNames = ascResult.map(r => r.name);
            const expectedAsc = ['alpha-service', 'beta-tool', 'zebra-app'];
            
            console.log('Name ASC:', ascNames);
            console.log('Expected ASC:', expectedAsc);
            
            const ascCorrect = JSON.stringify(ascNames) === JSON.stringify(expectedAsc);
            console.log('Name ASC correct:', ascCorrect);

            // Test descending
            const descResult = App.SortUtils.sortRepositories(mockRepositories, 'name-desc');
            const descNames = descResult.map(r => r.name);
            const expectedDesc = ['zebra-app', 'beta-tool', 'alpha-service'];
            
            console.log('Name DESC:', descNames);
            console.log('Expected DESC:', expectedDesc);
            
            const descCorrect = JSON.stringify(descNames) === JSON.stringify(expectedDesc);
            console.log('Name DESC correct:', descCorrect);

            console.groupEnd();
            return ascCorrect && descCorrect;

        } catch (error) {
            console.error('Error in name sorting test:', error);
            console.groupEnd();
            return false;
        }
    }

    /**
     * Test sorting by date
     */
    function testDateSorting() {
        console.group('Testing Date Sorting');
        
        if (!App.SortUtils) {
            console.error('App.SortUtils not available');
            return false;
        }

        try {
            // Test descending (newest first)
            const descResult = App.SortUtils.sortRepositories(mockRepositories, 'date-desc');
            const descNames = descResult.map(r => r.name);
            const expectedDesc = ['alpha-service', 'zebra-app', 'beta-tool']; // Based on last_updated dates
            
            console.log('Date DESC:', descNames);
            console.log('Expected DESC:', expectedDesc);
            
            const descCorrect = JSON.stringify(descNames) === JSON.stringify(expectedDesc);
            console.log('Date DESC correct:', descCorrect);

            console.groupEnd();
            return descCorrect;

        } catch (error) {
            console.error('Error in date sorting test:', error);
            console.groupEnd();
            return false;
        }
    }

    /**
     * Test sorting by tag count
     */
    function testTagCountSorting() {
        console.group('Testing Tag Count Sorting');
        
        if (!App.SortUtils) {
            console.error('App.SortUtils not available');
            return false;
        }

        try {
            // Test descending (most tags first)
            const descResult = App.SortUtils.sortRepositories(mockRepositories, 'tags-desc');
            const descData = descResult.map(r => ({ name: r.name, count: r.tag_count }));
            const expectedDesc = [
                { name: 'alpha-service', count: 12 },
                { name: 'zebra-app', count: 5 },
                { name: 'beta-tool', count: 3 }
            ];
            
            console.log('Tags DESC:', descData);
            console.log('Expected DESC:', expectedDesc);
            
            const descCorrect = JSON.stringify(descData) === JSON.stringify(expectedDesc);
            console.log('Tags DESC correct:', descCorrect);

            console.groupEnd();
            return descCorrect;

        } catch (error) {
            console.error('Error in tag count sorting test:', error);
            console.groupEnd();
            return false;
        }
    }

    /**
     * Test tag sorting
     */
    function testTagSorting() {
        console.group('Testing Tag Sorting');
        
        if (!App.SortUtils) {
            console.error('App.SortUtils not available');
            return false;
        }

        try {
            // Test name ascending
            const ascResult = App.SortUtils.sortTags(mockTags, 'name-asc');
            const ascNames = ascResult.map(t => t.name);
            const expectedAsc = ['latest', 'v1.0.0', 'v2.1.0'];
            
            console.log('Tag Name ASC:', ascNames);
            console.log('Expected ASC:', expectedAsc);
            
            const ascCorrect = JSON.stringify(ascNames) === JSON.stringify(expectedAsc);
            console.log('Tag Name ASC correct:', ascCorrect);

            console.groupEnd();
            return ascCorrect;

        } catch (error) {
            console.error('Error in tag sorting test:', error);
            console.groupEnd();
            return false;
        }
    }

    /**
     * Test sort string parsing
     */
    function testSortStringParsing() {
        console.group('Testing Sort String Parsing');
        
        if (!App.SortUtils) {
            console.error('App.SortUtils not available');
            return false;
        }

        try {
            const tests = [
                { input: 'name-asc', expected: { field: 'name', direction: 'asc' } },
                { input: 'date-desc', expected: { field: 'date', direction: 'desc' } },
                { input: 'tags-desc', expected: { field: 'tags', direction: 'desc' } },
                { input: 'invalid', expected: { field: 'invalid', direction: 'asc' } },
                { input: '', expected: { field: 'name', direction: 'asc' } },
                { input: null, expected: { field: 'name', direction: 'asc' } }
            ];

            let allCorrect = true;
            tests.forEach(test => {
                const result = App.SortUtils.parseSortString(test.input);
                const correct = JSON.stringify(result) === JSON.stringify(test.expected);
                console.log(`Parse "${test.input}":`, result, correct ? '✓' : '✗');
                if (!correct) allCorrect = false;
            });

            console.log('All parsing tests correct:', allCorrect);
            console.groupEnd();
            return allCorrect;

        } catch (error) {
            console.error('Error in parsing test:', error);
            console.groupEnd();
            return false;
        }
    }

    /**
     * Run all tests
     */
    function runAllTests() {
        console.group('🧪 Running Sort Functionality Tests');
        console.log('Starting sort tests...');

        const results = {
            nameSorting: testNameSorting(),
            dateSorting: testDateSorting(),
            tagCountSorting: testTagCountSorting(),
            tagSorting: testTagSorting(),
            sortStringParsing: testSortStringParsing()
        };

        const passedTests = Object.values(results).filter(Boolean).length;
        const totalTests = Object.keys(results).length;

        console.log('\n📊 Test Results:');
        Object.entries(results).forEach(([test, passed]) => {
            console.log(`${passed ? '✅' : '❌'} ${test}`);
        });

        console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests === totalTests) {
            console.log('🎉 All sorting tests passed!');
        } else {
            console.warn(`⚠️ ${totalTests - passedTests} tests failed`);
        }

        console.groupEnd();
        return passedTests === totalTests;
    }

    // Public API
    return {
        runAllTests,
        testNameSorting,
        testDateSorting,
        testTagCountSorting,
        testTagSorting,
        testSortStringParsing
    };
})();

// Auto-run tests when SortUtils is available (for development)
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function() {
        // Wait a bit for all modules to load
        setTimeout(function() {
            if (App.SortUtils && window.location.hash === '#debug') {
                console.log('🔧 Debug mode detected, running sort tests...');
                App.SortTests.runAllTests();
            }
        }, 1000);
    });
}