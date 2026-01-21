import type { Page } from '@playwright/test';
import type { ScrapeConfig, Template } from './types';

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

export function buildClassDataUrlFromTemplate(template: Template, cfg: ScrapeConfig, cnKey: string, va: string): string {
  const u = new URL(template.baseUrl);

  // Apply sanitized template params first (tokens/session params)
  for (const [k, v] of Object.entries(template.params)) {
    u.searchParams.set(k, v);
  }

  // Force a single-course request
  u.searchParams.set('term', cfg.termId);
  u.searchParams.set('course_0_0', cnKey);
  u.searchParams.set('va_0_0', va);
  u.searchParams.set('rq_0_0', '');

  // Cachebuster
  u.searchParams.set('_', Date.now().toString());

  return u.toString();
}
