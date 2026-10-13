const ICONS = {
  receipt: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  sliders: '<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 6h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bag: '<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6zM18 12h.01"/>',
  led: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M7 10h.01M11 10h.01M15 10h.01M19 10h.01"/>',
  spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z"/>',
  arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
};

const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.spark}</svg>`;
const seedOrders = [
  { id: '184', customer: 'Marina Lopes', items: ['2x Toast de cogumelos', '1x Cold brew'], total: 42.5, channel: 'Site', status: 'new', time: 'há 2 min', paid: true, created: Date.now() - 120000 },
  { id: '183', customer: 'Rafael Costa', items: ['1x Sanduíche da casa', '1x Suco verde'], total: 36, channel: 'Balcão', status: 'new', time: 'há 5 min', paid: true, created: Date.now() - 300000 },
  { id: '182', customer: 'Nina Almeida', items: ['1x Bowl de frutas', '1x Café coado'], total: 29.5, channel: 'Site', status: 'preparing', time: 'há 8 min', paid: true, created: Date.now() - 480000 },
  { id: '181', customer: 'Pedro Martins', items: ['2x Pão de queijo', '1x Latte'], total: 25, channel: 'Site', status: 'ready', time: 'há 12 min', paid: true, created: Date.now() - 720000 },
  { id: '180', customer: 'Bia Nascimento', items: ['1x Toast de cogumelos'], total: 26, channel: 'Balcão', status: 'delivered', time: 'há 24 min', paid: true, created: Date.now() - 1440000 },
];
const seedProducts = [
  { id: 'toast', name: 'Toast de cogumelos', category: 'Cozinha', stock: 8, available: true, code: 'TM' },
  { id: 'sandwich', name: 'Sanduíche da casa', category: 'Cozinha', stock: 3, available: true, code: 'SC' },
  { id: 'coldbrew', name: 'Cold brew', category: 'Bebidas', stock: 12, available: true, code: 'CB' },
  { id: 'juice', name: 'Suco verde', category: 'Bebidas', stock: 2, available: true, code: 'SV' },
  { id: 'bowl', name: 'Bowl de frutas', category: 'Cozinha', stock: 6, available: true, code: 'BF' },
  { id: 'latte', name: 'Latte', category: 'Cafeteria', stock: 15, available: true, code: 'LT' },
];
const defaultState = {
  orders: seedOrders,
  products: seedProducts,
  automations: { autoAccept: false, print: true, led: true, lowStock: true },
  storeOpen: true,
  logs: [{ text: 'Pedido #181 enviado ao painel de retirada', time: 'há 3 min' }, { text: 'Pedido #182 enviado para impressão', time: 'há 8 min' }],
};
let state;
try { state = { ...defaultState, ...JSON.parse(localStorage.getItem('balcao27-state') || '{}') }; }
catch { state = structuredClone(defaultState); }
let activeView = 'orders';
let activeFilter = 'all';
let toastTimeout;

const main = document.querySelector('#main-content');
document.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const persist = () => localStorage.setItem('balcao27-state', JSON.stringify(state));
const activeOrders = () => state.orders.filter((order) => order.status !== 'delivered' && order.status !== 'rejected');
const pendingOrders = () => state.orders.filter((order) => order.status === 'new');

function addLog(text) {
  state.logs.unshift({ text, time: 'agora' });
  state.logs = state.logs.slice(0, 5);
}

function showToast(message) {
  const region = document.querySelector('#toast-region');
  region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { region.innerHTML = ''; }, 2800);
}

function setView(view) {
  activeView = view;
  document.querySelectorAll('.nav-item').forEach((button) => {
    const selected = button.dataset.view === view;
    button.classList.toggle('is-active', selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  render();
}

function heading(eyebrow, title, note, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="heading-note">${note}</p></div>${action}</div>`;
}

