# God's Eye View - 網頁版

[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) 概念啟發的即時全球追蹤地圖，網頁版，對應 C# 桌面版 (`GodsEyeView/`) 的功能，可部署到 GitHub Pages 讓任何人透過瀏覽器開啟。

## 圖層與資料來源

| 圖層 | 來源 | 是否即時 | 說明 |
|---|---|---|---|
| ✈ 飛機 | [OpenSky Network](https://opensky-network.org) | 約每10分鐘 | 該來源不允許瀏覽器跨網域直接讀取(CORS)，改由 GitHub Actions 排程抓取存成靜態快照 |
| 🚢 船隻 | 前端模擬 | - | 目前沒有免金鑰的全球即時 AIS 來源，用模擬資料示範 |
| 🛰 衛星 | [CelesTrak](https://celestrak.org) TLE + [satellite.js](https://github.com/shashwatak/satellite-js) | 即時運算 | 瀏覽器直接抓 TLE，前端用 SGP4 演算法即時推算位置 |
| 🌍 地震 | [USGS](https://earthquake.usgs.gov) | 即時 | 瀏覽器直接抓取 |
| 🚦 路況 | OpenStreetMap 路網 (Overpass API) | 道路即時／壅塞模擬 | 道路是真實路網，壅塞顏色是模擬示範資料，非真實路況 API |
| 📷 攝影機 | 交通部高速公路局(國道) + 公路局(省道) | 影像即時，清單約每10分鐘更新 | 清單透過 GitHub Actions 排程抓取存成靜態快照；**影像本身**是瀏覽器直接連到政府伺服器的即時 MJPEG 串流，永遠是即時的 |

## 特色功能

- **GPS 定位**：點「開始定位」後，會在地圖上顯示你目前的位置，並自動顯示離你最近的攝影機即時影像
- **點地圖找攝影機**：開啟攝影機圖層後，直接點地圖上任一位置，會顯示離該點最近的攝影機即時影像（50公里內），可以用來查看遠方路況

## 為什麼要有 GitHub Actions

OpenSky 和台灣 CCTV 清單這兩個來源的伺服器沒有開放 CORS，瀏覽器沒辦法從別的網域直接讀取。`.github/workflows/deploy.yml` 會在 GitHub 的伺服器端（不受瀏覽器 CORS 限制）定期執行 `scripts/fetch-planes.mjs` 和 `scripts/fetch-cameras.mjs`，把資料寫成 `public/data/*.json` 靜態檔，再一起部署到 GitHub Pages。前端只會 fetch 同網域的靜態 JSON，完全沒有 CORS 問題。這兩支 script **不會**把資料 commit 進 git 歷史，只存在於當次的 Pages 部署 artifact 裡，避免 repo 越來越肥大。

## 本機測試

```bash
node scripts/fetch-planes.mjs
node scripts/fetch-cameras.mjs
cd public && python -m http.server 8765
# 開瀏覽器 http://127.0.0.1:8765/index.html
```

## 已知限制

- 飛機資料不是真正即時（受限於 GitHub Actions 排程頻率與延遲），畫面上會標示資料時間
- 路況壅塞程度是模擬示範資料，不是真實路況
- 桌面瀏覽器沒有 GPS 硬體時，定位精準度可能只到城市街廓等級
