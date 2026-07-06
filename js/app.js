/* ── 物居 PWA — Main Application ── */

// ── Constants ──
const CATEGORIES = ['食品', '药品', '衣物', '工具', '电子', '文具', '清洁', '装饰', '其他'];

const CAT_ICONS = {
  '食品': '🍎', '药品': '💊', '衣物': '👕', '工具': '🔧',
  '电子': '📺', '文具': '✏️', '清洁': '🧹', '装饰': '🎨', '其他': '📦'
};

const RELATION_TYPES = ['属于', '搭配', '替换', '备用'];

const CONTAINER_ICONS = ['🏠','🍽️','❄️','🗄️','👕','📚','🔨','💊','📁','📦','🧳','🧊'];

const CONTAINER_COLORS = [
  { label: '蓝', hex: '#5B8FF9' }, { label: '绿', hex: '#5AD8A6' },
  { label: '橙', hex: '#F6BD16' }, { label: '红', hex: '#E8684A' },
  { label: '紫', hex: '#9270CA' }, { label: '青', hex: '#6DC8EC' },
  { label: '粉', hex: '#FF99C3' }, { label: '灰', hex: '#8C8C8C' }
];

// ── App State ──
const state = {
  screen: 'tabs',      // current screen
  params: {},          // screen params
  tab: 'items',        // active tab
  stack: [],           // navigation stack for back button

  // Item list filters
  itemSearch: '',
  itemCategory: null,
  itemSort: 'name',

  // Expand state for container tree
  expandedContainers: new Set(),
};

// ── Utility ──
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'onclick') el.addEventListener('click', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'disabled' || k === 'selected' || k === 'checked') { if (v) el.setAttribute(k, ''); }
    else el.setAttribute(k, v);
  }
  function append(c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(append); return; }
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else if (c instanceof Node) el.appendChild(c);
  }
  children.forEach(append);
  return el;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isExpired(expiryDate) { return expiryDate && expiryDate < Date.now(); }
function isExpiringSoon(expiryDate) { return expiryDate && !isExpired(expiryDate) && expiryDate <= Date.now() + 7*86400000; }

// ── Navigation ──
function navigate(screen, params = {}) {
  if (state.screen === 'tabs') {
    state.stack = [{ screen: 'tabs', params: { tab: state.tab } }];
  }
  state.stack.push({ screen, params: { ...params } });
  state.screen = screen;
  state.params = params;
  render();
}

function goBack() {
  if (state.stack.length > 1) {
    state.stack.pop(); // discard current
    const prev = state.stack[state.stack.length - 1];
    state.screen = prev.screen;
    state.params = prev.params;
    if (state.screen === 'tabs') state.tab = prev.params.tab || 'items';
    state.stack.pop(); // remove the replayed entry
  } else {
    state.screen = 'tabs';
    state.params = {};
    state.stack = [];
  }
  render();
}

function switchTab(tab) {
  state.tab = tab;
  state.screen = 'tabs';
  state.params = {};
  state.stack = [];
  state.expandedContainers = new Set();
  render();
}

// ── Render Engine ──
async function render() {
  const header = $('#header');
  const content = $('#content');
  const tabs = $('#tabs');
  const backBtn = header.querySelector('.back');
  const titleEl = header.querySelector('.title');
  const actionBtn = header.querySelector('.action');

  // Show/hide tabs
  tabs.style.display = (state.screen === 'tabs') ? 'flex' : 'none';
  backBtn.style.display = (state.screen === 'tabs') ? 'none' : 'block';
  actionBtn.style.display = 'none';

  content.innerHTML = '';
  header.className = '';

  if (state.screen === 'tabs') {
    titleEl.textContent = '物居';
    updateTabBar();
    // Set action button based on tab
    actionBtn.style.display = (state.tab === 'alerts') ? 'none' : 'block';
    actionBtn.innerHTML = '';
    if (state.tab === 'items') {
      actionBtn.appendChild(h('span', { className: 'add-btn', onclick: () => navigate('item-edit', {}) }, '+'));
    } else if (state.tab === 'spaces') {
      actionBtn.appendChild(h('span', { className: 'add-btn', onclick: () => navigate('container-edit', {}) }, '+'));
    }
    switch (state.tab) {
      case 'items': await renderItemList(content); break;
      case 'spaces': await renderContainerTree(content); break;
      case 'alerts': await renderAlertView(content); break;
    }
  } else {
    switch (state.screen) {
      case 'item-detail': await renderItemDetail(content, state.params.itemId); break;
      case 'item-edit': await renderItemEdit(content, state.params.itemId || null); break;
      case 'container-detail': await renderContainerDetail(content, state.params.containerId); break;
      case 'container-edit': await renderContainerEdit(content, state.params.containerId || null, state.params.parentId || null); break;
      case 'relation-edit': await renderRelationEdit(content, state.params.itemId); break;
    }
  }

  // Update title after render (some screens set their own)
  if (state.screen === 'item-detail') titleEl.textContent = '物品详情';
  else if (state.screen === 'item-edit') titleEl.textContent = state.params.itemId ? '编辑物品' : '添加物品';
  else if (state.screen === 'container-detail') titleEl.textContent = '容器详情';
  else if (state.screen === 'container-edit') titleEl.textContent = state.params.containerId ? '编辑容器' : '新建容器';
  else if (state.screen === 'relation-edit') titleEl.textContent = '关联物品';
}

