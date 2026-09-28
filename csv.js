export function parseCsv(text) {
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value.trim())) records.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV içinde kapanmamış tırnak işareti var.');
  if (field || row.length) { row.push(field); records.push(row); }
  return records;
}

export function parseAccountPlan(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Dosya boş.');
  const header = rows.shift().map(value => value.trim());
  const codeIndex = header.indexOf('Hesap Kodu');
  const nameIndex = header.indexOf('Hesap Adı');
  const sideIndex = header.indexOf('Taraf');
  if ([codeIndex, nameIndex, sideIndex].includes(-1))
    throw new Error('CSV dosyasında Hesap Kodu, Hesap Adı ve Taraf başlıkları bulunmalı.');
  const seen = new Set();
  const accounts = rows.map((row, index) => {
    const code = (row[codeIndex] || '').trim();
    const name = (row[nameIndex] || '').trim();
    const side = (row[sideIndex] || '').trim().toUpperCase();
    if (!/^\d{3}$/.test(code)) throw new Error(`${index + 2}. satırda hesap kodu üç haneli olmalı.`);
    if (!name) throw new Error(`${index + 2}. satırda hesap adı boş olamaz.`);
    if (!['B', 'A'].includes(side)) throw new Error(`${index + 2}. satırda Taraf B veya A olmalı.`);
    if (seen.has(code)) throw new Error(`${code} hesabı dosyada birden fazla kez var.`);
    seen.add(code);
    return { code, name, side };
  });
  if (!accounts.length) throw new Error('Dosyada hesap bulunamadı.');
  return accounts.sort((a, b) => a.code.localeCompare(b.code, 'tr'));
}

export function validateAccountReplacement(accounts, vouchers) {
  const codes = new Set(accounts.map(item => item.code));
  const missing = [...new Set(vouchers.flatMap(voucher => voucher.lines.map(line => line.code)))].filter(code => !codes.has(code));
  if (missing.length) throw new Error(`Kayıtlı fişlerde kullanılan şu hesaplar yeni planda yok: ${missing.join(', ')}. Plan değiştirilmedi.`);
}
