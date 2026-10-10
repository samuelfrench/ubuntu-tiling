#!/usr/bin/env node
// Audit helpers adapted from coffee-explorer's task-file migration. Day-to-day work uses build/query.
//   node scripts/todo/migrate-monolith.mjs split <oldTODO.md> <outDir>
//   node scripts/todo/migrate-monolith.mjs verify <oldTODO.md> <repoRoot> <archiveBase.md>
// verify compares line multisets so repeated lines and every open checkbox must survive.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function splitSections(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const sections = [];
  let current = { heading: null, startLine: 1, lines: [] };
  lines.forEach((line, i) => {
    if (line.startsWith('## ')) {
      if (current.lines.length) sections.push(current);
      current = { heading: line, startLine: i + 1, lines: [] };
    }
    current.lines.push(line);
  });
  if (current.lines.length) sections.push(current);
  return sections.map((s, idx) => ({
    id: `S${String(idx).padStart(3, '0')}`,
    heading: s.heading,
    startLine: s.startLine,
    lineCount: s.lines.length,
    sha256: createHash('sha256').update(s.lines.join('\n') + '\n').digest('hex'),
    text: s.lines.join('\n') + '\n',
  }));
}

export function lineMultiset(text) {
  const counts = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

export function missingLines(oldText, newTexts) {
  const have = new Map();
  for (const text of newTexts) for (const [line, count] of lineMultiset(text)) have.set(line, (have.get(line) ?? 0) + count);
  return [...lineMultiset(oldText)].filter(([line, count]) => (have.get(line) ?? 0) < count).map(([line, need]) => ({ line, need, have: have.get(line) ?? 0 }));
}

function walkMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkMarkdown(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

function archiveGain(archiveText, baseText) {
  const base = lineMultiset(baseText);
  const gained = [];
  for (const raw of archiveText.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const count = base.get(line) ?? 0;
    if (count) base.set(line, count - 1);
    else gained.push(line);
  }
  return gained.join('\n');
}

export function run([command, ...args]) {
  if (command === 'split' && args.length === 2) {
    const [oldPath, outDir] = args;
    const sections = splitSections(readFileSync(oldPath, 'utf8'));
    mkdirSync(outDir, { recursive: true });
    for (const section of sections) writeFileSync(path.join(outDir, `${section.id}.md`), section.text);
    writeFileSync(path.join(outDir, 'sections.json'), JSON.stringify(sections.map(({ text, ...rest }) => rest), null, 2) + '\n');
    console.log(`split ${sections.length} sections into ${outDir}`);
    return 0;
  }
  if (command === 'verify' && args.length === 3) {
    const [oldPath, root, archiveBasePath] = args;
    const oldText = readFileSync(oldPath, 'utf8');
    const files = walkMarkdown(path.join(root, 'docs/todo'));
    const texts = files.map((file) => readFileSync(file, 'utf8'));
    texts.push(archiveGain(readFileSync(path.join(root, 'TODO-archive.md'), 'utf8'), readFileSync(archiveBasePath, 'utf8')));
    const missing = missingLines(oldText, texts);
    const oldLines = [...lineMultiset(oldText).values()].reduce((a, b) => a + b, 0);
    const oldCheckboxes = oldText.split('\n').filter((line) => /^\s*[-*]\s+\[ \]/.test(line)).length;
    console.log(`old non-empty lines: ${oldLines}; open checkboxes: ${oldCheckboxes}; docs/todo files: ${files.length}; missing: ${missing.length}`);
    for (const item of missing) console.error(`MISSING x${item.need - item.have}: ${item.line}`);
    return missing.length ? 1 : 0;
  }
  console.error('usage: migrate-monolith.mjs split <oldTODO.md> <outDir> | verify <oldTODO.md> <repoRoot> <archiveBase.md>');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run(process.argv.slice(2)));
