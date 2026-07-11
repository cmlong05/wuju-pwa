import { render, setRenderers, switchTab, goBack, navigate } from './core/app-shell.js';
import { loadCategories, loadTags } from './ui.js';
import { renderItemList, renderItemDetail, renderItemEdit, renderRelationEdit } from './views/items.js';
import { renderContainerTree, renderContainerDetail, renderContainerEdit } from './views/containers.js';
import { renderAlertView } from './views/alerts.js';
import { startUniversalScan } from './scanner.js';
import { seedSampleData } from './db.js';

// 绑定底部 tab 点击事件，让切换入口保持在壳层，不散落到各页面里。
function bindTabs() {
  document.querySelectorAll('#tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

// 绑定返回按钮，统一走导航栈的回退逻辑。
function bindBackButton() {
  const back = document.querySelector('#header .back');
  if (back) back.addEventListener('click', goBack);
}

// 注册并刷新 Service Worker，保证更新后的资源尽快生效。
function setupServiceWorkerRefresh() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.getRegistration().then(function(reg) {
    if (reg) reg.update();
  });
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (hadController) window.location.reload();
  });
}

// 完成启动阶段的资源加载、事件绑定和首屏渲染。
export async function init() {
  try {
    setupServiceWorkerRefresh();

    setRenderers({
      renderItemList,
      renderItemDetail,
      renderItemEdit,
      renderRelationEdit,
      renderContainerTree,
      renderContainerDetail,
      renderContainerEdit,
      renderAlertView,
      renderScanTab: () => startUniversalScan(async result => {
        if (result.kind === 'item') {
          navigate('item-detail', { itemId: result.itemId });
        } else if (result.kind === 'container') {
          navigate('container-detail', { containerId: result.containerId });
        }
      })
    });

    await loadCategories();
    await loadTags();

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/wuju-pwa/sw.js');
      } catch (e) { /* offline or no support */ }
    }

    try {
      await seedSampleData();
    } catch (e) {
      console.error('seedSampleData failed:', e);
    }

    bindTabs();
    bindBackButton();
    await render();

    var st = document.getElementById('load-status');
    if (st) st.parentElement.style.display = 'none';
  } catch (e) {
    console.error('init failed:', e);
    var content = document.getElementById('content');
    if (content) {
      content.innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--red)">' +
        '<div style="font-size:48px;margin-bottom:12px">⚠️</div>' +
        '<div style="font-weight:600;margin-bottom:8px">初始化失败</div>' +
        '<div style="font-size:13px;color:var(--text-secondary)">' + (e.message || String(e)) + '</div>' +
        '<div style="font-size:12px;color:var(--text-tertiary);margin-top:12px">请确认浏览器未开启无痕模式，并允许本站使用存储</div>' +
        '</div>';
    }
  }
}
