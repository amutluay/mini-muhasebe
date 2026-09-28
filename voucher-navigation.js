export const VOUCHER_FIELDS = ['code', 'debit', 'credit', 'quantity', 'description'];

export function matchingVoucherAccounts(accounts, query) {
  const term = query.trim().toLocaleLowerCase('tr-TR');
  if (!term) return [];
  const codePrefix = /^\d+/.exec(term)?.[0];
  return accounts.filter(account => codePrefix
    ? account.code.startsWith(codePrefix)
    : account.name.toLocaleLowerCase('tr-TR').includes(term));
}

export function adjacentVoucherCell(rowIndex, field, direction, rowCount) {
  const column = VOUCHER_FIELDS.indexOf(field);
  if (column < 0 || rowIndex < 0 || rowIndex >= rowCount) return null;
  const nextRow = rowIndex + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
  const nextColumn = column + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0);
  if (nextRow < 0 || nextRow >= rowCount || nextColumn < 0 || nextColumn >= VOUCHER_FIELDS.length)
    return null;
  return { rowIndex: nextRow, field: VOUCHER_FIELDS[nextColumn] };
}
