import { $, h, formatDate, isExpired, isExpiringSoon } from '../core/dom.js';
import { state, navigate, replaceNavigate, switchTab, goBack, render } from '../core/app-shell.js';
import { db, getContainerPath, getItemRelations, deleteItemRelations, uuid } from '../db.js';
import { catIcons, tagIcons, getCategoriesList, getTagsList, showQRModal, showDeleteDialog, sectionBlock, rowItem, rowLink, formGroup, toggleField, emptyView, showTagManager, showCategoryManager } from '../ui.js';
import { startAssociationScan, startLocationScan, showScanner, parseWujuCode } from '../scanner.js';
import { compressImage, getImageMaxWidth } from '../image-utils.js';

// 处理物品列表的搜索、筛选与排序结果，并把最终列表渲染到容器里。
let _rowGen = 0;
async function renderItemRows() {
  const gen = ++_rowGen;
  const wrap = document.getElementById('item-list-wrap');
  if (!wrap) return;

  const search = state.itemSearch;
  const category = state.itemCategory;
  const selectedTags = [...state.itemTags];

  let items = await db.items.orderBy('name').toArray();
  // 丢弃过期调用：快速输入产生并发 renderItemRows，只用最新一次的结果
  if (gen !== _rowGen) return;

  wrap.innerHTML = '';
  if (category) items = items.filter(i => i.category === category);
  if (selectedTags.length > 0) items = items.filter(i => i.tags && selectedTags.every(t => i.tags.includes(t)));
  if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  state.itemListOrder = items.map(i => i.id);

  if (items.length === 0) {
    wrap.appendChild(emptyView(search || category ? '🔍' : '📦', search || category ? '没有找到' : '还没有物品', search || category ? '试试其他关键词' : '点击右上角 + 添加第一个物品'));
    return;
  }

  const list = h('div', { className: 'card-row-group' });
  items.forEach(item => {
    var delBg = h('div', { className: 'swipe-delete-bg' });
    delBg.innerHTML = '<svg width="1.2rem" height="1.2rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16,7V4a1,1,0,0,0-1-1H9A1,1,0,0,0,8,4V7m4,4v6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M4,7H20M17.07,20.07,18,7H6l.93,13.07a1,1,0,0,0,1,.93h8.14A1,1,0,0,0,17.07,20.07Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var moveBg = h('div', { className: 'swipe-move-bg' });
    moveBg.innerHTML = '<svg width="1.2rem" height="1.2rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42-.39-.39-1.02-.39-1.41 0l-6.59 6.59c-.39.39-.39 1.02 0 1.41l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z" fill="white"/></svg>';
    var cell = h('div', {
      className: 'swipe-cell',
      'data-delete-type': 'item',
      'data-delete-id': item.id,
      'data-delete-name': item.name,
      'data-has-move': '1'
    }, [
      delBg, moveBg,
      h('div', { className: 'card-row item-row swipe-row', onclick: function(e) { navigate('item-detail', { itemId: item.id }); } }, [
        h('span', { className: 'cat-icon' }, catIcons[item.category] || '📦'),
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
      ])
    ]);
    if (item.containerId) {
      getContainerPath(item.containerId).then(path => {
        var sub = cell.querySelector('.sub');
        if (sub) sub.textContent = path.map(function(c) { return c.name; }).join(' > ');
      });
    }
    list.appendChild(cell);
  });
  wrap.appendChild(list);
}

// 重新刷新物品列表结果，不重建筛选控件本身。
function refreshItemList() {
  renderItemRows();
}

