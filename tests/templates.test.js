import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAccountPlan } from '../csv.js';
import { validateVoucher } from '../accounting.js';
import { createTemplateVoucher, createTemplateSequence, templateEndDate, TEMPLATES } from '../templates.js';

const accounts = parseAccountPlan(await readFile(new URL('../data/hesap-plani.csv', import.meta.url), 'utf8'));

test('all templates are planned in order with balances from preceding entries', () => {
  const planned = createTemplateSequence(23, '2026-09-24', accounts, [], () => 0.5);
  assert.equal(planned.length, TEMPLATES.length);
  assert.deepEqual(planned.map(item => item.number), TEMPLATES.map((_, index) => 23 + index));
  assert.deepEqual(planned.map(item => item.date), [
    '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28',
    '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
    '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
    '2026-10-09', '2026-10-10',
  ]);
  assert.deepEqual(planned.map(item => item.description), TEMPLATES.map(item => item.description));
  assert.equal(planned[2].lines[0].debit, 75_000_000);
  assert.equal(planned[3].lines[0].debit, 52_500_000);
  assert.ok(planned.every(item => item.id === null));
  const recorded = [];
  for (const item of planned) {
    const saved = { ...item, id: `saved-${item.number}` };
    assert.deepEqual(validateVoucher(saved, accounts, recorded), []);
    recorded.push(saved);
  }
});

test('all-template dates advance across month boundaries and stop at the year end', () => {
  const planned = createTemplateSequence(1, '2026-01-30', accounts, [], () => 0.5);
  assert.deepEqual(planned.slice(0, 4).map(item => item.date), [
    '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02',
  ]);
  assert.equal(planned.at(-1).date, '2026-02-15');
  assert.equal(createTemplateSequence(1, '2026-12-15', accounts, [], () => 0.5).at(-1).date, '2026-12-31');
  assert.throws(
    () => createTemplateSequence(1, '2026-12-16', accounts, [], () => 0.5),
    /Tarih 2026 yılı içinde/,
  );
});

test('selected templates keep their original order and use consecutive dates', () => {
  const selected = [TEMPLATES[7].id, TEMPLATES[0].id, TEMPLATES[6].id];
  const planned = createTemplateSequence(30, '2026-02-27', accounts, [], () => 0.5, selected);
  assert.deepEqual(planned.map(item => [item.number, item.date, item.description]), [
    [30, '2026-02-27', TEMPLATES[0].description],
    [31, '2026-02-28', TEMPLATES[6].description],
    [32, '2026-03-01', TEMPLATES[7].description],
  ]);
  assert.equal(templateEndDate('2026-02-27', selected.length), '2026-03-01');
  assert.equal(templateEndDate('2026-02-27', 0), '');
});

test('all-template planning stops before saving if a required account is missing', () => {
  assert.throws(
    () => createTemplateSequence(1, '2026-09-24', accounts.filter(item => item.code !== '335'), [], () => 0.5),
    /Personel Ücret Hakedişi - Yönetim.*335/,
  );
});

