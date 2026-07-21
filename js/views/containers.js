import { $, h } from '../core/dom.js';
import { state, navigate, replaceNavigate, switchTab, goBack, render } from '../core/app-shell.js';
import { db, getRootContainers, getContainerTotalItems, getEligibleParentContainers, deleteContainerCascade, getContainerPath, uuid, getAllDescendantIds } from '../db.js';
import { showQRModal, showDeleteDialog, sectionBlock, rowLink, tagIcons, formGroup } from '../ui.js';
import { startContainerParentScan, startContainerItemScan, showScanner, parseWujuCode } from '../scanner.js';
import { compressImage, getImageMaxWidth } from '../image-utils.js';

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

  var delBg = h('div', { className: 'swipe-delete-bg' });
  delBg.innerHTML = '<svg width="1.2rem" height="1.2rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16,7V4a1,1,0,0,0-1-1H9A1,1,0,0,0,8,4V7m4,4v6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M4,7H20M17.07,20.07,18,7H6l.93,13.07a1,1,0,0,0,1,.93h8.14A1,1,0,0,0,17.07,20.07Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var cell = h('div', {
    className: 'swipe-cell',
    'data-delete-type': 'container',
    'data-delete-id': container.id,
    'data-delete-name': container.name
  }, [
    delBg,
    h('div', { className: 'tree-row swipe-row', style: { paddingLeft: (16 + level * 20) + 'px' } }, [
      children.length > 0
        ? h('span', { className: 'expand', onclick: function(e) { e.stopPropagation(); toggleContainerExpand(container.id); } },
            isExpanded ? '▼' : '▶')
        : h('span', { className: 'expand' }, ''),
      h('span', { className: 'container-icon', style: { color: container.color } }, container.icon),
      h('span', { className: 'container-name', onclick: function() { navigate('container-detail', { containerId: container.id }); } }, container.name),
      h('span', { className: 'container-count' }, totalItems + ' 件'),
      h('span', { className: 'chevron', onclick: function() { navigate('container-detail', { containerId: container.id }); } }, '›')
    ])
  ]);
  nodes.push(cell);

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
      h('div', { className: 'title' }, '还没有位置'),
      h('div', {}, '点击右上角 + 创建第一个位置')
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
  if (!c) { container.textContent = '位置不存在'; return; }

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
    parentRows.push(h('div', { className: 'detail-row', onclick: () => startContainerParentScan(containerId, () => navigate('container-detail', { containerId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描换父位置'));
  } else {
    parentRows.push(h('div', { className: 'detail-row', style: 'color:var(--text-tertiary)' }, '顶级位置（无父位置）'));
    parentRows.push(h('div', { className: 'detail-row', onclick: () => startContainerParentScan(containerId, () => navigate('container-detail', { containerId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描关联父位置'));
  }
  wrapper.appendChild(sectionBlock('📍 父位置', parentRows));

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
    childRows.push(h('div', { className: 'detail-row', style: 'color:var(--text-secondary)' }, '此位置没有子位置'));
  }
  childRows.push(h('div', { className: 'detail-row', onclick: () => navigate('container-edit', { parentId: containerId }), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, [
    (function() {
      var icon = h('span', { style: 'display:inline-flex;align-items:center;margin-right:4px' });
      icon.innerHTML = '<svg width="1.2rem" height="1.2rem" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 1024C229.7 1024 0 794.3 0 512S229.7 0 512 0s512 229.7 512 512-229.7 512-512 512z m0-938.7C276.7 85.3 85.3 276.7 85.3 512S276.7 938.7 512 938.7 938.7 747.3 938.7 512 747.3 85.3 512 85.3z" fill="#3688FF"/><path d="M682.7 554.7H341.3c-23.6 0-42.7-19.1-42.7-42.7s19.1-42.7 42.7-42.7h341.3c23.6 0 42.7 19.1 42.7 42.7s-19.1 42.7-42.6 42.7z" fill="#5F6379"/><path d="M512 725.3c-23.6 0-42.7-19.1-42.7-42.7V341.3c0-23.6 19.1-42.7 42.7-42.7s42.7 19.1 42.7 42.7v341.3c0 23.6-19.1 42.7-42.7 42.7z" fill="#5F6379"/></svg>';
      return icon;
    })(),
    ' 添加子位置'
  ]));
  wrapper.appendChild(sectionBlock('子位置', childRows));

  const items = await db.items.where('containerId').equals(containerId).toArray();
  const itemRows = [];

  // 物品列表
  if (items.length > 0) {
    items.forEach(item => {
      itemRows.push(h('div', { className: 'detail-row', onclick: () => navigate('item-detail', { itemId: item.id }), style: 'cursor:pointer;flex-wrap:wrap;gap:4px' }, [
        h('span', { style: 'margin-right:8px' }, '📦'),
        h('span', { style: 'flex:1;font-weight:500' }, item.name),
        (item.tags && item.tags.length > 0)
          ? h('span', { style: 'font-size:10px;color:var(--text-tertiary);margin-right:4px' }, item.tags.slice(0, 3).map(t => tagIcons[t] || '').join(''))
          : '',
        item.quantity != null ? h('span', { style: 'color:var(--text-secondary);font-size:13px' }, '×' + item.quantity) : '',
        h('span', { className: 'chevron' }, '›')
      ]));
    });
  } else {
    itemRows.push(h('div', { className: 'detail-row', style: 'color:var(--text-secondary)' }, '此位置中没有物品'));
  }

  // 添加物品：手动 / 扫描
  const plusIcon = h('span', { style: 'display:inline-flex;align-items:center;margin-right:3px' });
  plusIcon.innerHTML = '<svg width="1.1rem" height="1.1rem" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 1024C229.7 1024 0 794.3 0 512S229.7 0 512 0s512 229.7 512 512-229.7 512-512 512z m0-938.7C276.7 85.3 85.3 276.7 85.3 512S276.7 938.7 512 938.7 938.7 747.3 938.7 512 747.3 85.3 512 85.3z" fill="#3688FF"/><path d="M682.7 554.7H341.3c-23.6 0-42.7-19.1-42.7-42.7s19.1-42.7 42.7-42.7h341.3c23.6 0 42.7 19.1 42.7 42.7s-19.1 42.7-42.6 42.7z" fill="#5F6379"/><path d="M512 725.3c-23.6 0-42.7-19.1-42.7-42.7V341.3c0-23.6 19.1-42.7 42.7-42.7s42.7 19.1 42.7 42.7v341.3c0 23.6-19.1 42.7-42.7 42.7z" fill="#5F6379"/></svg>';
  itemRows.push(
    h('div', { className: 'detail-row', style: 'justify-content:center;gap:12px;padding:6px 0' }, [
      h('button', { type: 'button', style: 'display:inline-flex;align-items:center;gap:2px;border:none;background:transparent;color:var(--green);cursor:pointer;padding:4px 10px',
        onclick: () => navigate('item-edit', { presetContainerId: containerId })
      }, [plusIcon.cloneNode(true), '手动添加']),
      h('button', { type: 'button', style: 'display:inline-flex;align-items:center;gap:2px;border:none;background:transparent;color:var(--green);cursor:pointer;padding:4px 10px',
        onclick: () => showScanner(function(text) { navigate('item-edit', { presetContainerId: containerId, presetQrCode: text }); })
      }, ['📷', '扫描添加'])
    ])
  );

  // 关联已有物品：手动 / 扫描
  itemRows.push(
    h('div', { className: 'detail-row', style: 'justify-content:center;gap:12px;padding:6px 0' }, [
      h('button', { type: 'button', style: 'display:inline-flex;align-items:center;gap:2px;border:none;background:transparent;color:var(--green);cursor:pointer;padding:4px 10px',
        onclick: () => showAssociateItemPicker(containerId, () => navigate('container-detail', { containerId }))
      }, ['📋', '手动关联']),
      h('button', { type: 'button', style: 'display:inline-flex;align-items:center;gap:2px;border:none;background:transparent;color:var(--green);cursor:pointer;padding:4px 10px',
        onclick: () => startContainerItemScan(containerId, () => navigate('container-detail', { containerId }))
      }, ['📷', '扫描关联'])
    ])
  );

  wrapper.appendChild(sectionBlock('物品 (' + items.length + ')', itemRows));

  container.appendChild(wrapper);

  const actionBtn = $('#header .action');
  actionBtn.style.display = 'flex';
  actionBtn.innerHTML = '';
  const homeIcon1 = h('span', { onclick: () => switchTab('spaces'), style: 'margin-right:8px;display:inline-flex;align-items:center;cursor:pointer' });
  homeIcon1.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 22L2 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 11L10.1259 4.49931C11.2216 3.62279 12.7784 3.62279 13.8741 4.49931L22 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path opacity="0.5" d="M15.5 5.5V3.5C15.5 3.22386 15.7239 3 16 3H18.5C18.7761 3 19 3.22386 19 3.5V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 22V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M20 22V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path opacity="0.5" d="M15 22V17C15 15.5858 15 14.8787 14.5607 14.4393C14.1213 14 13.4142 14 12 14C10.5858 14 9.87868 14 9.43934 14.4393C9 14.8787 9 15.5858 9 17V22" stroke="currentColor" stroke-width="1.5"/><path opacity="0.5" d="M14 9.5C14 10.6046 13.1046 11.5 12 11.5C10.8954 11.5 10 10.6046 10 9.5C10 8.39543 10.8954 7.5 12 7.5C13.1046 7.5 14 8.39543 14 9.5Z" stroke="currentColor" stroke-width="1.5"/></svg>';
  actionBtn.appendChild(homeIcon1);
  const qrIcon1 = h('span', { onclick: () => showQRModal('container', c.id, c.name, c.qrCode), style: 'margin-right:8px;display:inline-flex;align-items:center;cursor:pointer' });
  qrIcon1.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.75 5.25H5.25V9.75H9.75V5.25ZM3.75 3.75V11.25H11.25V3.75H3.75ZM9.75 14.25H5.25V18.75H9.75V14.25ZM3.75 12.75V20.25H11.25V12.75H3.75ZM14.25 5.25H18.75V9.75H14.25V5.25ZM12.75 11.25V3.75H20.25V11.25H12.75ZM12.75 17.25V12.75H14.25V17.25H12.75ZM6.75 6.75V8.25H8.25V6.75H6.75ZM6.75 17.25V15.75H8.25V17.25H6.75ZM15.75 6.75V8.25H17.25V6.75H15.75ZM18.75 20.25V18H20.25V20.25H18.75ZM18.75 12.75V15H17.25V12.75H15.75V18.75H12.75V20.25H17.25V16.5H20.25V15V12.75H18.75Z" fill="currentColor"/></svg>';
  actionBtn.appendChild(qrIcon1);
  const editIcon1 = h('span', { onclick: () => navigate('container-edit', { containerId: c.id, parentId: c.parentId }), style: 'margin-right:8px;display:inline-flex;align-items:center;cursor:pointer' });
  editIcon1.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 22H3c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h18c.41 0 .75.34.75.75s-.34.75-.75.75z" fill="currentColor"/><path d="M19.0206 3.48162c-1.94-1.94-3.84-1.99-5.83 0l-1.21 1.21c-.1.1-.14.26-.1.4.76 2.65 2.88 4.77 5.53 5.53.04.01.08.02.12.02.11 0 .21-.04.29-.12l1.2-1.21c.99-.98 1.47-1.93 1.47-2.89.01-.99-.47-1.95-1.47-2.94z" fill="currentColor"/><path d="M15.6103 11.5308c-.29-.14-.57-.28-.84-.44-.22-.13-.43-.27-.64-.42-.17-.11-.37-.27-.56-.43-.02-.01-.09-.07-.17-.15-.33-.28-.7-.64-1.03-1.04-.03-.02-.08-.09-.15-.18-.1-.12-.27-.32-.42-.55-.12-.15-.26-.37-.39-.59-.16-.27-.3-.54-.44-.82-.0211-.0454-.0416-.0906-.0612-.1355-.1476-.3333-.5823-.4308-.84-.173l-5.7285 5.7285c-.13.13-.25.38-.28.55l-.54 3.83c-.1.68.09 1.32.51 1.75.36.35.86.54 1.4.54.12 0 .24-.01.36-.03l3.84-.54c.18-.03.43-.15.55-.28l5.7213-5.7205c.2596-.2596.1617-.705-.1756-.8491-.038-.0162-.0765-.0328-.1149-.0496z" fill="currentColor"/></svg>';
  actionBtn.appendChild(editIcon1);
  const delIcon1 = h('span', { onclick: () => showDeleteDialog('位置', c.name + '（子位置将被一并删除）', async () => {
    await deleteContainerCascade(containerId);
    goBack();
  }), style: 'color:var(--red);display:inline-flex;align-items:center;cursor:pointer' });
  delIcon1.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16,7V4a1,1,0,0,0-1-1H9A1,1,0,0,0,8,4V7m4,4v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M4,7H20M17.07,20.07,18,7H6l.93,13.07a1,1,0,0,0,1,.93h8.14A1,1,0,0,0,17.07,20.07Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  actionBtn.appendChild(delIcon1);
}

// 渲染容器编辑页，支持图标、颜色、父容器和备注。
// 关联已有物品弹窗：支持搜索和分类筛选，选中的物品归入当前容器。
async function showAssociateItemPicker(containerId, onDone) {
  const allItems = await db.items.toArray();
  const containerItemIds = new Set(allItems.filter(i => i.containerId === containerId).map(i => i.id));

  const { getCategoriesList } = await import('../ui.js');

  const overlay = h('div', { className: 'overlay', style: 'z-index:999' });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  const dialog = h('div', { className: 'dialog', style: 'max-height:75vh;display:flex;flex-direction:column' });
  dialog.appendChild(h('div', { className: 'msg', style: 'text-align:center;padding-bottom:8px' }, [
    h('div', { style: 'font-weight:600;margin-bottom:6px' }, '关联已有物品到此位置')
  ]));

  const catsList = getCategoriesList();
  const filterBar = h('div', { style: 'display:flex;gap:8px;margin-bottom:4px' });
  const searchInput = h('input', { type: 'text', placeholder: '搜索物品名...', style: 'flex:1;padding:8px 10px;border:1px solid var(--separator);border-radius:6px;font-size:14px' });
  const catSelect = h('select', { style: 'width:40%;padding:8px 6px;border:1px solid var(--separator);border-radius:6px;font-size:14px' });
  catSelect.appendChild(h('option', { value: '' }, '全部分类'));
  catsList.forEach(c => catSelect.appendChild(h('option', { value: c.name }, (c.icon || '') + ' ' + c.name)));
  filterBar.appendChild(searchInput);
  filterBar.appendChild(catSelect);
  dialog.appendChild(filterBar);

  const list = h('div', { style: 'overflow-y:auto;max-height:50vh;margin:4px 0' });

  function renderList() {
    const kw = searchInput.value.toLowerCase();
    const cat = catSelect.value;
    const filtered = allItems.filter(i => {
      if (containerItemIds.has(i.id)) return false;
      if (kw && !i.name.toLowerCase().includes(kw)) return false;
      if (cat && i.category !== cat) return false;
      return true;
    });
    list.innerHTML = '';
    if (filtered.length === 0) {
      list.appendChild(h('div', { style: 'text-align:center;padding:16px;color:var(--text-secondary);font-size:14px' }, '没有可关联的物品'));
    } else {
      filtered.forEach(i => {
        const row = h('div', {
          className: 'detail-row',
          style: 'cursor:pointer',
          onclick: async () => {
            await db.items.update(i.id, { containerId: containerId });
            overlay.remove();
            onDone?.();
          }
        }, [
          h('span', { style: 'flex:1;text-align:left' }, i.name),
          h('span', { style: 'color:var(--text-tertiary);font-size:12px' }, i.category || '')
        ]);
        list.appendChild(row);
      });
    }
  }

  searchInput.addEventListener('input', renderList);
  catSelect.addEventListener('change', renderList);
  renderList();

  dialog.appendChild(list);

  const btns = h('div', { className: 'btns' });
  btns.appendChild(h('button', { onclick: () => overlay.remove() }, '取消'));
  dialog.appendChild(btns);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  searchInput.focus();
}

export async function renderContainerEdit(container, containerId, presetParentId, presetQrCode) {
  const c = containerId ? await db.containers.get(containerId) : null;
  const isEdit = !!c;

  const form = h('div', { className: 'form' });
  form.appendChild(formGroup('位置名称', h('input', { type: 'text', id: 'cedit-name', value: c?.name || '', placeholder: '输入位置名称' })));

  let cImageData = c?.image || '';
  const cImgPreview = h('div', { id: 'cedit-img-preview', style: 'margin-top:8px;text-align:center' });
  if (cImageData) {
    cImgPreview.appendChild(h('img', { src: cImageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
  }
  form.appendChild(formGroup('照片', h('div', {}, [
    h('input', { type: 'file', id: 'cedit-img', accept: 'image/*',
      style: 'width:100%;font-size:15px',
      onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        cImageData = await compressImage(file, getImageMaxWidth());
        cImgPreview.innerHTML = '';
        cImgPreview.appendChild(h('img', { src: cImageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
      }
    }),
    cImgPreview
  ])));

  // 可折叠分组辅助函数
  function foldGroup(label, child) {
    const g = h('div', { className: 'form-group fold-group' });
    const head = h('div', { className: 'fold-header', onclick: function() {
      const body = this.nextElementSibling;
      const arrow = this.querySelector('.fold-arrow');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      arrow.style.transform = hidden ? 'rotate(90deg)' : '';
    }}, [
      h('label', { style: 'margin-bottom:0' }, label),
      h('span', { className: 'fold-arrow' }, '›')
    ]);
    const body = h('div', { className: 'fold-body', style: 'display:none;padding-top:6px' });
    body.appendChild(child);
    g.appendChild(head);
    g.appendChild(body);
    return g;
  }

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
  form.appendChild(foldGroup('图标', iconGrid));

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
  form.appendChild(foldGroup('颜色标签', colorGrid));

  // 构建容器查找表和禁用集合
  const allContainers = await db.containers.toArray();
  const contMap = {};
  allContainers.forEach(c => { contMap[c.id] = c; });
  const forbiddenIds = containerId ? new Set([containerId, ...await getAllDescendantIds(containerId)]) : new Set();
  const roots = allContainers.filter(c => c.parentId === '' && !forbiddenIds.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);

  // 获取指定容器的子容器（过滤禁用项）
  function getChildren(pid) {
    return allContainers.filter(c => c.parentId === pid && !forbiddenIds.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // 计算祖先路径（从根到父）
  const ancestorPath = [];
  if (c?.parentId) {
    let pid = c.parentId;
    while (pid && contMap[pid]) {
      ancestorPath.unshift(contMap[pid]);
      pid = contMap[pid].parentId;
    }
  }

  // 创建逐级选择容器
  const cascadeDiv = h('div', { id: 'cedit-parent-cascade', style: 'display:flex;flex-direction:column;gap:6px' });

  const selStyle = 'width:100%;padding:12px;border:1px solid var(--separator);border-radius:8px;font-size:15px;background:var(--card-bg);color:var(--text)';

  // 构建一个层级选择器
  function makeSelect(level, options, selectedValue) {
    const sel = h('select', { className: 'cascade-select', 'data-level': String(level), style: selStyle });
    if (level === 0) {
      sel.appendChild(h('option', { value: '' }, '顶层（无父位置）'));
    } else {
      sel.appendChild(h('option', { value: '' }, '—'));
    }
    options.forEach(o => {
      sel.appendChild(h('option', { value: o.id, selected: o.id === selectedValue ? 'selected' : undefined }, o.icon + ' ' + o.name));
    });
    return sel;
  }

  // 重建当前级及之后所有级
  function rebuildFromLevel(startLevel, startParentId) {
    var selects = [...cascadeDiv.querySelectorAll('.cascade-select')];
    // 删除 startLevel 及之后的所有选择器
    selects.forEach(function(s) {
      if (parseInt(s.dataset.level) >= startLevel) s.remove();
    });

    if (startLevel === -1) {
      // 全部重建：从 L0 开始
      cascadeDiv.innerHTML = '';
      var s0 = makeSelect(0, roots, ancestorPath.length > 0 ? ancestorPath[0].id : '');
      cascadeDiv.appendChild(s0);
      bindChange(s0);
      if (s0.value) cascadeFrom(s0);
      return;
    }

    // 从当前级开始展开
    var parentId = startParentId;
    var level = startLevel;
    while (parentId) {
      var children = getChildren(parentId);
      if (children.length === 0) break;
      var sel = makeSelect(level, children, '');
      cascadeDiv.appendChild(sel);
      bindChange(sel);
      parentId = sel.value;
      level++;
      if (!parentId) break;
    }
  }

  // 绑定 change 事件
  function bindChange(sel) {
    sel.addEventListener('change', function() {
      var lvl = parseInt(this.dataset.level);
      if (this.value) {
        rebuildFromLevel(lvl + 1, this.value);
      } else {
        rebuildFromLevel(lvl + 1, '');
      }
    });
  }

  // 选中某级后向下级联展开
  function cascadeFrom(sel) {
    var lvl = parseInt(sel.dataset.level);
    var children = getChildren(sel.value);
    if (children.length > 0) {
      rebuildFromLevel(lvl + 1, sel.value);
    }
  }

  // 首次渲染
  if (ancestorPath.length > 0) {
    var pid = '';
    for (var ai = 0; ai < ancestorPath.length; ai++) {
      var options = ai === 0 ? roots : getChildren(pid);
      var sel = makeSelect(ai, options, ancestorPath[ai].id);
      cascadeDiv.appendChild(sel);
      bindChange(sel);
      pid = ancestorPath[ai].id;
    }
    // 最后一级展开当前父容器的子容器
    if (c?.parentId) {
      var lastChildren = getChildren(pid);
      if (lastChildren.length > 0) {
        var lastSel = makeSelect(ancestorPath.length, lastChildren, c.parentId);
        cascadeDiv.appendChild(lastSel);
        bindChange(lastSel);
      }
    }
  } else {
    var s0 = makeSelect(0, roots, '');
    cascadeDiv.appendChild(s0);
    bindChange(s0);
  }

  form.appendChild(formGroup('父位置', h('div', { style: 'display:flex;align-items:flex-start;gap:4px' }, [
    cascadeDiv,
    h('button', { type: 'button', style: 'padding:6px 2px;border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-secondary);flex-shrink:0;margin-top:6px', onclick: async function() {
      showScanner(async function(text) {
        var foundId = '';
        const wuju = parseWujuCode(text);
        if (wuju && wuju.type === 'container') {
          foundId = wuju.id;
        } else {
          const found = await db.containers.where('qrCode').equals(text).first();
          if (found) foundId = found.id;
        }
        if (!foundId || forbiddenIds.has(foundId)) {
          alert(forbiddenIds.has(foundId) ? '该位置不能设为父位置（可能是自身或子位置）' : '未识别到位置条码/二维码');
          return;
        }
        // 计算祖先路径并重建级联
        var path = [];
        var pid2 = contMap[foundId]?.parentId;
        while (pid2 && contMap[pid2]) {
          path.unshift(contMap[pid2]);
          pid2 = contMap[pid2].parentId;
        }
        cascadeDiv.innerHTML = '';
        var cp = '';
        for (var pi = 0; pi < path.length; pi++) {
          var opts = pi === 0 ? roots : getChildren(cp);
          var s = makeSelect(pi, opts, path[pi].id);
          cascadeDiv.appendChild(s);
          bindChange(s);
          cp = path[pi].id;
        }
        // 最后一级选中扫描到的容器
        var finalOpts = path.length === 0 ? roots : getChildren(cp);
        var fs = makeSelect(path.length, finalOpts, foundId);
        cascadeDiv.appendChild(fs);
        bindChange(fs);
      }, 'container');
    } }, '📷')
  ])));

  form.appendChild(formGroup('备注', h('textarea', { id: 'cedit-notes' }, c?.notes || '')));

  // QR 码/条码：手动输入 + 扫码关联（扫入的条码灰色只读）
  const hasPresetQr = !!presetQrCode;
  const qrInput = h('input', { type: 'text', id: 'cedit-qrcode',
    value: c?.qrCode || presetQrCode || '',
    placeholder: '输入或扫码添加条码/二维码',
    readonly: hasPresetQr ? 'readonly' : undefined,
    style: hasPresetQr ? 'background:#E5E5EA;color:#8E8E93' : ''
  });
  const qrRow = h('div', { style: 'display:flex;align-items:center;gap:4px' }, [qrInput]);
  if (!hasPresetQr) {
    qrRow.appendChild(h('button', { type: 'button', style: 'padding:6px 2px;border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-secondary)', onclick: function() { showScanner(function(text) { qrInput.value = text; }); } }, '📷'));
  }
  form.appendChild(formGroup('条码/二维码', qrRow));

  container.appendChild(form);

  const actionBtn = $('#header .action');
  actionBtn.style.display = 'flex';
  actionBtn.innerHTML = '';
  const saveIcon1 = h('span', { onclick: async () => {
    const name = $('#cedit-name').value.trim();
    if (!name) return;

    const iconEl = container.querySelector('.icon-btn.selected');
    const colorEl = container.querySelector('.color-btn.selected');
    const icon = iconEl ? iconEl.textContent : '📁';
    const color = colorEl ? colorEl.dataset.color : '#5B8FF9';
    const cascadeSelects = [...document.querySelectorAll('#cedit-parent-cascade .cascade-select')];
    let parentId = '';
    for (let i = cascadeSelects.length - 1; i >= 0; i--) { if (cascadeSelects[i].value) { parentId = cascadeSelects[i].value; break; } }
    const notes = $('#cedit-notes').value;
    let qrCode = $('#cedit-qrcode').value.trim();
    let newContainerId = null;

    if (isEdit) {
      await db.containers.update(containerId, { name, icon, color, parentId, notes, image: cImageData, qrCode: qrCode || undefined });
    } else {
      newContainerId = uuid();
      if (!qrCode) qrCode = 'wuju:container:' + newContainerId;
      const maxSort = await db.containers.where('parentId').equals(parentId).count();
      await db.containers.put({
        id: newContainerId, name, icon, color, sortOrder: maxSort,
        notes, parentId, createdAt: Date.now(), image: cImageData, qrCode
      });
    }
    if (isEdit) {
      goBack();
    } else {
      replaceNavigate('container-detail', { containerId: newContainerId });
    }
  }, style: 'display:inline-flex;align-items:center;cursor:pointer' });
  saveIcon1.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><polygon points="17 2 2 2 2 22 7 22 7 13 17 13 17 22 22 22 22 7 17 2" fill="currentColor" opacity="0.15"/><polygon points="17 2 2 2 2 22 7 22 7 13 17 13 17 22 22 22 22 7 17 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="miter"/><line x1="7" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="22" x2="17" y2="22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  actionBtn.appendChild(saveIcon1);
}
