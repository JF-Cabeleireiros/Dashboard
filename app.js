// ── DATA LAYER ──
const DB = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// DEFAULT SERVICES
const DEFAULT_SERVICES = [
  { id: 's1', name: 'Corte', icon: '✂️', price: 15 },
  { id: 's2', name: 'Lavagem', icon: '🚿', price: 8 },
  { id: 's3', name: 'Pintura', icon: '🎨', price: 45 },
  { id: 's4', name: 'Brushing', icon: '💨', price: 12 },
  { id: 's5', name: 'Tratamento', icon: '💆', price: 20 },
  { id: 's6', name: 'Outros', icon: '➕', price: 0 },
];

// STATE
let services = DB.get('services', DEFAULT_SERVICES);
let entries = DB.get('entries', []);
let selected = {}; // { serviceId: count }
let sheetsUrl = DB.get('sheetsUrl', '');
let clients = DB.get('clients', []);

const DEFAULT_HAIR_COLORS = [
  { name: 'Preto',         hex: '#1a1a1a' },
  { name: 'Castanho Esc.', hex: '#3d1f00' },
  { name: 'Castanho',      hex: '#7c4a1e' },
  { name: 'Cast. Claro',   hex: '#b07d45' },
  { name: 'Loiro Esc.',    hex: '#c4a032' },
  { name: 'Loiro',         hex: '#e8c366' },
  { name: 'Loiro Claro',   hex: '#f5e1a0' },
  { name: 'Ruivo',         hex: '#c03020' },
  { name: 'Cinzento',      hex: '#9e9e9e' },
  { name: 'Branco',        hex: '#dedede' },
  { name: 'Azul',          hex: '#2979ff' },
  { name: 'Roxo',          hex: '#9c27b0' },
  { name: 'Rosa',          hex: '#e91e8c' },
];
let hairColors = DB.get('hairColors', DEFAULT_HAIR_COLORS);

// EXPENSE CATEGORIES
const DEFAULT_EXPENSE_CATS = [
  { id: 'ec1', name: 'Eletricidade', icon: '⚡' },
  { id: 'ec2', name: 'Produtos',     icon: '🧪' },
  { id: 'ec3', name: 'Aluguer',      icon: '🏠' },
  { id: 'ec4', name: 'Água',          icon: '💧' },
  { id: 'ec5', name: 'Internet',     icon: '📶' },
];
let expenseCats = DB.get('expenseCats', DEFAULT_EXPENSE_CATS);
let _selectedExpenseCat = null; // id of selected cat
let _caixaView = 'entradas'; // 'entradas' | 'saidas'

// REGISTOS FILTER STATE
let _histType   = 'both';          // 'both' | 'income' | 'expense'
let _histRange  = 'day';           // 'day' | 'month' | 'all'
let _histDate   = today();         // YYYY-MM-DD (used when range=day)
let _histMonth  = today().slice(0,7); // YYYY-MM (used when range=month)
let _histSearch = '';              // free-text filter

// STATS VIEW
let _statsView = 'income'; // 'income' | 'expense' | 'both'

let _editingClientId = null;
let _selectedHairColor = hairColors[0];

// ── ADJUSTMENT STATE ──
let _adjType = 'none'; // 'none' | 'discount' | 'extra'
let _adjAmount = 0;

// ── HELPERS ──
function fmt(v) { return v.toFixed(2).replace('.', ',') + ' €'; }
function today() { return new Date().toISOString().slice(0, 10); }

// Normalise a date value coming from localStorage/Sheets to "YYYY-MM-DD"
function normDate(val) {
  if (!val) return '';
  const s = String(val);
  // ISO string or anything with T / space separator
  if (s.length > 10 && (s[10] === 'T' || s[10] === ' ')) return s.slice(0, 10);
  return s;
}

// Normalise a time value to "HH:MM".
// Sheets serialises times as fractional days anchored to 1899-12-30,
// so we get "1899-12-30T21:27:00.000Z" — extract the UTC time portion.
function normTime(val) {
  if (!val) return '';
  const s = String(val);
  // ISO datetime — grab HH:MM from the T part
  const tIdx = s.indexOf('T');
  if (tIdx !== -1 && s.length >= tIdx + 6) return s.slice(tIdx + 1, tIdx + 6);
  // Already "HH:MM" or "HH:MM:SS"
  if (s.length >= 5 && s[2] === ':') return s.slice(0, 5);
  return s;
}

function now() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}
function dateKey(iso) { return iso.slice(0, 7); } // YYYY-MM

function save() {
  DB.set('services', services);
  DB.set('entries', entries);
  DB.set('sheetsUrl', sheetsUrl);
  DB.set('clients', clients);
  DB.set('hairColors', hairColors);
  DB.set('expenseCats', expenseCats);
}

