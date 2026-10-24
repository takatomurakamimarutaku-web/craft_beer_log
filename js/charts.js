// 統計グラフ（自作 SVG の文字列。DOM に依存しない）
// 1系列のみ・軸は1本。棒の色はテーマの --primary、文字は本文色。
// タップできる行は data-i を持つ透明な当たり判定（棒より大きい）を重ね、画面側でイベントを付ける。

const NS = 'http://www.w3.org/2000/svg';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** 棒の先端だけを丸めた横棒（左端は基準線に接する） */
function hBarPath(x, y, w, h, r = 4) {
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${x} ${y}H${(x + w - rr).toFixed(1)}Q${(x + w).toFixed(1)} ${y} ${(x + w).toFixed(1)} ${y + rr}V${y + h - rr}Q${(x + w).toFixed(1)} ${y + h} ${(x + w - rr).toFixed(1)} ${y + h}H${x}Z`;
}

/** 棒の上端だけを丸めた縦棒（下端は基準線に接する） */
function vBarPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x} ${(y + h).toFixed(1)}V${(y + rr).toFixed(1)}Q${x} ${y.toFixed(1)} ${x + rr} ${y.toFixed(1)}H${x + w - rr}Q${x + w} ${y.toFixed(1)} ${x + w} ${(y + rr).toFixed(1)}V${(y + h).toFixed(1)}Z`;
}

/**
 * 横棒グラフ。rows: [{ label, count, sub?, tappable? }]
 * 値は棒の右に表示（sub があれば併記）。
 */
export function hBarChart(rows, { width = 320, labelWidth = 104, rowHeight = 30, unit = '', title = '' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const valueText = (r) => `${r.count}${unit}${r.sub ? `　${r.sub}` : ''}`;
  // 棒の右の数値が切れないよう、いちばん長い数値の幅だけ棒の領域を縮める
  const valueRoom = Math.max(40, ...rows.map((r) => textWidth(valueText(r), 11) + 10));
  const plotW = width - labelWidth - valueRoom;
  const h = rows.length * rowHeight + 4;
  const body = rows
    .map((r, i) => {
      const y = i * rowHeight + 2;
      const bw = (r.count / max) * plotW;
      const barH = 14;
      const by = y + (rowHeight - barH) / 2;
      const value = valueText(r);
      return `<g class="chart-row${r.tappable === false ? '' : ' chart-tap'}" data-i="${i}"${r.tappable === false ? '' : ' role="button" tabindex="0"'} aria-label="${esc(`${r.label}：${value}`)}">
    <title>${esc(`${r.label}：${value}`)}</title>
    <rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="transparent"/>
    <text x="${labelWidth - 8}" y="${y + rowHeight / 2 + 4}" text-anchor="end" font-size="11.5" fill="currentColor">${esc(truncate(r.label, 9))}</text>
    <path d="${hBarPath(labelWidth, by, bw, barH)}" fill="var(--primary)"/>
    <text x="${(labelWidth + bw + 6).toFixed(1)}" y="${y + rowHeight / 2 + 4}" font-size="11" fill="currentColor" fill-opacity=".8">${esc(value)}</text>
  </g>`;
    })
    .join('\n  ');
  return `<svg xmlns="${NS}" viewBox="0 0 ${width} ${h}" class="chart" role="group" aria-label="${esc(title)}">
  <line x1="${labelWidth}" y1="0" x2="${labelWidth}" y2="${h}" stroke="currentColor" stroke-opacity=".25"/>
  ${body}
</svg>`;
}

/**
 * 縦棒グラフ。rows: [{ label, count, tappable? }]
 * 0 の棒は描かず、ラベルだけ残す。値は棒の上（0 は省略）。
 */
export function vBarChart(rows, { width = 320, height = 170, unit = '', title = '', labelEvery = 1 } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = 16;
  const bottom = 22;
  const plotH = height - top - bottom;
  const slot = width / Math.max(rows.length, 1);
  const barW = Math.min(28, slot - 4);
  const body = rows
    .map((r, i) => {
      const x = i * slot + (slot - barW) / 2;
      const bh = (r.count / max) * plotH;
      const y = top + plotH - bh;
      const tappable = r.tappable !== false && r.count > 0;
      const value = `${r.count}${unit}`;
      return `<g class="chart-row${tappable ? ' chart-tap' : ''}" data-i="${i}"${tappable ? ' role="button" tabindex="0"' : ''} aria-label="${esc(`${r.label}：${value}`)}">
    <title>${esc(`${r.label}：${value}`)}</title>
    <rect x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${height}" fill="transparent"/>
    ${r.count ? `<path d="${vBarPath(Number(x.toFixed(1)), y, Number(barW.toFixed(1)), bh)}" fill="var(--primary)"/>` : ''}
    ${r.count ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity=".8">${r.count}</text>` : ''}
    ${i % labelEvery === 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity=".75">${esc(r.label)}</text>` : ''}
  </g>`;
    })
    .join('\n  ');
  return `<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}" class="chart" role="group" aria-label="${esc(title)}">
  <line x1="0" y1="${top + plotH}" x2="${width}" y2="${top + plotH}" stroke="currentColor" stroke-opacity=".3"/>
  ${body}
</svg>`;
}

/** おおよその文字幅（全角は1em、半角は0.6em） */
function textWidth(s, size) {
  return [...String(s)].reduce((w, c) => w + (c.charCodeAt(0) > 0xff ? size : size * 0.6), 0);
}

function truncate(s, n) {
  const a = [...String(s)];
  return a.length > n ? `${a.slice(0, n - 1).join('')}…` : s;
}
