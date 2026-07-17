import { $, $$ } from './dom.js';
import { showDataIODialog } from '../data-io.js';

export const state = {
  screen: 'tabs',
  params: {},
  tab: 'items',
  stack: [],
  itemSearch: '',
  itemCategory: null,
  itemTags: new Set(),
  tagFilter: '',
  expandedContainers: new Set(),
};

let renderers = {};

// 注入各页面渲染器，壳层只负责路由与调度，不关心页面实现细节。
export function setRenderers(nextRenderers) {
  renderers = { ...nextRenderers };
}

// 进入指定页面，并把当前状态压入导航栈，便于返回。
export function navigate(screen, params = {}) {
  _cacheBackdrop();
  if (state.screen === 'tabs') {
    state.stack = [{ screen: 'tabs', params: { tab: state.tab } }];
  }
  state.stack.push({ screen, params: { ...params } });
  state.screen = screen;
  state.params = params;
  render();
}

// 返回上一层页面；如果没有历史，则回到首页 tabs。
export function goBack() {
  _popBackdrop();
  if (state.stack.length > 1) {
    state.stack.pop();
    const prev = state.stack[state.stack.length - 1];
    state.screen = prev.screen;
    state.params = prev.params;
    if (prev.screen === 'tabs') state.tab = prev.params.tab || 'items';
  } else {
    state.screen = 'tabs';
    state.params = {};
    state.stack = [];
  }
  render();
}

// 切换底部 tab，并清空页面级状态，避免残留筛选影响新页。
export function switchTab(tab) {
  state.tab = tab;
  state.screen = 'tabs';
  state.params = {};
  state.stack = [];
  state.expandedContainers = new Set();
  _clearBackdropStack();
  render();
}

