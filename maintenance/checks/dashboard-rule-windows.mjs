// Exercise the shared editor through both application hosts using fixture data only.
import assert from 'node:assert/strict';
import path from 'node:path';
import { navigate } from './dashboard-navigation.mjs';

export async function checkRuleWindows(page, output, prefix, config) {
  await navigate(page, 'Climate rules');
  for (const [kind, key] of [['temperature', 'temperature'], ['fan', 'fans']]) {
    await page.locator('[data-kind="' + kind + '"]').click();
    assert.equal(await page.getByLabel('When to run', { exact: true }).inputValue(), 'always');
    await page.getByLabel('When to run', { exact: true }).selectOption('scheduled');
    await page.getByRole('button', { name: 'Weekdays', exact: true }).click();
    await page.getByLabel('Start time', { exact: true }).fill('22:00');
    await page.getByLabel('End time', { exact: true }).fill('06:00');
    await page.getByLabel('Window time zone', { exact: true }).selectOption('America/Los_Angeles');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('save-bar').hidden);
    assert.deepEqual(config.rules[key][0].window, { days: [0, 1, 2, 3, 4], start: '22:00', end: '06:00', timeZone: 'America/Los_Angeles' });
    assert.ok(await page.locator('.rule-rank').first().isVisible());
    await page.getByLabel('When to run', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, prefix + '-window-' + kind + '.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByLabel('Start time', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, prefix + '-window-' + kind + '-mobile.png'), fullPage: true });
    await page.getByLabel('When to run', { exact: true }).selectOption('always');
    assert.equal(await page.getByLabel('Start time', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('save-bar').hidden);
    assert.equal(config.rules[key][0].window, undefined);
    await page.setViewportSize({ width: 1280, height: 1000 });
  }
}
