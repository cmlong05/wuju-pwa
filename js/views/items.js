import { $, h, formatDate, isExpired, isExpiringSoon } from '../core/dom.js';
import { state, navigate, goBack, render } from '../core/app-shell.js';
import { db, getItemsSorted, getContainerPath, getItemRelations, deleteItemRelations, uuid } from '../db.js';
import { catIcons, tagIcons, categories, tags, showQRModal, showDeleteDialog, sectionBlock, rowItem, rowLink, formGroup, toggleField, emptyView, showTagManager, showCategoryManager } from '../ui.js';
import { startAssociationScan, startLocationScan } from '../scanner.js';

async function renderItemRows() {
  const wrap = document.getElementById('item-list-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const search = state.itemSearch;
  const category = state.itemCategory;
  const selectedTags = [...state.itemTags];

  let items = await getItemsSorted(state.itemSort);
  if (category) items = items.filter(i => i.category === category);
  if (selectedTags.length > 0) items = items.filter(i => i.tags && selectedTags.every(t => i.tags.includes(t)));
  if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (items.length === 0) {
    wrap.appendChild(emptyView(search || category ? '🔍' : '📦', search || category ? '没有找到' : '还没有物品', search || category ? '试试其他关键词' : '点击右上角 + 添加第一个物品'));
    return;
  }

  const list = h('div', { className: 'card-row-group' });
  items.forEach(item => {
    const row = h('div', { className: 'card-row item-row', onclick: () => navigate('item-detail', { itemId: item.id }) }, [
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

function refreshItemList() {
  renderItemRows();
}

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
  container.appendChild(h('div', { id: 'item-list-wrap' }));

  const chipRow = h('div', { className: 'chip-scroll' });
  chipRow.appendChild(h('button', {
    className: 'chip' + (category === null ? ' selected' : ''),
    onclick: () => { state.itemCategory = null; render(); }
  }, '全部'));
  categories.forEach(c => {
    chipRow.appendChild(h('button', {
      className: 'chip' + (category === c.name ? ' selected' : ''),
      onclick: () => { state.itemCategory = (category === c.name ? null : c.name); render(); }
    }, c.icon + ' ' + c.name));
  });
  chipRow.appendChild(h('button', {
    className: 'chip chip-manage',
    onclick: () => showCategoryManager(),
    style: 'font-size:14px'
  }, '✏️'));
  container.appendChild(chipRow);

  const tagRow = h('div', { className: 'chip-scroll', style: 'margin-top:4px' });
  tagRow.appendChild(h('span', { style: 'font-size:11px;color:var(--text-tertiary);padding:6px 4px;white-space:nowrap' }, '标签:'));
  tags.forEach(t => {
    const selected = state.itemTags.has(t.name);
    tagRow.appendChild(h('button', {
      className: 'chip' + (selected ? ' selected' : ''),
      style: selected ? '' : 'opacity:0.65',
      onclick: () => {
        if (selected) state.itemTags.delete(t.name);
        else state.itemTags.add(t.name);
        render();
      }
    }, t.icon + ' ' + t.name));
  });
  tagRow.appendChild(h('button', {
    className: 'chip chip-manage',
    onclick: () => showTagManager(),
    style: 'font-size:14px'
  }, '✏️'));
  container.appendChild(tagRow);

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
        h('span', { className: 'relation-chip' }, relation.relationType),
        h('span', { className: 'value', style: 'text-align:left' }, ri.name),
        h('span', { className: 'chevron' }, '›')
      ])
    );
    relRows.push(h('div', { className: 'detail-row', onclick: () => navigate('relation-edit', { itemId }), style: 'cursor:pointer;justify-content:center;color:var(--tint)' }, '🔗 管理关联'));
    relRows.push(h('div', { className: 'detail-row', onclick: () => startAssociationScan(itemId, () => navigate('item-detail', { itemId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描关联'));
    wrapper.appendChild(sectionBlock('关联物品', relRows));
  } else {
    wrapper.appendChild(sectionBlock('关联物品', [
      h('div', { className: 'detail-row', onclick: () => navigate('relation-edit', { itemId }), style: 'cursor:pointer;justify-content:center;color:var(--tint)' }, '🔗 添加关联'),
      h('div', { className: 'detail-row', onclick: () => startAssociationScan(itemId, () => navigate('item-detail', { itemId })), style: 'cursor:pointer;justify-content:center;color:var(--green)' }, '📷 扫描关联')
    ]));
  }

  if (item.notes) {
    wrapper.appendChild(sectionBlock('备注', [
      h('div', { className: 'detail-row', style: 'flex-direction:column;align-items:flex-start;gap:4px' }, [
        h('span', { style: 'color:var(--text-secondary);font-size:14px' }, item.notes)
      ])
    ]));
  }

  container.appendChild(wrapper);

  const actionBtn = $('#header .action');
  actionBtn.style.display = 'block';
  actionBtn.innerHTML = '';
  actionBtn.appendChild(h('span', { onclick: () => showQRModal('item', itemId, item.name, item.qrCode), style: 'margin-right:8px' }, '🔲'));
  actionBtn.appendChild(h('span', { onclick: () => navigate('item-edit', { itemId }), style: 'margin-right:8px' }, '编辑'));
  actionBtn.appendChild(h('span', { onclick: () => showDeleteDialog('物品', item.name, async () => {
    await deleteItemRelations(itemId);
    await db.items.delete(itemId);
    goBack();
  }), style: 'color:var(--red)' }, '🗑'));
}

export async function renderItemEdit(container, itemId) {
  const item = itemId ? await db.items.get(itemId) : null;
  const isEdit = !!item;

  const form = h('div', { className: 'form' });
  form.appendChild(formGroup('物品名称', h('input', { type: 'text', id: 'edit-name', value: item?.name || '', placeholder: '输入物品名称' })));

  let imageData = item?.image || '';
  const imgPreview = h('div', { id: 'edit-img-preview', style: 'margin-top:8px;text-align:center' });
  if (imageData) {
    imgPreview.appendChild(h('img', { src: imageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
  }
  const imgInput = h('input', { type: 'file', id: 'edit-img', accept: 'image/*', capture: 'environment',
    style: 'width:100%;font-size:15px',
    onchange: (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        imageData = reader.result;
        imgPreview.innerHTML = '';
        imgPreview.appendChild(h('img', { src: imageData, style: 'max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)' }));
      };
      reader.readAsDataURL(file);
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
  categories.forEach(c => {
    catSelect.appendChild(h('option', { value: c.name, selected: item?.category === c.name || (!item && c.name === '其他') ? 'selected' : undefined }, c.icon + ' ' + c.name));
  });
  form.appendChild(formGroup('分类', catSelect));

  const tagGrid = h('div', { id: 'edit-tags', style: 'display:flex;flex-wrap:wrap;gap:6px' });
  const itemTags = item?.tags || [];
  tags.forEach(t => {
    const checked = itemTags.includes(t.name);
    const btn = h('button', {
      type: 'button',
      className: 'chip' + (checked ? ' selected' : ''),
      style: (checked ? '' : 'opacity:0.5') + ';cursor:pointer',
      onclick: function() {
        var isSel = this.classList.contains('selected');
        if (isSel) { this.classList.remove('selected'); this.style.opacity = '0.5'; }
        else { this.classList.add('selected'); this.style.opacity = '1'; }
      }
    }, t.icon + ' ' + t.name);
    tagGrid.appendChild(btn);
  });
  form.appendChild(formGroup('标签', tagGrid));

  const hasExpiry = !!item?.expiryDate;
  form.appendChild(toggleField('设置保质期', 'edit-has-expiry', hasExpiry, 'edit-expiry-row'));
  const expiryInput = h('input', { type: 'date', id: 'edit-expiry', value: item?.expiryDate ? formatDate(item.expiryDate) : formatDate(Date.now()) });
  form.appendChild(formGroup('', h('div', { id: 'edit-expiry-row', style: hasExpiry ? '' : 'display:none' }, [expiryInput])));

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

  form.appendChild(formGroup('备注', h('textarea', { id: 'edit-notes' }, item?.notes || '')));

  container.appendChild(form);

  const actionBtn = $('#header .action');
  actionBtn.style.display = 'block';
  actionBtn.innerHTML = '';
  actionBtn.appendChild(h('span', { onclick: async () => {
    const name = $('#edit-name').value.trim();
    if (!name) return;

    const data = {
      name,
      image: imageData,
      quantity: document.getElementById('edit-has-qty').classList.contains('on') ? parseInt($('#edit-qty').value) || null : null,
      category: $('#edit-category').value,
      tags: [...document.querySelectorAll('#edit-tags .chip.selected')].map(b => b.textContent.replace(/^[^\s]*\s/, '')),
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

export async function renderRelationEdit(container, itemId) {
  const item = await db.items.get(itemId);
  if (!item) { container.textContent = '物品不存在'; return; }

  const wrapper = h('div', {});

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

  const allItems = await db.items.toArray();
  const available = allItems.filter(i => i.id !== itemId);

  if (available.length > 0) {
    const addSection = h('div', { className: 'detail-section', style: 'margin-top:16px' });
    addSection.appendChild(h('div', { className: 'section-title' }, '添加关联'));

    const targetSelect = h('select', { id: 'rel-target', style: 'width:100%;padding:12px;border:1px solid var(--separator);border-radius:8px;font-size:15px;margin-bottom:8px' });
    targetSelect.appendChild(h('option', { value: '' }, '选择物品...'));
    available.forEach(i => targetSelect.appendChild(h('option', { value: i.id }, i.name)));

    const typeSelect = h('select', { id: 'rel-type', style: 'width:100%;padding:12px;border:1px solid var(--separator);border-radius:8px;font-size:15px;margin-bottom:8px' });
    ['属于', '搭配', '替换', '备用'].forEach(t => typeSelect.appendChild(h('option', { value: t }, t)));

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
