// Safe DOM helpers. All UI is built with these instead of HTML strings,
// so user data (notes, merchant names, CSV text) can never become markup.

// srcset/ping take URL lists or send requests; nothing in this app needs them.
const BLOCKED_PROPS = new Set(['innerhtml', 'outerhtml', 'srcdoc', 'srcset', 'ping']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data', 'cite', 'background']);

// Only same-origin URLs are allowed (blocks javascript:, data:, https://other.site, …).
// Resolving with the URL parser, rather than a regex, applies the browser's own cleanup
// (stripped tabs/newlines/control chars, "\" read as "/"), so tricks like "java\nscript:" or "/\evil.com" fail.
export function isSafeUrl(value, base = globalThis.location?.href) {
  try {
    const baseUrl = new URL(base);
    return new URL(String(value), baseUrl).origin === baseUrl.origin;
  } catch {
    return false;
  }
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

  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
}
