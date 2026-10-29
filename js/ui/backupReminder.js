// "Last backup: 16 days ago · Back up now". Shown once there's something to lose, if the last
// backup is over 14 days old (or never). "Not now" hides it for a week, so it never nags.
import { el } from '../utils/dom.js';
import { lastBackupText } from '../views/backup.js';

const DAY = 86_400_000;
const SNOOZE_KEY = 'bm:backup-reminder-snoozed';

export function needsBackupReminder({ transactions, meta }, now = Date.now(), snoozedAt = readSnooze()) {
  if (!transactions.length) return false;
  if (meta.lastBackupAt && now - meta.lastBackupAt < 14 * DAY) return false;
  return !(snoozedAt && now - snoozedAt < 7 * DAY);
}

function readSnooze() {
  try { return Number(localStorage.getItem(SNOOZE_KEY)) || null; } catch { return null; }
}

export function backupReminder(state) {
  if (!needsBackupReminder(state)) return null;
  const notNow = el('button', { class: 'btn btn-quiet', type: 'button' }, 'Not now');
  const card = el('aside', { class: 'card', id: 'backup-reminder', 'aria-label': 'Backup reminder' },
    el('span', { class: 'pill pill-warning' }, `⚠ Last backup: ${lastBackupText(state.meta.lastBackupAt)}`),
    el('p', {}, 'A backup keeps your entries safe if this phone is lost, replaced, or its browser data is cleared.'),
    el('div', { class: 'button-row' }, el('a', { class: 'btn btn-primary', href: '#/backup' }, 'Back up now'), notNow),
  );
  notNow.addEventListener('click', () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* still hide for now */ }
    card.remove();
  });
  return card;
}
