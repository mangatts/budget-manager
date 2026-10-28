// Display preferences (text size, theme). Small UI settings only, so localStorage is fine
// (ARCHITECTURE.md §2). Every value is checked against an allow-list before it's used.
// js/prefs-boot.js applies the same values before first paint; keep the two in sync.

export const PREFS_KEY = 'bm:prefs';

export const PREF_OPTIONS = Object.freeze({
  textSize: Object.freeze(['normal', 'large', 'xl']),
  theme: Object.freeze(['system', 'light', 'dark']),
});

export const DEFAULT_PREFS = Object.freeze({ textSize: 'normal', theme: 'system' });

const isAllowed = (name, value) => Object.hasOwn(PREF_OPTIONS, name) && PREF_OPTIONS[name].includes(value);

// Anything unknown, malformed, or missing falls back to the default.
export function sanitizePrefs(raw) {
  const prefs = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== 'object') return prefs;
  for (const name of Object.keys(PREF_OPTIONS)) {
    if (Object.hasOwn(raw, name) && isAllowed(name, raw[name])) prefs[name] = raw[name];
  }
  return prefs;
}

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    return sanitizePrefs(JSON.parse(storage.getItem(PREFS_KEY)));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// Returns the new prefs, built from `current` (what's applied now), not from storage, so that
// when storage is blocked (private mode) earlier choices from this visit aren't lost.
export function savePref(name, value, current, storage = globalThis.localStorage) {
  if (!isAllowed(name, value)) throw new Error(`Unknown preference: ${name}=${value}`);
  const prefs = { ...sanitizePrefs(current), [name]: value };
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not saved; still applied below by the caller.
  }
  return prefs;
}

// What's applied to the page right now: the source of truth for this visit.
// (prefs-boot.js applies the saved values at load; savePref + applyPrefs update them.)
export function readAppliedPrefs(root = document.documentElement) {
  return sanitizePrefs({
    textSize: root.getAttribute('data-text-size') ?? DEFAULT_PREFS.textSize,
    theme: root.getAttribute('data-theme') ?? DEFAULT_PREFS.theme,
  });
}

export function applyPrefs(prefs, root = document.documentElement) {
  if (prefs.textSize === DEFAULT_PREFS.textSize) root.removeAttribute('data-text-size');
  else root.setAttribute('data-text-size', prefs.textSize);

  if (prefs.theme === DEFAULT_PREFS.theme) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
}
