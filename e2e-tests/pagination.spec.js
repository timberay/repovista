// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Pagination', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API to return many repositories for pagination testing
    await page.route('**/api/repositories*', async route => {
      const url = new URL(route.request().url());
      const page_num = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      
      // Generate mock repositories
      const repositories = [];
      const total = 100; // Total repositories
      const start = (page_num - 1) * limit;
      const end = Math.min(start + limit, total);
      
      for (let i = start; i < end; i++) {
        repositories.push({
          name: `repository-${i + 1}`,
          tag_count: Math.floor(Math.random() * 20) + 1,
          last_updated: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString()
        });
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          repositories,
          total,
          page: page_num,
          limit
        })
      });
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display pagination controls', async ({ page }) => {
    // Check for pagination container
    await expect(page.locator('.pagination')).toBeVisible();
    
    // Check for page buttons
    await expect(page.locator('.pagination .page-button')).toHaveCount.greaterThan(0);
    
    // Check for previous/next buttons
    await expect(page.locator('.pagination .prev-button')).toBeVisible();
    await expect(page.locator('.pagination .next-button')).toBeVisible();
  });

  test('should navigate to next page', async ({ page }) => {
    // Get first repository name on page 1
    const firstRepoPage1 = await page.locator('.repository-name').first().textContent();
    
    // Click next button
    await page.locator('.pagination .next-button').click();
    await page.waitForTimeout(500);
    
    // Get first repository name on page 2
    const firstRepoPage2 = await page.locator('.repository-name').first().textContent();
    
    // Should be different repositories
    expect(firstRepoPage1).not.toBe(firstRepoPage2);
    
    // Check URL updated
    const url = new URL(page.url());
    expect(url.searchParams.get('page')).toBe('2');
  });

  test('should navigate to previous page', async ({ page }) => {
    // Go to page 2
    await page.locator('.pagination .next-button').click();
    await page.waitForTimeout(500);
    
    // Get first repository on page 2
    const firstRepoPage2 = await page.locator('.repository-name').first().textContent();
    
    // Click previous button
    await page.locator('.pagination .prev-button').click();
    await page.waitForTimeout(500);
    
    // Get first repository on page 1
    const firstRepoPage1 = await page.locator('.repository-name').first().textContent();
    
    // Should be back to page 1
    expect(firstRepoPage1).not.toBe(firstRepoPage2);
    expect(firstRepoPage1).toBe('repository-1');
  });

  test('should navigate to specific page', async ({ page }) => {
    // Click on page 3 button
    await page.locator('.pagination .page-button:has-text("3")').click();
    await page.waitForTimeout(500);
    
    // Check URL updated
    const url = new URL(page.url());
    expect(url.searchParams.get('page')).toBe('3');
    
    // Check active page indicator
    await expect(page.locator('.pagination .page-button.active')).toHaveText('3');
  });

  test('should disable previous button on first page', async ({ page }) => {
    // On first page, previous should be disabled
    await expect(page.locator('.pagination .prev-button')).toBeDisabled();
  });

  test('should disable next button on last page', async ({ page }) => {
    // Navigate to last page (page 5 with 20 items per page = 100 total)
    await page.locator('.pagination .page-button:has-text("5")').click();
    await page.waitForTimeout(500);
    
    // Next button should be disabled
    await expect(page.locator('.pagination .next-button')).toBeDisabled();
  });

  test('should change items per page', async ({ page }) => {
    // Select different limit
    const limitSelect = page.locator('select[name="limit"], select[aria-label*="per page"]');
    await limitSelect.selectOption('50');
    await page.waitForTimeout(500);
    
    // Should show more repositories
    const repoCount = await page.locator('.repository-card').count();
    expect(repoCount).toBeGreaterThan(20);
    expect(repoCount).toBeLessThanOrEqual(50);
    
    // Check URL updated
    const url = new URL(page.url());
    expect(url.searchParams.get('limit')).toBe('50');
  });

  test('should show page info', async ({ page }) => {
    // Check for page info text
    const pageInfo = page.locator('.page-info, .pagination-info');
    await expect(pageInfo).toBeVisible();
    await expect(pageInfo).toContainText(/Showing \d+-\d+ of \d+/);
  });

  test('should handle page navigation with search filter', async ({ page }) => {
    // Search for repositories
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('repository');
    await page.waitForTimeout(500);
    
    // Navigate to page 2
    await page.locator('.pagination .next-button').click();
    await page.waitForTimeout(500);
    
    // Search term should be preserved
    const searchValue = await searchInput.inputValue();
    expect(searchValue).toBe('repository');
    
    // URL should have both search and page params
    const url = new URL(page.url());
    expect(url.searchParams.get('search')).toBe('repository');
    expect(url.searchParams.get('page')).toBe('2');
  });

  test('should reset to page 1 when search changes', async ({ page }) => {
    // Go to page 2
    await page.locator('.pagination .next-button').click();
    await page.waitForTimeout(500);
    
    // Perform a search
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('test');
    await page.waitForTimeout(500);
    
    // Should reset to page 1
    const url = new URL(page.url());
    expect(url.searchParams.get('page')).toBe('1');
    await expect(page.locator('.pagination .page-button.active')).toHaveText('1');
  });
});