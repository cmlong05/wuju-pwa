import { h } from '../core/dom.js';
import { navigate, state } from '../core/app-shell.js';
import { getExpiredItems, getExpiringSoonItems, getLowStockItems } from '../db.js';

// 渲染提醒页，把过期、临期和低库存物品分组展示。
export async function renderAlertView(container) {
  const expired = await getExpiredItems();
  const expiringSoon = await getExpiringSoonItems();
  const lowStock = await getLowStockItems();

  let hasAny = false;

  if (expired.length > 0) {
    hasAny = true;
    container.appendChild(renderAlertSection('❌已过期', 'var(--red)', expired,
      item => ({ icon: '⚠️', label: '已过期', labelColor: 'var(--red)' })));
  }

  if (expiringSoon.length > 0) {
    hasAny = true;
    container.appendChild(renderAlertSection('⏰即将过期', 'var(--orange)', expiringSoon,
      item => {
        const daysLeft = Math.ceil((item.expiryDate - Date.now()) / 86400000);
        return { icon: '⏳', label: daysLeft + '天后', labelColor: 'var(--orange)' };
      }));
  }

  if (lowStock.length > 0) {
    hasAny = true;
    container.appendChild(renderAlertSection('📉低库存', '#CC9900', lowStock,
      item => ({ icon: '📊', label: '仅剩 ' + (item.quantity || 0), labelColor: 'var(--text-secondary)' })));
  }

  if (!hasAny) {
    container.appendChild(h('div', { className: 'alert-empty' }, [
      h('div', { className: 'icon' }, '✅'),
      h('div', { className: 'title' }, '一切正常'),
      h('div', {}, '没有需要关注的物品提醒')
    ]));
  }
}

function renderAlertSection(title, color, items, getItemMeta) {
  const sec = h('div', { className: 'alert-section' });
  sec.appendChild(h('div', { className: 'alert-header', style: 'color:' + color }, [
    title,
    h('span', { className: 'count' }, '(' + items.length + ')')
  ]));
  const group = h('div', { className: 'card-row-group' });
  items.forEach(item => {
    const meta = getItemMeta(item);
    group.appendChild(h('div', { className: 'card-row', onclick: () => { state.itemDetailList = []; navigate('item-detail', { itemId: item.id }); } }, [
      h('span', { style: 'color:' + color + ';margin-right:8px' }, meta.icon),
      h('span', { style: 'flex:1;font-weight:500' }, item.name),
      h('span', { style: 'font-size:13px;color:' + meta.labelColor }, meta.label),
      h('span', { className: 'chevron' }, '›')
    ]));
  });
  sec.appendChild(group);
  return sec;
}
