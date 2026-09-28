import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMoney, formatMoney, formatMoneyEntry, formatVoucherOption, validateVoucher, trialBalance, accountStatement, journalEntries, generalLedger, incomeStatement, balanceSheet, groupedBalanceSheet } from '../accounting.js';
import { parseAccountPlan, validateAccountReplacement } from '../csv.js';
import { validateBackup, withoutVouchers, renumberVouchersByDate } from '../storage.js';

const accounts = [
  { code: '100', name: 'KASA', side: 'B' },
  { code: '120', name: 'ALICILAR', side: 'B' },
  { code: '500', name: 'SERMAYE', side: 'A' },
  { code: '600', name: 'YURT İÇİ SATIŞLAR', side: 'A' },
  { code: '630', name: 'ARAŞTIRMA GİDERLERİ', side: 'B' },
  { code: '770', name: 'GENEL YÖNETİM GİDERLERİ', side: 'B' },
];
const voucher = (id, number, lines) => ({ id, number, date: '2026-03-01', description: '', lines });
const line = (code, debit = 0, credit = 0) => ({ code, debit, credit, quantity: '', description: '' });

test('Turkish amount input uses exact cents', () => {
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('0,03'), 3);
  assert.equal(parseMoney('1.234'), 123400);
  assert.equal(parseMoney('1.234,'), 123400);
  assert.equal(parseMoney('12,345'), null);
  assert.equal(formatMoney(123456), '1.234,56');
});

test('amount fields group digits while typing and allow cents', () => {
  assert.deepEqual(formatMoneyEntry('1234'), { value: '1.234', caret: 5 });
  assert.deepEqual(formatMoneyEntry('1234,5'), { value: '1.234,5', caret: 7 });
  assert.deepEqual(formatMoneyEntry('1234,56'), { value: '1.234,56', caret: 8 });
  assert.deepEqual(formatMoneyEntry('1234', 2), { value: '1.234', caret: 3 });
  assert.deepEqual(formatMoneyEntry('1.23'), { value: '123', caret: 3 });
  assert.deepEqual(formatMoneyEntry('0,'), { value: '0,', caret: 2 });
  assert.equal(parseMoney(formatMoneyEntry('1234,56').value), 123456);
});

test('saved voucher label shows unique debit and credit accounts and debit total', () => {
  const entry = { ...voucher('one', 42, [
    line('391', 20000000), line('391', 10000000), line('191', 0, 10000000),
    line('190', 0, 20000000),
  ]), date: '2026-01-30', description: 'KDV Mahsup' };
  assert.equal(formatVoucherOption(entry),
    '42 — 30.01.2026 — KDV Mahsup (B: 391 / A: 191,190) (T: 300.000,00)');
});

test('account statement lists used-account movements in date and voucher order with running side', () => {
  const saved = [
    { ...voucher('third', 3, [line('100', 0, 10000), line('500', 10000)]), date: '2026-01-03', description: 'Üçüncü fiş' },
    { ...voucher('first', 1, [
      { ...line('100', 10000), description: 'İlk satır' }, line('500', 0, 10000),
    ]), date: '2026-01-02', description: 'İlk fiş' },
    { ...voucher('second', 2, [line('100', 0, 5000), line('500', 5000)]), date: '2026-01-03', description: 'İkinci fiş' },
  ];
  assert.deepEqual(trialBalance(accounts, saved).rows.map(row => row.code), ['100', '500']);
  assert.deepEqual(accountStatement(saved, '100'), [
    { id: 'first', date: '2026-01-02', number: 1, description: 'İlk satır', debit: 10000, credit: 0, balance: 10000, side: 'B' },
    { id: 'second', date: '2026-01-03', number: 2, description: 'İkinci fiş', debit: 0, credit: 5000, balance: 5000, side: 'B' },
    { id: 'third', date: '2026-01-03', number: 3, description: 'Üçüncü fiş', debit: 0, credit: 10000, balance: 5000, side: 'A' },
  ]);
  assert.deepEqual(accountStatement(saved, '120'), []);
});

