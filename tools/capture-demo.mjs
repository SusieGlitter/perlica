import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.WULING_URL ?? "http://127.0.0.1:4173";
const outputDir = path.join(root, ".cache", "video", "capture");
const rawOutput = path.join(outputDir, "wuling-perlica-demo.webm");
const notesOutput = path.join(outputDir, "capture.json");
const ffprobe = process.env.FFPROBE_PATH
  ?? path.join(root, ".cache", "tools", "ffmpeg", "bin", "ffprobe.exe");
const leadSeconds = 0.8;
const gapSeconds = 1;

const manifest = JSON.parse(
  await readFile(path.join(root, "video", "narration.json"), "utf8"),
);

async function audioDuration(segment) {
  const audioPath = path.join(root, "video", "audio", `${segment.id}.wav`);
  const { stdout } = await execFileAsync(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    audioPath,
  ]);
  return Number.parseFloat(stdout.trim());
}

const segments = await Promise.all(
  manifest.segments.map(async (segment) => ({
    ...segment,
    duration: await audioDuration(segment),
  })),
);
const scenes = segments.map((segment, index) => ({
  ...segment,
  duration: segment.duration + gapSeconds + (index === 0 ? leadSeconds : 0),
}));
const timelineDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
const sceneStarts = [];
let cursor = 0;
for (const scene of scenes) {
  sceneStarts.push(cursor);
  cursor += scene.duration;
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: outputDir,
    size: { width: 1440, height: 900 },
  },
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);

const runtimeErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});
page.on("pageerror", (error) => runtimeErrors.push(error.message));

const captureStartedAt = performance.now();
const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
assert.equal(response?.status(), 200, "demo page must return HTTP 200");
await page.waitForFunction(() => window.__WULING_DEBUG__?.rider, null, {
  timeout: 60_000,
});
await page.locator("#start-ride").evaluate((button) => button.click());

await page.evaluate(() => {
  const style = document.createElement("style");
  style.textContent = `
    #demo-overlay {
      position: fixed;
      z-index: 80;
      top: 94px;
      left: 50%;
      width: min(610px, calc(100vw - 520px));
      min-width: 420px;
      padding: 15px 20px 16px 23px;
      border-left: 3px solid #70eedd;
      color: #f3fffd;
      background: linear-gradient(90deg, rgba(4, 24, 31, 0.88), rgba(4, 24, 31, 0.58));
      box-shadow: 0 18px 45px rgba(0, 12, 17, 0.28);
      clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
      transform: translate(-50%, -8px);
      opacity: 0;
      pointer-events: none;
      backdrop-filter: blur(12px);
      transition: opacity 220ms ease, transform 220ms ease;
    }
    #demo-overlay.show {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    #demo-overlay[data-style="title"] {
      top: 50%;
      width: min(720px, calc(100vw - 220px));
      padding: 25px 31px 28px;
      border-left-width: 5px;
      text-align: center;
      transform: translate(-50%, calc(-50% + 10px));
      background: linear-gradient(135deg, rgba(4, 24, 31, 0.92), rgba(6, 42, 49, 0.68));
    }
    #demo-overlay[data-style="title"].show {
      transform: translate(-50%, -50%);
    }
    #demo-overlay .demo-index {
      display: block;
      margin-bottom: 5px;
      color: #70eedd;
      font-family: "Bahnschrift", "Arial Narrow", sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2em;
    }
    #demo-overlay strong {
      display: block;
      font-size: 24px;
      line-height: 1.25;
      letter-spacing: 0.04em;
    }
    #demo-overlay[data-style="title"] strong {
      font-size: 46px;
      letter-spacing: 0.08em;
    }
    #demo-overlay p {
      margin: 6px 0 0;
      color: rgba(231, 250, 247, 0.72);
      font-size: 13px;
      letter-spacing: 0.05em;
    }
    #demo-overlay[data-style="title"] p {
      margin-top: 12px;
      font-size: 15px;
      letter-spacing: 0.1em;
    }
    #demo-overlay .demo-credit {
      color: #ffb77d;
      font-family: "Bahnschrift", "Arial Narrow", sans-serif;
      letter-spacing: 0.13em;
    }
    @media (max-width: 760px) {
      #demo-overlay {
        top: 132px;
        width: calc(100vw - 36px);
        min-width: 0;
        padding: 12px 14px 13px 17px;
      }
      #demo-overlay strong,
      #demo-overlay[data-style="title"] strong {
        font-size: 28px;
      }
      #demo-overlay p,
      #demo-overlay[data-style="title"] p {
        font-size: 11px;
      }
    }
  `;
  document.head.appendChild(style);
  const overlay = document.createElement("div");
  overlay.id = "demo-overlay";
  overlay.innerHTML = `
    <span class="demo-index"></span>
    <strong></strong>
    <p></p>
  `;
  document.body.appendChild(overlay);
});