// 根据当前 state 选择要渲染的页面，并更新壳层标题和按钮。
export async function render() {
  const header = $('#header');
  const content = $('#content');
  const tabs = $('#tabs');
  if (!header || !content || !tabs) return;

  const backBtn = header.querySelector('.back');
  const titleEl = header.querySelector('.title');
  const actionBtn = header.querySelector('.action');

  tabs.style.display = (state.screen === 'tabs') ? 'flex' : 'none';
  backBtn.style.display = (state.screen === 'tabs') ? 'none' : 'flex';
  actionBtn.style.display = 'none';

  content.innerHTML = '';
  header.className = '';

  if (state.screen === 'tabs') {
    titleEl.innerHTML = '居雅';
    titleEl.style.cursor = 'pointer';
    titleEl.onclick = function() {
      navigator.serviceWorker.ready.then(function(reg) {
        var mc = new MessageChannel();
        mc.port1.onmessage = function(e) {
          var v = e.data.replace('wuju-', '');
          alert('居雅 ' + v);
        };
        reg.active.postMessage('get-version', [mc.port2]);
      }).catch(function() {
        alert('居雅（无法获取版本信息）');
      });
    };

    updateTabBar();
    actionBtn.style.display = 'flex';
    actionBtn.innerHTML = '';

    // 齿轮图标 — 数据导出/导入
    const gearIcon = document.createElement('span');
    gearIcon.style.cssText = 'display:inline-flex;align-items:center;cursor:pointer';
    gearIcon.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M38.187 31.6671C38.188 32.8142 37.8488 33.9358 37.2124 34.8901C36.5759 35.8445 35.6708 36.5886 34.6114 37.0286C33.552 37.4685 32.386 37.5844 31.2608 37.3617C30.1355 37.1389 29.1016 36.5875 28.2897 35.7772C27.4778 34.9668 26.9244 33.9339 26.6996 32.8091C26.4747 31.6843 26.5884 30.518 27.0263 29.4578C27.4642 28.3976 28.2067 27.4911 29.1598 26.8528C30.1129 26.2146 31.2339 25.8733 32.381 25.8721C33.9189 25.8723 35.3938 26.4826 36.4823 27.569C37.5708 28.6554 38.1838 30.1292 38.187 31.6671V31.6671Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M54.146 37.7311L49.603 33.372C49.657 32.811 49.69 32.239 49.69 31.667C49.69 31.095 49.657 30.523 49.603 29.962L54.136 25.57C54.593 25.1303 54.8893 24.55 54.9772 23.9219C55.0651 23.2938 54.9397 22.6544 54.621 22.1061L51.772 17.1641C51.4535 16.6125 50.9597 16.1832 50.3692 15.9445C49.7787 15.7059 49.1253 15.6716 48.513 15.8471L42.46 17.6061C41.5397 16.9386 40.5524 16.3689 39.514 15.906L37.981 9.78105C37.8289 9.16394 37.474 8.61581 36.9731 8.2245C36.4723 7.83319 35.8546 7.62139 35.219 7.62306H29.511C28.8743 7.62387 28.2563 7.83793 27.7554 8.23107C27.2546 8.62421 26.9 9.17377 26.748 9.79205L25.237 15.8991C24.1987 16.3621 23.2114 16.9318 22.291 17.5991L16.227 15.8621C15.6164 15.6878 14.965 15.723 14.3767 15.9621C13.7884 16.2011 13.297 16.6303 12.981 17.1811L10.121 22.124C9.8039 22.6775 9.68087 23.3211 9.77147 23.9526C9.86206 24.584 10.1611 25.167 10.621 25.609L15.164 29.969C15.11 30.53 15.077 31.091 15.077 31.663C15.077 32.235 15.11 32.817 15.164 33.378L10.632 37.76C10.175 38.1996 9.87877 38.7797 9.79066 39.4076C9.70254 40.0355 9.82767 40.6747 10.146 41.223L12.995 46.1761C13.3142 46.7265 13.8086 47.1543 14.3993 47.391C14.99 47.6277 15.643 47.6597 16.254 47.4821L22.307 45.7341C23.23 46.3957 24.2169 46.9632 25.253 47.4281L26.785 53.5581C26.9402 54.1728 27.2964 54.718 27.7971 55.107C28.2977 55.496 28.914 55.7065 29.548 55.7051H35.251C35.8861 55.7043 36.5027 55.4916 37.0032 55.1007C37.5037 54.7098 37.8595 54.163 38.014 53.5471L39.525 47.4281C40.5598 46.9651 41.5435 46.3954 42.46 45.7281L48.535 47.4661C49.1457 47.641 49.7974 47.6063 50.3861 47.3676C50.9748 47.1289 51.4666 46.6999 51.783 46.1491L54.643 41.2071C54.9603 40.6554 55.0837 40.0134 54.9937 39.3834C54.9036 38.7534 54.6052 38.1717 54.146 37.7311V37.7311ZM32.381 37.4721C31.2343 37.4709 30.1138 37.1298 29.1608 36.492C28.2079 35.8542 27.4655 34.9482 27.0273 33.8886C26.589 32.829 26.4747 31.6632 26.6988 30.5387C26.9229 29.4141 27.4752 28.3812 28.2861 27.5705C29.097 26.7597 30.13 26.2075 31.2546 25.9837C32.3792 25.7598 33.5449 25.8743 34.6045 26.3127C35.664 26.7511 36.5699 27.4937 37.2075 28.4467C37.8452 29.3997 38.186 30.5204 38.187 31.667C38.1877 32.4296 38.0379 33.1849 37.7464 33.8895C37.4548 34.5942 37.0271 35.2344 36.4879 35.7736C35.9486 36.3128 35.3083 36.7404 34.6036 37.0318C33.8989 37.3232 33.1436 37.4728 32.381 37.4721V37.4721Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M38.187 31.6671C38.188 32.8142 37.8488 33.9358 37.2124 34.8901C36.5759 35.8445 35.6708 36.5886 34.6114 37.0286C33.552 37.4685 32.386 37.5844 31.2608 37.3617C30.1355 37.1389 29.1016 36.5875 28.2897 35.7772C27.4778 34.9668 26.9244 33.9339 26.6996 32.8091C26.4747 31.6843 26.5884 30.518 27.0263 29.4578C27.4642 28.3976 28.2067 27.4911 29.1598 26.8528C30.1129 26.2146 31.2339 25.8733 32.381 25.8721C33.9189 25.8723 35.3938 26.4826 36.4823 27.569C37.5708 28.6554 38.1838 30.1292 38.187 31.6671V31.6671Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    gearIcon.onclick = () => showDataIODialog();
    actionBtn.appendChild(gearIcon);

    if (state.tab === 'items' || state.tab === 'spaces') {
      const addIcon = document.createElement('span');
      addIcon.style.cssText = 'display:inline-flex;align-items:center;cursor:pointer';
      addIcon.innerHTML = '<svg width="1.6rem" height="1.6rem" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 1024C229.7 1024 0 794.3 0 512S229.7 0 512 0s512 229.7 512 512-229.7 512-512 512z m0-938.7C276.7 85.3 85.3 276.7 85.3 512S276.7 938.7 512 938.7 938.7 747.3 938.7 512 747.3 85.3 512 85.3z" fill="#3688FF"/><path d="M682.7 554.7H341.3c-23.6 0-42.7-19.1-42.7-42.7s19.1-42.7 42.7-42.7h341.3c23.6 0 42.7 19.1 42.7 42.7s-19.1 42.7-42.6 42.7z" fill="#5F6379"/><path d="M512 725.3c-23.6 0-42.7-19.1-42.7-42.7V341.3c0-23.6 19.1-42.7 42.7-42.7s42.7 19.1 42.7 42.7v341.3c0 23.6-19.1 42.7-42.7 42.7z" fill="#5F6379"/></svg>';
      addIcon.onclick = () => navigate(state.tab === 'items' ? 'item-edit' : 'container-edit', {});
      actionBtn.appendChild(addIcon);
    }
    if (state.tab === 'items' && renderers.renderItemList) await renderers.renderItemList(content);
    else if (state.tab === 'spaces' && renderers.renderContainerTree) await renderers.renderContainerTree(content);
    else if (state.tab === 'alerts' && renderers.renderAlertView) await renderers.renderAlertView(content);
    else if (state.tab === 'scan' && renderers.renderScanTab) await renderers.renderScanTab();
  } else {
    titleEl.onclick = null;
    titleEl.style.cursor = '';
    switch (state.screen) {
      case 'item-detail': await renderers.renderItemDetail?.(content, state.params.itemId); break;
      case 'item-edit': await renderers.renderItemEdit?.(content, state.params.itemId || null, state.params.presetContainerId || null, state.params.presetQrCode || null); break;
      case 'container-detail': await renderers.renderContainerDetail?.(content, state.params.containerId); break;
      case 'container-edit': await renderers.renderContainerEdit?.(content, state.params.containerId || null, state.params.parentId || null); break;
      case 'relation-edit': await renderers.renderRelationEdit?.(content, state.params.itemId); break;
    }
  }

  if (state.screen === 'item-detail') titleEl.textContent = '物品详情';
  else if (state.screen === 'item-edit') titleEl.textContent = state.params.itemId ? '编辑物品' : '添加物品';
  else if (state.screen === 'container-detail') titleEl.textContent = '容器详情';
  else if (state.screen === 'container-edit') titleEl.textContent = state.params.containerId ? '编辑容器' : '新建容器';
  else if (state.screen === 'relation-edit') titleEl.textContent = '关联物品';
}

