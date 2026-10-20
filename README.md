# Soniq

Soniq 是以 Electron、React 與 TypeScript 製作的桌面音樂播放器，提供繁體中文介面、無帳號使用、歌詞、個人聆聽紀錄推薦、播放清單匯入及可選的 Discord 聆聽狀態。

## 用途與來源

**本專案僅供個人、非商業、非營利使用；沒有任何商業用途。

## 本機開發

需求：Node.js 22、pnpm 11，以及 Windows 10/11（Windows 安裝檔建置）。

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm test
```

## Windows 建置

```powershell
pnpm run electron:build:win
```

產物位於 `release/`：

- `Soniq-Setup-<version>.exe`：NSIS 安裝檔，可透過 GitHub Releases 檢查、下載及安裝後續版本。
- `latest.yml` 與 `.exe.blockmap`：更新器需要的中繼資料；發佈時必須和安裝檔一同上傳。
- `win-unpacked/soniq.exe`：免安裝資料夾內的執行檔；**必須保留整個 `win-unpacked` 資料夾**。免安裝版不會原地覆蓋更新，建議使用安裝版取得自動更新。

## 電腦與 iPhone 搬移資料

兩台裝置都開啟「設定 → 儲存空間 → 在裝置之間搬移資料」。在來源裝置匯出 JSON 備份，透過 AirDrop、檔案、雲端硬碟或 USB 傳到另一台，再於目標裝置匯入。這是手動搬移，不會刪除來源資料；匯入會合併喜歡、收藏、播放清單、播放紀錄、推薦和搜尋紀錄，並補上目標裝置尚未設定的偏好。匯入前會顯示合併後的數量，確認後才寫入。音樂檔與暫存快取不在備份中。

## 更新流程

安裝版啟動後會檢查 [Soniq GitHub Releases](https://github.com/don12335/Soniq/releases) 的最新正式版本；也能在「設定 → 關於 → 檢查更新」手動檢查。有新版時由使用者決定是否下載及安裝。發佈時版本號、Git tag 與安裝檔名稱必須一致，例如 `0.1.41` 對應 `v0.1.41`。推送 tag 後，`.github/workflows/release.yml` 會建置 Windows 安裝檔、更新中繼資料與免安裝 ZIP，然後建立 GitHub Release。


