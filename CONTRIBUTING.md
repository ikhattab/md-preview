# Contributing

Thanks for your interest in improving mdfor.dev! Bug reports, fixes, and focused improvements are all welcome.

## Getting started

Prerequisites: Node.js 20.19+ (or 22.12+) and npm.

```bash
git clone https://github.com/ikhattab/md-preview.git
cd md-preview
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run check   # ESLint + Prettier
npm run build   # production build
```

`npm run lint:fix` and `npm run format` fix most issues automatically.

## Guidelines

- **Privacy first.** Content never leaves the user's device. Don't add analytics, CDNs, remote fonts, or any network requests.
- **No UI framework.** The app is plain HTML, CSS, and ES modules bundled with Vite. See the project structure in the [README](README.md#project-structure).
- **Keep startup fast.** Heavy dependencies (highlight.js, KaTeX, Mermaid) are lazy-loaded in `lib/lazy-vendors.js`; new heavy features should be too.
- **Sanitize rendered output.** Anything that turns markdown into HTML must go through DOMPurify.
- **Test both themes** and a narrow mobile viewport for UI changes.

## Pull requests

- Keep each PR focused on one change. For larger features, open an issue first to discuss the approach.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for the PR title, e.g. `fix(export): keep code block colors in PDF`. PRs are squash-merged, so the title becomes the commit message.
- CI runs lint, format check, and build on every PR.

## Reporting security issues

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
