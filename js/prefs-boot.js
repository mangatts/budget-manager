// Runs in <head> before the page paints, so the saved text size and theme apply
// without a flash. A plain script (not a module) so it runs immediately.
// Must match PREFS_KEY and PREF_OPTIONS in js/services/preferences.js (tests check this).
(function () {
  var KEY = 'bm:prefs';
  var TEXT_SIZES = ['large', 'xl'];
  var THEMES = ['light', 'dark'];
  try {
    var prefs = JSON.parse(localStorage.getItem(KEY)) || {};
    var root = document.documentElement;
    if (TEXT_SIZES.indexOf(prefs.textSize) !== -1) root.setAttribute('data-text-size', prefs.textSize);
    if (THEMES.indexOf(prefs.theme) !== -1) root.setAttribute('data-theme', prefs.theme);
  } catch (e) {
    // Storage blocked or corrupt: keep the defaults.
  }
})();
