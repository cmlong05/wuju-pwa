import { db, uuid, getAllDescendantIds } from './db.js';
import { h } from './core/dom.js';

// Supports torch (flashlight) toggle via MediaStreamTrack
let _torchStream = null;
let _torchOn = false;
let _zxingReader = null;
let _keepStream = null;
let _keepVideo = null;
let _keepCanvas = null;
let _keepCtx = null;

function _toggleTorch() {
  try {
    if (!_torchStream) return;
    var track = _torchStream.getVideoTracks()[0];
    if (!track) return;
    var caps = track.getCapabilities();
    if (!('torch' in caps)) return;
    _torchOn = !_torchOn;
    track.applyConstraints({ advanced: [{ torch: _torchOn }] });
    var btn = document.getElementById('torch-btn');
    if (btn) btn.textContent = _torchOn ? '🔦' : '💡';
  } catch(e) {}
}

function _setTorchStream(stream) {
  _torchStream = stream;
  _torchOn = false;
  var btn = document.getElementById('torch-btn');
  if (btn) {
    try {
      var t = stream.getVideoTracks()[0];
      btn.style.display = (t && 'torch' in t.getCapabilities()) ? '' : 'none';
    } catch(e) { btn.style.display = 'none'; }
  }
}

export async function showScanner(onScan, mode) {
  // CRITICAL: iOS PWA — getUserMedia must be the VERY FIRST async operation
  // after the click handler to capture the user gesture
  var streamPromise = null;
  try {
    streamPromise = navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch(e) {
    streamPromise = Promise.reject(e);
  }

  var canCamera = window.isSecureContext && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
  var title = mode === 'container' ? '扫描容器条码/二维码' : '扫描条码/二维码';

  function doFileScan(file) {
    var url = URL.createObjectURL(file);
    var r = _zxingReader || new ZXing.BrowserMultiFormatReader();
    r.decodeFromImageUrl(url).then(function(result) {
      URL.revokeObjectURL(url);
      stopScanner();
      overlay.remove();
      onScan(result.text);
    }).catch(function() {
      URL.revokeObjectURL(url);
      var area = document.getElementById('qr-reader');
      if (area) {
        area.innerHTML = '<div style="color:#fff;text-align:center;padding:30px">' +
          '<div style="font-size:48px;margin-bottom:12px">📱</div>' +
          '<div style="font-size:16px;margin-bottom:8px">未识别到条码或二维码</div>' +
          '<div style="font-size:13px;color:#aaa;line-height:1.6">请换一张清晰的图片重试</div>' +
          '</div>';
      }
    });
  }

  var overlay = h('div', { className: 'overlay', style: 'background:rgba(0,0,0,.85);flex-direction:column;justify-content:flex-start;align-items:stretch;gap:0' }, [
    h('div', { style: 'color:#fff;padding:16px 16px 4px;text-align:center;font-size:17px;font-weight:600;flex-shrink:0' }, title),
    h('div', { id: 'qr-status', style: 'flex-shrink:0;display:none' }),
    h('div', { id: 'qr-reader', style: 'width:100%;max-width:400px;flex:1;min-height:200px;position:relative;overflow:hidden' }),
    h('div', { style: 'padding:0 16px 8px;flex-shrink:0' }, [
      h('label', {
        style: 'display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:10px;border:1px dashed rgba(255,255,255,.4);color:#fff;font-size:15px;cursor:pointer;background:rgba(255,255,255,.05)',
        htmlFor: 'qr-file-input'
      }, [h('span', {}, '🖼'), h('span', {}, '从相册选择条码/二维码图片')]),
      h('input', {
        type: 'file', id: 'qr-file-input', accept: 'image/*',
        style: 'display:none',
        onchange: function(e) { if (e.target.files[0]) doFileScan(e.target.files[0]); }
      })
    ]),
    h('button', {
      style: 'margin:8px 16px 16px;padding:12px 24px;border-radius:8px;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:15px;cursor:pointer;flex-shrink:0',
      onclick: function() { stopScanner(); overlay.remove(); }
    }, '关闭')
  ]);
  document.body.appendChild(overlay);

  if (!canCamera) {
    var area = document.getElementById('qr-reader');
    if (area) {
      area.innerHTML = '<div style="color:#fff;text-align:center;padding:30px">' +
        '<div style="font-size:48px;margin-bottom:12px">📱</div>' +
        '<div style="font-size:16px;margin-bottom:8px">当前环境不支持摄像头</div>' +
        '<div style="font-size:13px;color:#aaa;line-height:1.6">请点击下方按钮<br>从相册选择条码/二维码图片</div>' +
        '</div>';
    }
    return;
  }

  var stream = null;
  try {
    stream = await streamPromise;
  } catch(e) {
    var st = document.getElementById('qr-status');
    if (st) {
      st.style.display = 'block';
      var errName = (e && e.name) || '';
      st.innerHTML = errName === 'NotAllowedError'
        ? '<div style="text-align:center;padding:8px 16px;font-size:13px;color:#ff6b6b">📵 请在设置中允许相机权限</div>'
        : '<div style="text-align:center;padding:8px 16px;font-size:13px;color:#ff6b6b">❌ 无法启动摄像头</div>';
    }
    return;
  }

  if (!stream) {
    var st2 = document.getElementById('qr-status');
    if (st2) {
      st2.style.display = 'block';
      st2.innerHTML = '<div style="text-align:center;padding:8px 16px;font-size:13px;color:#ff6b6b">❌ 无法启动摄像头</div>';
    }
    return;
  }

  _keepStream = stream;
  startJsQRScanner(onScan, overlay);
}

async function startJsQRScanner(onScan, overlay) {
  var area = document.getElementById('qr-reader');
  if (!area) return;
  if (typeof ZXing === 'undefined') return;

  area.style.position = 'relative';
  area.style.overflow = 'hidden';
  area.innerHTML = '';

  var zoomBox = document.createElement('div');
  zoomBox.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:220px;height:220px;border:2px solid rgba(0,200,100,.7);border-radius:16px;pointer-events:none;box-shadow:0 0 0 2000px rgba(0,0,0,.35);z-index:10;animation:zoom-pulse 2s ease-in-out infinite;';
  area.appendChild(zoomBox);

  var statusBar = document.getElementById('qr-status');
  if (statusBar) {
    statusBar.style.display = 'block';
    statusBar.innerHTML = '<div style="text-align:center;padding:0 16px 6px;font-size:12px;color:#fff">📷 启动摄像头…</div>';
  }

  if (_keepVideo) {
    try { _keepVideo.srcObject = null; _keepVideo.remove(); } catch(e) {}
    _keepVideo = null;
  }

  _keepVideo = document.createElement('video');
  _keepVideo.playsInline = true;
  _keepVideo.autoplay = true;
  _keepVideo.muted = true;
  _keepVideo.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:12px;background:#000';
  area.appendChild(_keepVideo);

  if (!_keepCanvas) {
    _keepCanvas = document.createElement('canvas');
    _keepCtx = _keepCanvas.getContext('2d', { willReadFrequently: true });
  }

  if (!_zxingReader) _zxingReader = new ZXing.BrowserMultiFormatReader();
  var hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.QR_CODE,
    ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  _zxingReader.hints = hints;

  _keepVideo.srcObject = _keepStream;
  try { await _keepVideo.play(); } catch (_) {}

  _torchStream = _keepStream;
  _setTorchStream(_keepStream);

  if (statusBar) {
    statusBar.innerHTML = '<div style="text-align:center;padding:0 16px 6px;font-size:12px;color:#5ad8a6">⚡ ZXing — 请对准条码</div>';
  }

  function scanFrame() {
    if (!_zxingReader) return;
    if (_keepVideo.readyState < 2) { requestAnimationFrame(scanFrame); return; }

    var vw = _keepVideo.videoWidth, vh = _keepVideo.videoHeight;
    if (!vw || !vh) { requestAnimationFrame(scanFrame); return; }

    if (_keepCanvas.width !== vw || _keepCanvas.height !== vh) {
      _keepCanvas.width = vw;
      _keepCanvas.height = vh;
    }
    _keepCtx.drawImage(_keepVideo, 0, 0, vw, vh);

    try {
      var src = new ZXing.HTMLCanvasElementLuminanceSource(_keepCanvas);
      var bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
      var result = _zxingReader.decodeBitmap(bmp);

      _zxingReader.reset();
      stopScanner();
      overlay.remove();
      onScan(result.text);
    } catch(err) {
      requestAnimationFrame(scanFrame);
    }
  }
  requestAnimationFrame(scanFrame);
}

export function stopScanner() {
  if (_zxingReader) {
    try { _zxingReader.reset(); } catch(e) {}
  }
  if (_keepStream) {
    try { _keepStream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
    _keepStream = null;
  }
  if (_keepVideo) {
    try { _keepVideo.srcObject = null; } catch(e) {}
  }
  _torchStream = null;
  _torchOn = false;
}

export async function startUniversalScan(onResolved) {
  showScanner(async (text) => {
    const parts = text.split(':');
    if (parts.length >= 3 && parts[0] === 'wuju') {
      const type = parts[1];
      const id = parts.slice(2).join(':');
      if (type === 'item') {
        const item = await db.items.get(id);
        if (item) { onResolved?.({ kind: 'item', itemId: id }); return; }
      } else if (type === 'container') {
        const container = await db.containers.get(id);
        if (container) { onResolved?.({ kind: 'container', containerId: id }); return; }
      }
    }

    const item = await db.items.filter(i => i.qrCode === text).first();
    if (item) { onResolved?.({ kind: 'item', itemId: item.id }); return; }
    const container = await db.containers.filter(c => c.qrCode === text).first();
    if (container) { onResolved?.({ kind: 'container', containerId: container.id }); return; }

    alert('无法识别的条码/二维码:\n' + text + '\n\n请确认该条码已绑定到某个物品或容器');
  }, 'auto');
}

export function startAssociationScan(itemId, onDone) {
  showScanner(async (text) => {
    const parts = text.split(':');
    if (parts.length < 3 || parts[0] !== 'wuju' || parts[1] !== 'container') {
      alert('请扫描容器条码/二维码');
      return;
    }
    const containerId = parts.slice(2).join(':');
    const existing = await db.relations
      .where('sourceId').equals(itemId)
      .and(r => r.relationType === '属于' && r.targetId === containerId)
      .count();
    if (existing > 0) {
      alert('已关联到此容器');
      return;
    }
    await db.relations.put({
      id: uuid(),
      sourceId: itemId,
      targetId: containerId,
      relationType: '属于',
      notes: '扫码关联',
      createdAt: Date.now()
    });
    onDone?.(containerId);
  }, 'container');
}

export function startLocationScan(itemId, onDone) {
  showScanner(async (text) => {
    var containerId = '';
    const parts = text.split(':');
    if (parts.length >= 3 && parts[0] === 'wuju' && parts[1] === 'container') {
      containerId = parts.slice(2).join(':');
      const c = await db.containers.get(containerId);
      if (!c) { alert('未找到该容器'); return; }
    } else {
      const c = await db.containers.filter(c => c.qrCode === text).first();
      if (!c) { alert('未识别到容器条码/二维码:\n' + text + '\n\n请扫描已绑定到容器的条码'); return; }
      containerId = c.id;
    }
    await db.items.update(itemId, { containerId: containerId });
    onDone?.(containerId);
  }, 'container');
}

export function startContainerParentScan(containerId, onDone) {
  showScanner(async (text) => {
    var parentId = '';
    const parts = text.split(':');
    if (parts.length >= 3 && parts[0] === 'wuju' && parts[1] === 'container') {
      parentId = parts.slice(2).join(':');
    } else {
      const c = await db.containers.filter(c => c.qrCode === text).first();
      if (!c) { alert('未识别到容器条码/二维码'); return; }
      parentId = c.id;
    }
    if (parentId === containerId) { alert('不能将自己设为父容器'); return; }
    const descIds = await getAllDescendantIds(containerId);
    if (descIds.includes(parentId)) { alert('不能将子容器设为父容器（会造成循环）'); return; }
    const target = await db.containers.get(parentId);
    if (!target) { alert('未找到该容器'); return; }
    await db.containers.update(containerId, { parentId: parentId });
    onDone?.(parentId);
  }, 'container');
}

export function startContainerItemScan(containerId, onDone) {
  showScanner(async (text) => {
    var itemId = '';
    const parts = text.split(':');
    if (parts.length >= 3 && parts[0] === 'wuju' && parts[1] === 'item') {
      itemId = parts.slice(2).join(':');
    } else {
      const item = await db.items.filter(i => i.qrCode === text).first();
      if (!item) { alert('未识别到物品条码/二维码'); return; }
      itemId = item.id;
    }
    const item = await db.items.get(itemId);
    if (!item) { alert('未找到该物品'); return; }
    if (item.containerId === containerId) { alert('该物品已在此容器中'); return; }
    await db.items.update(itemId, { containerId: containerId });
    onDone?.(itemId);
  }, 'auto');
}
