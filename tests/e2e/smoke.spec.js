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
    if (viewport.name === 'desktop') {
      await page.locator('#outlineToggle').click();
      await expect(page.locator('#outlinePanel')).toBeVisible();
    }
    await page.emulateMedia({ media: 'print' });

    const preview = page.locator('#preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS('overflow-y', 'visible');
    await expect(page.locator('#previewPane')).toHaveCSS('opacity', '1');
    await expect(preview.locator('h1')).toBeVisible();
    expect(await preview.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(
      1
    );

    for (const selector of [
      '.header',
      '#editorPane',
      '.pane-header',
      '#resizeHandle',
      '#outlinePanel',
    ]) {
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

const FOOTNOTES_DOC = `# Notes

A claim[^1] and a named note[^source].

${Array.from({ length: 30 }, (_, i) => `Filler paragraph ${i}.`).join('\n\n')}

The same claim again[^1].

[^1]: The first note.
[^source]: A note with **bold** text.
`;

// In-page links whose target isn't in the document.
function findBrokenInPageLinks(root = document) {
  return [...root.querySelectorAll('a[href^="#"]')]
    .map((a) => a.getAttribute('href'))
    .filter((href) => !document.getElementById(decodeURIComponent(href.slice(1))));
}

test('links footnotes to their notes and back, including in exports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  const preview = page.locator('#preview');
  await page.locator('#editor').fill(FOOTNOTES_DOC);

  const refs = preview.locator('a[data-footnote-ref]');
  const notes = preview.locator('.footnotes li');
  await expect(refs).toHaveText(['1', '2', '1']);
  await expect(refs.first()).toHaveAttribute('href', '#user-content-footnote-1');
  await expect(notes).toHaveText([/The first note\./, /A note with bold text\./]);
  await expect(notes.first()).toHaveId('user-content-footnote-1');
  // Screen readers announce each reference as a footnote.
  await expect(refs.first()).toHaveAttribute('aria-describedby', 'user-content-footnote-label');
  await expect(preview.locator('#user-content-footnote-label')).toHaveText('Footnotes');
  expect(await preview.evaluate(findBrokenInPageLinks)).toEqual([]);

  await expect(notes.first()).not.toBeInViewport();
  await refs.first().click();
  await expect(notes.first()).toBeInViewport();
  await notes.first().getByRole('link', { name: 'Back to reference 1' }).first().click();
  await expect(refs.first()).toBeInViewport();
  expect(await page.evaluate(() => location.hash)).toBe('');

  await page.addInitScript(() => {
    window.print = () => {
      const hrefs = [...document.querySelectorAll('a[href^="#"]')].map((a) =>
        a.getAttribute('href')
      );
      window.top.__printedFootnotes = {
        notes: document.querySelectorAll('.footnotes li').length,
        broken: hrefs.filter((href) => !document.getElementById(href.slice(1))),
      };
    };
  });
  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportPdfBtn').click();
  await page.locator('#exportDownloadBtn').click();
  await expect
    .poll(() => page.evaluate(() => window.__printedFootnotes))
    .toEqual({ notes: 2, broken: [] });

  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportHtmlBtn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDownloadBtn').click();
  await page.setContent(await readFile(await (await downloadPromise).path(), 'utf8'));
  await expect(page.locator('.footnotes li')).toHaveCount(2);
  await expect(page.locator('a[data-footnote-ref]')).toHaveCount(3);
  expect(await page.evaluate(findBrokenInPageLinks)).toEqual([]);
});

const filler = (n) => Array.from({ length: n }, (_, i) => `Filler paragraph ${i}.`).join('\n\n');

const OUTLINE_DOC = `## Guide

${filler(8)}

### Install

${filler(8)}

#### Options

${filler(8)}

> ## A quoted heading

### Usage

${filler(8)}

## FAQ

A note.[^1]

${filler(20)}

[^1]: Footnotes have a hidden heading of their own.
`;

test('shows a document outline that follows the preview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  const editor = page.locator('#editor');
  const preview = page.locator('#preview');
  const toggle = page.locator('#outlineToggle');
  const panel = page.locator('#outlinePanel');
  const links = panel.locator('.outline-link');
  await editor.fill(OUTLINE_DOC);

  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // Top-level headings only, indented relative to the highest level used.
  await expect(links).toHaveText(['Guide', 'Install', 'Options', 'Usage', 'FAQ']);
  expect(
    await panel.locator('.outline-item').evaluateAll((items) => items.map((i) => i.dataset.depth))
  ).toEqual(['0', '1', '2', '1', '0']);
  await expect(links.nth(3)).toHaveAttribute('href', '#user-content-usage');

  // Jumping to a section scrolls the preview, moves focus there and marks the entry.
  const usage = preview.locator('#user-content-usage');
  await expect(usage).not.toBeInViewport();
  await links.nth(3).click();
  await expect(usage).toBeInViewport();
  await expect(usage).toBeFocused();
  await expect(links.nth(3)).toHaveAttribute('aria-current', 'location');
  expect(await page.evaluate(() => location.hash)).toBe('');

  // The current section follows scrolling, and the last one wins at the bottom.
  await preview.evaluate((el) => (el.scrollTop = 0));
  await expect(links.nth(0)).toHaveAttribute('aria-current', 'location');
  await preview.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(links.nth(4)).toHaveAttribute('aria-current', 'location');
  await expect(panel.locator('[aria-current]')).toHaveCount(1);

  // It updates as the document changes, and stays open after a reload.
  await editor.fill(`${OUTLINE_DOC}\n## Changelog\n`);
  await expect(links.last()).toHaveText('Changelog');
  await page.reload();
  await expect(panel).toBeVisible();

  // Without headings there's nothing to show.
  await editor.fill('Just a paragraph.\n');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeDisabled();
  await editor.fill('# Back\n');
  await expect(panel).toBeVisible();
  await expect(links).toHaveText(['Back']);

  await panel.getByRole('button', { name: 'Close outline' }).click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeFocused();
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

async function importReplacing(page, name, content) {
  await page.locator('#importFileInput').setInputFiles({
    name,
    mimeType: 'text/markdown',
    buffer: Buffer.from(content),
  });
  await page.locator('#importConfirmReplaceBtn').click();
  await expect(page.locator('#editor')).toHaveValue(content);
}

test('undoes an import that replaced the document', async ({ page }) => {
  const editor = page.locator('#editor');
  const toast = page.locator('#mdToast');
  const undo = toast.getByRole('button', { name: 'Undo' });

  await importReplacing(page, 'notes.md', '# Imported notes\n');
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toContainText('Replaced with notes.md');

  // Reachable from the keyboard, and focus returns to the editor once it's used.
  await undo.focus();
  await page.keyboard.press('Enter');
  await expect(editor).toHaveValue(fixture);
  await expect(editor).toBeFocused();
  await expect(toast).toHaveText('Import undone');
  await expect(page.locator('#preview h1')).toHaveText('Smoke Test');

  await page.reload();
  await expect(editor).toHaveValue(fixture);

  // Undo is withdrawn once the imported document is edited.
  await importReplacing(page, 'notes.md', '# Imported notes\n');
  await expect(undo).toBeVisible();
  await page.locator('#editorPane').click();
  await editor.pressSequentially('More');
  await expect(undo).toBeHidden();
  await expect(editor).toHaveValue(/More/);
});

test('replaces the welcome document without asking', async ({ browser }) => {
  const file = { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n') };

  // A first visit, before anything has been saved.
  async function firstVisit() {
    const page = await (await browser.newContext()).newPage();
    await page.goto('/');
    await expect(page.locator('#preview h1')).toHaveText(/^Welcome to mdfor\.dev/);
    return page;
  }

  let page = await firstVisit();
  await page.locator('#importFileInput').setInputFiles(file);
  await expect(page.locator('#editor')).toHaveValue('# Notes\n');
  await expect(page.locator('#importConfirmDialog')).toBeHidden();
  await expect(page.locator('#mdToast')).toHaveText('Imported notes.md');
  await page.context().close();

  // Once the welcome document has been edited, it's the reader's work.
  page = await firstVisit();
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially(' edited');
  await page.locator('#importFileInput').setInputFiles(file);
  await expect(page.locator('#importConfirmDialog')).toBeVisible();
  await page.context().close();
});

test('shows an imported document for reading, until the editor is reopened', async ({ page }) => {
  const editorPane = page.locator('#editorPane');
  const preview = page.locator('#preview');
  await preview.evaluate((el) => (el.scrollTop = el.scrollHeight));

  await importReplacing(page, 'notes.md', fixture.replace('# Smoke Test', '# Imported'));
  await expect(editorPane).toHaveClass(/collapsed/);
  await expect(preview.locator('h1')).toHaveText('Imported');
  expect(await preview.evaluate((el) => el.scrollTop)).toBe(0);

  // Undo puts the editor back along with the document.
  await page.locator('#mdToast').getByRole('button', { name: 'Undo' }).click();
  await expect(editorPane).not.toHaveClass(/collapsed/);

  // Reopening the editor after an import keeps it open for later imports.
  await importReplacing(page, 'notes.md', '# First\n');
  await expect(editorPane).toHaveClass(/collapsed/);
  await editorPane.click();
  await importReplacing(page, 'notes.md', '# Second\n');
  await expect(preview.locator('h1')).toHaveText('Second');
  await expect(editorPane).not.toHaveClass(/collapsed/);
});

function dragFile(page, { name, type, content = '' }) {
  return page.evaluateHandle(
    ({ name, type, content }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([content], name, { type }));
      return dataTransfer;
    },
    { name, type, content }
  );
}

test('imports a file dropped anywhere in the window', async ({ page }) => {
  const overlay = page.locator('#dropOverlay');
  const editor = page.locator('#editor');

  // The editor is hidden, so the drop starts over the preview.
  await page.locator('#collapseEditor').click();
  let dataTransfer = await dragFile(page, {
    name: 'notes.md',
    type: 'text/markdown',
    content: '# Dropped notes\n',
  });
  await page.locator('#preview').dispatchEvent('dragenter', { dataTransfer });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Drop to open');
  await overlay.dispatchEvent('dragover', { dataTransfer });
  await overlay.dispatchEvent('drop', { dataTransfer });
  await expect(overlay).toBeHidden();
  await page.locator('#importConfirmReplaceBtn').click();
  await expect(editor).toHaveValue('# Dropped notes\n');
  await expect(page.locator('#preview h1')).toHaveText('Dropped notes');

  // Leaving the window hides the overlay without importing.
  dataTransfer = await dragFile(page, { name: 'other.md', type: 'text/markdown' });
  await page.locator('.header').dispatchEvent('dragenter', { dataTransfer });
  await expect(overlay).toBeVisible();
  await overlay.dispatchEvent('dragleave', { dataTransfer });
  await expect(overlay).toBeHidden();

  // Files that clearly aren't markdown are refused before they're dropped.
  dataTransfer = await dragFile(page, { name: 'photo.png', type: 'image/png' });
  await page.locator('.header').dispatchEvent('dragenter', { dataTransfer });
  await expect(overlay).toHaveAttribute('data-state', 'unsupported');
  await expect(overlay).toContainText("Can't open this file");
  await overlay.dispatchEvent('drop', { dataTransfer });
  await expect(overlay).toBeHidden();
  await expect(page.locator('#importConfirmDialog')).toBeHidden();
  await expect(editor).toHaveValue('# Dropped notes\n');
});

test('leaves text dragged inside the editor alone', async ({ page }) => {
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'moved text');
    return dt;
  });
  await page.locator('#editor').dispatchEvent('dragenter', { dataTransfer });
  await page.locator('#editor').dispatchEvent('dragover', { dataTransfer });
  await expect(page.locator('#dropOverlay')).toBeHidden();
});

