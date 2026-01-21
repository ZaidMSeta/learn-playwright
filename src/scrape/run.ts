/**
 * run.ts
 *
 * Runs the end-to-end scrape:
 * - loads input courses and resume state
 * - captures a template class-data URL from the UI
 * - resolves each human course code -> (cnKey, va)
 * - fetches /api/class-data for that course using the template params
 * - retries once by refreshing the template if tokens are stale
 */


import type { Page } from '@playwright/test';
import type { ScrapeConfig, Template } from './types';
import { getDefaultConfig, getPaths } from './config';
import { ensureDirs, loadCourses, loadProcessed, appendResult, saveCourseXml } from './io';
import { extractFirstXmlError, isNotAuthorized, isTimeTokenError } from './errors';
import { installApiSafetyRoutes } from './safety';
import { getSuggestionLabels, makeXmlParser, resolveCourse } from './api';
import { buildClassDataUrlFromTemplate, captureTemplateFromUI } from './template';

// We capture a real class-data request once 
// request URL contains session/token query params (e.g., t/e) that expire
// We keep those params as a reusable "template" and only swap in cnKey/va per course
// If server responds with the token error, recapture a fresh template and retry

async function fetchClassDataUsingTemplate(page: Page, template: Template, cfg: ScrapeConfig, cnKey: string, va: string) {
  const url = buildClassDataUrlFromTemplate(template, cfg, cnKey, va);
  const res = await page.request.get(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://mytimetable.mcmaster.ca/criteria.jsp',
    },
  });

  return { status: res.status(), xml: await res.text(), url };
}

// - Resolve course code to internal identifiers.
// - Fetch class data XML.
// - Save XML regardless of success.
// - Mark success/failure based on presence of <error> in XML.
// - Append a structured record to NDJSON so it can resume.

export async function runScrape(page: Page, cfg: ScrapeConfig = getDefaultConfig()) {
  const paths = getPaths(cfg);
  await ensureDirs(paths);
  await installApiSafetyRoutes(page);

  const courses = await loadCourses(paths.coursesPath);
  const processed = await loadProcessed(paths.resultsPath);

  const xmlParser = makeXmlParser();

  // Suggestions pool for picking a label to trigger class-data (token/template capture)
  let suggestionLabels = await getSuggestionLabels(page, cfg, xmlParser);
  let suggestionIdx = 0;

  async function nextSuggestionLabel(): Promise<string> {
    if (suggestionIdx >= suggestionLabels.length) {
      suggestionLabels = await getSuggestionLabels(page, cfg, xmlParser);
      suggestionIdx = 0;
    }
    return suggestionLabels[suggestionIdx++];
  }

  // Capture initial template
  let template = await captureTemplateFromUI(page, cfg, await nextSuggestionLabel());

  let okCount = 0;
  let failCount = 0;

  for (const humanCourse of courses) {
    if (processed.has(humanCourse)) continue;

    const processedSoFar = okCount + failCount;
    if (processedSoFar > 0 && processedSoFar % 50 === 0) {
      console.log(`Progress: ${processedSoFar} processed (ok=${okCount}, fail=${failCount})`);
    }

    // 1) Resolve
    const resolved = await resolveCourse(page, cfg, humanCourse);
    if (!resolved.ok) {
      failCount++;
      processed.add(humanCourse);
      await appendResult(paths.resultsPath, { course: humanCourse, ok: false, stage: 'resolve', error: resolved.error });
      continue;
    }

    const { cnKey, va } = resolved;

    // 2) Fetch class-data (retry once on token error by refreshing template)
    let response = await fetchClassDataUsingTemplate(page, template, cfg, cnKey, va);

    if (isTimeTokenError(response.xml)) {
      template = await captureTemplateFromUI(page, cfg, await nextSuggestionLabel());
      response = await fetchClassDataUsingTemplate(page, template, cfg, cnKey, va);
    }

    if (isNotAuthorized(response.xml)) {
      await appendResult(paths.resultsPath, {
        course: humanCourse,
        ok: false,
        stage: 'class-data',
        cnKey,
        va,
        httpStatus: response.status,
        error: 'Not Authorized (session expired). Re-run auth.setup to refresh auth.storage.json.',
      });
      throw new Error('Not Authorized: session expired. Re-run auth.setup to refresh auth.storage.json.');
    }

    // 3) Save raw XML always
    const { xmlRel } = await saveCourseXml(cfg.termId, cnKey, response.xml);

    // 4) Mark success/failure based on <error>
    const xmlError = extractFirstXmlError(response.xml);

    if (xmlError) {
      failCount++;
      processed.add(humanCourse);
      await appendResult(paths.resultsPath, {
        course: humanCourse,
        ok: false,
        stage: 'class-data',
        cnKey,
        va,
        httpStatus: response.status,
        xmlPath: xmlRel,
        error: xmlError,
      });
    } else {
      okCount++;
      processed.add(humanCourse);
      await appendResult(paths.resultsPath, {
        course: humanCourse,
        ok: true,
        cnKey,
        va,
        httpStatus: response.status,
        xmlPath: xmlRel,
      });
    }

    await page.waitForTimeout(cfg.delayMs);
  }

  console.log(`Done. ok=${okCount}, fail=${failCount}, total=${okCount + failCount}`);
}
