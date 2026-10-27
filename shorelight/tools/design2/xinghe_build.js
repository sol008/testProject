// 彼岸燈 — design pass v2 — 沈星河 build script
// Renders docs/design/v2/xinghe_sheet.png (all 10 options), docs/design/v2/xinghe/opt01..10.png (single cards)
// and writes docs/design/v2/xinghe.md from the option data.   node tools/design2/xinghe_build.js
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'design', 'v2');
const PAGE = 'file://' + path.join(__dirname, 'xinghe.html');

(async () => {
  fs.mkdirSync(path.join(OUT, 'xinghe'), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2472, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(PAGE);
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, 'xinghe_sheet.png'), fullPage: true });
  console.log('wrote docs/design/v2/xinghe_sheet.png');
  const data = await page.evaluate(() => window.XINGHE_DESIGNS.map((d) => ({
    id: d.id, zh: d.zh, en: d.en, tag: d.tag, tagEn: d.tagEn, heads: d.heads, hairNote: d.hairNote, idea: d.idea, culture: d.culture,
    model3d: d.model3d, silNote: d.silNote, faceNote: d.faceNote, palette: d.palette, costume: d.costume, systems: d.systems,
  })).sort((a, b) => a.id.localeCompare(b.id)));
  // single cards (~900 px tall)
  const single = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 1 });
  single.on('pageerror', (e) => console.error('page error:', e.message));
  for (const d of data) {
    await single.goto(PAGE + '?opt=' + d.id);
    await single.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 });
    const el = await single.$('#opt' + d.id);
    await el.screenshot({ path: path.join(OUT, 'xinghe', `opt${d.id}.png`) });
    console.log(`wrote docs/design/v2/xinghe/opt${d.id}.png`);
  }
  await browser.close();

  // ---------------------------------------------------------------- markdown
  const L = [];
  L.push('# 沈星河 Shen Xinghe — 角色設計 v2（10 款提案）', '');
  L.push('> 依 `docs/design/DESIGN_BRIEF_V2.md`（具約束力）與 `docs/STORY_BIBLE.md` 製作。v1 的問題（共用臉模、軟爛剪影、籠統「中式」服裝、無設計說明）在本輪逐條處理：',
    '> 每款都有自己的臉型結構、頭身比與剪影；服裝以清代臺灣閩南勞動男子的實際衣著為底再風格化；每張卡都附剪影檢查（彩色／正面／背面 @ 90 px）與 3D 建模註記。', '');
  L.push('## 檔案', '');
  L.push('- 總表：`docs/design/v2/xinghe_sheet.png`（10 張卡 5×2，最上方為 10 款正面剪影排列）');
  L.push('- 單張卡：`docs/design/v2/xinghe/opt01.png` … `opt10.png`（480×900）');
  L.push('- 原始碼：`tools/design2/xinghe.html`（`?opt=03` 只看單張、`&dpr=2` 高解析）、`xinghe_lib.js`（繪圖工具：貝茲輪廓、賽璐璐陰影、手腳臉部件）、`xinghe_designs_a/a2/a3/b/c.js`（各款）、`xinghe_card.js`（卡片版型＋外輪廓／邊緣光後製）。重新產生：`node tools/design2/xinghe_build.js`', '');
  L.push('## 卡片怎麼讀', '');
  L.push('- 左側尺標＝頭身（每格一個頭高）；全身圖 420 px 高（1x）。主光左上、邊緣光自右側；外輪廓線較內線粗，模擬卡通渲染的描邊。');
  L.push('- 「剪影檢查」＝地圖精靈比例（90 px）：彩色、正面純黑、背面純黑。背面剪影＝正面剪影鏡射＋只在背面看得到的部件（辮子、背劍、斗笠、披風等）。');
  L.push('- 髮型標註「歷史」者採清代男子薙髮留辮；標註「武俠式／奇幻改編」者為刻意的非史實選擇。');
  L.push('- 3D 方向（主管備註）：所有款式以大塊面主形為主，細紋（滾邊、草絲、竹骨、剪紙、刺繡）一律放在貼圖，不做細碎幾何。', '');
  L.push('## 總覽', '');
  L.push('| # | 名稱 | 方向 | 頭身 | 髮型 | 剪影關鍵 |', '|---|---|---|---|---|---|');
  data.forEach((d) => L.push(`| ${d.id} | ${d.zh} ${d.en} | ${d.tag} ${d.tagEn} | ${d.heads} | ${d.hairNote} | ${d.silNote.replace('關鍵剪影：', '')} |`));
  L.push('');
  data.forEach((d) => {
    L.push(`## ${d.id} ${d.zh} — ${d.en}`, '');
    L.push(`![${d.zh}](xinghe/opt${d.id}.png)`, '');
    L.push(`**方向**：${d.tag}（${d.tagEn}）· ${d.heads} 頭身 · ${d.hairNote}`, '');
    L.push(`**設計概念**：${d.idea}`, '');
    L.push(`**臉部**：${d.faceNote}　**剪影**：${d.silNote.replace('關鍵剪影：', '')}`, '');
    L.push('**配色**：', '');
    L.push('| 名稱 | Hex |', '|---|---|');
    d.palette.forEach(([hex, zh, en]) => L.push(`| ${zh} ${en} | \`${hex}\` |`));
    L.push('', '**服裝拆解**：', '');
    d.costume.forEach((c) => L.push(`- ${c}`));
    L.push('', `**文化依據**：${d.culture}`, '');
    L.push(`**3D 建模註記**：${d.model3d}`, '');
    L.push(`**影響的遊戲系統**：${d.systems}`, '');
  });
  L.push('## 共通事項', '');
  L.push('- 故事必要元素全部保留：火屬性（暖色邊緣光／燈火）、劍「螢火」（陳伯所贈，每款都有：布包、插腰、扛肩、出鞘、駐地、背負等不同佩法）、做燈工具或燈籠、紅繩手環（每款都可在手腕／手臂／腳踝找到）。');
  L.push('- 未描繪任何真實神祇或宗教法服；不使用原住民族服飾；無 20 世紀旗袍或日治時期服裝。');
  L.push('- 選定方向後建議：以選定款畫正式三視圖（正／側／背）與表情差分表，再拆出地圖精靈（4 方向 × 走路）與戰鬥精靈（待機、攻擊、技能、受擊、倒地）。可混搭（例：02 的頭巾＋07 的長衫），但請以單一款的剪影為主。');
  fs.writeFileSync(path.join(OUT, 'xinghe.md'), L.join('\n') + '\n');
  console.log('wrote docs/design/v2/xinghe.md');
})();
