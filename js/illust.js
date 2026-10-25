// 自作 SVG イラスト（文字列を返す。DOM に依存しないのでテストできる）

const NS = 'http://www.w3.org/2000/svg';
let seq = 0;

// グラスの内側の形（液体の切り抜きにも使う）、脚、泡・液面の高さ
const GLASSES = {
  flute: { body: 'M30 14 L70 14 L61 118 L39 118 Z', foot: 'M39 118 L61 118 L65 128 L35 128 Z', foam: 16, liquid: 30 },
  nonic: { body: 'M26 14 L74 14 L75 28 L72 38 L66 126 L34 126 L28 38 L25 28 Z', foam: 16, liquid: 30 },
  tulip: {
    body: 'M31 12 C29 30 22 44 24 64 C26 84 38 92 50 92 C62 92 74 84 76 64 C78 44 71 30 69 12 Z',
    foot: 'M47 92 H53 V120 H47 Z M30 124 C30 119 70 119 70 124 C70 128 30 128 30 124 Z',
    foam: 18,
    liquid: 32,
  },
  weizen: { body: 'M32 10 C30 30 38 46 38 70 C38 92 32 108 36 126 L64 126 C68 108 62 92 62 70 C62 46 70 30 68 10 Z', foam: 12, liquid: 28 },
  snifter: {
    body: 'M34 30 C20 40 16 60 22 76 C28 90 40 96 50 96 C60 96 72 90 78 76 C84 60 80 40 66 30 Z',
    foot: 'M47 96 H53 V118 H47 Z M32 122 C32 117 68 117 68 122 C68 126 32 126 32 122 Z',
    foam: 50,
    liquid: 58,
  },
  goblet: {
    body: 'M20 22 C20 56 33 80 50 80 C67 80 80 56 80 22 Z',
    foot: 'M46 80 H54 V118 H46 Z M30 122 C30 117 70 117 70 122 C70 126 30 126 30 122 Z',
    foam: 26,
    liquid: 36,
  },
  stange: { body: 'M36 12 L64 12 L64 126 L36 126 Z', foam: 16, liquid: 28 },
};

export const GLASS_TYPES = Object.keys(GLASSES);

/**
 * スタイルのグラスとビールの色のイラスト。
 * glass: GLASS_TYPES のいずれか（不明ならパイント）、color: #rrggbb
 */
export function glassSvg(glass, color, { title = '' } = {}) {
  const g = GLASSES[glass] || GLASSES.nonic;
  const id = `gl${++seq}`;
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#f2a93b';
  return `<svg xmlns="${NS}" viewBox="0 0 100 140" class="glass-art" role="img" aria-label="${escapeAttr(title)}">
  <defs><clipPath id="${id}"><path d="${g.body}"/></clipPath></defs>
  <g clip-path="url(#${id})">
    <rect x="0" y="${g.liquid}" width="100" height="${140 - g.liquid}" fill="${safeColor}"/>
    <rect x="0" y="${g.foam}" width="100" height="${g.liquid - g.foam + 1}" fill="var(--foam)"/>
    <rect x="58" y="${g.liquid + 6}" width="5" height="60" fill="#fff" opacity=".22" transform="rotate(4 60 ${g.liquid})"/>
  </g>
  <path d="${g.body}" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2" stroke-linejoin="round"/>
  ${g.foot ? `<path d="${g.foot}" fill="currentColor" fill-opacity=".25"/>` : ''}
</svg>`;
}

