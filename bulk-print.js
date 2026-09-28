export const BULK_PRINT_ITEMS = [
  { id: 'journal', label: 'Yevmiye Defteri' },
  { id: 'ledger', label: 'Büyük Defter' },
  { id: 'trial', label: 'Mizan' },
  { id: 'income', label: 'Gelir Tablosu' },
  { id: 'balance', label: 'Bilanço' },
];

export function planBulkPrint(selected, pairFinancialReports) {
  const ordered = BULK_PRINT_ITEMS.map(item => item.id).filter(id => selected.includes(id));
  const sections = [];
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index] === 'income' && ordered[index + 1] === 'balance' && pairFinancialReports) {
      sections.push(['income', 'balance']);
      index += 1;
    } else sections.push([ordered[index]]);
  }
  return sections;
}
