import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiResponseTime = new Trend('api_response_time');
const repositoriesLoadTime = new Trend('repositories_load_time');
const tagsLoadTime = new Trend('tags_load_time');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 20 },   // Stay at 20 users for 1 minute
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests under 500ms, 99% under 1s
    errors: ['rate<0.1'],                            // Error rate under 10%
    repositories_load_time: ['p(95)<300'],           // Repository list loads under 300ms
    tags_load_time: ['p(95)<400'],                   // Tags load under 400ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// Helper function to make API requests
function makeRequest(url, name) {
  const start = Date.now();
  const response = http.get(url);
  const duration = Date.now() - start;
  
  const success = check(response, {
    [`${name} status is 200`]: (r) => r.status === 200,
    [`${name} response time < 500ms`]: (r) => r.timings.duration < 500,
    [`${name} has valid JSON`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  apiResponseTime.add(duration);
  
  return response;
}

export default function () {
  // Test 1: Load repository list
  const repoListResponse = makeRequest(
    `${BASE_URL}/api/repositories?page=1&limit=20`,
    'Repository List'
  );
  repositoriesLoadTime.add(repoListResponse.timings.duration);
  
  // Parse repository list
  let repositories = [];
  try {
    const data = JSON.parse(repoListResponse.body);
    repositories = data.repositories || [];
  } catch (e) {
    console.error('Failed to parse repository list');
  }
  
  sleep(1); // Think time between actions
  
  // Test 2: Search repositories
  makeRequest(
    `${BASE_URL}/api/repositories?search=nginx&page=1&limit=20`,
    'Repository Search'
  );
  
  sleep(0.5);
  
  // Test 3: Sort repositories
  makeRequest(
    `${BASE_URL}/api/repositories?sort=name_desc&page=1&limit=20`,
    'Repository Sort'
  );
  
  sleep(0.5);
  
  // Test 4: Load tags for random repository
  if (repositories.length > 0) {
    const randomRepo = repositories[Math.floor(Math.random() * repositories.length)];
    const tagsResponse = makeRequest(
      `${BASE_URL}/api/repositories/${encodeURIComponent(randomRepo.name)}/tags`,
      'Repository Tags'
    );
    tagsLoadTime.add(tagsResponse.timings.duration);
  }
  
  sleep(1);
  
  // Test 5: Pagination
  makeRequest(
    `${BASE_URL}/api/repositories?page=2&limit=20`,
    'Pagination'
  );
  
  sleep(0.5);
  
  // Test 6: Different page sizes
  const pageSizes = [20, 50, 100];
  const randomPageSize = pageSizes[Math.floor(Math.random() * pageSizes.length)];
  makeRequest(
    `${BASE_URL}/api/repositories?page=1&limit=${randomPageSize}`,
    `Page Size ${randomPageSize}`
  );
  
  sleep(2); // Longer think time before next iteration
}

// Handle summary generation
export function handleSummary(data) {
  return {
    'performance-report.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>RepoVista Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; }
        .success { color: green; }
        .failure { color: red; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
    </style>
</head>
<body>
    <h1>Performance Test Report</h1>
    <div class="metric">
        <h2>Test Configuration</h2>
        <p>Duration: ${data.state.testRunDurationMs / 1000}s</p>
        <p>Max VUs: ${data.metrics.vus.max}</p>
        <p>Total Requests: ${data.metrics.http_reqs.count}</p>
    </div>
    <div class="metric">
        <h2>Key Metrics</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Threshold</th>
                <th>Status</th>
            </tr>
            <tr>
                <td>Error Rate</td>
                <td>${(data.metrics.errors.rate * 100).toFixed(2)}%</td>
                <td>&lt; 10%</td>
                <td class="${data.metrics.errors.rate < 0.1 ? 'success' : 'failure'}">
                    ${data.metrics.errors.rate < 0.1 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
            <tr>
                <td>P95 Response Time</td>
                <td>${data.metrics.http_req_duration.p95.toFixed(2)}ms</td>
                <td>&lt; 500ms</td>
                <td class="${data.metrics.http_req_duration.p95 < 500 ? 'success' : 'failure'}">
                    ${data.metrics.http_req_duration.p95 < 500 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
            <tr>
                <td>P99 Response Time</td>
                <td>${data.metrics.http_req_duration.p99.toFixed(2)}ms</td>
                <td>&lt; 1000ms</td>
                <td class="${data.metrics.http_req_duration.p99 < 1000 ? 'success' : 'failure'}">
                    ${data.metrics.http_req_duration.p99 < 1000 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
        </table>
    </div>
    <div class="metric">
        <h2>Detailed Metrics</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Min</th>
                <th>Median</th>
                <th>P95</th>
                <th>P99</th>
                <th>Max</th>
            </tr>
            <tr>
                <td>HTTP Request Duration</td>
                <td>${data.metrics.http_req_duration.min.toFixed(2)}ms</td>
                <td>${data.metrics.http_req_duration.med.toFixed(2)}ms</td>
                <td>${data.metrics.http_req_duration.p95.toFixed(2)}ms</td>
                <td>${data.metrics.http_req_duration.p99.toFixed(2)}ms</td>
                <td>${data.metrics.http_req_duration.max.toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>Repository Load Time</td>
                <td>${data.metrics.repositories_load_time.min.toFixed(2)}ms</td>
                <td>${data.metrics.repositories_load_time.med.toFixed(2)}ms</td>
                <td>${data.metrics.repositories_load_time.p95.toFixed(2)}ms</td>
                <td>${data.metrics.repositories_load_time.p99.toFixed(2)}ms</td>
                <td>${data.metrics.repositories_load_time.max.toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>Tags Load Time</td>
                <td>${data.metrics.tags_load_time.min.toFixed(2)}ms</td>
                <td>${data.metrics.tags_load_time.med.toFixed(2)}ms</td>
                <td>${data.metrics.tags_load_time.p95.toFixed(2)}ms</td>
                <td>${data.metrics.tags_load_time.p99.toFixed(2)}ms</td>
                <td>${data.metrics.tags_load_time.max.toFixed(2)}ms</td>
            </tr>
        </table>
    </div>
</body>
</html>
  `;
}

function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;
  const color = enableColors ? {
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  } : {
    green: (text) => text,
    red: (text) => text,
    yellow: (text) => text,
  };
  
  let summary = '\n=== Performance Test Summary ===\n\n';
  
  // Overall status
  const errorRate = data.metrics.errors.rate;
  const p95 = data.metrics.http_req_duration.p95;
  const p99 = data.metrics.http_req_duration.p99;
  
  const allPassed = errorRate < 0.1 && p95 < 500 && p99 < 1000;
  summary += allPassed 
    ? color.green('✓ All thresholds passed!\n\n')
    : color.red('✗ Some thresholds failed!\n\n');
  
  // Key metrics
  summary += 'Key Metrics:\n';
  summary += `${indent}Error Rate: ${(errorRate * 100).toFixed(2)}% `;
  summary += errorRate < 0.1 ? color.green('✓') : color.red('✗');
  summary += '\n';
  
  summary += `${indent}P95 Response Time: ${p95.toFixed(2)}ms `;
  summary += p95 < 500 ? color.green('✓') : color.red('✗');
  summary += '\n';
  
  summary += `${indent}P99 Response Time: ${p99.toFixed(2)}ms `;
  summary += p99 < 1000 ? color.green('✓') : color.red('✗');
  summary += '\n\n';
  
  // Test statistics
  summary += 'Test Statistics:\n';
  summary += `${indent}Duration: ${(data.state.testRunDurationMs / 1000).toFixed(1)}s\n`;
  summary += `${indent}Total Requests: ${data.metrics.http_reqs.count}\n`;
  summary += `${indent}Requests/sec: ${data.metrics.http_reqs.rate.toFixed(2)}\n`;
  summary += `${indent}Max VUs: ${data.metrics.vus.max}\n`;
  
  return summary;
}