# 食光旅行複刻 — 專案說明（給 Claude Code）

在新環境接手時請先讀這份。玩家向的說明在 [README.md](README.md)。

## 專案目標

用 Web 複刻手機遊戲《食光旅行》（Tasty Travels: Merge Game，Century Games，Google Play `com.fatmerge.global`）的玩法。只複刻機制，不使用原版素材（有版權）。

- 線上版：https://tatamochang.github.io/food-travel/
- Repo：https://github.com/TatamoChang/food-travel（公開）
- 部署：push 到 `main`，`.github/workflows/deploy.yml` 跑 `npm test`、`npm run build` 後部署到 GitHub Pages。測試失敗不會部署。

## 已確定的決定（來自使用者）

- 技術：PixiJS 8（WebGL）+ TypeScript + Vite。使用者說的「Web GPL」指 WebGL。
- 平台：手機瀏覽器優先、直向，純前端、本地存檔（localStorage），無後端、無社交、無內購。
- 美術：之後用免費授權（CC0 等）素材包。目前是色塊加文字佔位。
- 語言：與使用者溝通和遊戲文字都用繁體中文。
- 料理：每種 5 階（A 到 E），A+A→B、B+B→C，依此類推，E 為最終型態。
- 訂單：分劇情與隨機。劇情訂單全部湊齊才能進下一關；隨機訂單從已解鎖料理挑，階數隨關卡提高。
- 交付：按「交付」鈕一次交完（全有或全無），棋盤物品不足時按鈕灰掉。兩張訂單搶同一批物品時，交付其中一張後另一張可能變灰。
- 商店：金幣買電力；永久提高電力上限的商品限買 1 次；也有暫時提高上限的商品。
- **新增商品前，先把商品名稱、效果、價格列給使用者確認，再動手改。** 使用者明確要求過這個流程。

## 指令

```bash
npm run dev     # http://localhost:5173（port 固定，被占用會直接報錯）
npm test        # vitest
npm run build   # tsc --noEmit && vite build
```

VS Code 已有 `.vscode/launch.json`（F5 可除錯遊戲與測試）。

在沒有 `gh` 的新環境要操作 GitHub：沒有 sudo 時可從 GitHub releases 下載 gh 執行檔放到 `~/.local/bin`，再 `gh auth login --web`。

## 架構

邏輯與渲染分離。`src/core/` 是純邏輯，不依賴 Pixi，全部有單元測試；`src/render/` 只負責畫面和輸入。

```
src/
  data/            資料驅動的內容，改這裡就能調整遊戲
    chains.json    三種料理、各 5 階、產出器
    story.json     劇情關卡：需求、金幣獎勵、電力獎勵(rewardEnergy)、解鎖料理
    shop.json      商店商品
  core/
    registry.ts    物品查詢、mergeResult()、generatorOutput()
    board.ts       6x8 棋盤：move（移動/交換/合成）、spawnNear、count、take
    energy.ts      電力：回復、spend、add（可超過上限）、setMax
    orders.ts      劇情型別、隨機訂單生成 generateRandomOrder、tierCap
    shop.ts        商品型別與 describeEffect
    game.ts        Game 類別：整合以上並管理狀態；snapshot()/GameState 為存檔格式
    persistence.ts localStorage 存取（key: food_travel_save_v2）
    rng.ts         可設種子的亂數（測試用）
  render/
    layout.ts      虛擬畫面 360x720，會依視窗縮放
    ui.ts          makeText、addButton 共用元件
    GameView.ts    HUD、訂單卡、棋盤、拖曳與點擊
    ShopView.ts    商店覆蓋層
  main.ts          啟動、存檔掛勾（每次動作後、每 10 秒、pagehide）
tests/             registry.test.ts、core.test.ts
```

### 新增內容的方式

- 新料理：在 `chains.json` 加一筆（5 階 + 產出器）；`GameView.ts` 的 `CHAIN_COLORS` 要補顏色；在 `story.json` 某關的 `unlocks` 放入料理 id。
- 新劇情關卡：在 `story.json` 加一筆。需求只能引用「該關之前已解鎖」的料理（測試會檢查）。
- 新商品：在 `shop.json` 加一筆。若是新的效果種類，在 `shop.ts` 的 `ProductEffect` 加型別、`describeEffect` 加文字、`game.ts` 的 `applyEffect` 加處理。

