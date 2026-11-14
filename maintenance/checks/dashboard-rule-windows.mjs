// Exercise the shared editor through both application hosts using fixture data only.
import assert from 'node:assert/strict';
import path from 'node:path';
import { navigate } from './dashboard-navigation.mjs';

export async function checkRuleWindows(page, output, prefix, getConfig) {
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
    assert.deepEqual(getConfig().rules[key][0].window, { days: [0, 1, 2, 3, 4], start: '22:00', end: '06:00', timeZone: 'America/Los_Angeles' });
    assert.ok(await page.locator('.rule-rank').first().isVisible());
    await page.getByLabel('Occupancy requirement', { exact: true }).selectOption('occupied');
    await page.getByLabel('Occupancy source', { exact: true }).selectOption('living-presence');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('save-bar').hidden);
    assert.deepEqual(getConfig().rules[key][0].occupancyCondition,
      { sourceType: 'sensor', sourceId: 'living-presence', state: 'occupied' });
    assert.equal(await page.getByLabel('Occupancy source', { exact: true }).locator('option[value="hall-motion"]').count(), 0);
    await page.getByLabel('Occupancy source type', { exact: true }).selectOption('presenceRule');
    const presenceId = getConfig().rules.occupancy[0].id;
    await page.getByLabel('Occupancy source', { exact: true }).selectOption(presenceId);
    await page.getByLabel('Occupancy requirement', { exact: true }).selectOption('unoccupied');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('save-bar').hidden);
    assert.deepEqual(getConfig().rules[key][0].occupancyCondition,
      { sourceType: 'presenceRule', sourceId: presenceId, state: 'unoccupied' });
    assert.ok(await page.locator('.editor-section h4').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 18));

    await page.getByLabel('When to run', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, prefix + '-window-' + kind + '.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByLabel('Start time', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, prefix + '-window-' + kind + '-mobile.png'), fullPage: true });
    await page.getByLabel('Occupancy requirement', { exact: true }).selectOption('any');
    await page.getByLabel('When to run', { exact: true }).selectOption('always');
    assert.equal(await page.getByLabel('Start time', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('save-bar').hidden);
    assert.equal(getConfig().rules[key][0].window, undefined);
    assert.equal(getConfig().rules[key][0].occupancyCondition, undefined);
    if (kind === 'fan') {
      const policy = page.getByLabel('After a manual fan change', { exact: true });
      assert.equal(await policy.inputValue(), 'manual');
      await policy.selectOption('duration');
      const settings = page.getByRole('group', { name: 'Manual fan change settings', exact: true });
      assert.equal(await settings.getByLabel('Manual hold (minutes)', { exact: true }).count(), 1);
      assert.ok((await settings.boundingBox()).x > (await policy.boundingBox()).x);
      for (let hours = 1; hours <= 8; hours++) {
        await page.getByRole('button', { name: hours + (hours === 1 ? ' hour' : ' hours'), exact: true }).click();
        assert.equal(await page.getByLabel('Manual hold (minutes)', { exact: true }).inputValue(), String(hours * 60));
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await settings.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, prefix + '-manual-hold-mobile.png'), fullPage: true });
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('save-bar').hidden);
      assert.deepEqual(getConfig().rules[key][0].manualOverride, { mode: 'duration', minutes: 480 });
      await policy.selectOption('time');
      assert.equal(await settings.getByLabel('Daily resume time', { exact: true }).count(), 1);
      assert.equal(await settings.getByLabel('Resume time zone', { exact: true }).count(), 1);
      await page.getByLabel('Daily resume time', { exact: true }).fill('08:00');
      await page.getByLabel('Resume time zone', { exact: true }).selectOption('America/Los_Angeles');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('save-bar').hidden);
      assert.deepEqual(getConfig().rules[key][0].manualOverride,
        { mode: 'time', time: '08:00', timeZone: 'America/Los_Angeles' });
      await policy.selectOption('manual');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('save-bar').hidden);
      assert.equal(getConfig().rules[key][0].manualOverride, undefined);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
  }
}

