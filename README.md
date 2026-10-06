# 菜騎鴨 · 蔬果訂單整理

Windows 本機工作介面：逐筆貼上 LINE 訊息，確認後一次整理最多 10 筆訂單。

## 功能

- 貼上自動加入預覽，提供成功提示、內容預覽與刪除。
- GPT-6 Luna 辨識配送地點、商品、數量、加工要求及備註。
- 單筆明細可編輯、新增、刪除；整批備貨清單提供多欄大畫面。
- 日期預設電腦當天，可手動選擇；匯出 Excel 配送明細與備貨總表。
- 確定商品先產出，缺漏另列提醒；載具與收貨交代放備註。

## 本機執行

需要 Windows 10 / 11（64 位元）、Python 3.12。

```powershell
python app.py
```

程式會開啟 http://127.0.0.1:49164/ 。第一次在設定貼上自己的 OpenAI API Key。
金鑰以 Windows DPAPI 加密，存於 `%LOCALAPPDATA%\CaiQiYa\key.dat`，不包含在 repository 或交付壓縮檔中。
訂單保存在瀏覽器本機儲存空間。詳細操作見 [使用說明](使用說明.txt)。

## 測試

Python 測試使用模擬 API，不會消耗 OpenAI 額度。前端驗證需 Node.js 18 以上。

```powershell
python -m unittest test_app -v
node verify-workbench.cjs
```

`ui_test_server.py` 為獨立模擬服務，使用臨時測試金鑰與 http://127.0.0.1:49166/，只供開發驗證。

## 建置 Windows 壓縮檔

```powershell
python -m venv .build-venv
.\.build-venv\Scripts\python.exe -m pip install pyinstaller==6.22.3
.\build.ps1
python verify_package.py
```

產出 `release/菜騎鴨-Windows.zip`。解壓縮後雙擊 `啟動菜騎鴨.exe` 即可，使用者不需安裝 Python。
建置產物、暫存檔、金鑰及畫面截圖不納入版本控制。
