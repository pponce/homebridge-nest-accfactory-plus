import assert from 'node:assert/strict';
import path from 'node:path';

export async function navigate(page, name, exact = true) {
  const toggle = page.locator('#climate-menu-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('link', { name, exact }).click();
}

export async function checkCompactNavigation(page, output, label) {
  await page.waitForFunction(() => document.body.classList.contains('compact-navigation'));
  const toggle = page.getByRole('button', { name: 'Menu', exact: true });
  const panel = page.locator('#climate-menu-panel');
  assert.equal(await toggle.isVisible(), true, label + ': compact Menu button must be visible');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#climate-sidebar').isVisible(), false);
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.locator('#navigation').isVisible(), false);
  const content = await page.locator('#content').boundingBox();
  assert.ok(content.x < 45, 'Compact content must reclaim the sidebar space');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const before = await page.locator('#page-title').boundingBox();
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await page.locator('#page-title').boundingBox(), before, 'Menu overlays content without moving it');
  assert.equal(await page.locator('#navigation a').count(), 5);
  const bounds = await panel.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, 'Menu must fit the viewport');
  const ratios = await page.locator('#navigation a').evaluateAll((links) => {
    const luminance = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return links.map((link) => {
      const style = getComputedStyle(link);
      const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.getElementById('climate-menu-panel')).backgroundColor : style.backgroundColor;
      const text = luminance(style.color); const surface = luminance(background);
      return { name: link.textContent, ratio: (Math.max(text, surface) + .05) / (Math.min(text, surface) + .05), height: link.getBoundingClientRect().height };
    });
  });
  for (const link of ratios) {
    assert.ok(link.ratio >= 4.5, link.name + ' menu contrast must reach 4.5:1');
    assert.ok(link.height >= 44, link.name + ' must have a 44px touch target');
  }
  await page.screenshot({ path: path.join(output, 'navigation-' + label + '.png'), fullPage: true });
  await page.keyboard.press('Escape');
  assert.equal(await panel.isVisible(), false);
  assert.equal(await toggle.evaluate((node) => node === document.activeElement), true);
  await toggle.click();
  await page.locator('#connection-state').click();
  assert.equal(await panel.isVisible(), false, 'Outside click dismisses the menu');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#navigation a').first().evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  assert.equal(await panel.isVisible(), true);
  await page.locator('#refresh-status').focus();
  assert.equal(await panel.isVisible(), false, 'Moving focus outside dismisses the menu');
  await navigate(page, 'Settings');
  await page.locator('#page-settings').waitFor();
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.locator('#page-title').evaluate((node) => node === document.activeElement), true);
  await navigate(page, 'Settings');
  assert.equal(await panel.isVisible(), false, 'Selecting the current page also dismisses the menu');
  await navigate(page, 'Overview');
  await page.locator('#page-overview').waitFor();
  assert.equal(await panel.isVisible(), false);
}
