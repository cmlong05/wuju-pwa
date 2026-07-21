// 图片压缩工具
// localStorage key: 'wuju_imageMaxWidth' — 0 = 不压缩

const STORAGE_KEY = 'wuju_imageMaxWidth';

/**
 * 读取图片最大宽度设置（px）。0 = 不压缩。
 */
export function getImageMaxWidth() {
  const val = localStorage.getItem(STORAGE_KEY);
  return val ? parseInt(val, 10) : 640;
}

/**
 * 写入图片最大宽度设置
 */
export function setImageMaxWidth(width) {
  localStorage.setItem(STORAGE_KEY, String(width));
}

/**
 * 压缩图片 — 若 maxWidth <= 0 或图片宽度 <= maxWidth 则原样返回。
 * @param {File} file - 图片文件
 * @param {number} maxWidth - 最大宽度（px），<=0 不压缩
 * @returns {Promise<string>} dataURL
 */
export function compressImage(file, maxWidth) {
  return new Promise((resolve) => {
    if (!maxWidth || maxWidth <= 0) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // 图片宽度已经在限制以内，不缩放
      if (w <= maxWidth) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
        return;
      }

      const ratio = maxWidth / w;
      const newW = maxWidth;
      const newH = Math.round(h * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, newW, newH);

      // 用 JPEG 0.85 质量压缩（对照片友好），PNG 则用 PNG
      const isPNG = file.type === 'image/png';
      resolve(canvas.toDataURL(isPNG ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // 加载失败则返回原图
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
}

/**
 * 压缩已有的 dataURL 图片（用于批量压缩库中已有图片）。
 * @param {string} dataUrl - base64 dataURL
 * @param {number} maxWidth - 最大宽度（px），<=0 不压缩
 * @returns {Promise<string>} 压缩后的 dataURL（无需压缩则返回原值）
 */
export function compressDataUrl(dataUrl, maxWidth) {
  return new Promise((resolve) => {
    if (!maxWidth || maxWidth <= 0) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= maxWidth) {
        resolve(dataUrl);
        return;
      }

      const ratio = maxWidth / w;
      const newW = maxWidth;
      const newH = Math.round(h * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, newW, newH);

      // 判断原格式：dataURL 以 image/png 开头则保留 PNG
      const isPNG = dataUrl.startsWith('data:image/png');
      resolve(canvas.toDataURL(isPNG ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
