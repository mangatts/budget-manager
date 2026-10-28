// Reads css/tokens.css into { light, darkMedia, darkAttr } maps of --name → value.
import { readFileSync } from 'node:fs';

export const TOKENS_PATH = new URL('../../css/tokens.css', import.meta.url);

function declarations(block) {
  const map = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[name] = value.trim();
  return map;
}

// Body of the first {...} after `start`, with nested braces handled.
function blockAfter(css, start) {
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unbalanced braces in tokens.css');
}

export function loadTokens() {
  const css = readFileSync(TOKENS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const find = (selector) => {
    const at = css.indexOf(selector);
    if (at === -1) throw new Error(`tokens.css is missing ${selector}`);
    return at;
  };
  const media = blockAfter(css, find('@media (prefers-color-scheme: dark)'));
  return {
    light: declarations(blockAfter(css, find(':root {'))),
    darkMedia: declarations(blockAfter(media, media.indexOf(':root:not([data-theme="light"])'))),
    darkAttr: declarations(blockAfter(css, find(':root[data-theme="dark"]'))),
  };
}

export { contrast } from '../../js/utils/contrast.js';