// ── 屏幕左边缘右滑返回 ──
let _swipeBack = null;
let _backdropStack = [];
const _appEl = () => document.getElementById('app');
const _bdEl = () => document.getElementById('swipe-backdrop');

// 缓存当前页面的 innerHTML 到栈中，与 state.stack 保持同步。
function _cacheBackdrop() {
  const content = $('#content');
  if (!content || !content.children.length) return;
  let title = '居雅';
  if (state.screen === 'item-detail') title = '物品详情';
  else if (state.screen === 'item-edit') title = state.params.itemId ? '编辑物品' : '添加物品';
  else if (state.screen === 'container-detail') title = '容器详情';
  else if (state.screen === 'container-edit') title = state.params.containerId ? '编辑容器' : '新建容器';
  else if (state.screen === 'relation-edit') title = '关联物品';
  _backdropStack.push({ title: title, body: content.innerHTML });
}

// 与 goBack 弹栈同步，弹出缓存栈顶。
function _popBackdrop() {
  if (_backdropStack.length > 0) _backdropStack.pop();
}

// 清空缓存栈（switchTab 时）。
function _clearBackdropStack() {
  _backdropStack = [];
}

// 将缓存栈顶写入 backdrop 并显示。
function _showBackdrop() {
  const bd = _bdEl();
  if (!bd || _backdropStack.length === 0) return;
  const cache = _backdropStack[_backdropStack.length - 1];
  bd.querySelector('.bd-header').innerHTML = '<svg width="1rem" height="1rem" viewBox="0 0 512 512" style="vertical-align:middle;margin-right:2px" xmlns="http://www.w3.org/2000/svg"><path d="M512 307.863c0 70.124-57.048 127.172-127.172 127.172h-61.575c-4.746 0-8.898-2.561-11.135-6.376-1.151-1.914-1.798-4.164-1.798-6.557 0-7.139 5.794-12.933 12.933-12.933h61.575c55.858 0 101.306-45.447 101.306-101.306S440.686 206.57 384.828 206.57c-.698 0-348.73 0-348.73 0L55.2 227.975l35.139 39.382 19.089 21.391c4.746 5.341 4.281 13.515-1.048 18.262-2.47 2.199-5.535 3.285-8.601 3.285-3.557 0-7.1-1.461-9.661-4.32l-34.454-38.618L7.541 213.412c-4.32-4.837-6.777-10.735-7.385-16.761-.142-1.332-.181-2.677-.142-4.022.233-6.738 2.742-13.412 7.527-18.779l49.262-55.225L90.12 81.286c4.759-5.328 12.933-5.794 18.262-1.035 5.328 4.759 5.794 12.933 1.048 18.262l-17.938 20.111-55.393 62.079s348.032 0 348.73 0C454.952 180.704 512 237.739 512 307.863z" fill="currentColor"/><path d="M486.134 307.863c0 55.858-45.447 101.306-101.306 101.306h-61.575c-6.919 0-12.571 5.432-12.92 12.274.168-11.886 5.044-22.62 12.868-30.432 7.954-7.954 18.947-12.881 31.091-12.881h30.535c18.857 0 36.575-7.411 49.896-20.861 13.321-13.451 20.551-31.234 20.37-50.103-.375-38.347-32.462-69.555-71.546-69.555H63.801l-8.601-9.635L36.098 206.57s348.032 0 348.73 0C440.686 206.57 486.134 252.004 486.134 307.863z" fill="currentColor" opacity="0.4"/></svg> ' + cache.title;
  bd.querySelector('.bd-body').innerHTML = cache.body.replace(/\s+id="[^"]*"/g, '');
  bd.style.display = 'flex';
}