// 渲染物品 tab 的筛选栏、标签栏和排序栏。
export async function renderItemList(container) {
  const search = state.itemSearch;
  const category = state.itemCategory;

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
    const input = existingSearch.querySelector('input');
    const clearBtn = existingSearch.querySelector('.clear-btn');
    if (input && input !== document.activeElement) input.value = search;
    if (clearBtn) clearBtn.style.display = search ? '' : 'none';
  }
  // 主区：左侧分类竖栏 + 右侧物品列表（class 供 CSS 用——backdrop 快照会剥掉 id）
  let mainWrap = document.getElementById('item-main');
  if (!mainWrap) {
    mainWrap = h('div', { id: 'item-main', className: 'item-main' });
    container.appendChild(mainWrap);
  }

  let catCol = document.getElementById('item-cat-col');
  if (catCol) catCol.innerHTML = '';
  else {
    catCol = h('div', { id: 'item-cat-col', className: 'item-cat-col' });
    mainWrap.appendChild(catCol);
  }
  getCategoriesList().forEach(c => {
    catCol.appendChild(h('button', {
      className: 'chip' + (category === c.name ? ' selected' : ''),
      onclick: () => { state.itemCategory = (category === c.name ? null : c.name); render(); }
    }, [
      h('span', { className: 'cat-chip-icon' }, c.icon),
      h('span', { className: 'cat-chip-name' }, c.name)
    ]));
  });
  catCol.appendChild(h('button', {
    className: 'chip chip-manage',
    onclick: () => showCategoryManager(),
    style: 'font-size:14px'
  }, '✏️'));

  let listWrap = document.getElementById('item-list-wrap');
  if (!listWrap) {
    listWrap = h('div', { id: 'item-list-wrap', className: 'item-list-wrap' });
    mainWrap.appendChild(listWrap);
  }

  let tagRow = document.getElementById('item-tag-row');
  if (tagRow) tagRow.innerHTML = '';
  else {
    tagRow = h('div', { id: 'item-tag-row', className: 'chip-scroll', style: 'margin-top:4px' });
    container.appendChild(tagRow);
  }
  // ✏️ 复用或新建
  let mgrBtn = document.getElementById('item-tag-mgr');
  if (!mgrBtn) {
    mgrBtn = h('button', { id: 'item-tag-mgr', className: 'chip chip-manage', onclick: () => showTagManager() }, '✏️');
  }
  // 标签筛选输入框（不触发全量 render，避免输入失焦）
  const tagFilterInput = h('input', {
    type: 'text', placeholder: '过滤...', value: state.tagFilter,
    className: 'tag-filter-input'
  });
  tagRow.appendChild(tagFilterInput);
  // ✏️ 紧挨在过滤框后面，互斥显示
  tagRow.appendChild(mgrBtn);
  mgrBtn.classList.remove('show');
  // 选中标签排到前面，按筛选词过滤
  const kw = (state.tagFilter || '').toLowerCase();
  const sorted = [...getTagsList()]
    .filter(t => !kw || t.name.toLowerCase().includes(kw))
    .sort((a, b) => {
      const sa = state.itemTags.has(a.name) ? 0 : 1;
      const sb = state.itemTags.has(b.name) ? 0 : 1;
      return sa - sb;
    });
  sorted.forEach(t => {
    const selected = state.itemTags.has(t.name);
    tagRow.appendChild(h('button', {
      'data-tag-name': t.name,
      className: 'chip tag-chip' + (selected ? ' selected' : ''),
      style: selected ? '' : 'opacity:0.65',
      onclick: () => {
        if (selected) state.itemTags.delete(t.name);
        else state.itemTags.add(t.name);
        state.tagFilter = '';
        render();
      }
    }, t.icon + ' ' + t.name));
  });
  // 行内筛选：不重建 DOM，直接显隐标签 chip（不影响物品列表）
  tagFilterInput.addEventListener('input', function() {
    state.tagFilter = this.value;
    const kw2 = this.value.toLowerCase();
    tagRow.querySelectorAll('[data-tag-name]').forEach(chip => {
      chip.style.display = !kw2 || chip.dataset.tagName.toLowerCase().includes(kw2) ? '' : 'none';
    });
  });

  // touchmove 方向检测：方向变立即切换（document 级别，2px 阈值）
  if (!window._tagTouchBound) {
    window._tagTouchBound = true;
    var _px = 0;
    document.addEventListener('touchstart', function(e) {
      if (!e.target.closest('#item-tag-row')) return;
      _px = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!e.target.closest('#item-tag-row')) return;
      var tr = document.getElementById('item-tag-row');
      if (!tr || tr.scrollWidth <= tr.clientWidth) return;
      var cx = e.touches[0].clientX;
      var dx = _px - cx;
      var btn = document.getElementById('item-tag-mgr');
      var flt = tr.querySelector('.tag-filter-input');
      if (dx > 2) {
        if (btn) btn.classList.add('show');
        if (flt) flt.style.display = 'none';
      } else if (dx < -2) {
        if (btn) btn.classList.remove('show');
        if (flt) flt.style.display = '';
      }
      _px = cx;
    }, { passive: true });
  }
  await renderItemRows();
}

