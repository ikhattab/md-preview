import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
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

test('gives headings GitHub-style ids and scrolls the preview to anchor links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  const preview = page.locator('#preview');

  await expect(preview.locator('h1')).toHaveId('user-content-smoke-test');
  await expect(preview.locator('h2', { hasText: 'Links' })).toHaveId('user-content-links');
  await expect(preview.locator('h3', { hasText: 'Repeat' })).toHaveCount(2);
  await expect(preview.locator('h3').nth(0)).toHaveId('user-content-repeat');
  await expect(preview.locator('h3').nth(1)).toHaveId('user-content-repeat-1');

  const link = preview.getByRole('link', { name: 'the links section' });
  await expect(link).toHaveAttribute('href', '#user-content-links');
  await expect(preview.getByRole('link', { name: 'the second repeat' })).toHaveAttribute(
    'href',
    '#user-content-repeat-1'
  );

  expect(await preview.evaluate((el) => el.scrollTop)).toBe(0);
  await link.click();

  await expect(preview.locator('#user-content-links')).toBeInViewport();
  const scrollState = await page.evaluate(() => ({
    previewScrollTop: document.getElementById('preview').scrollTop,
    windowScrollY: window.scrollY,
    hash: location.hash,
  }));
  expect(scrollState.previewScrollTop).toBeGreaterThan(0);
  expect(scrollState.windowScrollY).toBe(0);
  expect(scrollState.hash).toBe('');
});

test('opens external links in a new tab and keeps anchor links in place', async ({ page }) => {
  const preview = page.locator('#preview');

  for (const href of [
    'https://example.com',
    'mailto:team@example.com',
    'https://example.org/raw',
  ]) {
    const link = preview.locator(`a[href="${href}"]`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }

  const anchor = preview.getByRole('link', { name: 'back to the top' });
  await expect(anchor).toHaveAttribute('href', '#user-content-smoke-test');
  await expect(anchor).not.toHaveAttribute('target');
  await expect(preview.locator('a[href^="javascript:"]')).toHaveCount(0);

  await page
    .context()
    .route('https://example.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>external</p>' })
    );
  const appUrl = page.url();
  const popupPromise = page.waitForEvent('popup');
  await preview.locator('a[href="https://example.com"]').click();
  const popup = await popupPromise;
  await popup.waitForLoadState();

  expect(popup.url()).toBe('https://example.com/');
  expect(page.url()).toBe(appUrl);
});

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

  await expect(page.locator('a[href="#user-content-links"]')).toHaveCount(1);
  await expect(page.locator('#user-content-links')).toHaveText('Links');
});

test('reports remote images that could not be embedded in HTML export', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  // A real second origin, because Playwright relaxes CORS for responses fulfilled via page.route.
  const imageServer = createServer((req, res) => {
    const cors = req.url === '/cors.png' ? { 'Access-Control-Allow-Origin': '*' } : {};
    res.writeHead(200, { 'Content-Type': 'image/png', ...cors });
    res.end(png);
  });
  await new Promise((resolve) => imageServer.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${imageServer.address().port}`;
  const corsUrl = `${origin}/cors.png`;
  const noCorsUrl = `${origin}/no-cors.png`;

  try {
    await page
      .locator('#editor')
      .fill(`# Remote images\n\n![cors](${corsUrl})\n\n![no-cors](${noCorsUrl})\n`);
    await expect(page.locator('#preview img[alt="no-cors"]')).toBeVisible();

    await page.locator('#exportMenuBtn').click();
    await page.locator('#exportHtmlBtn').click();
    await expect(page.locator('#exportEmbedImages')).toBeChecked();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportDownloadBtn').click();
    const download = await downloadPromise;

    await expect(page.locator('#mdToast')).toHaveText(
      "Exported HTML — 1 image couldn't be embedded (kept as links)"
    );

    // The browser logs the blocked cross-origin fetch as a console error.
    errors = errors.filter(
      (message) => !message.includes(noCorsUrl) && !message.includes('ERR_FAILED')
    );

    await page.setContent(await readFile(await download.path(), 'utf8'));
    await expect(page.locator('img[alt="cors"]')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/
    );
    await expect(page.locator('img[alt="no-cors"]')).toHaveAttribute('src', noCorsUrl);
  } finally {
    imageServer.close();
  }
});
