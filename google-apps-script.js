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

    // Ação padrão: adicionar entrada
    appendEntry(data);
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

// Apaga a linha da folha "Entradas" com o ID correspondente
function deleteEntry(entryId) {
  if (!entryId) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    // coluna F (índice 5) contém o ID
    if (String(data[i][5]) === String(entryId)) {
      sheet.deleteRow(i + 1); // deleteRow usa índice 1-based
      return;
    }
  }
}

// Apaga TODAS as entradas da folha (mantém o cabeçalho)
function deleteAllEntries() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
}

// Devolve todas as entradas (usada para sincronização inicial da webapp)
function getAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let parsedServices = null;
    try { parsedServices = row[6] ? JSON.parse(row[6]) : null; } catch (e) {}
    result.push({
      id: String(row[5] || i),
      date: row[0],
      time: row[1],
      servicesLabel: row[2],  // string legível
      services: parsedServices, // array de objetos ou null
      total: parseFloat(row[3]) || 0,
      nota: row[4] || '',
      baseTotal: parseFloat(row[7]) || parseFloat(row[3]) || 0,
      adjustment: row[8] ? String(row[8]) : '',
      clientName: row[9] ? String(row[9]) : '',
      synced: true,
    });
  }
  return result;
}

// Atualiza/cria uma folha de Resumo com médias por mês
function updateSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let summarySheet = ss.getSheetByName(STATS_SHEET);

  if (!summarySheet) {
    summarySheet = ss.insertSheet(STATS_SHEET);
  }

  summarySheet.clearContents();

  const dataSheet = ss.getSheetByName(SHEET_NAME);
  if (!dataSheet) return;

  const data = dataSheet.getDataRange().getValues();
  if (data.length <= 1) return;

  // Agrupa por mês
  const monthMap = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dateStr = row[0]; // YYYY-MM-DD
    const total = parseFloat(row[3]) || 0;
    const month = dateStr.slice(0, 7); // YYYY-MM
    if (!monthMap[month]) {
      monthMap[month] = { total: 0, entries: 0, days: new Set() };
    }
    monthMap[month].total += total;
    monthMap[month].entries++;
    monthMap[month].days.add(dateStr);
  }

  // Escreve resumo
  summarySheet.appendRow(['Mês', 'Total (€)', 'Nº Entradas', 'Dias com trabalho', 'Média por dia (€)', 'Média por entrada (€)']);
  summarySheet.getRange(1, 1, 1, 6).setFontWeight('bold');

  const months = Object.keys(monthMap).sort().reverse();
  months.forEach(m => {
    const d = monthMap[m];
    const avgDay = d.days.size > 0 ? d.total / d.days.size : 0;
    const avgEntry = d.entries > 0 ? d.total / d.entries : 0;

    const [year, month] = m.split('-');
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const label = `${monthNames[parseInt(month) - 1]} ${year}`;

    summarySheet.appendRow([label, d.total, d.entries, d.days.size, avgDay, avgEntry]);
  });

  // Formatar colunas de valores como moeda
  const lastRow = summarySheet.getLastRow();
  if (lastRow > 1) {
    summarySheet.getRange(2, 2, lastRow - 1, 1).setNumberFormat('€#,##0.00');
    summarySheet.getRange(2, 5, lastRow - 1, 2).setNumberFormat('€#,##0.00');
  }

  // Larguras
  summarySheet.setColumnWidth(1, 140);
  summarySheet.setColumnWidth(2, 110);
  summarySheet.setColumnWidth(3, 110);
  summarySheet.setColumnWidth(4, 140);
  summarySheet.setColumnWidth(5, 150);
  summarySheet.setColumnWidth(6, 160);

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