// 渲染物品详情页，包括基础信息、位置、关联和备注。
export async function renderItemDetail(container, itemId) {
  const item = await db.items.get(itemId);
  if (!item) { container.textContent = '物品不存在'; return; }

  const wrapper = h('div', {});
  wrapper.appendChild(h('div', { className: 'detail-header' }, [
    h('div', { className: 'cat-icon' }, catIcons[item.category] || '📦'),
    h('div', {}, [
      h('div', { className: 'title' }, item.name),
      h('div', { className: 'meta' }, [
        h('span', { className: 'cat-tag' }, item.category),
        item.quantity != null ? h('span', { style: 'font-size:14px;color:var(--text-secondary)' }, '×' + item.quantity) : ''
      ]),
      (item.tags && item.tags.length > 0)
        ? h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px' },
            item.tags.map(t => h('span', { className: 'cat-tag', style: 'font-size:11px;padding:2px 8px' }, tagIcons[t] ? tagIcons[t] + ' ' + t : '🏷 ' + t))
          )
        : ''
    ])
  ]));

  if (item.image) {
    wrapper.appendChild(h('div', { style: 'padding:12px;text-align:center' }, [
      h('img', { src: item.image, style: 'max-width:100%;max-height:240px;border-radius:10px;border:1px solid var(--border)' })
    ]));
  }

  if (item.notes) {
    wrapper.appendChild(sectionBlock('备注', [
      h('div', { className: 'detail-row', style: 'flex-direction:column;align-items:flex-start;gap:4px' }, [
        h('span', { style: 'color:var(--text-secondary);font-size:14px' }, item.notes)
      ])
    ]));
  }

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

  wrapper.appendChild(sectionBlock('基本信息', infoRows));

  const locRows = [];
  if (item.containerId) {
    const path = await getContainerPath(item.containerId);
    locRows.push(rowLink('📍 ' + path.map(c => c.name).join(' > '), '', () => navigate('container-detail', { containerId: item.containerId })));
    locRows.push(h('div', { className: 'detail-row', onclick: () => startLocationScan(itemId, () => navigate('item-detail', { itemId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描换位'));
  } else {
    locRows.push(h('div', { className: 'detail-row', style: 'color:var(--text-tertiary)' }, '未设置位置'));
    locRows.push(h('div', { className: 'detail-row', onclick: () => startLocationScan(itemId, () => navigate('item-detail', { itemId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描关联位置'));
  }
  wrapper.appendChild(sectionBlock('📍 所在位置', locRows));

  const related = await getItemRelations(itemId);
  if (related.length > 0) {
    const relRows = related.map(({ relation, item: ri }) =>
      h('div', { className: 'detail-row', onclick: () => navigate('item-detail', { itemId: ri.id }), style: 'cursor:pointer' }, [
        h('span', { className: 'value', style: 'flex:1;text-align:left' }, ri.name),
        h('span', { className: 'chevron' }, '›'),
        h('span', { onclick: (e) => { e.stopPropagation(); showDeleteDialog('关联', ri.name, () => { db.relations.delete(relation.id).then(() => render()); }); }, style: 'color:var(--red);cursor:pointer;font-size:16px;margin-left:4px' }, '✕')
      ])
    );
    relRows.push(h('div', { className: 'detail-row', style: 'justify-content:center;gap:16px' }, [
      h('span', { onclick: () => startAssociationScan(itemId, () => navigate('item-detail', { itemId })), style: 'cursor:pointer;color:var(--green)' }, '📷 扫描关联'),
      h('span', { onclick: () => showAddRelationPicker(itemId, () => render()), style: 'cursor:pointer;color:var(--tint)' }, '➕ 添加关联')
    ]));
    wrapper.appendChild(sectionBlock('关联物品', relRows));
  } else {
    wrapper.appendChild(sectionBlock('关联物品', [
      h('div', { className: 'detail-row', style: 'justify-content:center;gap:16px' }, [
        h('span', { onclick: () => startAssociationScan(itemId, () => navigate('item-detail', { itemId })), style: 'cursor:pointer;color:var(--green)' }, '📷 扫描关联'),
        h('span', { onclick: () => showAddRelationPicker(itemId, () => render()), style: 'cursor:pointer;color:var(--tint)' }, '➕ 添加关联')
      ])
    ]));
  }

  container.appendChild(wrapper);

  const actionBtn = $('#header .action');
  actionBtn.style.display = 'flex';
  actionBtn.innerHTML = '';
  const homeIcon = h('span', { onclick: () => switchTab('items'), style: 'margin-right:8px;display:inline-flex;align-items:center;cursor:pointer' });
  homeIcon.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 22L2 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 11L10.1259 4.49931C11.2216 3.62279 12.7784 3.62279 13.8741 4.49931L22 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path opacity="0.5" d="M15.5 5.5V3.5C15.5 3.22386 15.7239 3 16 3H18.5C18.7761 3 19 3.22386 19 3.5V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 22V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M20 22V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path opacity="0.5" d="M15 22V17C15 15.5858 15 14.8787 14.5607 14.4393C14.1213 14 13.4142 14 12 14C10.5858 14 9.87868 14 9.43934 14.4393C9 14.8787 9 15.5858 9 17V22" stroke="currentColor" stroke-width="1.5"/><path opacity="0.5" d="M14 9.5C14 10.6046 13.1046 11.5 12 11.5C10.8954 11.5 10 10.6046 10 9.5C10 8.39543 10.8954 7.5 12 7.5C13.1046 7.5 14 8.39543 14 9.5Z" stroke="currentColor" stroke-width="1.5"/></svg>';
  actionBtn.appendChild(homeIcon);
  const qrIcon2 = h('span', { onclick: () => showQRModal('item', itemId, item.name, item.qrCode), style: 'margin-right:8px;display:inline-flex;align-items:center;cursor:pointer' });
  qrIcon2.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.75 5.25H5.25V9.75H9.75V5.25ZM3.75 3.75V11.25H11.25V3.75H3.75ZM9.75 14.25H5.25V18.75H9.75V14.25ZM3.75 12.75V20.25H11.25V12.75H3.75ZM14.25 5.25H18.75V9.75H14.25V5.25ZM12.75 11.25V3.75H20.25V11.25H12.75ZM12.75 17.25V12.75H14.25V17.25H12.75ZM6.75 6.75V8.25H8.25V6.75H6.75ZM6.75 17.25V15.75H8.25V17.25H6.75ZM15.75 6.75V8.25H17.25V6.75H15.75ZM18.75 20.25V18H20.25V20.25H18.75ZM18.75 12.75V15H17.25V12.75H15.75V18.75H12.75V20.25H17.25V16.5H20.25V15V12.75H18.75Z" fill="currentColor"/></svg>';
  actionBtn.appendChild(qrIcon2);
  const editIcon2 = h('span', { onclick: () => navigate('item-edit', { itemId }), style: 'margin-right:8px;display:inline-flex;align-items:center;cursor:pointer' });
  editIcon2.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 22H3c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h18c.41 0 .75.34.75.75s-.34.75-.75.75z" fill="currentColor"/><path d="M19.0206 3.48162c-1.94-1.94-3.84-1.99-5.83 0l-1.21 1.21c-.1.1-.14.26-.1.4.76 2.65 2.88 4.77 5.53 5.53.04.01.08.02.12.02.11 0 .21-.04.29-.12l1.2-1.21c.99-.98 1.47-1.93 1.47-2.89.01-.99-.47-1.95-1.47-2.94z" fill="currentColor"/><path d="M15.6103 11.5308c-.29-.14-.57-.28-.84-.44-.22-.13-.43-.27-.64-.42-.17-.11-.37-.27-.56-.43-.02-.01-.09-.07-.17-.15-.33-.28-.7-.64-1.03-1.04-.03-.02-.08-.09-.15-.18-.1-.12-.27-.32-.42-.55-.12-.15-.26-.37-.39-.59-.16-.27-.3-.54-.44-.82-.0211-.0454-.0416-.0906-.0612-.1355-.1476-.3333-.5823-.4308-.84-.173l-5.7285 5.7285c-.13.13-.25.38-.28.55l-.54 3.83c-.1.68.09 1.32.51 1.75.36.35.86.54 1.4.54.12 0 .24-.01.36-.03l3.84-.54c.18-.03.43-.15.55-.28l5.7213-5.7205c.2596-.2596.1617-.705-.1756-.8491-.038-.0162-.0765-.0328-.1149-.0496z" fill="currentColor"/></svg>';
  actionBtn.appendChild(editIcon2);
  const delIcon2 = h('span', { onclick: () => showDeleteDialog('物品', item.name, async () => {
    await deleteItemRelations(itemId);
    await db.items.delete(itemId);
    goBack();
  }), style: 'color:var(--red);display:inline-flex;align-items:center;cursor:pointer' });
  delIcon2.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16,7V4a1,1,0,0,0-1-1H9A1,1,0,0,0,8,4V7m4,4v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M4,7H20M17.07,20.07,18,7H6l.93,13.07a1,1,0,0,0,1,.93h8.14A1,1,0,0,0,17.07,20.07Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  actionBtn.appendChild(delIcon2);

  // ── 左右滑动切换物品 ──
  const list = state.itemListOrder || [];
  const curIdx = list.indexOf(itemId);
  const hasPrev = curIdx > 0;
  const hasNext = curIdx >= 0 && curIdx < list.length - 1;

  if (hasPrev || hasNext) {
    let sx = 0, sy = 0, dx = 0;
    let active = false, horiz = false, locked = false;

    const onStart = function(e) {
      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY; dx = 0;
      active = true; horiz = false; locked = false;
      wrapper.style.transition = 'none';
      wrapper.style.opacity = '1';
    };

    const onMove = function(e) {
      if (!active) return;
      var t = e.touches[0];
      var ndx = t.clientX - sx;
      var ndy = t.clientY - sy;
      if (!locked) {
        if (Math.abs(ndx) > 8 || Math.abs(ndy) > 8) {
          locked = true;
          horiz = Math.abs(ndx) > Math.abs(ndy);
        } else { return; }
      }
      if (!horiz) return;
      dx = Math.max(-140, Math.min(140, ndx));
      wrapper.style.transform = 'translateX(' + dx + 'px)';
      wrapper.style.opacity = Math.max(0.3, 1 - Math.abs(dx) / 200);
    };

    const onEnd = function() {
      if (!active) return;
      active = false;
      wrapper.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
      if (dx < -70 && hasNext) {
        wrapper.style.transform = 'translateX(-110%)';
        wrapper.style.opacity = '0';
        setTimeout(function() { navigate('item-detail', { itemId: list[curIdx + 1] }); }, 280);
      } else if (dx > 70 && hasPrev) {
        wrapper.style.transform = 'translateX(110%)';
        wrapper.style.opacity = '0';
        setTimeout(function() { navigate('item-detail', { itemId: list[curIdx - 1] }); }, 280);
      } else {
        wrapper.style.transform = 'translateX(0)';
        wrapper.style.opacity = '1';
      }
    };

    wrapper.addEventListener('touchstart', onStart, { passive: true });
    wrapper.addEventListener('touchmove', onMove, { passive: true });
    wrapper.addEventListener('touchend', onEnd);
  }
}

// 渲染物品编辑页，负责创建和更新物品记录。
export async function renderItemEdit(container, itemId, presetContainerId, presetQrCode) {
  const item = itemId ? await db.items.get(itemId) : null;
  const isEdit = !!item;

  const form = h('div', { className: 'form' });
  form.appendChild(formGroup('物品名称', h('input', { type: 'text', id: 'edit-name', value: item?.name || '', placeholder: '输入物品名称' })));

  // 备注：可折叠，默认收起
  (function() {
    const g = h('div', { className: 'form-group fold-group' });
    const head = h('div', { className: 'fold-header', onclick: function() {
      const body = this.nextElementSibling;
      const arrow = this.querySelector('.fold-arrow');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      arrow.style.transform = hidden ? 'rotate(90deg)' : '';
    }}, [
      h('label', { style: 'margin-bottom:0' }, '备注'),
      h('span', { className: 'fold-arrow' }, '›')
    ]);
    const body = h('div', { className: 'fold-body', style: 'display:none;padding-top:6px' });
    body.appendChild(h('textarea', { id: 'edit-notes' }, item?.notes || ''));
    g.appendChild(head);
    g.appendChild(body);
    form.appendChild(g);
  })();

  let imageData = item?.image || '';
  const imgPreview = h('div', { id: 'edit-img-preview', style: 'margin-top:8px;text-align:center' });
  if (imageData) {
    imgPreview.appendChild(h('img', { src: imageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
  }
  const imgInput = h('input', { type: 'file', id: 'edit-img', accept: 'image/*',
    style: 'width:100%;font-size:15px',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      imageData = await compressImage(file, getImageMaxWidth());
      imgPreview.innerHTML = '';
      imgPreview.appendChild(h('img', { src: imageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
    }
  });
  form.appendChild(formGroup('照片', h('div', {}, [imgInput, imgPreview])));

  const hasQty = item?.quantity != null;
  form.appendChild(toggleField('记录数量', 'edit-has-qty', hasQty, 'edit-qty-row'));
  const qtyRow = h('div', { id: 'edit-qty-row', style: hasQty ? '' : 'display:none' }, [
    h('input', { type: 'number', id: 'edit-qty', value: item?.quantity || 1, min: '0', placeholder: '数量' })
  ]);
  form.appendChild(formGroup('', qtyRow));

  const catSelect = h('select', { id: 'edit-category' });
  getCategoriesList().forEach(c => {
    catSelect.appendChild(h('option', { value: c.name, selected: item?.category === c.name || (!item && c.name === '其他') ? 'selected' : undefined }, c.icon + ' ' + c.name));
  });
  form.appendChild(formGroup('分类', h('div', { style: 'display:flex;align-items:center;gap:4px' }, [
    catSelect,
    h('button', { type: 'button', style: 'padding:6px 2px;border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-secondary)', onclick: () => showCategoryManager() }, '✏️')
  ])));

  const tagGrid = h('div', { id: 'edit-tags', style: 'display:flex;flex-wrap:wrap;gap:6px' });
  const itemTags = item?.tags || [];
  getTagsList().forEach(t => {
    const checked = itemTags.includes(t.name);
    const btn = h('button', {
      type: 'button',
      className: 'chip tag-chip' + (checked ? ' selected' : ''),
      style: (checked ? '' : 'opacity:0.5') + ';cursor:pointer',
      onclick: function() {
        var isSel = this.classList.contains('selected');
        if (isSel) { this.classList.remove('selected'); this.style.opacity = '0.5'; }
        else { this.classList.add('selected'); this.style.opacity = '1'; }
      }
    }, t.icon + ' ' + t.name);
    tagGrid.appendChild(btn);
  });
  form.appendChild(formGroup('标签', h('div', { style: 'display:flex;align-items:flex-start;gap:4px' }, [
    tagGrid,
    h('button', { type: 'button', style: 'padding:6px 2px;border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-secondary);flex-shrink:0', onclick: () => showTagManager() }, '✏️')
  ])));

  const hasExpiry = !!item?.expiryDate;
  form.appendChild(toggleField('设置保质期', 'edit-has-expiry', hasExpiry, 'edit-expiry-row'));
  const expiryInput = h('input', { type: 'date', id: 'edit-expiry', value: item?.expiryDate ? formatDate(item.expiryDate) : formatDate(Date.now()) });
  form.appendChild(formGroup('', h('div', { id: 'edit-expiry-row', style: hasExpiry ? '' : 'display:none' }, [expiryInput])));

  // 逐级联动：存放位置选择
  const allContainers = await db.containers.toArray();
  const contMap = {};
  allContainers.forEach(c => { contMap[c.id] = c; });
  const roots = allContainers.filter(c => c.parentId === '').sort((a, b) => a.sortOrder - b.sortOrder);

  function getChildren(pid) {
    return allContainers.filter(c => c.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // 计算祖先路径（编辑已有物品或新建时预设容器）
  const defaultContainerId = item ? item.containerId : (presetContainerId || '');
  const ancestorPath = [];
  if (defaultContainerId && contMap[defaultContainerId]) {
    let pid = contMap[defaultContainerId].parentId;
    while (pid && contMap[pid]) {
      ancestorPath.unshift(contMap[pid]);
      pid = contMap[pid].parentId;
    }
  }

  const cascadeDiv = h('div', { id: 'edit-container-cascade', style: 'display:flex;flex-direction:column;gap:6px' });
  const selStyle = 'width:100%;padding:12px;border:1px solid var(--separator);border-radius:8px;font-size:15px;background:var(--card-bg);color:var(--text)';

  function makeSelect(level, options, selectedValue) {
    const sel = h('select', { className: 'cascade-select', 'data-level': String(level), style: selStyle });
    if (level === 0) {
      sel.appendChild(h('option', { value: '' }, '未归类'));
    } else {
      sel.appendChild(h('option', { value: '' }, '—'));
    }
    options.forEach(o => {
      sel.appendChild(h('option', { value: o.id, selected: o.id === selectedValue ? 'selected' : undefined }, o.icon + ' ' + o.name));
    });
    return sel;
  }

  function rebuildFromLevel(startLevel, startParentId) {
    var selects = [...cascadeDiv.querySelectorAll('.cascade-select')];
    selects.forEach(function(s) {
      if (parseInt(s.dataset.level) >= startLevel) s.remove();
    });
    if (startLevel === -1) {
      cascadeDiv.innerHTML = '';
      var s0 = makeSelect(0, roots, ancestorPath.length > 0 ? ancestorPath[0].id : '');
      cascadeDiv.appendChild(s0);
      bindChange(s0);
      if (s0.value) cascadeFrom(s0);
      return;
    }
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

  function cascadeFrom(sel) {
    var lvl = parseInt(sel.dataset.level);
    var children = getChildren(sel.value);
    if (children.length > 0) {
      rebuildFromLevel(lvl + 1, sel.value);
    }
  }

  // 首次渲染：预填祖先路径
  if (ancestorPath.length > 0) {
    var pid2 = '';
    for (var ai = 0; ai < ancestorPath.length; ai++) {
      var options = ai === 0 ? roots : getChildren(pid2);
      var sel = makeSelect(ai, options, ancestorPath[ai].id);
      cascadeDiv.appendChild(sel);
      bindChange(sel);
      pid2 = ancestorPath[ai].id;
    }
    if (defaultContainerId && contMap[defaultContainerId]) {
      var lastChildren = getChildren(pid2);
      if (lastChildren.length > 0) {
        var lastSel = makeSelect(ancestorPath.length, lastChildren, defaultContainerId);
        cascadeDiv.appendChild(lastSel);
        bindChange(lastSel);
      }
    }
  } else {
    var s0 = makeSelect(0, roots, '');
    cascadeDiv.appendChild(s0);
    bindChange(s0);
  }

  form.appendChild(formGroup('存放位置', h('div', { style: 'display:flex;align-items:flex-start;gap:4px' }, [
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
        if (!foundId || !contMap[foundId]) {
          alert('未识别到位置条码/二维码');
          return;
        }
        var path = [];
        var pid3 = contMap[foundId]?.parentId;
        while (pid3 && contMap[pid3]) {
          path.unshift(contMap[pid3]);
          pid3 = contMap[pid3].parentId;
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
        var finalOpts = path.length === 0 ? roots : getChildren(cp);
        var fs = makeSelect(path.length, finalOpts, foundId);
        cascadeDiv.appendChild(fs);
        bindChange(fs);
      }, 'container');
    } }, '📷')
  ])));

  // QR 码/条码：手动输入 + 扫码关联（扫入的条码灰色只读）
  const hasPresetQr = !!presetQrCode;
  const qrInput = h('input', { type: 'text', id: 'edit-qrcode',
    value: item?.qrCode || presetQrCode || '',
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
  const saveIcon2 = h('span', { onclick: async () => {
    const name = $('#edit-name').value.trim();
    if (!name) return;

    const data = {
      name,
      image: imageData,
      quantity: document.getElementById('edit-has-qty').classList.contains('on') ? parseInt($('#edit-qty').value) || null : null,
      category: $('#edit-category').value,
      tags: [...document.querySelectorAll('#edit-tags .chip.selected')].map(b => b.textContent.replace(/^[^\s]*\s/, '')),
      expiryDate: document.getElementById('edit-has-expiry').classList.contains('on') ? new Date($('#edit-expiry').value).getTime() : null,
      containerId: (function() { const sels = [...document.querySelectorAll('#edit-container-cascade .cascade-select')]; for (let i = sels.length - 1; i >= 0; i--) { if (sels[i].value) return sels[i].value; } return ''; })(),
      notes: $('#edit-notes').value,
      qrCode: $('#edit-qrcode').value.trim() || presetQrCode || undefined
    };

    if (isEdit) {
      await db.items.update(itemId, data);
      goBack();
    } else {
      const newId = uuid();
      await db.items.put({
        id: newId,
        ...data,
        addedDate: Date.now()
      });
      // 新建完成 → 替换栈顶为新物品详情，返回时仍回到来源页（首页/容器详情）
      replaceNavigate('item-detail', { itemId: newId });
    }
  }, style: 'display:inline-flex;align-items:center;cursor:pointer' });
  saveIcon2.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><polygon points="17 2 2 2 2 22 7 22 7 13 17 13 17 22 22 22 22 7 17 2" fill="currentColor" opacity="0.15"/><polygon points="17 2 2 2 2 22 7 22 7 13 17 13 17 22 22 22 22 7 17 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="miter"/><line x1="7" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="22" x2="17" y2="22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  actionBtn.appendChild(saveIcon2);
}

// 添加关联弹窗——支持分类筛选和搜索，适合物品较多时快速定位。
async function showAddRelationPicker(itemId, onDone) {
  const related = await getItemRelations(itemId);
  const relatedIds = new Set(related.map(r => r.item.id));
  relatedIds.add(itemId);
  const allItems = await db.items.toArray();
  const cats = getCategoriesList();

  const overlay = h('div', { className: 'overlay', style: 'z-index:999' });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  const dialog = h('div', { className: 'dialog', style: 'max-height:75vh;display:flex;flex-direction:column' });
  dialog.appendChild(h('div', { className: 'msg', style: 'text-align:center;padding-bottom:8px' }, [
    h('div', { style: 'font-weight:600;margin-bottom:6px' }, '添加关联物品')
  ]));

  // 搜索框 + 分类下拉
  const filterBar = h('div', { style: 'display:flex;gap:8px;margin-bottom:4px' });
  const searchInput = h('input', { type: 'text', placeholder: '搜索物品名...', style: 'flex:1;padding:8px 10px;border:1px solid var(--separator);border-radius:6px;font-size:14px' });
  const catSelect = h('select', { style: 'width:40%;padding:8px 6px;border:1px solid var(--separator);border-radius:6px;font-size:14px' });
  catSelect.appendChild(h('option', { value: '' }, '全部分类'));
  cats.forEach(c => catSelect.appendChild(h('option', { value: c.name }, (c.icon || '') + ' ' + c.name)));
  filterBar.appendChild(searchInput);
  filterBar.appendChild(catSelect);
  dialog.appendChild(filterBar);

  const list = h('div', { style: 'overflow-y:auto;max-height:50vh;margin:4px 0' });

  function renderList() {
    const kw = searchInput.value.toLowerCase();
    const cat = catSelect.value;
    const filtered = allItems.filter(i => {
      if (relatedIds.has(i.id)) return false;
      if (kw && !i.name.toLowerCase().includes(kw)) return false;
      if (cat && i.category !== cat) return false;
      return true;
    });
    list.innerHTML = '';
    if (filtered.length === 0) {
      list.appendChild(h('div', { style: 'text-align:center;padding:16px;color:var(--text-secondary);font-size:14px' }, '没有匹配的物品'));
    } else {
      filtered.forEach(i => {
        const row = h('div', {
          className: 'detail-row',
          style: 'cursor:pointer',
          onclick: async () => {
            await db.relations.put({ id: uuid(), sourceId: itemId, targetId: i.id, createdAt: Date.now() });
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
