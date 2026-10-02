// One markdown file for the whole repository: README.md.
//
// Notes used to pile up as a dozen .md files scattered across the tree, each
// one a separate place to look and a separate place to go stale. Everything
// now lives in README.md, and this script keeps it that way.
//
//   node ops/one-markdown.mjs            fold every other .md into README.md,
//                                        then delete the original
//   node ops/one-markdown.mjs a.md b.md  fold just these, in this order
//   node ops/one-markdown.mjs --check    fail if any other .md exists (CI)
//   node ops/one-markdown.mjs --toc      only rebuild the contents list
//
// A folded file becomes one "## " section at the end of README.md, titled by
// its own first heading, with its other headings pushed down one level so the
// outline still nests. Code fences are left alone, so a "# comment" inside a
// bash block is not mistaken for a heading. The contents list at the top of
// README.md is rebuilt from the "## " headings on every run.
//
// Files are found through git (tracked, plus untracked that are not ignored),
// so node_modules, dist and anything in .gitignore never count.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const README = resolve(root, 'README.md');
const TOC_START = '<!-- contents:start -->';
const TOC_END = '<!-- contents:end -->';

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

function strayMarkdown() {
  const out = git('ls-files', '--cached', '--others', '--exclude-standard', '-z');
  return [...new Set(out.split('\0'))]
    .filter((p) => p && /\.(md|markdown)$/i.test(p) && p !== 'README.md')
    .filter((p) => existsSync(resolve(root, p))) // deleted but not yet committed
    .sort();
}

// Walk lines, calling fn only on lines outside fenced code blocks.
function mapOutsideFences(lines, fn) {
  let fence = null;
  return lines.map((line) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return line;
    }
    return fence ? line : fn(line);
  });
}

function fold(path) {
  const text = readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n').trim();
  let lines = text.split('\n');

  // The file's own first-level heading becomes the section title.
  // Without one, a readable title from the file name, never a bare path:
  // "notes/payroll_go-live.md" becomes "Payroll go live".
  const name = basename(path).replace(/\.(md|markdown)$/i, '').replace(/[-_.]+/g, ' ').trim();
  let title = name ? name[0].toUpperCase() + name.slice(1).toLowerCase() : 'Notes';
  const h1 = lines.findIndex((l) => /^# /.test(l));
  if (h1 !== -1 && lines.slice(0, h1).every((l) => !l.trim())) {
    title = lines[h1].slice(2).trim();
    lines = lines.slice(h1 + 1);
  }
  lines = mapOutsideFences(lines, (l) => (/^#{1,5} /.test(l) ? `#${l}` : l));

  const body = lines.join('\n').trim();
  const today = new Date().toISOString().slice(0, 10);
  return `## ${title}\n\n<sub>Folded in from \`${path}\` on ${today}.</sub>\n\n${body}\n`;
}

// GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens,
// repeats numbered.
function anchors(headings) {
  const seen = new Map();
  return headings.map((h) => {
    const base = h
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}\- _]/gu, '')
      .replace(/ /g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  });
}

function rebuildToc(readme) {
  const start = readme.indexOf(TOC_START);
  const end = readme.indexOf(TOC_END);
  if (start === -1 || end === -1) return readme;

  const headings = [];
  mapOutsideFences(readme.split('\n'), (l) => {
    const m = l.match(/^## (.+)$/);
    if (m && m[1].trim() !== 'Contents') headings.push(m[1].trim());
    return l;
  });
  const ids = anchors(headings);
  const list = headings
    .map((h, i) => `- [${h.replace(/`/g, '')}](#${ids[i]})`)
    .join('\n');
  return `${readme.slice(0, start + TOC_START.length)}\n${list}\n${readme.slice(end)}`;
}

const args = process.argv.slice(2);

if (args.includes('--check')) {
  const strays = strayMarkdown();
  if (strays.length) {
    console.error('Only README.md may hold documentation. Found:');
    for (const p of strays) console.error(`  ${p}`);
    console.error('\nFold them in with:  npm run docs');
    process.exit(1);
  }
  console.log('One markdown file: README.md. ALL PASSED');
  process.exit(0);
}

let readme = readFileSync(README, 'utf8').replace(/\r\n/g, '\n').trimEnd() + '\n';

if (!args.includes('--toc')) {
  const targets = args.length
    ? args.map((a) => relative(root, resolve(process.cwd(), a)))
    : strayMarkdown();
  for (const path of targets) {
    if (path === 'README.md') continue;
    readme += `\n---\n\n${fold(path)}`;
    unlinkSync(resolve(root, path));
    console.log(`folded ${path}`);
  }
}

writeFileSync(README, rebuildToc(readme));
console.log('README.md contents list rebuilt.');
