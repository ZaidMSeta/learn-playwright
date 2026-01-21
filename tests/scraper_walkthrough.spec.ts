import { test } from '@playwright/test';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import path from 'node:path';

test.use({ storageState: 'auth.storage.json' });

test('Scrape all courses (logged in) and save class-data XML', async ({ page }) => {
  test.setTimeout(0);

  // -----------------------------
  // Configuration (semester-dependent)
  // -----------------------------
  const CAMS = 'MCMSTiOFF_MCMSTiMCMST_MCMSTiMHK_MCMSTiSNPOL_MCMSTiCON';

  // Auto-detected from the UI each run (Mode A).
  // Optional overrides if you ever want to force a specific term:
  //   TERM_ID=3202610 TERM_LINK_TEXT="2026 Winter" TERM_SEASON=Winter npx playwright test ...
  let TERM_ID = process.env.TERM_ID ?? '';
  let TERM_LINK_TEXT = process.env.TERM_LINK_TEXT ?? '';


  // pacing: be gentle
  const DELAY_MS = 250;

  // -----------------------------
  // Paths / output layout
  // -----------------------------
  const coursesPath = path.join(process.cwd(), 'courses.txt');

  const outDir = path.join(process.cwd(), 'out');
  let xmlDir = '';
  let resultsPath = '';


  async function appendResult(record: any) {
    await fs.appendFile(resultsPath, JSON.stringify(record) + '\n', 'utf8');
  }




  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
  
    // Only guard MyTimetable API calls; let everything else load normally.
    if (!url.startsWith('https://mytimetable.mcmaster.ca/api/')) {
      return route.continue();
    }
  
    // Drop telemetry without failing the test.
    if (url.startsWith('https://mytimetable.mcmaster.ca/api/report-usage')) {
      return route.abort(); // or route.fulfill({ status: 204, body: '' })
    }
  
    // Allow all GET API requests (UI boot + scraping).
    if (method === 'GET') {
      return route.continue();
    }
  
    // Allow our intentional resolver POST.
    if (
      method === 'POST' &&
      url.startsWith('https://mytimetable.mcmaster.ca/api/string-to-filter')
    ) {
      return route.continue();
    }
  
    // Block any other non-GET API call as a safety belt.
    // Safety belt: we don't want non-GET API calls to go out (could be mutating),
    // but we also don't want harmless telemetry to fail the whole run.
    return route.abort();

  });

    // -----------------------------
  // Mode A: auto-detect term from the welcome term cards
  // Reads links like: "2026 Winter" with href "javascript:UU.caseTermContinue(3202610);"
  // -----------------------------
  async function detectTermFromUI(): Promise<{ termId: string; termLabel: string }> {
    await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');

    const termLinks = page.locator('a.term-card-title');
    await termLinks.first().waitFor({ state: 'visible' });

    const terms = await termLinks.evaluateAll((els) => {
      return els
        .map((a) => {
          const label = (a.textContent ?? '').trim();
          const href = (a as HTMLAnchorElement).getAttribute('href') ?? '';
          const m = href.match(/caseTermContinue\((\d+)\)/);
          const id = m ? m[1] : null;
          return id && label ? { id, label } : null;
        })
        .filter(Boolean) as { id: string; label: string }[];
    });

    if (!terms.length) {
      throw new Error('Could not find any term cards (a.term-card-title).');
    }

    const yearFrom = (label: string) => {
      const m = label.match(/(20\d{2})/);
      return m ? Number(m[1]) : 0;
    };

    const seasonRank = (label: string) => {
      const l = label.toLowerCase();
      if (l.includes('winter')) return 1;
      if (l.includes('spring') || l.includes('summer')) return 2; // includes "Spring/Summer"
      if (l.includes('fall')) return 3;
      return 0;
    };

    // Optional: constrain to a season (TERM_SEASON=Winter/Fall/Summer/...)
    const preferSeason = (process.env.TERM_SEASON ?? '').toLowerCase().trim();
    const filtered = preferSeason
      ? terms.filter((t) => t.label.toLowerCase().includes(preferSeason))
      : terms;

    const picked = [...(filtered.length ? filtered : terms)].sort((a, b) => {
      const ya = yearFrom(a.label);
      const yb = yearFrom(b.label);
      if (ya !== yb) return yb - ya;
      return seasonRank(b.label) - seasonRank(a.label);
    })[0];

    return { termId: picked.id, termLabel: picked.label };
  }

  // If not forced by env vars, detect automatically.
  if (!TERM_ID || !TERM_LINK_TEXT) {
    const detected = await detectTermFromUI();
    TERM_ID = TERM_ID || detected.termId;
    TERM_LINK_TEXT = TERM_LINK_TEXT || detected.termLabel; // e.g. "2026 Winter"
    console.log(`Using term: ${TERM_LINK_TEXT} (${TERM_ID})`);
  }

  // Now that TERM_ID is known, initialize term-specific output paths.
  xmlDir = path.join(outDir, 'xml', TERM_ID);
  resultsPath = path.join(outDir, `results_${TERM_ID}.ndjson`);
  await fs.mkdir(xmlDir, { recursive: true });

  
  // -----------------------------
  // Load course codes
  // -----------------------------
  const raw = await fs.readFile(coursesPath, 'utf8');
  const courses = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, ' '));

  if (courses.length === 0) {
    throw new Error('courses.txt is empty (no course codes to process).');
  }

  // -----------------------------
  // Resume support: skip courses already in results file
  // -----------------------------
  const processed = new Set<string>();
  try {
    const existing = await fs.readFile(resultsPath, 'utf8');
    for (const line of existing.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj?.course) processed.add(String(obj.course));
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    // no results file yet
  }

  // -----------------------------
  // Parsing / helpers
  // -----------------------------
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  function extractFirstXmlError(xml: string): string | null {
    const m = xml.match(/<error>([\s\S]*?)<\/error>/i);
    return m ? m[1].trim() : null;
  }

  function isTimeTokenError(xml: string): boolean {
    return /timezone and time/i.test(xml);
  }

  function isNotAuthorized(xml: string): boolean {
    return /Error\s*7133:\s*Not Authorized/i.test(xml);
  }

  async function resolveCourse(humanCourse: string): Promise<
    | { ok: true; cnKey: string; va: string }
    | { ok: false; error: string }
  > {
    const res = await page.request.post('https://mytimetable.mcmaster.ca/api/string-to-filter', {
      form: {
        term: TERM_ID,
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

  // -----------------------------
  // Token/template capture
  // Capture the real logged-in /api/class-data URL once, then reuse its params as a template.
  // We sanitize it to remove any schedule-dependent course/va/rq params.
  // -----------------------------
  async function getSuggestionLabels(): Promise<string[]> {
    const suggestionsUrl =
      `https://mytimetable.mcmaster.ca/api/courses/suggestions` +
      `?term=${TERM_ID}` +
      `&cams=${CAMS}` +
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

  type Template = {
    baseUrl: string;
    params: Record<string, string>;
  };

  function sanitizeTemplateParams(params: Record<string, string>): Record<string, string> {
    const cleaned: Record<string, string> = {};

    for (const [k, v] of Object.entries(params)) {
      // Strip anything that encodes “currently loaded” course list
      // Examples: course_4_0, va_4_0, rq_4_0, course_0_1, etc.
      if (/^(course|va|rq)_\d+_\d+$/.test(k)) continue;

      // Avoid forcing guest mode if present
      if (k === 'nouser') continue;

      cleaned[k] = v;
    }

    return cleaned;
  }

  let suggestionLabels = await getSuggestionLabels();
  let suggestionIdx = 0;

  async function captureTemplateFromUI(): Promise<Template> {
    await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');
    await page.getByRole('link', { name: TERM_LINK_TEXT }).click();

    if (suggestionIdx >= suggestionLabels.length) {
      suggestionLabels = await getSuggestionLabels();
      suggestionIdx = 0;
    }
    const label = suggestionLabels[suggestionIdx++];

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

  function buildClassDataUrlFromTemplate(template: Template, cnKey: string, va: string): string {
    const u = new URL(template.baseUrl);

    // Apply sanitized template params first (tokens/session params)
    for (const [k, v] of Object.entries(template.params)) {
      u.searchParams.set(k, v);
    }

    // Force a single-course request
    u.searchParams.set('term', TERM_ID);
    u.searchParams.set('course_0_0', cnKey);
    u.searchParams.set('va_0_0', va);
    u.searchParams.set('rq_0_0', '');

    // Cachebuster
    u.searchParams.set('_', Date.now().toString());

    return u.toString();
  }

  async function fetchClassDataUsingTemplate(template: Template, cnKey: string, va: string) {
    const url = buildClassDataUrlFromTemplate(template, cnKey, va);

    const res = await page.request.get(url, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://mytimetable.mcmaster.ca/criteria.jsp',
      },
    });

    return { status: res.status(), xml: await res.text(), url };
  }

  // Capture initial template (includes fresh tokens)
  let template = await captureTemplateFromUI();

  // -----------------------------
  // Main loop
  // -----------------------------
  let okCount = 0;
  let failCount = 0;
  const total = courses.length;

  for (let i = 0; i < total; i++) {
    const humanCourse = courses[i];
    if (processed.has(humanCourse)) continue;

    const processedSoFar = okCount + failCount;
    if (processedSoFar > 0 && processedSoFar % 50 === 0) {
      console.log(`Progress: ${processedSoFar} processed (ok=${okCount}, fail=${failCount})`);
    }

    // 1) Resolve
    const resolved = await resolveCourse(humanCourse);
    if (!resolved.ok) {
      failCount++;
      processed.add(humanCourse);
      await appendResult({ course: humanCourse, ok: false, stage: 'resolve', error: resolved.error });
      continue;
    }

    const { cnKey, va } = resolved;

    // 2) Fetch class-data
    let response = await fetchClassDataUsingTemplate(template, cnKey, va);

    // Refresh template/tokens and retry once if tokens are stale
    if (isTimeTokenError(response.xml)) {
      template = await captureTemplateFromUI();
      response = await fetchClassDataUsingTemplate(template, cnKey, va);
    }

    // If session expired, stop early
    if (isNotAuthorized(response.xml)) {
      await appendResult({
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

    // 3) Save XML (always save raw response)
    const safeName = cnKey.replace(/[^\w.-]+/g, '_');
    const xmlRel = path.join('out', 'xml', TERM_ID, `${safeName}.xml`);
    const xmlAbs = path.join(process.cwd(), xmlRel);
    await fs.writeFile(xmlAbs, response.xml, 'utf8');

    // 4) Mark success/failure based on <error> presence
    const xmlError = extractFirstXmlError(response.xml);
    if (xmlError) {
      failCount++;
      processed.add(humanCourse);
      await appendResult({
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
      await appendResult({
        course: humanCourse,
        ok: true,
        cnKey,
        va,
        httpStatus: response.status,
        xmlPath: xmlRel,
      });
    }

    await page.waitForTimeout(DELAY_MS);
  }

  console.log(`Done. ok=${okCount}, fail=${failCount}, total=${okCount + failCount}`);
});
