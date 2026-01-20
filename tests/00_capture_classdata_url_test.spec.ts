import { test } from '@playwright/test';

test('capture class-data url', async ({ page }) => {
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');
  await page.getByRole('link', { name: 'Winter' }).click();

  const waitReq = page.waitForRequest(r => r.url().includes('/api/class-data'));

  const courseBox = page.getByRole('combobox', { name: /Select Course/i });
  await courseBox.fill('ANTHROP 2SA3');
  await courseBox.press('Enter');

  const req = await waitReq;
  console.log('\nCLASS-DATA URL:\n', req.url(), '\n');
});
