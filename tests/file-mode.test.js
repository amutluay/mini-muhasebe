import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('file mode starts with the supplied plan and persists locally without a server', async () => {
  const values = new Map();
  globalThis.location = { protocol: 'file:' };
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.DEFAULT_ACCOUNT_CSV = await readFile(new URL('../data/hesap-plani.csv', import.meta.url), 'utf8');
  const { loadState, saveState, displayBusinessTitle } = await import('../storage.js?file-mode-test');
  const initial = await loadState();
  assert.equal(initial.accounts.length, 280);
  assert.equal(initial.vouchers.length, 0);
  assert.equal(displayBusinessTitle(initial), 'muhasebe.info');
  assert.ok(values.size > 0);
  const updated = { ...initial, nextNumber: 7, businessTitle: 'Örnek İşletme' };
  await saveState(updated);
  assert.equal((await loadState()).nextNumber, 7);
  assert.equal(displayBusinessTitle(await loadState()), 'Örnek İşletme');
});
