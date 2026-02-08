# Exolane Docs Site

Lightweight, fast, GitBook-style documentation site generator with **zero external dependencies**.

Built entirely with Node.js built-in modules — no npm install required.

## Features

- ⚡ **Instant builds** — generates static HTML in milliseconds
- 🔍 **Client-side search** — pre-built search index, no server needed
- 🌙 **Dark/Light themes** — system preference detection + manual toggle
- 📱 **Fully responsive** — works on all screen sizes
- 📖 **GitBook-compatible** — reads `SUMMARY.md` for navigation
- 🖨️ **Print-friendly** — clean print styles
- ♿ **Accessible** — semantic HTML, keyboard navigation
- 🔗 **Anchor links** — heading anchors for deep linking
- ⌨️ **Keyboard shortcuts** — `⌘K` for search, `Escape` to close
- 📋 **Code copy buttons** — one-click code block copying
- 📑 **Table of Contents** — auto-generated from headings, scroll tracking
- ⬅️➡️ **Prev/Next navigation** — sequential page browsing

## Quick Start

```bash
# Build the docs
node build.mjs

# Serve locally
node serve.mjs

# Open http://localhost:3000
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build static site to `dist/` |
| `npm run dev` | Watch mode — rebuild on changes |
| `npm run serve` | Start local dev server on port 3000 |
| `npm run clean` | Remove `dist/` directory |

## Project Structure

```
docs-site/
├── build.mjs          # Static site generator (markdown → HTML)
├── serve.mjs          # Zero-dep dev server
├── package.json       # Scripts only, no dependencies
├── templates/
│   └── page.html      # HTML template with inlined CSS/JS
├── assets/
│   ├── favicon.svg    # Site favicon
│   └── logo.svg       # Site logo
└── dist/              # Generated output (git-ignored)
```

## How It Works

1. **Reads `SUMMARY.md`** from `../docs/` to build navigation
2. **Parses each markdown file** with a custom zero-dep parser
3. **Generates static HTML** with inlined CSS and JS
4. **Builds search index** as a JSON file
5. **Copies assets** (images, favicons)

### Markdown Support

- Headings (h1–h6 with anchor links)
- Bold, italic, strikethrough, inline code
- Code blocks with language labels and copy buttons
- Tables with responsive wrapping
- Ordered and unordered lists
- Images and figures
- Links (internal `.md` → `.html` conversion)
- Blockquotes
- Horizontal rules
- GitBook hints (`{% hint style="info" %}`)
- GitBook content-ref tags (cleaned)
- YAML frontmatter (description extracted)

## Configuration

Edit the `CONFIG` object at the top of `build.mjs`:

```js
const CONFIG = {
  contentDir: resolve(__dirname, '../docs'),   // Markdown source
  outputDir: resolve(__dirname, 'dist'),       // HTML output
  siteName: 'Exolane Docs',                    // Site title
  siteUrl: 'https://docs.exolane.com',         // Canonical URL
  description: '...',                          // Default meta description
};
```

## Deployment

The `dist/` folder is a fully static site. Deploy anywhere:

- **Vercel**: `vercel --prod` from the `dist/` folder
- **Cloudflare Pages**: Point build to `node build.mjs`, output to `dist/`
- **Netlify**: Same as Cloudflare
- **GitHub Pages**: Copy `dist/` to your gh-pages branch
- **S3 + CloudFront**: Upload `dist/` to bucket
- **Any static host**: Just serve the `dist/` folder

## Zero Dependencies

This project uses **only Node.js built-in modules**:
- `fs` — file operations
- `path` — path manipulation
- `http` — dev server
- `url` — module resolution

No `npm install` needed. No `node_modules`. No supply chain risk.
