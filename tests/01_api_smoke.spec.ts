import { test } from '@playwright/test';

test('api smoke: string-to-filter -> class-data', async ({ page }) => {

  const TERM_ID = '3202610'; 
  const TERM_LINK_TEXT = 'Winter'; 
    
  //gets cookies/session state
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');
  await page.getByRole('link', { name: 'Winter' }).click(); 

  // 1) resolve cnKey + va
  const form = {
    term: 'TERM_ID',
    validations: '',
    itemnames: 'ANTHROP 2SA3',
    input: 'anthrop 2sa3',
    reason: 'CODE_NUMBER',
    current: '',
    isimport: '0',
    strict: '0',
  };
  //
  const r1 = await page.request.post('https://mytimetable.mcmaster.ca/api/string-to-filter', {
    form,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  const arr = await r1.json();
  console.log('string-to-filter:', arr);

  const first = arr?.[0];
  if (!first || first.error) throw new Error(first?.error ?? 'No resolver result');
  const cnKey = first.cnKey;
  const va = first.va;

  // captures a fresh t/e
  const waitReq = page.waitForRequest(r => r.url().includes('/api/class-data'));
  const courseBox = page.getByRole('combobox', { name: /Select Course/i });
  await courseBox.fill('ANTHROP 2SA3');
  await courseBox.press('Enter');
  const uiReq = await waitReq;
  const u = new URL(uiReq.url());
  const t = u.searchParams.get('t')!;
  const e = u.searchParams.get('e')!;

  // call class-data via page.request (has cookies/session)
  const url = new URL('https://mytimetable.mcmaster.ca/api/class-data');
  url.searchParams.set('term', 'TERM_ID');
  url.searchParams.set('course_0_0', cnKey);
  url.searchParams.set('va_0_0', va);
  url.searchParams.set('rq_0_0', '');
  url.searchParams.set('t', t);
  url.searchParams.set('e', e);
  url.searchParams.set('nouser', '1');
  url.searchParams.set('_', Date.now().toString());

  const r2 = await page.request.get(url.toString(), {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://mytimetable.mcmaster.ca/criteria.jsp',
    },
  });

  const xml = await r2.text();
  console.log('class-data status:', r2.status());
  console.log(xml.split('\n').slice(0, 12).join('\n'));
});
