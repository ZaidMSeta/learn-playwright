import { test } from '@playwright/test';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Module 6: resolve first course from courses.txt and save class-data XML', async ({ page }) => {
  // Configuration 
  const TERM_ID = '3202610';          // gotta automate this later
  const TERM_LINK_TEXT = 'Winter';    // text of the link you click in the UI
  const CAMS = 'MCMSTiOFF_MCMSTiMCMST_MCMSTiMHK_MCMSTiSNPOL_MCMSTiCON';

  const coursesPath = path.join(process.cwd(), 'courses.txt');
  const outDir = path.join(process.cwd(), 'out');
  const xmlDir = path.join(outDir, 'xml');
  const resultsPath = path.join(outDir, 'results.ndjson');

  // Ensure output directories exist
  await fs.mkdir(xmlDir, { recursive: true });

  // append one NDJSON record (one JSON object per line)
  async function appendResult(record: any) {
    await fs.appendFile(resultsPath, JSON.stringify(record) + '\n', 'utf8');
  }

  // Read courses.txt into an array
  const raw = await fs.readFile(coursesPath, 'utf8');
  const courses = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, ' ')); // normalize whitespace

  if (courses.length === 0) {
    throw new Error('courses.txt is empty (no course codes to process).');
  }

  // We’ll process ONE course for Module 6
  const humanCourse = courses[0];
  console.log(`Processing first course from courses.txt: "${humanCourse}"`);

  //  Grab a browser session (cookies/session state)
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');

  // Get a term-valid sample course from suggestions 
  const suggestionsUrl =
    `https://mytimetable.mcmaster.ca/api/courses/suggestions` +
    `?term=${TERM_ID}` +
    `&cams=${CAMS}` +
    `&course_add=a` +
    `&page_num=0&sco=0&sio=1&already=` +
    `&_=${Date.now()}`;

  const suggestionsRes = await page.request.get(suggestionsUrl, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  if (suggestionsRes.status() !== 200) {
    throw new Error(`suggestions endpoint returned HTTP ${suggestionsRes.status()}`);
  }

  const suggestionsXml = await suggestionsRes.text();

  // Parse the XML response into an object so we can safely extract the first suggestion
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  const suggestionsObj = parser.parse(suggestionsXml);

  const rs = suggestionsObj?.add_suggest?.results?.rs;
  const items = Array.isArray(rs) ? rs : rs ? [rs] : [];

  if (items.length === 0) {
    throw new Error('No suggestions returned; cannot pick a sample course to capture tokens.');
  }

  const sampleCourse = items[0]['#text'];

  // grab t/e tokens by watching the real /api/class-data request from the UI
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');
  await page.getByRole('link', { name: TERM_LINK_TEXT }).click();

  // Start waiting BEFORE triggering the action
  const reqPromise = page.waitForRequest((req) => req.url().includes('/api/class-data'));

  // Trigger the request: type a term-valid course and press Enter
  const courseBox = page.getByRole('combobox', { name: /Select Course/i });
  await courseBox.fill(sampleCourse);
  await courseBox.press('Enter');

  // Capture request URL and extract t/e query params
  const tokenReq = await reqPromise;
  const tokenUrl = new URL(tokenReq.url());
  const t = tokenUrl.searchParams.get('t');
  const e = tokenUrl.searchParams.get('e');

  if (!t || !e) {
    throw new Error('Failed to capture t/e tokens from class-data request.');
  }

  // Module 6: Resolve the real target course (from courses.txt) via string-to-filter
  const resolveRes = await page.request.post('https://mytimetable.mcmaster.ca/api/string-to-filter', {
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

  const resolveArr = await resolveRes.json();
  const first = resolveArr?.[0];

  if (!first) {
    await appendResult({ course: humanCourse, ok: false, error: 'No resolver result' });
    console.log('Resolver returned no results.');
    return;
  }

  if (first.error) {
    await appendResult({ course: humanCourse, ok: false, error: first.error });
    console.log('Resolver error:', first.error);
    return;
  }

  const cnKey: string = first.cnKey; 
  const va: string = first.va;
  console.log('Resolved:', { cnKey, va });

  // Fetch class-data XML for the resolved course using captured t/e
  // use page.request + include t/e + cachebuster
  const classDataUrl = new URL('https://mytimetable.mcmaster.ca/api/class-data');
  classDataUrl.searchParams.set('term', TERM_ID);
  classDataUrl.searchParams.set('course_0_0', cnKey);
  classDataUrl.searchParams.set('va_0_0', va);
  classDataUrl.searchParams.set('rq_0_0', '');
  classDataUrl.searchParams.set('t', t);
  classDataUrl.searchParams.set('e', e);
  classDataUrl.searchParams.set('nouser', '1');
  classDataUrl.searchParams.set('_', Date.now().toString());

  const classDataRes = await page.request.get(classDataUrl.toString(), {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://mytimetable.mcmaster.ca/criteria.jsp',
    },
  });

  const xml = await classDataRes.text();

  // Save XML to disk
  const safeName = cnKey.replace(/[^\w.-]+/g, '_');
  const xmlFileRel = `out/xml/${safeName}.xml`;
  const xmlFileAbs = path.join(process.cwd(), xmlFileRel);

  await fs.writeFile(xmlFileAbs, xml, 'utf8');

  await appendResult({
    course: humanCourse,
    ok: true,
    cnKey,
    va,
    t,
    e,
    xmlPath: xmlFileRel,
    httpStatus: classDataRes.status(),
  });

  console.log(`Saved XML -> ${xmlFileRel}`);
});
