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
const useGpuCapture = process.env.WULING_GPU_CAPTURE !== "0";
const gpuArgs = process.platform === "win32"
  ? [
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--use-angle=d3d11",
      "--enable-webgl",
      "--disable-software-rasterizer",
    ]
  : [
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=gl",
      "--enable-webgl",
      "--disable-software-rasterizer",
    ];

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

const browser = await chromium.launch({
  headless: true,
  args: useGpuCapture ? gpuArgs : [],
});
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

const rendererInfo = await page.evaluate(() => {
  const gl = document.querySelector("#scene").getContext("webgl2")
    ?? document.querySelector("#scene").getContext("webgl");
  const extension = gl?.getExtension("WEBGL_debug_renderer_info");
  return {
    vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
    renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
  };
});
assert.ok(
  !/swiftshader|software/i.test(`${rendererInfo.vendor} ${rendererInfo.renderer}`),
  `software WebGL renderer is too slow for smooth capture: ${JSON.stringify(rendererInfo)}`,
);

await page.evaluate(() => {
  window.__DEMO_RENDER_STATS__ = {
    active: true,
    previous: 0,
    deltas: [],
  };
  const sampleFrame = (time) => {
    const stats = window.__DEMO_RENDER_STATS__;
    if (!stats.active) return;
    if (stats.previous) stats.deltas.push(time - stats.previous);
    stats.previous = time;
    requestAnimationFrame(sampleFrame);
  };
  requestAnimationFrame(sampleFrame);

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
    .demo-focus .minimap-panel,
    .demo-focus .route-panel,
    .demo-focus .telemetry,
    .demo-focus .location-card,
    .demo-focus .controls {
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 180ms ease;
    }
    #demo-support-cue {
      position: fixed;
      z-index: 85;
      left: 50%;
      bottom: 54px;
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 11px 17px 12px;
      border: 1px solid rgba(214, 247, 242, 0.28);
      color: #effffd;
      background: rgba(4, 25, 32, 0.86);
      box-shadow: 0 16px 38px rgba(0, 12, 18, 0.3);
      clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
      transform: translate(-50%, 12px);
      opacity: 0;
      pointer-events: none;
      backdrop-filter: blur(12px);
      transition: opacity 180ms ease, transform 180ms ease;
    }
    #demo-support-cue.show {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    #demo-support-cue b {
      color: #70eedd;
      font-family: "Bahnschrift", "Arial Narrow", sans-serif;
      font-size: 24px;
      letter-spacing: 0.08em;
    }
    #demo-support-cue span {
      display: block;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    #demo-support-cue small {
      display: block;
      margin-top: 2px;
      color: rgba(228, 248, 245, 0.62);
      font-size: 10px;
      letter-spacing: 0.08em;
    }
    #demo-support-cue[data-phase="both"] b {
      color: #ffb77d;
    }
    #demo-support-cue[data-phase="right"] b {
      color: #ffd36f;
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
  const supportCue = document.createElement("div");
  supportCue.id = "demo-support-cue";
  supportCue.dataset.phase = "left";
  supportCue.innerHTML = `
    <b></b>
    <div><span></span><small></small></div>
  `;
  document.body.appendChild(supportCue);
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

async function setSupportCue(phase, index, label, detail) {
  await page.locator("#demo-support-cue").evaluate((cue, value) => {
    cue.dataset.phase = value.phase;
    cue.querySelector("b").textContent = value.index;
    cue.querySelector("span").textContent = value.label;
    cue.querySelector("small").textContent = value.detail;
    cue.classList.add("show");
  }, { phase, index, label, detail });
}

async function hideSupportCue() {
  await page.locator("#demo-support-cue").evaluate((cue) => {
    cue.classList.remove("show");
  });
}

async function setFocusMode(active) {
  await page.evaluate((value) => {
    document.querySelector("#app").classList.toggle("demo-focus", value);
  }, active);
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
    await resetFreeRide(0.52);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.speed = 7.4;
      debug.setTimeScale(0.5);
      debug.setCamera("low");
      debug.setCameraOffset(0.45, 0.15);
      debug.keys.add("Space");
    });
    await setSupportCue("left", "01", "判断停车重心", "先减速，再选择支撑方向");
    await waitForTimestamp(sceneStart + duration * 0.14);
    await resetFreeRide(0.58);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.keys.clear();
      debug.freeRide.speed = 0;
      debug.freeRide.footDown = 1;
      debug.freeRide.supportSide = 1;
      debug.freeRide.supportTarget = 1;
      debug.freeRide.supportTransition = 0;
      debug.freeRide.bothFeet = 0;
      debug.setTimeScale(0.32);
      debug.setCameraRig([2.45, 1.05, -0.4], [0, 0.32, 0.35]);
    });
    await setFocusMode(true);
    await setSupportCue("left", "01", "左脚落地支撑", "左侧踏板抬高，左脚接触地面");
    await waitForTimestamp(sceneStart + duration * 0.5);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.supportTarget = -1;
      debug.freeRide.supportTransition = 0.58;
    });
    await setSupportCue("both", "02", "双脚同时着地", "重心从左侧转移到右侧");
    await waitForTimestamp(sceneStart + duration * 0.62);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setCameraRig([-2.45, 1.05, -0.4], [0, 0.32, 0.35]);
    });
    await setSupportCue("right", "03", "右脚接替支撑", "左脚收回踏板，车辆稳定驻停");
    await waitForTimestamp(sceneStart + duration * 0.94);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.keys.clear();
      debug.setTimeScale(1);
      debug.clearCameraRig();
    });
    await hideSupportCue();
    await setFocusMode(false);
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
      debug.setCamera("chase");
      debug.setCameraOffset(0.45, 0.15);
    });
    await waitForTimestamp(sceneStart + duration * 0.6);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setCamera("chase");
      debug.setCameraOffset(-0.45, 0.12);
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
    title: "单脚支撑与换腿",
    subtitle: "左脚支撑 → 双脚过渡 → 右脚支撑",
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
const renderStats = await page.evaluate(() => {
  const stats = window.__DEMO_RENDER_STATS__;
  stats.active = false;
  const deltas = stats.deltas.slice().sort((left, right) => left - right);
  const percentile = (value) => (
    deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * value))] ?? 0
  );
  const total = deltas.reduce((sum, value) => sum + value, 0);
  return {
    frames: deltas.length,
    elapsed: total / 1000,
    averageFps: total > 0 ? deltas.length / (total / 1000) : 0,
    medianGap: percentile(0.5),
    p95Gap: percentile(0.95),
    maxGap: deltas[deltas.length - 1] ?? 0,
  };
});
assert.ok(
  renderStats.averageFps >= 24,
  `GPU capture must render at least 24 fps, received ${renderStats.averageFps.toFixed(2)}`,
);
assert.ok(
  renderStats.p95Gap <= 100,
  `95th percentile frame gap must stay below 100 ms, received ${renderStats.p95Gap.toFixed(1)} ms`,
);
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
      rendererInfo,
      renderStats,
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
  rendererInfo,
  renderStats,
  sceneCount: scenes.length,
  runtimeErrors,
}, null, 2));
