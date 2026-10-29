import { createRouter } from './router.js';
import { moreView } from './views/more.js';
import { homeView } from './views/home.js';
import { addView, editView } from './views/add.js';
import { historyView } from './views/history.js';
import { backupView } from './views/backup.js';
import { categoriesView, categoryView } from './views/categories.js';
import { wipeView } from './views/wipe.js';
import { profileView } from './views/profile.js';
import { billsView, billView } from './views/bills.js';
import { debtsView, debtView } from './views/debts.js';
import { goalsView, goalView } from './views/goals.js';
import { whatIfView } from './views/whatif.js';
import { importView } from './views/import.js';
import { reviewView } from './views/review.js';
import { tipsView } from './views/tips.js';
import { stepsView, checkupView } from './views/steps.js';
import { designView } from './views/design.js';
import { getStore } from './appStore.js';
import { initToasts, setStickyToast } from './ui/toast.js';
import { registerServiceWorker, requestPersistence } from './services/pwa.js';

const APP_NAME = 'Budget Manager';

// Keys must match the data-route values on the tab bar links in index.html (except hidden routes).
const routes = {
  home: { title: 'Home', view: homeView },
  add: { title: 'Add', view: addView },
  history: { title: 'History', view: historyView },
  edit: { title: 'Edit', view: editView, tab: 'history' }, // #/edit/<id>, not in the tab bar
  tips: { title: 'Tips', view: tipsView },
  more: { title: 'More', view: moreView },
  backup: { title: 'Backups', view: backupView, tab: 'more' }, // not in the tab bar
  categories: { title: 'Categories', view: categoriesView, tab: 'more' },
  category: { title: 'Category', view: categoryView, tab: 'more' }, // #/category/<id> or #/category/new
  wipe: { title: 'Delete everything', view: wipeView, tab: 'more' },
  profile: { title: 'Your money', view: profileView, tab: 'more' },
  bills: { title: 'Bills', view: billsView, tab: 'more' },
  bill: { title: 'Bill', view: billView, tab: 'more' }, // #/bill/<id> or #/bill/new
  debts: { title: 'Debts', view: debtsView, tab: 'more' },
  debt: { title: 'Debt', view: debtView, tab: 'more' }, // #/debt/<id> or #/debt/new
  goals: { title: 'Goals', view: goalsView, tab: 'more' },
  goal: { title: 'Goal', view: goalView, tab: 'more' }, // #/goal/<id> or #/goal/new
  whatif: { title: 'What if…', view: whatIfView, tab: 'more' },
  import: { title: 'Import a statement', view: importView, tab: 'more' },
  review: { title: 'Review your statement', view: reviewView, tab: 'more' },
  steps: { title: 'Your money steps', view: stepsView, tab: 'home' },
  checkup: { title: 'Money Checkup', view: checkupView, tab: 'home' },
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
  // Sticky: if a "Saved" message replaces it, it comes back afterwards.
  onUpdateReady: (apply) => setStickyToast({ message: 'New version ready', action: { label: 'Update', run: () => { apply(); return 'Updating\u2026'; } } }),
});
