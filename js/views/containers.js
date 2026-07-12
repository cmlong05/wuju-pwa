import { $, h } from '../core/dom.js';
import { state, navigate, goBack, render } from '../core/app-shell.js';
import { db, getRootContainers, getContainerTotalItems, getEligibleParentContainers, deleteContainerCascade, getContainerPath, uuid } from '../db.js';
import { showQRModal, showDeleteDialog, sectionBlock, rowLink, tagIcons, formGroup } from '../ui.js';
import { startContainerParentScan, startContainerItemScan } from '../scanner.js';

const CONTAINER_ICONS = ['🏠','🍽️','❄️','🗄️','👕','📚','🔨','💊','📁','📦','🧳','🧊'];
const CONTAINER_COLORS = [
  { label: '蓝', hex: '#5B8FF9' }, { label: '绿', hex: '#5AD8A6' },
  { label: '橙', hex: '#F6BD16' }, { label: '红', hex: '#E8684A' },
  { label: '紫', hex: '#9270CA' }, { label: '青', hex: '#6DC8EC' },
  { label: '粉', hex: '#FF99C3' }, { label: '灰', hex: '#8C8C8C' }
];

// 递归渲染容器树节点，并在展开时继续渲染子层级。
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

// 切换某个容器树节点的展开状态。
function toggleContainerExpand(id) {
  if (state.expandedContainers.has(id)) {
    state.expandedContainers.delete(id);
  } else {
    state.expandedContainers.add(id);
  }
  render();
}

// 渲染空间 tab 的整棵容器树。
export async function renderContainerTree(container) {
  const roots = await getRootContainers();
  if (roots.length === 0) {
    container.appendChild(h('div', { className: 'empty' }, [
      h('div', { className: 'icon' }, '🗂️'),
      h('div', { className: 'title' }, '还没有容器'),
      h('div', {}, '点击右上角 + 创建第一个容器')
    ]));
    return;
  }

  const list = h('div', { className: 'card-row-group' });
  const allNodeArrays = await Promise.all(roots.map(root => renderContainerNodes(root, 0)));
  allNodeArrays.forEach(nodes => nodes.forEach(n => list.appendChild(n)));
  container.appendChild(list);
}

