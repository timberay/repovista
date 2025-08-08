// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Sorting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.repository-card');
  });

  test('should sort repositories by name (A-Z)', async ({ page }) => {
    // Select sort by name ascending
    const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
    await sortSelect.selectOption('name_asc');
    
    // Wait for re-render
    await page.waitForTimeout(500);
    
    // Get all repository names
    const repoNames = await page.locator('.repository-name').allTextContents();
    
    // Check if sorted alphabetically
    const sortedNames = [...repoNames].sort((a, b) => a.localeCompare(b));
    expect(repoNames).toEqual(sortedNames);
  });

  test('should sort repositories by name (Z-A)', async ({ page }) => {
    // Select sort by name descending
    const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
    await sortSelect.selectOption('name_desc');
    
    // Wait for re-render
    await page.waitForTimeout(500);
    
    // Get all repository names
    const repoNames = await page.locator('.repository-name').allTextContents();
    
    // Check if sorted reverse alphabetically
    const sortedNames = [...repoNames].sort((a, b) => b.localeCompare(a));
    expect(repoNames).toEqual(sortedNames);
  });

  test('should sort repositories by last updated (newest first)', async ({ page }) => {
    // Select sort by date descending
    const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
    await sortSelect.selectOption('updated_desc');
    
    // Wait for re-render
    await page.waitForTimeout(500);
    
    // Get all last updated dates
    const dateElements = await page.locator('.last-updated').all();
    const dates = [];
    
    for (const element of dateElements) {
      const dateText = await element.getAttribute('data-timestamp');
      if (dateText) {
        dates.push(new Date(dateText).getTime());
      }
    }
    
    // Check if sorted by date descending
    const sortedDates = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sortedDates);
  });

  test('should sort repositories by last updated (oldest first)', async ({ page }) => {
    // Select sort by date ascending
    const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
    await sortSelect.selectOption('updated_asc');
    
    // Wait for re-render
    await page.waitForTimeout(500);
    
    // Get all last updated dates
    const dateElements = await page.locator('.last-updated').all();
    const dates = [];
    
    for (const element of dateElements) {
      const dateText = await element.getAttribute('data-timestamp');
      if (dateText) {
        dates.push(new Date(dateText).getTime());
      }
    }
    
    // Check if sorted by date ascending
    const sortedDates = [...dates].sort((a, b) => a - b);
    expect(dates).toEqual(sortedDates);
  });

  test('should persist sort option in URL', async ({ page }) => {
    // Select sort option
    const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
    await sortSelect.selectOption('name_desc');
    
    // Check URL contains sort param
    const url = new URL(page.url());
    expect(url.searchParams.get('sort')).toBe('name_desc');
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Sort option should be preserved
    const selectedOption = await sortSelect.inputValue();
    expect(selectedOption).toBe('name_desc');
  });

  test('should maintain sort order when searching', async ({ page }) => {
    // Set sort order
    const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
    await sortSelect.selectOption('name_asc');
    await page.waitForTimeout(500);
    
    // Search for repositories
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('ubuntu');
    await page.waitForTimeout(500);
    
    // Get filtered repository names
    const repoNames = await page.locator('.repository-name').allTextContents();
    
    // Check if still sorted alphabetically
    const sortedNames = [...repoNames].sort((a, b) => a.localeCompare(b));
    expect(repoNames).toEqual(sortedNames);
  });
});