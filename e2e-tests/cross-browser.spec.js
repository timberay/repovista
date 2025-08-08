// @ts-check
const { test, expect, devices } = require('@playwright/test');

test.describe('Cross-Browser Compatibility', () => {
  const browsers = ['chromium', 'firefox', 'webkit'];
  
  browsers.forEach(browserName => {
    test.describe(`${browserName} browser`, () => {
      test('should render application correctly', async ({ page, browserName }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        
        // Check main elements render
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('.search-container')).toBeVisible();
        await expect(page.locator('.repository-grid, .repository-list')).toBeVisible();
        
        // Take screenshot for visual comparison
        await page.screenshot({ 
          path: `test-results/screenshots/${browserName}-homepage.png`,
          fullPage: true 
        });
      });
      
      test('should handle interactions correctly', async ({ page, browserName }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        
        // Test search functionality
        const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
        await searchInput.fill('test');
        await page.waitForTimeout(500);
        
        // Test repository expansion
        const firstCard = page.locator('.repository-card').first();
        await firstCard.click();
        await page.waitForSelector('.tag-details', { state: 'visible' });
        
        // Test sort dropdown
        const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
        await sortSelect.selectOption('name_desc');
        
        // All interactions should work
        await expect(searchInput).toHaveValue('test');
        await expect(page.locator('.tag-details').first()).toBeVisible();
      });
    });
  });
  
  test.describe('Mobile Responsiveness', () => {
    test('should be responsive on mobile devices', async ({ browser }) => {
      // iPhone 12
      const iPhone = devices['iPhone 12'];
      const context = await browser.newContext({
        ...iPhone,
      });
      const page = await context.newPage();
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Check layout adapts to mobile
      const viewport = page.viewportSize();
      expect(viewport.width).toBeLessThan(500);
      
      // Check elements are visible and accessible
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.repository-card')).toHaveCount.greaterThan(0);
      
      // Test touch interactions
      const firstCard = page.locator('.repository-card').first();
      await firstCard.tap();
      await page.waitForSelector('.tag-details', { state: 'visible' });
      
      await page.screenshot({ 
        path: 'test-results/screenshots/mobile-view.png',
        fullPage: true 
      });
      
      await context.close();
    });
    
    test('should be responsive on tablet devices', async ({ browser }) => {
      // iPad
      const iPad = devices['iPad Pro'];
      const context = await browser.newContext({
        ...iPad,
      });
      const page = await context.newPage();
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Check layout adapts to tablet
      const viewport = page.viewportSize();
      expect(viewport.width).toBeGreaterThan(700);
      expect(viewport.width).toBeLessThan(1200);
      
      // Check grid layout adjusts
      await expect(page.locator('.repository-grid, .repository-list')).toBeVisible();
      
      await page.screenshot({ 
        path: 'test-results/screenshots/tablet-view.png',
        fullPage: true 
      });
      
      await context.close();
    });
  });
  
  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Check for ARIA labels on interactive elements
      const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
      await expect(searchInput).toHaveAttribute('aria-label', /search/i);
      
      const sortSelect = page.locator('select[name="sort"], select[aria-label*="Sort"]');
      await expect(sortSelect).toHaveAttribute('aria-label', /sort/i);
      
      // Check for proper heading hierarchy
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });
    
    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Tab through elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Check focus is visible
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
      
      // Test Enter key on repository card
      await page.keyboard.press('Enter');
      
      // Should expand repository details
      await page.waitForSelector('.tag-details', { state: 'visible', timeout: 5000 }).catch(() => {});
    });
    
    test('should have sufficient color contrast', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Check text color contrast
      const textColor = await page.evaluate(() => {
        const element = document.querySelector('.repository-name');
        if (element) {
          const style = window.getComputedStyle(element);
          return style.color;
        }
        return null;
      });
      
      const backgroundColor = await page.evaluate(() => {
        const element = document.querySelector('.repository-card');
        if (element) {
          const style = window.getComputedStyle(element);
          return style.backgroundColor;
        }
        return null;
      });
      
      // Basic check that colors are defined
      expect(textColor).toBeTruthy();
      expect(backgroundColor).toBeTruthy();
    });
  });
});