# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/ikhattab/md-preview/security/advisories/new). Do not open a public issue.

Include steps to reproduce and, where possible, a markdown sample that triggers the problem. You should get a response within a few days.

## Scope

Only the latest version on `main` (deployed at [mdfor.dev](https://mdfor.dev)) is supported. Issues of particular interest:

- Script execution or HTML injection through rendered markdown, Mermaid diagrams, or KaTeX
- Bypasses of the Content Security Policy in [`_headers`](_headers)
- Anything that causes document content to leave the user's device