function updateTabBar() {
  const tabs = $$('#tabs .tab');
  tabs.forEach(t => t.classList.remove('active'));
  const active = $(`#tabs .tab[data-tab="${state.tab}"]`);
  if (active) active.classList.add('active');
}

// ── Tab: 物品列表 ──
async function renderItemList(container) {
  const search = state.itemSearch;
  const category = state.itemCategory;

  // Search bar — only create once, keep DOM reference
  const existingSearch = container.querySelector('.search-bar');
  if (!existingSearch) {
    container.appendChild(
      h('div', { className: 'search-bar' }, [
        h('span', {}, '🔍'),
        h('input', {
          type: 'text', placeholder: '搜索物品...', value: search,
          oninput: (e) => { state.itemSearch = e.target.value; refreshItemList(); }
        }),
        h('button', {
          className: 'clear-btn',
          style: search ? '' : 'display:none',
          onclick: () => { state.itemSearch = ''; render(); }
        }, '✕')
      ])
    );
  } else {
    // Update existing search bar without destroying it
    const input = existingSearch.querySelector('input');
    const clearBtn = existingSearch.querySelector('.clear-btn');
    if (input && input !== document.activeElement) input.value = search;
    if (clearBtn) clearBtn.style.display = search ? '' : 'none';
  }
  container.appendChild(h('div', { id: 'item-list-wrap' }));

  // Category chips
  const chipRow = h('div', { className: 'chip-scroll' });
  chipRow.appendChild(h('button', {
    className: 'chip' + (category === null ? ' selected' : ''),
    onclick: () => { state.itemCategory = null; render(); }
  }, '全部'));
  CATEGORIES.forEach(cat => {
    chipRow.appendChild(h('button', {
      className: 'chip' + (category === cat ? ' selected' : ''),
      onclick: () => { state.itemCategory = (category === cat ? null : cat); render(); }
    }, CAT_ICONS[cat] + ' ' + cat));
  });
  container.appendChild(chipRow);

  // Sort segment
  const seg = h('div', { className: 'segment' });
  ['name', 'date', 'expiry'].forEach(s => {
    seg.appendChild(h('button', {
      className: state.itemSort === s ? 'active' : '',
      onclick: () => { state.itemSort = s; render(); }
    }, s === 'name' ? '名称' : s === 'date' ? '时间' : '到期'));
  });
  container.appendChild(seg);

  await renderItemRows();
}

