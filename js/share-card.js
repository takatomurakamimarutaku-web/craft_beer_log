// 共有用の画像カード（1080×1350、SNS の縦長投稿の比率）を canvas で描く
const W = 1080;
const H = 1350;
const FONT = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const BRAND = ['#ffc24d', '#ff8a3d', '#e8513a'];

/**
 * 画像カードを作る。
 * @param {{ name, brewery, meta, rating, date, place, taste: string[], flavor: string[], memo, color, photo: Blob|null }} d
 * @returns {Promise<Blob>} PNG
 */
export async function renderShareCard(d) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const color = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#f2a93b';

  // 上半分：写真があれば写真、無ければビールの色の背景にグラスのイラスト
  const top = 700;
  const img = d.photo ? await loadImage(d.photo).catch(() => null) : null;
  if (img) {
    drawCover(ctx, img, 0, 0, W, top);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, top);
    g.addColorStop(0, mix(color, '#ffffff', 0.55));
    g.addColorStop(1, mix(color, '#ffffff', 0.15));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, top);
    drawGlass(ctx, W / 2, top / 2 + 30, color);
  }

  // 下半分：情報のパネル
  ctx.fillStyle = '#fbf7f1';
  roundRect(ctx, 0, top - 48, W, H - top + 48, 48);
  ctx.fill();

  const x = 72;
  let y = top + 40;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#241a13';
  ctx.font = `800 68px ${FONT}`;
  y = wrapText(ctx, d.name, x, y, W - x * 2, 82, 2) + 10;
  ctx.fillStyle = '#6f6056';
  ctx.font = `600 38px ${FONT}`;
  const sub = [d.brewery, d.meta].filter(Boolean).join('  ·  ');
  if (sub) y = wrapText(ctx, sub, x, y, W - x * 2, 50, 1) + 18;

  if (typeof d.rating === 'number') {
    ctx.font = `700 56px ${FONT}`;
    const r = Math.round(d.rating);
    ctx.fillStyle = '#d97a1e';
    ctx.fillText('★'.repeat(r), x, y);
    const w = ctx.measureText('★'.repeat(r)).width;
    ctx.fillStyle = '#e4d8ca';
    ctx.fillText('★'.repeat(5 - r), x + w, y);
    y += 80;
  }

  const tags = [...(d.taste || []), ...(d.flavor || [])].slice(0, 8);
  if (tags.length) y = drawChips(ctx, tags, x, y, W - x * 2) + 16;
  // フッター：日付・場所とアプリ名
  const footY = H - 96;
  // メモはフッターに重ならない行数だけ（最大2行）
  const memoLines = Math.min(2, Math.floor((footY - 28 - y) / 48));
  if (d.memo && memoLines > 0) {
    ctx.fillStyle = '#3d3128';
    ctx.font = `500 34px ${FONT}`;
    wrapText(ctx, d.memo, x, y, W - x * 2, 48, memoLines);
  }

  ctx.fillStyle = '#6f6056';
  ctx.font = `600 32px ${FONT}`;
  const when = [d.date, d.place ? `@${d.place}` : ''].filter(Boolean).join('  ');
  if (when) wrapText(ctx, when, x, footY, W - x * 2 - 300, 40, 1);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#241a13';
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText('ホップ手帖', W - x, footY);
  ctx.textAlign = 'left';
  const markX = W - x - ctx.measureText('ホップ手帖').width - 60;
  drawMark(ctx, markX, footY - 6, 48);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png'));
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 折り返して描く。最大行数を超えたら末尾を「…」にする。次の行の y を返す */
function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of String(text).replace(/\s+/g, ' ')) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = shown[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    shown[maxLines - 1] = last + '…';
  }
  shown.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + shown.length * lineH;
}

/** 味・香りのチップ。次の行の y を返す */
function drawChips(ctx, tags, x, y, maxW) {
  ctx.font = `700 32px ${FONT}`;
  const h = 56;
  let cx = x;
  let rows = 1;
  for (const t of tags) {
    const w = ctx.measureText(t).width + 44;
    if (cx + w > x + maxW) {
      if (rows === 2) break;
      rows++;
      cx = x;
      y += h + 12;
    }
    ctx.fillStyle = '#f2e6d6';
    roundRect(ctx, cx, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#7a4a12';
    ctx.fillText(t, cx + 22, y + 11);
    cx += w + 12;
  }
  return y + h;
}

/** スタイルの色のビールを注いだパイントグラス */
function drawGlass(ctx, cx, cy, color) {
  const w = 300;
  const h = 440;
  const top = cy - h / 2;
  const body = new Path2D();
  body.moveTo(cx - w / 2, top);
  body.lineTo(cx + w / 2, top);
  body.lineTo(cx + w / 2 - 34, top + h);
  body.lineTo(cx - w / 2 + 34, top + h);
  body.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(60,30,10,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill(body);
  ctx.restore();
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = color;
  ctx.fillRect(cx - w, top + 70, w * 2, h);
  ctx.fillStyle = '#fff8ec';
  ctx.fillRect(cx - w, top, w * 2, 72);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(cx - w / 2 + 50, top + 90, 22, h - 130);
  ctx.restore();
  // 泡の盛り上がり
  ctx.fillStyle = '#fff8ec';
  for (const [dx, r] of [[-100, 46], [-40, 58], [30, 52], [96, 44]]) {
    ctx.beginPath();
    ctx.arc(cx + dx, top + 6, r, Math.PI, 0);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(36,26,19,0.25)';
  ctx.lineWidth = 6;
  ctx.stroke(body);
}

/** アプリのマーク（夕焼けグラデーションの角丸四角に白いグラス） */
function drawMark(ctx, x, y, s) {
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, BRAND[0]);
  g.addColorStop(0.55, BRAND[1]);
  g.addColorStop(1, BRAND[2]);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, s, s, s * 0.24);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.32, y + s * 0.3);
  ctx.lineTo(x + s * 0.68, y + s * 0.3);
  ctx.lineTo(x + s * 0.63, y + s * 0.8);
  ctx.lineTo(x + s * 0.37, y + s * 0.8);
  ctx.closePath();
  ctx.fill();
}

function mix(a, b, t) {
  const p = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}