// The shortcut modifier the app chose for this browser, read from its own tooltip so the tests
// don't depend on how the emulated browser reports its platform.
async function getShortcutModifier(page) {
  const tooltip = await page.locator('#importBtn').getAttribute('data-tooltip');
  return tooltip.includes('Ctrl+') ? 'Control' : 'Meta';
}

// Reloads the page as if the installed app were launched by the OS with `file`
// (or with no file, like a normal launch). Later launches that reuse the open
// window (`client_mode: "focus-existing"`) go through `window.launchFile(file)`.
async function launchApp(page, file = null) {
  await page.addInitScript((file) => {
    const toHandle = ({ name, content }) => ({
      kind: 'file',
      name,
      getFile: async () => new File([content], name, { type: 'text/markdown' }),
    });
    Object.defineProperty(window, 'launchQueue', {
      configurable: true,
      value: {
        setConsumer: (consumer) => {
          window.launchFile = (f) => consumer({ files: f ? [toHandle(f)] : [] });
          window.launchFile(file);
        },
      },
    });
  }, file);
  await page.reload();
}

test('opens a file the OS launched the installed app with', async ({ page }) => {
  await launchApp(page, { name: 'launched.md', content: '# Launched notes\n' });
  await expect(page.locator('#importConfirmDesc')).toContainText('launched.md');
  await page.locator('#importConfirmReplaceBtn').click();
  await expect(page.locator('#editor')).toHaveValue('# Launched notes\n');
  await expect(page.locator('#preview h1')).toHaveText('Launched notes');
  // Like any import, it opens for reading.
  await expect(page.locator('#editorPane')).toHaveClass(/collapsed/);

  // Opening another file while the app is running reuses this window.
  await page.evaluate(() => window.launchFile({ name: 'second.md', content: '# Second\n' }));
  await expect(page.locator('#importConfirmDesc')).toContainText('second.md');
  await page.locator('#importConfirmReplaceBtn').click();
  await expect(page.locator('#preview h1')).toHaveText('Second');
});

