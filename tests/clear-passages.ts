import type { Page } from '@playwright/test';

/** Empty synthetic feed for browser suites testing unrelated planner behavior. */
export async function clearPassages(page: Page) {
  await page.route('**/api/closures', route => route.fulfill({ json: { closed: [], warnings: [] } }));
}
