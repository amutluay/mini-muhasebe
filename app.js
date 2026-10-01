import { YEAR, parseMoney, formatMoney, formatMoneyEntry, formatSigned, formatVoucherOption, createVatLine, validateVoucher,
  trialBalance, ledger, formatAccountBalance, accountStatement, journalEntries, generalLedger, incomeStatement, balanceSheet,
  groupedBalanceSheet } from './accounting.js';
import { parseAccountPlan, validateAccountReplacement } from './csv.js';
import { loadState, saveState, validateBackup, withoutVouchers, renumberVouchersByDate, displayBusinessTitle } from './storage.js';
import { TEMPLATES, createTemplateVoucher, createTemplateSequence, templateEndDate } from './templates.js';
import { paginateJournalEntries, paginateJournalSingleColumn } from './journal-print.js';
import { VOUCHER_FIELDS, matchingVoucherAccounts, adjacentVoucherCell } from './voucher-navigation.js';
import { BULK_PRINT_ITEMS, planBulkPrint } from './bulk-print.js';

const app = document.querySelector('#app');
let state;
let draft;
let activeTab = 'voucher';
let dirty = false;
let saving = false;
let applyingAllTemplates = false;
let editingSaved = false;
let settingsOpen = false;
let showJournalLineDescriptions = false;
let showBalanceGroups = false;
let selectedStatementCode = '';
let noticeTimer;
let printingJournal = false;
let accountPicker = null;
let balanceLabelsState = null;
let balanceLabels = null;
const bulkPrintSelections = new Set();

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const blankLine = (description = '') => ({ code: '', debit: '', credit: '', quantity: '', description });
const todayInYear = () => {
  const now = new Date();
  return now.getFullYear() === YEAR ? `${YEAR}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` : `${YEAR}-01-01`;
};
const templateSelections = new Set(TEMPLATES.map(template => template.id));
let templateStartDate = todayInYear();
const nextNumber = () => Math.max(state.nextNumber, ...state.vouchers.map(item => item.number + 1), 1);
const freshDraft = () => ({ id: null, number: nextNumber(), date: todayInYear(), description: '', lines: [blankLine(), blankLine()] });
const accountName = code => state.accounts.find(item => item.code === code)?.name || '';
const sortedVouchers = () => [...state.vouchers].sort((a, b) => a.number - b.number);

function savedAccountBalanceLabels() {
  if (balanceLabelsState !== state) {
    balanceLabels = new Map(ledger(state.accounts, state.vouchers)
      .map(account => [account.code, formatAccountBalance(account)]));
    balanceLabelsState = state;
  }
  return balanceLabels;
}

function draftFromVoucher(voucher) {
  return { ...voucher, lines: voucher.lines.map(line => ({
    code: line.code, debit: line.debit ? formatMoney(line.debit) : '',
    credit: line.credit ? formatMoney(line.credit) : '',
    quantity: line.quantity || '', description: line.description || '',
  })) };
}

