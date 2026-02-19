// ══════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT — Cabeleireira Dashboard
//  Instruções:
//  1. Abre o teu Google Sheets
//  2. Vai a Extensões → Apps Script
//  3. Apaga o código que está lá e cola este ficheiro completo
//  4. Clica em "Guardar" (ícone de disquete)
//  5. Clica em "Implementar" → "Nova implementação"
//  6. Tipo: "Aplicação Web"
//  7. Executar como: "Eu (o teu email)"
//  8. Quem tem acesso: "Qualquer pessoa"
//  9. Clica em "Implementar" e autoriza as permissões
//  10. Copia o URL gerado e cola na app em Config → URL do Apps Script
// ══════════════════════════════════════════════════════════════════

const SHEET_NAME     = 'Entradas';  // Nome da folha onde ficam as entradas
const EXPENSES_SHEET = 'Saídas';    // Nome da folha onde ficam as saídas
const STATS_SHEET    = 'Resumo';    // Nome da folha de resumo (criada automaticamente)
const SERVICES_SHEET = 'Serviços';  // Nome da folha dos serviços (editada pelo utilizador)
const CLIENTS_SHEET  = 'Clientes';  // Nome da folha dos clientes

// Chamada quando a webapp envia dados (POST)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Ação de guardar lista de serviços
    if (data.action === 'saveServices') {
      saveServicesData(data.services);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Ação de guardar lista de clientes
    if (data.action === 'saveClients') {
      saveClientsData(data.clients);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Ação de guardar categorias de despesas
    if (data.action === 'saveExpenseCats') {
      saveExpenseCatsData(data.expenseCats);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Ação de apagar entrada
    if (data.action === 'delete') {
      deleteEntry(data.entryId);
      updateSummary();
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Ação de apagar TUDO
    if (data.action === 'deleteAll') {
      deleteAllEntries();
      updateSummary();
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Ação padrão: adicionar entrada (income ou expense)
    if (data.type === 'expense') {
      appendExpenseEntry(data);
    } else {
      appendEntry(data);
    }
    updateSummary();
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Chamada quando a webapp pede dados (GET)
function doGet(e) {
  const action = e.parameter.action;

  // Devolve a lista de serviços
  if (action === 'getServices') {
    return ContentService
      .createTextOutput(JSON.stringify(getServicesData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Devolve a lista de clientes
  if (action === 'getClients') {
    return ContentService
      .createTextOutput(JSON.stringify(getClientsData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Devolve TODAS as entradas (para sincronização inicial)
  if (action === 'getAll') {
    return ContentService
      .createTextOutput(JSON.stringify(getAllData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getMonth') {
    const month = e.parameter.month; // ex: "2025-03"
    return ContentService
      .createTextOutput(JSON.stringify(getMonthData(month)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Cabeleireira API ativa' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Adiciona uma linha na folha "Entradas"
function appendEntry(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  // Cria a folha se não existir
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Cabeçalhos — col A-E visíveis, F-J ocultas (sistema)
    sheet.appendRow(['Data', 'Hora', 'Serviços', 'Total (€)', 'Observação', 'ID', 'ServicesJSON', 'TotalBase', 'Ajuste', 'Cliente']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Formatar colunas de total como moeda
    sheet.getRange('D:D').setNumberFormat('€#,##0.00');
    sheet.getRange('H:H').setNumberFormat('€#,##0.00');
    // Ocultar colunas de sistema (F, G, H, I)
    sheet.hideColumns(6, 4);
    // Larguras
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 70);
    sheet.setColumnWidth(3, 260);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 180);
    sheet.setColumnWidth(10, 160);
  }

  sheet.appendRow([
    data.date,
    data.time,
    data.services,
    data.total,
    data.nota || '',
    data.id || '',            // col F — IDúnico
    data.servicesJson || '',  // col G — JSON dos serviços
    data.baseTotal || data.total,  // col H — total base (antes do ajuste)
    data.adjustment || '',    // col I — ajuste aplicado (ex: "-5" ou "+8")
    data.clientName || '',    // col J — nome do cliente
  ]);

  // Alternar cores nas linhas para facilitar leitura
  const lastRow = sheet.getLastRow();
  if (lastRow % 2 === 0) {
    sheet.getRange(lastRow, 1, 1, 5).setBackground('#FDF9F5');
  }
}

// Adiciona uma linha na folha "Saídas"
function appendExpenseEntry(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EXPENSES_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(EXPENSES_SHEET);
    sheet.appendRow(['Data', 'Hora', 'Ícone', 'ID', 'Categoria', 'CatID', 'Valor (€)', 'Descrição']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('G:G').setNumberFormat('€#,##0.00');
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 70);
    sheet.setColumnWidth(3, 60);
    sheet.setColumnWidth(4, 140);
    sheet.setColumnWidth(5, 160);
    sheet.setColumnWidth(6, 100);
    sheet.setColumnWidth(7, 100);
    sheet.setColumnWidth(8, 240);
    sheet.hideColumns(4, 2); // oculta ID e CatID
  }

  sheet.appendRow([
    data.date,
    data.time,
    data.catIcon || '📦',
    data.id || '',
    data.catName || 'Outro',
    data.catId || '',
    data.total,
    data.description || '',
  ]);

  const expLastRow = sheet.getLastRow();
  if (expLastRow % 2 === 0) {
    sheet.getRange(expLastRow, 1, 1, 8).setBackground('#FFF8F6');
  }
}
function deleteEntry(entryId) {
  if (!entryId) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Procura em Entradas
  const incSheet = ss.getSheetByName(SHEET_NAME);
  if (incSheet) {
    const data = incSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][5]) === String(entryId)) {
        incSheet.deleteRow(i + 1);
        return;
      }
    }
  }
  // Procura em Saídas (col D = ID)
  const expSheet = ss.getSheetByName(EXPENSES_SHEET);
  if (expSheet) {
    const data = expSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][3]) === String(entryId)) {
        expSheet.deleteRow(i + 1);
        return;
      }
    }
  }
}

// Apaga TODAS as entradas da folha (mantém o cabeçalho)
function deleteAllEntries() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [SHEET_NAME, EXPENSES_SHEET].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  });
}

// Devolve todas as entradas (usada para sincronização inicial da webapp)
function getAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = [];

  // ── Entradas (income) ──
  const incSheet = ss.getSheetByName(SHEET_NAME);
  if (incSheet) {
    const data = incSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let parsedServices = null;
      try { parsedServices = row[6] ? JSON.parse(row[6]) : null; } catch (e) {}
      result.push({
        id: String(row[5] || i),
        date: row[0],
        time: row[1],
        servicesLabel: row[2],
        services: parsedServices,
        total: parseFloat(row[3]) || 0,
        nota: row[4] || '',
        baseTotal: parseFloat(row[7]) || parseFloat(row[3]) || 0,
        adjustment: row[8] ? String(row[8]) : '',
        clientName: row[9] ? String(row[9]) : '',
        synced: true,
      });
    }
  }

  // ── Saídas (expenses) ──
  const expSheet = ss.getSheetByName(EXPENSES_SHEET);
  if (expSheet) {
    const data = expSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[3]) continue; // linha sem ID → ignora
      result.push({
        type: 'expense',
        id: String(row[3]),
        date: row[0],
        time: row[1],
        catIcon: String(row[2] || '📦'),
        catName: String(row[4] || 'Outro'),
        catId: String(row[5] || ''),
        total: parseFloat(row[6]) || 0,
        description: String(row[7] || ''),
        services: [],
        synced: true,
      });
    }
  }

  return result;
}

