import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseImage = path.join(root, "video", "cover-base.jpg");
const output = path.join(root, "video", "cover.jpg");
const imageData = (await readFile(baseImage)).toString("base64");

await mkdir(path.dirname(output), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

await page.setContent(`
  <!doctype html>
  <html lang="zh-CN">
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 1920px;
        height: 1080px;
        margin: 0;
        overflow: hidden;
        background: #071c26;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      }
      .frame {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      .frame::before {
        position: absolute;
        inset: -3%;
        content: "";
        background-image: url("data:image/jpeg;base64,${imageData}");
        background-size: cover;
        background-position: 57% 43%;
        transform: scale(1.04);
        filter: saturate(1.08) contrast(1.04);
      }
      .shade {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, rgba(1, 18, 25, .96) 0%, rgba(1, 18, 25, .83) 35%, rgba(1, 18, 25, .08) 72%),
          linear-gradient(0deg, rgba(1, 17, 23, .99) 0%, rgba(1, 17, 23, .92) 18%, rgba(1, 17, 23, .45) 40%, rgba(1, 17, 23, 0) 66%);
      }
      .grid {
        position: absolute;
        inset: 0;
        opacity: .13;
        background-image:
          linear-gradient(rgba(112, 238, 221, .28) 1px, transparent 1px),
          linear-gradient(90deg, rgba(112, 238, 221, .28) 1px, transparent 1px);
        background-size: 72px 72px;
        mask-image: linear-gradient(90deg, black, transparent 72%);
      }
      .copy {
        position: absolute;
        left: 92px;
        top: 104px;
        width: 970px;
        color: #f5fffd;
      }
      .kicker {
        display: inline-flex;
        align-items: center;
        gap: 13px;
        padding: 10px 17px;
        border: 1px solid rgba(112, 238, 221, .55);
        color: #70eedd;
        background: rgba(3, 24, 31, .72);
        font: 800 20px "Bahnschrift", "Microsoft YaHei", sans-serif;
        letter-spacing: .15em;
      }
      .kicker::before {
        width: 8px;
        height: 8px;
        content: "";
        background: #70eedd;
        box-shadow: 0 0 18px #70eedd;
      }
      h1 {
        margin: 30px 0 12px;
        font-size: 104px;
        line-height: 1.03;
        letter-spacing: .035em;
        text-shadow: 0 12px 36px rgba(0, 8, 12, .55);
      }
      h1 span {
        display: block;
        color: #70eedd;
      }
      .subtitle {
        width: 830px;
        margin: 19px 0 0;
        color: rgba(233, 250, 247, .86);
        font-size: 35px;
        font-weight: 800;
        line-height: 1.4;
      }
      .chips {
        display: flex;
        gap: 12px;
        margin-top: 30px;
      }
      .chip {
        padding: 10px 16px;
        border-left: 3px solid #ffb77d;
        color: #f7fffd;
        background: rgba(5, 31, 39, .76);
        font-size: 21px;
        font-weight: 700;
        letter-spacing: .04em;
      }
      .url {
        position: absolute;
        right: 58px;
        bottom: 48px;
        padding: 13px 19px;
        color: #ffd36f;
        background: rgba(2, 20, 27, .82);
        font: 700 24px "Bahnschrift", sans-serif;
        letter-spacing: .04em;
      }
      .badge {
        position: absolute;
        right: 58px;
        top: 55px;
        padding: 11px 17px;
        color: #071c26;
        background: #70eedd;
        font: 900 22px "Microsoft YaHei", sans-serif;
        letter-spacing: .05em;
        transform: skewX(-8deg);
      }
    </style>
  </html>
  <body>
    <div class="frame">
      <div class="shade"></div>
      <div class="grid"></div>
      <div class="copy">
        <div class="kicker">DEEPSEEK-V4.1-FLASH × ENDFIELD</div>
        <h1>佩丽卡<span>骑行武陵城</span></h1>
        <p class="subtitle">全城 3D 实机演示 · 方兴衢骑行计划</p>
        <div class="chips">
          <span class="chip">自动巡航</span>
          <span class="chip">停车换脚</span>
          <span class="chip">低速倒车</span>
          <span class="chip">程序化武陵</span>
        </div>
      </div>
      <div class="badge">DeepSeek-v4.1-flash 生成</div>
      <div class="url">susieglitter.github.io/perlica</div>
    </div>
  </body>
  </html>
`);

await page.screenshot({
  path: output,
  type: "jpeg",
  quality: 94,
});
await browser.close();
console.log(output);
