// God's Eye View - 網頁版
// 這個檔案負責：地圖初始化、圖層渲染、飛機/地震/攝影機資料抓取、路況圖層、GPS定位、
// 以及「點地圖找最近攝影機」互動。衛星推算(SGP4)獨立在 satellites.js。

const map = L.map('map', { worldCopyJump: true }).setView([23.5, 121], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  subdomains: 'abc',
  maxZoom: 19
}).addTo(map);

const layers = {
  planes: L.layerGroup().addTo(map),
  ships: L.layerGroup().addTo(map),
  satellites: L.layerGroup().addTo(map),
  quakes: L.layerGroup().addTo(map),
  cameras: L.layerGroup().addTo(map),
  traffic: L.layerGroup().addTo(map)
};

const colors = {
  planes: '#4fc3f7',
  ships: '#ffca28',
  satellites: '#ab47bc',
  quakes: '#ef5350',
  cameras: '#26c4a4'
};

// ---------------- 側邊選單收合 ----------------
document.getElementById('btnToggleSidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 220); // 等收合動畫跑完，讓地圖重新計算大小避免出現空白
});

// ---------------- 狀態記錄 ----------------
function log(message) {
  const list = document.getElementById('log');
  const li = document.createElement('li');
  const now = new Date();
  li.textContent = `[${now.toLocaleTimeString('zh-TW', { hour12: false })}] ${message}`;
  list.insertBefore(li, list.firstChild);
  while (list.children.length > 200) list.removeChild(list.lastChild);
}

// 統一管理畫面正中央的「請放大地圖」提示
const zoomHintReasons = {};
function setZoomHint(key, text) {
  if (text) zoomHintReasons[key] = text;
  else delete zoomHintReasons[key];

  const el = document.getElementById('zoomHint');
  const texts = Object.values(zoomHintReasons);
  if (texts.length === 0) {
    el.style.display = 'none';
  } else {
    el.textContent = texts.join('　|　');
    el.style.display = 'block';
  }
}

// ---------------- 飛機 (資料來源: data/planes.json，由 GitHub Actions 定期抓取 OpenSky 產生) ----------------
const chkPlanes = document.getElementById('chkPlanes');
let planesLoaded = false;