function showToast(msg, dur = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ── HEADER DATE ──
function updateHeaderDate() {
  const d = new Date();
  const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  document.getElementById('headerDate').textContent =
    `${days[d.getDay()]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}
updateHeaderDate();

// ── TABS ──
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'historico') renderHistory();
    if (tab.dataset.tab === 'clientes') { renderClients(); renderClientSelector(); }
    if (tab.dataset.tab === 'medias') {
      renderStats();
      if (sheetsUrl && !_justDeletedAll) {
        loadFromSheets().then(() => renderStats());
      }
    }
    if (tab.dataset.tab === 'config') renderConfig();
  });
});

// ── CAIXA ──
function renderServices() {
  const grid = document.getElementById('servicesGrid');
  grid.innerHTML = '';
  services.forEach(svc => {
    const cnt = selected[svc.id] || 0;
    const div = document.createElement('div');
    div.className = 'service-btn' + (cnt > 0 ? ' selected' : '');
    div.innerHTML = `
      ${cnt > 0 ? `<div class="svc-badge">${cnt}</div>` : ''}
      <div class="svc-icon">${svc.icon}</div>
      <div class="svc-name">${svc.name}</div>
      <div class="svc-price">${svc.price > 0 ? fmt(svc.price) : 'Manual'}</div>
    `;
    div.addEventListener('click', () => toggleService(svc));
    grid.appendChild(div);
  });
  updateTotal();
}

function toggleService(svc) {
  if (svc.price === 0) {
    const val = prompt(`Preço para "${svc.name}":`, '');
    const p = parseFloat(val?.replace(',', '.'));
    if (!isNaN(p) && p > 0) {
      selected[svc.id] = (selected[svc.id] || 0) + 1;
      if (!svc._manualTotal) svc._manualTotal = 0;
      svc._manualTotal += p;
    }
  } else {
    selected[svc.id] = (selected[svc.id] || 0) + 1;
  }
  renderServices();
}

function updateTotal() {
  let baseTotal = 0;
  let parts = [];
  services.forEach(svc => {
    const cnt = selected[svc.id] || 0;
    if (cnt > 0) {
      if (svc.price === 0 && svc._manualTotal) {
        baseTotal += svc._manualTotal;
        parts.push(`${svc.name} (${fmt(svc._manualTotal)})`);
      } else {
        baseTotal += svc.price * cnt;
        parts.push(cnt > 1 ? `${svc.name} ×${cnt}` : svc.name);
      }
    }
  });

  let finalTotal = baseTotal;
  const adjInfo = document.getElementById('totalAdjInfo');
  if (_adjType === 'discount' && _adjAmount > 0) {
    finalTotal = Math.max(0, baseTotal - _adjAmount);
    adjInfo.textContent = `Base: ${fmt(baseTotal)}  ·  💸 Desc: -${fmt(_adjAmount)}`;
    adjInfo.style.display = '';
  } else if (_adjType === 'extra' && _adjAmount > 0) {
    finalTotal = baseTotal + _adjAmount;
    adjInfo.textContent = `Base: ${fmt(baseTotal)}  ·  ➕ Extra: +${fmt(_adjAmount)}`;
    adjInfo.style.display = '';
  } else {
    adjInfo.textContent = '';
    adjInfo.style.display = 'none';
  }

  document.getElementById('totalValue').textContent = fmt(finalTotal);
  document.getElementById('totalServices').textContent = parts.length ? parts.join(' · ') : 'Nenhum serviço selecionado';
  document.getElementById('btnRegister').disabled = finalTotal === 0;
}

function clearSelection() {
  selected = {};
  services.forEach(s => { delete s._manualTotal; });
  document.getElementById('notaInput').value = '';
  // Reset adjustment
  _adjType = 'none';
  _adjAmount = 0;
  document.querySelectorAll('.adj-pill').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.adj === 'none') b.classList.add('active');
  });
  document.getElementById('adjAmountRow').style.display = 'none';
  document.getElementById('adjAmountInput').value = '';
  renderServices();
}

document.getElementById('btnClear').addEventListener('click', clearSelection);

// ── ADJUSTMENT PILLS ──
document.querySelectorAll('.adj-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    _adjType = btn.dataset.adj;
    document.querySelectorAll('.adj-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('adjAmountRow').style.display = _adjType === 'none' ? 'none' : 'flex';
    if (_adjType !== 'none') document.getElementById('adjAmountInput').focus();
    updateTotal();
  });
});
document.getElementById('adjAmountInput').addEventListener('input', () => {
  _adjAmount = parseFloat(document.getElementById('adjAmountInput').value) || 0;
  updateTotal();
});

document.getElementById('btnRegister').addEventListener('click', async () => {
  let baseTotal = 0;
  let svcs = [];
  services.forEach(svc => {
    const cnt = selected[svc.id] || 0;
    if (cnt > 0) {
      if (svc.price === 0 && svc._manualTotal) {
        baseTotal += svc._manualTotal;
        svcs.push({ id: svc.id, name: svc.name, count: cnt, subtotal: svc._manualTotal });
      } else {
        baseTotal += svc.price * cnt;
        svcs.push({ id: svc.id, name: svc.name, count: cnt, subtotal: svc.price * cnt });
      }
    }
  });

  let finalTotal = baseTotal;
  if (_adjType === 'discount' && _adjAmount > 0) finalTotal = Math.max(0, baseTotal - _adjAmount);
  else if (_adjType === 'extra' && _adjAmount > 0) finalTotal = baseTotal + _adjAmount;

  const clientId = document.getElementById('caixaClientSelect').value;
  const clientName = clientId ? (clients.find(c => c.id === clientId)?.name || '') : '';

  const entry = {
    id: Date.now().toString(),
    date: today(),
    time: now(),
    services: svcs,
    baseTotal,
    adjustment: (_adjType !== 'none' && _adjAmount > 0) ? { type: _adjType, amount: _adjAmount } : null,
    total: finalTotal,
    clientName,
    nota: document.getElementById('notaInput').value.trim(),
    synced: false,
  };

  entries.unshift(entry);
  save();

  if (sheetsUrl) syncEntry(entry);

  // Reset client selector
  document.getElementById('caixaClientSelect').value = '';
  clearSelection();
  rerenderAll();
  showToast('✅ Entrada registada!');
});

// ── HISTORY ──

// Central re-render: call after any change to entries
function rerenderAll() {
  try { renderHistory(); } catch(e) { console.warn('renderHistory error', e); }
  // Only render stats if the medias view is in the DOM and active
  try {
    if (document.getElementById('view-medias') && document.getElementById('monthSelect')) {
      renderStats();
    }
  } catch(e) { console.warn('renderStats error', e); }
}

function renderHistory() {
  // ── 1. Filter by date range ──
  let pool;
  if (_histRange === 'day') {
    pool = entries.filter(e => normDate(e.date) === _histDate);
  } else if (_histRange === 'month') {
    pool = entries.filter(e => e.date && normDate(e.date).startsWith(_histMonth));
  } else {
    pool = [...entries];
  }

  // ── 2. Filter by type ──
  if (_histType === 'income')  pool = pool.filter(e => e.type !== 'expense');
  if (_histType === 'expense') pool = pool.filter(e => e.type === 'expense');

  // ── 3. Filter by search text ──
  const q = _histSearch.toLowerCase();
  if (q) {
    pool = pool.filter(e => {
      const parts = [
        e.clientName || '',
        e.nota || '',
        e.description || '',
        e.catName || '',
        ...(e.services || []).map(s => s.name || ''),
      ];
      return parts.some(p => p.toLowerCase().includes(q));
    });
  }

  // ── 4. Sort most-recent first ──
  pool.sort((a, b) => {
    const da = normDate(a.date || '') + 'T' + normTime(a.time || '00:00');
    const db = normDate(b.date || '') + 'T' + normTime(b.time || '00:00');
    return db.localeCompare(da);
  });

  // ── 5. Badge ──
  const incTotal = pool.filter(e => e.type !== 'expense').reduce((s, e) => s + e.total, 0);
  const expTotal = pool.filter(e => e.type === 'expense').reduce((s, e) => s + e.total, 0);
  const net = incTotal - expTotal;
  const badge = document.getElementById('historyTotalBadge');
  badge.textContent = fmt(net);
  badge.classList.toggle('badge-negative', net < 0 && expTotal > 0);

  // ── 6. Title ──
  const titleEl = document.getElementById('regTitle');
  if (titleEl) {
    if (_histRange === 'day') {
      titleEl.textContent = _histDate === today() ? 'Hoje' : _histDate;
    } else if (_histRange === 'month') {
      const [y, m] = _histMonth.split('-');
      titleEl.textContent = `${MONTHS_PT[parseInt(m)-1]} ${y}`;
    } else {
      titleEl.textContent = `Todos os registos (${pool.length})`;
    }
  }

  // ── 7. Render list ──
  const list = document.getElementById('historyList');
  if (pool.length === 0) {
    list.innerHTML = `<div class="history-empty"><div class="big">📋</div>Sem registos para mostrar.</div>`;
    return;
  }

  const showDate = _histRange !== 'day';

  list.innerHTML = pool.map(e => {
    const eDate = normDate(e.date);
    const eTime = normTime(e.time);
    const dateBadge = showDate ? `<div class="entry-date-small">${eDate}</div>` : '';
    if (e.type === 'expense') {
      return `
      <div class="entry-card expense-entry-card">
        <div class="entry-time"><div class="time">${eTime}</div>${dateBadge}</div>
        <div class="entry-info">
          <div class="expense-cat-badge">${e.catIcon || '📤'} ${e.catName || 'Saída'}</div>
          ${e.description ? `<div class="entry-nota">${e.description}</div>` : ''}
        </div>
        <div class="entry-right">
          <div class="entry-value expense-value">-${fmt(e.total)}</div>
        </div>
        <button class="entry-delete" data-id="${e.id}">🗑</button>
      </div>`;
    }
    let adjBadge = '';
    if (e.adjustment) {
      const sign = e.adjustment.type === 'discount' ? '-' : '+';
      adjBadge = `<span class="entry-adj-badge ${e.adjustment.type}">${sign}${fmt(e.adjustment.amount)}</span>`;
    }
    return `
    <div class="entry-card">
      <div class="entry-time"><div class="time">${eTime}</div>${dateBadge}</div>
      <div class="entry-info">
        ${e.clientName ? `<div class="entry-client">👤 ${e.clientName}</div>` : ''}
        <div class="entry-services">${(e.services||[]).map(s => s.count > 1 ? `${s.name}×${s.count}` : s.name).join(' · ')}</div>
        ${e.nota ? `<div class="entry-nota">"${e.nota}"</div>` : ''}
      </div>
      <div class="entry-right">
        ${adjBadge}
        <div class="entry-value">${fmt(e.total)}</div>
      </div>
      <button class="entry-delete" data-id="${e.id}">🗑</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Apagar esta entrada?')) {
        const entry = entries.find(e => e.id === btn.dataset.id);
        entries = entries.filter(e => e.id !== btn.dataset.id);
        save();
        if (entry && entry.synced) deleteFromSheets(entry.id);
        rerenderAll();
        showToast('🗑 Entrada apagada');
      }
    });
  });
}