test('ignores launches without a file', async ({ page }) => {
  await launchApp(page);
  await expect(page.locator('#preview h1')).toHaveText('Smoke Test');
  await expect(page.locator('#importConfirmDialog')).toBeHidden();
});

test('loads normally in browsers without launchQueue', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.launchQueue;
  });
  await page.reload();
  expect(await page.evaluate(() => 'launchQueue' in window)).toBe(false);
  await expect(page.locator('#preview h1')).toHaveText('Smoke Test');
});

test('imports and downloads with keyboard shortcuts', async ({ page }) => {
  const mod = await getShortcutModifier(page);
  await page.locator('#editor').focus();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press(`${mod}+o`);
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'shortcut.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# From a shortcut\n'),
  });
  await page.locator('#importConfirmReplaceBtn').click();
  await expect(page.locator('#editor')).toHaveValue('# From a shortcut\n');

  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press(`${mod}+s`);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('shortcut.md');
  expect(await readFile(await download.path(), 'utf8')).toBe('# From a shortcut\n');
});

test('collapses the editor with a shortcut, except while a dialog is open', async ({ page }) => {
  const mod = await getShortcutModifier(page);
  const editorPane = page.locator('#editorPane');
  const collapseBtn = page.locator('#collapseEditor');
  await expect(collapseBtn).toHaveAttribute('data-tooltip', /^Collapse editor \((⌘|Ctrl\+)\\\)$/);

  await page.keyboard.press(`${mod}+\\`);
  await expect(editorPane).toHaveClass(/collapsed/);
  await expect(collapseBtn).toHaveAttribute('data-tooltip', /^Expand editor /);
  await page.keyboard.press(`${mod}+\\`);
  await expect(editorPane).not.toHaveClass(/collapsed/);

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press(`${mod}+o`);
  await (
    await fileChooserPromise
  ).setFiles({ name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('# A\n') });
  await expect(page.locator('#importConfirmDialog')).toBeVisible();
  await page.keyboard.press(`${mod}+\\`);
  await expect(editorPane).not.toHaveClass(/collapsed/);
});

