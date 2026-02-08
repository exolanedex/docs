/**
 * Exolane Docs — Static Site Generator
 * 
 * Zero-dependency GitBook-style documentation builder.
 * Parses SUMMARY.md for navigation, converts Markdown → HTML,
 * generates search index, handles dark/light themes.
 * 
 * Usage:
 *   node build.mjs           # Build once
 *   node build.mjs --watch   # Watch for changes & rebuild
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync, statSync, watch } from 'node:fs';
import { join, dirname, basename, relative, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Configuration ──────────────────────────────────────────
const CONFIG = {
  contentDir: resolve(__dirname, '../docs'),
  outputDir: resolve(__dirname, 'dist'),
  templateDir: resolve(__dirname, 'templates'),
  assetsDir: resolve(__dirname, 'assets'),
  siteName: 'Exolane Docs',
  siteUrl: 'https://docs.exolane.com',
  description: 'Non-custodial leveraged trading on Arbitrum',
  favicon: '/assets/favicon.svg',
  logo: '/assets/logo.svg',
};

// ─── Markdown Parser ────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Parse inline markdown: bold, italic, code, links, images, strikethrough
 */
function parseInline(text) {
  // Escape HTML entities first (but preserve already-handled tags)
  let result = text;

  // Code (inline) — must be first to prevent inner parsing
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Images
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    // Fix relative paths for .gitbook assets
    const fixedSrc = src.replace(/^\.\.\/\.gitbook\/assets\//, '/assets/images/');
    return `<img src="${fixedSrc}" alt="${escapeHtml(alt)}" loading="lazy">`;
  });

  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, href) => {
    // Convert .md links to .html
    let fixedHref = href;
    if (fixedHref.endsWith('.md')) {
      fixedHref = fixedHref.replace(/\.md$/, '.html');
    }
    if (fixedHref.endsWith('/')) {
      fixedHref = fixedHref + 'index.html';
    }
    // Fix README.md → index.html
    fixedHref = fixedHref.replace(/README\.html/g, 'index.html');
    const isExternal = /^https?:\/\//.test(fixedHref);
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${fixedHref}"${target}>${parseInline(linkText)}</a>`;
  });

  // Bold + Italic
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Strikethrough
  result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Emoji shortcodes (basic common ones)
  const emojiMap = { ':warning:': '⚠️', ':info:': 'ℹ️', ':check:': '✅', ':x:': '❌' };
  for (const [code, emoji] of Object.entries(emojiMap)) {
    result = result.replaceAll(code, emoji);
  }

  return result;
}

/**
 * Parse a full markdown document to HTML, returning { html, headings, frontmatter, plainText }
 */
