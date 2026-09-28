import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const fixture = await readFile(new URL('./fixtures/kitchen-sink.md', import.meta.url), 'utf8');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const ALERT_TITLES = ['Note', 'Tip', 'Important', 'Warning', 'Caution'];

let errors = [];

function readAlertColors(root) {
  return root.locator('.markdown-alert').evaluateAll((alerts) =>
    alerts.map((alert) => ({
      border: getComputedStyle(alert).borderLeftColor,
      title: getComputedStyle(alert.querySelector('.markdown-alert-title')).color,
    }))
  );
}

function expectDistinctAlertColors(colors) {
  expect(colors).toHaveLength(ALERT_TITLES.length);
  for (const { border, title } of colors) {
    expect(title).toBe(border);
  }
  expect(new Set(colors.map(({ border }) => border)).size).toBe(ALERT_TITLES.length);
}

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

  await expect(preview.locator(':scope > .table-wrap table td').first()).toHaveText('alpha');
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

test('renders GitHub alerts with a title and distinct color in both themes', async ({ page }) => {
  const preview = page.locator('#preview');
  const alerts = preview.locator('.markdown-alert');

  await expect(alerts).toHaveCount(ALERT_TITLES.length);
  for (const [i, title] of ALERT_TITLES.entries()) {
    const alert = alerts.nth(i);
    await expect(alert).toHaveClass(`markdown-alert markdown-alert-${title.toLowerCase()}`);
    await expect(alert.locator('.markdown-alert-title')).toHaveText(title);
    await expect(alert.locator('.markdown-alert-title svg.markdown-alert-icon')).toBeVisible();
  }
  await expect(preview).not.toContainText('[!');
  await expect(alerts.nth(2).locator('p:not(.markdown-alert-title)')).toHaveCount(2);

  const lightColors = await readAlertColors(preview);
  expectDistinctAlertColors(lightColors);

  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const darkColors = await readAlertColors(preview);
  expectDistinctAlertColors(darkColors);
  expect(darkColors).not.toEqual(lightColors);
});

test('renders YAML frontmatter as metadata instead of a rule and heading', async ({ page }) => {
  const preview = page.locator('#preview');
  const frontmatter = preview.locator(':scope > .frontmatter:first-child');

  await expect(frontmatter.locator('th')).toHaveText(['title', 'tags', 'authors']);
  await expect(frontmatter.locator('td')).toHaveText(['Smoke Test', 'alpha, beta', 'Ada, Grace']);
  await expect(preview.locator('hr')).toHaveCount(1);
  await expect(preview.locator('h2')).toHaveText(['Links']);

  await page.locator('#editor').fill('---\nNot frontmatter\n');
  await expect(preview.locator('hr')).toHaveCount(1);
  await expect(preview.locator('.frontmatter')).toHaveCount(0);

  await page.locator('#editor').fill('---\n- a\n- b\n---\n\nBody\n');
  await expect(preview.locator('pre.frontmatter code')).toHaveText('- a\n- b');
  await expect(preview.locator('hr')).toHaveCount(0);
});

test('lints frontmatter documents without flagging the YAML', async ({ page }) => {
  const preview = page.locator('#preview');
  const editor = page.locator('#editor');
  await page.locator('#lintToggle').click();

  await editor.fill('---\nseo:\n  description: Nested\n#no-space comment\n---\nIntro paragraph.\n');
  await expect(preview.locator('.frontmatter td.frontmatter-raw')).toHaveText(
    'description: Nested'
  );
  await expect(preview.locator('h1, h2, hr')).toHaveCount(0);
  await expect(page.locator('#lintList .lint-item-line')).toHaveText(['L6']);
  await expect(page.locator('#lintList .lint-item-message')).toHaveText([
    'MD041: First line should be a top-level heading',
  ]);

  await editor.fill('---\ntitle: Hello\n---\nIntro paragraph.\n');
  await expect(page.locator('#lintList .lint-item-message')).toHaveText(['No issues found']);
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
  const previewAlertColors = await readAlertColors(page.locator('#preview'));

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

  await expect(page.locator('.markdown-alert-title')).toHaveText(ALERT_TITLES);
  await expect(page.locator('.markdown-alert-title svg')).toHaveCount(ALERT_TITLES.length);
  expect(await readAlertColors(page.locator('body'))).toEqual(previewAlertColors);
});

