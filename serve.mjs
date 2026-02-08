/**
 * Lightweight static file server for development.
 * Zero dependencies — uses Node.js built-in http module.
 *
 * Usage: node serve.mjs [--port 3000]
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || process.argv.find((_, i, a) => a[i - 1] === '--port') || '3000');
const ROOT = join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  let url = req.url.split('?')[0];

  // Default to index.html
  if (url === '/') url = '/index.html';

  // Try exact path, then .html, then /index.html
  let filePath = join(ROOT, url);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    const withHtml = filePath + '.html';
    const withIndex = join(filePath, 'index.html');
    if (existsSync(withHtml)) filePath = withHtml;
    else if (existsSync(withIndex)) filePath = withIndex;
    else {
      // 404
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Docs server running at http://localhost:${PORT}\n`);
  console.log(`   Serving from: ${ROOT}\n`);
});