async function setOverlay(index, style, title, subtitle) {
  await page.locator("#demo-overlay").evaluate(
    (overlay, value) => {
      overlay.classList.remove("show");
      overlay.dataset.style = value.style;
      overlay.querySelector(".demo-index").textContent =
        `${String(value.index + 1).padStart(2, "0")} / WULING RIDE`;
      overlay.querySelector("strong").textContent = value.title;
      overlay.querySelector("p").innerHTML = value.subtitle;
      requestAnimationFrame(() => overlay.classList.add("show"));
    },
    { index, style, title, subtitle },
  );
}

async function evaluate(action, argument) {
  await page.evaluate(action, argument);
}

async function waitForTimestamp(timestamp) {
  const remaining = timestamp - performance.now();
  if (remaining > 0) await page.waitForTimeout(remaining);
}

async function resetFreeRide(routeT) {
  await evaluate((value) => {
    const debug = window.__WULING_DEBUG__;
    debug.setRideMode("auto");
    debug.setRouteT(value);
    debug.setRideMode("free");
    debug.keys.clear();
  }, routeT);
}

const sceneRunners = [
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.018);
      debug.setCamera("chase");
      debug.setCameraOffset(0.1, 0);
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.205);
      debug.setCamera("cinema");
      debug.setCameraOffset(0.8, 0.35);
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.31);
      debug.setCamera("chase");
      debug.setCameraOffset(-0.45, 0.1);
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await resetFreeRide(0.43);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.speed = 7.8;
      debug.keys.add("KeyW");
      debug.setCamera("chase");
    });
    await waitForTimestamp(sceneStart + duration * 0.2);
    await evaluate(() => window.__WULING_DEBUG__.keys.add("KeyA"));
    await waitForTimestamp(sceneStart + duration * 0.42);
    await evaluate(() => {
      window.__WULING_DEBUG__.keys.delete("KeyA");
      window.__WULING_DEBUG__.keys.add("KeyD");
    });
    await waitForTimestamp(sceneStart + duration * 0.68);
    await page.evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.keys.delete("KeyA");
      debug.keys.delete("KeyD");
      debug.keys.add("KeyW");
    });
    await waitForTimestamp(sceneStart + duration);
    await evaluate(() => window.__WULING_DEBUG__.keys.clear());
  },
  async (sceneStart, duration) => {
    await resetFreeRide(0.58);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.speed = 9.2;
      debug.keys.add("KeyW");
      debug.setCamera("low");
      debug.setCameraOffset(-0.2, 0.15);
    });
    await waitForTimestamp(sceneStart + duration * 0.14);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.keys.delete("KeyW");
      debug.keys.add("Space");
    });
    await waitForTimestamp(sceneStart + duration * 0.48);
    await evaluate(() => window.__WULING_DEBUG__.keys.delete("Space"));
    await waitForTimestamp(sceneStart + duration * 0.7);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.supportTarget = -1;
      debug.freeRide.supportTransition = 0.58;
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await resetFreeRide(0.72);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.speed = 0;
      debug.keys.add("KeyS");
      debug.setCamera("low");
      debug.setCameraOffset(-0.55, 0.2);
    });
    await waitForTimestamp(sceneStart + duration * 0.84);
    await evaluate(() => window.__WULING_DEBUG__.keys.clear());
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.84);
      debug.setCamera("low");
      debug.setCameraOffset(-1.05, 0.15);
    });
    await waitForTimestamp(sceneStart + duration * 0.55);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setCamera("chase");
      debug.setCameraOffset(1.15, 0.05);
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.82);
      debug.setCamera("low");
      debug.setCameraOffset(-1.05, 0.15);
      debug.bicycle.ringBell();
    });
    await waitForTimestamp(sceneStart + duration * 0.5);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setCamera("chase");
      debug.setCameraOffset(0.8, 0.1);
      debug.bicycle.ringBell();
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.06);
      debug.setCamera("chase");
      debug.setCameraOffset(0.65, 0.15);
    });
    await waitForTimestamp(sceneStart + duration * 0.55);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRouteT(0.2);
      debug.setCamera("chase");
      debug.setCameraOffset(-0.7, 0.15);
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.82);
      debug.setCamera("low");
      debug.setCameraOffset(-1.05, 0.15);
    });
    await waitForTimestamp(sceneStart + duration * 0.6);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setCamera("chase");
      debug.setCameraOffset(0.8, 0.1);
    });
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.025);
      debug.setCamera("chase");
      debug.setCameraOffset(0.15, 0);
    });
    await waitForTimestamp(sceneStart + duration);
  },
];