// Atualiza/cria uma folha de Resumo com médias por mês
function updateSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let summarySheet = ss.getSheetByName(STATS_SHEET);
  if (!summarySheet) summarySheet = ss.insertSheet(STATS_SHEET);
  summarySheet.clearContents();

  // ── Agrupa entradas (income) por mês ──
  const incMap = {};
  const incSheet = ss.getSheetByName(SHEET_NAME);
  if (incSheet) {
    const data = incSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const dateStr = String(row[0]);
      const total = parseFloat(row[3]) || 0;
      const month = dateStr.slice(0, 7);
      if (!month || month.length < 7) continue;
      if (!incMap[month]) incMap[month] = { income: 0, entries: 0, days: new Set() };
      incMap[month].income += total;
      incMap[month].entries++;
      incMap[month].days.add(dateStr);
    }
  }

  // ── Agrupa saídas (expenses) por mês ──
  const expSheet = ss.getSheetByName(EXPENSES_SHEET);
  if (expSheet) {
    const data = expSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const dateStr = String(row[0]);
      const total = parseFloat(row[6]) || 0;
      const month = dateStr.slice(0, 7);
      if (!month || month.length < 7) continue;
      if (!incMap[month]) incMap[month] = { income: 0, entries: 0, days: new Set() };
      incMap[month].expenses = (incMap[month].expenses || 0) + total;
    }
  }

  // ── Escreve resumo ──
  summarySheet.appendRow(['Mês', 'Receitas (€)', 'Despesas (€)', 'Saldo (€)', 'Nº Entradas', 'Dias c/ trabalho', 'Média/dia (€)', 'Média/entrada (€)']);
  summarySheet.getRange(1, 1, 1, 8).setFontWeight('bold');

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const months = Object.keys(incMap).sort().reverse();
  months.forEach(m => {
    const d = incMap[m];
    const expenses = d.expenses || 0;
    const avgDay   = d.days.size > 0 ? d.income / d.days.size : 0;
    const avgEntry = d.entries  > 0 ? d.income / d.entries    : 0;
    const [year, mon] = m.split('-');
    const label = `${monthNames[parseInt(mon) - 1]} ${year}`;
    summarySheet.appendRow([label, d.income, expenses, d.income - expenses, d.entries, d.days.size, avgDay, avgEntry]);
  });

  // Formatar colunas de valores como moeda
  const lastRow = summarySheet.getLastRow();
  if (lastRow > 1) {
    summarySheet.getRange(2, 2, lastRow - 1, 4).setNumberFormat('€#,##0.00'); // Receitas, Despesas, Saldo
    summarySheet.getRange(2, 7, lastRow - 1, 2).setNumberFormat('€#,##0.00'); // Médias
    // Colorir saldo: verde se positivo, vermelho se negativo
    for (let r = 2; r <= lastRow; r++) {
      const saldo = summarySheet.getRange(r, 4).getValue();
      summarySheet.getRange(r, 4).setFontColor(saldo >= 0 ? '#1a7a4a' : '#c0392b');
    }
  }

  summarySheet.setColumnWidth(1, 140);
  summarySheet.setColumnWidth(2, 120);
  summarySheet.setColumnWidth(3, 120);
  summarySheet.setColumnWidth(4, 120);
  summarySheet.setColumnWidth(5, 110);
  summarySheet.setColumnWidth(6, 130);
  summarySheet.setColumnWidth(7, 140);
  summarySheet.setColumnWidth(8, 150);
  summarySheet.setFrozenRows(1);
}
// ── CLIENTES ───────────────────────────────────────────────────────────────────

