import { $, $$ } from './dom.js';

export const state = {
  screen: 'tabs',
  params: {},
  tab: 'items',
  stack: [],
  itemSearch: '',
  itemCategory: null,
  itemTags: new Set(),
  itemSort: 'name',
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
  backBtn.style.display = (state.screen === 'tabs') ? 'none' : 'block';
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
    actionBtn.style.display = (state.tab === 'alerts' || state.tab === 'scan') ? 'none' : 'block';
    actionBtn.innerHTML = '';
    if (state.tab === 'items') {
      actionBtn.appendChild(document.createElement('span'));
      actionBtn.firstChild.className = 'add-btn';
      actionBtn.firstChild.textContent = '+';
      actionBtn.firstChild.onclick = () => navigate('item-edit', {});
    } else if (state.tab === 'spaces') {
      actionBtn.appendChild(document.createElement('span'));
      actionBtn.firstChild.className = 'add-btn';
      actionBtn.firstChild.textContent = '+';
      actionBtn.firstChild.onclick = () => navigate('container-edit', {});
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
      case 'item-edit': await renderers.renderItemEdit?.(content, state.params.itemId || null); break;
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