async function renderItemRows() {
  const wrap = document.getElementById('item-list-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const search = state.itemSearch;
  const category = state.itemCategory;

  let items = await getItemsSorted(state.itemSort);
  if (category) items = items.filter(i => i.category === category);
  if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (items.length === 0) {
    wrap.appendChild(emptyView(search || category ? '🔍' : '📦', search || category ? '没有找到' : '还没有物品', search || category ? '试试其他关键词' : '点击右上角 + 添加第一个物品'));
    return;
  }

  const list = h('div', { className: 'card-row-group' });
  items.forEach(item => {
    const row = h('div', { className: 'card-row item-row', onclick: () => navigate('item-detail', { itemId: item.id }) }, [
      h('span', { className: 'cat-icon' }, CAT_ICONS[item.category] || '📦'),
      h('div', { className: 'info' }, [
        h('div', { className: 'name' }, item.name),
        item.containerId ? h('div', { className: 'sub' }, '') : ''
      ]),
      h('div', { className: 'badges' }, [
        isExpired(item.expiryDate) ? h('span', { className: 'badge badge-red' }, '过期') : '',
        !isExpired(item.expiryDate) && isExpiringSoon(item.expiryDate) ? h('span', { className: 'badge badge-orange' }, '将过期') : '',
        item.quantity != null ? h('span', { className: 'qty' }, '×' + item.quantity) : '',
      ]),
      h('span', { className: 'chevron' }, '›')
    ]);
    if (item.containerId) {
      getContainerPath(item.containerId).then(path => {
        const sub = row.querySelector('.sub');
        if (sub) sub.textContent = path.map(c => c.name).join(' > ');
      });
    }
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

// Refresh items only — doesn't touch search bar or filters
function refreshItemList() {
  renderItemRows();
}

function emptyView(icon, title, desc) {
  return h('div', { className: 'empty' }, [
    h('div', { className: 'icon' }, icon),
    h('div', { className: 'title' }, title),
    h('div', {}, desc)
  ]);
}

// ── Tab: 容器树 ──
async function renderContainerTree(container) {
  const roots = await getRootContainers();
  if (roots.length === 0) {
    container.appendChild(emptyView('🗂️', '还没有容器', '点击右上角 + 创建第一个容器'));
    return;
  }

  const list = h('div', { className: 'card-row-group' });
  for (const root of roots) {
    const nodes = await renderContainerNodes(root, 0);
    nodes.forEach(n => list.appendChild(n));
  }
  container.appendChild(list);
}

async function renderContainerNodes(container, level) {
  const nodes = [];
  const totalItems = await getContainerTotalItems(container.id);
  const children = await db.containers.where('parentId').equals(container.id).toArray();
  children.sort((a, b) => a.sortOrder - b.sortOrder);
  const isExpanded = state.expandedContainers.has(container.id);

  const row = h('div', { className: 'tree-row', style: { paddingLeft: (16 + level * 20) + 'px' } }, [
    children.length > 0
      ? h('span', { className: 'expand', onclick: (e) => { e.stopPropagation(); toggleContainerExpand(container.id); } },
          isExpanded ? '▼' : '▶')
      : h('span', { className: 'expand' }, ''),
    h('span', { className: 'container-icon', style: { color: container.color } }, container.icon),
    h('span', { className: 'container-name', onclick: () => navigate('container-detail', { containerId: container.id }) }, container.name),
    h('span', { className: 'container-count' }, totalItems + ' 件'),
    h('span', { className: 'chevron', onclick: () => navigate('container-detail', { containerId: container.id }) }, '›')
  ]);
  nodes.push(row);

  if (isExpanded && children.length > 0) {
    for (const child of children) {
      const childNodes = await renderContainerNodes(child, level + 1);
      nodes.push(...childNodes);
    }
  }
  return nodes;
}

function toggleContainerExpand(id) {
  if (state.expandedContainers.has(id)) {
    state.expandedContainers.delete(id);
  } else {
    state.expandedContainers.add(id);
  }
  render();
}

// ── Tab: 提醒 ──
async function renderAlertView(container) {
  const expired = await getExpiredItems();
  const expiringSoon = await getExpiringSoonItems();
  const lowStock = await getLowStockItems();

  let hasAny = false;

  if (expired.length > 0) {
    hasAny = true;
    const sec = h('div', { className: 'alert-section' });
    sec.appendChild(h('div', { className: 'alert-header', style: 'color:var(--red)' }, ['❌', '已过期', h('span', { className: 'count' }, '(' + expired.length + ')')]));
    const group = h('div', { className: 'card-row-group' });
    expired.forEach(item => {
      group.appendChild(h('div', { className: 'card-row', onclick: () => navigate('item-detail', { itemId: item.id }) }, [
        h('span', { style: 'color:var(--red);margin-right:8px' }, '⚠️'),
        h('span', { style: 'flex:1;font-weight:500' }, item.name),
        h('span', { style: 'color:var(--red);font-size:13px' }, '已过期'),
        h('span', { className: 'chevron' }, '›')
      ]));
    });
    sec.appendChild(group);
    container.appendChild(sec);
  }

  if (expiringSoon.length > 0) {
    hasAny = true;
    const sec = h('div', { className: 'alert-section' });
    sec.appendChild(h('div', { className: 'alert-header', style: 'color:var(--orange)' }, ['⏰', '即将过期', h('span', { className: 'count' }, '(' + expiringSoon.length + ')')]));
    const group = h('div', { className: 'card-row-group' });
    expiringSoon.forEach(item => {
      const daysLeft = Math.ceil((item.expiryDate - Date.now()) / 86400000);
      group.appendChild(h('div', { className: 'card-row', onclick: () => navigate('item-detail', { itemId: item.id }) }, [
        h('span', { style: 'color:var(--orange);margin-right:8px' }, '⏳'),
        h('span', { style: 'flex:1;font-weight:500' }, item.name),
        h('span', { style: 'color:var(--orange);font-size:13px' }, daysLeft + '天后'),
        h('span', { className: 'chevron' }, '›')
      ]));
    });
    sec.appendChild(group);
    container.appendChild(sec);
  }

  if (lowStock.length > 0) {
    hasAny = true;
    const sec = h('div', { className: 'alert-section' });
    sec.appendChild(h('div', { className: 'alert-header', style: 'color:#CC9900' }, ['📉', '低库存', h('span', { className: 'count' }, '(' + lowStock.length + ')')]));
    const group = h('div', { className: 'card-row-group' });
    lowStock.forEach(item => {
      group.appendChild(h('div', { className: 'card-row', onclick: () => navigate('item-detail', { itemId: item.id }) }, [
        h('span', { style: 'color:#CC9900;margin-right:8px' }, '📊'),
        h('span', { style: 'flex:1;font-weight:500' }, item.name),
        h('span', { style: 'font-size:13px;color:var(--text-secondary)' }, '仅剩 ' + (item.quantity || 0)),
        h('span', { className: 'chevron' }, '›')
      ]));
    });
    sec.appendChild(group);
    container.appendChild(sec);
  }

  if (!hasAny) {
    container.appendChild(h('div', { className: 'alert-empty' }, [
      h('div', { className: 'icon' }, '✅'),
      h('div', { className: 'title' }, '一切正常'),
      h('div', {}, '没有需要关注的物品提醒')
    ]));
  }
}

// ── 物品详情 ──
async function renderItemDetail(container, itemId) {
  const item = await db.items.get(itemId);
  if (!item) { container.textContent = '物品不存在'; return; }

  const wrapper = h('div', {});

  // Header
  wrapper.appendChild(h('div', { className: 'detail-header' }, [
    h('div', { className: 'cat-icon' }, CAT_ICONS[item.category] || '📦'),
    h('div', {}, [
      h('div', { className: 'title' }, item.name),
      h('div', { className: 'meta' }, [
        h('span', { className: 'cat-tag' }, item.category),
        item.quantity != null ? h('span', { style: 'font-size:14px;color:var(--text-secondary)' }, '×' + item.quantity) : ''
      ])
    ])
  ]));

  // Info section
  const infoRows = [];
  infoRows.push(rowItem('📅 添加日期', formatDate(item.addedDate)));

  if (item.expiryDate) {
    const expired = isExpired(item.expiryDate);
    const soon = isExpiringSoon(item.expiryDate);
    const cls = expired ? 'expired' : soon ? 'warning' : '';
    const badge = expired ? h('span', { className: 'badge badge-red', style: 'margin-left:6px' }, '已过期') : '';
    infoRows.push(h('div', { className: 'detail-row' }, [
      h('span', { className: 'label' }, '⏰ 保质期'),
      h('span', { className: 'value ' + cls }, formatDate(item.expiryDate)),
      badge
    ]));
  }

  if (item.containerId) {
    const path = await getContainerPath(item.containerId);
    infoRows.push(rowLink('📍 所在位置', path.map(c => c.name).join(' > '), () => navigate('container-detail', { containerId: item.containerId })));
  }

  wrapper.appendChild(sectionBlock('基本信息', infoRows));

  // Relations
  const related = await getItemRelations(itemId);
  if (related.length > 0) {
    const relRows = related.map(({ relation, item: ri }) =>
      h('div', { className: 'detail-row', onclick: () => navigate('item-detail', { itemId: ri.id }), style: 'cursor:pointer' }, [
        h('span', { className: 'relation-chip' }, relation.relationType),
        h('span', { className: 'value', style: 'text-align:left' }, ri.name),
        h('span', { className: 'chevron' }, '›')
      ])
    );
    // Management link
    relRows.push(h('div', { className: 'detail-row', onclick: () => navigate('relation-edit', { itemId }), style: 'cursor:pointer;justify-content:center;color:var(--tint)' }, '🔗 管理关联'));
    wrapper.appendChild(sectionBlock('关联物品', relRows));
  } else {
    wrapper.appendChild(sectionBlock('关联物品', [
      h('div', { className: 'detail-row', onclick: () => navigate('relation-edit', { itemId }), style: 'cursor:pointer;justify-content:center;color:var(--tint)' }, '🔗 添加关联')
    ]));
  }

  // Notes
  if (item.notes) {
    wrapper.appendChild(sectionBlock('备注', [
      h('div', { className: 'detail-row', style: 'flex-direction:column;align-items:flex-start;gap:4px' }, [
        h('span', { style: 'color:var(--text-secondary);font-size:14px' }, item.notes)
      ])
    ]));
  }

  container.appendChild(wrapper);

  // Action buttons in header
  const actionBtn = $('#header .action');
  actionBtn.style.display = 'block';
  actionBtn.innerHTML = '';
  actionBtn.appendChild(h('span', { onclick: () => navigate('item-edit', { itemId }), style: 'margin-right:8px' }, '编辑'));
  actionBtn.appendChild(h('span', { onclick: () => showDeleteDialog('物品', item.name, async () => {
    await deleteItemRelations(itemId);
    await db.items.delete(itemId);
    goBack();
  }), style: 'color:var(--red)' }, '🗑'));
}

// ── 物品编辑 ──
async function renderItemEdit(container, itemId) {
  const item = itemId ? await db.items.get(itemId) : null;
  const isEdit = !!item;

  const form = h('div', { className: 'form' });

  // Name
  form.appendChild(formGroup('物品名称', h('input', { type: 'text', id: 'edit-name', value: item?.name || '', placeholder: '输入物品名称' })));

  // Quantity toggle
  const hasQty = item?.quantity != null;
  form.appendChild(toggleField('记录数量', 'edit-has-qty', hasQty, 'edit-qty-row'));
  const qtyRow = h('div', { id: 'edit-qty-row', style: hasQty ? '' : 'display:none' }, [
    h('input', { type: 'number', id: 'edit-qty', value: item?.quantity || 1, min: '0', placeholder: '数量' })
  ]);
  form.appendChild(formGroup('', qtyRow));

  // Category
  const catSelect = h('select', { id: 'edit-category' });
  CATEGORIES.forEach(cat => {
    catSelect.appendChild(h('option', { value: cat, selected: item?.category === cat || (!item && cat === '其他') ? 'selected' : undefined },
      CAT_ICONS[cat] + ' ' + cat));
  });
  form.appendChild(formGroup('分类', catSelect));

  // Expiry toggle
  const hasExpiry = !!item?.expiryDate;
  form.appendChild(toggleField('设置保质期', 'edit-has-expiry', hasExpiry, 'edit-expiry-row'));
  const expiryInput = h('input', { type: 'date', id: 'edit-expiry', value: item?.expiryDate ? formatDate(item.expiryDate) : formatDate(Date.now()) });
  form.appendChild(formGroup('', h('div', { id: 'edit-expiry-row', style: hasExpiry ? '' : 'display:none' }, [expiryInput])));

  // Container
  const allContainers = await db.containers.orderBy('name').toArray();
  const contSelect = h('select', { id: 'edit-container' });
  contSelect.appendChild(h('option', { value: '', selected: !item?.containerId ? 'selected' : undefined }, '未归类'));
  for (const c of allContainers) {
    const path = await getContainerPath(c.id);
    contSelect.appendChild(h('option', {
      value: c.id,
      selected: item?.containerId === c.id ? 'selected' : undefined
    }, path.map(p => p.name).join(' > ')));
  }
  form.appendChild(formGroup('存放位置', contSelect));

  // Notes
  form.appendChild(formGroup('备注', h('textarea', { id: 'edit-notes' }, item?.notes || '')));

  container.appendChild(form);

  // Save button in header
  const actionBtn = $('#header .action');
  actionBtn.style.display = 'block';
  actionBtn.innerHTML = '';
  actionBtn.appendChild(h('span', { onclick: async () => {
    const name = $('#edit-name').value.trim();
    if (!name) return;

    const data = {
      name,
      quantity: document.getElementById('edit-has-qty').classList.contains('on') ? parseInt($('#edit-qty').value) || null : null,
      category: $('#edit-category').value,
      expiryDate: document.getElementById('edit-has-expiry').classList.contains('on') ? new Date($('#edit-expiry').value).getTime() : null,
      containerId: $('#edit-container').value,
      notes: $('#edit-notes').value
    };

    if (isEdit) {
      await db.items.update(itemId, data);
    } else {
      await db.items.put({
        id: uuid(),
        ...data,
        addedDate: Date.now()
      });
    }
    goBack();
  }}, '保存'));
}

// ── 容器详情 ──
async function renderContainerDetail(container, containerId) {
  const c = await db.containers.get(containerId);
  if (!c) { container.textContent = '容器不存在'; return; }

  const wrapper = h('div', {});

  const path = await getContainerPath(containerId);
  wrapper.appendChild(h('div', { className: 'detail-header' }, [
    h('div', { className: 'cat-icon', style: `color:${c.color}` }, c.icon),
    h('div', {}, [
      h('div', { className: 'title' }, c.name),
      h('div', { style: 'font-size:13px;color:var(--text-secondary);margin-top:4px' }, path.map(p => p.name).join(' > '))
    ])
  ]));

  // Sub-containers
  const children = await db.containers.where('parentId').equals(containerId).toArray();
  children.sort((a, b) => a.sortOrder - b.sortOrder);
  if (children.length > 0) {
    const childRows = [];
    for (const child of children) {
      const total = await getContainerTotalItems(child.id);
      childRows.push(h('div', { className: 'detail-row', onclick: () => navigate('container-detail', { containerId: child.id }), style: 'cursor:pointer' }, [
        h('span', { style: `color:${child.color};margin-right:8px` }, child.icon),
        h('span', { style: 'flex:1' }, child.name),
        h('span', { style: 'color:var(--text-secondary);font-size:13px' }, total + ' 件'),
        h('span', { className: 'chevron' }, '›')
      ]));
    }
    wrapper.appendChild(sectionBlock('子容器', childRows));
  }

  // Items in this container
  const items = await db.items.where('containerId').equals(containerId).toArray();
  if (items.length > 0) {
    const itemRows = items.map(item =>
      h('div', { className: 'detail-row', onclick: () => navigate('item-detail', { itemId: item.id }), style: 'cursor:pointer' }, [
        h('span', { style: 'margin-right:8px' }, CAT_ICONS[item.category] || '📦'),
        h('span', { style: 'flex:1;font-weight:500' }, item.name),
        item.quantity != null ? h('span', { style: 'color:var(--text-secondary);font-size:13px' }, '×' + item.quantity) : '',
        h('span', { className: 'chevron' }, '›')
      ])
    );
    wrapper.appendChild(sectionBlock('物品 (' + items.length + ')', itemRows));
  } else {
    wrapper.appendChild(sectionBlock('物品 (0)', [
      h('div', { className: 'detail-row', style: 'color:var(--text-secondary)' }, '此容器中没有物品')
    ]));
  }

  container.appendChild(wrapper);

  // Header actions
  const actionBtn = $('#header .action');
  actionBtn.style.display = 'block';
  actionBtn.innerHTML = '';
  actionBtn.appendChild(h('span', { onclick: () => navigate('container-edit', { containerId: c.id, parentId: c.parentId }), style: 'margin-right:8px' }, '编辑'));
  actionBtn.appendChild(h('span', { onclick: () => showDeleteDialog('容器', c.name + '（子容器将被一并删除）', async () => {
    await deleteContainerCascade(containerId);
    goBack();
  }), style: 'color:var(--red)' }, '🗑'));
}

// ── 容器编辑 ──
async function renderContainerEdit(container, containerId, presetParentId) {
  const c = containerId ? await db.containers.get(containerId) : null;
  const isEdit = !!c;

  const form = h('div', { className: 'form' });
  form.appendChild(formGroup('容器名称', h('input', { type: 'text', id: 'cedit-name', value: c?.name || '', placeholder: '输入容器名称' })));

  // Icon picker
  const iconGrid = h('div', { className: 'icon-grid' });
  CONTAINER_ICONS.forEach(icon => {
    iconGrid.appendChild(h('button', {
      className: 'icon-btn' + ((c?.icon || '📁') === icon ? ' selected' : ''),
      onclick: function() {
        iconGrid.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
      }
    }, icon));
  });
  form.appendChild(formGroup('图标', iconGrid));

  // Color picker
  const colorGrid = h('div', { className: 'color-grid' });
  CONTAINER_COLORS.forEach(({ label, hex }) => {
    colorGrid.appendChild(h('button', {
      className: 'color-btn' + ((c?.color || '#5B8FF9') === hex ? ' selected' : ''),
      onclick: function() {
        colorGrid.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
      }
    }, [
      h('div', { className: 'circle', style: `background:${hex}` }),
      h('span', { className: 'label' }, label)
    ]));
  });
  form.appendChild(formGroup('颜色标签', colorGrid));

  // Parent
  const roots = await getRootContainers();
  const parentSelect = h('select', { id: 'cedit-parent' });
  parentSelect.appendChild(h('option', { value: '', selected: (!isEdit && !presetParentId) || c?.parentId === '' ? 'selected' : undefined }, '顶层（无父容器）'));
  for (const root of roots) {
    if (root.id === containerId) continue; // can't be its own parent
    parentSelect.appendChild(h('option', {
      value: root.id,
      selected: c?.parentId === root.id || (!isEdit && presetParentId === root.id) ? 'selected' : undefined
    }, root.icon + ' ' + root.name));
  }
  form.appendChild(formGroup('父容器', parentSelect));

  // Notes
  form.appendChild(formGroup('备注', h('textarea', { id: 'cedit-notes' }, c?.notes || '')));

  container.appendChild(form);

  const actionBtn = $('#header .action');
  actionBtn.style.display = 'block';
  actionBtn.innerHTML = '';
  actionBtn.appendChild(h('span', { onclick: async () => {
    const name = $('#cedit-name').value.trim();
    if (!name) return;

    const iconEl = container.querySelector('.icon-btn.selected');
    const colorEl = container.querySelector('.color-btn.selected');
    const icon = iconEl ? iconEl.textContent : '📁';
    const color = colorEl ? colorEl.querySelector('.circle').style.background : '#5B8FF9';
    const parentId = $('#cedit-parent').value;
    const notes = $('#cedit-notes').value;

    if (isEdit) {
      await db.containers.update(containerId, { name, icon, color, parentId, notes });
    } else {
      const maxSort = await db.containers.where('parentId').equals(parentId).count();
      await db.containers.put({
        id: uuid(), name, icon, color, sortOrder: maxSort,
        notes, parentId, createdAt: Date.now()
      });
    }
    goBack();
  }}, '保存'));
}

// ── 关联编辑 ──
async function renderRelationEdit(container, itemId) {
  const item = await db.items.get(itemId);
  if (!item) { container.textContent = '物品不存在'; return; }

  const wrapper = h('div', {});

  // Existing relations
  const related = await getItemRelations(itemId);
  if (related.length > 0) {
    const rows = related.map(({ relation, item: ri }) =>
      h('div', { className: 'detail-row', style: 'justify-content:flex-start;gap:8px' }, [
        h('span', { className: 'relation-chip' }, relation.relationType),
        h('span', { style: 'flex:1' }, ri.name),
        h('button', {
          style: 'background:none;border:none;color:var(--red);cursor:pointer;font-size:16px',
          onclick: async () => {
            await db.relations.delete(relation.id);
            render();
          }
        }, '✕')
      ])
    );
    wrapper.appendChild(sectionBlock('已有关联', rows));
  } else {
    wrapper.appendChild(sectionBlock('已有关联', [
      h('div', { className: 'detail-row', style: 'color:var(--text-secondary)' }, '暂无关联')
    ]));
  }

  // Add new relation
  const allItems = await db.items.toArray();
  const available = allItems.filter(i => i.id !== itemId);

  if (available.length > 0) {
    const addSection = h('div', { className: 'detail-section', style: 'margin-top:16px' });
    addSection.appendChild(h('div', { className: 'section-title' }, '添加关联'));

    const targetSelect = h('select', { id: 'rel-target', style: 'width:100%;padding:12px;border:1px solid var(--separator);border-radius:8px;font-size:15px;margin-bottom:8px' });
    targetSelect.appendChild(h('option', { value: '' }, '选择物品...'));
    available.forEach(i => targetSelect.appendChild(h('option', { value: i.id }, i.name)));

    const typeSelect = h('select', { id: 'rel-type', style: 'width:100%;padding:12px;border:1px solid var(--separator);border-radius:8px;font-size:15px;margin-bottom:8px' });
    RELATION_TYPES.forEach(t => typeSelect.appendChild(h('option', { value: t }, t)));

    const notesInput = h('input', { type: 'text', id: 'rel-notes', placeholder: '关联说明（可选）', style: 'width:100%;padding:12px;border:1px solid var(--separator);border-radius:8px;font-size:15px' });

    const addBtn = h('button', {
      className: 'btn btn-primary',
      style: 'width:100%;margin-top:12px',
      onclick: async () => {
        const targetId = $('#rel-target').value;
        if (!targetId) return;
        await db.relations.put({
          id: uuid(),
          sourceId: itemId,
          targetId,
          relationType: $('#rel-type').value,
          notes: $('#rel-notes').value,
          createdAt: Date.now()
        });
        render();
      }
    }, '添加关联');

    addSection.appendChild(targetSelect);
    addSection.appendChild(typeSelect);
    addSection.appendChild(notesInput);
    addSection.appendChild(addBtn);
    wrapper.appendChild(addSection);
  }

  container.appendChild(wrapper);
}

// ── Helper UI functions ──
function sectionBlock(title, rows) {
  const sec = h('div', { className: 'detail-section' });
  sec.appendChild(h('div', { className: 'section-title' }, title));
  const card = h('div', { className: 'card-row-group' });
  rows.forEach(r => card.appendChild(r));
  sec.appendChild(card);
  return sec;
}

function rowItem(label, value) {
  return h('div', { className: 'detail-row' }, [
    h('span', { className: 'label' }, label),
    h('span', { className: 'value' }, value)
  ]);
}

function rowLink(label, value, onclick) {
  return h('div', { className: 'detail-row', onclick, style: 'cursor:pointer' }, [
    h('span', { className: 'label' }, label),
    h('span', { className: 'value' }, value),
    h('span', { className: 'chevron' }, '›')
  ]);
}

function formGroup(label, child) {
  const g = h('div', { className: 'form-group' });
  if (label) g.appendChild(h('label', {}, label));
  g.appendChild(child);
  return g;
}

function toggleField(label, id, initial, targetId) {
  const row = h('div', { className: 'toggle-row' });
  row.appendChild(h('label', {}, label));
  const toggle = h('button', { className: 'toggle' + (initial ? ' on' : ''), id });
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('on');
    const target = document.getElementById(targetId);
    if (target) target.style.display = toggle.classList.contains('on') ? '' : 'none';
  });
  row.appendChild(toggle);
  return row;
}

function showDeleteDialog(type, name, onConfirm) {
  const overlay = h('div', { className: 'overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } }, [
    h('div', { className: 'dialog' }, [
      h('div', { className: 'msg' }, '确定要删除「' + name + '」吗？'),
      h('div', { className: 'btns' }, [
        h('button', { style: 'background:#E5E5EA;color:var(--text)', onclick: () => overlay.remove() }, '取消'),
        h('button', { style: 'background:var(--red);color:#fff', onclick: () => { overlay.remove(); onConfirm(); } }, '删除')
      ])
    ])
  ]);
  document.body.appendChild(overlay);
}

// ── Initialize ──
async function init() {
  try {
    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/wuju-pwa/sw.js');
      } catch (e) { /* offline or no support */ }
    }

    // Seed sample data
    try {
      await seedSampleData();
    } catch (e) {
      console.error('seedSampleData failed:', e);
      // Try to proceed anyway — data may already exist
    }

    // Tab click handlers
    $$('#tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Back button
    $('#header .back').addEventListener('click', goBack);

    // First render
    await render();

    // Clear loading status
    var st = document.getElementById('load-status');
    if (st) st.parentElement.style.display = 'none';
  } catch (e) {
    console.error('init failed:', e);
    var content = document.getElementById('content');
    if (content) {
      content.innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--red)">' +
        '<div style="font-size:48px;margin-bottom:12px">⚠️</div>' +
        '<div style="font-weight:600;margin-bottom:8px">初始化失败</div>' +
        '<div style="font-size:13px;color:var(--text-secondary)">' + (e.message || String(e)) + '</div>' +
        '<div style="font-size:12px;color:var(--text-tertiary);margin-top:12px">请确认浏览器未开启无痕模式，并允许本站使用存储</div>' +
        '</div>';
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
