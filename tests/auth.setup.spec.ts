import { test } from '@playwright/test';

test('auth setup (manual login)', async ({ page, context }) => {
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');

  // This opens Playwright Inspector; you log in manually in the browser,
  // then click “Resume” in the inspector once you’re fully logged in.
  await page.pause();

  await context.storageState({ path: 'auth.storage.json' });
});
