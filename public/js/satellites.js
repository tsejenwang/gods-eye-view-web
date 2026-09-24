// 衛星圖層：CelesTrak TLE (CORS開放，直接前端抓取) + satellite.js 做 SGP4 推算
// 對應桌面版 C# 的 SGP.NET 用法：Satellite.Predict(utcNow).ToGeodetic() -> Latitude.Degrees/Longitude.Degrees/Altitude
// satellite.js 的 eciToGeodetic 回傳的是「弧度」，一定要用 satellite.degreesLat/degreesLong 轉成角度，這裡是最容易漏掉的地方。

const chkSatellites = document.getElementById('chkSatellites');
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle';

let satRecords = []; // [{ name, satrec }]
let satelliteTimer = null;

async function loadTle() {
  const text = await fetch(TLE_URL).then(r => {
    if (!r.ok) throw new Error('CelesTrak 回應碼 ' + r.status);
    return r.text();
  });

  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0);
  const records = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      records.push({ name, satrec });
    } catch {
      // 忽略格式異常的單筆資料
    }
  }
  return records;
}

function predictSatellites(records, date) {
  const result = [];
  for (const rec of records) {
    const pv = satellite.propagate(rec.satrec, date);
    if (!pv || !pv.position || rec.satrec.error) continue; // error!=0 代表衰變/推算失敗，跳過

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(pv.position, gmst);

    result.push({
      id: String(rec.satrec.satnum),
      name: rec.name,
      lat: satellite.degreesLat(geo.latitude),   // 注意：eciToGeodetic 回傳弧度，一定要轉換
      lon: satellite.degreesLong(geo.longitude),
      altitudeKm: geo.height
    });
  }
  return result;
}

function renderSatellites(items) {
  layers.satellites.clearLayers();
  for (const sat of items) {
    L.circleMarker([sat.lat, sat.lon], {
      radius: 6, color: colors.satellites, fillColor: colors.satellites, fillOpacity: 0.9, weight: 1
    }).bindPopup(`<b>${sat.name}</b><br/>高度: ${sat.altitudeKm.toFixed(1)} km`).addTo(layers.satellites);
  }
}

function tickSatellites() {
  if (satRecords.length === 0) return;
  renderSatellites(predictSatellites(satRecords, new Date()));
}

chkSatellites.addEventListener('change', async () => {
  if (chkSatellites.checked) {
    try {
      if (satRecords.length === 0) {
        satRecords = await loadTle();
        log(`衛星軌道資料 (TLE) 抓取完成，共 ${satRecords.length} 顆`);
      }
      tickSatellites();
      satelliteTimer = setInterval(tickSatellites, 5000);
      log('已開啟衛星圖層');
    } catch (err) {
      log('衛星圖層載入失敗: ' + err.message);
      chkSatellites.checked = false;
    }
  } else {
    clearInterval(satelliteTimer);
    layers.satellites.clearLayers();
    log('已關閉衛星圖層');
  }
});
