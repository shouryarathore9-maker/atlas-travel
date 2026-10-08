// Fails if a declaration inside an @media block is overridden by a LATER rule with the same selector
// and property outside any @media (or in the same @media) — the phone/touch value would never apply.
// This is how the phone travellers sheet broke once (its override sat above the base rule).
// Run: npm run check:css (client folder).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles');
const files = ['tokens.css', 'base.css', 'components.css', 'pages.css']; // load order (main.jsx)

const decls = [];
let order = 0;
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const lineAt = (pos) => text.slice(0, pos).split('\n').length;
  const stack = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    const close = text.indexOf('}', i);
    if (open === -1 && close === -1) break;
    if (close !== -1 && (open === -1 || close < open)) {
      stack.pop();
      i = close + 1;
      continue;
    }
    const head = text.slice(i, open).trim();
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      stack.push(head.replace(/\s+/g, ' '));
      i = open + 1;
      continue;
    }
    if (head.startsWith('@')) {
      let depth = 1;
      let p = open + 1;
      while (depth && p < text.length) {
        if (text[p] === '{') depth += 1;
        else if (text[p] === '}') depth -= 1;
        p += 1;
      }
      i = p;
      continue;
    }
    const end = text.indexOf('}', open);
    const props = text
      .slice(open + 1, end)
      .split(';')
      .filter((d) => d.includes(':'))
      .map((d) => d.split(':')[0].trim());
    const media = stack.join(' & ');
    for (const selector of head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
      for (const prop of props) decls.push({ order: (order += 1), file, line: lineAt(open), media, selector, prop });
    }
    i = end + 1;
  }
}

const problems = [];
const byKey = new Map();
for (const d of decls) {
  const key = `${d.selector}|${d.prop}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(d);
}
for (const list of byKey.values()) {
  for (const d of list) {
    if (!d.media) continue;
    const later = list.find((x) => x.order > d.order && x.media === '');
    if (later) problems.push(`${d.file}:${d.line} [${d.media}] ${d.selector} { ${d.prop} } is overridden by ${later.file}:${later.line}`);
  }
}
if (problems.length) {
  console.error([...new Set(problems)].join('\n'));
  process.exit(1);
}
console.log('CSS cascade check: no overridden media declarations.');
