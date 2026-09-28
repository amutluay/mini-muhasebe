import { ledger, incomeStatement, validateVoucher } from './accounting.js';

export const TEMPLATES = [
  {
    id: 'foundation-102-500',
    name: 'Kuruluş (102/500)',
    description: 'Bankaya yatan para ile kuruluş',
    debitCode: '102',
    creditCode: '500',
    minThousands: 100,
    maxThousands: 200,
  },
  {
    id: 'purchase-153-320',
    name: 'Ticari Mal Alış Veresiye (153/320)',
    description: 'Ticari Mal alışı veresiye',
    debitCode: '153',
    creditCode: '320',
    minThousands: 500,
    maxThousands: 1000,
  },
  {
    id: 'sale-120-600',
    name: 'Satış Veresiye (120/600)',
    description: 'Satış Veresiye',
    debitCode: '120',
    creditCode: '600',
    balanceCode: '153',
    minPercent: 70,
    maxPercent: 130,
  },
  {
    id: 'cost-621-153',
    name: 'Satılan Mal Maliyeti (621/153)',
    description: 'Satılan Mal Maliyeti',
    debitCode: '621',
    creditCode: '153',
    creditBalanceCode: '600',
    limitDebitBalanceCode: '153',
    minPercent: 60,
    maxPercent: 80,
  },
  {
    id: 'collection-102-120',
    name: 'Tahsilat Banka İle (102/120)',
    description: 'Müşteriden Tahsilat',
    debitCode: '102',
    creditCode: '120',
    balanceCode: '120',
    minPercent: 60,
    maxPercent: 90,
  },
  {
    id: 'payment-320-102',
    name: 'Ödeme Banka İle (320/102)',
    description: 'Satıcıya Ödeme',
    debitCode: '320',
    creditCode: '102',
    creditBalanceCode: '320',
    limitDebitBalanceCode: '102',
    minPercent: 60,
    maxPercent: 90,
  },
  {
    id: 'vehicle-254-300',
    name: 'Taşıt Alış Kredi (254/300)',
    description: 'Taşıt alış banka kredisi ile',
    debitCode: '254',
    creditCode: '300',
    minThousands: 1000,
    maxThousands: 2000,
  },
  {
    id: 'short-term-loan-102-300',
    name: 'Kredi Kullanımı Kısa Vadeli (102/300)',
    description: 'Bankadan kısa vadeli kredi kullanımı',
    debitCode: '102',
    creditCode: '300',
    minThousands: 500,
    maxThousands: 1000,
  },
  {
    id: 'long-term-loan-102-400',
    name: 'Kredi Kullanımı Uzun Vadeli (102/400)',
    description: 'Bankadan uzun vadeli kredi kullanımı',
    debitCode: '102',
    creditCode: '400',
    minThousands: 500,
    maxThousands: 1000,
  },
  {
    id: 'general-management-expense-632-329',
    name: 'Genel Yönetim Gideri (632/329)',
    description: 'Gider tahakkuku',
    debitCode: '632',
    creditCode: '329',
    minThousands: 50,
    maxThousands: 100,
  },
  {
    id: 'management-payroll-632-335',
    name: 'Personel Ücret Hakedişi - Yönetim (632/335)',
    description: 'Yönetime bağlı (idari) personel ücret hakedişi',
    debitCode: '632',
    creditCode: '335',
    minThousands: 50,
    maxThousands: 100,
  },
  {
    id: 'marketing-payroll-631-335',
    name: 'Personel Ücret Hakedişi - Pazarlama (631/335)',
    description: 'Pazarlamaya bağlı personel ücret hakedişi',
    debitCode: '631',
    creditCode: '335',
    minThousands: 50,
    maxThousands: 100,
  },
  {
    id: 'payroll-payment-335-102',
    name: 'Ücret Ödemesi (335/102)',
    description: 'Personel Ücretlerinin Ödenmesi',
    debitCode: '335',
    creditCode: '102',
    balanceCode: '335',
    balanceSide: 'credit',
    minPercent: 70,
    maxPercent: 90,
  },
  {
    id: 'purchase-return-320-153',
    name: 'Mal Alış İadesi (320/153)',
    description: 'Veresiye alınan malın satıcıya iadesi',
    debitCode: '320',
    creditCode: '153',
    balanceCode: '153',
    minPercent: 10,
    maxPercent: 20,
  },
  {
    id: 'sales-return-610-120',
    name: 'Satış İadesi (610/120)',
    description: 'Müşteri (alıcı) tarafından yapılan iade',
    debitCode: '610',
    creditCode: '120',
    balanceCode: '600',
    balanceSide: 'credit',
    minPercent: 5,
    maxPercent: 10,
  },
  {
    id: 'interest-payment-660-102',
    name: 'Faiz Ödemesi (660/102)',
    description: 'Kredi Faizi Ödemesi',
    debitCode: '660',
    creditCode: '102',
    creditBalanceCodes: ['300', '400'],
    limitDebitBalanceCode: '102',
    minPercent: 1,
    maxPercent: 5,
    fallbackMinPercent: 20,
    fallbackMaxPercent: 30,
  },
  {
    id: 'corporate-tax-accrual-691-360',
    name: 'Kurumlar Vergisi Ödenecek (691/360)',
    description: 'Dönem karı üzerinden kurumlar vergisi tahakkuku',
    debitCode: '691',
    creditCode: '360',
    profitPercent: 25,
    lossPercent: 5,
  },
];