function _hideBackdrop() {
  const bd = _bdEl();
  if (bd) bd.style.display = 'none';
}

function _resetApp() {
  const app = _appEl();
  if (app) { app.style.transition = ''; app.style.transform = ''; }
  _hideBackdrop();
}

// ── 列表行滑动操作手势（右滑删除 + 左滑移动）──
let _swipeDel = null;
let _openSwipeCell = null;
let _swipeDeleteHandler = null;
let _swipeMoveHandler = null;

export function setSwipeDeleteHandler(handler) {
  _swipeDeleteHandler = handler;
}

export function setSwipeMoveHandler(handler) {
  _swipeMoveHandler = handler;
}

export function initSwipeDelete() {
  document.addEventListener('touchstart', function(e) {
    if (state.screen !== 'tabs') return;
    const cell = e.target.closest('.swipe-cell');
    if (!cell) return;
    if (_openSwipeCell && _openSwipeCell !== cell) {
      const openRow = _openSwipeCell.querySelector('.swipe-row');
      if (openRow) {
        openRow.style.transition = 'transform 0.2s ease-out';
        openRow.style.transform = 'translateX(0)';
      }
      _openSwipeCell = null;
    }
    const t = e.touches[0];
    _swipeDel = { cell, sx: t.clientX, sy: t.clientY, dx: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!_swipeDel) return;
    const t = e.touches[0];
    const dx = t.clientX - _swipeDel.sx;
    const dy = Math.abs(t.clientY - _swipeDel.sy);

    if (dy > Math.abs(dx) * 1.3) { _swipeDel = null; return; }

    if (dx > 5) {
      // 右滑 → 删除
      e.preventDefault();
      _swipeDel.dx = Math.min(dx, 80);
    } else if (dx < -5 && _swipeDel.cell.dataset.hasMove === '1') {
      // 左滑 → 移动（仅物品行有 hasMove）
      e.preventDefault();
      _swipeDel.dx = Math.max(dx, -80);
    } else {
      return;
    }
    const row = _swipeDel.cell.querySelector('.swipe-row');
    if (row) {
      row.style.transition = 'none';
      row.style.transform = 'translateX(' + _swipeDel.dx + 'px)';
    }
  }, { passive: false });

  document.addEventListener('touchend', function(e) {
    if (!_swipeDel) return;
    var cell = _swipeDel.cell;
    var row = cell.querySelector('.swipe-row');
    var dx = _swipeDel.dx;
    var type = cell.dataset.deleteType;
    var id = cell.dataset.deleteId;
    var name = cell.dataset.deleteName || '';

    if (dx > 50 && _swipeDeleteHandler) {
      // 触发删除 — 停在当前位置，不弹回也不飞出
      if (row) row.style.transition = 'none';
      _openSwipeCell = null;
      _swipeDel = null;
      _swipeDeleteHandler(type, id, name);
    } else if (dx < -50 && _swipeMoveHandler) {
      // 触发移动 — 停在当前位置
      if (row) row.style.transition = 'none';
      _swipeDel = null;
      _swipeMoveHandler(id, name);
    } else {
      if (row) {
        row.style.transition = 'transform 0.2s ease-out';
        row.style.transform = 'translateX(0)';
      }
      _swipeDel = null;
    }
  });
}