function notify(message, kind = 'info') {
  const element = document.querySelector('#notice');
  if (!element) return;
  element.textContent = message;
  element.className = `notice show ${kind}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => element.className = 'notice', 5500);
}

function confirmLeave() {
  return !dirty || window.confirm('Kaydedilmemiş değişiklikler var. Devam edilsin mi?');
}

function printBrandStyle(margin = '12mm 8mm 8mm') {
  const title = displayBusinessTitle(state).replace(/\s+/g, ' ').slice(0, 100);
  const content = JSON.stringify(title);
  return `@page { size: A4 portrait; margin: ${margin}; @top-right { content: ${content}; color: #344a68; font: 8pt Arial, sans-serif; } }`;
}

function updatePrintBrand() {
  let style = document.querySelector('#print-brand-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'print-brand-style';
    document.head.append(style);
  }
  style.textContent = printBrandStyle();
}

function render() {
  accountPicker = null;
  updatePrintBrand();
  app.innerHTML = `
    <div class="app-shell" ${settingsOpen ? 'inert' : ''}>
      <header class="app-header">
        <div class="brand"><div class="brand-mark">M</div><div><strong>Mini Muhasebe</strong><span>${esc(displayBusinessTitle(state))} · ${YEAR}</span></div></div>
        <div class="header-actions"><span class="local-pill"><span></span> Bu tarayıcıda saklanır</span><button class="icon-button" data-action="settings" aria-label="Ayarlar" title="Ayarlar">⚙</button></div>
      </header>
      <nav class="tabs" aria-label="Ana menü">
        ${[['voucher', 'Fiş Girişi'], ['journal', 'Yevmiye Defteri'], ['ledger', 'Büyük Defter'], ['statement', 'Hesap Ekstresi'], ['trial', 'Mizan'], ['income', 'Gelir Tablosu'], ['balance', 'Bilanço'], ['accounts', 'Hesap Planı'], ['bulk-print', 'Toplu Yazdır'], ['template-apply', 'Şablon Uygula']].map(([id, title]) =>
          `<button class="tab ${activeTab === id ? 'active' : ''}" data-tab="${id}" ${activeTab === id ? 'aria-current="page"' : ''}>${title}</button>`).join('')}
      </nav>
      <main id="content">${renderContent()}</main>
      <footer class="app-footer"><span>2026 hesap yılı · Eğitim amaçlı</span><span>Veriler yalnızca bu tarayıcıda tutulur</span></footer>
    </div>
    ${settingsOpen ? renderSettings() : ''}
    <div id="notice" class="notice" role="status" aria-live="polite"></div>
    <input type="file" id="account-upload" accept=".csv,text/csv" hidden />
    <input type="file" id="backup-upload" accept=".json,application/json" hidden />
  `;
  const allTemplates = app.querySelector('#template-select-all');
  if (allTemplates) allTemplates.indeterminate = templateSelections.size > 0 && templateSelections.size < TEMPLATES.length;
}

function renderSettings() {
  return `<div class="settings-overlay"><section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="settings-heading"><div><span class="eyebrow">VERİ YÖNETİMİ</span><h2 id="settings-title">Ayarlar</h2></div><button id="settings-close" class="icon-button" data-action="close-settings" aria-label="Ayarları kapat">×</button></div>
    <p>Fişler ve hesap planı bu tarayıcıda saklanır. Verilerinizi dosya olarak yedekleyebilirsiniz.</p>
    <div class="settings-business"><label class="field" for="business-title"><span>İşletme Ünvanı</span><input id="business-title" type="text" maxlength="100" value="${esc(state.businessTitle || '')}" placeholder="muhasebe.info" /></label><button class="button primary" data-action="save-business-title">Kaydet</button></div>
    <div class="settings-actions"><button class="button" data-action="export-backup">Yedek İndir</button><button class="button" data-action="upload-backup">Yedekten Geri Yükle</button></div>
    <div class="settings-sort"><strong>Fişleri sırala</strong><p>Fişler tarihe göre, aynı tarihte eski fiş numarasına göre sıralanır ve 1’den başlayarak yeniden numaralandırılır.</p><button class="button" data-action="sort-vouchers" ${state.vouchers.length ? '' : 'disabled'}>Fişleri Sırala</button></div>
    <div class="settings-danger"><strong>Tüm fişleri sil</strong><p>${state.vouchers.length} kayıtlı fiş silinir. Hesap planı korunur ve fiş numarası yeniden 1’den başlar.</p><button class="button danger" data-action="delete-all-vouchers" ${state.vouchers.length ? '' : 'disabled'}>Tüm Fişleri Sil</button></div>
  </section></div>`;
}

function renderContent() {
  if (activeTab === 'voucher') return renderVoucher();
  if (activeTab === 'journal') return renderJournal();
  if (activeTab === 'ledger') return renderLedger();
  if (activeTab === 'statement') return renderStatement();
  if (activeTab === 'trial') return renderTrial();
  if (activeTab === 'income') return renderIncome();
  if (activeTab === 'balance') return renderBalance();
  if (activeTab === 'accounts') return renderAccounts();
  if (activeTab === 'bulk-print') return renderBulkPrint();
  return renderTemplateApply();
}

function renderBulkPrint() {
  return `<section class="panel report-panel bulk-print-panel"><div class="section-heading"><div><span class="eyebrow">RAPORLAR</span><h1>Toplu Yazdır</h1><p>Yazdırılacak raporları seçin. Çıktı A4 dikey sayfalarda, aşağıdaki sırayla hazırlanır.</p></div></div><div class="bulk-print-options">${BULK_PRINT_ITEMS.map((item, index) => `<label class="bulk-print-option"><input type="checkbox" data-bulk-print="${item.id}" ${bulkPrintSelections.has(item.id) ? 'checked' : ''} /><span><strong>${index + 1}. ${item.label}</strong>${item.id === 'journal' ? '<small>Yazdır2 düzeni kullanılır.</small>' : ''}</span></label>`).join('')}</div><p class="bulk-print-note">Gelir Tablosu ve Bilanço birlikte seçildiğinde, sığarlarsa aynı sayfaya yerleştirilir.</p><button class="button primary" data-action="print-selected-reports" ${bulkPrintSelections.size ? '' : 'disabled'}>Seçilenleri Yazdır</button></section>`;
}

function templateSelectionEndDate() {
  return templateEndDate(templateStartDate, templateSelections.size);
}

function templateSelectionValid() {
  const endDate = templateSelectionEndDate();
  return Boolean(endDate && templateStartDate.startsWith(`${YEAR}-`) && endDate.startsWith(`${YEAR}-`));
}

function renderTemplateApply() {
  const endDate = templateSelectionEndDate();
  return `<section class="panel report-panel template-apply-panel"><div class="section-heading"><div><span class="eyebrow">TOPLU FİŞ OLUŞTURMA</span><h1>Şablon Uygula</h1><p>Seçili şablonlar listedeki sırayla uygulanır; her fiş bir sonraki güne kaydedilir.</p></div></div><div class="template-apply-toolbar"><button class="button primary" data-action="apply-selected-templates" ${templateSelectionValid() ? '' : 'disabled'}>Uygula</button></div><div class="template-apply-dates"><label class="field"><span>Başlangıç Tarihi</span><input id="template-start-date" type="date" min="${YEAR}-01-01" max="${YEAR}-12-31" value="${esc(templateStartDate)}" /></label><label class="field"><span>Bitiş Tarihi</span><input id="template-end-date" type="date" value="${esc(endDate)}" disabled /></label></div><p id="template-date-note" class="template-date-note">${templateSelections.size ? endDate.startsWith(`${YEAR}-`) ? `${templateSelections.size} fiş ${journalDate(templateStartDate)}–${journalDate(endDate)} tarihlerine kaydedilecek.` : 'Seçilen fişler 2026 hesap yılını aşıyor. Başlangıç tarihini öne alın.' : 'Uygulamak için en az bir şablon seçin.'}</p><div class="template-select-all"><label><input id="template-select-all" type="checkbox" ${templateSelections.size === TEMPLATES.length ? 'checked' : ''} /> Tümünü Seç / Kaldır</label><span>${templateSelections.size} / ${TEMPLATES.length} seçili</span></div><div class="template-apply-list"><div class="template-apply-header"><span></span><span>Şablon</span><span>Açıklama</span></div>${TEMPLATES.map((template, index) => `<label class="template-apply-item"><input type="checkbox" data-template-id="${esc(template.id)}" ${templateSelections.has(template.id) ? 'checked' : ''} /><span class="template-apply-name">${index + 1}. ${esc(template.name)}</span><span class="template-apply-description">${esc(template.description)}</span></label>`).join('')}</div></section>`;
}

function updateTemplateApplyControls() {
  const endDate = templateSelectionEndDate();
  const endInput = app.querySelector('#template-end-date');
  if (!endInput) return;
  endInput.value = endDate;
  const valid = templateSelectionValid();
  app.querySelector('[data-action="apply-selected-templates"]').disabled = !valid;
  const note = app.querySelector('#template-date-note');
  note.textContent = !templateSelections.size ? 'Uygulamak için en az bir şablon seçin.'
    : !valid ? 'Seçilen fişler 2026 hesap yılını aşıyor veya başlangıç tarihi geçersiz.'
      : `${templateSelections.size} fiş ${journalDate(templateStartDate)}–${journalDate(endDate)} tarihlerine kaydedilecek.`;
  const all = app.querySelector('#template-select-all');
  all.checked = templateSelections.size === TEMPLATES.length;
  all.indeterminate = templateSelections.size > 0 && templateSelections.size < TEMPLATES.length;
  app.querySelector('.template-select-all span').textContent = `${templateSelections.size} / ${TEMPLATES.length} seçili`;
}

function renderVoucher() {
  const options = sortedVouchers().reverse();
  const totals = rawTotals();
  const locked = Boolean(draft.id && !editingSaved);
  const inputDisabled = locked ? 'disabled' : '';
  return `<section class="panel voucher-panel">
    <div class="section-heading"><div><span class="eyebrow">YEVMİYE KAYDI</span><h1>Fiş Girişi</h1><p>Borç ve alacak satırlarını girip fişi kaydedin.</p></div><button class="button quiet" data-action="settings">Ayarlar</button></div>
    <div class="voucher-meta">
      <label class="field"><span>Tarih</span><input id="voucher-date" type="date" min="${YEAR}-01-01" max="${YEAR}-12-31" value="${esc(draft.date)}" ${inputDisabled} /></label>
      <label class="field"><span>Fiş No</span><input id="voucher-number" type="text" value="${esc(draft.number)}" title="Fiş numarası sistem tarafından atanır" readonly aria-readonly="true" /></label>
      <label class="field description-field"><span>Fiş Açıklaması</span><input id="voucher-description" maxlength="250" placeholder="Fiş açıklaması" value="${esc(draft.description)}" ${inputDisabled} /></label>
    </div>
    <div class="list-toolbar"><div class="field compact"><select id="voucher-select" aria-label="Kayıtlı fişler"><option value="">Kayıtlı Fişler (${options.length})</option>${options.map(item => `<option value="${esc(item.id)}" ${draft.id === item.id ? 'selected' : ''}>${esc(formatVoucherOption(item))}</option>`).join('')}</select></div><div class="toolbar-actions"><button class="button primary" data-action="edit" ${!draft.id || editingSaved ? 'disabled' : ''}>Fişi Güncelle</button><button class="button" data-action="previous">← Önceki Fiş</button><button class="button" data-action="next">Sonraki Fiş →</button><button class="button" data-tab="accounts">Hesap Planı</button></div></div>
    <div class="table-scroll"><table class="entry-table"><thead><tr><th>Hesap Kodu ve Adı</th><th>Borç</th><th>Alacak</th><th>Miktar</th><th>Açıklama</th><th>KDV Ekle</th><th>Sil</th><th>Ekle</th></tr></thead><tbody id="entry-body">${draft.lines.map((line, index) => rowHtml(line, index, locked)).join('')}</tbody><tfoot><tr><th>TOPLAM</th><th id="total-debit">${formatMoney(totals.debit)}</th><th id="total-credit">${formatMoney(totals.credit)}</th><th colspan="5"><span id="balance-indicator" class="balance-indicator ${totals.debit === totals.credit ? 'balanced' : 'unbalanced'}">${totals.debit === totals.credit ? 'Dengede' : `Fark: ${formatMoney(Math.abs(totals.debit - totals.credit))}`}</span></th></tr></tfoot></table></div>
    <div id="account-suggestions" class="account-suggestions" role="listbox" hidden></div>
    <div class="voucher-bottom"><div class="toolbar-actions"><button class="button primary" data-action="save" ${inputDisabled}>Kaydet</button><button class="button" data-action="balance-voucher" ${inputDisabled}>Fişi Dengele</button><button class="button" data-action="new">Yeni</button><button class="button danger" data-action="delete" ${draft.id ? '' : 'disabled'}>Sil</button></div><div class="toolbar-actions"><button class="button" data-action="apply-all-templates">Tüm Şablonu Uygula</button><select id="template-select" class="template-select" aria-label="Şablon seç"><option value="">(Şablon seçin)</option>${TEMPLATES.map(template => `<option value="${esc(template.id)}">${esc(template.name)}</option>`).join('')}</select></div></div>
    <div id="save-status" class="save-status" role="status" aria-live="polite" hidden>Fişiniz kaydediliyor...</div>
  </section>`;
}

function rowHtml(line, index, locked = false) {
  const title = line.code && accountName(line.code) ? `${line.code} — ${accountName(line.code)}` : line.code || '';
  const disabled = locked ? 'disabled' : '';
  return `<tr data-row="${index}"><td class="account-cell"><input class="cell-input account-input" data-field="code" value="${esc(title)}" placeholder="Hesap kodu veya adı" aria-label="${index + 1}. satır hesap" role="combobox" aria-autocomplete="list" aria-controls="account-suggestions" aria-expanded="false" autocomplete="off" ${disabled} /><small class="account-hint">${esc(accountName(line.code))}</small></td>
    <td><input class="cell-input money-input" data-field="debit" inputmode="decimal" value="${esc(line.debit)}" placeholder="0,00" aria-label="${index + 1}. satır borç" ${disabled} /></td>
    <td><input class="cell-input money-input" data-field="credit" inputmode="decimal" value="${esc(line.credit)}" placeholder="0,00" aria-label="${index + 1}. satır alacak" ${disabled} /></td>
    <td><input class="cell-input qty-input" data-field="quantity" inputmode="decimal" value="${esc(line.quantity)}" placeholder="—" aria-label="${index + 1}. satır miktar" ${disabled} /></td>
    <td><input class="cell-input" data-field="description" value="${esc(line.description)}" placeholder="Açıklama" aria-label="${index + 1}. satır açıklama" ${disabled} /></td>
    <td class="vat-cell"><div class="vat-buttons">${[1, 10, 20].map(rate => `<button class="mini-button vat-button" data-action="add-vat" data-index="${index}" data-rate="${rate}" aria-label="${index + 1}. satıra %${rate} KDV ekle" title="%${rate} KDV ekle" ${disabled}>%${rate}</button>`).join('')}</div></td>
    <td><button class="mini-button" data-action="remove-row" data-index="${index}" aria-label="${index + 1}. satırı sil" ${disabled}>Sil</button></td>
    <td><button class="mini-button" data-action="add-row" data-index="${index}" aria-label="${index + 1}. satırdan sonra ekle" ${disabled}>+Satır</button></td></tr>`;
}

function focusVoucherField(rowIndex, field) {
  const input = app.querySelector(`#entry-body tr[data-row="${rowIndex}"] [data-field="${field}"]`);
  if (input && !input.disabled) input.focus();
}

function closeAccountSuggestions() {
  const menu = app.querySelector('#account-suggestions');
  if (menu) { menu.hidden = true; menu.innerHTML = ''; }
  accountPicker?.input?.setAttribute('aria-expanded', 'false');
  accountPicker?.input?.removeAttribute('aria-activedescendant');
}

function drawAccountSuggestions() {
  if (!accountPicker?.input.isConnected) return;
  const { input } = accountPicker;
  const menu = app.querySelector('#account-suggestions');
  const matches = matchingVoucherAccounts(state.accounts, input.value).slice(0, 50);
  accountPicker.matches = matches;
  accountPicker.activeIndex = matches.length ? Math.min(Math.max(accountPicker.activeIndex, 0), matches.length - 1) : -1;
  if (!matches.length) { closeAccountSuggestions(); return; }
  const balances = savedAccountBalanceLabels();
  menu.innerHTML = matches.map((account, index) => {
    const balance = balances.get(account.code);
    return `<button type="button" class="account-suggestion ${index === accountPicker.activeIndex ? 'active' : ''}" role="option" id="account-option-${index}" aria-selected="${index === accountPicker.activeIndex}" data-account-code="${esc(account.code)}">${esc(account.code)} ${esc(account.name)}${balance ? ` (${esc(balance)})` : ''}</button>`;
  }).join('');
  const rect = input.getBoundingClientRect();
  const width = Math.max(rect.width, 250);
  menu.style.width = `${Math.min(width, window.innerWidth - 16)}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  const menuHeight = Math.min(matches.length * 35, 230);
  menu.style.top = `${window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight
    ? rect.top - menuHeight - 2 : rect.bottom + 2}px`;
  menu.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', `account-option-${accountPicker.activeIndex}`);
}

function chooseAccount(account) {
  if (!accountPicker || !account) return false;
  const { input, rowIndex } = accountPicker;
  draft.lines[rowIndex].code = account.code;
  input.value = `${account.code} — ${account.name}`;
  input.closest('td').querySelector('.account-hint').textContent = account.name;
  dirty = true;
  closeAccountSuggestions();
  focusVoucherField(rowIndex, 'debit');
  return true;
}

function chooseCurrentAccount() {
  if (!accountPicker) return false;
  const { input, matches, activeIndex } = accountPicker;
  if (!input.value.trim()) {
    const rowIndex = accountPicker.rowIndex;
    closeAccountSuggestions();
    focusVoucherField(rowIndex, 'debit');
    return true;
  }
  const exact = state.accounts.find(account => account.code === input.value.trim() ||
    account.name.toLocaleLowerCase('tr-TR') === input.value.trim().toLocaleLowerCase('tr-TR'));
  return chooseAccount(exact || matches[activeIndex] || (matches.length === 1 ? matches[0] : null));
}

function restoreAccountSelection() {
  if (!accountPicker) return;
  const { input, rowIndex, previousCode, previousValue, previousDirty } = accountPicker;
  draft.lines[rowIndex].code = previousCode;
  input.value = previousValue;
  input.closest('td').querySelector('.account-hint').textContent = accountName(previousCode);
  dirty = previousDirty;
  closeAccountSuggestions();
  accountPicker = null;
}

function rawTotals() {
  return draft.lines.reduce((sum, line) => ({
    debit: sum.debit + (parseMoney(line.debit) || 0),
    credit: sum.credit + (parseMoney(line.credit) || 0),
  }), { debit: 0, credit: 0 });
}

function updateTotals() {
  const totals = rawTotals();
  const debit = document.querySelector('#total-debit');
  if (!debit) return;
  debit.textContent = formatMoney(totals.debit);
  document.querySelector('#total-credit').textContent = formatMoney(totals.credit);
  const indicator = document.querySelector('#balance-indicator');
  indicator.textContent = totals.debit === totals.credit ? 'Dengede' : `Fark: ${formatMoney(Math.abs(totals.debit - totals.credit))}`;
  indicator.className = `balance-indicator ${totals.debit === totals.credit ? 'balanced' : 'unbalanced'}`;
}

function reportHeading(title, subtitle) {
  return `<div class="section-heading report-heading"><div><span class="eyebrow">${YEAR} HESAP YILI</span><h1>${title}</h1><p>${subtitle}</p></div><button class="button" data-action="print-report">Yazdır</button></div>`;
}

function emptyReport() {
  return '<div class="empty-state"><div class="empty-icon">∑</div><h2>Henüz kayıt yok</h2><p>İlk fişi kaydettiğinizde bu rapor otomatik oluşacak.</p><button class="button primary" data-tab="voucher">Fiş Girişine Git</button></div>';
}

function journalDate(date) {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

function journalCard(entry) {
  return `<article class="journal-entry" data-voucher-id="${esc(entry.id)}" title="${entry.number} numaralı fişi açmak için çift tıklayın"><table class="journal-table"><thead><tr><th><div class="journal-meta"><span>Fiş No: ${String(entry.number).padStart(4, '0')}</span><span>Tarih: <time datetime="${esc(entry.date)}">${journalDate(entry.date)}</time></span></div></th><th>Borç</th><th>Alacak</th></tr></thead><tbody>${entry.lines.map(line => `<tr><td class="journal-account ${line.credit > 0 ? 'credit' : ''}"><span class="code">${esc(line.code)}</span> ${esc(line.name)}${line.description?.trim() ? `<span class="journal-line-description" ${showJournalLineDescriptions ? '' : 'hidden'}> (${esc(line.description.trim())})</span>` : ''}</td><td class="num">${line.debit ? formatMoney(line.debit) : ''}</td><td class="num">${line.credit ? formatMoney(line.credit) : ''}</td></tr>`).join('')}</tbody></table><div class="journal-description"><strong>Açıklama:</strong><span>${esc(entry.description || '—')}</span></div></article>`;
}

function renderJournal() {
  const entries = journalEntries(state.accounts, state.vouchers);
  return `<section class="panel report-panel journal-panel"><div class="section-heading report-heading"><div><span class="eyebrow">${YEAR} HESAP YILI</span><h1>Yevmiye Defteri</h1><p>Kayıtlı fişler tarih ve fiş numarasına göre sıralanır. Fişi açmak için kayda çift tıklayın.</p></div><div class="journal-heading-actions"><label class="journal-toggle"><input id="journal-line-descriptions" type="checkbox" ${showJournalLineDescriptions ? 'checked' : ''} />Satır Açıklaması Göster</label><button class="button" data-action="print-journal-one">Yazdır1</button><button class="button" data-action="print-journal-two">Yazdır2</button></div></div>${entries.length ? `<div class="journal-scroll"><div class="journal-list">${entries.map(journalCard).join('')}</div></div>` : emptyReport()}</section>`;
}

function journalPrintCard(entry, fullWidth = false) {
  return `<article class="journal-print-card ${fullWidth ? 'journal-print-one-card' : ''}"><div class="journal-print-meta"><span>Fiş No: ${String(entry.number).padStart(4, '0')}</span><span>Tarih: ${journalDate(entry.date)}</span></div><table class="journal-print-table"><thead><tr><th>Hesap</th><th>Borç</th><th>Alacak</th></tr></thead><tbody>${entry.lines.map(line => `<tr><td class="${line.credit > 0 ? 'journal-print-credit-account' : ''}"><strong>${esc(line.code)}</strong> ${esc(line.name)}${showJournalLineDescriptions && line.description?.trim() ? `<span class="journal-print-line-description">${esc(line.description.trim())}</span>` : ''}</td><td class="num">${line.debit ? formatMoney(line.debit) : ''}</td><td class="num">${line.credit ? formatMoney(line.credit) : ''}</td></tr>`).join('')}</tbody></table><div class="journal-print-description"><strong>Açıklama:</strong> ${esc(entry.description || '—')}</div></article>`;
}

function journalTwoPagesHtml(pages) {
  return pages.map(page => page.single
    ? `<section class="journal-print-page single"><div class="journal-print-column">${journalPrintCard(page.single, true)}</div><div class="journal-print-two-total single"><strong>DEVREDEN DAHİL TOPLAM</strong><strong class="num">${formatMoney(page.debitTotal)}</strong><strong class="num">${formatMoney(page.creditTotal)}</strong></div></section>`
    : `<section class="journal-print-page"><div class="journal-print-column">${page.columns[0].map(entry => journalPrintCard(entry)).join('')}</div><div class="journal-print-column">${page.columns[1].map(entry => journalPrintCard(entry)).join('')}</div><div class="journal-print-two-total"><strong>DEVREDEN DAHİL TOPLAM</strong><div class="journal-print-two-values"><span></span><strong class="num">${formatMoney(page.debitTotal)}</strong><strong class="num">${formatMoney(page.creditTotal)}</strong></div></div></section>`).join('');
}

async function printJournalLayout(twoColumns) {
  if (printingJournal) return;
  const entries = journalEntries(state.accounts, state.vouchers);
  if (!entries.length) { notify('Yazdırılacak yevmiye kaydı yok.'); return; }
  printingJournal = true;
  const measureRoot = document.createElement('div');
  measureRoot.className = 'journal-print-measure';
  const printRoot = document.createElement('div');
  printRoot.id = twoColumns ? 'journal-two-column-layout' : 'journal-one-column-layout';
  const pageStyle = document.createElement('style');
  pageStyle.textContent = printBrandStyle('8mm');
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    measureRoot.remove();
    printRoot.remove();
    pageStyle.remove();
    document.body.classList.remove('journal-two-column-print');
    document.body.classList.remove('journal-one-column-print');
    printingJournal = false;
  };
  try {
    document.body.append(measureRoot);
    if (document.fonts?.ready) await document.fonts.ready;
    const ruler = document.createElement('div');
    ruler.style.height = '260mm';
    measureRoot.append(ruler);
    const contentHeight = ruler.getBoundingClientRect().height;
    ruler.style.height = '3mm';
    const gap = ruler.getBoundingClientRect().height;
    ruler.remove();
    const measure = (entry, wide) => {
      measureRoot.style.width = !twoColumns || wide ? '194mm' : '94mm';
      measureRoot.innerHTML = journalPrintCard(entry, !twoColumns || wide);
      return measureRoot.firstElementChild.getBoundingClientRect().height;
    };
    if (twoColumns) {
      const pages = paginateJournalEntries(entries, measure, contentHeight, gap);
      printRoot.innerHTML = journalTwoPagesHtml(pages);
    } else {
      const pages = paginateJournalSingleColumn(entries, measure, contentHeight, gap);
      printRoot.innerHTML = pages.map(page => `<section class="journal-print-one-page"><div class="journal-print-one-content">${page.entries.map(entry => journalPrintCard(entry, true)).join('')}</div><div class="journal-print-one-total"><strong>DEVREDEN DAHİL TOPLAM</strong><strong class="num">${formatMoney(page.debitTotal)}</strong><strong class="num">${formatMoney(page.creditTotal)}</strong></div></section>`).join('');
    }
    measureRoot.remove();
    document.body.append(printRoot);
    document.head.append(pageStyle);
    document.body.classList.add(twoColumns ? 'journal-two-column-print' : 'journal-one-column-print');
    window.addEventListener('afterprint', cleanup);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function bulkJournalHtml() {
  const entries = journalEntries(state.accounts, state.vouchers);
  if (!entries.length) return `<div class="bulk-print-report">${renderJournal()}</div>`;
  const measureRoot = document.createElement('div');
  measureRoot.className = 'journal-print-measure';
  document.body.append(measureRoot);
  try {
    const ruler = document.createElement('div');
    ruler.style.height = '260mm';
    measureRoot.append(ruler);
    const contentHeight = ruler.getBoundingClientRect().height;
    ruler.style.height = '3mm';
    const gap = ruler.getBoundingClientRect().height;
    ruler.remove();
    const measure = (entry, wide) => {
      measureRoot.style.width = wide ? '194mm' : '94mm';
      measureRoot.innerHTML = journalPrintCard(entry, wide);
      return measureRoot.firstElementChild.getBoundingClientRect().height;
    };
    const pages = paginateJournalEntries(entries, measure, contentHeight, gap);
    return `<div class="bulk-journal">${journalTwoPagesHtml(pages)}</div>`;
  } finally { measureRoot.remove(); }
}

async function printSelectedReports() {
  if (printingJournal || !bulkPrintSelections.size) return;
  printingJournal = true;
  const printRoot = document.createElement('div');
  printRoot.id = 'bulk-print-layout';
  const pageStyle = document.createElement('style');
  pageStyle.textContent = printBrandStyle('8mm');
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    printRoot.remove();
    pageStyle.remove();
    document.body.classList.remove('bulk-print');
    printingJournal = false;
  };
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const reportHtml = {
      ledger: renderLedger(), trial: renderTrial(), income: renderIncome(), balance: renderBalance(),
    };
    let pairFinancialReports = false;
    if (bulkPrintSelections.has('income') && bulkPrintSelections.has('balance')) {
      const measureRoot = document.createElement('div');
      measureRoot.className = 'bulk-print-measure';
      measureRoot.innerHTML = `<div class="bulk-print-report pair"><div class="bulk-report-section">${reportHtml.income}</div><div class="bulk-report-section">${reportHtml.balance}</div></div>`;
      document.body.append(measureRoot);
      try {
        const ruler = document.createElement('div');
        ruler.style.height = '276mm';
        measureRoot.append(ruler);
        pairFinancialReports = measureRoot.firstElementChild.getBoundingClientRect().height <= ruler.getBoundingClientRect().height - 8;
      } finally { measureRoot.remove(); }
    }
    const groups = planBulkPrint([...bulkPrintSelections], pairFinancialReports);
    const parts = [];
    for (const group of groups) {
      if (group[0] === 'journal') parts.push(await bulkJournalHtml());
      else parts.push(`<div class="bulk-print-report ${group.length > 1 ? 'pair' : ''}">${group.map(id => `<div class="bulk-report-section">${reportHtml[id]}</div>`).join('')}</div>`);
    }
    printRoot.innerHTML = parts.join('');
    document.body.append(printRoot);
    document.head.append(pageStyle);
    document.body.classList.add('bulk-print');
    window.addEventListener('afterprint', cleanup);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}

function ledgerMovement(entry) {
  return entry ? `<span class="ledger-movement"><span>M${entry.voucherNumber}</span><span>${formatMoney(entry.amount)}</span></span>` : '';
}

function ledgerCard(account) {
  const rowCount = Math.max(account.debitEntries.length, account.creditEntries.length);
  const movements = Array.from({ length: rowCount }, (_, index) => `<tr><td>${ledgerMovement(account.debitEntries[index])}</td><td>${ledgerMovement(account.creditEntries[index])}</td></tr>`).join('');
  const debitBalance = account.debitBalance || (!account.creditBalance ? 0 : null);
  return `<article class="ledger-card"><h2 title="${esc(account.code)} ${esc(account.name)}"><span class="ledger-code">${esc(account.code)}</span> ${esc(account.name)}</h2><table class="ledger-table"><thead><tr><th>BORÇ</th><th>ALACAK</th></tr></thead><tbody>${movements}</tbody><tfoot><tr><th>Top. ${formatMoney(account.debitTotal)}</th><th>Top. ${formatMoney(account.creditTotal)}</th></tr><tr class="ledger-balance"><th>${debitBalance !== null ? `Bakiye ${formatMoney(debitBalance)}` : ''}</th><th>${account.creditBalance ? `Bakiye ${formatMoney(account.creditBalance)}` : ''}</th></tr></tfoot></table></article>`;
}

function renderLedger() {
  const accounts = generalLedger(state.accounts, state.vouchers);
  return `<section class="panel report-panel ledger-panel">${reportHeading('Büyük Defter (T Hesapları)', 'M: Fiş numarasıdır. Tutarlar Türk lirası olarak gösterilir.')}${accounts.length ? `<div class="ledger-grid">${accounts.map(ledgerCard).join('')}</div>` : emptyReport()}</section>`;
}

function renderStatement() {
  const usedAccounts = trialBalance(state.accounts, state.vouchers).rows;
  if (!usedAccounts.some(account => account.code === selectedStatementCode))
    selectedStatementCode = usedAccounts[0]?.code || '';
  const selected = usedAccounts.find(account => account.code === selectedStatementCode);
  const entries = selected ? accountStatement(state.vouchers, selected.code) : [];
  return `<section class="panel report-panel statement-panel">${reportHeading('Hesap Ekstresi', 'Kayıtlarda kullanılan bir hesabın tarih sıralı hareketleri. Fişi açmak için satıra çift tıklayın.')}${selected ? `
    <label class="field statement-selector"><span>Hesap seçin</span><select id="statement-account" aria-label="Ekstresi gösterilecek hesap">${usedAccounts.map(account => `<option value="${esc(account.code)}" ${account.code === selectedStatementCode ? 'selected' : ''}>${esc(account.code)} ${esc(account.name)}</option>`).join('')}</select></label>
    <div class="table-scroll"><table class="report-table statement-table"><thead><tr><th colspan="7" class="statement-account-title">Hesap: ${esc(selected.code)} ${esc(selected.name)}</th></tr><tr><th>Tarih</th><th>Fiş No</th><th>Açıklama</th><th class="num">Borç</th><th class="num">Alacak</th><th class="num">İşleyen Bakiye</th><th>Taraf</th></tr></thead><tbody>${entries.map(entry => `<tr class="statement-entry-row" data-voucher-id="${esc(entry.id)}" title="${entry.number} numaralı fişi açmak için çift tıklayın"><td><time datetime="${esc(entry.date)}">${journalDate(entry.date)}</time></td><td>${entry.number}</td><td>${esc(entry.description || '—')}</td><td class="num">${entry.debit ? formatMoney(entry.debit) : ''}</td><td class="num">${entry.credit ? formatMoney(entry.credit) : ''}</td><td class="num">${formatMoney(entry.balance)}</td><td>${entry.side}</td></tr>`).join('')}</tbody></table></div>` : emptyReport()}</section>`;
}

function renderTrial() {
  const report = trialBalance(state.accounts, state.vouchers);
  const warning = report.rows.some(row => row.reverseBalance)
    ? '<span class="trial-balance-warning" role="alert">UYARI: Ters bakiye veren hesaplar var. Fişlerinizi kontrol ediniz</span>' : '';
  const heading = `<div class="section-heading report-heading"><div><span class="eyebrow">${YEAR} HESAP YILI</span><div class="trial-heading-line"><h1>Mizan</h1>${warning}</div><p>Hesapların toplam hareketleri ve kalan bakiyeleri. Ekstre için hesap satırına çift tıklayın.</p></div><button class="button" data-action="print-report">Yazdır</button></div>`;
  return `<section class="panel report-panel trial-panel">${heading}${report.rows.length ? `<div class="table-scroll"><table class="report-table"><thead><tr><th>Kod</th><th>Hesap Adı</th><th class="num">Borç Toplamı</th><th class="num">Alacak Toplamı</th><th class="num">Borç Bakiyesi</th><th class="num">Alacak Bakiyesi</th></tr></thead><tbody>${report.rows.map(row => `<tr class="trial-account-row ${row.reverseBalance ? 'trial-reverse-balance' : ''}" data-statement-code="${esc(row.code)}" title="${esc(row.code)} hesabının ekstresini açmak için çift tıklayın"><td class="code">${esc(row.code)}</td><td>${esc(row.name)}</td><td class="num">${formatMoney(row.debit)}</td><td class="num">${formatMoney(row.credit)}</td><td class="num">${formatMoney(row.debitBalance)}</td><td class="num">${formatMoney(row.creditBalance)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">TOPLAM</th><th class="num">${formatMoney(report.totals.debit)}</th><th class="num">${formatMoney(report.totals.credit)}</th><th class="num">${formatMoney(report.totals.debitBalance)}</th><th class="num">${formatMoney(report.totals.creditBalance)}</th></tr></tfoot></table></div>` : emptyReport()}</section>`;
}

function renderIncome() {
  const report = incomeStatement(state.accounts, state.vouchers);
  const stageRows = report.stages.map((stage, index) => `${stage.rows.map(row => `<tr class="income-account-row" data-statement-code="${esc(row.code)}" title="${esc(row.code)} hesabının ekstresini açmak için çift tıklayın"><td><span class="code">${esc(row.code)}</span> ${esc(row.name)}${row.effect < 0 && !/\(-\)\s*$/.test(row.name) ? ' (-)' : ''}</td><td class="num">${formatMoney(row.debit)}</td><td class="num">${formatMoney(row.credit)}</td><td class="num">${formatSigned(row.effect)}</td></tr>`).join('')}${index === 0 && !report.showNetSales ? '' : `<tr class="income-subtotal ${index === report.stages.length - 1 ? 'final' : ''}"><th colspan="3">${esc(stage.title)}</th><th class="num">${formatSigned(stage.total)}</th></tr>`}`).join('');
  return `<section class="panel report-panel">${reportHeading('Gelir Tablosu', 'Yalnızca 6xx hesap hareketlerinden hesaplanır. Ekstre için hesap satırına çift tıklayın.')}${report.rows.length ? `<div class="table-scroll"><table class="report-table income-table"><thead><tr><th>Hesap</th><th class="num">Borç</th><th class="num">Alacak</th><th class="num">Sonuca Etki</th></tr></thead><tbody>${stageRows}</tbody></table></div><p class="report-note">7xx hesapları bu rapora otomatik aktarılmaz. Dönem sonu aktarım fişleri elle girilebilir.</p>` : emptyReport()}</section>`;
}

function balanceRows(rows) {
  return rows.length ? rows.map(row => `<tr class="balance-account-row" data-statement-code="${esc(row.code)}" title="${esc(row.code)} hesabının ekstresini açmak için çift tıklayın"><td><span class="code">${esc(row.code)}</span> ${esc(row.name)}</td><td class="num">${formatSigned(row.value)}</td></tr>`).join('') : '<tr><td colspan="2" class="muted">Kayıt yok</td></tr>';
}

function groupedBalanceColumn(classes, total, totalLabel) {
  const rows = classes.map(main => `<tr class="balance-main-group"><th>${esc(main.code)} ${esc(main.name)}</th><th class="num">${formatSigned(main.total)}</th></tr>${main.groups.map(group => `<tr class="balance-sub-group"><th>${esc(group.code)} ${esc(group.name)}</th><th class="num">${formatSigned(group.total)}</th></tr>${group.rows.map(row => row.synthetic
    ? `<tr class="period-row"><td>${esc(row.name)}</td><td class="num">${formatSigned(row.value)}</td></tr>`
    : `<tr class="balance-account-row" data-statement-code="${esc(row.code)}" title="${esc(row.code)} hesabının ekstresini açmak için çift tıklayın"><td><span class="balance-detail-code">${esc(row.code)}.</span> ${esc(row.name)}</td><td class="num">${formatSigned(row.value)}</td></tr>`).join('')}`).join('')}`).join('');
  return `<div class="balance-column"><table class="report-table balance-group-table"><tbody>${rows}</tbody><tfoot><tr><th>${totalLabel}</th><th class="num">${formatSigned(total)}</th></tr></tfoot></table></div>`;
}

function renderBalance() {
  const report = balanceSheet(state.accounts, state.vouchers);
  const hasEntries = state.vouchers.length > 0;
  const heading = `<div class="section-heading report-heading"><div><span class="eyebrow">${YEAR} HESAP YILI</span><h1>Bilanço</h1><p>Varlıklar, kaynaklar ve otomatik hesaplanan dönem sonucu. Ekstre için hesap satırına çift tıklayın.</p></div><div class="balance-heading-actions"><label class="balance-group-toggle"><input id="balance-show-groups" type="checkbox" ${showBalanceGroups ? 'checked' : ''} />Hesap Gruplarını Göster</label><button class="button" data-action="print-report">Yazdır</button></div></div>`;
  const groups = showBalanceGroups ? groupedBalanceSheet(report) : [];
  const columns = showBalanceGroups
    ? `<div class="balance-grid grouped-balance-grid">${groupedBalanceColumn(groups.filter(group => /^[12]$/.test(group.code)), report.assetTotal, 'AKTİF TOPLAMI')}${groupedBalanceColumn(groups.filter(group => /^[345]$/.test(group.code)), report.liabilityTotal, 'PASİF TOPLAMI')}</div>`
    : `<div class="balance-grid"><div class="balance-column"><h2>Aktif <span>Varlıklar</span></h2><table class="report-table"><thead><tr><th>Hesap</th><th class="num">Tutar</th></tr></thead><tbody>${balanceRows(report.assets)}</tbody><tfoot><tr><th>AKTİF TOPLAMI</th><th class="num">${formatSigned(report.assetTotal)}</th></tr></tfoot></table></div><div class="balance-column"><h2>Pasif <span>Kaynaklar</span></h2><table class="report-table"><thead><tr><th>Hesap</th><th class="num">Tutar</th></tr></thead><tbody>${balanceRows(report.liabilities)}${report.periodResult ? `<tr class="period-row"><td>Hesaplanan dönem kârı / zararı</td><td class="num">${formatSigned(report.periodResult)}</td></tr>` : ''}</tbody><tfoot><tr><th>PASİF TOPLAMI</th><th class="num">${formatSigned(report.liabilityTotal)}</th></tr></tfoot></table></div></div>`;
  return `<section class="panel report-panel">${heading}${hasEntries ? `${report.difference !== 0 ? `<div class="warning-box">Bilanço dengelenmiyor. 7xx veya 9xx hesaplarında aktarılmamış bakiye ve diğer kayıtları kontrol edin.</div>` : ''}${columns}<p class="report-note">6xx bakiyelerinden dönem sonucu hesaplanır. 7xx ve 9xx hesapları bilançoya otomatik aktarılmaz.</p>` : emptyReport()}</section>`;
}

function renderAccounts() {
  return `<section class="panel accounts-panel"><div class="section-heading"><div><span class="eyebrow">TANIMLAR VE VERİ</span><h1>Hesap Planı</h1><p>${state.accounts.length} adet üç haneli ana hesap kullanılıyor.</p></div><div class="toolbar-actions"><button class="button" data-action="export-backup">Yedek İndir</button><button class="button" data-action="upload-backup">Yedek Yükle</button><button class="button primary" data-action="upload-accounts">CSV Yükle</button></div></div><div class="info-box"><strong>Hesap planını değiştirme</strong><p>Yüklenen CSV mevcut planın tamamının yerini alır. Kayıtlı fişlerde kullanılan kodlardan biri yeni planda yoksa yükleme durdurulur. Gerekli sütunlar: Hesap Kodu, Hesap Adı, Taraf.</p></div><label class="search-field"><span>Hesap ara</span><input id="account-search" type="search" placeholder="Kod veya hesap adı yazın" /></label><div class="table-scroll"><table class="report-table account-table"><thead><tr><th>Hesap Kodu</th><th>Hesap Adı</th><th>Taraf</th></tr></thead><tbody id="account-list">${accountRows(state.accounts)}</tbody></table></div></section>`;
}

function accountRows(accounts) {
  return accounts.map(account => `<tr><td class="code">${esc(account.code)}</td><td>${esc(account.name)}</td><td><span class="side-badge ${account.side === 'B' ? 'debit' : 'credit'}">${account.side === 'B' ? 'Borç' : 'Alacak'}</span></td></tr>`).join('');
}

function normalizeDraft() {
  const original = draft.id ? state.vouchers.find(item => item.id === draft.id) : null;
  const lines = draft.lines.filter(line => line.code || line.debit || line.credit || line.quantity ||
    (line.description && line.description !== draft.description))
    .map(line => ({ code: line.code, debit: parseMoney(line.debit), credit: parseMoney(line.credit),
      quantity: String(line.quantity || '').trim(), description: String(line.description || '').trim() }));
  return { id: draft.id || crypto.randomUUID(), number: original?.number ?? Number(draft.number), date: draft.date,
    description: String(draft.description || '').trim(), lines };
}

async function saveVoucher() {
  if (saving || (draft.id && !editingSaved)) return false;
  const voucher = normalizeDraft();
  const errors = validateVoucher(voucher, state.accounts, state.vouchers);
  if (errors.length) { notify(errors[0], 'error'); return false; }
  const previous = state.vouchers.findIndex(item => item.id === voucher.id);
  const updated = structuredClone(state);
  if (previous >= 0) updated.vouchers[previous] = voucher;
  else updated.vouchers.push(voucher);
  updated.nextNumber = Math.max(updated.nextNumber, voucher.number + 1);
  const started = performance.now();
  saving = true;
  clearTimeout(noticeTimer);
  document.querySelector('#notice').className = 'notice';
  document.querySelector('#save-status').hidden = false;
  app.querySelectorAll('button, input, select').forEach(control => { control.disabled = true; });
  try {
    await saveState(updated);
    state = updated;
    dirty = false;
    const remaining = Math.max(0, 1000 - (performance.now() - started));
    if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    draft = freshDraft();
    editingSaved = false;
    saving = false;
    render();
    return true;
  } catch (error) {
    saving = false;
    render();
    throw error;
  }
}

async function applyTemplateSelection(ids, startDate) {
  if (!confirmLeave()) return;
  if (!ids.length) { notify('Uygulamak için en az bir şablon seçin.', 'error'); return; }
  const planned = createTemplateSequence(nextNumber(), startDate, state.accounts, state.vouchers, Math.random, ids);
  let completed = 0;
  activeTab = 'voucher';
  applyingAllTemplates = true;
  try {
    for (const templateVoucher of planned) {
      draft = draftFromVoucher(templateVoucher);
      editingSaved = false;
      dirty = true;
      render();
      if (!await saveVoucher()) throw new Error('Fiş kaydedilemedi.');
      completed += 1;
    }
    notify(`${completed} şablon sırasıyla kaydedildi.`, 'success');
  } catch (error) {
    throw new Error(`${completed} şablon kaydedildi. ${error.message}`);
  } finally {
    applyingAllTemplates = false;
  }
}

async function applySelectedTemplates() {
  if (!templateSelectionValid()) { notify('Başlangıç ve bitiş tarihlerini kontrol edin.', 'error'); return; }
  await applyTemplateSelection(TEMPLATES.filter(template => templateSelections.has(template.id)).map(template => template.id), templateStartDate);
}

function changeVoucher(id) {
  if (!confirmLeave()) { document.querySelector('#voucher-select').value = draft.id || ''; return; }
  const voucher = state.vouchers.find(item => item.id === id);
  draft = voucher ? draftFromVoucher(voucher) : freshDraft();
  editingSaved = false;
  dirty = false;
  render();
}

function navigateVoucher(direction) {
  const items = sortedVouchers();
  if (!items.length) { notify('Henüz kayıtlı fiş yok.'); return; }
  const position = items.findIndex(item => item.id === draft.id);
  const target = items[position + direction] || (position === -1 ? items[direction > 0 ? 0 : items.length - 1] : null);
  if (!target) { notify(direction > 0 ? 'Son fiştesiniz.' : 'İlk fiştesiniz.'); return; }
  changeVoucher(target.id);
}

async function deleteVoucher() {
  if (!draft.id) return;
  if (!window.confirm(`${draft.number} numaralı fiş silinsin mi?`)) return;
  const updated = { ...state, vouchers: state.vouchers.filter(item => item.id !== draft.id) };
  await saveState(updated);
  state = updated;
  draft = freshDraft();
  editingSaved = false;
  dirty = false;
  render();
  notify('Fiş silindi.', 'success');
}

function balanceVoucher() {
  if (draft.id && !editingSaved) return;
  const totals = rawTotals();
  const difference = totals.debit - totals.credit;
  if (!difference) { notify('Fiş zaten dengede.'); return; }
  const field = difference > 0 ? 'credit' : 'debit';
  const opposite = difference > 0 ? 'debit' : 'credit';
  const line = [...draft.lines].reverse().find(item => item.code && !item[field] && !item[opposite]);
  if (!line) { notify(`Hesap seçilmiş, tutarı boş bir satır ekleyin.`, 'error'); return; }
  line[field] = formatMoney(Math.abs(difference));
  dirty = true;
  render();
  notify('Kalan fark boş satıra yazıldı.', 'success');
}

function download(filename, text, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportBackup() {
  download(`mini-muhasebe-${YEAR}-yedek.json`, JSON.stringify(state, null, 2), 'application/json');
  notify('Yedek dosyası indirildi.', 'success');
}

async function saveBusinessTitle() {
  const businessTitle = document.querySelector('#business-title').value.trim().replace(/\s+/g, ' ');
  const updated = { ...state, businessTitle };
  await saveState(updated);
  state = updated;
  settingsOpen = false;
  render();
  notify(businessTitle ? 'İşletme ünvanı kaydedildi.' : 'İşletme ünvanı temizlendi; muhasebe.info gösteriliyor.', 'success');
}

async function deleteAllVouchers() {
  if (!state.vouchers.length || !confirmLeave()) return;
  if (!window.confirm(`${state.vouchers.length} fişin tamamı silinecek. Hesap planı korunacak, fiş numarası 1’den başlayacak. Bu işlem geri alınamaz. Devam edilsin mi?`)) return;
  const updated = withoutVouchers(state);
  await saveState(updated);
  state = updated;
  draft = freshDraft();
  editingSaved = false;
  dirty = false;
  settingsOpen = false;
  render();
  notify('Tüm fişler silindi.', 'success');
}

async function sortVouchers() {
  if (!state.vouchers.length || !confirmLeave()) return;
  const selectedId = draft.id;
  const updated = renumberVouchersByDate(state);
  await saveState(updated);
  state = updated;
  const selected = updated.vouchers.find(item => item.id === selectedId);
  draft = selected ? draftFromVoucher(selected) : freshDraft();
  editingSaved = false;
  dirty = false;
  settingsOpen = false;
  render();
  notify(`${updated.vouchers.length} fiş tarihe göre sıralandı ve yeniden numaralandırıldı.`, 'success');
}

async function uploadBackup(file) {
  const data = validateBackup(JSON.parse(await file.text()));
  if (!window.confirm('Yedek yüklenirse mevcut hesap planı ve tüm fişler değiştirilecek. Devam edilsin mi?')) return;
  await saveState(data);
  state = data;
  draft = freshDraft();
  editingSaved = false;
  dirty = false;
  render();
  notify('Yedek geri yüklendi.', 'success');
}

async function uploadAccounts(file) {
  const accounts = parseAccountPlan(await file.text());
  validateAccountReplacement(accounts, state.vouchers);
  if (!window.confirm(`${accounts.length} hesap içeren yeni plan mevcut planın yerini alacak. Devam edilsin mi?`)) return;
  const updated = { ...state, accounts };
  await saveState(updated);
  state = updated;
  render();
  notify('Hesap planı değiştirildi.', 'success');
}

function closeSettings() {
  settingsOpen = false;
  render();
  document.querySelector('[data-action="settings"]')?.focus();
}

app.addEventListener('click', async event => {
  if (saving || applyingAllTemplates || printingJournal) return;
  if (settingsOpen && event.target.matches('.settings-overlay')) { closeSettings(); return; }
  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    activeTab = tabButton.dataset.tab;
    render();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const index = Number(button.dataset.index);
  try {
    if (action === 'settings') { settingsOpen = true; render(); document.querySelector('#settings-close')?.focus(); }
    else if (action === 'close-settings') closeSettings();
    else if (action === 'save-business-title') await saveBusinessTitle();
    else if (action === 'delete-all-vouchers') await deleteAllVouchers();
    else if (action === 'sort-vouchers') await sortVouchers();
    else if (action === 'edit' && draft.id && !editingSaved) { editingSaved = true; render(); }
    else if (action === 'save') await saveVoucher();
    else if (action === 'apply-all-templates') {
      templateSelections.clear();
      TEMPLATES.forEach(template => templateSelections.add(template.id));
      templateStartDate = draft.date;
      activeTab = 'template-apply';
      render();
    }
    else if (action === 'apply-selected-templates') await applySelectedTemplates();
    else if (action === 'new') { if (confirmLeave()) { draft = freshDraft(); editingSaved = false; dirty = false; render(); } }
    else if (action === 'delete') await deleteVoucher();
    else if (action === 'previous') navigateVoucher(-1);
    else if (action === 'next') navigateVoucher(1);
    else if (action === 'balance-voucher') balanceVoucher();
    else if (action === 'print-report') window.print();
    else if (action === 'print-journal-one') await printJournalLayout(false);
    else if (action === 'print-journal-two') await printJournalLayout(true);
    else if (action === 'print-selected-reports') await printSelectedReports();
    else if (action === 'add-vat' && (!draft.id || editingSaved)) {
      const vatLine = createVatLine(draft.lines[index], Number(button.dataset.rate));
      if (!state.accounts.some(account => account.code === vatLine.code)) {
        throw new Error(`${vatLine.code} hesabı hesap planında bulunamadı.`);
      }
      draft.lines.splice(index + 1, 0, vatLine);
      dirty = true;
      render();
    }
    else if (action === 'add-row' && (!draft.id || editingSaved)) { draft.lines.splice(index + 1, 0, blankLine(draft.description)); dirty = true; render(); }
    else if (action === 'remove-row' && (!draft.id || editingSaved)) { draft.lines.splice(index, 1); if (!draft.lines.length) draft.lines.push(blankLine(draft.description)); dirty = true; render(); }
    else if (action === 'upload-accounts') document.querySelector('#account-upload').click();
    else if (action === 'upload-backup') { if (settingsOpen) closeSettings(); document.querySelector('#backup-upload').click(); }
    else if (action === 'export-backup') { if (settingsOpen) closeSettings(); exportBackup(); }
  } catch (error) { notify(error.message || 'İşlem tamamlanamadı.', 'error'); }
});

app.addEventListener('dblclick', event => {
  if (saving || applyingAllTemplates || settingsOpen) return;
  if (activeTab === 'trial' || activeTab === 'income' || activeTab === 'balance') {
    const row = event.target.closest('[data-statement-code]');
    if (!row) return;
    selectedStatementCode = row.dataset.statementCode;
    activeTab = 'statement';
    render();
  } else if (activeTab === 'statement' || activeTab === 'journal') {
    const row = event.target.closest('[data-voucher-id]');
    if (!row || !confirmLeave()) return;
    const voucher = state.vouchers.find(item => item.id === row.dataset.voucherId);
    if (!voucher) return;
    draft = draftFromVoucher(voucher);
    editingSaved = false;
    dirty = false;
    activeTab = 'voucher';
    render();
  }
});

app.addEventListener('input', event => {
  if (saving || applyingAllTemplates) return;
  const target = event.target;
  if (draft.id && !editingSaved && (target.id === 'voucher-date' || target.id === 'voucher-description' || target.dataset.field)) return;
  if (target.id === 'template-start-date') { templateStartDate = target.value; updateTemplateApplyControls(); }
  else if (target.id === 'voucher-date') { draft.date = target.value; dirty = true; }
  else if (target.id === 'voucher-description') {
    const previous = draft.description;
    draft.description = target.value;
    draft.lines.forEach((line, index) => {
      if (line.description && line.description !== previous) return;
      line.description = target.value;
      const input = app.querySelector(`#entry-body tr[data-row="${index}"] [data-field="description"]`);
      if (input) input.value = target.value;
    });
    dirty = true;
  }
  else if (target.id === 'account-search') {
    const term = target.value.toLocaleLowerCase('tr-TR').trim();
    document.querySelector('#account-list').innerHTML = accountRows(state.accounts.filter(account =>
      account.code.includes(term) || account.name.toLocaleLowerCase('tr-TR').includes(term)));
  } else if (target.dataset.field) {
    const index = Number(target.closest('[data-row]').dataset.row);
    const field = target.dataset.field;
    if (field === 'code') {
      const match = /^\s*(\d{3})(?:\s|$)/.exec(target.value);
      draft.lines[index].code = match ? match[1] : target.value.trim();
      target.closest('td').querySelector('.account-hint').textContent = accountName(draft.lines[index].code);
      if (accountPicker?.input === target) { accountPicker.activeIndex = 0; drawAccountSuggestions(); }
    } else if (field === 'debit' || field === 'credit') {
      const formatted = formatMoneyEntry(target.value, target.selectionStart);
      target.value = formatted.value;
      target.setSelectionRange(formatted.caret, formatted.caret);
      draft.lines[index][field] = formatted.value;
    } else draft.lines[index][field] = target.value;
    dirty = true;
    if (field === 'debit' || field === 'credit') updateTotals();
  }
});

app.addEventListener('focusin', event => {
  const input = event.target;
  if (!input.matches('.account-input')) return;
  const rowIndex = Number(input.closest('[data-row]').dataset.row);
  accountPicker = { input, rowIndex, previousCode: draft.lines[rowIndex].code,
    previousValue: input.value, previousDirty: dirty, matches: [], activeIndex: 0 };
  drawAccountSuggestions();
});

app.addEventListener('focusout', event => {
  if (saving || applyingAllTemplates || (draft.id && !editingSaved)) return;
  const target = event.target;
  if (target.matches('.money-input')) {
    const cents = target.value ? parseMoney(target.value) : null;
    if (cents !== null) {
      target.value = formatMoney(cents);
      const index = Number(target.closest('[data-row]').dataset.row);
      draft.lines[index][target.dataset.field] = target.value;
      updateTotals();
    }
    return;
  }
  if (!target.matches('.account-input')) return;
  if (accountPicker?.input === target) { closeAccountSuggestions(); accountPicker = null; }
  const value = target.value.trim();
  const account = state.accounts.find(item => item.code === value ||
    item.name.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'));
  if (!account) return;
  const index = Number(target.closest('[data-row]').dataset.row);
  draft.lines[index].code = account.code;
  target.value = `${account.code} — ${account.name}`;
  target.closest('td').querySelector('.account-hint').textContent = account.name;
});

app.addEventListener('pointerdown', event => {
  const option = event.target.closest('[data-account-code]');
  if (!option || !accountPicker) return;
  event.preventDefault();
  chooseAccount(state.accounts.find(account => account.code === option.dataset.accountCode));
});

app.addEventListener('change', async event => {
  if (saving || applyingAllTemplates) return;
  const target = event.target;
  try {
    if (target.id === 'balance-show-groups') {
      showBalanceGroups = target.checked;
      render();
    }
    else if (target.id === 'template-select-all') {
      templateSelections.clear();
      if (target.checked) TEMPLATES.forEach(template => templateSelections.add(template.id));
      app.querySelectorAll('[data-template-id]').forEach(input => { input.checked = target.checked; });
      updateTemplateApplyControls();
    }
    else if (target.matches('[data-template-id]')) {
      if (target.checked) templateSelections.add(target.dataset.templateId);
      else templateSelections.delete(target.dataset.templateId);
      updateTemplateApplyControls();
    }
    else if (target.matches('[data-bulk-print]')) {
      if (target.checked) bulkPrintSelections.add(target.dataset.bulkPrint);
      else bulkPrintSelections.delete(target.dataset.bulkPrint);
      app.querySelector('[data-action="print-selected-reports"]').disabled = bulkPrintSelections.size === 0;
    }
    else if (target.id === 'journal-line-descriptions') {
      showJournalLineDescriptions = target.checked;
      app.querySelectorAll('.journal-line-description').forEach(item => { item.hidden = !showJournalLineDescriptions; });
    }
    else if (target.id === 'statement-account') { selectedStatementCode = target.value; render(); }
    else if (target.id === 'voucher-select') changeVoucher(target.value);
    else if (target.id === 'template-select' && target.value) {
      if (!confirmLeave()) { target.value = ''; return; }
      const template = createTemplateVoucher(target.value, nextNumber(), todayInYear(), state.accounts, Math.random, state.vouchers);
      draft = draftFromVoucher(template);
      editingSaved = false;
      dirty = true;
      render();
      notify('Şablon fişe uygulandı. Kontrol edip Kaydet’e basın.', 'success');
    }
    else if (target.id === 'account-upload' && target.files[0]) await uploadAccounts(target.files[0]);
    else if (target.id === 'backup-upload' && target.files[0]) await uploadBackup(target.files[0]);
  } catch (error) {
    if (target.id === 'template-select') target.value = '';
    notify(error.message || 'Dosya yüklenemedi.', 'error');
  }
  finally { if (target.type === 'file') target.value = ''; }
});

window.addEventListener('beforeunload', event => {
  if (dirty || applyingAllTemplates) { event.preventDefault(); event.returnValue = ''; }
});

window.addEventListener('keydown', event => {
  if (!settingsOpen) return;
  if (event.key === 'Escape') { closeSettings(); return; }
  if (event.key !== 'Tab') return;
  const buttons = [...document.querySelectorAll('.settings-dialog button:not(:disabled)')];
  const first = buttons[0];
  const last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

window.addEventListener('keydown', event => {
  if (activeTab !== 'voucher' || settingsOpen || saving || applyingAllTemplates || event.isComposing) return;
  const target = event.target;
  const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
  if (modifier && event.key.toLowerCase() === 's') {
    event.preventDefault();
    const button = app.querySelector('[data-action="save"]');
    if (!event.repeat && button && !button.disabled) button.click();
    return;
  }
  if (modifier && event.key === 'Enter') {
    event.preventDefault();
    const button = app.querySelector('[data-action="balance-voucher"]');
    if (!event.repeat && button && !button.disabled) button.click();
    return;
  }
  const row = target.closest?.('#entry-body tr[data-row]');
  const field = target.dataset?.field;
  if (modifier && row && field && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const direction = event.key.slice(5).toLowerCase();
    const next = adjacentVoucherCell(Number(row.dataset.row), field, direction, draft.lines.length);
    if (next) focusVoucherField(next.rowIndex, next.field);
    return;
  }
  if (modifier || event.altKey) return;
  if (target.matches?.('.account-input') && accountPicker?.input === target) {
    if (event.key === 'Escape') { event.preventDefault(); restoreAccountSelection(); return; }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && accountPicker.matches.length) {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      accountPicker.activeIndex = (accountPicker.activeIndex + delta + accountPicker.matches.length) % accountPicker.matches.length;
      drawAccountSuggestions();
      app.querySelector(`#account-option-${accountPicker.activeIndex}`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
      event.preventDefault();
      if (!chooseCurrentAccount()) notify('Hesap listesinden geçerli bir hesap seçin.', 'error');
      return;
    }
  }
  if (event.key !== 'Enter' && (event.key !== 'Tab' || event.shiftKey)) return;
  if (target.id === 'voucher-date') {
    event.preventDefault();
    app.querySelector('#voucher-description')?.focus();
  } else if (target.id === 'voucher-description') {
    event.preventDefault();
    focusVoucherField(0, 'code');
  } else if (event.key === 'Enter' && row && VOUCHER_FIELDS.includes(field)) {
    event.preventDefault();
    const rowIndex = Number(row.dataset.row);
    const columnIndex = VOUCHER_FIELDS.indexOf(field);
    if (columnIndex < VOUCHER_FIELDS.length - 1) {
      focusVoucherField(rowIndex, VOUCHER_FIELDS[columnIndex + 1]);
    } else if (rowIndex < draft.lines.length - 1) {
      focusVoucherField(rowIndex + 1, 'code');
    } else if (Object.entries(draft.lines[rowIndex]).some(([key, value]) =>
      String(value).trim() && (key !== 'description' || value !== draft.description))) {
      draft.lines.push(blankLine(draft.description));
      dirty = true;
      render();
      focusVoucherField(rowIndex + 1, 'code');
    }
  }
});

window.addEventListener('scroll', event => {
  if (accountPicker && event.target !== app.querySelector('#account-suggestions')) closeAccountSuggestions();
}, true);
window.addEventListener('resize', () => { if (accountPicker) closeAccountSuggestions(); });

try {
  state = await loadState();
  draft = freshDraft();
  render();
} catch (error) {
  app.innerHTML = `<div class="fatal"><h1>Uygulama açılamadı</h1><p>${esc(error.message)}</p><p>Tarayıcıda yerel veri saklama iznini kontrol edin veya sayfayı yeniden açın.</p></div>`;
}