function renderOrders() {
  const preparing = state.orders.filter((order) => order.status === 'preparing').length;
  const ready = state.orders.filter((order) => order.status === 'ready').length;
  const newOrders = pendingOrders().length;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toLocaleUpperCase('pt-BR');
  const action = `<button class="primary-button" type="button" data-action="simulate">${icon('plus')}<span>Simular pedido</span></button>`;
  const filters = [['all', 'Todos'], ['new', `Novos ${newOrders ? `· ${newOrders}` : ''}`], ['preparing', 'Em preparo'], ['ready', 'Prontos']];
  const filtered = activeOrders().filter((order) => activeFilter === 'all' || order.status === activeFilter).sort((a, b) => b.created - a.created);
  const cards = filtered.length ? filtered.map(orderCard).join('') : '<div class="empty-state"><strong>Nenhum pedido nesta fila</strong>Novos pedidos aparecem aqui automaticamente.</div>';
  return `${heading(dateLabel, 'Bom dia, equipe', 'A operação está em andamento.', action)}
    <section class="metrics" aria-label="Resumo dos pedidos">
      <div class="metric"><div><span class="metric-label">Aguardando confirmação</span><strong class="metric-value">${newOrders}</strong></div><span class="metric-icon">${icon('clock')}</span></div>
      <div class="metric"><div><span class="metric-label">Em preparo</span><strong class="metric-value">${preparing}</strong></div><span class="metric-icon">${icon('bag')}</span></div>
      <div class="metric"><div><span class="metric-label">Prontos para retirada</span><strong class="metric-value">${ready}</strong></div><span class="metric-icon">${icon('check')}</span></div>
    </section>
    <section aria-labelledby="orders-title">
      <div class="section-head"><div><h2 id="orders-title">Fila de pedidos</h2><p>${activeOrders().length} pedidos ativos na operação</p></div>
        <div class="filters" role="group" aria-label="Filtrar pedidos">${filters.map(([key, label]) => `<button class="filter-chip ${activeFilter === key ? 'is-selected' : ''}" type="button" data-filter="${key}" aria-pressed="${activeFilter === key}">${label}</button>`).join('')}</div>
      </div>
      <div class="order-list">${cards}</div>
    </section>`;
}

function statusLabel(status) {
  return { new: ['Novo', 'pill-new'], preparing: ['Em preparo', 'pill-preparing'], ready: ['Pronto', 'pill-ready'], delivered: ['Entregue', 'pill-delivered'], rejected: ['Recusado', 'pill-delivered'] }[status];
}

function orderCard(order) {
  const [label, className] = statusLabel(order.status);
  const next = order.status === 'preparing' ? `<button class="primary-button" type="button" data-action="advance" data-id="${order.id}">Marcar pronto ${icon('arrow')}</button>`
    : order.status === 'ready' ? `<button class="primary-button" type="button" data-action="advance" data-id="${order.id}">Marcar entregue ${icon('check')}</button>`
      : order.status === 'new' ? `<div class="action-group"><button class="danger-button" type="button" data-action="reject" data-id="${order.id}">Recusar</button><button class="primary-button" type="button" data-action="accept" data-id="${order.id}">Confirmar ${icon('check')}</button></div>` : '';
  return `<article class="order-card">
    <div class="order-main"><div class="order-topline"><div class="order-id"><strong>#${escapeHtml(order.id)}</strong><span class="order-time">${escapeHtml(order.time)}</span></div><strong class="order-price">${money(order.total)}</strong></div>
      <p class="order-customer">${escapeHtml(order.customer)}</p><p class="order-description">${order.items.map(escapeHtml).join(' · ')}</p>
      <div class="order-meta"><span class="pill ${className}">${label}</span><span class="pill pill-payment">${order.paid ? 'Pago' : 'Pagar no local'}</span><span class="order-time">${escapeHtml(order.channel)}</span></div>
    </div>
    ${next ? `<div class="order-actions"><small>${order.status === 'new' ? 'Pagamento confirmado' : order.status === 'ready' ? 'Na fila do painel LED' : 'Pedido confirmado'}</small>${next}</div>` : ''}
  </article>`;
}