test('provided account plan is valid and contains only main accounts', async () => {
  const csv = await readFile(new URL('../data/hesap-plani.csv', import.meta.url), 'utf8');
  const plan = parseAccountPlan(csv);
  assert.equal(plan.length, 280);
  assert.equal(plan[0].code, '100');
  assert.equal(new Set(plan.map(item => item.code)).size, plan.length);
  assert.ok(plan.every(item => item.code.length === 3));
});

test('voucher validation rejects imbalance and duplicate number', () => {
  const first = voucher('one', 1, [line('100', 10000), line('500', 0, 10000)]);
  assert.deepEqual(validateVoucher(first, accounts), []);
  assert.match(validateVoucher(voucher('two', 1, first.lines), accounts, [first]).join(' '), /zaten kullanılıyor/);
  assert.match(validateVoucher(voucher('two', 2, [line('100', 10000), line('500', 0, 9900)]), accounts).join(' '), /eşit olmalı/);
  assert.match(validateVoucher({ ...first, date: '2026-02-31' }, accounts).join(' '), /geçerli olmalı/);
});

test('backup import rejects unbalanced vouchers', () => {
  const invalid = { version: 1, year: 2026, accounts, nextNumber: 2,
    vouchers: [voucher('bad', 1, [line('100', 10000), line('500', 0, 9000)])] };
  assert.throws(() => validateBackup(invalid), /dengesiz/);
});

test('backup accepts optional business title and rejects invalid title data', () => {
  const backup = { version: 1, year: 2026, accounts, nextNumber: 1, vouchers: [] };
  assert.equal(validateBackup(backup), backup);
  assert.equal(validateBackup({ ...backup, businessTitle: 'Örnek İşletme' }).businessTitle, 'Örnek İşletme');
  assert.throws(() => validateBackup({ ...backup, businessTitle: 42 }), /beklenen biçimde değil/);
});

test('deleting all vouchers keeps the account plan and resets numbering', () => {
  const original = { version: 1, year: 2026, accounts,
    vouchers: [voucher('one', 4, [line('100', 10000), line('500', 0, 10000)])], nextNumber: 5 };
  const cleared = withoutVouchers(original);
  assert.equal(cleared.accounts, accounts);
  assert.deepEqual(cleared.vouchers, []);
  assert.equal(cleared.nextNumber, 1);
  assert.equal(original.vouchers.length, 1);
});

test('voucher sorting renumbers by date and preserves earlier numbers within the same date', () => {
  const source = { version: 1, year: 2026, accounts, nextNumber: 61, vouchers: [
    { ...voucher('later', 60, [line('100', 10000), line('500', 0, 10000)]), date: '2026-01-08' },
    { ...voucher('same-later', 57, [line('100', 10000), line('500', 0, 10000)]), date: '2026-01-05' },
    { ...voucher('first', 1, [line('100', 10000), line('500', 0, 10000)]), date: '2026-01-01' },
    { ...voucher('same-earlier', 5, [line('100', 10000), line('500', 0, 10000)]), date: '2026-01-05' },
    { ...voucher('first-later', 53, [line('100', 10000), line('500', 0, 10000)]), date: '2026-01-01' },
  ] };
  const sorted = renumberVouchersByDate(source);
  assert.deepEqual(sorted.vouchers.map(item => [item.id, item.number]), [
    ['first', 1], ['first-later', 2], ['same-earlier', 3], ['same-later', 4], ['later', 5],
  ]);
  assert.equal(sorted.nextNumber, 6);
  assert.equal(source.vouchers[0].number, 60);
  assert.equal(validateBackup(sorted), sorted);
});

test('trial balance, income and balance sheet agree for normal entries', () => {
  const vouchers = [
    voucher('opening', 1, [line('100', 1000000), line('500', 0, 1000000)]),
    voucher('sale', 2, [line('120', 500000), line('600', 0, 500000)]),
    voucher('expense', 3, [line('630', 100000), line('100', 0, 100000)]),
  ];
  const trial = trialBalance(accounts, vouchers);
  assert.equal(trial.totals.debit, trial.totals.credit);
  assert.equal(trial.totals.debitBalance, trial.totals.creditBalance);
  assert.equal(incomeStatement(accounts, vouchers).result, 400000);
  const balance = balanceSheet(accounts, vouchers);
  assert.equal(balance.assetTotal, 1400000);
  assert.equal(balance.liabilityTotal, 1400000);
  assert.equal(balance.difference, 0);
});

