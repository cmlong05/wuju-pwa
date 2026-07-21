import { render, setRenderers, switchTab, goBack, navigate, initSwipeBack, initSwipeDelete, setSwipeDeleteHandler, setSwipeMoveHandler } from './core/app-shell.js';
import { loadCategories, loadTags, showDeleteDialog, showMoveToContainer } from './ui.js';
import { renderItemList, renderItemDetail, renderItemEdit } from './views/items.js';
import { renderContainerTree, renderContainerDetail, renderContainerEdit } from './views/containers.js';
import { renderAlertView } from './views/alerts.js';
import { startUniversalScan } from './scanner.js';
import { db, seedSampleData, deleteItemRelations, deleteContainerCascade } from './db.js';

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

// 监听 SW 更新并自动刷新页面。
function setupServiceWorkerRefresh() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
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
      renderContainerTree,
      renderContainerDetail,
      renderContainerEdit,
      renderAlertView,
      renderScanTab: () => startUniversalScan(async result => {
        if (result.kind === 'item') {
          navigate('item-detail', { itemId: result.itemId });
        } else if (result.kind === 'container') {
          navigate('container-detail', { containerId: result.containerId });
        } else if (result.kind === 'new-item') {
          navigate('item-edit', { presetQrCode: result.scannedText });
        }
      })
    });

    await loadCategories();
    await loadTags();

    if ('serviceWorker' in navigator) {
      try {
        var reg = await navigator.serviceWorker.register('/wuju-pwa/sw.js');
        reg.update();
      } catch (e) { /* offline or no support */ }
    }

    try {
      await seedSampleData();
    } catch (e) {
      console.error('seedSampleData failed:', e);
    }

    bindTabs();
    bindBackButton();
    initSwipeBack();
    initSwipeDelete();
    setSwipeDeleteHandler(function(type, id, name) {
      if (type === 'item') {
        showDeleteDialog('物品', name, async function() {
          await deleteItemRelations(id);
          await db.items.delete(id);
          render();
        }, function() { render(); });
      } else if (type === 'container') {
        showDeleteDialog('位置', name + '（子位置将被一并删除）', async function() {
          await deleteContainerCascade(id);
          render();
        }, function() { render(); });
      }
    });
    setSwipeMoveHandler(function(id, name) {
      showMoveToContainer(id);
    });
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
