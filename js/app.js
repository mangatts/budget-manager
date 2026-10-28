import { createRouter } from './router.js';
import { placeholderView } from './views/placeholder.js';
import { moreView } from './views/more.js';
import { designView } from './views/design.js';

const APP_NAME = 'Budget Manager';

// Keys must match the data-route values on the tab bar links in index.html (except hidden routes).
const routes = {
  home: { title: 'Home', view: () => placeholderView('Home', 'Your month at a glance. Coming in Sprint 3.') },
  add: { title: 'Add', view: () => placeholderView('Add', 'Add money in or money out. Coming in Sprint 1.') },
  history: { title: 'History', view: () => placeholderView('History', 'See and edit past entries. Coming in Sprint 1.') },
  tips: { title: 'Tips', view: () => placeholderView('Tips', 'Smart Coach tips on where to cut back. Coming in Sprint 4.') },
  more: { title: 'More', view: moreView },
  design: { title: 'Design reference', view: designView }, // not in the tab bar
};

const outlet = document.getElementById('app');

// The skip link must not change the URL hash, or the router would treat "#app" as a route.
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  outlet.focus();
});

createRouter({
  outlet,
  nav: document.querySelector('nav[aria-label="Main"]'),
  routes,
  appName: APP_NAME,
}).start();
