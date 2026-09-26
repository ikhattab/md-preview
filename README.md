## mdfor.dev

A fast, private, browser-only markdown editor with live preview. Built as a single-page app that runs entirely in the client.

Production: [https://mdfor.dev](https://mdfor.dev) (deployed via Cloudflare Pages from GitHub). **mdfor.work** redirects to **mdfor.dev**.

### Features

- Live markdown preview powered by `marked` with `marked-highlight` and `DOMPurify` sanitization; syntax highlighting via lazy-loaded `highlight.js`
- Import markdown files (`.md`, `.markdown`, `.txt`) with confirm-before-replace
- Export markdown source (`.md`), self-contained HTML with embedded styles and optional base64 images, or PDF via the browser print dialog (Save as PDF)
- KaTeX math and Mermaid diagrams loaded on demand
- Light/dark theme toggle with Highlight.js theme switching
- Local auto-save (content, theme, pane width, and collapse state stored in `localStorage` on your device only)
- Resizable split panes and collapsible editor for focused reading
- Scroll sync, custom markdown lint rules, and mobile editor/preview tabs
- Responsive layout and sensible defaults with a rich starter document
- Self-hosted fonts and bundled dependencies (no third-party CDNs)

### Quick Start

Prerequisites: Node.js 20.19+ (or 22.12+) and npm.

```bash
npm install
npm run dev      # Vite dev server at http://localhost:5173
```

For a production-like preview:

```bash
npm run build
npm run preview  # serves ./dist at http://localhost:3000
```

### Scripts

- `npm run dev` – Vite dev server with hot reload
- `npm run build` – Production build to `dist/`
- `npm run preview` – Serve the production build locally on port 3000
- `npm run lint` – Run ESLint (no autofix)
- `npm run lint:fix` – ESLint with autofix
- `npm run format` / `npm run format:check` – Prettier format/check
- `npm run check` – Lint and format check

### Deployment

This repo deploys automatically to **Cloudflare Pages** (`md-preview` project) on pushes to `main`:

- Build command: `npm run build`
- Output directory: `dist`
- Custom domain: **https://mdfor.dev**

For other static hosts (Netlify, S3, nginx, etc.), build and serve `dist/`:

```bash
npm run build
```

Cache headers for hashed assets are defined in [`_headers`](_headers) for hosts that support it.

### Tech Stack

- HTML/CSS/JS (no UI framework)
- Vite for bundling and code-splitting
- npm dependencies: `marked`, `marked-highlight`, `DOMPurify`, `highlight.js`, `katex`, `marked-katex-extension`, `mermaid`
- Self-hosted fonts via `@fontsource`

### Project Structure

- `index.html` – Layout and entry point
- `app.js` – Initialization and event wiring
- `lib/constants.js` – Shared constants and default content
- `lib/dom.js` – DOM element references
- `lib/storage.js` – `localStorage` helpers
- `lib/utils.js` – Debounce, throttle, and string helpers
- `lib/preview.js` – Markdown parsing, sanitization, Mermaid, and preview updates
- `lib/gutter.js` – Line number gutter
- `lib/lint.js` – Custom markdown lint rules and panel UI
- `lib/theme.js` – Theme load/toggle
- `lib/layout.js` – Resize, collapse, mobile view, scroll sync
- `lib/content.js` – Auto-save and content load
- `lib/import-export.js` – Import and Markdown/HTML/PDF export
- `lib/lazy-vendors.js` – Lazy-loaded heavy dependencies (hljs, KaTeX, Mermaid)
- `lib/media-viewer.js` – Fullscreen image and diagram viewer
- `lib/icons.js` – Lucide icon helpers
- `lib/tooltip.js` – Viewport-aware tooltips
- `lib/fonts.js` – Self-hosted font imports
- `styles.css` – Theming, layout, responsive styles
- `vite.config.js` – Build configuration
- `scripts/og-image.html` – Source page for the social preview image
- `_headers` – Cache headers for static hosting
- `site.webmanifest` – Web app manifest metadata

### Notes

- Markdown content and settings stay on your device; nothing is sent to a backend.
- All scripts, styles, and fonts are served from the same origin (no CDN requests).
- External images in markdown still load from their URLs when referenced.
- If `localStorage` is unavailable, the app still works but won’t persist settings/content.

### License

[MIT](LICENSE) © Ihab Khattab
