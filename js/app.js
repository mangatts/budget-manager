import { createRouter } from './router.js';
import { homeView } from './views/home.js';
import { checkinView } from './views/checkin.js';
import { setupView, cardView, incomeView, expenseView } from './views/setup.js';
import { moreView } from './views/more.js';
import { backupView } from './views/backup.js';
import { wipeView } from './views/wipe.js';
import { peopleView, personView } from './views/people.js';
import { designView } from './views/design.js';
import { getStore } from './appStore.js';
import { initToasts, setStickyToast } from './ui/toast.js';
import { registerServiceWorker, requestPersistence } from './services/pwa.js';

const APP_NAME = 'Budget Manager';

// Keys must match the data-route values on the tab bar links in index.html (except hidden routes).
const routes = {
  home: { title: 'Home', view: homeView },
  checkin: { title: 'Check-in', view: checkinView }, // #/checkin or #/checkin/<date>
  setup: { title: 'Setup', view: setupView },
  card: { title: 'Card', view: cardView, tab: 'setup' }, // #/card/<id> or #/card/new
  income: { title: 'Income', view: incomeView, tab: 'setup' },
  expense: { title: 'Expense', view: expenseView, tab: 'setup' },
  more: { title: 'More', view: moreView },
  people: { title: 'People', view: peopleView, tab: 'more' },
  person: { title: 'Edit person', view: personView, tab: 'more' }, // #/person/<id>
  backup: { title: 'Backups', view: backupView, tab: 'more' },
  wipe: { title: 'Delete everything', view: wipeView, tab: 'more' },
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

// Open the on-device database early (creates it, and carries over data from the earlier version once).
// If this browser can't store data, screens that need it will say so.
getStore().then((store) => {
  // Once there's something worth keeping, ask the browser not to clean it up.
  const ask = () => { const s = store.getState(); if (s.cards.length || s.incomes.length || s.expenses.length) { requestPersistence(); return true; } return false; };
  if (!ask()) { const stop = store.subscribe(() => { if (ask()) stop(); }); }
}).catch(() => document.documentElement.setAttribute('data-storage', 'unavailable'));

// Offline support. A new version waits until the person chooses to update.
registerServiceWorker({
  // Sticky: if a "Saved" message replaces it, it comes back afterwards.
  onUpdateReady: (apply) => setStickyToast({ message: 'New version ready', action: { label: 'Update', run: () => { apply(); return 'Updating\u2026'; } } }),
});
