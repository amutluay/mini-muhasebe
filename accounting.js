export const YEAR = 2026;

export function parseMoney(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  let normalized = raw;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatMoney(cents = 0) {
  return (cents / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function createVatLine(source, rate) {
  if (![1, 10, 20].includes(rate)) throw new Error('Geçersiz KDV oranı.');
  const debit = parseMoney(source.debit);
  const credit = parseMoney(source.credit);
  if (debit === null || credit === null || Boolean(debit) === Boolean(credit)) {
    throw new Error('KDV eklemek için satırda yalnızca geçerli bir borç veya alacak tutarı girin.');
  }
  const amount = Math.round((debit || credit) * rate / 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Hesaplanan KDV tutarı en az 0,01 olmalı.');
  }
  return {
    code: debit ? '191' : '391',
    debit: debit ? formatMoney(amount) : '',
    credit: credit ? formatMoney(amount) : '',
    quantity: '',
    description: source.description || '',
  };
}

export function formatMoneyEntry(value, caret = String(value ?? '').length) {
  const raw = String(value ?? '');
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return { value: '', caret: 0 };
  const decimalMark = cleaned.includes(',') ? ',' : '';
  const separator = decimalMark ? cleaned.indexOf(decimalMark) : -1;
  const whole = (separator < 0 ? cleaned : cleaned.slice(0, separator)).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = separator < 0 ? '' : cleaned.slice(separator + 1).replace(/\D/g, '').slice(0, 2);
  const formatted = separator < 0 ? grouped : `${grouped},${fraction}`;
  const before = raw.slice(0, caret);
  const digitsBefore = (before.match(/\d/g) || []).length;
  let position = 0;
  let seen = 0;
  while (position < formatted.length && seen < digitsBefore) {
    if (/\d/.test(formatted[position])) seen++;
    position++;
  }
  if (decimalMark && before.includes(decimalMark)) position = Math.max(position, formatted.indexOf(',') + 1);
  return { value: formatted, caret: position };
}

export function formatSigned(cents = 0) {
  return `${cents < 0 ? '−' : ''}${formatMoney(Math.abs(cents))}`;
}

export function getTotals(lines) {
  return lines.reduce((sum, line) => ({
    debit: sum.debit + (line.debit || 0),
    credit: sum.credit + (line.credit || 0),
  }), { debit: 0, credit: 0 });
}

export function formatVoucherOption(voucher) {
  const [year, month, day] = voucher.date.split('-');
  const codes = side => [...new Set(voucher.lines
    .filter(line => line[side] > 0)
    .map(line => line.code))].join(',');
  const description = voucher.description?.trim() || 'Açıklama yok';
  const total = getTotals(voucher.lines).debit;
  return `${voucher.number} — ${day}.${month}.${year} — ${description} (B: ${codes('debit')} / A: ${codes('credit')}) (T: ${formatMoney(total)})`;
}

export function validateVoucher(voucher, accounts, vouchers = []) {
  const errors = [];
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(voucher.date || '');
  const date = dateMatch ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))) : null;
  if (!dateMatch || !date || date.getUTCFullYear() !== YEAR ||
      date.getUTCMonth() + 1 !== Number(dateMatch[2]) ||
      date.getUTCDate() !== Number(dateMatch[3])) errors.push(`Tarih ${YEAR} yılı içinde ve geçerli olmalı.`);
  if (!Number.isInteger(voucher.number) || voucher.number < 1) errors.push('Fiş numarası pozitif tam sayı olmalı.');
  if (vouchers.some(item => item.id !== voucher.id && item.number === voucher.number)) errors.push('Bu fiş numarası zaten kullanılıyor.');
  const codes = new Set(accounts.map(item => item.code));
  if (!voucher.lines?.length) errors.push('En az bir fiş satırı girin.');
  voucher.lines?.forEach((line, index) => {
    const row = index + 1;
    if (!codes.has(line.code)) errors.push(`${row}. satırda geçerli bir hesap seçin.`);
    if (!Number.isSafeInteger(line.debit) || line.debit < 0 ||
        !Number.isSafeInteger(line.credit) || line.credit < 0) errors.push(`${row}. satırda geçerli tutar girin.`);
    if (line.debit > 0 && line.credit > 0) errors.push(`${row}. satırda hem borç hem alacak olamaz.`);
    if (!line.debit && !line.credit) errors.push(`${row}. satırda borç veya alacak tutarı girin.`);
  });
  const totals = getTotals(voucher.lines || []);
  if (totals.debit !== totals.credit) errors.push('Borç ve alacak toplamları eşit olmalı.');
  if (!totals.debit) errors.push('Fiş toplamı sıfır olamaz.');
  return errors;
}

