// 抓取三種來源的公開即時影像清單，合併寫成 public/data/cameras.json：
//   1. 交通部高速公路局 (國道) - thbapp，免金鑰
//   2. 公路局 (省道) - thbapp，免金鑰
//   3. TDX 運輸資料流通服務 (各縣市一般道路) - 需要免費申請的 Client ID/Secret，
//      透過 TDX_CLIENT_ID / TDX_CLIENT_SECRET 環境變數傳入 (GitHub Actions secrets)，
//      不會寫進程式碼或版本控制。
//
// 這些來源的伺服器都沒有開放 CORS 給任意網域的瀏覽器直接讀取，所以一律在
// GitHub Actions runner 上執行 (伺服器端不受瀏覽器CORS限制)，抓完存成靜態快照再部署。
// 注意：不同城市回傳的影像網址格式不一定一樣（有的是可以直接當 <img> 顯示的 MJPEG，
// 有的像台北市是 HLS 網頁 index.html，無法直接內嵌），前端已經做了失敗時退回「開新分頁」
// 的按鈕，所以這裡不需要特別過濾格式，全部照樣收錄即可。
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const all = [];

// ---------------- 國道 / 省道 (thbapp，免金鑰) ----------------
const THBAPP_SOURCES = [
  { url: 'https://thbapp.thb.gov.tw/services/cctv/freeway', category: '國道' },
  { url: 'https://thbapp.thb.gov.tw/services/cctv/thb', category: '省道' }
];

for (const src of THBAPP_SOURCES) {
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

// ---------------- 縣市一般道路 (TDX，需要免費申請的金鑰) ----------------
const TDX_CLIENT_ID = process.env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

const TDX_CITIES = [
  { code: 'Taipei', name: '台北市' },
  { code: 'NewTaipei', name: '新北市' },
  { code: 'Taoyuan', name: '桃園市' },
  { code: 'Taichung', name: '台中市' },
  { code: 'Tainan', name: '台南市' },
  { code: 'Kaohsiung', name: '高雄市' },
  { code: 'Keelung', name: '基隆市' },
  { code: 'Hsinchu', name: '新竹市' },
  { code: 'HsinchuCounty', name: '新竹縣' },
  { code: 'MiaoliCounty', name: '苗栗縣' },
  { code: 'ChanghuaCounty', name: '彰化縣' },
  { code: 'NantouCounty', name: '南投縣' },
  { code: 'YunlinCounty', name: '雲林縣' },
  { code: 'Chiayi', name: '嘉義縣市' }, // TDX對嘉義縣市不分開，縣市共用同一個代碼
  { code: 'PingtungCounty', name: '屏東縣' },
  { code: 'YilanCounty', name: '宜蘭縣' },
  { code: 'TaitungCounty', name: '台東縣' },
  { code: 'KinmenCounty', name: '金門縣' }
  // 花蓮縣/澎湖縣/連江縣：實測過 HualienCounty、Hualien、PenghuCounty、Penghu、
  // LienchiangCounty、Lienchiang、Matsu 等各種代碼組合都回傳400，
  // 研判TDX目前尚未收錄這三個離島/花蓮縣政府的CCTV資料源，不是代碼打錯。
];

// TDX 每個帳號的呼叫頻率限制很嚴格 (實測新申請帳號大約每分鐘個位數次)，
// 縣市之間一定要間隔幾秒，不然大部分會被 429 擋掉。
const TDX_REQUEST_DELAY_MS = 8000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTdxToken() {
  const resp = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: TDX_CLIENT_ID,
      client_secret: TDX_CLIENT_SECRET
    })
  });
  if (!resp.ok) throw new Error(`TDX 取得token失敗，回應碼 ${resp.status}`);
  const data = await resp.json();
  return data.access_token;
}

if (!TDX_CLIENT_ID || !TDX_CLIENT_SECRET) {
  console.warn('未設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET，跳過縣市道路攝影機 (只會有國道/省道資料)');
} else {
  try {
    const token = await getTdxToken();
    let cityTotal = 0;

    for (const city of TDX_CITIES) {
      try {
        const url = `https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/City/${city.code}?%24format=JSON`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error(`回應碼 ${resp.status}`);

        const data = await resp.json();
        const cctvs = data.CCTVs || [];

        let count = 0;
        for (const item of cctvs) {
          if (!item.VideoStreamURL || item.PositionLon == null || item.PositionLat == null) continue;
          const direction = item.RoadDirection ? ` (${item.RoadDirection}向)` : '';
          all.push({
            id: item.CCTVID || randomUUID(),
            lat: item.PositionLat,
            lon: item.PositionLon,
            description: `${item.RoadName || ''}${direction}`,
            streamUrl: item.VideoStreamURL,
            category: city.name
          });
          count++;
        }
        cityTotal += count;
        console.log(`${city.name}: 取得 ${count} 筆`);
      } catch (err) {
        console.error(`來源 [${city.name}] 抓取失敗: ${err.message}`);
      }

      await sleep(TDX_REQUEST_DELAY_MS);
    }

    console.log(`TDX 縣市道路總計: ${cityTotal} 筆`);
  } catch (err) {
    console.error(`TDX 認證失敗，跳過所有縣市道路攝影機: ${err.message}`);
  }
}

if (all.length === 0) {
  // 所有來源都失敗就讓這支 script 失敗，中止在部署之前，
  // 這樣 GitHub Pages 會繼續服務上一次成功部署的版本，不會把網站換成缺資料的版本。
  throw new Error('所有來源都沒有取得任何攝影機資料，中止本次部署');
}

await mkdir('public/data', { recursive: true });
await writeFile(
  'public/data/cameras.json',
  JSON.stringify({ updatedAt: new Date().toISOString(), count: all.length, items: all })
);

console.log(`寫入 public/data/cameras.json，共 ${all.length} 支攝影機`);
