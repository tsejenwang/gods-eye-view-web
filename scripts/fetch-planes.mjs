// 抓取 OpenSky states/all (匿名API)，寫成 public/data/planes.json 給前端當同網域靜態檔讀取。
// OpenSky 只允許自己網域的瀏覽器直接抓 (CORS)，所以前端沒辦法直接打；改成這支 script 在
// GitHub Actions runner 上執行 (伺服器端不受瀏覽器CORS限制)，抓完存成快照檔案再一起部署。
import { mkdir, writeFile } from 'node:fs/promises';

// 東亞/台灣周邊，跟桌面版的預設範圍一致，避免抓全球造成檔案過大
const BBOX = { lamin: 0, lomin: 90, lamax: 45, lomax: 150 };

const url = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;

const res = await fetch(url, { headers: { 'User-Agent': 'GodsEyeView-Web/1.0' } });
if (!res.ok) {
  throw new Error(`OpenSky 回應碼 ${res.status}`);
}
const data = await res.json();

const planes = [];
for (const s of data.states || []) {
  const [icao24, callsignRaw, country, , , lon, lat, baroAlt, onGround, velocity, heading] = s;
  if (lat == null || lon == null || onGround) continue;

  planes.push({
    id: icao24,
    lat,
    lon,
    altitudeM: baroAlt || 0,
    speedMs: velocity || 0,
    headingDeg: heading || 0,
    callsign: (callsignRaw || '').trim() || icao24,
    country: country || ''
  });
}

await mkdir('public/data', { recursive: true });
await writeFile(
  'public/data/planes.json',
  JSON.stringify({ updatedAt: new Date().toISOString(), count: planes.length, items: planes })
);

console.log(`寫入 public/data/planes.json，共 ${planes.length} 架`);