export function ledger(accounts, vouchers) {
  const rows = new Map(accounts.map(account => [account.code, {
    ...account, debit: 0, credit: 0, debitBalance: 0, creditBalance: 0,
  }]));
  for (const voucher of vouchers) {
    for (const line of voucher.lines) {
      const row = rows.get(line.code);
      if (!row) continue;
      row.debit += line.debit;
      row.credit += line.credit;
    }
  }
  for (const row of rows.values()) {
    const net = row.debit - row.credit;
    row.debitBalance = Math.max(net, 0);
    row.creditBalance = Math.max(-net, 0);
  }
  return [...rows.values()].sort((a, b) => a.code.localeCompare(b.code, 'tr'));
}

export function formatAccountBalance(account) {
  const amount = account.debitBalance || account.creditBalance || 0;
  if (!amount) return '';
  const side = account.debitBalance > 0 ? 'B' : 'A';
  return `${formatMoney(amount)} ${side}`;
}

export function trialBalance(accounts, vouchers) {
  const rows = ledger(accounts, vouchers)
    .filter(row => row.debit || row.credit)
    .map(row => ({ ...row, reverseBalance:
      (row.side === 'B' && row.creditBalance > 0) ||
      (row.side === 'A' && row.debitBalance > 0) }));
  const totals = rows.reduce((sum, row) => ({
    debit: sum.debit + row.debit,
    credit: sum.credit + row.credit,
    debitBalance: sum.debitBalance + row.debitBalance,
    creditBalance: sum.creditBalance + row.creditBalance,
  }), { debit: 0, credit: 0, debitBalance: 0, creditBalance: 0 });
  return { rows, totals };
}

export function accountStatement(vouchers, code) {
  let balance = 0;
  const entries = [];
  for (const voucher of [...vouchers].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)) {
    for (const line of voucher.lines) {
      if (line.code !== code || (!line.debit && !line.credit)) continue;
      balance += line.debit - line.credit;
      entries.push({
        id: voucher.id,
        date: voucher.date,
        number: voucher.number,
        description: line.description?.trim() || voucher.description || '',
        debit: line.debit,
        credit: line.credit,
        balance: Math.abs(balance),
        side: balance > 0 ? 'B' : balance < 0 ? 'A' : '—',
      });
    }
  }
  return entries;
}

export function journalEntries(accounts, vouchers) {
  const names = new Map(accounts.map(account => [account.code, account.name]));
  return [...vouchers]
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
    .map(voucher => ({
      id: voucher.id,
      number: voucher.number,
      date: voucher.date,
      description: voucher.description || '',
      lines: [...voucher.lines.filter(line => line.debit > 0),
        ...voucher.lines.filter(line => line.credit > 0)]
        .map(line => ({ ...line, name: names.get(line.code) || '' })),
    }));
}

export function generalLedger(accounts, vouchers) {
  const rows = new Map(accounts.map(account => [account.code, {
    code: account.code, name: account.name,
    debitEntries: [], creditEntries: [], debitTotal: 0, creditTotal: 0,
  }]));
  for (const voucher of [...vouchers].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)) {
    for (const line of voucher.lines) {
      const row = rows.get(line.code);
      if (!row) continue;
      if (line.debit > 0) {
        row.debitEntries.push({ voucherNumber: voucher.number, amount: line.debit });
        row.debitTotal += line.debit;
      }
      if (line.credit > 0) {
        row.creditEntries.push({ voucherNumber: voucher.number, amount: line.credit });
        row.creditTotal += line.credit;
      }
    }
  }
  return [...rows.values()]
    .filter(row => row.debitEntries.length || row.creditEntries.length)
    .map(row => ({ ...row,
      debitBalance: Math.max(row.debitTotal - row.creditTotal, 0),
      creditBalance: Math.max(row.creditTotal - row.debitTotal, 0),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'tr'));
}

export const INCOME_STAGES = [
  { prefixes: ['60', '61'], title: 'NET SATIŞLAR' },
  { prefixes: ['62'], title: 'BRÜT SATIŞ KÂRI VEYA ZARARI' },
  { prefixes: ['63'], title: 'FAALİYET KÂRI VEYA ZARARI' },
  { prefixes: ['64', '65', '66', '67', '68'], title: 'DÖNEM KÂRI VEYA ZARARI' },
  { prefixes: ['69'], title: 'DÖNEM NET KÂRI VEYA ZARARI' },
];

export function incomeStatement(accounts, vouchers) {
  const rows = ledger(accounts, vouchers).filter(row => row.code.startsWith('6') && (row.debit || row.credit))
    .map(row => ({ ...row, effect: row.credit - row.debit }));
  const showNetSales = rows.some(row => row.code === '600') &&
    rows.some(row => row.code >= '601' && row.code <= '612');
  let runningTotal = 0;
  const stages = INCOME_STAGES.map(stage => {
    const stageRows = rows.filter(row => stage.prefixes.some(prefix => row.code.startsWith(prefix)));
    runningTotal += stageRows.reduce((sum, row) => sum + row.effect, 0);
    return { title: stage.title, rows: stageRows, total: runningTotal };
  });
  return { rows, stages, result: runningTotal, showNetSales };
}

