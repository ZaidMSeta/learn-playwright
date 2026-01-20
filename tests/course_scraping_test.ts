import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://mytimetable.mcmaster.ca/criteria.jsp');
  await page.getByRole('link', { name: 'Winter' }).click();
  await page.getByRole('combobox', { name: 'Select Course...' }).click();
  await page.getByRole('combobox', { name: 'Select Course...' }).click();
  await page.getByRole('combobox', { name: 'Select Course' }).fill('math 1zb3');
  await page.getByRole('combobox', { name: 'Select Course' }).press('Enter');
  await page.getByText('The course \'MATH-1ZB3\' was').click();
  await page.locator('.warningNoteGood').click();
  await page.getByRole('row', { name: 'MATH 1ZB3 Engineering' }).getByLabel('Remove course').click();
  await page.getByRole('button', { name: 'Remove course' }).click();
  await page.getByRole('combobox', { name: 'Select Course' }).click();
  await page.getByRole('combobox', { name: 'Select Course' }).fill('math 1a');
  await page.getByRole('option', { name: 'SFWRENG 4X03 (2025 Fall only' }).click();
  await page.getByText('"SFWRENG 4X03" is only').click();
  await page.locator('div').filter({ hasText: /^"SFWRENG 4X03" is only available in the term 2025 Fall\.$/ }).click();
});