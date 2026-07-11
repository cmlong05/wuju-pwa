export function $(sel) { return document.querySelector(sel); }
export function $$(sel) { return document.querySelectorAll(sel); }

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'htmlFor') el.htmlFor = v;
    else if (k === 'onclick') el.addEventListener('click', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'disabled' || k === 'selected' || k === 'checked') { if (v) el.setAttribute(k, ''); }
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

export function htmlEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function isExpired(expiryDate) { return expiryDate && expiryDate < Date.now(); }
export function isExpiringSoon(expiryDate) { return expiryDate && !isExpired(expiryDate) && expiryDate <= Date.now() + 7*86400000; }