test('serves the production Content Security Policy and fails on violations', async ({ page }) => {
  const response = await page.request.get('/');
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");

  await page.evaluate(() => fetch('http://127.0.0.1:9/csp-probe').catch(() => {}));
  await expect
    .poll(() => errors.some((message) => message.includes('Content Security Policy')))
    .toBe(true);
  errors = [];
});

test('loads every image before printing a long PDF export', async ({ page }) => {
  const origin = 'https://images.example';
  // The hanging image is never fulfilled, so its request stays pending.
  await page.route(`${origin}/**`, (route) => {
    if (route.request().url() === `${origin}/hang.png`) return;
    route.fulfill({ contentType: 'image/png', body: png });
  });

  await page.addInitScript(() => {
    window.print = () => {
      window.top.__printedImages = [...document.images].map(
        (img) => img.complete && img.naturalWidth > 0
      );
    };
  });

  const filler = Array.from({ length: 30 }, (_, i) => `Filler paragraph ${i}.`).join('\n\n');
  const imageCount = 24;
  const markdown = Array.from(
    { length: imageCount },
    (_, i) => `![image ${i}](${origin}/image-${i}.png)\n\n${filler}`
  ).join('\n\n');

  await page
    .locator('#editor')
    .fill(`# Long document\n\n${markdown}\n\n![never loads](${origin}/hang.png)\n`);
  await expect(page.locator('#preview img[alt="image 0"]')).toBeVisible();

  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportPdfBtn').click();
  await page.locator('#exportDownloadBtn').click();

  // The image that never responds must not block printing past the per-image timeout.
  await expect
    .poll(() => page.evaluate(() => window.__printedImages), { timeout: 15_000 })
    .toEqual([...Array(imageCount).fill(true), false]);
});

test('embeds remote images in HTML export and reports the ones it could not', async ({ page }) => {
  const corsUrl = 'https://images.example/cors.png';
  const noCorsUrl = 'https://images.example/no-cors.png';
  // Playwright adds CORS headers to fulfilled responses unless one is already set,
  // so the no-CORS image allows a different origin to make the fetch fail.
  await page.route('https://images.example/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: {
        'access-control-allow-origin':
          route.request().url() === corsUrl ? '*' : 'https://elsewhere.example',
      },
      body: png,
    })
  );

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

  // The browser logs the fetch blocked by CORS as console errors.
  errors = errors.filter(
    (message) =>
      !message.startsWith(`Access to fetch at '${noCorsUrl}'`) &&
      message !== 'Failed to load resource: net::ERR_FAILED'
  );

  await page.setContent(await readFile(await download.path(), 'utf8'));
  await expect(page.locator('img[alt="cors"]')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.locator('img[alt="no-cors"]')).toHaveAttribute('src', noCorsUrl);
});

const IMAGE_ORIGIN = 'https://images.example';

async function routeRemoteImages(page) {
  const requests = [];
  await page.route(`${IMAGE_ORIGIN}/**`, (route) => {
    requests.push(new URL(route.request().url()).pathname);
    route.fulfill({ contentType: 'image/png', body: png });
  });
  return requests;
}

// Everything in the preview that could trigger a fetch, leaving out the placeholders' hover titles.
function remoteReferences(page) {
  return page.locator('#preview').evaluate((el, origin) => {
    const values = [...el.querySelectorAll('*')].flatMap((node) =>
      [...node.attributes].filter((attr) => attr.name !== 'title').map((attr) => attr.value)
    );
    values.push(...[...el.querySelectorAll('style')].map((style) => style.textContent));
    return values.filter((value) => value.includes(origin));
  }, IMAGE_ORIGIN);
}