// ── STATS ──
let _selectedMonth = null;              // persists chosen month across tab switches
let _chartYear    = new Date().getFullYear(); // persists year shown in line chart
let _chartMode    = 'year';             // 'year' | 'month'
let _chartObserver = null;              // ResizeObserver handle

const SHORT_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function updateNavLabel() {
  const lbl = document.getElementById('yearLabel');
  if (!lbl) return;
  if (_chartMode === 'year') {
    lbl.textContent = _chartYear;
  } else {
    const [y, m] = (_selectedMonth || dateKey(today())).split('-');
    lbl.textContent = `${MONTHS_PT[parseInt(m) - 1].slice(0, 3)} ${y}`;
  }
}

function shiftYear(delta) {
  _chartYear += delta;
  updateNavLabel();
  renderLineChart();
}

function shiftMonth(delta) {
  const [y, m] = (_selectedMonth || dateKey(today())).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  _selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // keep the <select> in sync if the option exists
  const sel = document.getElementById('monthSelect');
  if (sel && [...sel.options].some(o => o.value === _selectedMonth)) sel.value = _selectedMonth;
  updateNavLabel();
  renderLineChart();
  calcStats(_selectedMonth);
}

function buildMonthOptions() {
  const keys = [...new Set(entries.map(e => dateKey(e.date)))].sort().reverse();
  const currentKey = dateKey(today());
  if (!keys.includes(currentKey)) keys.unshift(currentKey);

  if (!_selectedMonth || !keys.includes(_selectedMonth)) {
    _selectedMonth = currentKey;
  }

  const sel = document.getElementById('monthSelect');
  sel.innerHTML = keys.map(k => {
    const [y, m] = k.split('-');
    return `<option value="${k}"${k === _selectedMonth ? ' selected' : ''}>${MONTHS_PT[parseInt(m) - 1]} ${y}</option>`;
  }).join('');
}

function renderStats() {
  buildMonthOptions();

  // ── Mode toggle ──
  const btnYear  = document.getElementById('chartModeYear');
  const btnMonth = document.getElementById('chartModeMonth');
  if (btnYear && !btnYear._wired) {
    btnYear._wired = true;
    btnYear.addEventListener('click', () => {
      _chartMode = 'year';
      btnYear.classList.add('active');
      btnMonth.classList.remove('active');
      updateNavLabel();
      renderLineChart();
    });
  }
  if (btnMonth && !btnMonth._wired) {
    btnMonth._wired = true;
    btnMonth.addEventListener('click', () => {
      _chartMode = 'month';
      btnMonth.classList.add('active');
      btnYear.classList.remove('active');
      updateNavLabel();
      renderLineChart();
    });
  }
  // Reflect current mode on buttons
  if (btnYear)  btnYear.classList.toggle('active',  _chartMode === 'year');
  if (btnMonth) btnMonth.classList.toggle('active', _chartMode === 'month');

  // ── Nav prev/next (use onclick — always fresh) ──
  document.getElementById('yearPrev').onclick = () =>
    _chartMode === 'year' ? shiftYear(-1) : shiftMonth(-1);
  document.getElementById('yearNext').onclick = () =>
    _chartMode === 'year' ? shiftYear(1)  : shiftMonth(1);

  updateNavLabel();

  // Attach ResizeObserver once so chart redraws on layout changes
  const wrap = document.querySelector('.canvas-wrap');
  if (wrap && !_chartObserver) {
    _chartObserver = new ResizeObserver(() => renderLineChart());
    _chartObserver.observe(wrap);
  }

  const sel = document.getElementById('monthSelect');
  sel.onchange = () => {
    _selectedMonth = sel.value;
    if (_chartMode === 'month') updateNavLabel();
    renderLineChart();
    calcStats(sel.value);
  };

  renderLineChart();
  calcStats(_selectedMonth);
}

function renderLineChart() {
  const canvas = document.getElementById('lineChart');
  if (!canvas) return;

  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 400;
  const H = Math.max(160, Math.round(W * 0.35));

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const PAD_L = 52, PAD_R = 16, PAD_T = 24, PAD_B = 38;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  if (_chartMode === 'year') {
    _drawYearChart(ctx, W, H, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH);
  } else {
    _drawMonthChart(ctx, W, H, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH);
  }
}