function renderProducts() {
  const available = state.products.filter((product) => product.available).length;
  const low = state.products.filter((product) => product.stock <= 3 && product.available).length;
  const rows = state.products.map((product) => `<div class="stock-row">
      <span class="product-mark">${product.code}</span><div class="stock-info"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)} · ${product.stock <= 3 ? '<span style="color:#bc6247">Estoque baixo</span>' : 'Estoque disponível'}</small></div>
      <div class="stock-controls"><div class="stepper" aria-label="Quantidade em estoque de ${escapeHtml(product.name)}"><button type="button" data-action="stock" data-id="${product.id}" data-delta="-1" aria-label="Diminuir">−</button><output>${product.stock}</output><button type="button" data-action="stock" data-id="${product.id}" data-delta="1" aria-label="Aumentar">+</button></div><button class="switch" type="button" data-action="availability" data-id="${product.id}" role="switch" aria-checked="${product.available}" aria-label="${product.available ? 'Disponível' : 'Indisponível'}: ${escapeHtml(product.name)}"></button></div>
    </div>`).join('');
  return `${heading('CATÁLOGO', 'Estoque', 'Disponibilidade sincronizada com os pedidos do site.')}
    <section class="metrics" aria-label="Resumo do estoque"><div class="metric"><div><span class="metric-label">Itens disponíveis</span><strong class="metric-value">${available}</strong></div><span class="metric-icon">${icon('box')}</span></div><div class="metric"><div><span class="metric-label">Estoque baixo</span><strong class="metric-value">${low}</strong></div><span class="metric-icon">${icon('spark')}</span></div><div class="metric"><div><span class="metric-label">Itens no catálogo</span><strong class="metric-value">${state.products.length}</strong></div><span class="metric-icon">${icon('bag')}</span></div></section>
    <section><div class="section-head"><div><h2>Itens do cardápio</h2><p>Atualize quantidade ou pause um item.</p></div></div><div class="stock-list">${rows}</div></section>`;
}

function automationRow(key, symbol, title, description) {
  const enabled = state.automations[key];
  return `<div class="automation-row"><span class="automation-icon">${icon(symbol)}</span><div class="automation-copy"><strong>${title}</strong><small>${description}</small></div><button class="switch" type="button" data-action="automation" data-key="${key}" role="switch" aria-checked="${enabled}" aria-label="${title}: ${enabled ? 'ativado' : 'desativado'}"></button></div>`;
}

function renderAutomation() {
  const rows = state.logs.length ? state.logs.map((entry) => `<div class="log-entry"><span class="log-dot"></span><div><strong>${escapeHtml(entry.text)}</strong><time>${escapeHtml(entry.time)}</time></div></div>`).join('') : '<p class="heading-note">As próximas ações automáticas aparecerão aqui.</p>';
  return `${heading('REGRAS E DISPOSITIVOS', 'Automação', 'Escolha o que acontece quando um pedido muda de etapa.')}
    <section><div class="section-head"><div><h2>Regras automáticas</h2><p>As alterações ficam salvas neste aparelho.</p></div></div><div class="automation-list">
      ${automationRow('autoAccept', 'spark', 'Confirmar pedidos pagos', 'Aceita pedidos do site assim que o pagamento é aprovado.')}
      ${automationRow('print', 'printer', 'Enviar para impressora', 'Gera a via de produção quando um pedido é confirmado.')}
      ${automationRow('led', 'led', 'Painel de retirada', 'Exibe o número do pedido assim que ele fica pronto.')}
      ${automationRow('lowStock', 'box', 'Aviso de estoque baixo', 'Sinaliza itens com 3 unidades ou menos.')}
    </div><div class="status-line"><span class="store-dot"></span> Integrações em modo de demonstração</div></section>
    <section><div class="section-head"><div><h2>Atividade recente</h2><p>Últimas ações do fluxo de pedidos.</p></div></div><div class="log-list">${rows}</div></section>`;
}

