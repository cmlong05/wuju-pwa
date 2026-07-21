/* ── 居雅 PWA — 数据导出/导入 ── */
import { h } from './core/dom.js';
import { db } from './db.js';
import { loadCategories, loadTags } from './ui.js';
import { getImageMaxWidth, setImageMaxWidth } from './image-utils.js';

// 图片最大宽度的预设选项
const IMAGE_WIDTH_OPTIONS = [
  { label: '不压缩', value: 0 },
  { label: '1920px', value: 1920 },
  { label: '1280px', value: 1280 },
  { label: '640px', value: 640 },
  { label: '320px', value: 320 }
];

const FORMAT_VERSION = 1;

// ── 导出全部数据为 JSON 并触发浏览器下载 ──
// includeImages: true = 含图片, false = 不含图片（剔除 image 字段以减小文件体积）
export async function exportAllData(includeImages = true) {
  try {
    const [containers, items, relations, categories, tags] = await Promise.all([
      db.containers.toArray(),
      db.items.toArray(),
      db.relations.toArray(),
      db.categories.toArray(),
      db.tags.toArray()
    ]);

    const payload = {
      version: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        containers: includeImages ? containers : containers.map(({ image, ...rest }) => rest),
        items: includeImages ? items : items.map(({ image, ...rest }) => rest),
        relations,
        categories,
        tags
      }
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'wuju-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败：' + (e.message || String(e)));
  }
}

// ── 导入 JSON 备份文件 ──
export async function importData(file) {
  try {
    const text = await file.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      throw new Error('文件格式无效，无法解析 JSON');
    }
    if (!payload || !payload.data) {
      throw new Error('文件格式无效：缺少 data 字段');
    }
    const d = payload.data;
    if (!d.containers || !d.items || !d.relations || !d.categories || !d.tags) {
      throw new Error('文件格式无效：数据不完整');
    }
    const exportedAt = payload.exportedAt ? '（备份时间：' + new Date(payload.exportedAt).toLocaleString('zh-CN') + '）' : '';

    return new Promise((resolve, reject) => {
      const overlay = h('div', {
        className: 'overlay',
        onclick: (e) => { if (e.target === overlay) { overlay.remove(); reject(new Error('取消')); } }
      }, [
        h('div', { className: 'dialog' }, [
          h('div', { className: 'msg' }, [
            h('div', { style: 'margin-bottom:8px' }, '⚠️ 导入将覆盖当前全部数据'),
            h('div', { style: 'font-size:13px;color:var(--text-secondary)' },
              '位置 ' + d.containers.length + ' · 物品 ' + d.items.length + ' · 分类 ' + d.categories.length + ' · 标签 ' + d.tags.length),
            h('div', { style: 'font-size:11px;color:var(--text-tertiary);margin-top:4px' }, exportedAt)
          ]),
          h('div', { className: 'btns' }, [
            h('button', {
              style: 'background:#E5E5EA;color:var(--text)',
              onclick: () => { overlay.remove(); reject(new Error('取消')); }
            }, '取消'),
            h('button', {
              style: 'background:var(--tint);color:#fff',
              onclick: async () => {
                overlay.remove();
                try {
                  await db.transaction('rw', db.containers, db.items, db.relations, db.categories, db.tags, async () => {
                    await db.containers.clear();
                    await db.items.clear();
                    await db.relations.clear();
                    await db.categories.clear();
                    await db.tags.clear();

                    await db.containers.bulkPut(d.containers);
                    await db.items.bulkPut(d.items);
                    await db.relations.bulkPut(d.relations);
                    await db.categories.bulkPut(d.categories);
                    await db.tags.bulkPut(d.tags);
                  });
                  await loadCategories();
                  await loadTags();
                  resolve(true);
                } catch (err) {
                  reject(err);
                }
              }
            }, '确认导入')
          ])
        ])
      ]);
      document.body.appendChild(overlay);
    });
  } catch (e) {
    if (e.message === '取消') return;
    throw e;
  }
}