function _drawChartBase(ctx, W, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH, maxVal) {
  // Grid lines + Y labels
  const gridCount = 4;
  for (let g = 0; g <= gridCount; g++) {
    const y = PAD_T + (g / gridCount) * chartH;
    ctx.strokeStyle = '#e8e5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(W - PAD_R, y);
    ctx.stroke();
    const val = maxVal * (1 - g / gridCount);
    ctx.fillStyle = '#9b9590';
    ctx.font = `10px "DM Sans", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val) + '€', PAD_L - 6, y);
  }
}

function _drawLineAndFill(ctx, totals, xOf, yOf, PAD_T, PAD_B, chartH, n, opts) {
  opts = opts || {};
  const lineColor  = opts.lineColor  || '#2C7873';
  const fillStart  = opts.fillStart  || 'rgba(44,120,115,0.25)';
  const fillEnd    = opts.fillEnd    || 'rgba(44,120,115,0.02)';
  const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + chartH);
  grad.addColorStop(0, fillStart);
  grad.addColorStop(1, fillEnd);
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(totals[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(totals[i]));
  ctx.lineTo(xOf(n - 1), PAD_T + chartH);
  ctx.lineTo(xOf(0),     PAD_T + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(totals[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(totals[i]));
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function _drawYearChart(ctx, W, H, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH) {
  const n = 12;
  const incTotals = Array(n).fill(0);
  const expTotals = Array(n).fill(0);
  entries.forEach(e => {
    const [ey, em] = e.date.split('-');
    if (parseInt(ey) !== _chartYear) return;
    const mi = parseInt(em) - 1;
    if (e.type === 'expense') expTotals[mi] += e.total;
    else incTotals[mi] += e.total;
  });

  const showInc = _statsView !== 'expense';
  const showExp = _statsView !== 'income';
  const activeTotals = _statsView === 'expense' ? expTotals : incTotals;
  const maxVal = _statsView === 'both'
    ? Math.max(...incTotals, ...expTotals, 1)
    : Math.max(...activeTotals, 1);

  const xOf = i => PAD_L + (i / 11) * chartW;
  const yOf = v => PAD_T + chartH - (v / maxVal) * chartH;

  _drawChartBase(ctx, W, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH, maxVal);
  if (showExp) _drawLineAndFill(ctx, expTotals, xOf, yOf, PAD_T, PAD_B, chartH, n,
    { lineColor: '#C05000', fillStart: 'rgba(192,80,0,0.18)', fillEnd: 'rgba(192,80,0,0.02)' });
  if (showInc) _drawLineAndFill(ctx, incTotals, xOf, yOf, PAD_T, PAD_B, chartH, n,
    { lineColor: '#2C7873', fillStart: 'rgba(44,120,115,0.25)', fillEnd: 'rgba(44,120,115,0.02)' });

  // X labels
  ctx.fillStyle = '#6b6560';
  ctx.font = `10px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < n; i++)
    ctx.fillText(SHORT_MONTHS[i], xOf(i), PAD_T + chartH + 8);

  // Dots on primary line
  const dotsData  = _statsView === 'expense' ? expTotals : incTotals;
  const dotActive = _statsView === 'expense' ? '#C05000' : '#2C7873';
  const selYear  = _selectedMonth ? parseInt(_selectedMonth.split('-')[0]) : null;
  const selMonth = _selectedMonth ? parseInt(_selectedMonth.split('-')[1]) - 1 : null;
  for (let i = 0; i < n; i++) {
    const isSel = selYear === _chartYear && selMonth === i;
    const x = xOf(i), y = yOf(dotsData[i]);
    ctx.beginPath();
    ctx.arc(x, y, isSel ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = isSel ? '#8B1A00' : (dotsData[i] > 0 ? dotActive : '#d0cdc9');
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    if (isSel && dotsData[i] > 0) {
      ctx.fillStyle = '#8B1A00';
      ctx.font = `bold 11px "DM Sans", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(fmt(dotsData[i]), x, y - 10);
    }
  }
}

function _drawMonthChart(ctx, W, H, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH) {
  const monthKey = _selectedMonth || dateKey(today());
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const n = daysInMonth;

  const incTotals = Array(n).fill(0);
  const expTotals = Array(n).fill(0);
  entries.forEach(e => {
    if (dateKey(e.date) !== monthKey) return;
    const day = parseInt(e.date.split('-')[2]) - 1;
    if (e.type === 'expense') expTotals[day] += e.total;
    else incTotals[day] += e.total;
  });

  const showInc = _statsView !== 'expense';
  const showExp = _statsView !== 'income';
  const activeTotals = _statsView === 'expense' ? expTotals : incTotals;
  const maxVal = _statsView === 'both'
    ? Math.max(...incTotals, ...expTotals, 1)
    : Math.max(...activeTotals, 1);

  const xOf = i => PAD_L + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const yOf = v => PAD_T + chartH - (v / maxVal) * chartH;

  _drawChartBase(ctx, W, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH, maxVal);
  if (showExp) _drawLineAndFill(ctx, expTotals, xOf, yOf, PAD_T, PAD_B, chartH, n,
    { lineColor: '#C05000', fillStart: 'rgba(192,80,0,0.18)', fillEnd: 'rgba(192,80,0,0.02)' });
  if (showInc) _drawLineAndFill(ctx, incTotals, xOf, yOf, PAD_T, PAD_B, chartH, n,
    { lineColor: '#2C7873', fillStart: 'rgba(44,120,115,0.25)', fillEnd: 'rgba(44,120,115,0.02)' });

  // X labels — show every 5 days + last
  ctx.fillStyle = '#6b6560';
  ctx.font = `10px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < n; i++) {
    const day = i + 1;
    if (day === 1 || day % 5 === 0 || day === n)
      ctx.fillText(day, xOf(i), PAD_T + chartH + 8);
  }

  // Dots on primary line
  const todayStr = today();
  const todayKey = dateKey(todayStr);
  const todayDay = parseInt(todayStr.split('-')[2]) - 1;
  const dotsData  = _statsView === 'expense' ? expTotals : incTotals;
  const dotActive = _statsView === 'expense' ? '#C05000' : '#2C7873';
  for (let i = 0; i < n; i++) {
    const isSel = todayKey === monthKey && i === todayDay;
    const x = xOf(i), y2 = yOf(dotsData[i]);
    ctx.beginPath();
    ctx.arc(x, y2, isSel ? 6 : dotsData[i] > 0 ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle   = isSel ? '#8B1A00' : (dotsData[i] > 0 ? dotActive : '#d0cdc9');
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    if (isSel && dotsData[i] > 0) {
      ctx.fillStyle = '#8B1A00';
      ctx.font = `bold 11px "DM Sans", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(fmt(dotsData[i]), x, y2 - 10);
    }
  }
}

function calcStats(monthKey) {
  const allMonth     = entries.filter(e => dateKey(e.date) === monthKey);
  const incomeEntries  = allMonth.filter(e => e.type !== 'expense');
  const expenseEntries = allMonth.filter(e => e.type === 'expense');

  const sl1 = document.getElementById('statLabel1');
  const sl2 = document.getElementById('statLabel2');
  const sl3 = document.getElementById('statLabel3');
  const sl4 = document.getElementById('statLabel4');
  const barTitle = document.getElementById('statsBarTitle');

  if (_statsView === 'income') {
    const total = incomeEntries.reduce((s, e) => s + e.total, 0);
    const days  = [...new Set(incomeEntries.map(e => e.date))].length;
    const count = incomeEntries.length;
    if (sl1) sl1.textContent = 'Receitas do mês';
    if (sl2) sl2.textContent = 'Média/dia';
    if (sl3) sl3.textContent = 'Nº entradas';
    if (sl4) sl4.textContent = 'Média/entrada';
    document.getElementById('statTotal').textContent = fmt(total);
    document.getElementById('statAvgDay').textContent = days ? fmt(total / days) : '—';
    document.getElementById('statEntries').textContent = count;
    document.getElementById('statAvgEntry').textContent = count ? fmt(total / count) : '—';
    if (barTitle) barTitle.textContent = 'Por serviço';
    _renderServiceBars(incomeEntries);
  } else if (_statsView === 'expense') {
    const total = expenseEntries.reduce((s, e) => s + e.total, 0);
    const count = expenseEntries.length;
    if (sl1) sl1.textContent = 'Despesas do mês';
    if (sl2) sl2.textContent = '—';
    if (sl3) sl3.textContent = 'Nº saídas';
    if (sl4) sl4.textContent = 'Média/saída';
    document.getElementById('statTotal').textContent = fmt(total);
    document.getElementById('statAvgDay').textContent = '—';
    document.getElementById('statEntries').textContent = count;
    document.getElementById('statAvgEntry').textContent = count ? fmt(total / count) : '—';
    if (barTitle) barTitle.textContent = 'Por categoria';
    _renderExpenseBars(expenseEntries);
  } else { // both
    const incTotal = incomeEntries.reduce((s, e)  => s + e.total, 0);
    const expTotal = expenseEntries.reduce((s, e) => s + e.total, 0);
    const net = incTotal - expTotal;
    const incDays = [...new Set(incomeEntries.map(e => e.date))].length;
    if (sl1) sl1.textContent = 'Receitas';
    if (sl2) sl2.textContent = 'Despesas';
    if (sl3) sl3.textContent = 'Saldo líquido';
    if (sl4) sl4.textContent = 'Dias trabalhados';
    document.getElementById('statTotal').textContent = fmt(incTotal);
    document.getElementById('statAvgDay').textContent = fmt(expTotal);
    document.getElementById('statEntries').textContent = fmt(net);
    document.getElementById('statAvgEntry').textContent = incDays;
    if (barTitle) barTitle.textContent = 'Por serviço';
    _renderServiceBars(incomeEntries);
  }
}

function _renderServiceBars(incomeEntries) {
  const svcMap = {};
  incomeEntries.forEach(e => {
    (e.services || []).forEach(s => {
      const sub = parseFloat(s.subtotal) || 0;
      if (!s.name) return;
      if (!svcMap[s.name]) svcMap[s.name] = 0;
      svcMap[s.name] += sub;
    });
  });
  Object.keys(svcMap).forEach(k => { if (!svcMap[k]) delete svcMap[k]; });
  const maxVal = Math.max(...Object.values(svcMap).filter(isFinite), 1);
  const bars = document.getElementById('serviceBars');
  if (Object.keys(svcMap).length === 0) {
    bars.innerHTML = `<div style="text-align:center;padding:20px;color:var(--gray);font-size:0.9rem;">Sem dados para este mês.</div>`;
    return;
  }
  bars.innerHTML = Object.entries(svcMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, val]) => `
      <div class="service-bar-row">
        <div class="service-bar-header">
          <span class="service-bar-name">${name}</span>
          <span class="service-bar-val">${fmt(val)}</span>
        </div>
        <div class="service-bar-bg">
          <div class="service-bar-fill" style="width:${Math.round(val / maxVal * 100)}%"></div>
        </div>
      </div>
    `).join('');
}

function _renderExpenseBars(expenseEntries) {
  const catMap = {};
  expenseEntries.forEach(e => {
    const key = e.catName || 'Outro';
    if (!catMap[key]) catMap[key] = 0;
    catMap[key] += e.total;
  });
  const maxVal = Math.max(...Object.values(catMap).filter(isFinite), 1);
  const bars = document.getElementById('serviceBars');
  if (Object.keys(catMap).length === 0) {
    bars.innerHTML = `<div style="text-align:center;padding:20px;color:var(--gray);font-size:0.9rem;">Sem saídas neste mês.</div>`;
    return;
  }
  bars.innerHTML = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, val]) => `
      <div class="service-bar-row">
        <div class="service-bar-header">
          <span class="service-bar-name">${name}</span>
          <span class="service-bar-val expense-bar-val">${fmt(val)}</span>
        </div>
        <div class="service-bar-bg">
          <div class="service-bar-fill expense-bar-fill" style="width:${Math.round(val / maxVal * 100)}%"></div>
        </div>
      </div>
    `).join('');
}

// ── CONFIG ──
function renderConfig() {
  document.getElementById('sheetsUrl').value = sheetsUrl || '';
  updateConnStatus();

  const editor = document.getElementById('servicesEditor');
  editor.innerHTML = services.map((svc, i) => `
    <div class="edit-svc-row">
      <span style="font-size:1.3rem">${svc.icon}</span>
      <input class="edit-svc-name" value="${svc.name}" data-i="${i}" data-field="name" placeholder="Nome">
      <input class="price-input" value="${svc.price}" data-i="${i}" data-field="price" type="number" min="0" step="0.5">
      <span style="font-size:0.8rem;color:var(--gray)">€</span>
      <button class="btn-del-svc" data-i="${i}">✕</button>
    </div>
  `).join('');

  editor.querySelectorAll('[data-field]').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = parseInt(inp.dataset.i);
      const field = inp.dataset.field;
      services[i][field] = field === 'price' ? parseFloat(inp.value) || 0 : inp.value;
    });
  });

  editor.querySelectorAll('.btn-del-svc').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      if (services.length <= 1) { showToast('⚠️ Precisa de pelo menos 1 serviço'); return; }
      services.splice(i, 1);
      save();
      saveServicesToSheets();
      renderConfig();
    });
  });
}

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  sheetsUrl = document.getElementById('sheetsUrl').value.trim();
  save();
  renderServices();
  updateConnStatus();
  showToast('✅ Configurações guardadas!');
  if (sheetsUrl) {
    entries.filter(e => !e.synced).forEach(syncEntry);
    saveServicesToSheets();  // sincroniza serviços editados
    saveClientsToSheets();   // sincroniza clientes
    saveExpenseCatsToSheets(); // sincroniza categorias de despesas
    loadFromSheets();        // sincroniza entradas existentes no Sheets
    loadClientsFromSheets(); // sincroniza clientes existentes no Sheets
  }
});

function updateConnStatus() {
  const dot = document.getElementById('connDot');
  const label = document.getElementById('connLabel');
  if (sheetsUrl) {
    dot.classList.add('connected');
    label.textContent = 'Sheets ativo';
  } else {
    dot.classList.remove('connected');
    label.textContent = 'Só local';
  }
}
updateConnStatus();

// ── ADD SERVICE MODAL ──
document.getElementById('btnAddSvc').addEventListener('click', () => {
  document.getElementById('modalSvcName').value = '';
  document.getElementById('modalSvcIcon').value = '';
  document.getElementById('modalSvcPrice').value = '';
  document.getElementById('modalOverlay').classList.add('show');
  document.getElementById('modalSvcName').focus();
});
document.getElementById('modalCancel').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.remove('show');
});
document.getElementById('modalOk').addEventListener('click', () => {
  const name = document.getElementById('modalSvcName').value.trim();
  const icon = document.getElementById('modalSvcIcon').value.trim() || '⭐';
  const price = parseFloat(document.getElementById('modalSvcPrice').value) || 0;
  if (!name) { showToast('⚠️ Insere o nome do serviço'); return; }
  services.push({ id: 'u' + Date.now(), name, icon, price });
  save();
  saveServicesToSheets();
  document.getElementById('modalOverlay').classList.remove('show');
  renderConfig();
  showToast('✅ Serviço adicionado!');
});
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalOverlay'))
    document.getElementById('modalOverlay').classList.remove('show');
});

// ── CLIENTS ──
function renderClients() {
  const list = document.getElementById('clientesList');
  if (!list) return;
  if (clients.length === 0) {
    list.innerHTML = `<div class="clients-empty"><div class="big">👤</div>Sem clientes ainda.<br><small>Adiciona o primeiro cliente acima.</small></div>`;
    return;
  }
  const query = (document.getElementById('clientsSearch')?.value || '').trim().toLowerCase();
  const filtered = query
    ? clients.filter(c =>
        c.name.toLowerCase().includes(query) ||
        (c.notes || '').toLowerCase().includes(query) ||
        (c.hairColorName || '').toLowerCase().includes(query)
      )
    : clients;
  if (filtered.length === 0) {
    list.innerHTML = `<div class="clients-empty"><div class="big">🔍</div>Nenhum cliente encontrado.</div>`;
    return;
  }
  list.innerHTML = filtered.map(c => `
    <div class="client-card">
      <div class="client-card-left" data-id="${c.id}" title="Alterar cor">
        <div class="client-hair-swatch" style="background:${c.hairColor || '#888'}"></div>
        <span class="client-color-name">${c.hairColorName || ''}</span>
      </div>
      <div class="client-card-right">
        <div>
          <div class="client-name" data-id="${c.id}" title="Ver histórico">${c.name}</div>
          ${c.notes ? `<div class="client-notes">${c.notes}</div>` : ''}
        </div>
        <button class="client-del-btn" data-id="${c.id}" title="Remover">🗑</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.client-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = clients.find(cl => cl.id === btn.dataset.id);
      if (confirm(`Remover cliente "${c?.name}"?`)) {
        clients = clients.filter(cl => cl.id !== btn.dataset.id);
        save();
        saveClientsToSheets();
        renderClients();
        renderClientSelector();
        showToast('🗑 Cliente removido');
      }
    });
  });

  list.querySelectorAll('.client-card-left').forEach(el => {
    el.addEventListener('click', (e) => {
      openInlineColorPicker(el.dataset.id, el);
      e.stopPropagation();
    });
  });

  list.querySelectorAll('.client-name').forEach(el => {
    el.addEventListener('click', () => openClientHistory(el.dataset.id));
  });
}

// ── INLINE COLOR PICKER (on card) ──
let _inlinePickerClientId = null;
const _inlinePopup = document.getElementById('inlineColorPopup');

function openInlineColorPicker(clientId, anchorEl) {
  if (_inlinePickerClientId === clientId) {
    closeInlineColorPicker();
    return;
  }
  _inlinePickerClientId = clientId;
  const client = clients.find(c => c.id === clientId);
  const grid = document.getElementById('inlineColorGrid');
  grid.innerHTML = hairColors.map(hc => `
    <div class="inline-color-swatch${client?.hairColor === hc.hex ? ' selected' : ''}"
         data-hex="${hc.hex}"
         data-name="${hc.name}">
      <span class="swatch-dot" style="background:${hc.hex}"></span>
      <span class="swatch-lbl">${hc.name}</span>
    </div>
  `).join('');
  grid.querySelectorAll('.inline-color-swatch').forEach(sw => {
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = clients.find(cl => cl.id === _inlinePickerClientId);
      if (c) {
        c.hairColor = sw.dataset.hex;
        c.hairColorName = sw.dataset.name;
        save();
        saveClientsToSheets();
        renderClients();
        renderClientSelector();
        showToast('✅ Cor atualizada!');
      }
      closeInlineColorPicker();
    });
  });

  // Position popup below the anchor
  const rect = anchorEl.getBoundingClientRect();
  const popupW = 240;
  let left = rect.left;
  let top  = rect.bottom + 8 + window.scrollY;
  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
  _inlinePopup.style.left = left + 'px';
  _inlinePopup.style.top  = top  + 'px';
  _inlinePopup.classList.add('show');
}

