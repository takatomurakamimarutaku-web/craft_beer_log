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
