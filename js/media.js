// Prepares a picked file for upload: shrinks photos, reads video size, builds a small thumbnail.

const cfg = () => window.BUCKET_CONFIG || {};

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decodeImage(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('This image format cannot be read by the browser.'));
      i.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function drawScaled(img, maxEdge) {
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const extFor = (type, name = '') => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  if (m) return m[1].toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type.startsWith('video/')) return type.split('/')[1].replace('quicktime', 'mov');
  return 'jpg';
};

export async function prepareFile(file) {
  const type = file.type || '';
  if (type.startsWith('image/')) {
    // Animated GIFs and SVGs are kept as they are.
    if (type === 'image/gif' || type === 'image/svg+xml') {
      const img = await decodeImage(file);
      return { kind: 'image', blob: file, type, ext: extFor(type, file.name), width: img.width || 0, height: img.height || 0, size: file.size, thumb: null };
    }
    const img = await decodeImage(file);
    const full = drawScaled(img, cfg().MAX_IMAGE_EDGE || 2200);
    const blob = await canvasToBlob(full, 'image/jpeg', 0.86);
    const thumbCanvas = drawScaled(img, 640);
    const thumb = thumbCanvas.toDataURL('image/jpeg', 0.72);
    if (img.close) img.close();
    return { kind: 'image', blob, type: 'image/jpeg', ext: 'jpg', width: full.width, height: full.height, size: blob.size, thumb };
  }
  if (type.startsWith('video/')) {
    const maxMb = cfg().MAX_VIDEO_MB || 50;
    if (file.size > maxMb * 1024 * 1024) {
      throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(0)} MB. Videos can be up to ${maxMb} MB. Trim or compress it first.`);
    }
    const dims = await new Promise((resolve) => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        resolve({ width: v.videoWidth, height: v.videoHeight });
        URL.revokeObjectURL(url);
      };
      v.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(url);
      };
      v.src = url;
    });
    return { kind: 'video', blob: file, type, ext: extFor(type, file.name), width: dims.width, height: dims.height, size: file.size, thumb: null };
  }
  throw new Error(`"${file.name}" is not a photo or a video.`);
}
