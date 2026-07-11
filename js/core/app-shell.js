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
    titleEl.innerHTML = '物居';
    titleEl.style.cursor = 'pointer';
    titleEl.onclick = function() {
      navigator.serviceWorker.ready.then(function(reg) {
        var mc = new MessageChannel();
        mc.port1.onmessage = function(e) {
          var v = e.data.replace('wuju-', '');
          alert('物居 ' + v);
        };
        reg.active.postMessage('get-version', [mc.port2]);
      }).catch(function() {
        alert('物居（无法获取版本信息）');
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

// 更新底部 tab 的 active 样式，让当前页和视觉状态保持一致。
export function updateTabBar() {
  const tabs = $$('#tabs .tab');
  tabs.forEach(t => t.classList.remove('active'));
  const active = $(`#tabs .tab[data-tab="${state.tab}"]`);
  if (active) active.classList.add('active');
}
