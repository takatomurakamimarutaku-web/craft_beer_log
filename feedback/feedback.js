// 友達向けの感想フォーム（feedback/index.html）
// 回答はどこにも送信しない。文章にまとめて LINE・共有・コピーで本人に届けてもらう

export const QUESTIONS = [
  { id: 'name', type: 'text', label: 'お名前（ニックネームでOK）', placeholder: '例：たろう', optional: true },
  { id: 'device', type: 'single', label: '使ったスマホは？', options: ['iPhone', 'Android', 'その他'] },
  { id: 'install', type: 'single', label: 'ホーム画面に追加できた？', options: ['すんなりできた', '迷ったけどできた', 'できなかった'] },
  { id: 'easeRecord', type: 'scale', label: 'ビールの記録はかんたんだった？', low: 'むずかしい', high: 'かんたん' },
  { id: 'design', type: 'scale', label: '見た目・デザインはどう？', low: 'いまいち', high: 'いいね' },
  {
    id: 'liked',
    type: 'multi',
    label: '気に入った画面は？（いくつでも）',
    options: ['記録', '一覧・詳細', '検索', '統計', '知識', '飲みたいリスト', 'テイスティング'],
  },
  {
    id: 'confusing',
    type: 'multi',
    label: 'わかりにくかったところは？（いくつでも）',
    options: ['記録の入力', '検索・絞り込み', '統計の見方', '専門用語', 'ボタンの場所', '文字の大きさ', '特になし'],
  },
  { id: 'bug', type: 'single', label: '動かない・おかしいところはあった？', options: ['なかった', 'あった'] },
  { id: 'bugWhat', type: 'textarea', label: '何をしたら', placeholder: '例：写真を2枚選んで保存した', showIf: { bug: 'あった' } },
  { id: 'bugResult', type: 'textarea', label: 'どうなった？', placeholder: '例：画面が真っ白になった（スクショは LINE で送ってね）', showIf: { bug: 'あった' } },
  {
    id: 'wanted',
    type: 'multi',
    label: 'あったら使いたい機能は？（いくつでも）',
    options: ['友達と記録を共有', 'お店・ブリュワー情報', 'ビールイベント情報', 'ラベル写真から自動入力', '特になし'],
  },
  { id: 'again', type: 'single', label: 'これからも使いたい？', options: ['使いたい', 'たぶん使う', 'たぶん使わない'] },
  { id: 'comment', type: 'textarea', label: 'ひとこと（自由に）', placeholder: 'よかったところ、直してほしいところなど', optional: true },
];

export const SCALE_FACES = ['😣', '🙁', '😐', '🙂', '😄'];

/** showIf を満たすか（未指定なら常に表示） */
export function isVisible(q, answers) {
  if (!q.showIf) return true;
  return Object.entries(q.showIf).every(([k, v]) => answers[k] === v);
}

function formatAnswer(q, value) {
  if (q.type === 'multi') return Array.isArray(value) && value.length ? value.join('、') : '';
  if (q.type === 'scale') return value ? `${SCALE_FACES[value - 1]} ${value}/5` : '';
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 回答を LINE などに貼れる文章にする（未回答・非表示の質問は省く）
 * @param {Record<string, unknown>} answers
 */
export function buildFeedbackText(answers, questions = QUESTIONS) {
  const lines = ['【ホップ手帖の感想】'];
  for (const q of questions) {
    if (!isVisible(q, answers)) continue;
    const a = formatAnswer(q, answers[q.id]);
    if (a) lines.push(q.type === 'textarea' ? `■${q.label}\n${a}` : `■${q.label}：${a}`);
  }
  return lines.join('\n');
}

/** 回答済みの数と、回答が必要な質問の数 */
export function progress(answers, questions = QUESTIONS) {
  const needed = questions.filter((q) => !q.optional && isVisible(q, answers));
  const done = needed.filter((q) => formatAnswer(q, answers[q.id]));
  return { done: done.length, total: needed.length };
}

// ---- ここから画面（ブラウザでのみ実行） ----

const STORAGE_KEY = 'hop-techo-feedback-draft';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function save(answers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    /* 保存できなくても回答はできる */
  }
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...children.filter(Boolean));
  return n;
}