function parseMarkdown(markdown) {
  const headings = [];
  const plainTextParts = [];

  // Extract frontmatter
  let frontmatter = {};
  let content = markdown;
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    content = content.slice(fmMatch[0].length);
    const lines = fmMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
      if (m) frontmatter[m[1]] = m[2].trim();
    }
  }

  // Remove GitBook-specific tags
  content = content.replace(/\{%\s*content-ref\s+url="[^"]*"\s*%\}[\s\S]*?\{%\s*endcontent-ref\s*%\}/g, '');
  content = content.replace(/<figure>[\s\S]*?<\/figure>/g, (match) => {
    const imgMatch = match.match(/<img\s+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/);
    if (imgMatch) {
      const src = imgMatch[1].replace(/^\.gitbook\/assets\//, '/assets/images/').replace(/^\.\.\/\.gitbook\/assets\//, '/assets/images/');
      return `<figure class="doc-figure"><img src="${src}" alt="${escapeHtml(imgMatch[2])}" loading="lazy"><figcaption>${escapeHtml(imgMatch[2])}</figcaption></figure>`;
    }
    return '';
  });

  const lines = content.split('\n');
  const htmlParts = [];
  let i = 0;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines = [];
  let inTable = false;
  let tableRows = [];
  let inList = false;
  let listType = 'ul';
  let listItems = [];
  let inHint = false;
  let hintType = '';
  let hintLines = [];
  let inBlockquote = false;
  let blockquoteLines = [];

  function flushList() {
    if (!inList) return;
    htmlParts.push(`<${listType} class="doc-list">`);
    for (const item of listItems) {
      htmlParts.push(`<li>${parseInline(item)}</li>`);
      plainTextParts.push(item);
    }
    htmlParts.push(`</${listType}>`);
    inList = false;
    listItems = [];
  }

  function flushTable() {
    if (!inTable) return;
    if (tableRows.length === 0) { inTable = false; return; }

    htmlParts.push('<div class="table-wrapper"><table>');
    // First row is header
    const header = tableRows[0];
    htmlParts.push('<thead><tr>');
    for (const cell of header) {
      htmlParts.push(`<th>${parseInline(cell.trim())}</th>`);
    }
    htmlParts.push('</tr></thead>');

    // Remaining rows (skip separator row)
    htmlParts.push('<tbody>');
    for (let r = 1; r < tableRows.length; r++) {
      // Skip separator rows (---|---)
      if (tableRows[r].every(c => /^[-:\s]+$/.test(c))) continue;
      htmlParts.push('<tr>');
      for (const cell of tableRows[r]) {
        htmlParts.push(`<td>${parseInline(cell.trim())}</td>`);
        plainTextParts.push(cell.trim());
      }
      htmlParts.push('</tr>');
    }
    htmlParts.push('</tbody></table></div>');
    inTable = false;
    tableRows = [];
  }

  function flushBlockquote() {
    if (!inBlockquote) return;
    htmlParts.push(`<blockquote>${blockquoteLines.map(l => parseInline(l)).join('<br>')}</blockquote>`);
    inBlockquote = false;
    blockquoteLines = [];
  }

  function flushHint() {
    if (!inHint) return;
    const iconMap = { info: 'ℹ️', warning: '⚠️', success: '✅', danger: '🚨', tip: '💡' };
    const icon = iconMap[hintType] || 'ℹ️';
    const hintContent = hintLines.map(l => parseInline(l)).join('\n');
    htmlParts.push(`<div class="hint hint-${hintType}"><span class="hint-icon">${icon}</span><div class="hint-content">${parseMarkdownBlock(hintContent)}</div></div>`);
    inHint = false;
    hintLines = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const escapedCode = escapeHtml(codeLines.join('\n'));
        htmlParts.push(`<div class="code-block"><div class="code-header"><span class="code-lang">${codeBlockLang || 'text'}</span><button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div><pre><code class="language-${codeBlockLang}">${escapedCode}</code></pre></div>`);
        plainTextParts.push(codeLines.join('\n'));
        inCodeBlock = false;
        codeLines = [];
      } else {
        flushList();
        flushTable();
        flushBlockquote();
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      i++;
      continue;
    }

    // GitBook hints
    const hintStart = line.match(/\{%\s*hint\s+style="(\w+)"\s*%\}/);
    if (hintStart) {
      flushList();
      flushTable();
      flushBlockquote();
      inHint = true;
      hintType = hintStart[1];
      i++;
      continue;
    }
    if (line.match(/\{%\s*endhint\s*%\}/)) {
      flushHint();
      i++;
      continue;
    }
    if (inHint) {
      hintLines.push(line);
      i++;
      continue;
    }

    // Skip GitBook table data-view="cards" markup (parse as regular table)
    if (line.match(/<table\s+data/)) { i++; continue; }
    if (line.match(/<\/table>/)) { i++; continue; }
    if (line.match(/<thead>|<\/thead>|<tbody>|<\/tbody>|<tr>|<\/tr>/)) { i++; continue; }
    if (line.match(/<td>|<th>/)) {
      const cellContent = line.replace(/<\/?t[dh]>/g, '').trim();
      if (cellContent) {
        htmlParts.push(`<p>${parseInline(cellContent)}</p>`);
      }
      i++;
      continue;
    }

    // Table rows
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      flushBlockquote();
      const cells = line.trim().slice(1, -1).split('|');
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(cells);
      i++;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushTable();
      flushBlockquote();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const id = slugify(text.replace(/\*\*/g, ''));
      headings.push({ level, text: text.replace(/\*\*/g, ''), id });
      plainTextParts.push(text.replace(/\*\*/g, ''));
      htmlParts.push(`<h${level} id="${id}"><a href="#${id}" class="heading-anchor">#</a>${parseInline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      flushTable();
      flushBlockquote();
      htmlParts.push('<hr>');
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      flushList();
      flushTable();
      if (!inBlockquote) inBlockquote = true;
      blockquoteLines.push(line.slice(1).trim());
      i++;
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Unordered list
    if (/^(\s*)([-*])\s+(.+)$/.test(line)) {
      flushTable();
      flushBlockquote();
      const m = line.match(/^(\s*)([-*])\s+(.+)$/);
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
        listItems = [];
      }
      listItems.push(m[3]);
      i++;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+(.+)$/.test(line)) {
      flushTable();
      flushBlockquote();
      const m = line.match(/^\s*\d+\.\s+(.+)$/);
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
        listItems = [];
      }
      listItems.push(m[1]);
      i++;
      continue;
    }

    // Flush list if we hit a non-list line
    if (inList && line.trim() !== '') {
      flushList();
    }

    // Empty line
    if (line.trim() === '') {
      if (inList && i + 1 < lines.length && /^(\s*[-*]|\s*\d+\.)\s/.test(lines[i + 1])) {
        // Continuation of list
      } else {
        flushList();
      }
      i++;
      continue;
    }

    // Regular paragraph
    htmlParts.push(`<p>${parseInline(line)}</p>`);
    plainTextParts.push(line);
    i++;
  }

  // Flush remaining
  flushList();
  flushTable();
  flushBlockquote();
  flushHint();

  return {
    html: htmlParts.join('\n'),
    headings,
    frontmatter,
    plainText: plainTextParts.join(' ').replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Parse a small block of markdown (for hints etc.)
 */
function parseMarkdownBlock(text) {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  return lines.map(l => `<p>${parseInline(l)}</p>`).join('\n');
}

// ─── Navigation Parser ─────────────────────────────────────

function parseSummary(summaryPath) {
  const content = readFileSync(summaryPath, 'utf-8');
  const lines = content.split('\n');
  const nav = [];
  let currentGroup = null;

  for (const line of lines) {
    // Group heading (## section)
    const groupMatch = line.match(/^##\s+(.+)$/);
    if (groupMatch) {
      currentGroup = { title: groupMatch[1].trim(), items: [] };
      nav.push(currentGroup);
      continue;
    }

    // Nav item: * [Title](path.md)
    const itemMatch = line.match(/^\*\s+\[([^\]]+)\]\(([^)]+)\)/);
    if (itemMatch) {
      const title = itemMatch[1].trim();
      let path = itemMatch[2].trim();

      // Convert README.md → index.html, others → .html
      let htmlPath = path;
      if (htmlPath === 'README.md') {
        htmlPath = 'index.html';
      } else {
        htmlPath = htmlPath.replace(/README\.md$/, 'index.html').replace(/\.md$/, '.html');
      }

      const item = { title, mdPath: path, htmlPath, path: '/' + htmlPath };
      if (currentGroup) {
        currentGroup.items.push(item);
      } else {
        // Items before any group
        if (!nav.find(g => g.title === '')) {
          nav.unshift({ title: '', items: [] });
        }
        nav[0].items.push(item);
      }
    }
  }

  return nav;
}

/**
 * Flatten nav into ordered page list for prev/next
 */
function flattenNav(nav) {
  const pages = [];
  for (const group of nav) {
    for (const item of group.items) {
      pages.push(item);
    }
  }
  return pages;
}

// ─── Template Engine ────────────────────────────────────────

function getTemplate() {
  return readFileSync(join(CONFIG.templateDir, 'page.html'), 'utf-8');
}

function renderTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? '');
  }
  return result;
}

function buildSidebarHtml(nav, currentPath) {
  const parts = [];
  for (const group of nav) {
    if (group.title) {
      parts.push(`<div class="nav-group-title">${group.title}</div>`);
    }
    parts.push('<ul class="nav-list">');
    for (const item of group.items) {
      const active = currentPath === item.path ? ' class="active"' : '';
      parts.push(`<li${active}><a href="${item.path}">${item.title}</a></li>`);
    }
    parts.push('</ul>');
  }
  return parts.join('\n');
}

function buildTocHtml(headings) {
  if (headings.length <= 1) return '';
  const filtered = headings.filter(h => h.level >= 2 && h.level <= 3);
  if (filtered.length === 0) return '';

  const parts = ['<nav class="toc"><div class="toc-title">On this page</div><ul>'];
  for (const h of filtered) {
    const indent = h.level === 3 ? ' class="toc-sub"' : '';
    parts.push(`<li${indent}><a href="#${h.id}">${h.text}</a></li>`);
  }
  parts.push('</ul></nav>');
  return parts.join('\n');
}

function buildPrevNextHtml(pages, currentPath) {
  const idx = pages.findIndex(p => p.path === currentPath);
  if (idx === -1) return '';

  const parts = ['<div class="prev-next">'];
  if (idx > 0) {
    const prev = pages[idx - 1];
    parts.push(`<a href="${prev.path}" class="prev-next-link prev"><span class="prev-next-label">← Previous</span><span class="prev-next-title">${prev.title}</span></a>`);
  } else {
    parts.push('<div></div>');
  }
  if (idx < pages.length - 1) {
    const next = pages[idx + 1];
    parts.push(`<a href="${next.path}" class="prev-next-link next"><span class="prev-next-label">Next →</span><span class="prev-next-title">${next.title}</span></a>`);
  } else {
    parts.push('<div></div>');
  }
  parts.push('</div>');
  return parts.join('\n');
}

// ─── Search Index Builder ───────────────────────────────────

function buildSearchIndex(pages, contentDir) {
  const index = [];
  for (const page of pages) {
    try {
      const mdPath = join(contentDir, page.mdPath);
      if (!existsSync(mdPath)) continue;
      const md = readFileSync(mdPath, 'utf-8');
      const { plainText, headings } = parseMarkdown(md);
      index.push({
        title: page.title,
        path: page.path,
        text: plainText.slice(0, 500), // Keep index compact
        headings: headings.map(h => h.text).join(' '),
      });
    } catch (e) {
      // Skip files that don't exist
    }
  }
  return index;
}

// ─── Copy Assets ────────────────────────────────────────────

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

// ─── Main Build ─────────────────────────────────────────────

function build() {
  const startTime = Date.now();
  console.log('\n🔨 Building Exolane Docs...\n');

  // Parse navigation
  const summaryPath = join(CONFIG.contentDir, 'SUMMARY.md');
  const nav = parseSummary(summaryPath);
  const pages = flattenNav(nav);

  console.log(`  📋 ${pages.length} pages found`);

  // Clean & create output dir
  mkdirSync(CONFIG.outputDir, { recursive: true });

  // Load template
  const template = getTemplate();

  // Build each page
  let built = 0;
  for (const page of pages) {
    const mdPath = join(CONFIG.contentDir, page.mdPath);
    if (!existsSync(mdPath)) {
      console.log(`  ⚠️  Missing: ${page.mdPath}`);
      continue;
    }

    const md = readFileSync(mdPath, 'utf-8');
    const { html, headings, frontmatter } = parseMarkdown(md);
    const sidebarHtml = buildSidebarHtml(nav, page.path);
    const tocHtml = buildTocHtml(headings);
    const prevNextHtml = buildPrevNextHtml(pages, page.path);
    const description = frontmatter.description || CONFIG.description;
    const pageTitle = page.title === 'Welcome to Exolane' ? CONFIG.siteName : `${page.title} | ${CONFIG.siteName}`;

    // Inject hero banner for the landing page
    let contentHtml = html;
    if (frontmatter.layout === 'landing') {
      const heroBanner = `<div class="hero-banner">
  <div class="hero-glow-left"></div>
  <svg class="hero-logo" xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 100 100">
    <defs><mask id="heroLogoMask"><rect width="150" height="100" fill="white"/><polygon points="50,30 70,50 50,70 30,50" fill="black"/></mask></defs>
    <g mask="url(#heroLogoMask)"><polygon points="25,15 75,15 95,50 75,85 25,85 5,50" fill="white"/><polygon points="5,50 25,85 50,50 25,15" fill="rgba(255,255,255,0.6)"/></g>
  </svg>
  <div class="hero-banner-inner">
    <div class="hero-banner-tagline">Documentation</div>
    <div class="hero-banner-title">Exolane Protocol</div>
    <div class="hero-banner-subtitle">Non-custodial leveraged trading on Arbitrum One. Predictable costs, transparent risk, on-chain rules.</div>
  </div>
</div>`;
      // Remove the square logo image that GitBook adds after the h1
      contentHtml = contentHtml.replace(/<figure class="doc-figure">[\s\S]*?<\/figure>/, '');
      // Insert hero banner after the first h1
      contentHtml = contentHtml.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/, heroBanner + '\n$1');
    }

    const output = renderTemplate(template, {
      title: pageTitle,
      description,
      siteName: CONFIG.siteName,
      favicon: CONFIG.favicon,
      siteUrl: CONFIG.siteUrl,
      sidebar: sidebarHtml,
      content: contentHtml,
      toc: tocHtml,
      prevNext: prevNextHtml,
      pageTitle: page.title,
      currentPath: page.path,
    });

    const outPath = join(CONFIG.outputDir, page.htmlPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, output);
    built++;
  }

  console.log(`  ✅ ${built} pages built`);

  // Build search index
  const searchIndex = buildSearchIndex(pages, CONFIG.contentDir);
  mkdirSync(join(CONFIG.outputDir, 'assets'), { recursive: true });
  writeFileSync(
    join(CONFIG.outputDir, 'assets', 'search-index.json'),
    JSON.stringify(searchIndex)
  );
  console.log(`  🔍 Search index: ${searchIndex.length} entries`);

  // Build sitemap.xml for SEO
  const sitemapEntries = pages.map(p => {
    const loc = CONFIG.siteUrl + p.path;
    return `  <url><loc>${loc}</loc><changefreq>weekly</changefreq><priority>${p.path === '/index.html' ? '1.0' : '0.7'}</priority></url>`;
  });
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join('\n')}\n</urlset>`;
  writeFileSync(join(CONFIG.outputDir, 'sitemap.xml'), sitemapXml);
  console.log(`  🗺️  Sitemap: ${pages.length} URLs`);

  // Build robots.txt for SEO
  const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${CONFIG.siteUrl}/sitemap.xml\n`;
  writeFileSync(join(CONFIG.outputDir, 'robots.txt'), robotsTxt);
  console.log('  🤖 robots.txt generated');

  // Copy assets
  copyDir(CONFIG.assetsDir, join(CONFIG.outputDir, 'assets'));

  // Copy .gitbook/assets if they exist
  const gitbookAssets = join(CONFIG.contentDir, '.gitbook', 'assets');
  if (existsSync(gitbookAssets)) {
    copyDir(gitbookAssets, join(CONFIG.outputDir, 'assets', 'images'));
    console.log('  📸 Gitbook assets copied');
  }

  const elapsed = Date.now() - startTime;
  console.log(`\n✨ Done in ${elapsed}ms → ${CONFIG.outputDir}\n`);
}

// ─── Watch Mode ─────────────────────────────────────────────

function watchMode() {
  build();
  console.log('👀 Watching for changes...\n');

  let debounce = null;
  const watcher = (dir) => {
    if (!existsSync(dir)) return;
    watch(dir, { recursive: true }, (event, filename) => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log(`\n📝 Changed: ${filename}`);
        try { build(); } catch (e) { console.error('Build error:', e.message); }
      }, 200);
    });
  };

  watcher(CONFIG.contentDir);
  watcher(CONFIG.templateDir);
  watcher(CONFIG.assetsDir);
}

// ─── Entry Point ────────────────────────────────────────────

if (process.argv.includes('--watch')) {
  watchMode();
} else {
  build();
}
