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
- 美術：自繪漫畫風 SVG 圖示，使用者已確認畫風：粗黑描邊、平塗加一層硬陰影、白色高光、**透明底只留食物**、E 階與特製料理加閃光星。新物品要照同一套規則畫（`scripts/gen-icons.mjs`）。
- 語言：與使用者溝通和遊戲文字都用繁體中文。
- 料理：每種 5 階（A 到 E），A+A→B、B+B→C，依此類推，E 為最終型態。
- 訂單：分劇情與隨機。劇情訂單全部湊齊才能進下一關；隨機訂單從已解鎖料理挑，階數隨關卡提高。
- 交付：按「交付」鈕一次交完（全有或全無），棋盤物品不足時按鈕灰掉。兩張訂單搶同一批物品時，交付其中一張後另一張可能變灰。
- 商店：金幣買電力；永久提高電力上限的商品有購買次數上限（大容量電池 +5 可買 4 次、超級電池 +10 可買 3 次，加上基本 50，全買滿上限 100）；也有暫時提高上限的商品。
- **新增商品前，先把商品名稱、效果、價格列給使用者確認，再動手改。** 使用者明確要求過這個流程。
- 頂排：料理台 5 格（放料理產出器）＋調味區 1 格（放調味產出器，不上鎖）。料理台第 2、3 格在第 1、11 關過關時開放，第 4 格由任務「壽司船長」（製作 5 個豪華壽司船）開放，第 5 格為商店商品「料理台第 5 格」🪙3000（限 1 次、需先完成該任務）。
- 劇情共 30 關，每 9 個普通關接 1 個 Boss 關（第 10、20、30 關），Boss 關給 1 個食譜碎片。
- 合成掉落：合成出 C 以上的料理有機率在旁邊掉 1 等金幣，合成出 B 以上的料理有機率掉 1 等電力（電力機率較低）；兩種都分 3 等、兩個同等合成升一等，點一下領取。每過一個 Boss 關兩種機率各 +5%。棋盤沒空格就不掉落。
- 食譜：日常食譜（合成路線＋調味料理）隨過關解鎖、可查詢；特別食譜分綠（任務解鎖，5 個）、橘（1 個高等任務、1 個商店 🪙800，共 2 個）、紅（3 個 Boss 碎片組合，1 個）。任務有「製作指定料理 N 個」（棋盤合成）和「累計交付隨機訂單 N 張」兩種。

## 指令

```bash
npm run dev     # http://localhost:5173（port 固定，被占用會直接報錯）
npm test        # vitest
npm run build   # tsc --noEmit && vite build
npm run icons   # 由 scripts/gen-icons.mjs 重新產生 src/assets/icons/*.svg
```

VS Code 已有 `.vscode/launch.json`（F5 可除錯遊戲與測試）。

在沒有 `gh` 的新環境要操作 GitHub：沒有 sudo 時可從 GitHub releases 下載 gh 執行檔放到 `~/.local/bin`，再 `gh auth login --web`。

## 架構

邏輯與渲染分離。`src/core/` 是純邏輯，不依賴 Pixi，全部有單元測試；`src/render/` 只負責畫面和輸入。

