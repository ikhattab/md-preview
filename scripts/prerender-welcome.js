import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { gfmHeadingId } from 'marked-gfm-heading-id';

const PREVIEW_ELEMENT = /(<article\b[^>]*\bid="preview"[^>]*>)\s*(<\/article>)/;

/**
 * Render the welcome guide to HTML without the browser-only parts of the preview (highlighting,
 * math, diagrams). Ids match the sanitized preview's `user-content-` prefix. Images are left out,
 * since they'd load before the first render replaces them, even for a returning reader offline.
 * @param {string} markdown
 * @returns {string}
 */
export function renderWelcome(markdown) {
  return new Marked({ gfm: true, breaks: false, renderer: { image: () => '' } })
    .use(gfmHeadingId({ prefix: 'user-content-' }), markedFootnote(), markedAlert())
    .parse(markdown);
}

/**
 * Vite plugin that fills the empty preview with the welcome guide, which is what a first visit
 * shows, so crawlers that don't run JavaScript see the page's content. The first render replaces it.
 */
export function prerenderWelcome() {
  return {
    name: 'prerender-welcome',
    transformIndexHtml(html) {
      if (!PREVIEW_ELEMENT.test(html)) {
        throw new Error('index.html is missing an empty <article id="preview"> to prerender into');
      }
      const welcome = renderWelcome(readFileSync(resolve('lib/welcome.md'), 'utf8'));
      return html.replace(PREVIEW_ELEMENT, (_match, open, close) => `${open}${welcome}${close}`);
    },
  };
}
