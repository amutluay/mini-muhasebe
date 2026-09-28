import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateJournalEntries, paginateJournalSingleColumn } from '../journal-print.js';

test('two-column journal print fills left then right and continues on the next page', () => {
  const entries = Array.from({ length: 10 }, (_, index) => ({ number: index + 1, height: 25 }));
  const pages = paginateJournalEntries(entries, entry => entry.height, 100, 0);
  assert.deepEqual(pages.map(page => page.columns.map(column => column.map(entry => entry.number))), [
    [[1, 2, 3, 4], [5, 6, 7, 8]],
    [[9, 10], []],
  ]);
});

test('journal print keeps each entry whole and includes spacing in capacity', () => {
  const entries = [40, 40, 40].map((height, index) => ({ number: index + 1, height }));
  const pages = paginateJournalEntries(entries, entry => entry.height, 85, 6);
  assert.deepEqual(pages[0].columns.map(column => column.map(entry => entry.number)), [[1], [2]]);
  assert.deepEqual(pages[1].columns.map(column => column.map(entry => entry.number)), [[3], []]);
});

test('oversized journal entry gets a full-width page or a clear error', () => {
  const entries = [{ number: 1, height: 30 }, { number: 2, height: 120, wideHeight: 80 }, { number: 3, height: 30 }];
  const measure = (entry, wide) => wide ? entry.wideHeight : entry.height;
  const pages = paginateJournalEntries(entries, measure, 100, 0);
  assert.deepEqual(pages.map(page => page.single?.number || page.columns[0].map(entry => entry.number)), [[1], 2, [3]]);
  assert.throws(() => paginateJournalEntries([{ number: 4, height: 120, wideHeight: 110 }], measure, 100, 0),
    /4 numaralı fiş bölünmeden bir A4 sayfasına sığmıyor/);
});

test('two-column journal print carries both columns and full-width entries into page totals', () => {
  const entries = [
    { number: 1, height: 60, lines: [{ debit: 1000, credit: 0 }, { debit: 0, credit: 1000 }] },
    { number: 2, height: 60, lines: [{ debit: 2000, credit: 0 }, { debit: 0, credit: 2000 }] },
    { number: 3, height: 120, wideHeight: 80, lines: [{ debit: 3000, credit: 0 }, { debit: 0, credit: 3000 }] },
    { number: 4, height: 60, lines: [{ debit: 4000, credit: 0 }, { debit: 0, credit: 4000 }] },
  ];
  const pages = paginateJournalEntries(entries, (entry, wide) => wide ? entry.wideHeight : entry.height, 100, 0);
  assert.deepEqual(pages.map(page => [page.debitTotal, page.creditTotal]), [
    [3000, 3000], [6000, 6000], [10000, 10000],
  ]);
});

test('single-column journal print carries debit and credit totals forward by page', () => {
  const entries = [
    { number: 1, height: 40, lines: [{ debit: 10000, credit: 0 }, { debit: 0, credit: 10000 }] },
    { number: 2, height: 40, lines: [{ debit: 25000, credit: 0 }, { debit: 0, credit: 25000 }] },
    { number: 3, height: 40, lines: [{ debit: 40000, credit: 0 }, { debit: 0, credit: 40000 }] },
  ];
  const pages = paginateJournalSingleColumn(entries, entry => entry.height, 86, 6);
  assert.deepEqual(pages.map(page => ({ numbers: page.entries.map(entry => entry.number),
    debitTotal: page.debitTotal, creditTotal: page.creditTotal })), [
    { numbers: [1, 2], debitTotal: 35000, creditTotal: 35000 },
    { numbers: [3], debitTotal: 75000, creditTotal: 75000 },
  ]);
});

test('single-column journal print refuses a voucher that cannot fit above the page total', () => {
  assert.throws(() => paginateJournalSingleColumn([{ number: 7, height: 101, lines: [] }],
    entry => entry.height, 100, 0), /7 numaralı fiş toplam satırıyla birlikte/);
});