```
src/
  data/            資料驅動的內容，改這裡就能調整遊戲
    chains.json    chains：三種料理、各 5 階、產出器；seasonings：鹽、香料，各 3 等、產出器；rewards：金幣、電力掉落物各 3 等與面額
    recipes.json   配方（調味料 + 料理 → 特製料理），tier: daily/green/orange/red
    tasks.json     任務（解鎖綠/橘食譜）、碎片食譜與所需碎片數
    story.json     30 關：需求、金幣、電力(rewardEnergy)、解鎖(料理或調味料 id)、boss、rewardShard、opensPrepSlot
    shop.json      商店商品（requires = 需先購買的商品 id）
  assets/icons/    每個物品一個 SVG，檔名 = 物品 id（由 scripts/gen-icons.mjs 產生，勿手改）
  core/
    registry.ts    物品查詢、mergeResult()（含配方）、generatorOutput()、itemLabel()、stationOf()、rewardValue()
    types.ts       資料型別、ItemInfo（kind: stage/generator/special；category: dish/seasoning/reward）
    board.ts       6x7 一般格：move（移動/交換/合成）、spawnNear、count、take
    energy.ts      電力：回復、spend、add（可超過上限）、setMax
    orders.ts      劇情型別、隨機訂單生成 generateRandomOrder（含特製料理）、tierCap、itemReward、TIER_REWARD_MULT
    tasks.ts       任務型別、taskProgress、SHARD_RECIPE
    shop.ts        商品型別與 describeEffect、STATION_NAMES
    game.ts        Game 類別：整合以上並管理狀態，含料理台/調味區(stations)、倉庫(warehouse)、
                   食譜解鎖、任務計數(made/randomDelivered)、碎片、提示訊息(notices)、舊存檔遷移；
                   snapshot()/GameState 為存檔格式，SavedState 為可讀入的舊格式
    persistence.ts localStorage 存取（key: food_travel_save_v2）
    rng.ts         可設種子的亂數（測試用）
  render/
    layout.ts      虛擬畫面 360x720，會依視窗縮放
    ui.ts          makeText、addButton 共用元件
    icons.ts       載入 SVG 圖示（光柵化成 192px 貼圖）、iconSprite()
    GameView.ts    HUD、訂單卡、最上排兩區、棋盤、拖曳與點擊
    Panel.ts       ScrollPanel：覆蓋層共用框架（標題、可拖曳/滾輪捲動的清單、關閉鈕）
    ShopView.ts    商店覆蓋層
    WarehouseView.ts 倉庫覆蓋層（收回、放入）
    RecipeView.ts  食譜覆蓋層（日常／特別兩頁）
scripts/gen-icons.mjs  圖示產生器（共用 cel()、hl()、sparkle() 等規則）
  main.ts          啟動、存檔掛勾（每次動作後、每 10 秒、pagehide）
tests/             registry.test.ts、core.test.ts
```

### 新增內容的方式

- **每個新物品都要在 `scripts/gen-icons.mjs` 加圖示**並跑 `npm run icons`；沒有圖示時會退回色塊加名稱。
- 新料理：在 `chains.json` 的 `chains` 加一筆（5 階 + 產出器）；`GameView.ts` 的 `CHAIN_COLORS` 要補顏色；在 `story.json` 某關的 `unlocks` 放入料理 id。
- 新調味料：在 `chains.json` 的 `seasonings` 加一筆（3 等 + 產出器，產出器自動歸香料架）；補 `CHAIN_COLORS`；在 `story.json` 解鎖。
- 新特製料理：在 `recipes.json` 加一筆（tier、調味料 id、料理 id、結果 id 與名稱），同一組調味料＋料理只能有一個配方（測試會檢查）。隨機訂單會自動納入。
- 新特別食譜的取得方式：任務 → `tasks.json` 加一筆（`rewardRecipe`）；商店 → `shop.json` 加 `unlockRecipe` 商品（先給使用者確認）；碎片 → `tasks.json` 的 `shardRecipe`。食譜頁會自動顯示取得方式。
- 新劇情關卡：在 `story.json` 加一筆。需求只能引用「該關之前已解鎖」的料理（測試會檢查）。
- 新商品：在 `shop.json` 加一筆（`once: true` 限買 1 次，`limit: N` 限買 N 次，兩者都沒有則不限；購買紀錄 `purchased` 每買一次記一筆）。若是新的效果種類，在 `shop.ts` 的 `ProductEffect` 加型別、`describeEffect` 加文字、`game.ts` 的 `applyEffect` 加處理。

## 目前的數值（暫定，可調）

