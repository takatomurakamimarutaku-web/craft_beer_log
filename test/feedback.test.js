import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, buildFeedbackText, isVisible, progress } from '../feedback/feedback.js';

test('感想の文章：未回答は省き、選択肢・5段階・複数選択を整形する', () => {
  const text = buildFeedbackText({ name: ' たろう ', device: 'iPhone', easeRecord: 4, liked: ['記録', '統計'], confusing: [] });
  assert.equal(
    text,
    ['【ホップ手帖の感想】', '■お名前（ニックネームでOK）：たろう', '■使ったスマホは？：iPhone', '■ビールの記録はかんたんだった？：🙂 4/5', '■気に入った画面は？（いくつでも）：記録、統計'].join('\n'),
  );
});

test('不具合の詳細は「あった」を選んだときだけ表示・出力する', () => {
  const q = QUESTIONS.find((x) => x.id === 'bugWhat');
  assert.equal(isVisible(q, { bug: 'なかった' }), false);
  assert.equal(isVisible(q, { bug: 'あった' }), true);
  assert.ok(!buildFeedbackText({ bug: 'なかった', bugWhat: '保存した' }).includes('保存した'));
  assert.ok(buildFeedbackText({ bug: 'あった', bugWhat: '保存した' }).includes('■何をしたら\n保存した'));
});

test('進み具合：任意項目は数えず、表示中の質問だけ数える', () => {
  const base = progress({});
  assert.equal(base.done, 0);
  assert.equal(progress({ bug: 'あった' }).total, base.total + 2);
  assert.equal(progress({ name: 'たろう', comment: 'よい' }).done, 0);
});
