import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl } from '../js/utils/dom.js';

const BASE = 'https://mangatts.github.io/budget-manager/';

test('allows same-origin relative URLs and fragments', () => {
  for (const url of ['#/add', '#app', 'css/styles.css', './js/app.js', '../budget-manager/', '/budget-manager/', '?x=1', '']) {
    assert.equal(isSafeUrl(url, BASE), true, `url: ${JSON.stringify(url)}`);
  }
});

test('allows same-origin blob URLs (used for backup downloads)', () => {
  assert.equal(isSafeUrl('blob:https://mangatts.github.io/0b1c2d3e', BASE), true);
});

test('blocks script and data URLs', () => {
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'blob:https://evil.example/x']) {
    assert.equal(isSafeUrl(url, BASE), false, `url: ${JSON.stringify(url)}`);
  }
});

test('blocks other sites, including protocol-relative and backslash tricks', () => {
  for (const url of ['https://evil.example', 'http://mangatts.github.io/', '//evil.example', '/\\evil.example', '\\\\evil.example', 'https://mangatts.github.io.evil.example/']) {
    assert.equal(isSafeUrl(url, BASE), false, `url: ${JSON.stringify(url)}`);
  }
});

test('blocks control-character tricks the browser would strip', () => {
  for (const url of ['java\nscript:alert(1)', 'java\tscript:alert(1)', 'java\rscript:alert(1)', '\x01javascript:alert(1)', '\x00javascript:alert(1)']) {
    assert.equal(isSafeUrl(url, BASE), false, `url: ${JSON.stringify(url)}`);
  }
});

test('fails closed without a valid base', () => {
  assert.equal(isSafeUrl('#/add', undefined), false);
  assert.equal(isSafeUrl('#/add', 'not a url'), false);
});