async function loadPlanes() {
  try {
    const resp = await fetch('data/planes.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('回應碼 ' + resp.status);
    const data = await resp.json();

    layers.planes.clearLayers();
    for (const p of data.items || []) {
      L.circleMarker([p.lat, p.lon], {
        radius: 5, color: colors.planes, fillColor: colors.planes, fillOpacity: 0.9, weight: 1
      }).bindPopup(
        `<b>${p.callsign}</b><br/>國籍: ${p.country}<br/>高度: ${Math.round(p.altitudeM)} m<br/>` +
        `速度: ${Math.round(p.speedMs * 3.6)} km/h<br/>航向: ${Math.round(p.headingDeg)}°`
      ).addTo(layers.planes);
    }

    const updatedText = data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-TW') : '未知';
    log(`飛機圖層載入完成，共 ${data.items.length} 架 (資料時間: ${updatedText}，非即時，約每10分鐘更新一次)`);
    planesLoaded = true;
  } catch (err) {
    log('飛機圖層載入失敗: ' + err.message);
  }
}

chkPlanes.addEventListener('change', () => {
  if (chkPlanes.checked) {
    loadPlanes();
  } else {
    layers.planes.clearLayers();
    log('已關閉飛機圖層');
  }
});

// ---------------- 船隻 (前端模擬，沒有免金鑰的全球即時 AIS 來源) ----------------
const chkShips = document.getElementById('chkShips');
const mockShips = [
  { id: 'DEMO-1', name: '台灣海峽貨輪 (示範)', lat: 24.0, lon: 119.5, headingDeg: 45, speedKn: 14 },
  { id: 'DEMO-2', name: '南海油輪 (示範)', lat: 15.0, lon: 113.0, headingDeg: 300, speedKn: 10 },
  { id: 'DEMO-3', name: '東京灣貨櫃船 (示範)', lat: 35.3, lon: 139.8, headingDeg: 160, speedKn: 18 },
  { id: 'DEMO-4', name: '新加坡海峽貨輪 (示範)', lat: 1.2, lon: 103.8, headingDeg: 90, speedKn: 12 }
];
let lastShipAdvance = Date.now();
let shipTimer = null;

function advanceShips(secondsElapsed) {
  for (const ship of mockShips) {
    ship.headingDeg = (ship.headingDeg + (Math.random() - 0.5) * 4 + 360) % 360;

    const distanceKm = ship.speedKn * 1.852 * (secondsElapsed / 3600);
    const headingRad = ship.headingDeg * Math.PI / 180;

    const deltaLat = (distanceKm / 111) * Math.cos(headingRad);
    const deltaLon = (distanceKm / (111 * Math.cos(ship.lat * Math.PI / 180))) * Math.sin(headingRad);

    ship.lat = Math.max(-85, Math.min(85, ship.lat + deltaLat));
    ship.lon = (((ship.lon + deltaLon) + 180) % 360 + 360) % 360 - 180;
  }
}

function renderShips() {
  layers.ships.clearLayers();
  for (const s of mockShips) {
    L.circleMarker([s.lat, s.lon], {
      radius: 5, color: colors.ships, fillColor: colors.ships, fillOpacity: 0.9, weight: 1
    }).bindPopup(`<b>${s.name}</b><br/>航向: ${Math.round(s.headingDeg)}°<br/>船速: ${s.speedKn.toFixed(1)} 節`)
      .addTo(layers.ships);
  }
}

chkShips.addEventListener('change', () => {
  if (chkShips.checked) {
    lastShipAdvance = Date.now();
    renderShips();
    shipTimer = setInterval(() => {
      const elapsed = (Date.now() - lastShipAdvance) / 1000;
      lastShipAdvance = Date.now();
      advanceShips(elapsed);
      renderShips();
    }, 5000);
    log('已開啟船隻圖層 (模擬示範資料)');
  } else {
    clearInterval(shipTimer);
    layers.ships.clearLayers();
    log('已關閉船隻圖層');
  }
});

// ---------------- 地震 (USGS，CORS開放，直接前端抓取) ----------------
const chkQuakes = document.getElementById('chkQuakes');

async function loadQuakes() {
  try {
    const resp = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    if (!resp.ok) throw new Error('回應碼 ' + resp.status);
    const data = await resp.json();

    layers.quakes.clearLayers();
    for (const f of data.features || []) {
      const [lon, lat] = f.geometry.coordinates;
      const mag = f.properties.mag || 0;
      const radius = Math.max(4, mag * 3);
      L.circleMarker([lat, lon], {
        radius, color: colors.quakes, fillColor: colors.quakes, fillOpacity: 0.5, weight: 1
      }).bindPopup(
        `<b>規模 ${mag.toFixed(1)}</b><br/>${f.properties.place}<br/>${new Date(f.properties.time).toLocaleString('zh-TW')}`
      ).addTo(layers.quakes);
    }
    log(`地震圖層更新完成，共 ${data.features.length} 筆 (近一天規模2.5+)`);
  } catch (err) {
    log('地震圖層更新失敗: ' + err.message);
  }
}

chkQuakes.addEventListener('change', () => {
  if (chkQuakes.checked) {
    loadQuakes();
  } else {
    layers.quakes.clearLayers();
    log('已關閉地震圖層');
  }
});

// ---------------- 攝影機 (資料來源: data/cameras.json，交通部高速公路局/公路局即時影像清單) ----------------
const chkCameras = document.getElementById('chkCameras');
let allCameras = [];

function renderVisibleCameras() {
  if (allCameras.length === 0) return;

  if (map.getZoom() < 8) {
    layers.cameras.clearLayers();
    setZoomHint('cameras', '📷 請放大地圖 (縣市等級以上) 才會顯示攝影機');
    return;
  }
  setZoomHint('cameras', null);

  const bounds = map.getBounds();
  layers.cameras.clearLayers();
  for (const cam of allCameras) {
    if (!bounds.contains([cam.lat, cam.lon])) continue;
    L.circleMarker([cam.lat, cam.lon], {
      radius: 5, color: colors.cameras, fillColor: colors.cameras, fillOpacity: 0.8, weight: 1,
      interactive: false
    }).addTo(layers.cameras);
  }
}

async function loadCameras() {
  try {
    const resp = await fetch('data/cameras.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('回應碼 ' + resp.status);
    const data = await resp.json();
    allCameras = data.items || [];
    renderVisibleCameras();
    const updatedText = data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-TW') : '未知';
    log(`攝影機清單載入完成，共 ${allCameras.length} 支 (清單時間: ${updatedText}；影像本身皆為即時)`);
    log('提示：點地圖上任一位置，會顯示離該點最近的攝影機即時影像');
  } catch (err) {
    log('攝影機清單載入失敗: ' + err.message);
  }
}

chkCameras.addEventListener('change', () => {
  if (chkCameras.checked) {
    if (allCameras.length === 0) loadCameras();
    else renderVisibleCameras();
  } else {
    allCameras = [];
    layers.cameras.clearLayers();
    setZoomHint('cameras', null);
    closeCamPanel('Pick');
    closeCamPanel('Near');
    log('已關閉攝影機圖層');
  }
});

map.on('moveend', () => { if (allCameras.length > 0) renderVisibleCameras(); });

const MAX_CAMERA_DISTANCE_M = 50000;

function findNearestCamera(latlng) {
  let nearest = null;
  let minDist = Infinity;
  for (const cam of allCameras) {
    const d = map.distance(latlng, [cam.lat, cam.lon]);
    if (d < minDist) { minDist = d; nearest = cam; }
  }
  return nearest ? { cam: nearest, distanceM: minDist } : null;
}

function closeCamPanel(which) {
  document.getElementById(`camPanel${which}`).style.display = 'none';
}

function updateCamPanel(which, cam, distanceM, distanceLabel) {
  const panel = document.getElementById(`camPanel${which}`);
  const body = panel.querySelector('.cam-panel-body');
  panel.style.display = 'block';
  const safeUrl = cam.streamUrl.replace(/'/g, "\\'");
  body.innerHTML =
    `<b>${cam.category} 即時影像</b><br/>${cam.description || ''}<br/>${distanceLabel} ${(distanceM / 1000).toFixed(1)} 公里` +
    `<img src="${cam.streamUrl}" onerror="this.replaceWith(Object.assign(document.createElement('div'),` +
    `{textContent:'影像暫時無法載入，可能是流量尖峰或攝影機離線',style:'color:#f88;font-size:11px;margin-top:4px;'}))"/>` +
    `<button class="cam-link-btn" onclick="window.open('${safeUrl}','_blank','noopener')">在新分頁開啟原始影像 ↗</button>`;
}

// 如果面板已經顯示過某支攝影機的畫面，之後「找不到」的情況就只疊加一個警告文字、
// 不清空原本的即時影像，避免使用者移動或點到範圍外時畫面整個消失；
// 完全還沒顯示過畫面的話，才直接顯示文字訊息。
function showCameraUnavailable(which, message) {
  const panel = document.getElementById(`camPanel${which}`);
  const body = panel.querySelector('.cam-panel-body');
  panel.style.display = 'block';

  if (body.querySelector('img')) {
    let warn = body.querySelector('.cam-panel-warning');
    if (!warn) {
      warn = document.createElement('div');
      warn.className = 'cam-panel-warning';
      body.prepend(warn);
    }
    warn.textContent = message;
  } else {
    body.textContent = message;
  }
}

map.on('click', (e) => {
  if (allCameras.length === 0) return;
  const result = findNearestCamera(e.latlng);
  if (!result || result.distanceM > MAX_CAMERA_DISTANCE_M) {
    showCameraUnavailable('Pick', '點選位置 50 公里內沒有找到攝影機 (目前資料僅涵蓋台灣國道與省道)');
    return;
  }
  updateCamPanel('Pick', result.cam, result.distanceM, '距離點選位置約');
});

// ---------------- 路況圖層 (道路來自 OpenStreetMap 真實路網，壅塞程度為模擬示範資料) ----------------
const chkTraffic = document.getElementById('chkTraffic');
let trafficEnabled = false;
let trafficFetching = false;
let trafficDebounceTimer = null;

function scheduleTrafficRefresh() {
  clearTimeout(trafficDebounceTimer);
  trafficDebounceTimer = setTimeout(refreshTraffic, 700);
}

function pickCongestionLevel(highwayType) {
  const weights = { motorway: 0.5, trunk: 0.45, primary: 0.35, secondary: 0.25, tertiary: 0.15 };
  const congestionChance = weights[highwayType] ?? 0.2;
  const r = Math.random();
  if (r < congestionChance * 0.5) return { color: '#e53935', weight: 5, label: '壅塞 (模擬)' };
  if (r < congestionChance) return { color: '#fbc02d', weight: 4, label: '車多 (模擬)' };
  return { color: '#43a047', weight: 3, label: '順暢 (模擬)' };
}

async function refreshTraffic() {
  if (!trafficEnabled || trafficFetching) return;

  if (map.getZoom() < 12) {
    layers.traffic.clearLayers();
    setZoomHint('traffic', '🚦 請放大地圖到城市街道等級才會顯示路況');
    return;
  }
  setZoomHint('traffic', null);

  trafficFetching = true;
  try {
    const b = map.getBounds();
    const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
    const query = `[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bbox}););out geom;`;

    const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if (!resp.ok) throw new Error('Overpass 回應碼 ' + resp.status);
    const data = await resp.json();

    layers.traffic.clearLayers();
    for (const way of data.elements) {
      if (!way.geometry) continue;
      const latlngs = way.geometry.map(pt => [pt.lat, pt.lon]);
      const level = pickCongestionLevel(way.tags && way.tags.highway);
      L.polyline(latlngs, { color: level.color, weight: level.weight, opacity: 0.85 })
        .bindPopup(`<b>${(way.tags && way.tags.name) || '未命名道路'}</b><br/>模擬路況: ${level.label}`)
        .addTo(layers.traffic);
    }

    log(`路況圖層更新完成，共 ${data.elements.length} 段道路 (道路為真實路網，壅塞程度為模擬示範資料)`);
  } catch (err) {
    log('路況圖層更新失敗: ' + err.message);
  } finally {
    trafficFetching = false;
  }
}

chkTraffic.addEventListener('change', () => {
  trafficEnabled = chkTraffic.checked;
  if (trafficEnabled) {
    refreshTraffic();
    map.on('moveend', scheduleTrafficRefresh);
    log('已開啟路況圖層');
  } else {
    map.off('moveend', scheduleTrafficRefresh);
    layers.traffic.clearLayers();
    setZoomHint('traffic', null);
    log('已關閉路況圖層');
  }
});

// ---------------- GPS 定位 (像導航裝置一樣顯示自己的位置，並自動找最近的攝影機) ----------------
const btnGps = document.getElementById('btnGps');
const GPS_CAMERA_REFRESH_DISTANCE_M = 300; // 移動超過這個距離才重新找最近攝影機，避免抖動

let watchId = null;
let myLocationMarker = null;
let lastGpsLatLng = null;

function onGpsSuccess(pos) {
  const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
  const accuracy = pos.coords.accuracy;

  if (!myLocationMarker) {
    myLocationMarker = L.marker(latlng, {
      icon: L.divIcon({ className: '', html: '<div class="my-location-dot"></div>', iconSize: [18, 18] })
    }).addTo(map);
    map.setView(latlng, Math.max(map.getZoom(), 13));
  } else {
    myLocationMarker.setLatLng(latlng);
  }

  log(`目前位置: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)} (精準度約 ${Math.round(accuracy)} 公尺)`);

  // 只在「距離上次真正更新過的位置」夠遠時才重新整理，並且只有在真的更新時才推進
  // lastGpsLatLng，否則連續的小幅度GPS飄移永遠不會累積成一次有效的重新整理。
  const moved = lastGpsLatLng ? map.distance(lastGpsLatLng, latlng) : Infinity;

  if (allCameras.length > 0 && moved > GPS_CAMERA_REFRESH_DISTANCE_M) {
    lastGpsLatLng = latlng;
    const result = findNearestCamera(latlng);
    if (result && result.distanceM <= MAX_CAMERA_DISTANCE_M) {
      updateCamPanel('Near', result.cam, result.distanceM, '距離目前位置約');
    } else {
      showCameraUnavailable('Near', '目前位置 50 公里內沒有攝影機資料，畫面保留上次範圍內拍到的');
    }
  }
}

function onGpsError(err) {
  const msgs = {
    1: '您拒絕了定位權限，可以改用手動點地圖查看攝影機',
    2: '目前無法取得定位 (裝置可能沒有GPS或訊號不佳)',
    3: '定位逾時，請再試一次'
  };
  log('定位失敗: ' + (msgs[err.code] || err.message));
  stopGeolocation();
}

function startGeolocation() {
  if (!navigator.geolocation) {
    log('您的瀏覽器不支援定位功能');
    return;
  }
  watchId = navigator.geolocation.watchPosition(onGpsSuccess, onGpsError, {
    enableHighAccuracy: true, maximumAge: 5000, timeout: 15000
  });
  btnGps.textContent = '⏹ 停止定位';
  btnGps.classList.remove('primary');
  btnGps.classList.add('stop');
  log('已開始定位，等待瀏覽器授權... (桌面瀏覽器若無GPS硬體，精準度可能只到城市街廓等級)');
}

function stopGeolocation() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (myLocationMarker) {
    map.removeLayer(myLocationMarker);
    myLocationMarker = null;
  }
  lastGpsLatLng = null;
  btnGps.textContent = '📍 開始定位';
  btnGps.classList.remove('stop');
  btnGps.classList.add('primary');
  closeCamPanel('Near');
}

btnGps.addEventListener('click', () => {
  if (watchId === null) startGeolocation();
  else { stopGeolocation(); log('已停止定位'); }
});

log('初始化完成，請勾選左側要開啟的圖層 (預設全部關閉，不會自動抓取資料)');
