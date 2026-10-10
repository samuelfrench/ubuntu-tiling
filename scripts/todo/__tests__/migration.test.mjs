import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingLines, splitSections } from '../migrate-monolith.mjs';

test('section splitting retains the entire source including whitespace and open checkboxes', () => {
  const text = '# TODO\n\n## Now\n\n- [ ] First\n  continued\n\n## Next\n- [ ] Second\n';
  const sections = splitSections(text);
  assert.equal(sections.map((section) => section.text).join(''), text);
  assert.deepEqual(sections.map((section) => section.startLine), [1, 3, 8]);
  assert.equal(sections[1].lineCount, 5);
  assert.equal(sections[1].sha256.length, 64);
});

test('line accounting detects lost duplicate lines and every missing open checkbox', () => {
  const old = '- [ ] repeated\n- [ ] repeated\n- [ ] another\n';
  assert.deepEqual(missingLines(old, ['- [ ] repeated\n']), [
    { line: '- [ ] repeated', need: 2, have: 1 },
    { line: '- [ ] another', need: 1, have: 0 },
  ]);
  assert.deepEqual(missingLines(old, [old]), []);
});
