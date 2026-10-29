// More → Backups: save an encrypted backup file, or restore from one.
import { el, clear } from '../utils/dom.js';
import { formatDay, todayLocal } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { checkPassphrase, createBackupFile, openBackupFile, backupFileName, MAX_FILE_BYTES } from '../services/backup.js';

const localDay = (time) => todayLocal(new Date(time));

export function lastBackupText(lastBackupAt, now = Date.now()) {
  if (!lastBackupAt) return 'Never';
  const days = Math.floor((now - lastBackupAt) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function field({ id, label, hint, type = 'password', autocomplete = 'new-password' }) {
  const input = el('input', { class: 'input', id, type, autocomplete, 'aria-describedby': `${id}-hint ${id}-error`, spellcheck: 'false', autocapitalize: 'off' });
  return {
    input,
    node: el('div', { class: 'field' },
      el('label', { class: 'field-label', for: id }, label),
      input,
      hint ? el('span', { class: 'field-hint', id: `${id}-hint` }, hint) : null,
      el('span', { class: 'field-error', id: `${id}-error`, hidden: true }),
    ),
  };
}

function setError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  error.textContent = message ?? '';
  error.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function showPassphraseToggle(id, inputs) {
  const box = el('input', { type: 'checkbox', id });
  box.addEventListener('change', () => { for (const i of inputs) i.type = box.checked ? 'text' : 'password'; });
  return el('label', { class: 'checkbox', for: id }, box, ' Show passphrase');
}

// Share sheet on phones (save to Files, AirDrop, email…); a normal download elsewhere.
async function deliver(text, name) {
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Budget Manager backup' });
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false; // they closed the share sheet
      // Otherwise (e.g. the share needs a fresh tap), fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = el('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

function saveSection(store) {
  const pass = field({ id: 'backup-pass', label: 'Passphrase', hint: 'At least 12 characters. A few unrelated words work well.' });
  const confirm = field({ id: 'backup-confirm', label: 'Type it again' });
  const button = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save backup');
  const last = el('p', { class: 'field-hint', id: 'last-backup' });
  const showLast = () => { last.textContent = `Last backup: ${lastBackupText(store.getState().meta.lastBackupAt)}`; };
  showLast();

  const form = el('form', { class: 'section', novalidate: true, id: 'backup-form' },
    el('p', { class: 'lead' }, 'Saves everything into one file, locked with a passphrase you choose. Keep it somewhere safe, like Files, iCloud Drive, or an email to yourself.'),
    last,
    pass.node,
    confirm.node,
    showPassphraseToggle('backup-show', [pass.input, confirm.input]),
    el('div', { class: 'card warning-card', role: 'note' },
      el('span', { class: 'pill pill-warning' }, '⚠ Important'),
      el('p', {}, 'If you forget this passphrase, nobody can open the backup, not even us. Write it down somewhere safe.'),
    ),
    button,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errors = checkPassphrase(pass.input.value, confirm.input.value);
    setError(pass.input, errors.passphrase);
    setError(confirm.input, errors.confirm);
    if (errors.passphrase) return pass.input.focus();
    if (errors.confirm) return confirm.input.focus();

    button.disabled = true;
    button.textContent = 'Locking your backup…';
    try {
      const now = Date.now();
      const text = await createBackupFile(store.snapshot(), pass.input.value, now);
      if (await deliver(text, backupFileName(localDay(now)))) {
        await store.setMeta('lastBackupAt', now);
        showLast();
        pass.input.value = '';
        confirm.input.value = '';
        showToast({ message: 'Backup saved' });
      }
    } catch {
      showToast({ message: 'Couldn’t make the backup. Please try again.' });
    } finally {
      button.disabled = false;
      button.textContent = 'Save backup';
    }
  });
  return form;
}

function restoreSection(store) {
  const fileInput = el('input', { class: 'input', id: 'restore-file', type: 'file', accept: '.bmbackup,application/json', 'aria-describedby': 'restore-file-error' });
  const pass = field({ id: 'restore-pass', label: 'Passphrase for this backup', autocomplete: 'current-password' });
  const button = el('button', { class: 'btn btn-secondary btn-block', type: 'submit' }, 'Open backup');
  const preview = el('div', { class: 'section', id: 'restore-preview', 'aria-live': 'polite' });

  const form = el('form', { class: 'section', novalidate: true, id: 'restore-form' },
    el('p', { class: 'lead' }, 'Bring back everything from a backup file, on this phone or a new one. You’ll see what’s inside before anything changes.'),
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'restore-file' }, 'Backup file'),
      fileInput,
      el('span', { class: 'field-error', id: 'restore-file-error', hidden: true }),
    ),
    pass.node,
    showPassphraseToggle('restore-show', [pass.input]),
    button,
    preview,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clear(preview);
    const file = fileInput.files?.[0];
    setError(fileInput, file ? null : 'Choose your backup file');
    setError(pass.input, pass.input.value ? null : 'Enter the passphrase you used for this backup');
    if (!file) return fileInput.focus();
    if (!pass.input.value) return pass.input.focus();
    if (file.size > MAX_FILE_BYTES) return setError(fileInput, 'This file is too large to be a backup.');

    button.disabled = true;
    button.textContent = 'Opening…';
    let result;
    try {
      result = await openBackupFile(await file.text(), pass.input.value);
    } finally {
      button.disabled = false;
      button.textContent = 'Open backup';
    }
    if (!result.ok) {
      const aboutPassphrase = /passphrase/.test(result.error);
      setError(aboutPassphrase ? pass.input : fileInput, result.error);
      return (aboutPassphrase ? pass.input : fileInput).focus();
    }
    showPreview(result);
  });

  function showPreview({ data, summary }) {
    const current = store.getState().transactions.length;
    const range = summary.entries
      ? `${summary.entries} ${summary.entries === 1 ? 'entry' : 'entries'} from ${formatDay(summary.firstDate)} to ${formatDay(summary.lastDate)}`
      : 'No entries (just your categories and settings)';
    const restoreButton = el('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'restore-confirm' }, 'Restore this backup');
    const cancel = el('button', { class: 'btn btn-quiet btn-block', type: 'button' }, 'Cancel');
    preview.append(el('div', { class: 'card', id: 'restore-summary' },
      el('h3', {}, 'Ready to restore'),
      el('p', {}, range, '.'),
      summary.exportedAt ? el('p', { class: 'field-hint' }, `Backup made ${formatDay(localDay(summary.exportedAt))}.`) : null,
      el('p', {}, current
        ? `This replaces the ${current} ${current === 1 ? 'entry' : 'entries'} on this device. You can undo it right after.`
        : 'Nothing on this device will be lost.'),
      restoreButton,
      cancel,
    ));
    restoreButton.focus();
    cancel.addEventListener('click', () => clear(preview));
    restoreButton.addEventListener('click', async () => {
      restoreButton.disabled = true;
      const outcome = await store.replaceAll(data);
      clear(preview);
      if (!outcome.ok) return showToast({ message: outcome.errors.form });
      form.reset();
      showToast({
        message: `Restored ${summary.entries} ${summary.entries === 1 ? 'entry' : 'entries'}`,
        action: { label: 'Undo', run: async () => { await outcome.undo(); return 'Restore undone'; } },
      });
    });
  }
  return form;
}

export function backupView() {
  const body = el('div', { class: 'screen' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    clear(body);
    body.append(
      el('section', { class: 'section', 'aria-labelledby': 'save-title' }, el('h2', { class: 'section-title', id: 'save-title' }, 'Save a backup'), saveSection(store)),
      el('section', { class: 'section', 'aria-labelledby': 'restore-title' }, el('h2', { class: 'section-title', id: 'restore-title' }, 'Restore from a backup'), restoreSection(store)),
    );
  }, () => {
    clear(body);
    body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device. Try turning off private browsing, or use Chrome or Safari.'));
  });
  return el('div', { class: 'screen' },
    el('a', { class: 'btn btn-quiet back-link', href: '#/more' }, '‹ More'),
    el('h1', { tabindex: '-1' }, 'Backups'),
    body,
  );
}
