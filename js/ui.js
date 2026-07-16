import { h } from './core/dom.js';
import { render } from './core/app-shell.js';
import { db, getCategories, getTags, addCategory, deleteCategory, updateCategory, addTag, deleteTag, updateTag } from './db.js';
import { showScanner } from './scanner.js';

export const catIcons = {};
export const tagIcons = {};

const _categories = [];
const _tags = [];

export function getCategoriesList() { return _categories; }
export function getTagsList() { return _tags; }

// 从 IndexedDB 重新加载分类，并同步更新名称到图标的缓存映射。
export async function loadCategories() {
  const fresh = await getCategories();
  _categories.splice(0, _categories.length, ...fresh);
  for (const key of Object.keys(catIcons)) delete catIcons[key];
  fresh.forEach(c => { catIcons[c.name] = c.icon; });
}

// 从 IndexedDB 重新加载标签，并同步更新名称到图标的缓存映射。
export async function loadTags() {
  const fresh = await getTags();
  _tags.splice(0, _tags.length, ...fresh);
  for (const key of Object.keys(tagIcons)) delete tagIcons[key];
  fresh.forEach(t => { tagIcons[t.name] = t.icon; });
}

// 组合一块详情页区块标题和内容行，保持详情页结构一致。
export function sectionBlock(title, rows) {
  const sec = h('div', { className: 'detail-section' });
  sec.appendChild(h('div', { className: 'section-title' }, title));
  const card = h('div', { className: 'card-row-group' });
  rows.forEach(r => card.appendChild(r));
  sec.appendChild(card);
  return sec;
}

// 渲染一个只读的详情行，适合展示标签和值。
export function rowItem(label, value) {
  return h('div', { className: 'detail-row' }, [
    h('span', { className: 'label' }, label),
    h('span', { className: 'value' }, value)
  ]);
}

// 渲染一个可点击的详情行，常用于跳转到关联实体。
export function rowLink(label, value, onclick) {
  return h('div', { className: 'detail-row', onclick, style: 'cursor:pointer' }, [
    h('span', { className: 'label' }, label),
    h('span', { className: 'value' }, value),
    h('span', { className: 'chevron' }, '›')
  ]);
}

// 统一表单字段包裹结构，减少各编辑页重复写 label 和容器布局。
export function formGroup(label, child) {
  const g = h('div', { className: 'form-group' });
  if (label) g.appendChild(h('label', {}, label));
  g.appendChild(child);
  return g;
}