// Devolve a lista de clientes da folha 'Clientes'
function getClientsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CLIENTS_SHEET);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    result.push({
      id:            String(row[0]),
      name:          String(row[1] || ''),
      hairColor:     String(row[2] || '#888'),
      hairColorName: String(row[3] || ''),
      notes:         String(row[4] || ''),
      addedDate:     String(row[5] || ''),
    });
  }
  return result;
}

// Escreve toda a lista de clientes na folha 'Clientes'
function saveClientsData(clientsList) {
  if (!Array.isArray(clientsList)) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CLIENTS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CLIENTS_SHEET);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 140);
    sheet.setColumnWidth(5, 260);
    sheet.setColumnWidth(6, 110);
  } else {
    const lastRow = sheet.getLastRow();
    if (lastRow > 0) sheet.clearContents();
  }

  sheet.appendRow(['ID', 'Nome', 'Cor (hex)', 'Nome da cor', 'Notas', 'Data de registo']);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  sheet.setFrozenRows(1);

  clientsList.forEach(c => {
    sheet.appendRow([c.id, c.name, c.hairColor || '#888', c.hairColorName || '', c.notes || '', c.addedDate || '']);
  });
}
// ── EXPENSE CATEGORIES ────────────────────────────────────────────────────────

// Guarda as categorias de despesas numa folha oculta (para persistência)
function saveExpenseCatsData(catsList) {
  if (!Array.isArray(catsList)) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'ExpenseCats';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.hideSheet();
  } else {
    sheet.clearContents();
  }
  sheet.appendRow(['ID', 'Nome', 'Ícone']);
  catsList.forEach(c => sheet.appendRow([c.id, c.name, c.icon || '📦']));
}

