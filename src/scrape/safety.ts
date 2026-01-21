/**
 * safety.ts
 *
 * Network guardrails to reduce risk to personal schedule while scraping.
 * intercept requests to mytimetable.mcmaster.ca/api/* and:
 * - abort telemetry (report-usage)
 * - allow GET requests (read-only)
 * - allow POST /api/string-to-filter (resolver used by scraper)
 * - block any other non-GET API call to avoid accidental changes to accounts schedule
 *
 */


import type { Page } from '@playwright/test';

export async function installApiSafetyRoutes(page: Page) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (!url.startsWith('https://mytimetable.mcmaster.ca/api/')) {
      return route.continue();
    }

    if (url.startsWith('https://mytimetable.mcmaster.ca/api/report-usage')) {
      return route.abort();
    }

    if (method === 'GET') {
      return route.continue();
    }

    if (
      method === 'POST' &&
      url.startsWith('https://mytimetable.mcmaster.ca/api/string-to-filter')
    ) {
      return route.continue();
    }

    throw new Error(`Blocked non-GET API call: ${method} ${url}`);
  });
}
