// 轻量封装单元素查询，减少在页面模块里重复写 document.querySelector。
export function $(sel) { return document.querySelector(sel); }
// 轻量封装多元素查询，统一保持和 $ 一致的调用风格。
export function $$(sel) { return document.querySelectorAll(sel); }

// 创建 DOM 节点并批量挂载属性和子节点，作为本项目的主渲染原语。
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'htmlFor') el.htmlFor = v;
    else if (k === 'onclick') el.addEventListener('click', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'disabled' || k === 'selected' || k === 'checked' || k === 'readonly') { if (v) el.setAttribute(k, ''); }
    else el.setAttribute(k, v);
  }
  function append(c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(append); return; }
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else if (c instanceof Node) el.appendChild(c);
  }
  children.forEach(append);
  return el;
}
// 将时间戳格式化为
export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 判断某个日期是否已过期。
export function isExpired(expiryDate) { return expiryDate && expiryDate < Date.now(); }
// 判断某个日期是否在临期窗口内。
export function isExpiringSoon(expiryDate) { return expiryDate && !isExpired(expiryDate) && expiryDate <= Date.now() + 7*86400000; }