test('shows shortcuts in the Import tooltip and the Export menu', async ({ page }) => {
  await expect(page.locator('#importBtn')).toHaveAttribute(
    'data-tooltip',
    /^Import a file \((⌘|Ctrl\+)O\)$/
  );

  await page.locator('#exportMenuBtn').click();
  await expect(page.locator('#exportMdBtn .shortcut-hint')).toHaveText(/^(⌘|Ctrl\+)S$/);
  await expect(page.locator('#exportMdBtn')).toHaveAccessibleName('Download .md');
});

test('hides shortcut hints on small screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.locator('#headerMenuBtn').click();
  await page.locator('#exportMenuBtn').click();
  await expect(page.locator('#exportMdBtn')).toBeVisible();
  await expect(page.locator('#exportMdBtn .shortcut-hint')).toBeHidden();
});

test.describe('on macOS', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  });

  test('uses Cmd for shortcuts', async ({ page }) => {
    await expect(page.locator('#importBtn')).toHaveAttribute('data-tooltip', /\(⌘O\)$/);

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.keyboard.press('Meta+o');
    await fileChooserPromise;

    // Ctrl alone must not trigger anything.
    await page.keyboard.press('Control+\\');
    await expect(page.locator('#editorPane')).not.toHaveClass(/collapsed/);
  });
});

const HEADER_CONTROLS = [
  '#lintToggle',
  '#outlineToggle',
  '#remoteImagesToggle',
  '#importBtn',
  '#exportMenuBtn',
  '#themeToggle',
  '.repo-link',
];

test('keeps every header control inline on desktop', async ({ page }) => {
  await expect(page.locator('#headerMenuBtn')).toBeHidden();
  for (const selector of HEADER_CONTROLS) {
    await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
  }
});

