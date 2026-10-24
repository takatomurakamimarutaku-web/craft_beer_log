// 共通UI部品
import { suggest } from './search.js';

/** 要素を作る。attrs: class, text, html禁止, on*, dataset, その他の属性 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG 文字列からノードを作る（自作の固定SVGのみに使う） */
export function svg(markup) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

/** ビールグラスのイラスト（写真が無いときのサムネイル・空状態） */
export function glassIcon(className = 'glass-icon') {
  const el = svg(`<svg xmlns="${SVG_NS}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M18 18h28l-3.4 36.2a3 3 0 0 1-3 2.8H24.4a3 3 0 0 1-3-2.8z" fill="var(--beer)"/>
    <path d="M23 26l2.2 25" stroke="var(--beer-hi)" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
    <circle cx="36" cy="40" r="1.6" fill="var(--foam)" opacity=".7"/><circle cx="31" cy="47" r="1.2" fill="var(--foam)" opacity=".6"/>
    <path d="M16.5 19.5c-1.6-4.6 2.2-8 6-6.8 1.4-3.4 6.4-4.4 9-1.6 2.6-2.6 7.6-1.8 8.8 1.6 3.8-1 7.4 2.4 5.4 6.8-.6 1.4-2 2-3.4 2H20c-1.6 0-3-.8-3.5-2z" fill="var(--foam)"/>
  </svg>`);
  el.setAttribute('class', className);
  return el;
}

// ---- 書式 ----

export function formatDate(s) {
  return s ? s.replaceAll('-', '/') : '';
}

export function formatAbv(abv) {
  return typeof abv === 'number' ? `${abv.toFixed(1)}%` : '';
}

export function formatYen(n) {
  return typeof n === 'number' ? `¥${n.toLocaleString('ja-JP')}` : '';
}

export function stars(rating) {
  if (typeof rating !== 'number') return '';
  const r = Math.round(rating);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

export function formatBytes(n) {
  if (typeof n !== 'number') return '不明';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

// ---- トースト ----

let toastTimer = null;

/** 画面下部の通知。action を渡すとボタン付き（「元に戻す」など） */
export function showToast(message, { actionLabel, onAction, duration = 3000 } = {}) {
  const root = document.getElementById('toast-root');
  root.replaceChildren();
  clearTimeout(toastTimer);
  const close = () => {
    clearTimeout(toastTimer);
    root.replaceChildren();
  };
  const toast = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', { text: message }),
    actionLabel
      ? h('button', {
          class: 'toast-action',
          type: 'button',
          text: actionLabel,
          onclick: () => {
            close();
            onAction();
          },
        })
      : null,
  );
  root.append(toast);
  toastTimer = setTimeout(close, duration);
  return close;
}

// ---- 確認ダイアログ ----

/**
 * @param {{title, message, buttons:[{label, value, variant}]}} opts
 * @returns {Promise<any>} 押したボタンの value（閉じた場合は null）
 */
export function confirmDialog({ title, message, buttons }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const finish = (v) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
    };
    const list = buttons || [
      { label: 'キャンセル', value: false },
      { label: 'OK', value: true, variant: 'primary' },
    ];
    const dialog = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
      h('h2', { id: 'dialog-title', text: title }),
      message ? h('p', { class: 'dialog-message', text: message }) : null,
      h(
        'div',
        { class: 'dialog-buttons' },
        list.map((b) =>
          h('button', { type: 'button', class: `btn ${b.variant ? 'btn-' + b.variant : ''}`, text: b.label, onclick: () => finish(b.value) }),
        ),
      ),
    );
    const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && finish(null) }, dialog);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    const primary = dialog.querySelector('.btn-primary, .btn-danger') || dialog.querySelector('button');
    primary.focus();
  });
}

// ---- 入力候補 ----

/**
 * 入力欄の下に候補を表示する（datalist は iOS での表示が不安定なため使わない）。
 * @param {HTMLInputElement} input
 * @param {{ items: () => Array<{label, sub?, key, value}>, onSelect?: (item) => void, limit?: number }} opts
 */
export function attachSuggest(input, { items, onSelect, limit = 6 }) {
  const list = h('ul', { class: 'suggest', role: 'listbox', hidden: true });
  input.setAttribute('autocomplete', 'off');
  input.after(list);

  function render() {
    const found = suggest(items(), input.value, (it) => it.key, limit).filter((it) => it.label !== input.value.trim() || it.sub);
    list.replaceChildren(
      ...found.map((it) =>
        h(
          'li',
          {
            role: 'option',
            // blur より先に処理するため pointerdown で選択する
            onpointerdown: (e) => {
              e.preventDefault();
              choose(it);
            },
          },
          h('span', { class: 'suggest-label', text: it.label }),
          it.sub ? h('span', { class: 'suggest-sub', text: it.sub }) : null,
        ),
      ),
    );
    list.hidden = found.length === 0 || document.activeElement !== input;
  }

  function choose(it) {
    list.hidden = true;
    if (onSelect) onSelect(it);
    else {
      input.value = it.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      list.hidden = true;
    }
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => {
    list.hidden = true;
  });
  return { refresh: render, hide: () => (list.hidden = true) };
}

// ---- 選択部品 ----