- 畫面 6x8：最上排為料理台（左 5）與調味區（右 1）（`STATION_SLOTS`）；一般格 6x7。料理台開局 1 格，開放來源依序列在 `PREP_SLOT_SOURCES`：`story.json` 中 `opensPrepSlot` 的關卡（1、11）、`tasks.json` 中 `rewardPrepSlot` 的任務、`openPrepSlot` 商品。`Game.slotsOpen` 由進度推算（不存檔），鎖住的格子依序顯示「尚未達成」的來源（`lockedSlotSource`）。產出器點一次耗 1 電力，產出該鏈第 1 階，放在同欄下方最近的空格。
- 劇情第 2 關完成解鎖鹽罐，第 3 關完成解鎖香料罐。
- 合成掉落（`game.ts`）：結果為料理（含特製料理）且階數 ≥ C（`COIN_DROP_MIN_STAGE`）時 10%（`COIN_DROP_CHANCE`）掉 `coin_1`；階數 ≥ B（`ENERGY_DROP_MIN_STAGE`）時 5%（`ENERGY_DROP_CHANCE`）掉 `energy_1`；兩者獨立擲骰、可同時掉。每過一個 Boss 關各 +5 個百分點（`DROP_BOSS_BONUS`，`bossesCleared`），3 個 Boss 後為 25%／20%。金幣 1/2/3 等 = 10/25/60，電力 1/2/3 等 = 2/5/12（`chains.json` 的 `values`）。
- 電力基本上限 50（`ENERGY_MAX`），新遊戲開局電力也是 50；每 60 秒回 1（`ENERGY_REGEN_MS`）。
- 隨機訂單：同時 3 張（`RANDOM_ORDER_SLOTS`）；1 到 2 種物品，每種 1 到 2 個；階數範圍 `[cap-1, cap]`，`cap = min(4, 1 + 劇情關卡索引)`；獎勵每個物品 `3 * 2^階數 * 數量`。
- 特製料理訂單：每行 30% 機率（`SPECIAL_ORDER_CHANCE`）改為特製料理，只挑料理鏈與調味料鏈都已解鎖、料理階數 ≤ cap、且食譜可用的（日常：劇情索引 ≥ 2 `SPECIAL_ORDER_FROM_STAGE`；特別：已解鎖）；獎勵 `round(3 * 2^料理階數 * 倍數)`，倍數 daily 1.5／綠 2／橘 3／紅 5（`TIER_REWARD_MULT`）。
- 劇情 30 關：金幣 30→3000、電力 5→40（詳見 `story.json`）；Boss 第 10/20/30 關 800/1500/3000 金幣＋1 碎片。第 11 關起要求日常特製料理。
- 任務：飯糰 5 個、交付 10 張、酥皮麵團 5 個、綜合香料 3 個、交付 30 張（綠）；瑪格麗特披薩 3 個（橘）；豪華壽司船 5 個（料理台第 4 格）。碎片 3 個合成紅色食譜。任務完成記在 `doneTasks`，獎勵只給一次。
- 商店電力：+5/30 金幣、+20/110、+80/400；永久上限 +5/300 限 4 次、+10/1000 限 3 次（`limit`，全買滿上限 100）；暫時上限 +10/30 分鐘/80、+20/2 小時/200；黃金可頌塔食譜 800（限 1 次）；料理台第 5 格 3000（限 1 次，需先完成任務「壽司船長」，`requiresTask`）。

## 行為細節與陷阱