// ── 显示导出/导入对话框 ──
export function showDataIODialog() {
  let fileInput = null;

  const overlay = h('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === overlay) overlay.remove(); }
  }, [
    h('div', { className: 'dialog', style: 'max-width:300px;text-align:center' }, [
      h('div', { style: 'font-weight:600;font-size:17px;margin-bottom:16px' }, '📁 数据管理'),
      // 图片压缩设置
      h('div', { style: 'margin-bottom:12px;text-align:left' }, [
        h('label', { style: 'display:block;font-size:13px;color:var(--text-secondary);margin-bottom:4px' }, '🖼️ 图片最大宽度'),
        (() => {
          const current = getImageMaxWidth();
          const sel = h('select', {
            style: 'width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border);font-size:14px;background:var(--bg)',
            onchange: () => setImageMaxWidth(parseInt(sel.value, 10))
          });
          IMAGE_WIDTH_OPTIONS.forEach(opt => {
            sel.appendChild(h('option', { value: String(opt.value), selected: opt.value === current ? '' : undefined }, opt.label));
          });
          return sel;
        })()
      ]),
      h('div', { style: 'font-size:11px;color:var(--text-tertiary);margin-bottom:14px;text-align:left' }, '添加图片时自动缩放至此宽度以下'),
      h('div', { className: 'btns', style: 'flex-direction:column;gap:10px' }, [
        h('button', {
          style: 'padding:14px;border-radius:8px;border:none;background:var(--tint-light);color:var(--tint);font-size:15px;font-weight:600;cursor:pointer',
          onclick: () => {
            showExportOptionsDialog(overlay);
          }
        }, '📤 导出数据'),
        h('button', {
          style: 'padding:14px;border-radius:8px;border:none;background:var(--tint);color:#fff;font-size:15px;font-weight:600;cursor:pointer',
          onclick: () => {
            if (!fileInput) {
              fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = '.json';
              fileInput.style.display = 'none';
              document.body.appendChild(fileInput);
              fileInput.addEventListener('change', async () => {
                const file = fileInput.files[0];
                if (!file) return;
                try {
                  await importData(file);
                  const { render } = await import('./core/app-shell.js');
                  await render();
                  alert('✅ 数据导入成功');
                } catch (err) {
                  if (err.message !== '取消') {
                    alert('导入失败：' + (err.message || String(err)));
                  }
                }
                fileInput.value = '';
              });
            }
            fileInput.click();
          }
        }, '📥 导入数据')
      ]),
      h('button', {
        style: 'margin-top:12px;padding:10px 24px;border-radius:8px;border:none;background:#E5E5EA;cursor:pointer;font-size:14px',
        onclick: () => overlay.remove()
      }, '关闭')
    ])
  ]);
  document.body.appendChild(overlay);
}

// ── 导出选项对话框：含图片 / 不含图片 ──
function showExportOptionsDialog(parentOverlay) {
  const overlay = h('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === overlay) overlay.remove(); }
  }, [
    h('div', { className: 'dialog', style: 'max-width:280px;text-align:center' }, [
      h('div', { style: 'font-weight:600;font-size:17px;margin-bottom:16px' }, '📤 导出选项'),
      h('div', { style: 'font-size:13px;color:var(--text-secondary);margin-bottom:16px' },
        '图片会显著增大备份文件体积，是否包含图片？'),
      h('div', { className: 'btns', style: 'flex-direction:column;gap:10px' }, [
        h('button', {
          style: 'padding:14px;border-radius:8px;border:none;background:var(--tint-light);color:var(--tint);font-size:15px;font-weight:600;cursor:pointer',
          onclick: async () => {
            overlay.remove();
            parentOverlay.remove();
            await exportAllData(false);
          }
        }, '📋 不含图片'),
        h('button', {
          style: 'padding:14px;border-radius:8px;border:none;background:var(--tint);color:#fff;font-size:15px;font-weight:600;cursor:pointer',
          onclick: async () => {
            overlay.remove();
            parentOverlay.remove();
            await exportAllData(true);
          }
        }, '🖼️ 含图片')
      ]),
      h('button', {
        style: 'margin-top:12px;padding:10px 24px;border-radius:8px;border:none;background:#E5E5EA;cursor:pointer;font-size:14px',
        onclick: () => overlay.remove()
      }, '取消')
    ])
  ]);
  document.body.appendChild(overlay);
}
