import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingVoucherAccounts, adjacentVoucherCell } from '../voucher-navigation.js';

test('account suggestions filter by code prefix and Turkish account name', () => {
  const accounts = [
    { code: '100', name: 'KASA' },
    { code: '102', name: 'BANKALAR' },
    { code: '120', name: 'ALICILAR' },
  ];
  assert.deepEqual(matchingVoucherAccounts(accounts, '10').map(item => item.code), ['100', '102']);
  assert.deepEqual(matchingVoucherAccounts(accounts, '102 — BANKALAR').map(item => item.code), ['102']);
  assert.deepEqual(matchingVoucherAccounts(accounts, 'banka').map(item => item.code), ['102']);
  assert.deepEqual(matchingVoucherAccounts(accounts, '').map(item => item.code), []);
});

test('voucher cell navigation stays inside the five editable columns and existing rows', () => {
  assert.deepEqual(adjacentVoucherCell(1, 'debit', 'up', 3), { rowIndex: 0, field: 'debit' });
  assert.deepEqual(adjacentVoucherCell(1, 'debit', 'down', 3), { rowIndex: 2, field: 'debit' });
  assert.deepEqual(adjacentVoucherCell(1, 'debit', 'left', 3), { rowIndex: 1, field: 'code' });
  assert.deepEqual(adjacentVoucherCell(1, 'debit', 'right', 3), { rowIndex: 1, field: 'credit' });
  assert.equal(adjacentVoucherCell(0, 'code', 'left', 3), null);
  assert.equal(adjacentVoucherCell(2, 'description', 'down', 3), null);
});