- **Pixi 點擊判定**：舞台是 `eventMode = "static"`，子物件會繼承點擊判定，沒有互動屬性的物件（如文字）會吞掉點擊，底下的按鈕或物品就按不到。所以所有文字都必須用 `makeText()`（會設 `eventMode = "none"`）。新增 Text 不要直接 `new Text`。
- **重建畫面與點擊**：`GameView.render()` 會銷毀並重建所有物件，只在玩家動作後呼叫。不要每幀呼叫，否則按下與放開之間按鈕被銷毀，點擊會失效。需要每幀更新的內容（HUD、商店倒數）只改現有 Text 的文字。
- **電力超過上限**：`Energy.add` 允許超過上限；超過時不回復，掉到上限以下才繼續。`Energy.setMax` 會先用舊上限結算，避免滿電很久後提高上限造成一次補滿。
- **暫時上限提升**：`Game.tick()` 會清掉過期效果並更新上限；`GameView` 每幀呼叫，`tap`/`buy` 也會呼叫。效果結束後電力超過新上限不會被扣。
- **存檔相容**：`GameState` 新增欄位時，`Game` 建構子要用 `??` 給預設值，讓舊存檔能讀；格式有破壞性改變才升 `persistence.ts` 的 key 版本。
- 解鎖的產出器放進所屬區的第一個開放空格，沒空位就進倉庫（會有提示）。`completeStage` 先把 `stageIndex` 加一再解鎖，這樣同一關開放的格子能直接放入該關解鎖的產出器。
- 特別食譜未解鎖時 `mergeResult` 回傳 null（拖過去會交換）；`Board.move`/`mergeResult` 預設只允許日常食譜，`Game.move` 傳入已解鎖清單。任務的「製作」次數只在 `Game.move` 合成時累計。
- `Game.notices` 是給玩家的提示佇列（解鎖食譜、產出器進倉庫、開放格子、碎片），`GameView` 逐則顯示 2.5 秒並移除；不存檔。畫面層的提示（點產出器時棋盤滿、電力不足）由 `GameView.explainTap` 依 `TapResult` 產生，用 `notify()` 排隊：同一個 key 已在顯示或排隊時不重複加入。可帶按鈕的提示（電力不足的「🛒 買電力」開商店）顯示 4 秒，只有帶按鈕的提示會接收點擊。
- 存檔裡的台子內容若超出目前格數（例如舊開發版 3+3 格），多的產出器移進倉庫。產出器只存在於台上或倉庫，一般格子不會有產出器。
- 最上排不是拖放目標；台上的產出器用 `pointertap` 觸發，不走拖曳流程。
- 掉落物放在合成結果旁最近的空格；合成會空出被拖走的那格，所以棋盤原本全滿時仍可能掉 1 個。點一下（沒拖動）棋盤上的掉落物由 `Game.collect` 領取，電力領取可超過上限。
- 合成鏈中 E 階、調味料 3 等、掉落物 3 等、特製料理都不能再合成。配方兩個物品順序無關，結果放在被拖到的格子。
- **舊存檔遷移**（`Game` 建構子，判斷 `board.length === 48`）：舊 6x8 棋盤的最上排拿掉，其餘 42 格成為一般格；所有產出器（最上排、棋盤上、`pendingGenerators`）搬到台上，放不下的進倉庫；最上排的一般物品放到離左上最近的空格，棋盤滿就進倉庫。另外 `catchUpUnlocks()` 會補發「已通過關卡」的解鎖，所以在 `story.json` 給舊關卡加解鎖也會補給舊存檔。存檔 key 維持 `food_travel_save_v2`。
- 覆蓋層（`ScrollPanel`）捲動拖曳後放開不會觸發按鈕；新的按下會清掉這個狀態。清單用遮罩裁切。

## 資料來源與未驗證事項

原遊戲資訊只來自商店頁文案與評論（Google Play 頁面抓不到），**沒有實際玩過原遊戲**。已知：500 多種食材、拖曳合成、觀光客任務、金幣解鎖景點、電力與鑽石、限時活動與卡冊、廣告與內購。棋盤大小、合成鏈細節、數值、訂單規則都是自行設計，不是原版數據。

## 已完成

- 料理台、調味區、倉庫、調味料與日常特製料理（舊存檔遷移時棋盤放不下的一般物品暫存倉庫，倉庫面板可「放入」棋盤）。
- 漫畫風 SVG 圖示（46 個）。
- 合成掉落金幣／電力（3 等、可合成、點擊領取，Boss 後機率提升）。
- 食譜本（日常／特別）、任務、30 關含 3 個 Boss 關、碎片。
- 點產出器時棋盤滿／電力不足的提示（電力不足可直接開商店）。

## 尚未做 / 待辦

優先建議由上而下：

1. **實機驗證**：已用 Playwright（headless Chromium，360x720）截圖並模擬拖曳、點擊、商店捲動與購買、倉庫放入，畫面正常、無錯誤；但還沒在真的手機上試過觸控手感。
2. 調味料目前不會單獨出現在訂單；特製料理的數值與 30% 出現率需實際遊玩後調整。
3. 動畫與音效（合成、生成、交付）。
4. 美術：物品與產出器已有圖示；按鈕、背景、訂單卡等 UI 仍是色塊。
5. 產出器機制：目前只會產 A；可考慮機率產出較高階、產出器冷卻等。
6. 內容擴充：更多料理、更多劇情關卡、景點場景與解鎖、劇情對話。
7. 原遊戲有而這裡沒有的：鑽石貨幣、卡冊收集、限時活動、每日獎勵、廣告、好友與社交。
8. 重置進度的入口（目前只能手動清 localStorage）。
9. 數值平衡，需要實際遊玩後調整。

## 工作習慣

- 改動邏輯時同步補單元測試（`tests/core.test.ts`），push 前跑 `npm test` 和 `npm run build`。
- `.claude/` 已在 `.gitignore`，不會進 repo；這份 CLAUDE.md 是跨環境接手用的唯一規劃紀錄，進度有變請更新「待辦」與「目前的數值」。
