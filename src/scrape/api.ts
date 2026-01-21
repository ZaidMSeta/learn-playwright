/**
 * api.ts
 * 
 * Client for MyTimetables API endpoints to use for scraping
 * 
 * - creates an xml parser with consistent settings
 * - call api/courses/suggestions to get a valid course to generate t/e tokens for template
 * - call /api/string-to-filter to resolve ccourse codes
 */

import type { Page } from '@playwright/test';
import { XMLParser } from 'fast-xml-parser';
import type { ResolveResult, ScrapeConfig } from './types';

export function makeXmlParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
}
// Build the suggestions endpoint URL.
// returns XML containing course suggestion labels used by the UI dropdown.

export async function getSuggestionLabels(page: Page, cfg: ScrapeConfig, xmlParser: XMLParser): Promise<string[]> {
  const suggestionsUrl =
    `https://mytimetable.mcmaster.ca/api/courses/suggestions` +
    `?term=${cfg.termId}` +
    `&cams=${cfg.cams}` +
    `&course_add=a` +
    `&page_num=0&sco=0&sio=1&already=` +
    `&_=${Date.now()}`;

  const res = await page.request.get(suggestionsUrl, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  if (res.status() !== 200) {
    throw new Error(`suggestions endpoint returned HTTP ${res.status()}`);
  }

  const xml = await res.text();
  const obj = xmlParser.parse(xml);

  const rs = obj?.add_suggest?.results?.rs;
  const items = Array.isArray(rs) ? rs : rs ? [rs] : [];
  return items.map((it: any) => it['#text']).filter(Boolean);
}
// Resolve a human readable course code into the internal
// identifiers required by /api/class-data:
// - cnKey: internal course key
// - va: value the backend expects alongside cnKey (not sure what it represents)
//
// The endpoint returns JSON and takes the first match.

export async function resolveCourse(page: Page, cfg: ScrapeConfig, humanCourse: string): Promise<ResolveResult> {
  const res = await page.request.post('https://mytimetable.mcmaster.ca/api/string-to-filter', {
    form: {
      term: cfg.termId,
      validations: '',
      itemnames: humanCourse,
      input: humanCourse.toLowerCase(),
      reason: 'CODE_NUMBER',
      current: '',
      isimport: '0',
      strict: '0',
    },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  const arr = await res.json();
  const first = arr?.[0];

  if (!first) return { ok: false, error: 'No resolver result' };
  if (first.error) return { ok: false, error: String(first.error) };

  return { ok: true, cnKey: String(first.cnKey), va: String(first.va) };
}
