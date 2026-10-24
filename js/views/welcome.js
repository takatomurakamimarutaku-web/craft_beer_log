// はじめての案内（初回起動時）とホーム画面への追加の手順
import { h, glassIcon, trapFocus, confirmDialog } from '../ui.js';
import { currentInstallState } from '../install.js';

export const ONBOARDED_KEY = 'onboardedAt';

/**
 * 初回起動時の案内。年齢の確認 → 使い方 → データの保存先 の順に表示する。
 * 20歳以上と答えて最後まで進むと meta に記録し、次回からは表示しない。
 * @returns {Promise<void>} 閉じたら解決する
 */
export function showWelcome(db) {
  return new Promise((resolve) => {
    const body = h('div', { class: 'welcome-body' });
    const dialog = h('div', { class: 'welcome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'welcome-title' }, body);
    const overlay = h('div', { class: 'overlay welcome-overlay' }, dialog);
    document.body.append(overlay);
    const release = trapFocus(dialog);

    const show = (...children) => {
      body.replaceChildren(...children);
      (body.querySelector('h2') || body).focus();
    };
    const title = (text) => h('h2', { id: 'welcome-title', tabindex: '-1', text });

    function ageStep() {
      show(
        h('div', { class: 'welcome-art' }, glassIcon('welcome-glass')),
        title('ホップ手帖へようこそ'),
        h('p', { text: '飲んだクラフトビールを記録して、あとから探したり振り返ったりできるアプリです。' }),
        h('p', { class: 'welcome-strong', text: 'お酒に関する内容を含むため、20歳以上の方を対象としています。' }),
        h(
          'div',
          { class: 'welcome-buttons' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block', text: '20歳以上です', onclick: guideStep }),
          h('button', { type: 'button', class: 'btn btn-block', text: '20歳未満です', onclick: underageStep }),
        ),
      );
    }

    function underageStep() {
      show(
        title('ご利用いただけません'),
        h('p', { text: '20歳未満の飲酒は法律で禁止されています。20歳になってから、またご利用ください。' }),
        h('div', { class: 'welcome-buttons' }, h('button', { type: 'button', class: 'btn btn-block', text: '戻る', onclick: ageStep })),
      );
    }

    function guideStep() {
      show(
        title('できること'),
        h(
          'ul',
          { class: 'welcome-list' },
          h('li', {}, h('strong', { text: '記録' }), h('span', { text: '下の「＋」から、名前だけでもすぐ記録できます。写真や評価、香りも残せます。' })),
          h('li', {}, h('strong', { text: '検索・統計' }), h('span', { text: 'スタイルや評価で探したり、好みの傾向を見たりできます。' })),
          h('li', {}, h('strong', { text: '知識' }), h('span', { text: '「はじめに」から、クラフトビールの基本を読めます。' })),
        ),
        h('p', { class: 'small muted', text: '飲酒運転は絶対にやめましょう。お酒は適量を楽しみましょう。' }),
        h('div', { class: 'welcome-buttons' }, h('button', { type: 'button', class: 'btn btn-primary btn-block', text: '次へ', onclick: dataStep })),
      );
    }

    function dataStep() {
      const ios = currentInstallState() === 'ios-browser';
      show(
        title('記録はこの端末だけに保存されます'),
        h('p', { text: '記録や写真は外部に送信されず、この端末の中だけに保存されます。機種変更や故障に備えて、ときどき「その他 → 設定・バックアップ」からバックアップを作成してください。' }),
        ios ? installSteps() : null,
        h('div', { class: 'welcome-buttons' }, h('button', { type: 'button', class: 'btn btn-primary btn-block', text: 'はじめる', onclick: finish })),
      );
    }

    async function finish() {
      try {
        await db.setMeta(ONBOARDED_KEY, new Date().toISOString());
      } catch (e) {
        // 保存できなくても使えるようにする（次回また表示される）
        console.warn(e);
      }
      release();
      overlay.remove();
      resolve();
    }

    ageStep();
  });
}

/** ホーム画面への追加の手順（iPhone の Safari） */
function installSteps() {
  return h(
    'div',
    { class: 'install-steps' },
    h('p', { class: 'welcome-strong', text: 'Safari で開いている場合は、ホーム画面に追加してから使ってください。' }),
    h(
      'ol',
      {},
      h('li', { text: '画面下（または上）の共有ボタン（四角から矢印が出たマーク）をタップ' }),
      h('li', { text: '「ホーム画面に追加」を選ぶ（見つからないときはメニューを下へスクロール）' }),
      h('li', { text: 'ホーム画面にできた「ホップ手帖」のアイコンから開く' }),
    ),
    h('p', { class: 'small muted', text: 'Safari とホーム画面のアプリでは記録が別々に保存されます。また、Safari で7日間開かないと記録が消えることがあります。' }),
  );
}

/** 一覧の案内などから開く、追加の手順のダイアログ */
export function showInstallGuide() {
  return confirmDialog({ title: 'ホーム画面に追加する', body: installSteps(), buttons: [{ label: '閉じる', value: true, variant: 'primary' }] });
}
