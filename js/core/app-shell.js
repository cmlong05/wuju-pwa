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

export function setRenderers(nextRenderers) {
  renderers = { ...nextRenderers };
}

export function navigate(screen, params = {}) {
  if (state.screen === 'tabs') {
    state.stack = [{ screen: 'tabs', params: { tab: state.tab } }];
  }
  state.stack.push({ screen, params: { ...params } });
  state.screen = screen;
  state.params = params;
  render();
}

export function goBack() {
  if (state.stack.length > 1) {
    state.stack.pop();
    const prev = state.stack[state.stack.length - 1];
    state.screen = prev.screen;
    state.params = prev.params;
    if (state.screen === 'tabs') state.tab = prev.params.tab || 'items';
    state.stack.pop();
  } else {
    state.screen = 'tabs';
    state.params = {};
    state.stack = [];
  }
  render();
}

export function switchTab(tab) {
  state.tab = tab;
  state.screen = 'tabs';
  state.params = {};
  state.stack = [];
  state.expandedContainers = new Set();
  render();
}

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
    switch (state.screen) {
      case 'item-detail': await renderers.renderItemDetail?.(content, state.params.itemId); break;
      case 'item-edit': await renderers.renderItemEdit?.(content, state.params.itemId || null); break;
      case 'container-detail': await renderers.renderContainerDetail?.(content, state.params.containerId); break;
      case 'container-edit': await renderers.renderContainerEdit?.(content, state.params.containerId || null, state.params.parentId || null); break;
      case 'relation-edit': await renderers.renderRelationEdit?.(content, state.params.itemId); break;
    }
  }

  titleEl.onclick = null;
  titleEl.style.cursor = '';
  if (state.screen === 'item-detail') titleEl.textContent = '物品详情';
  else if (state.screen === 'item-edit') titleEl.textContent = state.params.itemId ? '编辑物品' : '添加物品';
  else if (state.screen === 'container-detail') titleEl.textContent = '容器详情';
  else if (state.screen === 'container-edit') titleEl.textContent = state.params.containerId ? '编辑容器' : '新建容器';
  else if (state.screen === 'relation-edit') titleEl.textContent = '关联物品';
}

export function updateTabBar() {
  const tabs = $$('#tabs .tab');
  tabs.forEach(t => t.classList.remove('active'));
  const active = $(`#tabs .tab[data-tab="${state.tab}"]`);
  if (active) active.classList.add('active');
}