function closeInlineColorPicker() {
  _inlinePopup.classList.remove('show');
  _inlinePickerClientId = null;
}

// ── CLIENT HISTORY ──
function openClientHistory(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  document.getElementById('clientHistorySwatch').style.background = client.hairColor || '#888';
  document.getElementById('clientHistoryName').textContent = client.name;
  const subParts = [];
  if (client.hairColorName) subParts.push(client.hairColorName);
  if (client.notes) subParts.push(client.notes);
  document.getElementById('clientHistorySub').textContent = subParts.join(' · ');

  const clientEntries = entries
    .filter(e => e.clientName === client.name)
    .sort((a, b) => (normDate(b.date) + normTime(b.time)).localeCompare(normDate(a.date) + normTime(a.time)));

  const list = document.getElementById('clientHistoryList');
  if (clientEntries.length === 0) {
    list.innerHTML = `<div class="client-history-empty">📋<br>Sem entradas para esta cliente ainda.</div>`;
  } else {
    const totalSpent = clientEntries.reduce((s, e) => s + e.total, 0);
    list.innerHTML =
      `<div class="client-history-stats">
        <span>${clientEntries.length} entrada${clientEntries.length !== 1 ? 's' : ''}</span>
        <span class="client-history-total-badge">${fmt(totalSpent)}</span>
      </div>` +
      clientEntries.map(e => {
        let adjBadge = '';
        if (e.adjustment) {
          const sign = e.adjustment.type === 'discount' ? '-' : '+';
          adjBadge = `<span class="entry-adj-badge ${e.adjustment.type}">${sign}${fmt(e.adjustment.amount)}</span>`;
        }
        const [, m, d] = normDate(e.date).split('-');
        const dateLabel = `${parseInt(d)} ${MONTHS_PT[parseInt(m) - 1].slice(0, 3)}`;
        return `
        <div class="entry-card">
          <div class="entry-time">
            <div class="time">${normTime(e.time)}</div>
            <div class="entry-date-small">${dateLabel}</div>
          </div>
          <div class="entry-info">
            <div class="entry-services">${e.services.map(s => s.count > 1 ? `${s.name}\u00d7${s.count}` : s.name).join(' \u00b7 ')}</div>
            ${e.nota ? `<div class="entry-nota">"${e.nota}"</div>` : ''}
          </div>
          <div class="entry-right">
            ${adjBadge}
            <div class="entry-value">${fmt(e.total)}</div>
          </div>
        </div>`;
      }).join('');
  }
  document.getElementById('clientHistoryOverlay').classList.add('show');
}

