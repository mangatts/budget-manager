// Hash router: #/home, #/add, … Hash URLs work offline and under the
// GitHub Pages sub-path (/budget-manager/) with no server config.

import { clear } from './utils/dom.js';

export const DEFAULT_ROUTE = 'home';

// Pure: "#/add?x=1" → "add". Anything unknown or malformed → DEFAULT_ROUTE.
export function parseRoute(hash, routeNames) {
  const name = String(hash ?? '')
    .replace(/^#\/?/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  return routeNames.includes(name) ? name : DEFAULT_ROUTE;
}

// Pure: "#/edit/abc-123" → "abc-123". Only short ids made of letters, digits, and "-" get through;
// anything else (markup, paths, very long strings) → null. Views still check the id exists.
export function routeParam(hash) {
  const param = String(hash ?? '').replace(/^#\/?/, '').split(/[?#]/)[0].split('/')[1] ?? '';
  return /^[A-Za-z0-9-]{1,64}$/.test(param) ? param : null;
}

// routes: { name: { title, view(param), tab? } }. `tab` highlights a different tab (e.g. edit → history).
export function createRouter({ outlet, nav, routes, appName }) {
  const names = Object.keys(routes);
  let firstRender = true;

  function render() {
    const name = parseRoute(location.hash, names);
    const route = routes[name];

    clear(outlet);
    outlet.append(route.view(routeParam(location.hash)));
    document.title = name === DEFAULT_ROUTE ? appName : `${route.title} · ${appName}`;

    const tab = route.tab ?? name;
    for (const link of nav.querySelectorAll('a[data-route]')) {
      if (link.dataset.route === tab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    // After navigating, move focus to the new heading so screen readers announce it.
    // Not on first load, so the page doesn't jump.
    if (!firstRender) outlet.querySelector('h1')?.focus();
    firstRender = false;
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
  };
}
