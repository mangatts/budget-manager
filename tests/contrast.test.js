// WCAG 2.2 AA: 4.5:1 for text, 3:1 for UI parts (input borders, focus ring).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, contrast } from './helpers/tokens.js';

const TEXT = 4.5;
const UI = 3;

// [foreground, background, minimum, what it's used for]
const PAIRS = [
  ['--text', '--bg', TEXT, 'body text'],
  ['--text', '--surface', TEXT, 'text on cards'],
  ['--text', '--surface-sunken', TEXT, 'text on the tab bar'],
  ['--text-muted', '--bg', TEXT, 'hints and secondary text'],
  ['--text-muted', '--surface', TEXT, 'secondary text on cards'],
  ['--text-muted', '--surface-sunken', TEXT, 'inactive tab labels'],
  ['--accent', '--bg', TEXT, 'links and quiet buttons'],
  ['--accent', '--surface', TEXT, 'links on cards'],
  ['--accent', '--surface-sunken', TEXT, 'active tab label'],
  ['--accent', '--accent-soft', TEXT, 'selected choice chip'],
  ['--on-accent', '--accent', TEXT, 'primary button'],
  ['--on-accent', '--accent-hover', TEXT, 'primary button (hover)'],
  ['--money-in', '--bg', TEXT, 'money in amounts'],
  ['--money-in', '--surface', TEXT, 'money in on cards'],
  ['--good', '--good-soft', TEXT, 'good status pill'],
  ['--warning', '--warning-soft', TEXT, 'warning status pill'],
  ['--warning', '--bg', TEXT, 'warning text'],
  ['--critical', '--critical-soft', TEXT, 'critical status pill'],
  ['--critical', '--bg', TEXT, 'error messages'],
  ['--critical', '--surface', TEXT, 'error messages on cards'],
  ['--border-strong', '--bg', UI, 'input outline'],
  ['--border-strong', '--surface', UI, 'input outline on cards'],
  ['--focus', '--bg', UI, 'focus ring'],
  ['--focus', '--surface', UI, 'focus ring on cards'],
  ['--focus', '--surface-sunken', UI, 'focus ring on the tab bar'],
];

const themes = loadTokens();

for (const [theme, tokens] of [['light', themes.light], ['dark', themes.darkMedia]]) {
  test(`${theme} theme meets WCAG AA contrast`, () => {
    const failures = [];
    for (const [fg, bg, min, use] of PAIRS) {
      const ratio = contrast(tokens[fg], tokens[bg]);
      if (ratio < min) failures.push(`${fg} on ${bg} (${use}): ${ratio.toFixed(2)} < ${min}`);
    }
    assert.deepEqual(failures, []);
  });
}

test('contrast math matches known values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
});
