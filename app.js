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

// ── HELPERS ──
function fmt(v) { return v.toFixed(2).replace('.', ',') + ' €'; }
function today() { return new Date().toISOString().slice(0, 10); }
function now() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}
function dateKey(iso) { return iso.slice(0, 7); } // YYYY-MM

function save() {
  DB.set('services', services);
  DB.set('entries', entries);
  DB.set('sheetsUrl', sheetsUrl);
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
  let total = 0;
  let parts = [];
  services.forEach(svc => {
    const cnt = selected[svc.id] || 0;
    if (cnt > 0) {
      if (svc.price === 0 && svc._manualTotal) {
        total += svc._manualTotal;
        parts.push(`${svc.name} (${fmt(svc._manualTotal)})`);
      } else {
        total += svc.price * cnt;
        parts.push(cnt > 1 ? `${svc.name} ×${cnt}` : svc.name);
      }
    }
  });
  document.getElementById('totalValue').textContent = fmt(total);
  document.getElementById('totalServices').textContent = parts.length ? parts.join(' · ') : 'Nenhum serviço selecionado';
  document.getElementById('btnRegister').disabled = total === 0;
}

function clearSelection() {
  selected = {};
  services.forEach(s => { delete s._manualTotal; });
  document.getElementById('notaInput').value = '';
  renderServices();
}

document.getElementById('btnClear').addEventListener('click', clearSelection);

document.getElementById('btnRegister').addEventListener('click', async () => {
  let total = 0;
  let svcs = [];
  services.forEach(svc => {
    const cnt = selected[svc.id] || 0;
    if (cnt > 0) {
      if (svc.price === 0 && svc._manualTotal) {
        total += svc._manualTotal;
        svcs.push({ id: svc.id, name: svc.name, count: cnt, subtotal: svc._manualTotal });
      } else {
        total += svc.price * cnt;
        svcs.push({ id: svc.id, name: svc.name, count: cnt, subtotal: svc.price * cnt });
      }
    }
  });

  const entry = {
    id: Date.now().toString(),
    date: today(),
    time: now(),
    services: svcs,
    total,
    nota: document.getElementById('notaInput').value.trim(),
    synced: false,
  };

  entries.unshift(entry);
  save();

  if (sheetsUrl) syncEntry(entry);

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
  const todayEntries = entries.filter(e => e.date === today());
  const totalToday = todayEntries.reduce((s, e) => s + e.total, 0);
  document.getElementById('historyTotalBadge').textContent = fmt(totalToday);

  const list = document.getElementById('historyList');
  if (todayEntries.length === 0) {
    list.innerHTML = `<div class="history-empty"><div class="big">📋</div>Sem entradas hoje ainda.</div>`;
    return;
  }
  list.innerHTML = todayEntries.map(e => `
    <div class="entry-card">
      <div class="entry-time"><div class="time">${e.time}</div></div>
      <div class="entry-info">
        <div class="entry-services">${e.services.map(s => s.count > 1 ? `${s.name}×${s.count}` : s.name).join(' · ')}</div>
        ${e.nota ? `<div class="entry-nota">"${e.nota}"</div>` : ''}
      </div>
      <div class="entry-value">${fmt(e.total)}</div>
      <button class="entry-delete" data-id="${e.id}">🗑</button>
    </div>
  `).join('');

  list.querySelectorAll('.entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Apagar esta entrada?')) {
        const entry = entries.find(e => e.id === btn.dataset.id);
        entries = entries.filter(e => e.id !== btn.dataset.id);
        save();
        // Propaga apagar para o Google Sheets
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

function _drawLineAndFill(ctx, totals, xOf, yOf, PAD_T, PAD_B, chartH, n) {
  const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + chartH);
  grad.addColorStop(0, 'rgba(44,120,115,0.25)');
  grad.addColorStop(1, 'rgba(44,120,115,0.02)');
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
  ctx.strokeStyle = '#2C7873';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function _drawYearChart(ctx, W, H, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH) {
  const totals = Array(12).fill(0);
  entries.forEach(e => {
    const [ey, em] = e.date.split('-');
    if (parseInt(ey) === _chartYear) totals[parseInt(em) - 1] += e.total;
  });

  const maxVal = Math.max(...totals, 1);
  const xOf = i => PAD_L + (i / 11) * chartW;
  const yOf = v => PAD_T + chartH - (v / maxVal) * chartH;

  _drawChartBase(ctx, W, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH, maxVal);
  _drawLineAndFill(ctx, totals, xOf, yOf, PAD_T, PAD_B, chartH, 12);

  // X labels
  ctx.fillStyle = '#6b6560';
  ctx.font = `10px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < 12; i++)
    ctx.fillText(SHORT_MONTHS[i], xOf(i), PAD_T + chartH + 8);

  // Dots
  const selYear  = _selectedMonth ? parseInt(_selectedMonth.split('-')[0]) : null;
  const selMonth = _selectedMonth ? parseInt(_selectedMonth.split('-')[1]) - 1 : null;
  for (let i = 0; i < 12; i++) {
    const isSel = selYear === _chartYear && selMonth === i;
    const x = xOf(i), y = yOf(totals[i]);
    ctx.beginPath();
    ctx.arc(x, y, isSel ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = isSel ? '#C05000' : (totals[i] > 0 ? '#2C7873' : '#d0cdc9');
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    if (isSel && totals[i] > 0) {
      ctx.fillStyle = '#C05000';
      ctx.font = `bold 11px "DM Sans", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(fmt(totals[i]), x, y - 10);
    }
  }
}

