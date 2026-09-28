import test from 'node:test';
import assert from 'node:assert/strict';
import { planBulkPrint } from '../bulk-print.js';

test('bulk print follows the specified report order regardless of selection order', () => {
  assert.deepEqual(planBulkPrint(['balance', 'trial', 'journal', 'ledger'], false),
    [['journal'], ['ledger'], ['trial'], ['balance']]);
});

test('income and balance share a section only when both are selected and fit', () => {
  assert.deepEqual(planBulkPrint(['balance', 'income', 'trial'], true),
    [['trial'], ['income', 'balance']]);
  assert.deepEqual(planBulkPrint(['balance', 'income'], false), [['income'], ['balance']]);
  assert.deepEqual(planBulkPrint(['income'], true), [['income']]);
});