// ── 屏幕左边缘右滑返回 ──
export function initSwipeBack() {
  const EDGE = 30;
  const MIN_SWIPE = 80;

  document.addEventListener('touchstart', function(e) {
    if (state.screen === 'tabs') return;
    const t = e.touches[0];
    if (t.clientX > EDGE) return;
    if (e.target.closest('input, textarea, select, button, [contenteditable]')) return;
    _swipeBack = { sx: t.clientX, sy: t.clientY, ok: true };
    const app = _appEl();
    if (app) app.style.transition = 'none';
    _showBackdrop();
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!_swipeBack || !_swipeBack.ok) return;
    const t = e.touches[0];
    const dx = t.clientX - _swipeBack.sx;
    const dy = Math.abs(t.clientY - _swipeBack.sy);
    if (dy > Math.abs(dx)) { _swipeBack.ok = false; _resetApp(); return; }
    if (dx > 10) e.preventDefault();
    const app = _appEl();
    if (app && dx > 0) app.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: false });

  document.addEventListener('touchend', function(e) {
    if (!_swipeBack) return;
    const app = _appEl();
    if (_swipeBack.ok) {
      const t = e.changedTouches[0];
      const dx = t.clientX - _swipeBack.sx;
      if (dx > MIN_SWIPE) {
        if (app) {
          app.style.transition = 'transform 0.25s ease-out';
          app.style.transform = 'translateX(100%)';
        }
        _swipeBack = null;
        setTimeout(function() { _resetApp(); goBack(); }, 260);
        return;
      }
    }
    _swipeBack = null;
    if (app) {
      app.style.transition = 'transform 0.2s ease-out';
      app.style.transform = 'translateX(0)';
      setTimeout(_hideBackdrop, 210);
    }
  });
}

// 更新底部 tab 的 active 样式，让当前页和视觉状态保持一致。
export function updateTabBar() {
  const tabs = $$('#tabs .tab');
  tabs.forEach(t => t.classList.remove('active'));
  const active = $(`#tabs .tab[data-tab="${state.tab}"]`);
  if (active) active.classList.add('active');
}
