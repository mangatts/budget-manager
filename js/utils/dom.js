// Safe DOM helpers. All UI is built with these instead of HTML strings,
// so user data (notes, merchant names, CSV text) can never become markup.

const BLOCKED_PROPS = new Set(['innerhtml', 'outerhtml', 'srcdoc']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Only same-origin relative URLs and #fragments are allowed (blocks javascript:, data:, https://…).
export function isSafeUrl(value) {
  const url = String(value).trim();
  return !HAS_SCHEME.test(url) && !url.startsWith('//');
}

// el('p', { class: 'note' }, 'Hello ', el('strong', {}, name))
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    const name = key.toLowerCase();
    if (name.startsWith('on')) throw new Error(`el(): inline handler "${key}" not allowed; use addEventListener`);
    if (BLOCKED_PROPS.has(name)) throw new Error(`el(): "${key}" not allowed`);
    if (value === false || value === null || value === undefined) continue;
    if (URL_ATTRS.has(name) && !isSafeUrl(value)) throw new Error(`el(): unsafe URL in "${key}"`);
    node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
}
