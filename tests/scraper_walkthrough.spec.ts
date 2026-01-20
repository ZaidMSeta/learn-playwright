import { test } from '@playwright/test';

test('Module 1: call suggestions API using page.request', async ({ page }) => {
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');

  // call API endpoint using same session as the page
  const term = '3202610';
  const cams = 'MCMSTiOFF_MCMSTiMCMST_MCMSTiMHK_MCMSTiSNPOL_MCMSTiCON';

  const url =
    `https://mytimetable.mcmaster.ca/api/courses/suggestions` +
    `?term=${term}` +
    `&cams=${cams}` +
    `&course_add=a` +
    `&page_num=0&sco=0&sio=1&already=` +
    `&_=${Date.now()}`;

  const res = await page.request.get(url, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  console.log('status:', res.status());

  const contentType = res.headers()['content-type'];
  console.log('content-type:', contentType);

  const body = await res.text();
  console.log('body starts with:', JSON.stringify(body.slice(0, 200)));



});
