// 写真の縮小・圧縮
export const PHOTO_MAX = 1280;
export const THUMB_MAX = 300;
export const JPEG_QUALITY = 0.8;

/** 長辺を maxLong に収めるサイズ（拡大はしない）。純粋関数 */
export function calcResizedSize(width, height, maxLong) {
  if (![width, height, maxLong].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError('幅・高さ・上限は正の数で指定してください');
  }
  const scale = Math.min(1, maxLong / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// 画像をデコードする。EXIF の向きは from-image で適用する
// （iOS 13.4 以降の Safari は <img> でも向きを適用するため、自前で回転はしない）
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // 非対応の形式・オプションは <img> で読み直す
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceSize(src) {
  return { width: src.naturalWidth || src.width, height: src.naturalHeight || src.height };
}

function drawToCanvas(src, maxLong) {
  const { width: w, height: h } = sourceSize(src);
  const size = calcResizedSize(w, h, maxLong);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 透過 PNG が黒くならないように
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size.width, size.height);
  return canvas;
}

function toJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画像の変換に失敗しました'))), 'image/jpeg', JPEG_QUALITY);
  });
}

/** 写真ファイル → { blob（長辺1280）, thumb（長辺300） } */
export async function processImage(file) {
  const src = await decode(file);
  try {
    const main = drawToCanvas(src, PHOTO_MAX);
    const thumb = drawToCanvas(main, THUMB_MAX);
    const [blob, thumbBlob] = await Promise.all([toJpeg(main), toJpeg(thumb)]);
    // iOS のキャンバスメモリを早めに解放する
    main.width = main.height = thumb.width = thumb.height = 0;
    return { blob, thumb: thumbBlob };
  } finally {
    if (typeof src.close === 'function') src.close();
  }
}
