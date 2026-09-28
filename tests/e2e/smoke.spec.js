import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const fixture = await readFile(new URL('./fixtures/kitchen-sink.md', import.meta.url), 'utf8');

let errors = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.locator('#editor').fill(fixture);
  await expect(page.locator('#preview .mermaid.mermaid-rendered > svg')).toBeVisible();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('renders every supported markdown feature', async ({ page }) => {
  const preview = page.locator('#preview');

  await expect(preview.locator('h1')).toHaveText('Smoke Test');

  const wrapped = preview.locator('p', { hasText: 'This paragraph is hard-wrapped' });
  await expect(wrapped).toHaveText(
    'This paragraph is hard-wrapped across several lines and renders as one line.'
  );
  await expect(wrapped.locator('br')).toHaveCount(0);
  await expect(preview.locator('p', { hasText: 'First line' }).locator('br')).toHaveCount(1);

  await expect(preview.locator('.table-wrap table td').first()).toHaveText('alpha');
  await expect(preview.locator('input[type="checkbox"]')).toHaveCount(2);

  await expect(preview.locator('pre code.language-js .hljs-keyword')).toHaveText('const');
  await expect(preview.locator('pre .code-copy-btn')).toHaveCount(1);

  await expect(preview.locator('.katex-display')).toHaveCount(1);
  await expect(preview.locator('p .katex')).toHaveCount(1);
  await expect(preview.locator('.katex-error')).toHaveCount(0);

  await expect(preview.locator('.mermaid-error')).toHaveCount(0);
  await expect(preview.locator('.mermaid > svg')).toContainText('Start');

  await expect(preview.locator('.preview-figure img[alt="pixel"]')).toBeVisible();
});

test('sanitizes untrusted HTML', async ({ page }) => {
  const preview = page.locator('#preview');

  await expect(preview.locator('script')).toHaveCount(0);
  await expect(preview.locator('[onclick]')).toHaveCount(0);
  await expect(preview.locator('a[href^="javascript:"]')).toHaveCount(0);

  await preview.getByText('untrusted div').click();
  await preview.getByText('untrusted link').click();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`prints only the preview (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ media: 'print' });

    const preview = page.locator('#preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS('overflow-y', 'visible');
    await expect(page.locator('#previewPane')).toHaveCSS('opacity', '1');
    await expect(preview.locator('h1')).toBeVisible();
    expect(await preview.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(
      1
    );

    for (const selector of ['.header', '#editorPane', '.pane-header', '#resizeHandle']) {
      await expect(page.locator(selector).first()).toBeHidden();
    }
    await expect(preview.locator('.mermaid-toolbar')).toBeHidden();
    await expect(preview.locator('.code-copy-btn')).toBeHidden();
  });
}

test('exports standalone HTML with rendered content', async ({ page }) => {
  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportHtmlBtn').click();
  await page.locator('#exportFilename').fill('smoke');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDownloadBtn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('smoke.html');
  await page.setContent(await readFile(await download.path(), 'utf8'));

  await expect(page.locator('h1')).toHaveText('Smoke Test');
  await expect(page.locator('.katex-display')).toHaveCount(1);
  await expect(page.locator('pre .hljs-keyword')).toHaveText('const');
  await expect(page.locator('.mermaid > svg')).toBeVisible();
  await expect(page.locator('.code-copy-btn, .mermaid-toolbar, script, [onclick]')).toHaveCount(0);
});