async function turnOnImageBlocking(page) {
  const toggle = page.locator('#remoteImagesToggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

test('blocks remote images until the reader loads them', async ({ page }) => {
  const requests = await routeRemoteImages(page);
  const origin = IMAGE_ORIGIN;
  const markdown = [
    '# Remote images',
    `[![badge](${origin}/markdown.png)](https://example.com)`,
    `<img alt="raw html" src="${origin}/html.png">`,
    `<img srcset="${origin}/srcset.png 2x">`,
    `<picture><source srcset="${origin}/source.png"><img alt="local" src="/sample-landscape.svg"></picture>`,
    `<div style="background-image: url('${origin}/style-attr.png'); height: 4px"></div>`,
    `<style>.probe { background: url(${origin}/style-element.png); height: 4px }</style><div class="probe"></div>`,
    `<svg width="4" height="4"><image href="${origin}/svg.png" width="4" height="4"/></svg>`,
    `<video poster="${origin}/poster.png" width="4" height="4"></video>`,
    '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```',
    `\`\`\`mermaid\nflowchart TD\n  P@{ img: "${origin}/mermaid.png", w: 4, h: 4 }\n\`\`\``,
  ].join('\n\n');

  await turnOnImageBlocking(page);
  const preview = page.locator('#preview');
  const placeholders = preview.locator('.blocked-image');
  await page.locator('#editor').fill(markdown);
  await expect(placeholders).toHaveCount(4);
  await expect(placeholders.nth(0)).toContainText('badge');
  await expect(placeholders.nth(1)).toContainText('raw html');
  await expect(placeholders.nth(2)).toContainText('Image from images.example');
  await expect(placeholders.nth(3)).toContainText('Diagram may load remote images');
  await expect(preview.locator('.preview-figure img[alt="local"]')).toBeVisible();
  await expect(preview.locator('.mermaid.mermaid-rendered > svg')).toHaveCount(1);
  expect(await remoteReferences(page)).toEqual([]);
  expect(requests).toEqual([]);

  await page.reload();
  await expect(page.locator('#remoteImagesToggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(placeholders).toHaveCount(4);
  await expect(preview.locator('.mermaid.mermaid-rendered > svg')).toHaveCount(1);
  expect(await remoteReferences(page)).toEqual([]);
  expect(requests).toEqual([]);

  await placeholders.nth(0).getByRole('button', { name: 'Load images' }).click();
  await expect(placeholders).toHaveCount(0);
  await expect(preview.locator('.preview-figure img[alt="badge"]')).toBeVisible();
  await expect(preview.locator('.preview-figure img[alt="raw html"]')).toBeVisible();
  await expect(preview.locator('.mermaid.mermaid-rendered > svg')).toHaveCount(2);
  await expect(preview.locator(`.mermaid svg image[href="${origin}/mermaid.png"]`)).toHaveCount(1);
  expect(requests).toContain('/markdown.png');
  expect(requests).toContain('/mermaid.png');
  expect(page.context().pages()).toHaveLength(1);
});

test('keeps blocking images that were not on screen when the reader loaded images', async ({
  page,
}) => {
  const requests = await routeRemoteImages(page);
  const allowedUrl = `${IMAGE_ORIGIN}/allowed.png`;
  const newUrl = `${IMAGE_ORIGIN}/new.png`;
  const preview = page.locator('#preview');
  const placeholders = preview.locator('.blocked-image');

  await turnOnImageBlocking(page);
  await page.locator('#editor').fill(`# First\n\n![allowed](${allowedUrl})\n`);
  await expect(placeholders).toHaveCount(1);
  await placeholders.getByRole('button', { name: 'Load images' }).click();
  await expect(preview.locator('.preview-figure img[alt="allowed"]')).toBeVisible();
  expect(requests).toEqual(['/allowed.png']);

  // A different document pasted after loading images gets its own placeholder.
  await page
    .locator('#editor')
    .fill(`# Second\n\n![allowed](${allowedUrl})\n\n![new](${newUrl})\n`);
  await expect(placeholders).toHaveCount(1);
  await expect(placeholders).toContainText('new');
  await expect(preview.locator('.preview-figure img[alt="allowed"]')).toBeVisible();
  expect(await remoteReferences(page)).toEqual([allowedUrl]);

  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportHtmlBtn').click();
  await expect(page.locator('#exportEmbedImages')).toBeChecked();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDownloadBtn').click();
  const download = await downloadPromise;
  await expect(page.locator('#mdToast')).toHaveText('Exported HTML');
  expect(requests).not.toContain('/new.png');

  await page.setContent(await readFile(await download.path(), 'utf8'));
  await expect(page.locator('img[alt="allowed"]')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/
  );
  await expect(page.locator('.blocked-image')).toContainText('new');
  await expect(page.locator('.blocked-image-load')).toHaveCount(0);
  expect(requests).not.toContain('/new.png');
});
