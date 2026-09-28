export function paginateJournalEntries(entries, measure, columnHeight, gap) {
  const pages = [];
  let page = null;
  let column = 0;
  let usedHeight = 0;

  const startPage = () => {
    page = { columns: [[], []] };
    pages.push(page);
    column = 0;
    usedHeight = 0;
  };

  for (const entry of entries) {
    const height = measure(entry, false);
    if (!Number.isFinite(height) || height <= 0)
      throw new Error('Yevmiye kaydının baskı ölçüsü alınamadı.');

    if (height > columnHeight) {
      const wideHeight = measure(entry, true);
      if (!Number.isFinite(wideHeight) || wideHeight > columnHeight)
        throw new Error(`${entry.number} numaralı fiş bölünmeden bir A4 sayfasına sığmıyor.`);
      pages.push({ single: entry });
      page = null;
      continue;
    }

    if (!page) startPage();
    const hasEntries = page.columns[column].length > 0;
    if (usedHeight + (hasEntries ? gap : 0) + height > columnHeight) {
      if (column === 0) {
        column = 1;
        usedHeight = 0;
      } else startPage();
    }
    usedHeight += (page.columns[column].length ? gap : 0) + height;
    page.columns[column].push(entry);
  }

  let debitTotal = 0;
  let creditTotal = 0;
  for (const currentPage of pages) {
    const pageEntries = currentPage.single ? [currentPage.single] :
      [...currentPage.columns[0], ...currentPage.columns[1]];
    for (const entry of pageEntries) {
      for (const line of entry.lines || []) {
        debitTotal += line.debit;
        creditTotal += line.credit;
      }
    }
    currentPage.debitTotal = debitTotal;
    currentPage.creditTotal = creditTotal;
  }
  return pages;
}

export function paginateJournalSingleColumn(entries, measure, contentHeight, gap) {
  const pages = [];
  let current = [];
  let usedHeight = 0;
  let debitTotal = 0;
  let creditTotal = 0;

  const finishPage = () => {
    if (!current.length) return;
    for (const entry of current) {
      for (const line of entry.lines) {
        debitTotal += line.debit;
        creditTotal += line.credit;
      }
    }
    pages.push({ entries: current, debitTotal, creditTotal });
    current = [];
    usedHeight = 0;
  };

  for (const entry of entries) {
    const height = measure(entry);
    if (!Number.isFinite(height) || height <= 0)
      throw new Error('Yevmiye kaydının baskı ölçüsü alınamadı.');
    if (height > contentHeight)
      throw new Error(`${entry.number} numaralı fiş toplam satırıyla birlikte bir A4 sayfasına sığmıyor.`);
    if (current.length && usedHeight + gap + height > contentHeight) finishPage();
    usedHeight += (current.length ? gap : 0) + height;
    current.push(entry);
  }
  finishPage();
  return pages;
}