/** 範囲バー（0〜max のうち range の部分を塗る）。range が null なら空のバー */
export function rangeBarSvg(range, max, { color = 'var(--primary)' } = {}) {
  const w = 200;
  const bar = Array.isArray(range)
    ? (() => {
        const x0 = (Math.min(range[0], max) / max) * w;
        const x1 = (Math.min(range[1], max) / max) * w;
        return `<rect x="${x0.toFixed(1)}" y="2" width="${Math.max(2, x1 - x0).toFixed(1)}" height="8" rx="4" fill="${color}"/>`;
      })()
    : '';
  return `<svg xmlns="${NS}" viewBox="0 0 ${w} 12" preserveAspectRatio="none" class="range-bar" aria-hidden="true">
  <rect x="0" y="4" width="${w}" height="4" rx="2" fill="currentColor" fill-opacity=".15"/>${bar}
</svg>`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// ---- 用語：IBU・SRM のスケール ----

const SCALE_W = 320;
const LABEL_W = 104;
const ROW_H = 22;

function scaleX(v, max) {
  return LABEL_W + (Math.min(v, max) / max) * (SCALE_W - LABEL_W - 10);
}

function styleRows(styles, key, max, top, fillOf) {
  return styles
    .filter((s) => Array.isArray(s[key]))
    .map((s, i) => {
      const y = top + i * ROW_H;
      const x0 = scaleX(s[key][0], max);
      const x1 = scaleX(s[key][1], max);
      return `<text x="${LABEL_W - 6}" y="${y + 12}" text-anchor="end" font-size="10" fill="currentColor">${escapeText(s.name)}</text>
  <rect x="${x0.toFixed(1)}" y="${y + 3}" width="${Math.max(3, x1 - x0).toFixed(1)}" height="12" rx="6" fill="${fillOf(s)}"/>`;
    })
    .join('\n  ');
}

function ticks(values, max, y, { below = null } = {}) {
  return values
    .map((v) => {
      const x = scaleX(v, max).toFixed(1);
      return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 4}" stroke="currentColor" stroke-opacity=".5"/>
  <text x="${x}" y="${y + 14}" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity=".75">${v}</text>${
    below ? `\n  <text x="${x}" y="${y + 26}" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity=".55">${below(v)}</text>` : ''
  }`;
    })
    .join('\n  ');
}

/** IBU のスケールと代表的なスタイルの範囲（styles は表示したい順に渡す） */
export function ibuScaleSvg(styles, max = 100) {
  const rows = styles.filter((s) => Array.isArray(s.ibu));
  const axisY = 8 + rows.length * ROW_H + 4;
  const h = axisY + 22;
  return `<svg xmlns="${NS}" viewBox="0 0 ${SCALE_W} ${h}" class="scale-art" role="img" aria-label="IBUの目安：${escapeAttr(rows.map((s) => s.name).join('、'))}">
  <line x1="${LABEL_W}" y1="${axisY}" x2="${SCALE_W - 10}" y2="${axisY}" stroke="currentColor" stroke-opacity=".5"/>
  ${styleRows(rows, 'ibu', max, 8, () => 'var(--primary)')}
  ${ticks([0, 20, 40, 60, 80, 100], max, axisY)}
  <text x="${LABEL_W - 6}" y="${axisY + 14}" text-anchor="end" font-size="9.5" fill="currentColor" fill-opacity=".75">IBU</text>
</svg>`;
}

/** SRM の色見本（EBC 換算付き）と代表的なスタイルの範囲。toHex は SRM → 色 */
export function srmScaleSvg(styles, toHex, max = 40) {
  const rows = styles.filter((s) => Array.isArray(s.srm));
  const stripY = 8;
  const strip = [];
  for (let v = 0; v < max; v++) {
    const x0 = scaleX(v, max);
    const x1 = scaleX(v + 1, max);
    strip.push(`<rect x="${x0.toFixed(1)}" y="${stripY}" width="${(x1 - x0 + 0.4).toFixed(1)}" height="16" fill="${toHex(v + 0.5)}"/>`);
  }
  const axisY = stripY + 18;
  const top = axisY + 34;
  const h = top + rows.length * ROW_H + 4;
  return `<svg xmlns="${NS}" viewBox="0 0 ${SCALE_W} ${h}" class="scale-art" role="img" aria-label="SRMの色見本と目安：${escapeAttr(rows.map((s) => s.name).join('、'))}">
  ${strip.join('')}
  <text x="${LABEL_W - 6}" y="${axisY + 14}" text-anchor="end" font-size="9.5" fill="currentColor" fill-opacity=".75">SRM</text>
  <text x="${LABEL_W - 6}" y="${axisY + 26}" text-anchor="end" font-size="9.5" fill="currentColor" fill-opacity=".55">EBC(約)</text>
  ${ticks([2, 6, 10, 20, 30, 40], max, axisY, { below: (v) => Math.round(v * 1.97) })}
  ${styleRows(rows, 'srm', max, top, (s) => toHex((s.srm[0] + s.srm[1]) / 2))}
</svg>`;
}

function escapeText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

// ---- ホップ ----

// 段ごとの苞（ほう）の数と幅。上の段ほど手前に重なるよう、下の段から描く
const CONE_ROWS = [
  [2, 15],
  [3, 21],
  [3, 25],
  [4, 26],
  [3, 24],
  [3, 19],
  [2, 13],
];

/** ホップの毬花（きゅうか）の図形（svg 要素の中身） */
function coneMarkup() {
  const bracts = [];
  for (let r = CONE_ROWS.length - 1; r >= 0; r--) {
    const [n, half] = CONE_ROWS[r];
    const y = 30 + r * 10.5;
    const w = (half * 2) / n;
    for (let i = 0; i < n; i++) {
      const cx = 50 - half + w * (i + 0.5);
      const bw = w / 2 + 3;
      const h = 17;
      const fill = (r + i) % 2 ? 'var(--hop-1)' : 'var(--hop-2)';
      bracts.push(
        `<path d="M${(cx - bw).toFixed(1)} ${y} C${(cx - bw).toFixed(1)} ${y + h * 0.75} ${(cx - bw * 0.3).toFixed(1)} ${y + h} ${cx.toFixed(1)} ${y + h} C${(cx + bw * 0.3).toFixed(1)} ${y + h} ${(cx + bw).toFixed(1)} ${y + h * 0.75} ${(cx + bw).toFixed(1)} ${y} Z" fill="${fill}" stroke="var(--hop-line)" stroke-width="1.2"/>`,
      );
    }
  }
  return `<path d="M50 4 C50 12 50 18 50 28" stroke="var(--hop-line)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M50 14 C60 6 74 6 82 12 C74 20 60 22 50 14 Z" fill="var(--hop-2)" stroke="var(--hop-line)" stroke-width="1.2"/>
  <path d="M52 14 C62 12 70 12 78 12" stroke="var(--hop-line)" stroke-width="1" fill="none"/>
  ${bracts.join('\n  ')}`;
}

/** ホップの毬花（きゅうか）のイラスト */
export function hopConeSvg({ title = '' } = {}) {
  return `<svg xmlns="${NS}" viewBox="0 0 100 120" class="hop-art" role="img" aria-label="${escapeAttr(title)}">
  ${coneMarkup()}
</svg>`;
}

// 香りタグのモチーフ（中心 0,0・半径 10 程度）と背景の色
const AROMA_MOTIFS = {
  citrus: {
    color: '#f2a33a',
    art: '<circle r="9.5" fill="#f2a33a"/><circle r="7.5" fill="#fcd27a"/><path d="M0 -7.5V7.5M-6.5 -3.75L6.5 3.75M-6.5 3.75L6.5 -3.75" stroke="#f2a33a" stroke-width="1.2"/>',
  },
  tropical: {
    color: '#e8b923',
    art: '<path d="M0 -4L-4 -11M0 -4L0 -12M0 -4L4 -11" stroke="#4f9a3c" stroke-width="2" stroke-linecap="round"/><ellipse cy="3" rx="6.5" ry="8" fill="#e8b923"/><path d="M-5 -1L5 7M-5 7L5 -1M-6 3L0 9M6 3L0 9" stroke="#b9861a" stroke-width="0.9"/>',
  },
  'stone-fruit': {
    color: '#f19072',
    art: '<circle cy="1.5" r="8.5" fill="#f19072"/><path d="M0 -6C-2 -1 -2 4 0 9" stroke="#d0644a" stroke-width="1.2" fill="none"/><path d="M1 -7C4 -11 9 -11 10 -8C7 -6 3 -6 1 -7Z" fill="#6aa84f"/>',
  },
  berry: {
    color: '#9a4a8f',
    art: '<circle cx="-4.5" cy="2" r="4.6" fill="#9a4a8f"/><circle cx="4.5" cy="2" r="4.6" fill="#7d3574"/><circle cy="-5" r="4.6" fill="#b45aa6"/><path d="M0 -9V-12" stroke="#4f9a3c" stroke-width="1.6" stroke-linecap="round"/>',
  },
  pine: {
    color: '#3f7d4a',
    art: '<path d="M0 -11L7 -2H3L8 5H-8L-3 -2H-7Z" fill="#3f7d4a"/><rect x="-1.5" y="5" width="3" height="5" fill="#7a5233"/>',
  },
  resin: {
    color: '#d08a1e',
    art: '<path d="M0 -10C4 -3 7 1 7 4A7 7 0 0 1 -7 4C-7 1 -4 -3 0 -10Z" fill="#d08a1e"/><path d="M-3 3A3 3 0 0 0 0 6" stroke="#f6c66b" stroke-width="1.4" fill="none"/>',
  },
  herbal: {
    color: '#5b9b54',
    art: '<path d="M-8 8C-8 -4 0 -10 9 -10C9 0 2 8 -8 8Z" fill="#5b9b54"/><path d="M-8 8L5 -6" stroke="#2f6a2b" stroke-width="1.2"/>',
  },
  floral: {
    color: '#e48fb4',
    art: '<g fill="#e48fb4"><circle cy="-5.5" r="4.2"/><circle cx="5.2" cy="-1.7" r="4.2"/><circle cx="3.2" cy="4.5" r="4.2"/><circle cx="-3.2" cy="4.5" r="4.2"/><circle cx="-5.2" cy="-1.7" r="4.2"/></g><circle r="2.8" fill="#f5c542"/>',
  },
  spicy: {
    color: '#d2452f',
    art: '<path d="M-6 -6C-2 -2 2 4 8 9C1 8 -6 3 -8 -3Z" fill="#d2452f"/><path d="M-7 -5C-8 -8 -6 -10 -4 -10" stroke="#4f9a3c" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  },
  earthy: {
    color: '#8a6440',
    art: '<path d="M-10 8C-7 0 7 0 10 8Z" fill="#8a6440"/><path d="M-3 1V-7M0 0V-9M3 1V-6" stroke="#5b9b54" stroke-width="1.6" stroke-linecap="round"/>',
  },
  grassy: {
    color: '#7cb342',
    art: '<path d="M-6 9C-6 2 -8 -4 -10 -8M0 9C0 1 0 -5 1 -11M6 9C6 2 8 -3 10 -7" stroke="#7cb342" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  },
  wood: {
    color: '#9b6b3d',
    art: '<circle r="9" fill="#c4935e"/><circle r="6" fill="none" stroke="#9b6b3d" stroke-width="1.2"/><circle r="3" fill="none" stroke="#9b6b3d" stroke-width="1.2"/>',
  },
  'white-wine': {
    color: '#b6c45a',
    art: '<g fill="#c3d16b"><circle cx="-4" cy="-4" r="3.4"/><circle cx="3" cy="-4" r="3.4"/><circle cx="-0.5" cy="1.5" r="3.4"/><circle cx="-4.5" cy="2.5" r="3"/><circle cx="3.5" cy="2.5" r="3"/><circle cy="7.5" r="3"/></g><path d="M0 -8V-11" stroke="#7a5233" stroke-width="1.6" stroke-linecap="round"/>',
  },
};

/** 品種ごとのホップのイラスト：毬花＋香りの特徴（最大3つ）のモチーフ。背景色は最初の香りの色 */
export function hopArtSvg({ flavorTags = [], title = '' } = {}) {
  const tags = flavorTags.filter((t) => AROMA_MOTIFS[t]).slice(0, 3);
  const tint = tags.length ? AROMA_MOTIFS[tags[0]].color : 'var(--hop-2)';
  const xs = tags.length === 1 ? [50] : tags.length === 2 ? [32, 68] : [19, 50, 81];
  const badges = tags.map(
    (t, i) => `<g transform="translate(${xs[i]} 112)" data-aroma="${t}"><circle r="14.5" fill="var(--surface)" stroke="${AROMA_MOTIFS[t].color}" stroke-width="1.5"/><g transform="scale(1.15)">${AROMA_MOTIFS[t].art}</g></g>`,
  );
  return `<svg xmlns="${NS}" viewBox="0 0 100 140" class="hop-art" role="img" aria-label="${escapeAttr(title)}">
  <rect x="2" y="2" width="96" height="136" rx="12" fill="${tint}" fill-opacity=".22"/>
  <g transform="translate(19 2) scale(.62)">
  ${coneMarkup()}
  </g>
  ${badges.join('\n  ')}
</svg>`;
}

// ---- テイスティングのレーダーチャート ----

/**
 * values: { bitter, sweet, sour, body, aroma }（1〜5 / null）
 * points / axisEnd は js/tasting.js の radarPoints / radarAxisEnd（ここでは描画だけを担う）
 */
export function radarSvg({ points, axisEnds, labels, max = 5, size = 220, compact = false, title = '' }) {
  const c = size / 2;
  const grid = [];
  for (let level = 1; level <= max; level++) {
    const ring = axisEnds.map((e) => `${(c + (e.x - c) * (level / max)).toFixed(1)},${(c + (e.y - c) * (level / max)).toFixed(1)}`).join(' ');
    grid.push(`<polygon points="${ring}" fill="none" stroke="currentColor" stroke-opacity="${level === max ? 0.35 : 0.15}"/>`);
  }
  const spokes = axisEnds.map((e) => `<line x1="${c}" y1="${c}" x2="${e.x}" y2="${e.y}" stroke="currentColor" stroke-opacity=".15"/>`).join('');
  const shape = points.some((p) => !p.missing)
    ? `<polygon points="${points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="var(--primary)" fill-opacity=".28" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round"/>`
    : '';
  const dots = points
    .map((p) =>
      p.missing
        ? ''
        : `<circle cx="${p.x}" cy="${p.y}" r="${compact ? 2.5 : 3.5}" fill="var(--primary)"/>`,
    )
    .join('');
  const text = compact
    ? ''
    : axisEnds
        .map((e, i) => {
          const dx = e.x - c;
          const dy = e.y - c;
          const lx = c + dx * 1.2;
          const ly = c + dy * 1.2 + 4;
          const anchor = Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end';
          const p = points[i];
          const val = p.missing ? '－' : String(p.value);
          return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="12" fill="currentColor">${escapeText(labels[i])} <tspan font-weight="700">${val}</tspan></text>`;
        })
        .join('');
  const padX = compact ? 4 : 64;
  const padY = compact ? 4 : 26;
  return `<svg xmlns="${NS}" viewBox="${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}" class="radar${compact ? ' radar-compact' : ''}" role="img" aria-label="${escapeAttr(title)}">
  ${grid.join('')}${spokes}${shape}${dots}${text}
</svg>`;
}
