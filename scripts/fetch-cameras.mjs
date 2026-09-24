// 抓取交通部高速公路局(國道)+公路局(省道)公開即時影像清單，寫成 public/data/cameras.json。
// 這兩個來源的伺服器沒有回 CORS header，前端瀏覽器直接抓會被擋下，所以一樣改成
// 在 GitHub Actions runner 上執行後存成靜態快照。清單本身(攝影機位置)幾乎不會變動，
// 新鮮度不是問題；影像本身是瀏覽器直接連到政府伺服器的 <img> 標籤，永遠是即時的。
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const SOURCES = [
  { url: 'https://thbapp.thb.gov.tw/services/cctv/freeway', category: '國道' },
  { url: 'https://thbapp.thb.gov.tw/services/cctv/thb', category: '省道' }
];

const all = [];

for (const src of SOURCES) {
  try {
    const res = await fetch(src.url, { headers: { 'User-Agent': 'GodsEyeView-Web/1.0' } });
    if (!res.ok) throw new Error(`回應碼 ${res.status}`);
    const list = await res.json();

    let count = 0;
    for (const item of list) {
      if (!item.html || item.gisx == null || item.gisy == null) continue;
      all.push({
        id: item.id || randomUUID(),
        lat: item.gisy,
        lon: item.gisx,
        description: item.stakenumber || '',
        streamUrl: item.html,
        category: src.category
      });
      count++;
    }
    console.log(`${src.category}: 取得 ${count} 筆`);
  } catch (err) {
    console.error(`來源 [${src.category}] 抓取失敗: ${err.message}`);
  }
}

if (all.length === 0) {
  // 兩個來源都失敗就讓這支 script 失敗，讓整個 workflow 中止在部署之前，
  // 這樣 GitHub Pages 會繼續服務上一次成功部署的版本，不會把網站換成缺資料的版本。
  throw new Error('兩個來源都沒有取得任何攝影機資料，中止本次部署');
}

await mkdir('public/data', { recursive: true });
await writeFile(
  'public/data/cameras.json',
  JSON.stringify({ updatedAt: new Date().toISOString(), count: all.length, items: all })
);

console.log(`寫入 public/data/cameras.json，共 ${all.length} 支攝影機`);
