## md-preview

A fast, private, browser-only markdown editor with live preview. Built as a single-page app that runs entirely in the client, with optional containerization for hosting on Fly.io.

### Features

- Live markdown preview powered by `marked` with syntax highlighting via `highlight.js`
- Light/dark theme toggle with Highlight.js theme switching
- Local auto-save (content, theme, pane width, and collapse state stored in `localStorage` on your device only)
- Resizable split panes and collapsible editor for focused reading
- Responsive layout and sensible defaults with a rich starter document

### Quick Start

Prerequisites: Node.js 18+ (for the dev server) and npm.

```bash
npm install
npm run dev      # serves the static site at http://localhost:3000
```

You can also preview without Node by using any static file server against the repo root (e.g., `python -m http.server 3000`).

### Scripts

- `npm run dev` – Serve the site locally on port 3000
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

### Tech Stack

- HTML/CSS/JS only (no framework)
- CDN: `marked` for markdown parsing, `highlight.js` for code highlighting
- Caddy (Docker) for static file serving

### Project Structure

- `index.html` – Layout and asset loading
- `styles.css` – Theming, layout, responsive styles
- `app.js` – Editor logic (preview, autosave, theming, resize/collapse)
- `Dockerfile` / `fly.toml` – Deployment artifacts for Fly.io

### Notes

- All data stays on your device in the browser; nothing is sent to a backend or third party.
- If `localStorage` is unavailable, the app still works but won’t persist settings/content.
