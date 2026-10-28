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

export function createRouter({ outlet, nav, routes, appName }) {
  const names = Object.keys(routes);
  let firstRender = true;

  function render() {
    const name = parseRoute(location.hash, names);
    const route = routes[name];

    clear(outlet);
    outlet.append(route.view());
    document.title = name === DEFAULT_ROUTE ? appName : `${route.title} · ${appName}`;

    for (const link of nav.querySelectorAll('a[data-route]')) {
      if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
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