test('foundation template prepares a balanced unsaved voucher with matching descriptions', () => {
  assert.equal(TEMPLATES[0].name, 'Kuruluş (102/500)');
  const voucher = createTemplateVoucher('foundation-102-500', 8, '2026-09-24', accounts, () => 0.5);
  assert.equal(voucher.id, null);
  assert.equal(voucher.number, 8);
  assert.equal(voucher.description, 'Bankaya yatan para ile kuruluş');
  assert.deepEqual(voucher.lines.map(line => line.code), ['102', '500']);
  assert.equal(voucher.lines[0].debit, 15_000_000);
  assert.equal(voucher.lines[1].credit, 15_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('foundation amount spans inclusive 100,000 to 200,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('foundation-102-500', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 10_000_000 && amount <= 20_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('foundation-102-500', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 10_000_000);
  assert.equal(createTemplateVoucher('foundation-102-500', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 20_000_000);
});

test('foundation template refuses an account plan without required accounts', () => {
  assert.throws(() => createTemplateVoucher('foundation-102-500', 1, '2026-01-01', accounts.filter(item => item.code !== '102')), /102 ve 500/);
});

test('trade goods purchase template prepares a balanced unsaved voucher', () => {
  const voucher = createTemplateVoucher('purchase-153-320', 9, '2026-09-24', accounts, () => 0.5);
  assert.equal(TEMPLATES[1].name, 'Ticari Mal Alış Veresiye (153/320)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.number, 9);
  assert.equal(voucher.description, 'Ticari Mal alışı veresiye');
  assert.deepEqual(voucher.lines.map(line => line.code), ['153', '320']);
  assert.equal(voucher.lines[0].debit, 75_000_000);
  assert.equal(voucher.lines[1].credit, 75_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('trade goods purchase amount spans inclusive 500,000 to 1,000,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('purchase-153-320', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 50_000_000 && amount <= 100_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('purchase-153-320', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 50_000_000);
  assert.equal(createTemplateVoucher('purchase-153-320', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 100_000_000);
});

test('trade goods purchase template requires both accounts in the plan', () => {
  assert.throws(() => createTemplateVoucher('purchase-153-320', 1, '2026-01-01', accounts.filter(item => item.code !== '320')), /153 ve 320/);
});

const priorPurchase = {
  id: 'purchase', number: 1, date: '2026-02-01', description: '',
  lines: [
    { code: '153', debit: 50_000_000, credit: 0 },
    { code: '320', debit: 0, credit: 50_000_000 },
  ],
};

test('sale template uses the saved 153 debit balance and leaves the sale unsaved', () => {
  assert.equal(TEMPLATES[2].name, 'Satış Veresiye (120/600)');
  const voucher = createTemplateVoucher('sale-120-600', 2, '2026-09-24', accounts, () => 0.5, [priorPurchase]);
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Satış Veresiye');
  assert.deepEqual(voucher.lines.map(line => line.code), ['120', '600']);
  assert.equal(voucher.lines[0].debit, 50_000_000);
  assert.equal(voucher.lines[1].credit, 50_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [priorPurchase]), []);
});

test('sale amount is a 1,000 multiple within 70–130 percent, including bounds', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('sale-120-600', 2, '2026-09-24', accounts, () => draw, [priorPurchase]).lines[0].debit;
    assert.ok(amount >= 35_000_000 && amount <= 65_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('sale-120-600', 2, '2026-09-24', accounts, () => 0, [priorPurchase]).lines[0].debit, 35_000_000);
  assert.equal(createTemplateVoucher('sale-120-600', 2, '2026-09-24', accounts, () => 0.999999, [priorPurchase]).lines[0].debit, 65_000_000);
});

test('sale template rejects absent or too small 153 debit balance', () => {
  assert.throws(() => createTemplateVoucher('sale-120-600', 1, '2026-09-24', accounts, () => 0, []), /borç bakiyesi yok/);
  const small = {
    ...priorPurchase,
    lines: [
      { code: '153', debit: 50_000, credit: 0 },
      { code: '320', debit: 0, credit: 50_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('sale-120-600', 2, '2026-09-24', accounts, () => 0, [small]), /1.000 TL katı/);
});

const priorSale = {
  id: 'sale', number: 2, date: '2026-03-01', description: '',
  lines: [
    { code: '120', debit: 50_000_000, credit: 0 },
    { code: '600', debit: 0, credit: 50_000_000 },
  ],
};

test('cost template uses 600 credit balance when selected amount fits 153 stock', () => {
  let draws = 0;
  const voucher = createTemplateVoucher('cost-621-153', 3, '2026-09-24', accounts,
    () => { draws++; return 0.5; }, [priorPurchase, priorSale]);
  assert.equal(TEMPLATES[3].name, 'Satılan Mal Maliyeti (621/153)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Satılan Mal Maliyeti');
  assert.deepEqual(voucher.lines.map(line => line.code), ['621', '153']);
  assert.equal(voucher.lines[0].debit, 35_000_000);
  assert.equal(voucher.lines[1].credit, 35_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.equal(draws, 1);
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [priorPurchase, priorSale]), []);
});

test('cost template redraws from 153 balance when sales-based amount exceeds stock', () => {
  const smallerStock = {
    ...priorPurchase,
    lines: [
      { code: '153', debit: 30_000_000, credit: 0 },
      { code: '320', debit: 0, credit: 30_000_000 },
    ],
  };
  let draws = 0;
  const voucher = createTemplateVoucher('cost-621-153', 3, '2026-09-24', accounts,
    () => { draws++; return 0.5; }, [smallerStock, priorSale]);
  assert.equal(draws, 2);
  assert.equal(voucher.lines[0].debit, 21_000_000);
  assert.equal(voucher.lines[1].credit, 21_000_000);
});

test('cost amount stays in the initial 60–80 percent range and on 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('cost-621-153', 3, '2026-09-24', accounts,
      () => draw, [priorPurchase, priorSale]).lines[0].debit;
    assert.ok(amount >= 30_000_000 && amount <= 40_000_000);
    assert.equal(amount % 100_000, 0);
  }
});

test('cost template rejects missing balances or an impossible 1,000 step', () => {
  assert.throws(() => createTemplateVoucher('cost-621-153', 1, '2026-09-24', accounts, () => 0, []), /600 hesabında alacak bakiyesi yok/);
  const tinyStock = {
    ...priorPurchase,
    lines: [
      { code: '153', debit: 100_000, credit: 0 },
      { code: '320', debit: 0, credit: 100_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('cost-621-153', 3, '2026-09-24', accounts, () => 0.5,
    [tinyStock, priorSale]), /153 hesabının borç bakiyesinin.*1.000 TL katı/);
});

test('collection template prepares a balanced unsaved voucher from 120 debit balance', () => {
  const voucher = createTemplateVoucher('collection-102-120', 3, '2026-09-24', accounts,
    () => 0.5, [priorSale]);
  assert.equal(TEMPLATES[4].name, 'Tahsilat Banka İle (102/120)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Müşteriden Tahsilat');
  assert.deepEqual(voucher.lines.map(line => line.code), ['102', '120']);
  assert.equal(voucher.lines[0].debit, 37_500_000);
  assert.equal(voucher.lines[1].credit, 37_500_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [priorSale]), []);
});

test('collection amount is a 1,000 multiple within 60–90 percent, including bounds', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('collection-102-120', 3, '2026-09-24', accounts,
      () => draw, [priorSale]).lines[0].debit;
    assert.ok(amount >= 30_000_000 && amount <= 45_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('collection-102-120', 3, '2026-09-24', accounts,
    () => 0, [priorSale]).lines[0].debit, 30_000_000);
  assert.equal(createTemplateVoucher('collection-102-120', 3, '2026-09-24', accounts,
    () => 0.999999, [priorSale]).lines[0].debit, 45_000_000);
});

test('collection uses remaining net 120 debit balance after earlier receipts', () => {
  const earlierReceipt = {
    id: 'receipt', number: 3, date: '2026-04-01', description: '',
    lines: [
      { code: '102', debit: 10_000_000, credit: 0 },
      { code: '120', debit: 0, credit: 10_000_000 },
    ],
  };
  const voucher = createTemplateVoucher('collection-102-120', 4, '2026-09-24', accounts,
    () => 0.5, [priorSale, earlierReceipt]);
  assert.equal(voucher.lines[0].debit, 30_000_000);
});

test('collection template rejects missing or too small 120 debit balance', () => {
  assert.throws(() => createTemplateVoucher('collection-102-120', 1, '2026-09-24', accounts,
    () => 0, []), /120 hesabında borç bakiyesi yok/);
  const smallSale = {
    ...priorSale,
    lines: [
      { code: '120', debit: 100_000, credit: 0 },
      { code: '600', debit: 0, credit: 100_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('collection-102-120', 2, '2026-09-24', accounts,
    () => 0, [smallSale]), /%60–%90.*1.000 TL katı/);
});

const priorBank = {
  id: 'bank', number: 3, date: '2026-02-01', description: '',
  lines: [
    { code: '102', debit: 50_000_000, credit: 0 },
    { code: '500', debit: 0, credit: 50_000_000 },
  ],
};

test('payment template uses 320 credit balance when bank funds suffice', () => {
  let draws = 0;
  const voucher = createTemplateVoucher('payment-320-102', 4, '2026-09-24', accounts,
    () => { draws++; return 0.5; }, [priorPurchase, priorBank]);
  assert.equal(TEMPLATES[5].name, 'Ödeme Banka İle (320/102)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Satıcıya Ödeme');
  assert.deepEqual(voucher.lines.map(line => line.code), ['320', '102']);
  assert.equal(voucher.lines[0].debit, 37_500_000);
  assert.equal(voucher.lines[1].credit, 37_500_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.equal(draws, 1);
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [priorPurchase, priorBank]), []);
});

test('payment redraws from 102 debit balance when 320-based amount exceeds bank funds', () => {
  const smallerBank = {
    ...priorBank,
    lines: [
      { code: '102', debit: 30_000_000, credit: 0 },
      { code: '500', debit: 0, credit: 30_000_000 },
    ],
  };
  let draws = 0;
  const voucher = createTemplateVoucher('payment-320-102', 4, '2026-09-24', accounts,
    () => { draws++; return 0.5; }, [priorPurchase, smallerBank]);
  assert.equal(draws, 2);
  assert.equal(voucher.lines[0].debit, 22_500_000);
  assert.equal(voucher.lines[1].credit, 22_500_000);
});

test('payment amount stays in 60–90 percent range and on 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('payment-320-102', 4, '2026-09-24', accounts,
      () => draw, [priorPurchase, priorBank]).lines[0].debit;
    assert.ok(amount >= 30_000_000 && amount <= 45_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('payment-320-102', 4, '2026-09-24', accounts,
    () => 0, [priorPurchase, priorBank]).lines[0].debit, 30_000_000);
  assert.equal(createTemplateVoucher('payment-320-102', 4, '2026-09-24', accounts,
    () => 0.999999, [priorPurchase, priorBank]).lines[0].debit, 45_000_000);
});

test('payment uses remaining net 320 credit and 102 debit balances', () => {
  const earlierPayment = {
    id: 'earlier-payment', number: 4, date: '2026-04-01', description: '',
    lines: [
      { code: '320', debit: 10_000_000, credit: 0 },
      { code: '102', debit: 0, credit: 10_000_000 },
    ],
  };
  const voucher = createTemplateVoucher('payment-320-102', 5, '2026-09-24', accounts,
    () => 0.5, [priorPurchase, priorBank, earlierPayment]);
  assert.equal(voucher.lines[0].debit, 30_000_000);
});

test('payment rejects absent balances and impossible 1,000 steps', () => {
  assert.throws(() => createTemplateVoucher('payment-320-102', 1, '2026-09-24', accounts,
    () => 0, []), /320 hesabında alacak bakiyesi yok/);
  assert.throws(() => createTemplateVoucher('payment-320-102', 4, '2026-09-24', accounts,
    () => 0.5, [priorPurchase]), /102 hesabında borç bakiyesi yok/);
  const tinyBank = {
    ...priorBank,
    lines: [
      { code: '102', debit: 100_000, credit: 0 },
      { code: '500', debit: 0, credit: 100_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('payment-320-102', 4, '2026-09-24', accounts,
    () => 0.5, [priorPurchase, tinyBank]), /102 hesabının borç bakiyesinin %60–%90.*1.000 TL katı/);
});

test('vehicle purchase template prepares a balanced unsaved voucher', () => {
  const voucher = createTemplateVoucher('vehicle-254-300', 7, '2026-09-24', accounts, () => 0.5);
  assert.equal(TEMPLATES[6].name, 'Taşıt Alış Kredi (254/300)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Taşıt alış banka kredisi ile');
  assert.deepEqual(voucher.lines.map(line => line.code), ['254', '300']);
  assert.equal(voucher.lines[0].debit, 150_000_000);
  assert.equal(voucher.lines[1].credit, 150_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('vehicle purchase amount spans 1,000,000–2,000,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('vehicle-254-300', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 100_000_000 && amount <= 200_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('vehicle-254-300', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 100_000_000);
  assert.equal(createTemplateVoucher('vehicle-254-300', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 200_000_000);
});

test('short-term loan template prepares a balanced unsaved voucher', () => {
  const voucher = createTemplateVoucher('short-term-loan-102-300', 8, '2026-09-24', accounts, () => 0.5);
  assert.equal(TEMPLATES[7].name, 'Kredi Kullanımı Kısa Vadeli (102/300)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Bankadan kısa vadeli kredi kullanımı');
  assert.deepEqual(voucher.lines.map(line => line.code), ['102', '300']);
  assert.equal(voucher.lines[0].debit, 75_000_000);
  assert.equal(voucher.lines[1].credit, 75_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('short-term loan amount spans 500,000–1,000,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('short-term-loan-102-300', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 50_000_000 && amount <= 100_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('short-term-loan-102-300', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 50_000_000);
  assert.equal(createTemplateVoucher('short-term-loan-102-300', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 100_000_000);
});

test('long-term loan template prepares a balanced unsaved voucher', () => {
  const voucher = createTemplateVoucher('long-term-loan-102-400', 9, '2026-09-24', accounts, () => 0.5);
  assert.equal(TEMPLATES[8].name, 'Kredi Kullanımı Uzun Vadeli (102/400)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Bankadan uzun vadeli kredi kullanımı');
  assert.deepEqual(voucher.lines.map(line => line.code), ['102', '400']);
  assert.equal(voucher.lines[0].debit, 75_000_000);
  assert.equal(voucher.lines[1].credit, 75_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('long-term loan amount spans 500,000–1,000,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('long-term-loan-102-400', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 50_000_000 && amount <= 100_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('long-term-loan-102-400', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 50_000_000);
  assert.equal(createTemplateVoucher('long-term-loan-102-400', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 100_000_000);
});

test('general management expense template prepares a balanced unsaved voucher', () => {
  const voucher = createTemplateVoucher('general-management-expense-632-329', 10, '2026-09-24', accounts, () => 0.5);
  assert.equal(TEMPLATES[9].name, 'Genel Yönetim Gideri (632/329)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Gider tahakkuku');
  assert.deepEqual(voucher.lines.map(line => line.code), ['632', '329']);
  assert.equal(voucher.lines[0].debit, 7_500_000);
  assert.equal(voucher.lines[1].credit, 7_500_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('general management expense amount spans 50,000–100,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('general-management-expense-632-329', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 5_000_000 && amount <= 10_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('general-management-expense-632-329', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 5_000_000);
  assert.equal(createTemplateVoucher('general-management-expense-632-329', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 10_000_000);
});

test('management payroll template prepares a balanced unsaved voucher', () => {
  const voucher = createTemplateVoucher('management-payroll-632-335', 11, '2026-09-24', accounts, () => 0.5);
  assert.equal(TEMPLATES[10].name, 'Personel Ücret Hakedişi - Yönetim (632/335)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Yönetime bağlı (idari) personel ücret hakedişi');
  assert.deepEqual(voucher.lines.map(line => line.code), ['632', '335']);
  assert.equal(voucher.lines[0].debit, 7_500_000);
  assert.equal(voucher.lines[1].credit, 7_500_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('management payroll amount spans 50,000–100,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('management-payroll-632-335', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 5_000_000 && amount <= 10_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('management-payroll-632-335', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 5_000_000);
  assert.equal(createTemplateVoucher('management-payroll-632-335', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 10_000_000);
});

test('marketing payroll template prepares a balanced unsaved voucher', () => {
  const voucher = createTemplateVoucher('marketing-payroll-631-335', 12, '2026-09-24', accounts, () => 0.5);
  assert.equal(TEMPLATES[11].name, 'Personel Ücret Hakedişi - Pazarlama (631/335)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Pazarlamaya bağlı personel ücret hakedişi');
  assert.deepEqual(voucher.lines.map(line => line.code), ['631', '335']);
  assert.equal(voucher.lines[0].debit, 7_500_000);
  assert.equal(voucher.lines[1].credit, 7_500_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts), []);
});

test('marketing payroll amount spans 50,000–100,000 in 1,000 steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('marketing-payroll-631-335', 1, '2026-01-01', accounts, () => draw).lines[0].debit;
    assert.ok(amount >= 5_000_000 && amount <= 10_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('marketing-payroll-631-335', 1, '2026-01-01', accounts, () => 0).lines[0].debit, 5_000_000);
  assert.equal(createTemplateVoucher('marketing-payroll-631-335', 1, '2026-01-01', accounts, () => 0.999999).lines[0].debit, 10_000_000);
});

const priorPayroll = {
  id: 'payroll', number: 1, date: '2026-03-01', description: '',
  lines: [
    { code: '632', debit: 10_000_000, credit: 0 },
    { code: '335', debit: 0, credit: 10_000_000 },
  ],
};

test('payroll payment template prepares a balanced unsaved voucher from 335 credit balance', () => {
  const voucher = createTemplateVoucher('payroll-payment-335-102', 2, '2026-09-24', accounts,
    () => 0.5, [priorPayroll]);
  assert.equal(TEMPLATES[12].name, 'Ücret Ödemesi (335/102)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Personel Ücretlerinin Ödenmesi');
  assert.deepEqual(voucher.lines.map(line => line.code), ['335', '102']);
  assert.equal(voucher.lines[0].debit, 8_000_000);
  assert.equal(voucher.lines[1].credit, 8_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [priorPayroll]), []);
});

test('payroll payment amount is a 1,000 multiple within 70–90 percent', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('payroll-payment-335-102', 2, '2026-09-24', accounts,
      () => draw, [priorPayroll]).lines[0].debit;
    assert.ok(amount >= 7_000_000 && amount <= 9_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('payroll-payment-335-102', 2, '2026-09-24', accounts,
    () => 0, [priorPayroll]).lines[0].debit, 7_000_000);
  assert.equal(createTemplateVoucher('payroll-payment-335-102', 2, '2026-09-24', accounts,
    () => 0.999999, [priorPayroll]).lines[0].debit, 9_000_000);
});

test('payroll payment uses remaining net 335 credit balance after earlier payment', () => {
  const earlierPayment = {
    id: 'payroll-payment', number: 2, date: '2026-04-01', description: '',
    lines: [
      { code: '335', debit: 2_000_000, credit: 0 },
      { code: '102', debit: 0, credit: 2_000_000 },
    ],
  };
  const voucher = createTemplateVoucher('payroll-payment-335-102', 3, '2026-09-24', accounts,
    () => 0.5, [priorPayroll, earlierPayment]);
  assert.equal(voucher.lines[0].debit, 6_400_000);
});

test('payroll payment rejects absent or too small 335 credit balance', () => {
  assert.throws(() => createTemplateVoucher('payroll-payment-335-102', 1, '2026-09-24', accounts,
    () => 0, []), /335 hesabında alacak bakiyesi yok/);
  const smallPayroll = {
    ...priorPayroll,
    lines: [
      { code: '632', debit: 100_000, credit: 0 },
      { code: '335', debit: 0, credit: 100_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('payroll-payment-335-102', 2, '2026-09-24', accounts,
    () => 0, [smallPayroll]), /%70–%90.*1.000 TL katı/);
});

const earlierGoodsCost = {
  id: 'earlier-cost', number: 2, date: '2026-03-02', description: '',
  lines: [
    { code: '621', debit: 10_000_000, credit: 0 },
    { code: '153', debit: 0, credit: 10_000_000 },
  ],
};

test('purchase return prepares an unsaved voucher from the net 153 debit balance', () => {
  const voucher = createTemplateVoucher('purchase-return-320-153', 3, '2026-09-24', accounts,
    () => 0.5, [priorPurchase, earlierGoodsCost]);
  assert.equal(TEMPLATES[13].name, 'Mal Alış İadesi (320/153)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Veresiye alınan malın satıcıya iadesi');
  assert.deepEqual(voucher.lines.map(line => line.code), ['320', '153']);
  assert.equal(voucher.lines[0].debit, 6_000_000);
  assert.equal(voucher.lines[1].credit, 6_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [priorPurchase, earlierGoodsCost]), []);
});

test('purchase return amount stays within 10–20 percent in 1,000 TL steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('purchase-return-320-153', 3, '2026-09-24', accounts,
      () => draw, [priorPurchase, earlierGoodsCost]).lines[0].debit;
    assert.ok(amount >= 4_000_000 && amount <= 8_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('purchase-return-320-153', 3, '2026-09-24', accounts,
    () => 0, [priorPurchase, earlierGoodsCost]).lines[0].debit, 4_000_000);
  assert.equal(createTemplateVoucher('purchase-return-320-153', 3, '2026-09-24', accounts,
    () => 0.999999, [priorPurchase, earlierGoodsCost]).lines[0].debit, 8_000_000);
});

test('purchase return needs a usable 153 debit balance', () => {
  assert.throws(() => createTemplateVoucher('purchase-return-320-153', 1, '2026-09-24', accounts,
    () => 0, []), /153 hesabında borç bakiyesi yok/);
  const smallPurchase = {
    ...priorPurchase,
    lines: [
      { code: '153', debit: 100_000, credit: 0 },
      { code: '320', debit: 0, credit: 100_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('purchase-return-320-153', 2, '2026-09-24', accounts,
    () => 0, [smallPurchase]), /%10–%20.*1.000 TL katı/);
});

const earlierSalesDebit = {
  id: 'earlier-sales-debit', number: 3, date: '2026-03-02', description: '',
  lines: [
    { code: '600', debit: 10_000_000, credit: 0 },
    { code: '120', debit: 0, credit: 10_000_000 },
  ],
};

test('sales return prepares an unsaved voucher from the net 600 credit balance', () => {
  const voucher = createTemplateVoucher('sales-return-610-120', 4, '2026-09-24', accounts,
    () => 0.5, [priorSale, earlierSalesDebit]);
  assert.equal(TEMPLATES[14].name, 'Satış İadesi (610/120)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Müşteri (alıcı) tarafından yapılan iade');
  assert.deepEqual(voucher.lines.map(line => line.code), ['610', '120']);
  assert.equal(voucher.lines[0].debit, 3_000_000);
  assert.equal(voucher.lines[1].credit, 3_000_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [priorSale, earlierSalesDebit]), []);
});

test('sales return amount stays within 5–10 percent in 1,000 TL steps', () => {
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('sales-return-610-120', 4, '2026-09-24', accounts,
      () => draw, [priorSale, earlierSalesDebit]).lines[0].debit;
    assert.ok(amount >= 2_000_000 && amount <= 4_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('sales-return-610-120', 4, '2026-09-24', accounts,
    () => 0, [priorSale, earlierSalesDebit]).lines[0].debit, 2_000_000);
  assert.equal(createTemplateVoucher('sales-return-610-120', 4, '2026-09-24', accounts,
    () => 0.999999, [priorSale, earlierSalesDebit]).lines[0].debit, 4_000_000);
});

test('sales return needs a usable 600 credit balance', () => {
  assert.throws(() => createTemplateVoucher('sales-return-610-120', 1, '2026-09-24', accounts,
    () => 0, []), /600 hesabında alacak bakiyesi yok/);
  const smallSale = {
    ...priorSale,
    lines: [
      { code: '120', debit: 100_000, credit: 0 },
      { code: '600', debit: 0, credit: 100_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('sales-return-610-120', 2, '2026-09-24', accounts,
    () => 0, [smallSale]), /%5–%10.*1.000 TL katı/);
});

const shortLoan = {
  id: 'short-loan', number: 1, date: '2026-02-01', description: '',
  lines: [
    { code: '254', debit: 50_000_000, credit: 0 },
    { code: '300', debit: 0, credit: 50_000_000 },
  ],
};
const longLoan = {
  id: 'long-loan', number: 2, date: '2026-02-02', description: '',
  lines: [
    { code: '254', debit: 100_000_000, credit: 0 },
    { code: '400', debit: 0, credit: 100_000_000 },
  ],
};
const bankFunding = amount => ({
  id: 'bank-funding', number: 3, date: '2026-02-03', description: '',
  lines: [
    { code: '102', debit: amount, credit: 0 },
    { code: '500', debit: 0, credit: amount },
  ],
});

test('interest payment prepares an unsaved voucher from combined 300 and 400 credit balances', () => {
  const vouchers = [shortLoan, longLoan, bankFunding(10_000_000)];
  const voucher = createTemplateVoucher('interest-payment-660-102', 4, '2026-09-24', accounts,
    () => 0.5, vouchers);
  assert.equal(TEMPLATES[15].name, 'Faiz Ödemesi (660/102)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Kredi Faizi Ödemesi');
  assert.deepEqual(voucher.lines.map(line => line.code), ['660', '102']);
  assert.equal(voucher.lines[0].debit, 4_500_000);
  assert.equal(voucher.lines[1].credit, 4_500_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, vouchers), []);
});

test('interest payment uses net credit balances and 1–5 percent in 1,000 TL steps', () => {
  const repayment = {
    id: 'loan-repayment', number: 4, date: '2026-02-04', description: '',
    lines: [
      { code: '300', debit: 10_000_000, credit: 0 },
      { code: '254', debit: 0, credit: 10_000_000 },
    ],
  };
  const vouchers = [shortLoan, longLoan, bankFunding(10_000_000), repayment];
  for (const draw of [0, 0.01, 0.5, 0.99, 0.999999]) {
    const amount = createTemplateVoucher('interest-payment-660-102', 5, '2026-09-24', accounts,
      () => draw, vouchers).lines[0].debit;
    assert.ok(amount >= 1_400_000 && amount <= 7_000_000);
    assert.equal(amount % 100_000, 0);
  }
  assert.equal(createTemplateVoucher('interest-payment-660-102', 5, '2026-09-24', accounts,
    () => 0.5, vouchers).lines[0].debit, 4_200_000);
});

test('interest payment redraws 20–30 percent of 102 debit balance when needed', () => {
  const vouchers = [shortLoan, longLoan, bankFunding(2_000_000)];
  let draws = 0;
  const voucher = createTemplateVoucher('interest-payment-660-102', 4, '2026-09-24', accounts,
    () => { draws += 1; return 0.5; }, vouchers);
  assert.equal(draws, 2);
  assert.equal(voucher.lines[0].debit, 500_000);
  assert.equal(voucher.lines[1].credit, 500_000);
  const lowDraws = [0.5, 0];
  assert.equal(createTemplateVoucher('interest-payment-660-102', 4, '2026-09-24', accounts,
    () => lowDraws.shift(), vouchers).lines[0].debit, 400_000);
  const highDraws = [0.5, 0.999999];
  assert.equal(createTemplateVoucher('interest-payment-660-102', 4, '2026-09-24', accounts,
    () => highDraws.shift(), vouchers).lines[0].debit, 600_000);
});

test('interest payment requires loan and usable bank balances', () => {
  assert.throws(() => createTemplateVoucher('interest-payment-660-102', 4, '2026-09-24', accounts,
    () => 0, [bankFunding(10_000_000)]), /300\+400 hesabında alacak bakiyesi yok/);
  assert.throws(() => createTemplateVoucher('interest-payment-660-102', 4, '2026-09-24', accounts,
    () => 0.5, [shortLoan, longLoan, bankFunding(100_000)]), /102 hesabının borç bakiyesinin %20–%30.*1.000 TL katı/);
  assert.throws(() => createTemplateVoucher('interest-payment-660-102', 4, '2026-09-24',
    accounts.filter(account => account.code !== '400'), () => 0, [shortLoan]), /400 hesabı hesap planında bulunmalı/);
});

const periodProfit = {
  id: 'period-profit', number: 1, date: '2026-03-01', description: '',
  lines: [
    { code: '120', debit: 10_200_000, credit: 0 },
    { code: '600', debit: 0, credit: 10_200_000 },
  ],
};
const periodLoss = {
  id: 'period-loss', number: 1, date: '2026-03-01', description: '',
  lines: [
    { code: '632', debit: 9_900_000, credit: 0 },
    { code: '329', debit: 0, credit: 9_900_000 },
  ],
};

test('corporate tax template prepares 691/360 from period profit, rounded to 1,000 TL', () => {
  const voucher = createTemplateVoucher('corporate-tax-accrual-691-360', 2, '2026-09-24', accounts,
    () => 0.5, [periodProfit]);
  assert.equal(TEMPLATES[16].name, 'Kurumlar Vergisi Ödenecek (691/360)');
  assert.equal(voucher.id, null);
  assert.equal(voucher.description, 'Dönem karı üzerinden kurumlar vergisi tahakkuku');
  assert.deepEqual(voucher.lines.map(line => line.code), ['691', '360']);
  assert.equal(voucher.lines[0].debit, 2_600_000);
  assert.equal(voucher.lines[1].credit, 2_600_000);
  assert.ok(voucher.lines.every(line => line.description === voucher.description));
  assert.deepEqual(validateVoucher({ ...voucher, id: 'preview' }, accounts, [periodProfit]), []);
});

test('corporate tax template uses five percent of absolute period loss', () => {
  const voucher = createTemplateVoucher('corporate-tax-accrual-691-360', 2, '2026-09-24', accounts,
    () => 0.5, [periodLoss]);
  assert.equal(voucher.lines[0].debit, 500_000);
  assert.equal(voucher.lines[1].credit, 500_000);
  assert.equal(voucher.lines[0].debit % 100_000, 0);
});

test('corporate tax uses period result before existing 691 entries', () => {
  const priorTax = {
    id: 'prior-tax', number: 2, date: '2026-03-02', description: '',
    lines: [
      { code: '691', debit: 2_600_000, credit: 0 },
      { code: '360', debit: 0, credit: 2_600_000 },
    ],
  };
  const voucher = createTemplateVoucher('corporate-tax-accrual-691-360', 3, '2026-09-24', accounts,
    () => 0.5, [periodProfit, priorTax]);
  assert.equal(voucher.lines[0].debit, 2_600_000);
});

test('corporate tax needs a nonzero result and a rounded 1,000 TL amount', () => {
  assert.throws(() => createTemplateVoucher('corporate-tax-accrual-691-360', 1, '2026-09-24', accounts,
    () => 0.5, []), /Dönem kârı veya zararı oluşmadı/);
  const smallProfit = {
    ...periodProfit,
    lines: [
      { code: '120', debit: 100_000, credit: 0 },
      { code: '600', debit: 0, credit: 100_000 },
    ],
  };
  assert.throws(() => createTemplateVoucher('corporate-tax-accrual-691-360', 2, '2026-09-24', accounts,
    () => 0.5, [smallProfit]), /1.000 TL’ye yuvarlanamıyor/);
});
