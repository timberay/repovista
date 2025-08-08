// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Tag Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should expand repository to show tag details', async ({ page }) => {
    // Wait for repository cards to load
    await page.waitForSelector('.repository-card');
    
    // Click on the first repository card
    const firstCard = page.locator('.repository-card').first();
    await firstCard.click();
    
    // Wait for accordion to expand
    await page.waitForSelector('.tag-details', { state: 'visible' });
    
    // Check that tag details are displayed
    const tagDetails = page.locator('.tag-details').first();
    await expect(tagDetails).toBeVisible();
    
    // Check for tag list
    const tagItems = tagDetails.locator('.tag-item');
    await expect(tagItems).toHaveCount.greaterThan(0);
  });

  test('should display tag information correctly', async ({ page }) => {
    // Expand first repository
    await page.locator('.repository-card').first().click();
    await page.waitForSelector('.tag-details', { state: 'visible' });
    
    // Check tag item structure
    const firstTag = page.locator('.tag-item').first();
    await expect(firstTag.locator('.tag-name')).toBeVisible();
    await expect(firstTag.locator('.tag-digest')).toBeVisible();
    await expect(firstTag.locator('.tag-size')).toBeVisible();
    await expect(firstTag.locator('.tag-created')).toBeVisible();
  });

  test('should generate and display pull commands', async ({ page }) => {
    // Expand first repository
    await page.locator('.repository-card').first().click();
    await page.waitForSelector('.tag-details', { state: 'visible' });
    
    // Check for pull command
    const firstTag = page.locator('.tag-item').first();
    const pullCommand = firstTag.locator('.pull-command');
    await expect(pullCommand).toBeVisible();
    
    // Verify pull command format
    const commandText = await pullCommand.textContent();
    expect(commandText).toMatch(/^docker pull .+:.+$/);
  });

  test('should copy pull command to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Expand first repository
    await page.locator('.repository-card').first().click();
    await page.waitForSelector('.tag-details', { state: 'visible' });
    
    // Click copy button
    const copyButton = page.locator('.copy-button').first();
    await copyButton.click();
    
    // Check for success message
    await expect(page.locator('.copy-success')).toBeVisible();
    await expect(page.locator('.copy-success')).toContainText('Copied!');
    
    // Verify clipboard content (if supported)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/^docker pull .+:.+$/);
  });

  test('should collapse repository when clicked again', async ({ page }) => {
    // Expand first repository
    const firstCard = page.locator('.repository-card').first();
    await firstCard.click();
    await page.waitForSelector('.tag-details', { state: 'visible' });
    
    // Click again to collapse
    await firstCard.click();
    
    // Wait for collapse animation
    await page.waitForTimeout(500);
    
    // Check that tag details are hidden
    await expect(page.locator('.tag-details').first()).not.toBeVisible();
  });

  test('should handle repository with no tags', async ({ page }) => {
    // Intercept API call for specific repository
    await page.route('**/api/repositories/*/tags', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tags: [],
          total: 0
        })
      });
    });
    
    // Click on first repository
    await page.locator('.repository-card').first().click();
    
    // Check for empty state message
    await expect(page.locator('.no-tags-message')).toBeVisible();
    await expect(page.locator('.no-tags-message')).toContainText('No tags available');
  });

  test('should show loading state while fetching tags', async ({ page }) => {
    // Intercept and delay tag API response
    await page.route('**/api/repositories/*/tags', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
    
    // Click on first repository
    await page.locator('.repository-card').first().click();
    
    // Check for loading indicator in tag details
    await expect(page.locator('.tag-loading')).toBeVisible();
    
    // Wait for tags to load
    await page.waitForSelector('.tag-item', { timeout: 10000 });
    
    // Loading indicator should be hidden
    await expect(page.locator('.tag-loading')).not.toBeVisible();
  });
});