/** 単一選択（ラジオ）のボタン群。allowEmpty なら選択中を再タップで解除 */
export function segmented({ name, options, value, onChange, allowEmpty = false }) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': name });
  let current = value;
  const buttons = options.map((o) =>
    h('button', {
      type: 'button',
      class: 'seg',
      role: 'radio',
      text: o.label,
      'aria-checked': String(o.value === current),
      onclick: () => {
        current = allowEmpty && current === o.value ? null : o.value;
        buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === current)));
        onChange(current);
      },
    }),
  );
  wrap.append(...buttons);
  return wrap;
}

/** 複数選択のチップ群 */
export function chipGroup({ label, options, values, onChange }) {
  const selected = new Set(values);
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  for (const o of options) {
    const b = h('button', {
      type: 'button',
      class: 'chip',
      text: o.label,
      'aria-pressed': String(selected.has(o.value)),
      onclick: () => {
        if (selected.has(o.value)) selected.delete(o.value);
        else selected.add(o.value);
        b.setAttribute('aria-pressed', String(selected.has(o.value)));
        onChange([...selected]);
      },
    });
    wrap.append(b);
  }
  return wrap;
}

/** 星評価の入力。同じ星を再タップで未評価に戻す */
export function starInput(value, onChange) {
  let current = value;
  const wrap = h('div', { class: 'star-input', role: 'radiogroup', 'aria-label': '評価' });
  const buttons = [1, 2, 3, 4, 5].map((n) =>
    h('button', {
      type: 'button',
      class: 'star',
      'aria-label': `${n}`,
      onclick: () => {
        current = current === n ? null : n;
        paint();
        onChange(current);
      },
    }),
  );
  const clear = h('span', { class: 'star-note' });
  function paint() {
    buttons.forEach((b, i) => {
      b.textContent = current && i < current ? '★' : '☆';
      b.setAttribute('aria-checked', String(current === i + 1));
      b.setAttribute('role', 'radio');
    });
    clear.textContent = current ? `${current} / 5` : '未評価';
  }
  paint();
  wrap.append(...buttons, clear);
  return wrap;
}

// ---- サムネイルの遅延読み込み ----

/**
 * 画面に入ったサムネイルだけ IndexedDB から読み込む。
 * Object URL は画像の読み込み完了時に解放し、画面を離れる時に未解放分も解放する。
 */
export function createThumbLoader(getThumb) {
  const urls = new Set();
  const revoke = (url) => {
    if (urls.delete(url)) URL.revokeObjectURL(url);
  };
  const load = async (img) => {
    const id = img.dataset.photoId;
    if (!id) return;
    delete img.dataset.photoId;
    try {
      const blob = await getThumb(id);
      if (!blob || destroyed) return;
      const url = URL.createObjectURL(blob);
      urls.add(url);
      img.addEventListener('load', () => revoke(url), { once: true });
      img.addEventListener('error', () => revoke(url), { once: true });
      img.src = url;
    } catch (e) {
      console.error(e);
    }
  };
  let destroyed = false;
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                io.unobserve(e.target);
                load(e.target);
              }
            }
          },
          { rootMargin: '200px 0px' },
        )
      : null;
  return {
    observe(img, photoId) {
      img.dataset.photoId = photoId;
      if (io) io.observe(img);
      else load(img);
    },
    destroy() {
      destroyed = true;
      if (io) io.disconnect();
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    },
  };
}

/** サムネイル（写真が無ければグラスのイラスト） */
export function thumbView(photoId, loader, className = 'thumb') {
  const wrap = h('div', { class: className });
  if (photoId) {
    const img = h('img', { alt: '', decoding: 'async' });
    wrap.append(img);
    loader.observe(img, photoId);
  } else {
    wrap.append(glassIcon());
  }
  return wrap;
}

// ---- 写真の拡大表示 ----

export async function showPhoto(getPhoto, id) {
  const p = await getPhoto(id);
  if (!p) return;
  const url = URL.createObjectURL(p.blob);
  const close = () => {
    overlay.remove();
    URL.revokeObjectURL(url);
    window.removeEventListener('hashchange', close);
  };
  const overlay = h(
    'div',
    { class: 'overlay photo-overlay', onclick: close },
    h('img', { src: url, alt: '写真' }),
    h('button', { type: 'button', class: 'photo-close', 'aria-label': '閉じる', text: '×' }),
  );
  window.addEventListener('hashchange', close);
  document.body.append(overlay);
}

/** 空の状態の表示 */
export function emptyState(message, action) {
  return h('div', { class: 'empty' }, glassIcon('empty-glass'), h('p', { text: message }), action || null);
}

/** フォーム項目（ラベル＋入力＋エラー表示） */
export function field(label, control, { name, hint } = {}) {
  return h(
    'div',
    { class: 'field', dataset: name ? { field: name } : undefined },
    h('label', { class: 'field-label', text: label, for: control.id || null }),
    control,
    hint ? h('p', { class: 'field-hint', text: hint }) : null,
    h('p', { class: 'field-error', role: 'alert' }),
  );
}

/** エラー表示をまとめて更新し、最初のエラー項目へスクロールする */
export function showErrors(form, errors) {
  let first = null;
  for (const el of form.querySelectorAll('.field')) {
    const msg = errors[el.dataset.field] || '';
    el.querySelector('.field-error').textContent = msg;
    el.classList.toggle('has-error', Boolean(msg));
    if (msg && !first) first = el;
  }
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !first;
}
