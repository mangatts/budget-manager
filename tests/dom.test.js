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

// ── el(): tested against a tiny fake DOM (no dependencies) ──
class FakeNode {}
class FakeText extends FakeNode { constructor(text) { super(); this.nodeType = 3; this.textContent = text; } }
class FakeElement extends FakeNode {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.attributes = {}; this.childNodes = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) { this.childNodes.push(...nodes); }
  replaceChildren() { this.childNodes = []; }
}

async function withFakeDom(fn) {
  const saved = { document: globalThis.document, Node: globalThis.Node, location: globalThis.location };
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (tag) => new FakeElement(tag), createTextNode: (text) => new FakeText(text) };
  globalThis.location = { href: BASE };
  try {
    const { el, clear } = await import('../js/utils/dom.js');
    await fn(el, clear);
  } finally {
    Object.assign(globalThis, saved);
  }
}

test('el(): text is always a text node, never markup', () => withFakeDom((el) => {
  const node = el('p', {}, '<img src=x onerror=alert(1)>', 42);
  assert.equal(node.childNodes.length, 2);
  assert.ok(node.childNodes.every((c) => c instanceof FakeText));
  assert.equal(node.childNodes[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(node.childNodes[1].textContent, '42');
}));

test('el(): nests elements, flattens arrays, and skips null/false', () => withFakeDom((el) => {
  const node = el('ul', {}, [el('li', {}, 'a'), null, false, [el('li', {}, 'b')]], undefined);
  assert.deepEqual(node.childNodes.map((c) => c.tagName), ['LI', 'LI']);
}));

test('el(): attributes, booleans, and skipped values', () => withFakeDom((el) => {
  const node = el('input', { type: 'radio', checked: true, disabled: false, id: null, 'aria-label': 'Large' });
  assert.deepEqual(node.attributes, { type: 'radio', checked: '', 'aria-label': 'Large' });
}));

test('el(): rejects inline event handlers in any case', () => withFakeDom((el) => {
  for (const name of ['onclick', 'onError', 'ONLOAD', 'onfocus']) assert.throws(() => el('div', { [name]: 'alert(1)' }), /not allowed/);
}));

test('el(): rejects HTML-injecting and request-making attributes', () => withFakeDom((el) => {
  for (const name of ['innerHTML', 'outerHTML', 'srcdoc', 'srcset', 'ping']) assert.throws(() => el('div', { [name]: 'x' }), /not allowed/);
}));

test('el(): rejects unsafe URLs, allows same-origin ones', () => withFakeDom((el) => {
  for (const href of ['javascript:alert(1)', 'java\nscript:alert(1)', 'https://evil.example', '//evil.example', 'data:text/html,x']) {
    assert.throws(() => el('a', { href }), /unsafe URL/, href);
  }
  assert.throws(() => el('img', { src: 'https://tracker.example/p.gif' }), /unsafe URL/);
  assert.equal(el('a', { href: '#/add' }).attributes.href, '#/add');
  assert.equal(el('img', { src: 'icons/icon-192.png' }).attributes.src, 'icons/icon-192.png');
}));

test('clear() removes all children', () => withFakeDom((el, clear) => {
  const node = el('div', {}, 'a', el('span', {}, 'b'));
  clear(node);
  assert.equal(node.childNodes.length, 0);
}));
