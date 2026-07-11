import { h } from '../core/dom.js';
import { navigate } from '../core/app-shell.js';
import { getExpiredItems, getExpiringSoonItems, getLowStockItems } from '../db.js';

// 渲染提醒页，把过期、临期和低库存物品分组展示。
export async function renderAlertView(container) {
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
