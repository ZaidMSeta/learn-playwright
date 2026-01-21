/**
 * template.ts
 *
 * MyTimetable's /api/class-data requests include session/token query parameters
 * that are easiest to obtain by letting the UI generate a real request.
 *
 * - captures a real /api/class-data URL from the UI once
 * - sanitizes the captured query params to remove course-specific fields
 * - rebuilds class-data URLs by reusing the template params + injecting cnKey/va
 *
 * If tokens expire, run.ts recaptures a fresh template and retries once.
 */


import type { Page } from '@playwright/test';
import type { ScrapeConfig, Template } from './types';

// Remove query params that depend on which courses are currently loaded in the UI.

export function sanitizeTemplateParams(params: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};

  for (const [k, v] of Object.entries(params)) {
    // Strip anything that encodes “currently loaded” course list
    if (/^(course|va|rq)_\d+_\d+$/.test(k)) continue;

    // Avoid forcing guest mode if present
    if (k === 'nouser') continue;

    cleaned[k] = v;
  }
  return cleaned;
}

// Trigger a real class-data request by selecting a course suggestion in the UI.
// then capture the request URL and keep its query params as a template.

export async function captureTemplateFromUI(page: Page, cfg: ScrapeConfig, label: string): Promise<Template> {
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');
  await page.getByRole('link', { name: cfg.termLinkText }).click();

  const courseBox = page.getByRole('combobox', { name: /Select Course/i });
  const reqPromise = page.waitForRequest((req) => req.url().includes('/api/class-data'));

  await courseBox.fill(label);
  await courseBox.press('Enter');

  const req = await reqPromise;
  const u = new URL(req.url());

  const params: Record<string, string> = {};
  for (const [k, v] of u.searchParams.entries()) params[k] = v;

  return {
    baseUrl: `${u.origin}${u.pathname}`,
    params: sanitizeTemplateParams(params),
  };
}

// Build a class-data URL that reuses the captured template
// forces a single-course request by setting course_0_0 and va_0_0.
export function buildClassDataUrlFromTemplate(template: Template, cfg: ScrapeConfig, cnKey: string, va: string): string {
  const u = new URL(template.baseUrl);

  for (const [k, v] of Object.entries(template.params)) {
    u.searchParams.set(k, v);
  }

  // Force a single-course request
  u.searchParams.set('term', cfg.termId);
  u.searchParams.set('course_0_0', cnKey);
  u.searchParams.set('va_0_0', va);
  u.searchParams.set('rq_0_0', '');

  u.searchParams.set('_', Date.now().toString());

  return u.toString();
}