const sceneCopy = [
  {
    style: "title",
    title: "风起武陵",
    subtitle: "佩丽卡骑行计划 · 方兴衢宣传片<br><span class=\"demo-credit\">AI 声音复刻演示</span>",
  },
  {
    style: "caption",
    title: "武陵 · 方兴衢",
    subtitle: "三纵四横道路网 · 实时位置与朝向北侧小地图",
  },
  {
    style: "caption",
    title: "自动巡航",
    subtitle: "视线预判 + PID 循迹 · 平滑过弯",
  },
  {
    style: "caption",
    title: "自由操控",
    subtitle: "WASD / 方向键接管 · A、D 连续转向",
  },
  {
    style: "caption",
    title: "制动与停车",
    subtitle: "重心决定支撑脚 · 双脚过渡后稳定驻车",
  },
  {
    style: "caption",
    title: "低速倒车",
    subtitle: "S 键倒车 · 单脚贴地辅助平衡",
  },
  {
    style: "caption",
    title: "同步传动",
    subtitle: "46T 牙盘 / 18T 飞轮 · 曲柄与车轮严格联动",
  },
  {
    style: "caption",
    title: "城市车细节",
    subtitle: "低跨车架 · 车筐 · 活动车牌 · 碟刹 · 车铃",
  },
  {
    style: "caption",
    title: "程序化武陵",
    subtitle: "道路、城墙、商铺、河道、树木与能源装置",
  },
  {
    style: "caption",
    title: "制作流程",
    subtitle: "Playwright 分镜 · Three.js · PID · 骨骼 IK · QwenTTS · FFmpeg",
  },
  {
    style: "title",
    title: "沿方兴衢，驭风而行",
    subtitle: "把武陵的晨雾，骑成下一程晴空<br><span class=\"demo-credit\">武陵骑行活动，等你出发</span>",
  },
];

const timelineStartedAt = performance.now();
for (let index = 0; index < scenes.length; index++) {
  const scene = scenes[index];
  const sceneStart = timelineStartedAt + sceneStarts[index] * 1000;
  const copy = sceneCopy[index];
  await setOverlay(index, copy.style, copy.title, copy.subtitle);
  await sceneRunners[index](sceneStart, scene.duration * 1000);
}

await page.waitForTimeout(500);
const setupSeconds = (timelineStartedAt - captureStartedAt) / 1000;
await context.close();
const recordedPath = await page.video().path();
await browser.close();

await writeFile(
  notesOutput,
  JSON.stringify(
    {
      baseUrl,
      recordedPath,
      rawOutput,
      setupSeconds,
      timelineDuration,
      leadSeconds,
      gapSeconds,
      scenes: scenes.map((scene, index) => ({
        index: index + 1,
        id: scene.id,
        audioDuration: scene.duration
          - gapSeconds
          - (index === 0 ? leadSeconds : 0),
        sceneDuration: scene.duration,
        title: sceneCopy[index].title,
      })),
      runtimeErrors,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(JSON.stringify({
  recordedPath,
  notesOutput,
  setupSeconds,
  timelineDuration,
  sceneCount: scenes.length,
  runtimeErrors,
}, null, 2));
