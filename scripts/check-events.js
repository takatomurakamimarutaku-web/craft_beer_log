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
// breweryIds は data/breweries.json に載っている id であること
const breweries = JSON.parse(readFileSync(join(dirname(path), 'breweries.json'), 'utf8'));
const breweryIds = new Set(breweries.breweries.map((b) => b.id));
const unknown = data.series.flatMap((s) => (s.breweryIds || []).filter((id) => !breweryIds.has(id)).map((id) => `series ${s.id}: breweryIds の ${id} がブリュワー情報にありません`));
if (unknown.length) {
  console.error(`NG: ${unknown.length}件の問題があります`);
  for (const e of unknown) console.error(`  - ${e}`);
  process.exit(1);
}
const today = localDateString();
const events = joinEvents(data);
const upcoming = events.filter((e) => eventPhase(e, today) !== 'past');
const stale = upcoming.filter((e) => isStale(e, today));
console.log(`OK: シリーズ ${data.series.length}件 / 回 ${events.length}件（これから ${upcoming.length}件）/ 更新日 ${data.updatedAt}`);
for (const e of stale) console.log(`  要確認（最終確認 ${e.lastVerified}）: ${e.id}`);