function render() {
  main.innerHTML = activeView === 'products' ? renderProducts() : activeView === 'automation' ? renderAutomation() : renderOrders();
  document.querySelector('#nav-count').textContent = pendingOrders().length;
  document.querySelector('#nav-count').hidden = pendingOrders().length === 0;
  document.querySelector('#nav-alert').hidden = !state.products.some((product) => product.stock <= 3 && product.available) || !state.automations.lowStock;
  const storeButton = document.querySelector('#store-toggle');
  storeButton.classList.toggle('is-closed', !state.storeOpen);
  storeButton.setAttribute('aria-pressed', String(state.storeOpen));
  document.querySelector('#store-label').textContent = state.storeOpen ? 'Loja aberta' : 'Loja pausada';
  persist();
}

function acceptOrder(order) {
  order.status = 'preparing';
  order.time = 'agora';
  addLog(`Pedido #${order.id} confirmado e enviado para produção`);
  if (state.automations.print) addLog(`Pedido #${order.id} enviado para impressão`);
  showToast(state.automations.print ? 'Pedido confirmado · enviado para impressão' : 'Pedido confirmado');
}

function advanceOrder(order) {
  if (order.status === 'preparing') {
    order.status = 'ready';
    addLog(state.automations.led ? `Pedido #${order.id} enviado ao painel de retirada` : `Pedido #${order.id} marcado como pronto`);
    showToast(state.automations.led ? 'Pedido pronto · painel LED atualizado' : 'Pedido marcado como pronto');
  } else if (order.status === 'ready') {
    order.status = 'delivered';
    addLog(`Pedido #${order.id} entregue · painel liberado`);
    showToast('Pedido entregue · próximo número liberado');
  }
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#store-toggle').addEventListener('click', () => {
  state.storeOpen = !state.storeOpen;
  addLog(state.storeOpen ? 'Loja reaberta para novos pedidos' : 'Loja pausada para novos pedidos');
  showToast(state.storeOpen ? 'Loja aberta para novos pedidos' : 'Novos pedidos pausados');
  render();
});

document.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-filter]');
  if (filter) { activeFilter = filter.dataset.filter; render(); return; }
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const order = state.orders.find((item) => item.id === control.dataset.id);
  const product = state.products.find((item) => item.id === control.dataset.id);
  switch (control.dataset.action) {
    case 'accept': if (order) acceptOrder(order); break;
    case 'reject':
      if (order) { order.status = 'rejected'; addLog(`Pedido #${order.id} recusado`); showToast(`Pedido #${order.id} recusado`); }
      break;
    case 'advance': if (order) advanceOrder(order); break;
    case 'stock': if (product) product.stock = Math.max(0, product.stock + Number(control.dataset.delta)); break;
    case 'availability':
      if (product) { product.available = !product.available; showToast(`${product.name}: ${product.available ? 'disponível' : 'pausado no site'}`); }
      break;
    case 'automation':
      state.automations[control.dataset.key] = !state.automations[control.dataset.key];
      showToast(`Automação ${state.automations[control.dataset.key] ? 'ativada' : 'desativada'}`);
      break;
    case 'simulate': {
      const id = String(Math.max(...state.orders.map((item) => Number(item.id))) + 1);
      const newOrder = { id, customer: 'Cliente de demonstração', items: ['1x Sanduíche da casa', '1x Cold brew'], total: 34, channel: 'Site', status: 'new', time: 'agora', paid: true, created: Date.now() };
      state.orders.unshift(newOrder);
      addLog(`Novo pedido #${id} recebido pelo site`);
      if (state.automations.autoAccept) acceptOrder(newOrder); else showToast(`Novo pedido #${id} aguardando confirmação`);
      break;
    }
  }
  render();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
render();