function renderQuestion(q, answers, update) {
  const value = answers[q.id];
  const body = [];
  if (q.type === 'single' || q.type === 'multi') {
    const group = el('div', { class: 'chips', role: q.type === 'single' ? 'radiogroup' : 'group', 'aria-label': q.label });
    for (const opt of q.options) {
      const on = q.type === 'single' ? value === opt : Array.isArray(value) && value.includes(opt);
      group.append(
        el('button', {
          type: 'button',
          class: `chip${on ? ' on' : ''}`,
          role: q.type === 'single' ? 'radio' : 'checkbox',
          'aria-checked': String(on),
          text: opt,
          onclick: () => {
            if (q.type === 'single') update(q.id, on ? undefined : opt);
            else {
              const cur = Array.isArray(value) ? value : [];
              update(q.id, on ? cur.filter((x) => x !== opt) : [...cur, opt]);
            }
          },
        }),
      );
    }
    body.push(group);
  } else if (q.type === 'scale') {
    const group = el('div', { class: 'faces', role: 'radiogroup', 'aria-label': q.label });
    SCALE_FACES.forEach((face, i) => {
      const n = i + 1;
      group.append(
        el('button', {
          type: 'button',
          class: `face${value === n ? ' on' : ''}`,
          role: 'radio',
          'aria-checked': String(value === n),
          'aria-label': `${n}（5段階）`,
          text: face,
          onclick: () => update(q.id, value === n ? undefined : n),
        }),
      );
    });
    body.push(group, el('div', { class: 'scale-ends' }, el('span', { text: q.low }), el('span', { text: q.high })));
  } else {
    const input = el(q.type === 'textarea' ? 'textarea' : 'input', { placeholder: q.placeholder || '', 'aria-label': q.label, rows: '3' });
    input.value = value || '';
    // 入力中は再描画しない（フォーカスが外れるため）
    input.addEventListener('input', () => update(q.id, input.value, { silent: true }));
    body.push(input);
  }
  return el(
    'div',
    { class: `q${q.showIf ? ' sub' : ''}` },
    el('div', { class: 'q-label' }, el('span', { text: q.label }), q.optional ? el('span', { class: 'opt', text: '任意' }) : null),
    ...body,
  );
}

export function mount(root) {
  let answers = load();
  const list = el('div', { class: 'qs' });
  const bar = el('div', { class: 'bar-fill' });
  const count = el('span', { class: 'count' });
  const status = el('p', { class: 'status', role: 'status' });

  const refreshProgress = () => {
    const { done, total } = progress(answers);
    bar.style.width = `${total ? (done / total) * 100 : 0}%`;
    count.textContent = `${done} / ${total}`;
  };
  const update = (id, v, { silent = false } = {}) => {
    answers = { ...answers, [id]: v };
    save(answers);
    refreshProgress();
    if (!silent) draw();
  };
  const draw = () => {
    list.replaceChildren(...QUESTIONS.filter((q) => isVisible(q, answers)).map((q) => renderQuestion(q, answers, update)));
    refreshProgress();
  };

  const text = () => buildFeedbackText(answers);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      status.textContent = 'コピーしました。LINE に貼り付けて送ってね';
    } catch {
      status.textContent = 'コピーできませんでした。下の文章を長押しでコピーしてね';
      preview.textContent = text();
      preview.hidden = false;
    }
  };
  const preview = el('pre', { class: 'preview', hidden: '' });

  const actions = el(
    'div',
    { class: 'actions' },
    el('button', {
      type: 'button',
      class: 'btn line',
      text: 'LINE で送る',
      onclick: () => {
        location.href = `https://line.me/R/share?text=${encodeURIComponent(text())}`;
      },
    }),
    el('button', {
      type: 'button',
      class: 'btn',
      text: 'ほかのアプリで送る',
      onclick: async () => {
        if (!navigator.share) return copy();
        try {
          await navigator.share({ text: text() });
        } catch {
          /* キャンセル */
        }
      },
    }),
    el('button', { type: 'button', class: 'btn ghost', text: 'コピーする', onclick: copy }),
    el('button', {
      type: 'button',
      class: 'btn ghost',
      text: '送る文章を見る',
      onclick: () => {
        preview.textContent = text();
        preview.hidden = !preview.hidden;
      },
    }),
  );

  root.replaceChildren(el('div', { class: 'progress' }, el('div', { class: 'bar' }, bar), count), list, actions, status, preview);
  draw();
}
