## md-preview

A fast, private, browser-only markdown editor with live preview. Built as a single-page app that runs entirely in the client, with optional containerization for hosting on Fly.io.

### Features

- Live markdown preview powered by `marked` with `marked-highlight` and `DOMPurify` sanitization; syntax highlighting via lazy-loaded `highlight.js`
- Import markdown files (`.md`, `.markdown`, `.txt`) with confirm-before-replace
- Export self-contained HTML with embedded styles and optional base64 images
- KaTeX math and Mermaid diagrams loaded on demand
- Light/dark theme toggle with Highlight.js theme switching
- Local auto-save (content, theme, pane width, and collapse state stored in `localStorage` on your device only)
- Resizable split panes and collapsible editor for focused reading
- Responsive layout and sensible defaults with a rich starter document
- Self-hosted fonts and bundled dependencies (no third-party CDNs)

### Quick Start

Prerequisites: Node.js 18+ and npm.

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

### Container Build

The provided `Dockerfile` uses Caddy to serve the static assets:

```bash
docker build -t md-preview .
docker run -p 3000:3000 md-preview
```

### Deployment (Fly.io)

`fly.toml` is configured for port 3000 with one shared CPU/256MB machine. Typical flow:

```bash
fly auth login
fly deploy
```

Build before deploying:

```bash
npm run build
```

### Tech Stack

- HTML/CSS/JS (no UI framework)
- Vite for bundling and code-splitting
- npm dependencies: `marked`, `marked-highlight`, `DOMPurify`, `highlight.js`, `katex`, `marked-katex-extension`, `mermaid`
- Self-hosted fonts via `@fontsource`
- Caddy (Docker) for static file serving

### Project Structure

- `index.html` – Layout and entry point
- `app.js` – Editor logic (preview, autosave, theming, resize/collapse)
- `lib/lazy-vendors.js` – Lazy-loaded heavy dependencies (hljs, KaTeX, Mermaid)
- `styles.css` – Theming, layout, responsive styles
- `vite.config.js` – Build configuration
- `_headers` – Cache and CSP headers for static hosting
- `Dockerfile` / `fly.toml` – Deployment artifacts for Fly.io

### Notes

- Markdown content and settings stay on your device; nothing is sent to a backend.
- All scripts, styles, and fonts are served from the same origin (no CDN requests).
- External images in markdown still load from their URLs when referenced.
- If `localStorage` is unavailable, the app still works but won’t persist settings/content.