test('grouped balance sheet sums account groups, classes, and period result', () => {
  const plan = [
    ...accounts,
    { code: '103', name: 'VERİLEN ÇEKLER', side: 'A' },
    { code: '320', name: 'SATICILAR', side: 'A' },
    { code: '400', name: 'BANKA KREDİLERİ', side: 'A' },
  ];
  const vouchers = [
    voucher('opening', 1, [line('100', 1000000), line('500', 0, 1000000)]),
    voucher('sale', 2, [line('120', 300000), line('600', 0, 300000)]),
    voucher('expense', 3, [line('630', 50000), line('100', 0, 50000)]),
    voucher('contra', 4, [line('100', 20000), line('103', 0, 20000)]),
    voucher('supplier', 5, [line('100', 100000), line('320', 0, 100000)]),
    voucher('loan', 6, [line('100', 200000), line('400', 0, 200000)]),
  ];
  const report = balanceSheet(plan, vouchers);
  const grouped = groupedBalanceSheet(report);
  assert.deepEqual(grouped.map(item => item.code), ['1', '3', '4', '5']);
  assert.deepEqual(grouped.map(item => item.total), [1550000, 100000, 200000, 1250000]);
  assert.equal(grouped[0].groups.find(item => item.code === '10').name, 'HAZIR DEĞERLER');
  assert.equal(grouped[0].groups.find(item => item.code === '10').total, 1250000);
  assert.equal(grouped[0].groups.find(item => item.code === '10').rows.find(item => item.code === '103').value, -20000);
  assert.equal(grouped[2].groups[0].name, 'MALİ BORÇLAR');
  assert.equal(grouped[3].groups.find(item => item.code === '59').total, 250000);
  assert.equal(grouped.slice(0, 1).reduce((sum, item) => sum + item.total, 0), report.assetTotal);
  assert.equal(grouped.slice(1).reduce((sum, item) => sum + item.total, 0), report.liabilityTotal);
});

test('trial balance identifies balances opposite to the account plan side', () => {
  const vouchers = [
    voucher('reverse', 1, [line('500', 20000), line('100', 0, 20000)]),
    voucher('normal', 2, [line('120', 10000), line('600', 0, 10000)]),
    voucher('zero', 3, [line('630', 5000), line('630', 0, 5000)]),
  ];
  const rows = trialBalance(accounts, vouchers).rows;
  assert.deepEqual(rows.filter(row => row.reverseBalance).map(row => row.code), ['100', '500']);
  assert.equal(rows.find(row => row.code === '630').reverseBalance, false);
});

test('journal orders saved vouchers by date and number and uses voucher descriptions', () => {
  const later = { ...voucher('later', 3, [line('100', 10000), line('500', 0, 10000)]), date: '2026-02-01' };
  const first = { ...voucher('first', 1, [line('100', 20000), line('500', 0, 20000)]),
    date: '2026-01-02' };
  const second = { ...voucher('second', 2, [line('500', 0, 30000), line('100', 30000)]),
    date: '2026-01-02', description: 'Fiş açıklaması' };
  second.lines[0].description = 'Satır açıklaması';
  const entries = journalEntries(accounts, [later, second, first]);
  assert.deepEqual(entries.map(entry => entry.number), [1, 2, 3]);
  assert.deepEqual(entries[1].lines.map(item => item.code), ['100', '500']);
  assert.equal(entries[1].lines[0].name, 'KASA');
  assert.equal(entries[1].lines[1].description, 'Satır açıklaması');
  assert.equal(entries[1].description, 'Fiş açıklaması');
  assert.equal(second.lines[0].code, '500');
});

