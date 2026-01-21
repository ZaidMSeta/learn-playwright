import { test } from '@playwright/test';

test('auth setup (manual login)', async ({ page, context }) => {
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');
  await page.pause();
  await context.storageState({ path: 'auth.storage.json' });
});