function drawAmount(minThousands, maxThousands, random) {
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1)
    throw new Error('Şablon tutarı üretilemedi.');
  const amount = (minThousands + Math.floor(draw * (maxThousands - minThousands + 1))) * 100_000;
  if (!Number.isSafeInteger(amount)) throw new Error('Şablon tutarı çok büyük.');
  return amount;
}

function drawBalanceAmount(balance, code, side, random, minPercent = 70, maxPercent = 90) {
  if (!balance) throw new Error(`${code} hesabında ${side} bakiyesi yok.`);
  const balanceCents = BigInt(balance);
  const denominator = 100n * 100_000n;
  const minThousands = Number((balanceCents * BigInt(minPercent) + denominator - 1n) / denominator);
  const maxThousands = Number(balanceCents * BigInt(maxPercent) / denominator);
  if (minThousands > maxThousands)
    throw new Error(`${code} hesabının ${side} bakiyesinin %${minPercent}–%${maxPercent} aralığında 1.000 TL katı bir tutar yok.`);
  return drawAmount(minThousands, maxThousands, random);
}

function periodTaxAmount(accounts, vouchers, profitPercent, lossPercent) {
  const periodResult = incomeStatement(accounts, vouchers).stages[3].total;
  if (!periodResult) throw new Error('Dönem kârı veya zararı oluşmadı.');
  const percent = periodResult > 0 ? profitPercent : lossPercent;
  const thousandLiraCents = 100_000n;
  const denominator = 100n * thousandLiraCents;
  const roundedThousands = (BigInt(Math.abs(periodResult)) * BigInt(percent) + denominator / 2n) / denominator;
  const amount = roundedThousands * thousandLiraCents;
  if (!amount) throw new Error('Hesaplanan tutar 1.000 TL’ye yuvarlanamıyor.');
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Şablon tutarı çok büyük.');
  return Number(amount);
}

export function createTemplateVoucher(id, number, date, accounts, random = Math.random, vouchers = []) {
  const template = TEMPLATES.find(item => item.id === id);
  if (!template) throw new Error('Şablon bulunamadı.');
  const codes = new Set(accounts.map(item => item.code));
  const creditBalanceCodes = template.creditBalanceCodes || (template.creditBalanceCode ? [template.creditBalanceCode] : []);
  if (!codes.has(template.debitCode) || !codes.has(template.creditCode))
    throw new Error(`Bu şablon için ${template.debitCode} ve ${template.creditCode} hesapları hesap planında bulunmalı.`);
  for (const code of [template.balanceCode, ...creditBalanceCodes, template.limitDebitBalanceCode]) {
    if (code && !codes.has(code))
      throw new Error(`Bu şablon için ${code} hesabı hesap planında bulunmalı.`);
  }

  let amount;
  if (template.profitPercent !== undefined) {
    amount = periodTaxAmount(accounts, vouchers, template.profitPercent, template.lossPercent);
  } else if (template.balanceCode) {
    const row = ledger(accounts, vouchers).find(item => item.code === template.balanceCode);
    const creditSide = template.balanceSide === 'credit';
    const balance = creditSide ? row?.creditBalance || 0 : row?.debitBalance || 0;
    amount = drawBalanceAmount(balance, template.balanceCode, creditSide ? 'alacak' : 'borç', random,
      template.minPercent, template.maxPercent);
  } else if (creditBalanceCodes.length) {
    const rows = ledger(accounts, vouchers);
    const sourceBalance = creditBalanceCodes.reduce((sum, code) =>
      sum + (rows.find(row => row.code === code)?.creditBalance || 0), 0);
    const limitBalance = rows.find(row => row.code === template.limitDebitBalanceCode)?.debitBalance || 0;
    amount = drawBalanceAmount(sourceBalance, creditBalanceCodes.join('+'), 'alacak', random,
      template.minPercent, template.maxPercent);
    if (amount > limitBalance)
      amount = drawBalanceAmount(limitBalance, template.limitDebitBalanceCode, 'borç', random,
        template.fallbackMinPercent ?? template.minPercent, template.fallbackMaxPercent ?? template.maxPercent);
  } else {
    amount = drawAmount(template.minThousands, template.maxThousands, random);
  }
  return {
    id: null,
    number,
    date,
    description: template.description,
    lines: [
      { code: template.debitCode, debit: amount, credit: 0, quantity: '', description: template.description },
      { code: template.creditCode, debit: 0, credit: amount, quantity: '', description: template.description },
    ],
  };
}

export function templateEndDate(startDate, count) {
  if (count < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return '';
  const date = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) return '';
  date.setUTCDate(date.getUTCDate() + count - 1);
  return date.toISOString().slice(0, 10);
}

export function createTemplateSequence(startNumber, date, accounts, vouchers = [], random = Math.random,
  selectedIds = TEMPLATES.map(template => template.id)) {
  const simulated = [...vouchers];
  const planned = [];
  for (const template of TEMPLATES.filter(item => selectedIds.includes(item.id))) {
    try {
      const voucherDate = templateEndDate(date, planned.length + 1);
      const voucher = createTemplateVoucher(template.id, startNumber + planned.length, voucherDate, accounts, random, simulated);
      const preview = { ...voucher, id: `template-preview-${voucher.number}` };
      const errors = validateVoucher(preview, accounts, simulated);
      if (errors.length) throw new Error(errors[0]);
      simulated.push(preview);
      planned.push(voucher);
    } catch (error) {
      throw new Error(`${template.name}: ${error.message}`);
    }
  }
  return planned;
}
