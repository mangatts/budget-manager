import { createRouter } from './router.js';
import { placeholderView } from './views/placeholder.js';
import { moreView } from './views/more.js';
import { homeView } from './views/home.js';
import { addView, editView } from './views/add.js';
import { historyView } from './views/history.js';
import { designView } from './views/design.js';
import { getStore } from './appStore.js';
import { initToasts, showToast } from './ui/toast.js';
import { registerServiceWorker, requestPersistence } from './services/pwa.js';

const APP_NAME = 'Budget Manager';

// Keys must match the data-route values on the tab bar links in index.html (except hidden routes).
const routes = {
  home: { title: 'Home', view: homeView },
  add: { title: 'Add', view: addView },
  history: { title: 'History', view: historyView },
  edit: { title: 'Edit', view: editView, tab: 'history' }, // #/edit/<id>, not in the tab bar
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

initToasts();

// Open the on-device database early (creates it and adds default categories on first run).
// If this browser can't store data, screens that need it will say so.
getStore().then((store) => {
  // Once there's something worth keeping, ask the browser not to clean it up.
  const ask = () => { if (store.getState().transactions.length) { requestPersistence(); return true; } return false; };
  if (!ask()) { const stop = store.subscribe(() => { if (ask()) stop(); }); }
}).catch(() => document.documentElement.setAttribute('data-storage', 'unavailable'));

// Offline support. A new version waits until the person chooses to update.
registerServiceWorker({
  onUpdateReady: (apply) => showToast({ message: 'New version ready', action: { label: 'Update', run: () => { apply(); return 'Updating\u2026'; } }, duration: null }),
});
