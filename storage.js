import { parseAccountPlan } from './csv.js';
import { validateVoucher } from './accounting.js';

const DB_NAME = 'mini-muhasebe-2026';
const DB_VERSION = 1;
const LOCAL_KEY = 'mini-muhasebe-2026-state';
const FILE_MODE = typeof location !== 'undefined' && location.protocol === 'file:';

export function displayBusinessTitle(state) {
  return typeof state?.businessTitle === 'string' && state.businessTitle.trim()
    ? state.businessTitle.trim() : 'muhasebe.info';
}

export function withoutVouchers(state) {
  return { ...state, vouchers: [], nextNumber: 1 };
}

export function renumberVouchersByDate(state) {
  const vouchers = [...state.vouchers]
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
    .map((voucher, index) => ({ ...voucher, number: index + 1 }));
  return { ...state, vouchers, nextNumber: vouchers.length + 1 };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore('app');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readValue(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('app', 'readonly');
    const request = transaction.objectStore('app').get('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState() {
  if (FILE_MODE) {
    const saved = localStorage.getItem(LOCAL_KEY);
    if (saved) return validateBackup(JSON.parse(saved));
  }
  const db = FILE_MODE ? null : await openDatabase();
  try {
    const saved = db ? await readValue(db) : null;
    if (saved) return saved;
    let csv;
    if (typeof DEFAULT_ACCOUNT_CSV === 'string') csv = DEFAULT_ACCOUNT_CSV;
    else {
      const response = await fetch('./data/hesap-plani.csv');
      if (!response.ok) throw new Error('Başlangıç hesap planı yüklenemedi.');
      csv = await response.text();
    }
    const accounts = parseAccountPlan(csv);
    const state = { version: 1, year: 2026, accounts, vouchers: [], nextNumber: 1, businessTitle: '' };
    await saveState(state, db);
    return state;
  } finally { db?.close(); }
}

export async function saveState(state, existingDb) {
  if (FILE_MODE) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    return;
  }
  const db = existingDb || await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('app', 'readwrite');
      transaction.objectStore('app').put(state, 'state');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { if (!existingDb) db.close(); }
}

export function validateBackup(data) {
  if (!data || data.version !== 1 || data.year !== 2026 || !Array.isArray(data.accounts) ||
      !Array.isArray(data.vouchers) || !Number.isInteger(data.nextNumber) ||
      (data.businessTitle !== undefined && (typeof data.businessTitle !== 'string' || data.businessTitle.length > 100)))
    throw new Error('Yedek dosyası beklenen biçimde değil.');
  const codes = new Set();
  for (const account of data.accounts) {
    if (!/^\d{3}$/.test(account.code) || !account.name || !['A', 'B'].includes(account.side) || codes.has(account.code))
      throw new Error('Yedekte geçersiz veya yinelenen hesap var.');
    codes.add(account.code);
  }
  const numbers = new Set();
  for (const voucher of data.vouchers) {
    if (!voucher.id || !Number.isInteger(voucher.number) || numbers.has(voucher.number) ||
        !/^2026-\d{2}-\d{2}$/.test(voucher.date) || !Array.isArray(voucher.lines))
      throw new Error('Yedekte geçersiz fiş var.');
    numbers.add(voucher.number);
    for (const line of voucher.lines) {
      if (!codes.has(line.code) || !Number.isSafeInteger(line.debit) || line.debit < 0 ||
          !Number.isSafeInteger(line.credit) || line.credit < 0)
        throw new Error('Yedekte geçersiz fiş satırı var.');
    }
    if (validateVoucher(voucher, data.accounts).length)
      throw new Error(`${voucher.number} numaralı fiş yedekte geçersiz veya dengesiz.`);
  }
  return data;
}
