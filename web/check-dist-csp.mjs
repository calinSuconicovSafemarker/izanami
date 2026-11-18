// Fails the build if dist/index.html contains inline scripts or styles (CSP, ADR-0004).
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');
const problems = [];
if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('inline <script> without src');
if (/<script\b[^>]*>\s*\S[\s\S]*?<\/script>/i.test(html)) problems.push('<script> with a body');
if (/<style\b/i.test(html)) problems.push('<style> element');
if (/\sstyle\s*=/i.test(html)) problems.push('style= attribute');
const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
if (!meta) problems.push('missing CSP <meta> tag');
else if (
  !/script-src 'self'/.test(meta[1].replaceAll('&#39;', "'")) ||
  !/https:\/\/rdap\.org/.test(meta[1])
)
  problems.push('CSP <meta> lacks script-src self or the RDAP allowlist');
if (/(src|href)="\/(?!\/)/i.test(html))
  problems.push('absolute asset path (breaks under /izanami/)');

if (problems.length > 0) {
  console.error(`dist/index.html violates CSP: ${problems.join(', ')}`);
  process.exit(1);
}
console.log('dist/index.html: no inline scripts or styles');