test.describe('mobile header', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function expectNoHorizontalScroll(page) {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBe(0);
  }

  test('fits the screen and reaches every control from the menu in both themes', async ({
    page,
  }) => {
    const menuBtn = page.locator('#headerMenuBtn');
    const menu = page.locator('#headerMenu');

    for (const theme of ['light', 'dark']) {
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(menu).toBeHidden();
      await expectNoHorizontalScroll(page);

      await menuBtn.click();
      await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
      for (const selector of HEADER_CONTROLS) {
        await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
      }
      await expectNoHorizontalScroll(page);

      await page.locator('#themeToggle').click();
      await expect(menu).toBeHidden();
      await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
      await expect(menuBtn).toBeFocused();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await menuBtn.click();
    for (const selector of ['#lintToggle', '#remoteImagesToggle']) {
      const toggle = page.locator(selector);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(menu).toBeVisible();
    }
    await expect(page.locator('#lintPanel')).toBeVisible();
  });

  test('opens and closes the menu with the keyboard', async ({ page }) => {
    const menuBtn = page.locator('#headerMenuBtn');
    const menu = page.locator('#headerMenu');

    await menuBtn.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.locator('#lintToggle')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(menuBtn).toBeFocused();

    // Escape closes the Export submenu before the header menu.
    await page.keyboard.press('Enter');
    await page.locator('#exportMenuBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#exportMdBtn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#exportMenuPopover')).toBeHidden();
    await expect(page.locator('#exportMenuBtn')).toBeFocused();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(menuBtn).toBeFocused();

    await page.keyboard.press('Enter');
    await page.locator('.repo-link').focus();
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('switches to the Preview tab after an import, and back on Undo', async ({ page }) => {
    const previewTab = page.locator('.view-tab[data-view="preview"]');
    const editorTab = page.locator('.view-tab[data-view="editor"]');
    const preview = page.locator('#preview');
    await expect(editorTab).toHaveAttribute('aria-pressed', 'true');
    await preview.evaluate((el) => (el.scrollTop = el.scrollHeight));

    await importReplacing(page, 'notes.md', fixture.replace('# Smoke Test', '# Imported'));
    await expect(previewTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#previewPane')).toHaveClass(/mobile-active/);
    expect(await preview.evaluate((el) => el.scrollTop)).toBe(0);

    await page.locator('#mdToast').getByRole('button', { name: 'Undo' }).click();
    await expect(editorTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#editorPane')).toHaveClass(/mobile-active/);
  });

  test('opens the outline over the preview from the menu', async ({ page }) => {
    const menuBtn = page.locator('#headerMenuBtn');
    const panel = page.locator('#outlinePanel');
    await page.locator('#editor').fill(OUTLINE_DOC);

    async function openOutline() {
      await menuBtn.click();
      await page.locator('#outlineToggle').click();
      await expect(page.locator('#headerMenu')).toBeHidden();
      await expect(panel).toBeVisible();
    }

    await openOutline();
    await expect(page.locator('.view-tab[data-view="preview"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Picking a section closes the outline to show it.
    await panel.getByRole('link', { name: 'Usage' }).click();
    await expect(panel).toBeHidden();
    await expect(page.locator('#user-content-usage')).toBeInViewport();

    // Focus moves into the outline, to the current section.
    await openOutline();
    await expect(panel.getByRole('link', { name: 'Usage' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(menuBtn).toBeFocused();

    // Tapping the preview beside the outline closes it too.
    await openOutline();
    await page.locator('#preview').click({ position: { x: 10, y: 200 } });
    await expect(panel).toBeHidden();

    // On mobile the outline doesn't reopen by itself.
    await openOutline();
    await page.reload();
    await expect(page.locator('#preview h2').first()).toBeVisible();
    await expect(panel).toBeHidden();
  });

  test('imports and exports from the menu', async ({ page }) => {
    const menuBtn = page.locator('#headerMenuBtn');
    const menu = page.locator('#headerMenu');

    await menuBtn.click();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#importBtn').click();
    const fileChooser = await fileChooserPromise;
    await expect(menu).toBeHidden();
    await fileChooser.setFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Imported notes\n'),
    });
    await page.locator('#importConfirmReplaceBtn').click();
    await expect(page.locator('#editor')).toHaveValue('# Imported notes\n');

    await menuBtn.click();
    await page.locator('#exportMenuBtn').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportMdBtn').click();
    const download = await downloadPromise;
    await expect(menu).toBeHidden();
    expect(download.suggestedFilename()).toBe('notes.md');
    expect(await readFile(await download.path(), 'utf8')).toBe('# Imported notes\n');

    await menuBtn.click();
    await page.locator('#exportMenuBtn').click();
    await page.locator('#exportHtmlBtn').click();
    await expect(page.locator('#exportDialog')).toBeVisible();
    await expect(menu).toBeHidden();
    await page.locator('#exportCancelBtn').click();
    await expect(menuBtn).toBeFocused();
  });
});