// 渲染容器详情页，包括父子层级、物品和二维码操作。
export async function renderContainerDetail(container, containerId) {
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

  if (c.image) {
    wrapper.appendChild(h('div', { style: 'padding:12px;text-align:center' }, [
      h('img', { src: c.image, style: 'max-width:100%;max-height:240px;border-radius:10px;border:1px solid var(--border)' })
    ]));
  }

  const parentRows = [];
  if (c.parentId) {
    const parentPath = await getContainerPath(c.parentId);
    parentRows.push(rowLink('📍 ' + parentPath.map(p => p.name).join(' > '), '', () => navigate('container-detail', { containerId: c.parentId })));
    parentRows.push(h('div', { className: 'detail-row', onclick: () => startContainerParentScan(containerId, () => navigate('container-detail', { containerId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描换父容器'));
  } else {
    parentRows.push(h('div', { className: 'detail-row', style: 'color:var(--text-tertiary)' }, '顶级容器（无父容器）'));
    parentRows.push(h('div', { className: 'detail-row', onclick: () => startContainerParentScan(containerId, () => navigate('container-detail', { containerId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描关联父容器'));
  }
  wrapper.appendChild(sectionBlock('📍 父容器', parentRows));

  const children = await db.containers.where('parentId').equals(containerId).toArray();
  children.sort((a, b) => a.sortOrder - b.sortOrder);
  const childRows = [];
  if (children.length > 0) {
    const childTotals = await Promise.all(children.map(child => getContainerTotalItems(child.id)));
    children.forEach((child, idx) => {
      childRows.push(h('div', { className: 'detail-row', onclick: () => navigate('container-detail', { containerId: child.id }), style: 'cursor:pointer' }, [
        h('span', { style: `color:${child.color};margin-right:8px` }, child.icon),
        h('span', { style: 'flex:1' }, child.name),
        h('span', { style: 'color:var(--text-secondary);font-size:13px' }, childTotals[idx] + ' 件'),
        h('span', { className: 'chevron' }, '›')
      ]));
    });
  } else {
    childRows.push(h('div', { className: 'detail-row', style: 'color:var(--text-secondary)' }, '此容器没有子容器'));
  }
  childRows.push(h('div', { className: 'detail-row', onclick: () => navigate('container-edit', { parentId: containerId }), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '➕ 添加子容器'));
  wrapper.appendChild(sectionBlock('子容器', childRows));

  const items = await db.items.where('containerId').equals(containerId).toArray();
  if (items.length > 0) {
    const itemRows = items.map(item =>
      h('div', { className: 'detail-row', onclick: () => navigate('item-detail', { itemId: item.id }), style: 'cursor:pointer;flex-wrap:wrap;gap:4px' }, [
        h('span', { style: 'margin-right:8px' }, '📦'),
        h('span', { style: 'flex:1;font-weight:500' }, item.name),
        (item.tags && item.tags.length > 0)
          ? h('span', { style: 'font-size:10px;color:var(--text-tertiary);margin-right:4px' }, item.tags.slice(0, 3).map(t => tagIcons[t] || '').join(''))
          : '',
        item.quantity != null ? h('span', { style: 'color:var(--text-secondary);font-size:13px' }, '×' + item.quantity) : '',
        h('span', { className: 'chevron' }, '›')
      ])
    );
    itemRows.push(h('div', { className: 'detail-row', onclick: () => startContainerItemScan(containerId, () => navigate('container-detail', { containerId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描添加物品'));
    wrapper.appendChild(sectionBlock('物品 (' + items.length + ')', itemRows));
  } else {
    wrapper.appendChild(sectionBlock('物品 (0)', [
      h('div', { className: 'detail-row', style: 'color:var(--text-secondary)' }, '此容器中没有物品'),
      h('div', { className: 'detail-row', onclick: () => startContainerItemScan(containerId, () => navigate('container-detail', { containerId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描添加物品')
    ]));
  }

  container.appendChild(wrapper);

  const actionBtn = $('#header .action');
  actionBtn.style.display = 'block';
  actionBtn.innerHTML = '';
  actionBtn.appendChild(h('span', { onclick: () => showQRModal('container', c.id, c.name, c.qrCode), style: 'margin-right:8px' }, '▣'));
  actionBtn.appendChild(h('span', { onclick: () => navigate('container-edit', { parentId: containerId }), style: 'margin-right:8px' }, '➕ 子容器'));
  actionBtn.appendChild(h('span', { onclick: () => navigate('container-edit', { containerId: c.id, parentId: c.parentId }), style: 'margin-right:8px' }, '✎'));
  actionBtn.appendChild(h('span', { onclick: () => showDeleteDialog('容器', c.name + '（子容器将被一并删除）', async () => {
    await deleteContainerCascade(containerId);
    goBack();
  }), style: 'color:var(--red)' }, '✕'));
}

// 渲染容器编辑页，支持图标、颜色、父容器和备注。
export async function renderContainerEdit(container, containerId, presetParentId) {
  const c = containerId ? await db.containers.get(containerId) : null;
  const isEdit = !!c;

  const form = h('div', { className: 'form' });
  form.appendChild(formGroup('容器名称', h('input', { type: 'text', id: 'cedit-name', value: c?.name || '', placeholder: '输入容器名称' })));

  let cImageData = c?.image || '';
  const cImgPreview = h('div', { id: 'cedit-img-preview', style: 'margin-top:8px;text-align:center' });
  if (cImageData) {
    cImgPreview.appendChild(h('img', { src: cImageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
  }
  form.appendChild(formGroup('照片', h('div', {}, [
    h('input', { type: 'file', id: 'cedit-img', accept: 'image/*', capture: 'environment',
      style: 'width:100%;font-size:15px',
      onchange: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          cImageData = reader.result;
          cImgPreview.innerHTML = '';
          cImgPreview.appendChild(h('img', { src: cImageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
        };
        reader.readAsDataURL(file);
      }
    }),
    cImgPreview
  ])));

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

  const colorGrid = h('div', { className: 'color-grid' });
  CONTAINER_COLORS.forEach(({ label, hex }) => {
    colorGrid.appendChild(h('button', {
      className: 'color-btn' + ((c?.color || '#5B8FF9') === hex ? ' selected' : ''),
      'data-color': hex,
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

  const candidates = await getEligibleParentContainers(containerId);
  const parentSelect = h('select', { id: 'cedit-parent' });
  parentSelect.appendChild(h('option', { value: '', selected: (!isEdit && !presetParentId) || c?.parentId === '' ? 'selected' : undefined }, '顶层（无父容器）'));
  for (const root of candidates) {
    parentSelect.appendChild(h('option', {
      value: root.id,
      selected: c?.parentId === root.id || (!isEdit && presetParentId === root.id) ? 'selected' : undefined
    }, root.icon + ' ' + root.name));
  }
  form.appendChild(formGroup('父容器', parentSelect));

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
    const color = colorEl ? colorEl.dataset.color : '#5B8FF9';
    const parentId = $('#cedit-parent').value;
    const notes = $('#cedit-notes').value;

    if (isEdit) {
      await db.containers.update(containerId, { name, icon, color, parentId, notes, image: cImageData });
    } else {
      const maxSort = await db.containers.where('parentId').equals(parentId).count();
      await db.containers.put({
        id: uuid(), name, icon, color, sortOrder: maxSort,
        notes, parentId, createdAt: Date.now(), image: cImageData
      });
    }
    goBack();
  }}, '保存'));
}