test('general ledger groups each account movement by side and keeps voucher references', () => {
  const first = { ...voucher('first', 1, [line('100', 10000), line('500', 0, 10000)]), date: '2026-01-02' };
  const second = { ...voucher('second', 2, [line('120', 3000), line('100', 0, 3000)]), date: '2026-01-03' };
  const third = { ...voucher('third', 3, [line('100', 5000), line('500', 0, 5000)]), date: '2026-01-04' };
  const rows = generalLedger(accounts, [third, second, first]);
  assert.deepEqual(rows.map(row => row.code), ['100', '120', '500']);
  assert.deepEqual(rows[0].debitEntries, [
    { voucherNumber: 1, amount: 10000 }, { voucherNumber: 3, amount: 5000 },
  ]);
  assert.deepEqual(rows[0].creditEntries, [{ voucherNumber: 2, amount: 3000 }]);
  assert.equal(rows[0].debitTotal, 15000);
  assert.equal(rows[0].creditTotal, 3000);
  assert.equal(rows[0].debitBalance, 12000);
  assert.equal(rows[2].creditBalance, 15000);
});

test('income statement shows only used 6xx accounts and cumulative subtotals', () => {
  const plan = ['100', '600', '610', '621', '631', '660', '691', '699']
    .map(code => ({ code, name: code, side: code === '100' ? 'B' : 'A' }));
  const entries = [voucher('income', 1, [
    line('100', 1000000), line('600', 0, 1000000),
    line('610', 100000), line('100', 0, 100000),
    line('621', 300000), line('100', 0, 300000),
    line('631', 200000), line('100', 0, 200000),
    line('660', 50000), line('100', 0, 50000),
    line('691', 35000), line('100', 0, 35000),
  ])];
  const report = incomeStatement(plan, entries);
  assert.deepEqual(report.rows.map(row => row.code), ['600', '610', '621', '631', '660', '691']);
  assert.deepEqual(report.stages.map(stage => stage.total),
    [900000, 600000, 400000, 350000, 315000]);
  assert.deepEqual(report.stages.map(stage => stage.rows.map(row => row.code)),
    [['600', '610'], ['621'], ['631'], ['660'], ['691']]);
  assert.equal(report.result, 315000);
  assert.equal(report.showNetSales, true);
});

test('net sales subtotal appears only when 600 is paired with an account from 601 to 612', () => {
  const plan = ['100', '600', '601', '610', '612', '621', '631'].map(code => ({ code, name: code, side: 'B' }));
  const sale = voucher('sale', 1, [line('100', 100000), line('600', 0, 100000)]);
  const expense = voucher('expense', 2, [line('631', 10000), line('100', 0, 10000)]);
  const discount = voucher('discount', 3, [line('610', 10000), line('100', 0, 10000)]);
  const cost = voucher('cost', 4, [line('621', 10000), line('100', 0, 10000)]);
  const firstInRange = voucher('first', 5, [line('100', 10000), line('601', 0, 10000)]);
  const lastInRange = voucher('last', 6, [line('612', 10000), line('100', 0, 10000)]);
  assert.equal(incomeStatement(plan, [sale]).showNetSales, false);
  assert.equal(incomeStatement(plan, [sale, expense]).showNetSales, false);
  assert.equal(incomeStatement(plan, [sale, discount]).showNetSales, true);
  assert.equal(incomeStatement(plan, [sale, firstInRange]).showNetSales, true);
  assert.equal(incomeStatement(plan, [sale, lastInRange]).showNetSales, true);
  assert.equal(incomeStatement(plan, [sale, cost]).showNetSales, false);
});

test('unclosed 7xx costs stay out of income and flag balance difference', () => {
  const vouchers = [voucher('cost', 1, [line('770', 25000), line('100', 0, 25000)])];
  assert.equal(incomeStatement(accounts, vouchers).result, 0);
  assert.equal(balanceSheet(accounts, vouchers).difference, -25000);
});

test('replacing account plan cannot strand voucher accounts', () => {
  const vouchers = [voucher('one', 1, [line('100', 100), line('500', 0, 100)])];
  assert.throws(() => validateAccountReplacement(accounts.filter(item => item.code !== '100'), vouchers), /100/);
  assert.doesNotThrow(() => validateAccountReplacement(accounts, vouchers));
});