document.addEventListener('click', (e) => {
  if (_inlinePopup.classList.contains('show') &&
      !_inlinePopup.contains(e.target)) {
    closeInlineColorPicker();
  }
});

function renderClientSelector() {
  const sel = document.getElementById('caixaClientSelect');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Cliente (opcional)...</option>` +
    clients.map(c => `<option value="${c.id}"${c.id === current ? ' selected' : ''}>${c.name}</option>`).join('');
}

function openClientModal(editId) {
  _editingClientId = editId || null;
  const c = editId ? clients.find(cl => cl.id === editId) : null;
  document.getElementById('clientModalTitle').textContent = c ? 'Editar Cliente' : 'Novo Cliente';
  document.getElementById('clientModalName').value = c ? c.name : '';
  document.getElementById('clientModalNotes').value = c ? (c.notes || '') : '';
  const startColor = c ? hairColors.find(h => h.hex === c.hairColor) || { name: c.hairColorName, hex: c.hairColor } : hairColors[0];
  _selectedHairColor = startColor;
  // Reset add-color form
  const form = document.getElementById('newColorForm');
  form.classList.remove('show');
  document.getElementById('newColorName').value = '';
  document.querySelector('.hair-color-add')?.classList.remove('open');
  renderHairColorGrid();
  document.getElementById('clientModalOverlay').classList.add('show');
  document.getElementById('clientModalName').focus();
}

function renderHairColorGrid() {
  const grid = document.getElementById('hairColorGrid');
  if (!grid) return;
  grid.innerHTML = hairColors.map(hc => `
    <div class="hair-color-swatch${hc.hex === _selectedHairColor?.hex ? ' selected' : ''}"
         data-hex="${hc.hex}"
         data-name="${hc.name}">
      <span class="swatch-dot" style="background:${hc.hex}"></span>
      <span class="swatch-lbl">${hc.name}</span>
    </div>
  `).join('') + `<div class="hair-color-swatch hair-color-add" title="Criar nova cor"><span class="swatch-lbl">+ Nova cor</span></div>`;
  grid.querySelectorAll('.hair-color-swatch:not(.hair-color-add)').forEach(sw => {
    sw.addEventListener('click', () => {
      _selectedHairColor = { name: sw.dataset.name, hex: sw.dataset.hex };
      renderHairColorGrid();
    });
  });
  grid.querySelector('.hair-color-add').addEventListener('click', () => {
    const form = document.getElementById('newColorForm');
    const btn  = grid.querySelector('.hair-color-add');
    const open = form.classList.toggle('show');
    btn.classList.toggle('open', open);
    if (open) document.getElementById('newColorName').focus();
  });
}

// ── ADD NEW COLOR FORM ──
document.getElementById('newColorConfirm').addEventListener('click', () => {
  const hex  = document.getElementById('newColorPicker').value;
  const name = document.getElementById('newColorName').value.trim() || 'Cor ' + (hairColors.length + 1);
  // Avoid duplicates by hex
  if (!hairColors.find(h => h.hex === hex)) {
    hairColors.push({ name, hex });
    save();
  }
  _selectedHairColor = { name, hex };
  document.getElementById('newColorForm').classList.remove('show');
  document.getElementById('newColorName').value = '';
  renderHairColorGrid();
  showToast('✅ Cor adicionada!');
});
document.getElementById('newColorName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('newColorConfirm').click();
});

// Client modal events
document.getElementById('btnAddClient').addEventListener('click', () => openClientModal());
document.getElementById('clientsSearch').addEventListener('input', () => renderClients());
document.getElementById('clientModalCancel').addEventListener('click', () => {
  document.getElementById('clientModalOverlay').classList.remove('show');
});
document.getElementById('clientModalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('clientModalOverlay'))
    document.getElementById('clientModalOverlay').classList.remove('show');
});
document.getElementById('clientHistoryClose').addEventListener('click', () => {
  document.getElementById('clientHistoryOverlay').classList.remove('show');
});
document.getElementById('clientHistoryOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('clientHistoryOverlay'))
    document.getElementById('clientHistoryOverlay').classList.remove('show');
});
document.getElementById('clientModalOk').addEventListener('click', () => {
  const name = document.getElementById('clientModalName').value.trim();
  if (!name) { showToast('⚠️ Insere o nome do cliente'); return; }
  if (_editingClientId) {
    const c = clients.find(cl => cl.id === _editingClientId);
    if (c) {
      c.name = name;
      c.notes = document.getElementById('clientModalNotes').value.trim();
      c.hairColor = _selectedHairColor?.hex || '#888';
      c.hairColorName = _selectedHairColor?.name || '';
    }
  } else {
    clients.push({
      id: 'c' + Date.now(),
      name,
      notes: document.getElementById('clientModalNotes').value.trim(),
      hairColor: _selectedHairColor?.hex || '#888',
      hairColorName: _selectedHairColor?.name || '',
      addedDate: today(),
    });
  }
  save();
  saveClientsToSheets();
  document.getElementById('clientModalOverlay').classList.remove('show');
  renderClients();
  renderClientSelector();
  showToast(_editingClientId ? '✅ Cliente atualizado!' : '✅ Cliente adicionado!');
  _editingClientId = null;
});

// Clients Sheets sync
async function saveClientsToSheets() {
  if (!sheetsUrl) return;
  try {
    await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveClients', clients }),
    });
  } catch (err) {
    console.error('saveClientsToSheets error', err);
  }
}

async function loadClientsFromSheets() {
  if (!sheetsUrl) return;
  try {
    const res = await fetch(`${sheetsUrl}?action=getClients`);
    if (!res.ok) return;
    const sheetClients = await res.json();
    if (!Array.isArray(sheetClients) || sheetClients.length === 0) return;
    const seen = new Map();
    sheetClients.forEach(c => seen.set(c.id, c));
    clients = [...seen.values()];
    save();
    renderClients();
    renderClientSelector();
  } catch (err) {
    console.error('loadClientsFromSheets error', err);
  }
}

// ── GOOGLE SHEETS SYNC ──
async function syncEntry(entry) {
  if (!sheetsUrl) return;
  try {
    let payload;
    if (entry.type === 'expense') {
      payload = {
        type: 'expense',
        id: entry.id,
        date: entry.date,
        time: entry.time,
        catId: entry.catId || '',
        catName: entry.catName || 'Outro',
        catIcon: entry.catIcon || '📦',
        total: entry.total,
        description: entry.description || '',
      };
    } else {
      payload = {
        id: entry.id,
        date: entry.date,
        time: entry.time,
        services: entry.services.map(s => `${s.name}${s.count > 1 ? '×' + s.count : ''}`).join(', '),
        servicesJson: JSON.stringify(entry.services),
        total: entry.total,
        baseTotal: entry.baseTotal || entry.total,
        adjustment: entry.adjustment ? `${entry.adjustment.type === 'discount' ? '-' : '+'}${entry.adjustment.amount}` : '',
        clientName: entry.clientName || '',
        nota: entry.nota || '',
      };
    }
    await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    entry.synced = true;
    save();
    const status = document.getElementById('syncStatus');
    if (status) { status.textContent = '✅ Sincronizado com Google Sheets'; status.className = 'sync-status ok'; }
  } catch (err) {
    console.error('Sync error', err);
    const status = document.getElementById('syncStatus');
    if (status) { status.textContent = '❌ Erro ao sincronizar'; status.className = 'sync-status err'; }
  }
}

// Apaga uma entrada no Google Sheets (fire-and-forget)
async function deleteFromSheets(entryId) {
  if (!sheetsUrl || !entryId) return;
  try {
    await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', entryId }),
    });
  } catch (err) {
    console.error('Delete sync error', err);
  }
}

// Carrega os serviços do Google Sheets (tem prioridade sobre localStorage)
async function loadServicesFromSheets() {
  if (!sheetsUrl) return;
  try {
    const res = await fetch(`${sheetsUrl}?action=getServices`);
    if (!res.ok) return;
    const sheetServices = await res.json();
    if (!Array.isArray(sheetServices) || sheetServices.length === 0) return;
    // Deduplica por ID (fica com o último em caso de duplicado)
    const seen = new Map();
    sheetServices.forEach(s => seen.set(s.id, s));
    services = [...seen.values()];
    save();
    renderServices();
    // Se estiver na tab Config, atualiza o editor também
    const cfgTab = document.querySelector('.tab[data-tab="config"]');
    if (cfgTab && cfgTab.classList.contains('active')) renderConfig();
  } catch (err) {
    console.error('loadServicesFromSheets error', err);
  }
}

// Guarda todos os serviços no Google Sheets (debounced — evita chamadas duplas rápidas)
let _saveServiceTimer = null;
function saveServicesToSheets() {
  if (!sheetsUrl) return;
  clearTimeout(_saveServiceTimer);
  _saveServiceTimer = setTimeout(async () => {
    try {
      await fetch(sheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveServices', services }),
      });
    } catch (err) {
      console.error('saveServicesToSheets error', err);
    }
  }, 600); // aguarda 600 ms antes de enviar
}

// Guarda as categorias de despesas no Google Sheets
async function saveExpenseCatsToSheets() {
  if (!sheetsUrl) return;
  try {
    await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveExpenseCats', expenseCats }),
    });
  } catch (err) {
    console.error('saveExpenseCatsToSheets error', err);
  }
}

// Carrega TODAS as entradas do Google Sheets e faz merge com localStorage
let _justDeletedAll = false;
async function loadFromSheets() {
  if (!sheetsUrl) return;
  if (_justDeletedAll) return; // skip right after a delete-all
  try {
    const res = await fetch(`${sheetsUrl}?action=getAll`);
    if (!res.ok) return;
    const sheetEntries = await res.json();
    if (!Array.isArray(sheetEntries) || sheetEntries.length === 0) return;

    const localIds = new Set(entries.map(e => e.id));
    let added = 0;

    sheetEntries.forEach(se => {
      if (!se.id || localIds.has(se.id)) return; // já existe localmente → ignora
      let restored;
      if (se.type === 'expense') {
        restored = {
          id: se.id,
          type: 'expense',
          date: se.date,
          time: se.time,
          catId: se.catId || '',
          catName: se.catName || 'Outro',
          catIcon: se.catIcon || '📦',
          total: se.total,
          description: se.description || '',
          services: [],
          synced: true,
          restoredFromSheets: true,
        };
      } else {
        // Reconstrói o objeto de entrada completo
        restored = {
          id: se.id,
          date: se.date,
          time: se.time,
          // Usa o array de serviços JSON se disponível; caso contrário, cria um genérico
          services: se.services || [{ id: 'restored', name: se.servicesLabel || 'Serviço', count: 1, subtotal: se.total }],
          baseTotal: se.baseTotal || se.total,
          adjustment: se.adjustment ? (() => {
            if (se.adjustment.startsWith('-')) return { type: 'discount', amount: parseFloat(se.adjustment.slice(1)) };
            if (se.adjustment.startsWith('+')) return { type: 'extra',    amount: parseFloat(se.adjustment.slice(1)) };
            return null;
          })() : null,
          total: se.total,
          clientName: se.clientName || '',
          nota: se.nota || '',
          synced: true,
          restoredFromSheets: true,
        };
      }
      entries.push(restored);
      localIds.add(se.id);
      added++;
    });

    if (added > 0) {
      // Ordena: mais recente primeiro
      entries.sort((a, b) => {
        const da = a.date + 'T' + (a.time || '00:00');
        const db = b.date + 'T' + (b.time || '00:00');
        return db.localeCompare(da);
      });
      save();
      showToast(`☁️ ${added} entrada(s) sincronizada(s) do Sheets`);
    }
  } catch (err) {
    console.error('loadFromSheets error', err);
  }
}

// ── REFRESH BUTTON ──
async function refreshData() {
  if (!sheetsUrl) {
    showToast('⚠️ URL do Sheets não configurado', 3000);
    return;
  }
  _justDeletedAll = false; // allow fresh import on manual refresh
  const btn = document.getElementById('btnRefresh');
  if (btn) btn.classList.add('spinning');
  showToast('🔄 A sincronizar…', 1500);
  try {
    await Promise.all([
      loadServicesFromSheets(),
      loadFromSheets(),
      loadClientsFromSheets(),
    ]);
    rerenderAll();
    renderServices();
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

// ── DELETE ALL ──
function deleteAll() {
  document.getElementById('deleteConfirmOverlay').classList.add('show');
}

function _executeDeleteAll() {
  document.getElementById('deleteConfirmOverlay').classList.remove('show');
  try {
    if (sheetsUrl) {
      // Delete every synced entry individually (guaranteed to work with current Apps Script)
      // Also fire the batch deleteAll for when the new Apps Script version is deployed
      entries.filter(e => e.synced).forEach(e => deleteFromSheets(e.id));
      fetch(sheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteAll' }),
      }).catch(() => {});
    }
    _justDeletedAll = true; // prevent loadFromSheets from re-importing
    entries = [];
    save();
    rerenderAll();
    renderServices();
    showToast('🗑 Todas as entradas apagadas', 3000);
  } catch(err) {
    console.error('deleteAll error', err);
    showToast('❌ Erro ao apagar', 3000);
  }
}

document.getElementById('deleteConfirmOk').addEventListener('click', _executeDeleteAll);
document.getElementById('deleteConfirmCancel').addEventListener('click', () => {
  document.getElementById('deleteConfirmOverlay').classList.remove('show');
});

// ── EXPENSE MODAL ──
function renderExpenseCatGrid() {
  const grid = document.getElementById('expenseCatGrid');
  if (!grid) return;
  grid.innerHTML = expenseCats.map(c => `
    <button class="expense-cat-btn${_selectedExpenseCat === c.id ? ' selected' : ''}" data-id="${c.id}">
      <span>${c.icon}</span><span>${c.name}</span>
    </button>
  `).join('') + `<button class="expense-cat-btn expense-cat-add" id="expenseCatAdd">＋ Nova</button>`;

  grid.querySelectorAll('.expense-cat-btn:not(.expense-cat-add)').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedExpenseCat = btn.dataset.id;
      renderExpenseCatGrid();
    });
  });
  document.getElementById('expenseCatAdd')?.addEventListener('click', () => openNewCatModal());
}

// ── NEW CATEGORY MODAL ──
let _newCatEmoji = '📦';
const EMOJI_PICKER_LIST = [
  '📦','🔧','🧾','💻','📋','💡','🔌','🚰',
  '🧹','🧴','🛒','📦','🌿','🚗','📞','⚙️',
  '🏠','🏢','🔑','💊','💰','🎁','📅','📌',
];

function openNewCatModal() {
  _newCatEmoji = '📦';
  document.getElementById('newCatEmojiBtn').textContent = _newCatEmoji;
  document.getElementById('newCatName').value = '';
  _renderEmojiPicker();
  document.getElementById('newCatModalOverlay').classList.add('show');
  setTimeout(() => document.getElementById('newCatName').focus(), 120);
}

function _renderEmojiPicker() {
  const btn = document.getElementById('newCatEmojiBtn');
  // Remove existing picker if any
  const existing = document.getElementById('emojiPickerPopup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'emojiPickerPopup';
  popup.className = 'emoji-picker-popup';
  EMOJI_PICKER_LIST.forEach(em => {
    const b = document.createElement('button');
    b.className = 'emoji-pick-btn' + (em === _newCatEmoji ? ' selected' : '');
    b.textContent = em;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      _newCatEmoji = em;
      btn.textContent = em;
      popup.querySelectorAll('.emoji-pick-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    });
    popup.appendChild(b);
  });
  btn.parentElement.appendChild(popup);
}

document.getElementById('newCatEmojiBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const existing = document.getElementById('emojiPickerPopup');
  if (existing) { existing.remove(); return; }
  _renderEmojiPicker();
});
document.getElementById('newCatCancel').addEventListener('click', () => {
  document.getElementById('emojiPickerPopup')?.remove();
  document.getElementById('newCatModalOverlay').classList.remove('show');
});
document.getElementById('newCatModalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('newCatModalOverlay')) {
    document.getElementById('emojiPickerPopup')?.remove();
    document.getElementById('newCatModalOverlay').classList.remove('show');
  }
});
document.getElementById('newCatOk').addEventListener('click', () => {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) { showToast('⚠️ Insere um nome para a categoria'); return; }
  const id = 'ec' + Date.now();
  expenseCats.push({ id, name, icon: _newCatEmoji });
  save();
  saveExpenseCatsToSheets();
  _selectedExpenseCat = id;
  renderExpenseCatGrid();
  document.getElementById('emojiPickerPopup')?.remove();
  document.getElementById('newCatModalOverlay').classList.remove('show');
  showToast('✅ Categoria adicionada!');
});

// ── REGISTOS FILTER HANDLERS ──
(function initRegistosHandlers() {
  // Initialise date inputs to today / current month
  const di = document.getElementById('regDateInput');
  const mi = document.getElementById('regMonthInput');
  if (di) di.value = _histDate;
  if (mi) mi.value = _histMonth;

  document.querySelectorAll('.reg-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      _histType = btn.dataset.type;
      document.querySelectorAll('.reg-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderHistory();
    });
  });

  document.querySelectorAll('.reg-range').forEach(btn => {
    btn.addEventListener('click', () => {
      _histRange = btn.dataset.range;
      document.querySelectorAll('.reg-range').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('regDateRow').style.display  = _histRange === 'day'   ? '' : 'none';
      document.getElementById('regMonthRow').style.display = _histRange === 'month' ? '' : 'none';
      renderHistory();
    });
  });

  document.getElementById('regDateInput')?.addEventListener('change', e => {
    _histDate = e.target.value;
    renderHistory();
  });

  document.getElementById('regMonthInput')?.addEventListener('change', e => {
    _histMonth = e.target.value;
    renderHistory();
  });

  document.getElementById('regSearch')?.addEventListener('input', e => {
    _histSearch = e.target.value.trim();
    renderHistory();
  });
})();

// ── CAIXA TAB TOGGLE ──
function switchCaixaTab(tab) {
  _caixaView = tab;
  document.querySelectorAll('.caixa-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const entradasPanel = document.getElementById('caixaEntradasPanel');
  const saidasPanel   = document.getElementById('caixaSaidasPanel');
  if (tab === 'saidas') {
    entradasPanel.style.display = 'none';
    saidasPanel.style.display   = '';
    // pre-select first cat and render grid
    if (!_selectedExpenseCat) _selectedExpenseCat = expenseCats[0]?.id || null;
    renderExpenseCatGrid();
    setTimeout(() => document.getElementById('expenseAmount').focus(), 100);
  } else {
    saidasPanel.style.display   = 'none';
    entradasPanel.style.display = '';
  }
}

document.querySelectorAll('.caixa-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchCaixaTab(btn.dataset.tab));
});

// ── REGISTER EXPENSE (inline) ──
document.getElementById('btnClearExpense').addEventListener('click', () => {
  _selectedExpenseCat = expenseCats[0]?.id || null;
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseDescription').value = '';
  renderExpenseCatGrid();
});

document.getElementById('btnRegisterExpense').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  if (!amount || amount <= 0) { showToast('⚠️ Insere um valor válido'); return; }
  if (!_selectedExpenseCat) { showToast('⚠️ Seleciona uma categoria'); return; }
  const cat = expenseCats.find(c => c.id === _selectedExpenseCat);
  const description = document.getElementById('expenseDescription').value.trim();
  const newExpense = {
    id: 'exp' + Date.now(),
    type: 'expense',
    date: today(),
    time: now(),
    catId: cat?.id || '',
    catName: cat?.name || 'Outro',
    catIcon: cat?.icon || '📦',
    total: amount,
    description,
    services: [],
  };
  entries.unshift(newExpense);
  save();
  if (sheetsUrl) syncEntry(newExpense);
  // reset form
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseDescription').value = '';
  _selectedExpenseCat = expenseCats[0]?.id || null;
  renderExpenseCatGrid();
  rerenderAll();
  showToast('✅ Saída registada!');
});

// ── STATS VIEW TOGGLE ──
document.querySelectorAll('.sv-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _statsView = btn.dataset.sv;
    document.querySelectorAll('.sv-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderLineChart();
    calcStats(_selectedMonth || dateKey(today()));
  });
});
renderServices();
renderClientSelector();
// Sincroniza com Sheets no arranque se o URL estiver configurado
if (sheetsUrl) {
  loadServicesFromSheets(); // serviços têm prioridade sobre localStorage
  loadFromSheets();
  loadClientsFromSheets();
}