function _drawMonthChart(ctx, W, H, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH) {
  const monthKey = _selectedMonth || dateKey(today());
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const totals = Array(daysInMonth).fill(0);
  entries.forEach(e => {
    if (dateKey(e.date) === monthKey) {
      const day = parseInt(e.date.split('-')[2]) - 1;
      totals[day] += e.total;
    }
  });

  const maxVal = Math.max(...totals, 1);
  const n = daysInMonth;
  const xOf = i => PAD_L + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const yOf = v => PAD_T + chartH - (v / maxVal) * chartH;

  _drawChartBase(ctx, W, PAD_L, PAD_R, PAD_T, PAD_B, chartW, chartH, maxVal);
  _drawLineAndFill(ctx, totals, xOf, yOf, PAD_T, PAD_B, chartH, n);

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

  // Dots — highlight today if in current month
  const todayStr = today();
  const todayKey = dateKey(todayStr);
  const todayDay = parseInt(todayStr.split('-')[2]) - 1;
  for (let i = 0; i < n; i++) {
    const isSel = todayKey === monthKey && i === todayDay;
    const x = xOf(i), y2 = yOf(totals[i]);
    ctx.beginPath();
    ctx.arc(x, y2, isSel ? 6 : totals[i] > 0 ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle   = isSel ? '#C05000' : (totals[i] > 0 ? '#2C7873' : '#d0cdc9');
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    if (isSel && totals[i] > 0) {
      ctx.fillStyle = '#C05000';
      ctx.font = `bold 11px "DM Sans", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(fmt(totals[i]), x, y2 - 10);
    }
  }
}

function calcStats(monthKey) {
  const monthEntries = entries.filter(e => dateKey(e.date) === monthKey);
  const total = monthEntries.reduce((s, e) => s + e.total, 0);
  const days = [...new Set(monthEntries.map(e => e.date))].length;
  const count = monthEntries.length;

  document.getElementById('statTotal').textContent = fmt(total);
  document.getElementById('statAvgDay').textContent = days ? fmt(total / days) : '—';
  document.getElementById('statEntries').textContent = count;
  document.getElementById('statAvgEntry').textContent = count ? fmt(total / count) : '—';

  const svcMap = {};
  monthEntries.forEach(e => {
    e.services.forEach(s => {
      const sub = parseFloat(s.subtotal) || 0;
      if (!s.name) return;
      if (!svcMap[s.name]) svcMap[s.name] = 0;
      svcMap[s.name] += sub;
    });
  });

  // Remove zero/NaN entries and compute max
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
    loadFromSheets();        // sincroniza entradas existentes no Sheets
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

// ── GOOGLE SHEETS SYNC ──
async function syncEntry(entry) {
  if (!sheetsUrl) return;
  try {
    const payload = {
      id: entry.id,                       // ID único para sincronização e apagar
      date: entry.date,
      time: entry.time,
      services: entry.services.map(s => `${s.name}${s.count > 1 ? '×' + s.count : ''}`).join(', '),
      servicesJson: JSON.stringify(entry.services), // JSON completo para reconstrução
      total: entry.total,
      nota: entry.nota || '',
    };
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
      // Reconstrói o objeto de entrada completo
      const restored = {
        id: se.id,
        date: se.date,
        time: se.time,
        // Usa o array de serviços JSON se disponível; caso contrário, cria um genérico
        services: se.services || [{ id: 'restored', name: se.servicesLabel || 'Serviço', count: 1, subtotal: se.total }],
        total: se.total,
        nota: se.nota || '',
        synced: true,
        restoredFromSheets: true,
      };
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

// ── INIT ──
renderServices();
// Sincroniza com Sheets no arranque se o URL estiver configurado
if (sheetsUrl) {
  loadServicesFromSheets(); // serviços têm prioridade sobre localStorage
  loadFromSheets();
}