// ── SERVIÇOS ──────────────────────────────────────────────────────────────────

const DEFAULT_SERVICES_DATA = [
  { id: 's1', name: 'Corte',      icon: '✂️',  price: 15 },
  { id: 's2', name: 'Lavagem',    icon: '🚿',  price: 8  },
  { id: 's3', name: 'Pintura',    icon: '🎨',  price: 45 },
  { id: 's4', name: 'Brushing',   icon: '💨',  price: 12 },
  { id: 's5', name: 'Tratamento', icon: '💆',  price: 20 },
  { id: 's6', name: 'Outros',     icon: '➕',  price: 0  },
];

// Lê a folha Serviços e devolve array de objetos {id, name, icon, price}
function getServicesData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SERVICES_SHEET);

  // Cria a folha com os defaults se não existir ou estiver vazia
  if (!sheet) {
    sheet = ss.insertSheet(SERVICES_SHEET);
    sheet.appendRow(['ID', 'Nome', 'Ícone', 'Preço (€)']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('D:D').setNumberFormat('€#,##0.00');
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 100);
    DEFAULT_SERVICES_DATA.forEach(s => sheet.appendRow([s.id, s.name, s.icon, s.price]));
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    // Folha existe mas está vazia — preenche com defaults
    DEFAULT_SERVICES_DATA.forEach(s => sheet.appendRow([s.id, s.name, s.icon, s.price]));
    return DEFAULT_SERVICES_DATA;
  }

  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] && !row[1]) continue; // linha em branco
    result.push({
      id:    String(row[0] || ('s' + i)),
      name:  String(row[1] || ''),
      icon:  String(row[2] || '⭐'),
      price: parseFloat(row[3]) || 0,
    });
  }
  // Deduplica por ID — em caso de duplicado fica com o último
  const seen = new Map();
  result.forEach(s => seen.set(s.id, s));
  return [...seen.values()];
}

// Substitui toda a folha Serviços pelos dados enviados pela webapp
function saveServicesData(servicesList) {
  if (!Array.isArray(servicesList) || servicesList.length === 0) return;

  // Deduplica por ID antes de escrever
  const seen = new Map();
  servicesList.forEach(s => seen.set(String(s.id), s));
  const unique = [...seen.values()];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SERVICES_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(SERVICES_SHEET);
    sheet.getRange('D:D').setNumberFormat('€#,##0.00');
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 100);
  } else {
    // Apaga todas as linhas de dados existentes (mantém a folha mas limpa)
    const lastRow = sheet.getLastRow();
    if (lastRow > 0) sheet.clearContents();
  }

  sheet.appendRow(['ID', 'Nome', 'Ícone', 'Preço (€)']);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  sheet.setFrozenRows(1);

  unique.forEach(s => {
    sheet.appendRow([s.id, s.name, s.icon, parseFloat(s.price) || 0]);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

// Devolve os dados de um mês específico (para uso futuro)
function getMonthData(month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0].startsWith(month)) {
      result.push({
        date: row[0],
        time: row[1],
        services: row[2],
        total: row[3],
        nota: row[4],
      });
    }
  }
  return result;
}