export function balanceSheet(accounts, vouchers) {
  const all = ledger(accounts, vouchers);
  const assets = all.filter(row => /^[12]/.test(row.code) && (row.debit || row.credit))
    .map(row => ({ ...row, value: row.debit - row.credit }));
  const liabilities = all.filter(row => /^[345]/.test(row.code) && (row.debit || row.credit))
    .map(row => ({ ...row, value: row.credit - row.debit }));
  const periodResult = incomeStatement(accounts, vouchers).result;
  const assetTotal = assets.reduce((sum, row) => sum + row.value, 0);
  const liabilityTotal = liabilities.reduce((sum, row) => sum + row.value, 0) + periodResult;
  const unclosed = all.filter(row => /^[789]/.test(row.code) && row.debit !== row.credit);
  return { assets, liabilities, assetTotal, liabilityTotal, periodResult,
    difference: assetTotal - liabilityTotal, unclosed };
}

export const BALANCE_CLASS_NAMES = {
  1: 'DÖNEN VARLIKLAR',
  2: 'DURAN VARLIKLAR',
  3: 'KISA VADELİ YABANCI KAYNAKLAR',
  4: 'UZUN VADELİ YABANCI KAYNAKLAR',
  5: 'ÖZKAYNAKLAR',
};

export const BALANCE_GROUP_NAMES = {
  10: 'HAZIR DEĞERLER', 11: 'MENKUL KIYMETLER', 12: 'TİCARİ ALACAKLAR',
  13: 'DİĞER ALACAKLAR', 15: 'STOKLAR',
  17: 'YILLARA YAYGIN İNŞAAT VE ONARIM MALİYETLERİ',
  18: 'GELECEK AYLARA AİT GİDERLER VE GELİR TAHAKKUKLARI', 19: 'DİĞER DÖNEN VARLIKLAR',
  22: 'TİCARİ ALACAKLAR', 23: 'DİĞER ALACAKLAR', 24: 'MALİ DURAN VARLIKLAR',
  25: 'MADDİ DURAN VARLIKLAR', 26: 'MADDİ OLMAYAN DURAN VARLIKLAR',
  27: 'ÖZEL TÜKENMEYE TABİ VARLIKLAR',
  28: 'GELECEK YILLARA AİT GİDERLER VE GELİR TAHAKKUKLARI', 29: 'DİĞER DURAN VARLIKLAR',
  30: 'MALİ BORÇLAR', 32: 'TİCARİ BORÇLAR', 33: 'DİĞER BORÇLAR',
  34: 'ALINAN AVANSLAR', 35: 'YILLARA YAYGIN İNŞAAT VE ONARIM HAKEDİŞLERİ',
  36: 'ÖDENECEK VERGİ VE DİĞER YÜKÜMLÜLÜKLER', 37: 'BORÇ VE GİDER KARŞILIKLARI',
  38: 'GELECEK AYLARA AİT GELİRLER VE GİDER TAHAKKUKLARI',
  39: 'DİĞER KISA VADELİ YABANCI KAYNAKLAR',
  40: 'MALİ BORÇLAR', 42: 'TİCARİ BORÇLAR', 43: 'DİĞER BORÇLAR',
  44: 'ALINAN AVANSLAR', 47: 'BORÇ VE GİDER KARŞILIKLARI',
  48: 'GELECEK YILLARA AİT GELİRLER VE GİDER TAHAKKUKLARI',
  49: 'DİĞER UZUN VADELİ YABANCI KAYNAKLAR',
  50: 'ÖDENMİŞ SERMAYE', 52: 'SERMAYE YEDEKLERİ', 54: 'KÂR YEDEKLERİ',
  57: 'GEÇMİŞ YILLAR KÂRLARI', 58: 'GEÇMİŞ YILLAR ZARARLARI',
  59: 'DÖNEM NET KÂRI (ZARARI)',
};

export function groupedBalanceSheet(report) {
  const classes = new Map();
  const add = row => {
    const classCode = row.code.slice(0, 1);
    const groupCode = row.code.slice(0, 2);
    if (!classes.has(classCode)) classes.set(classCode, new Map());
    const groups = classes.get(classCode);
    if (!groups.has(groupCode)) groups.set(groupCode, []);
    groups.get(groupCode).push(row);
  };
  [...report.assets, ...report.liabilities].forEach(add);
  if (report.periodResult) add({ code: '59', name: 'Hesaplanan dönem kârı / zararı',
    value: report.periodResult, synthetic: true });
  return Object.keys(BALANCE_CLASS_NAMES).map(code => {
    const groups = [...(classes.get(code) || new Map())].sort(([a], [b]) => a.localeCompare(b))
      .map(([groupCode, rows]) => ({ code: groupCode,
        name: BALANCE_GROUP_NAMES[groupCode] || 'DİĞER HESAPLAR',
        rows, total: rows.reduce((sum, row) => sum + row.value, 0) }));
    return { code, name: BALANCE_CLASS_NAMES[code], groups,
      total: groups.reduce((sum, group) => sum + group.total, 0) };
  }).filter(group => group.groups.length);
}
