/**
 * scrape.spec.ts
 *
 * Playwright "test" entrypoint that runs the scraper with a real browser context.
 * Uses storageState (auth.storage.json) so page.request calls are authenticated.
 *
 */


import { test } from '@playwright/test';
import { runScrape } from '../src/scrape/run';

test.use({ storageState: 'auth.storage.json' });

test('Scrape all courses (logged in) and save class-data XML', async ({ page }) => {
  test.setTimeout(0);
  await runScrape(page);
});