## 目前的數值（暫定，可調）

- 棋盤 6x8。產出器點一次耗 1 電力，產出該料理的 A。
- 電力基本上限 20（`ENERGY_MAX`），每 60 秒回 1（`ENERGY_REGEN_MS`）。
- 隨機訂單：同時 3 張（`RANDOM_ORDER_SLOTS`）；1 到 2 種物品，每種 1 到 2 個；階數範圍 `[cap-1, cap]`，`cap = min(4, 1 + 劇情關卡索引)`；獎勵每個物品 `3 * 2^階數 * 數量`。
- 劇情獎勵金幣 30/60/100/200/500，電力 5/10/10/15/25。
- 商店電力：+5/30 金幣、+20/110、+80/400；永久上限 +5/300、+10/1000；暫時上限 +10/30 分鐘/80、+20/2 小時/200。

## 行為細節與陷阱

- **Pixi 點擊判定**：舞台是 `eventMode = "static"`，子物件會繼承點擊判定，沒有互動屬性的物件（如文字）會吞掉點擊，底下的按鈕或物品就按不到。所以所有文字都必須用 `makeText()`（會設 `eventMode = "none"`）。新增 Text 不要直接 `new Text`。
- **重建畫面與點擊**：`GameView.render()` 會銷毀並重建所有物件，只在玩家動作後呼叫。不要每幀呼叫，否則按下與放開之間按鈕被銷毀，點擊會失效。需要每幀更新的內容（HUD、商店倒數）只改現有 Text 的文字。
- **電力超過上限**：`Energy.add` 允許超過上限；超過時不回復，掉到上限以下才繼續。`Energy.setMax` 會先用舊上限結算，避免滿電很久後提高上限造成一次補滿。
- **暫時上限提升**：`Game.tick()` 會清掉過期效果並更新上限；`GameView` 每幀呼叫，`tap`/`buy` 也會呼叫。效果結束後電力超過新上限不會被扣。
- **存檔相容**：`GameState` 新增欄位時，`Game` 建構子要用 `??` 給預設值，讓舊存檔能讀；格式有破壞性改變才升 `persistence.ts` 的 key 版本。
- 劇情完成後解鎖的產出器放在離左上角最近的空格；棋盤滿時暫存在 `pendingGenerators`，之後有空位再放。
- 合成鏈中 E 階不能再合成。

## 資料來源與未驗證事項

原遊戲資訊只來自商店頁文案與評論（Google Play 頁面抓不到），**沒有實際玩過原遊戲**。已知：500 多種食材、拖曳合成、觀光客任務、金幣解鎖景點、電力與鑽石、限時活動與卡冊、廣告與內購。棋盤大小、合成鏈細節、數值、訂單規則都是自行設計，不是原版數據。

## 尚未做 / 待辦

優先建議由上而下：

1. **實機驗證**：畫面與操作都只在無瀏覽器的環境開發過，沒有實際在手機或瀏覽器看過。接手時先 `npm run dev` 玩一遍，檢查版面、拖曳手感、商店面板。
2. 商店面板沒有捲動，目前 7 個商品剛好放得下，再多會超出 720 高的畫面，需要先做捲動或分頁。
3. 棋盤滿了點產出器沒有任何提示；電力不足時也沒有提示（可導向商店）。
4. 動畫與音效（合成、生成、交付）。
5. 美術：換成 CC0 等免費授權素材，取代色塊與文字。
6. 產出器機制：目前只會產 A；可考慮機率產出較高階、產出器冷卻等。
7. 內容擴充：更多料理、更多劇情關卡、景點場景與解鎖、食譜圖鑑、劇情對話。
8. 原遊戲有而這裡沒有的：鑽石貨幣、卡冊收集、限時活動、每日獎勵、廣告、好友與社交。
9. 重置進度的入口（目前只能手動清 localStorage）。
10. 數值平衡，需要實際遊玩後調整。

## 工作習慣

- 改動邏輯時同步補單元測試（`tests/core.test.ts`），push 前跑 `npm test` 和 `npm run build`。
- `.claude/` 已在 `.gitignore`，不會進 repo；這份 CLAUDE.md 是跨環境接手用的唯一規劃紀錄，進度有變請更新「待辦」與「目前的數值」。
