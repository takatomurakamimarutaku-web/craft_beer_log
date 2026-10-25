// イベントデータを検証する: node scripts/check-events.js
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEventsData, joinEvents, eventPhase, isStale, localDateString } from '../js/events.js';

const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'events.json');
let data;
try {
  data = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`NG: data/events.json を読み込めません: ${e.message}`);
  process.exit(1);
}
const errors = validateEventsData(data);
if (errors.length) {
  console.error(`NG: ${errors.length}件の問題があります`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const today = localDateString();
const events = joinEvents(data);
const upcoming = events.filter((e) => eventPhase(e, today) !== 'past');
const stale = upcoming.filter((e) => isStale(e, today));
console.log(`OK: シリーズ ${data.series.length}件 / 回 ${events.length}件（これから ${upcoming.length}件）/ 更新日 ${data.updatedAt}`);
for (const e of stale) console.log(`  要確認（最終確認 ${e.lastVerified}）: ${e.id}`);