// 渲染一个开关行，并控制目标区域的显隐。
export function toggleField(label, id, initial, targetId) {
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

// 渲染空状态，避免列表为空时各页面各写一套空提示。
export function emptyView(icon, title, desc) {
  return h('div', { className: 'empty' }, [
    h('div', { className: 'icon' }, icon),
    h('div', { className: 'title' }, title),
    h('div', {}, desc)
  ]);
}

// 显示删除确认弹窗，所有实体删除操作都走同一套确认交互。
export function showDeleteDialog(type, name, onConfirm, onCancel) {
  function close() {
    overlay.remove();
    if (onCancel) onCancel();
  }
  const overlay = h('div', { className: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
    h('div', { className: 'dialog' }, [
      h('div', { className: 'msg' }, '确定要删除「' + name + '」吗？'),
      h('div', { className: 'btns' }, [
        h('button', { style: 'background:#E5E5EA;color:var(--text)', onclick: close }, '取消'),
        h('button', { style: 'background:var(--red);color:#fff', onclick: () => { overlay.remove(); onConfirm(); } }, '删除')
      ])
    ])
  ]);
  document.body.appendChild(overlay);
}

const EMOJI_POOL = ['🍎','🍞','🥩','🥬','🍺','💊','👕','👟','🔧','📺','✏️','🧹','🎨','📦','🏠','📚','💄','🧸','🐱','🚗','💻','🎮','🎵','⚽','🌿','🔋','📷','⌚','💡','🧴'];

// 复用的实体管理弹窗：支持新增、编辑图标和删除分类/标签这类小型字典数据。
export function showEntityManager(config) {
  var { title, listId, newNameId, items, addFn, deleteFn, updateFn, reloadFn, defaultIcon, itemLabel, completeFn } = config;

  var overlay = h('div', { className: 'overlay', onclick: function(e) { if (e.target === overlay) overlay.remove(); } }, [
    h('div', { className: 'dialog', style: 'max-width:360px;max-height:80vh;overflow-y:auto' }, [
      h('div', { style: 'font-weight:600;font-size:17px;margin-bottom:16px;text-align:center' }, title),
      h('div', { id: listId }),
      h('div', { style: 'margin-top:12px;border-top:1px solid var(--separator);padding-top:12px' }, [
        h('div', { style: 'font-weight:500;font-size:14px;margin-bottom:8px' }, '添加新' + itemLabel),
        h('div', { style: 'display:flex;gap:8px;align-items:center' }, [
          h('input', { type: 'text', id: newNameId, placeholder: itemLabel + '名称', style: 'flex:1;padding:10px;border:1px solid var(--separator);border-radius:8px;font-size:15px' }),
          h('button', {
            style: 'padding:10px 16px;border-radius:8px;border:none;background:var(--tint);color:#fff;font-size:15px;cursor:pointer;white-space:nowrap',
            onclick: async function() {
              var name = document.getElementById(newNameId).value.trim();
              if (!name) return;
              await addFn(name, defaultIcon);
              await reloadFn();
              renderList();
              document.getElementById(newNameId).value = '';
            }
          }, '添加')
        ])
      ]),
      h('div', { style: 'margin-top:12px;text-align:center' }, [
        h('button', {
          style: 'padding:10px 24px;border-radius:8px;border:none;background:#E5E5EA;cursor:pointer;font-size:15px',
          onclick: async function() { overlay.remove(); await reloadFn(); if (completeFn) await completeFn(); }
        }, '完成')
      ])
    ])
  ]);

  // 重新渲染弹窗内的列表区域，确保编辑和删除后的状态及时更新。
  function renderList() {
    var list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = '';
    items.forEach(function(c) {
      var row = h('div', {
        style: 'display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--separator);gap:8px'
      }, [
        h('span', { style: 'font-size:20px;min-width:28px;text-align:center' }, c.icon),
        h('span', { style: 'flex:1;font-size:15px' }, c.name),
        h('button', {
          style: 'background:none;border:none;color:var(--tint);cursor:pointer;font-size:14px;padding:4px 8px',
          onclick: function() { startEdit(c, row); }
        }, '✏️'),
        (function() { var b = document.createElement('button'); b.setAttribute('style', 'background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:4px 8px'); b.innerHTML = '<svg width="1rem" height="1rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16,7V4a1,1,0,0,0-1-1H9A1,1,0,0,0,8,4V7m4,4v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M4,7H20M17.07,20.07,18,7H6l.93,13.07a1,1,0,0,0,1,.93h8.14A1,1,0,0,0,17.07,20.07Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; b.addEventListener('click', async function() { var ok = await deleteFn(c.id); if (ok === false) { alert(itemLabel + '「' + c.name + '」正在被使用，无法删除'); return; } await reloadFn(); renderList(); }); return b; }())
      ]);
      list.appendChild(row);
    });
  }

  // 把某一行切换成编辑态，允许改名并选择图标。
  function startEdit(c, row) {
    row.innerHTML = '';
    var input = h('input', { type: 'text', value: c.name, style: 'flex:1;padding:8px;border:1px solid var(--tint);border-radius:8px;font-size:15px' });

    var emojiGrid = h('div', { style: 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:8px' });
    EMOJI_POOL.forEach(function(emoji) {
      var borderStyle = emoji === c.icon ? '2px solid var(--tint)' : '1px solid var(--separator)';
      var btn = h('button', {
        style: 'border:' + borderStyle + ';background:white;border-radius:8px;padding:6px;font-size:18px;cursor:pointer',
        onclick: function() { c.icon = emoji; emojiGrid.querySelectorAll('button').forEach(function(b) { b.style.border = '1px solid var(--separator)'; }); btn.style.border = '2px solid var(--tint)'; }
      }, emoji);
      emojiGrid.appendChild(btn);
    });

    var saveBtn = h('button', {
      style: 'margin-top:8px;padding:8px 16px;border-radius:8px;border:none;background:var(--tint);color:#fff;font-size:14px;cursor:pointer',
      onclick: async function() {
        var newName = input.value.trim();
        if (!newName) return;
        await updateFn(c.id, newName, c.icon);
        await reloadFn();
        renderList();
      }
    }, '保存');

    var cancelBtn = h('button', {
      style: 'margin-top:8px;margin-left:8px;padding:8px 16px;border-radius:8px;border:none;background:#E5E5EA;font-size:14px;cursor:pointer',
      onclick: function() { renderList(); }
    }, '取消');

    row.appendChild(h('div', { style: 'flex:1' }, [
      h('div', { style: 'display:flex;gap:4px;align-items:center' }, [
        h('span', { style: 'font-size:20px' }, c.icon),
        input
      ]),
      emojiGrid,
      h('div', {}, [saveBtn, cancelBtn])
    ]));
  }

  document.body.appendChild(overlay);
  renderList();
}

// 打开分类管理弹窗，并在完成后刷新主界面。
export function showCategoryManager() {
  showEntityManager({
    title: '管理分类', listId: 'cat-list', newNameId: 'cat-new-name',
    items: getCategoriesList(), addFn: addCategory, deleteFn: deleteCategory,
    updateFn: updateCategory, reloadFn: loadCategories,
    defaultIcon: '📦', itemLabel: '分类', completeFn: render
  });
}

// 打开标签管理弹窗，并在完成后刷新主界面。
export function showTagManager() {
  showEntityManager({
    title: '管理标签', listId: 'tag-list', newNameId: 'tag-new-name',
    items: getTagsList(), addFn: addTag, deleteFn: deleteTag,
    updateFn: updateTag, reloadFn: loadTags,
    defaultIcon: '🏷', itemLabel: '标签', completeFn: render
  });
}

// 显示实体二维码/条码弹窗，支持打印和扫码替换。
export function showQRModal(type, id, name, savedCode) {
  var currentText = savedCode || ('wuju:' + type + ':' + id);

  // 生成当前文本对应的 SVG 二维码。
  function renderQRSVG() {
    var w = new ZXing.BrowserQRCodeSvgWriter();
    return w.write(currentText, 300, 300);
  }

  // 刷新二维码预览和下方文本，保持展示内容同步。
  function refreshQR() {
    var svgContainer = document.getElementById('qr-svg');
    if (svgContainer) {
      var qrSvg = renderQRSVG();
      svgContainer.innerHTML = '';
      if (typeof qrSvg === 'string') {
        svgContainer.innerHTML = qrSvg;
      } else if (qrSvg && qrSvg.nodeType === 1) {
        svgContainer.appendChild(qrSvg);
      } else if (qrSvg && typeof qrSvg.outerHTML === 'string') {
        svgContainer.innerHTML = qrSvg.outerHTML;
      }
    }
    var textEl = document.getElementById('qr-text');
    if (textEl) textEl.textContent = currentText;
  }

  // 进入扫码替换流程，扫描新的码并检查重复后写回数据库。
  async function doScan() {
    showScanner(async function(scannedText) {
      var dupItem = await db.items.where('qrCode').equals(scannedText).filter(function(i) { return i.id !== id; }).first();
      if (dupItem) { alert('此条码已被物品「' + dupItem.name + '」使用'); return; }
      var dupContainer = await db.containers.where('qrCode').equals(scannedText).filter(function(c) { return c.id !== id; }).first();
      if (dupContainer) { alert('此条码已被容器「' + dupContainer.name + '」使用'); return; }

      if (type === 'item') {
        await db.items.update(id, { qrCode: scannedText });
      } else {
        await db.containers.update(id, { qrCode: scannedText });
      }
      overlay.remove();
      render();
    }, 'auto');
  }

  var overlay = h('div', { className: 'overlay', onclick: function(e) { if (e.target === overlay) overlay.remove(); } }, [
    h('div', { className: 'dialog', style: 'max-width:340px;text-align:center;position:relative' }, [
      h('button', {
        onclick: function() { overlay.remove(); },
        style: 'position:absolute;top:4px;right:4px;width:36px;height:36px;border:none;background:rgba(0,0,0,0.04);font-size:28px;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;line-height:1'
      }, '✕'),
      h('div', { style: 'margin-bottom:12px' }, [
        h('div', { style: 'font-size:11px;color:var(--text-secondary);margin-bottom:4px' },
          type === 'item' ? '📦 物品' : '🗂️ 容器'),
        h('div', { style: 'font-weight:600;font-size:17px' }, name),
      ]),
      h('div', { id: 'qr-svg', style: 'display:flex;justify-content:center' }),
      h('div', { id: 'qr-text', style: 'font-size:11px;color:var(--text-tertiary);margin-top:8px;word-break:break-all' }, currentText),
      h('div', { className: 'btns', style: 'margin-top:16px;flex-wrap:wrap;gap:8px' }, [
        h('button', {
          style: 'flex:1;min-width:70px;padding:12px 6px;border-radius:8px;border:none;background:var(--tint);color:#fff;cursor:pointer;font-size:14px',
          onclick: function() { doScan(); }
        }, '📷 扫描替换'),
        h('button', {
          style: 'flex:1;min-width:70px;padding:12px 6px;border-radius:8px;border:none;background:var(--tint);color:#fff;cursor:pointer;font-size:14px;font-weight:600',
          onclick: function() { window.print(); }
        }, '🖨 打印'),
      ]),
    ])
  ]);
  document.body.appendChild(overlay);
  refreshQR();
}
// ── 快速移动物品到容器 ──
export async function showMoveToContainer(itemId) {
  var item = await db.items.get(itemId);
  if (!item) return;
  var containers = await db.containers.orderBy('name').toArray();

  var overlay = h('div', { className: 'overlay', onclick: function(e) { if (e.target === overlay) close(); } });
  var dialog = h('div', { className: 'dialog', style: 'max-width:320px;max-height:70vh;overflow-y:auto;padding:0' });

  function close() {
    overlay.remove();
    render();
  }

  dialog.appendChild(h('div', { style: 'padding:14px 16px;font-weight:600;font-size:16px;border-bottom:1px solid var(--separator);display:flex;justify-content:space-between;align-items:center' }, [
    h('span', {}, '📦 ' + item.name + ' →'),
    h('button', {
      onclick: close,
      style: 'background:none;border:none;font-size:20px;color:var(--text-secondary);cursor:pointer'
    }, '✕')
  ]));

  var list = h('div', { className: 'card-row-group', style: 'margin:0;box-shadow:none;border-radius:0' });

  // 未归类选项
  var unclassed = h('div', {
    className: 'detail-row',
    style: 'cursor:pointer;' + (!item.containerId ? 'background:var(--tint-light)' : ''),
    onclick: async function() {
      await db.items.update(itemId, { containerId: '' });
      overlay.remove();
      render();
    }
  }, [h('span', { style: 'margin-right:8px' }, '📤'), h('span', {}, '未归类')]);
  list.appendChild(unclassed);

  containers.forEach(function(c) {
    var current = c.id === item.containerId;
    var row = h('div', {
      className: 'detail-row',
      style: 'cursor:pointer;' + (current ? 'background:var(--tint-light)' : ''),
      onclick: async function() {
        await db.items.update(itemId, { containerId: c.id });
        overlay.remove();
        render();
      }
    }, [
      h('span', { style: 'color:' + (c.color || '#5B8FF9') + ';margin-right:8px' }, c.icon),
      h('span', { style: 'flex:1' }, c.name),
      current ? h('span', { style: 'font-size:12px;color:var(--tint)' }, '✓') : ''
    ]);
    list.appendChild(row);
  });

  dialog.appendChild(list);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

// ── 从物品行左滑进入，快速编辑该物品的标签 ──
export async function showEditItemTags(itemId) {
  var item = await db.items.get(itemId);
  if (!item) return;
  var itemTags = item.tags || [];
  var allTags = getTagsList();

  var overlay = h('div', { className: 'overlay', onclick: function(e) { if (e.target === overlay) close(); } });
  var dialog = h('div', { className: 'dialog', style: 'max-width:340px;max-height:70vh;overflow-y:auto' });

  function close() {
    overlay.remove();
    render();
  }

  dialog.appendChild(h('div', { style: 'font-weight:600;font-size:17px;margin-bottom:8px;text-align:center' }, item.name));
  dialog.appendChild(h('div', { style: 'font-size:13px;color:var(--text-secondary);margin-bottom:12px;text-align:center' }, '选择标签'));

  var grid = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center' });
  allTags.forEach(function(t) {
    var checked = itemTags.includes(t.name);
    var btn = h('button', {
      type: 'button',
      className: 'chip tag-chip' + (checked ? ' selected' : ''),
      style: (checked ? '' : 'opacity:0.5') + ';cursor:pointer',
      onclick: function() {
        var isSel = this.classList.contains('selected');
        if (isSel) { this.classList.remove('selected'); this.style.opacity = '0.5'; }
        else { this.classList.add('selected'); this.style.opacity = '1'; }
      }
    }, t.icon + ' ' + t.name);
    grid.appendChild(btn);
  });
  dialog.appendChild(grid);

  // 管理标签入口
  var mgrBtn = h('button', {
    style: 'margin-top:12px;padding:8px 12px;border:none;background:none;color:var(--tint);cursor:pointer;font-size:13px;width:100%;text-align:center',
    onclick: function() { overlay.remove(); showTagManager(); }
  }, '✏️ 管理标签库');
  dialog.appendChild(mgrBtn);

  var btnRow = h('div', { className: 'btns', style: 'margin-top:16px' });
  btnRow.appendChild(h('button', {
    style: 'flex:1;padding:12px;border-radius:8px;border:none;background:#E5E5EA;color:var(--text);font-size:15px;cursor:pointer',
    onclick: close
  }, '取消'));
  btnRow.appendChild(h('button', {
    style: 'flex:1;padding:12px;border-radius:8px;border:none;background:var(--tint);color:#fff;font-size:15px;cursor:pointer',
    onclick: async function() {
      var selected = [...grid.querySelectorAll('.chip.selected')].map(function(b) { return b.textContent.replace(/^[^\s]*\s/, ''); });
      await db.items.update(itemId, { tags: selected });
      overlay.remove();
      render();
    }
  }, '保存'));
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}
