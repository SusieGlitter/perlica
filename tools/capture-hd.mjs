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
const rawOutput = path.join(outputDir, "wuling-perlica-demo-hd.webm");
const notesOutput = path.join(outputDir, "capture.json");
const ffprobe = process.env.FFPROBE_PATH
  ?? path.join(root, ".cache", "tools", "ffmpeg", "bin", "ffprobe.exe");
const leadSeconds = 0.8;
const gapSeconds = 1;
const captureWidth = 1728;
const captureHeight = 1080;
const videoBitsPerSecond = 18_000_000;
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
const smokeSeconds = Number.parseFloat(process.env.WULING_CAPTURE_SECONDS ?? "0");
const sceneLimit = Number.parseInt(process.env.WULING_SCENE_LIMIT ?? "0", 10);
if (sceneLimit > 0) {
  scenes.splice(sceneLimit);
}
if (smokeSeconds > 0) {
  scenes.splice(1);
  scenes[0].duration = Math.min(scenes[0].duration, smokeSeconds);
}
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
  acceptDownloads: true,
  viewport: { width: captureWidth, height: captureHeight },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);

const runtimeErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});
page.on("pageerror", (error) => runtimeErrors.push(error.message));

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

await page.evaluate(({ width, height, bitsPerSecond }) => {
  const sceneCanvas = document.querySelector("#scene");
  const minimapCanvas = document.querySelector("#minimap");
  const compositor = document.createElement("canvas");
  compositor.width = width;
  compositor.height = height;
  const context = compositor.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });
  const visualCanvas = document.createElement("canvas");
  visualCanvas.width = 192;
  visualCanvas.height = 120;
  const visualContext = visualCanvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });

  const state = {
    caption: {
      index: 0,
      style: "caption",
      title: "",
      subtitle: "",
    },
    focusMode: false,
    supportCue: null,
    frameVariance: 255,
  };
  const deltas = [];
  let previousFrame = 0;
  let previousVisualSample = 0;
  let recording = false;
  let recorder = null;
  let stream = null;
  let chunks = [];

  const panel = (x, y, panelWidth, panelHeight, accent = "#70eedd") => {
    const gradient = context.createLinearGradient(x, y, x + panelWidth, y);
    gradient.addColorStop(0, "rgba(3, 24, 31, .9)");
    gradient.addColorStop(1, "rgba(3, 24, 31, .68)");
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + panelWidth - 18, y);
    context.lineTo(x + panelWidth, y + 18);
    context.lineTo(x + panelWidth, y + panelHeight);
    context.lineTo(x + 18, y + panelHeight);
    context.lineTo(x, y + panelHeight - 18);
    context.closePath();
    context.fill();
    context.fillStyle = accent;
    context.fillRect(x, y, 5, panelHeight);
  };

  const fittedFont = (text, weight, maxSize, minimumSize, family) => {
    for (let size = maxSize; size >= minimumSize; size -= 2) {
      context.font = `${weight} ${size}px ${family}`;
      if (context.measureText(text).width <= 0.94 * (width - 220)) return size;
    }
    return minimumSize;
  };

  const drawLines = (text, x, y, lineHeight) => {
    text.split("\n").forEach((line, index) => {
      context.fillText(line, x, y + index * lineHeight);
    });
  };

  const drawMinimap = () => {
    if (state.focusMode) return;
    const mapWidth = 310;
    const mapHeight = 176;
    const x = 42;
    const y = 42;
    context.save();
    context.fillStyle = "rgba(4, 25, 32, .82)";
    context.fillRect(x, y, mapWidth, mapHeight);
    context.strokeStyle = "rgba(112, 238, 221, .48)";
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, mapWidth - 2, mapHeight - 2);
    context.drawImage(minimapCanvas, x + 9, y + 9, mapWidth - 18, mapHeight - 18);
    context.restore();
  };

  const drawTelemetry = () => {
    if (state.focusMode) return;
    const x = width - 650;
    const y = height - 104;
    panel(x, y, 600, 68, "#ffb77d");
    context.fillStyle = "rgba(231, 250, 247, .68)";
    context.font = "700 17px 'Microsoft YaHei', sans-serif";
    context.fillText("速度", x + 24, y + 27);
    context.fillText("里程", x + 174, y + 27);
    context.fillText("模式", x + 324, y + 27);
    context.fillText("状态", x + 454, y + 27);
    context.fillStyle = "#f5fffd";
    context.font = "700 28px 'Bahnschrift', 'Microsoft YaHei', sans-serif";
    context.fillText(`${document.querySelector("#telemetry-speed").textContent} km/h`, x + 24, y + 58);
    context.fillText(`${document.querySelector("#telemetry-distance").textContent} km`, x + 174, y + 58);
    context.fillText(document.querySelector("#telemetry-mode").textContent, x + 324, y + 58);
    context.fillText(document.querySelector("#telemetry-state").textContent, x + 454, y + 58);
  };

  const drawSupportCue = () => {
    if (!state.supportCue) return;
    const cueWidth = 520;
    const cueHeight = 104;
    const x = (width - cueWidth) / 2;
    const y = height - 290;
    const accent = state.supportCue.phase === "both"
      ? "#ffb77d"
      : state.supportCue.phase === "right"
        ? "#ffd36f"
        : "#70eedd";
    panel(x, y, cueWidth, cueHeight, accent);
    context.fillStyle = accent;
    context.font = "800 44px 'Bahnschrift', sans-serif";
    context.fillText(state.supportCue.index, x + 28, y + 68);
    context.fillStyle = "#f5fffd";
    context.font = "800 34px 'Microsoft YaHei', sans-serif";
    context.fillText(state.supportCue.label, x + 118, y + 46);
    context.fillStyle = "rgba(229, 248, 245, .68)";
    context.font = "500 18px 'Microsoft YaHei', sans-serif";
    context.fillText(state.supportCue.detail, x + 118, y + 79);
  };

  const drawCaption = () => {
    if (state.focusMode) {
      drawSupportCue();
      return;
    }
    const { style, title, subtitle, index } = state.caption;
    if (!title) return;
    if (style === "title") {
      const panelWidth = 1040;
      const panelHeight = subtitle.includes("https://") ? 300 : 276;
      const x = (width - panelWidth) / 2;
      const y = (height - panelHeight) / 2;
      panel(x, y, panelWidth, panelHeight, "#70eedd");
      context.fillStyle = "#70eedd";
      context.font = "800 22px 'Bahnschrift', sans-serif";
      context.fillText(`${String(index + 1).padStart(2, "0")} / WULING RIDE`, x + 38, y + 50);
      context.fillStyle = "#f7fffd";
      const titleSize = fittedFont(title, 800, 72, 50, "'Microsoft YaHei', sans-serif");
      context.font = `800 ${titleSize}px 'Microsoft YaHei', sans-serif`;
      context.fillText(title, x + 38, y + 142);
      context.fillStyle = subtitle.includes("https://") ? "#ffd36f" : "rgba(232, 250, 247, .78)";
      context.font = "600 32px 'Microsoft YaHei', sans-serif";
      drawLines(subtitle, x + 38, y + 205, 45);
      return;
    }

    const panelWidth = 880;
    const panelHeight = 142;
    const x = 58;
    const y = height - 210;
    panel(x, y, panelWidth, panelHeight, "#70eedd");
    context.fillStyle = "#70eedd";
    context.font = "800 18px 'Bahnschrift', sans-serif";
    context.fillText(`${String(index + 1).padStart(2, "0")} / WULING RIDE`, x + 30, y + 34);
    context.fillStyle = "#f7fffd";
    context.font = "800 48px 'Microsoft YaHei', sans-serif";
    context.fillText(title, x + 30, y + 86);
    context.fillStyle = "rgba(232, 250, 247, .72)";
    context.font = "600 25px 'Microsoft YaHei', sans-serif";
    drawLines(subtitle, x + 30, y + 121, 31);
  };

  const drawFrame = (time) => {
    if (previousFrame) deltas.push(time - previousFrame);
    previousFrame = time;
    context.drawImage(sceneCanvas, 0, 0, width, height);
    if (time - previousVisualSample >= 500) {
      previousVisualSample = time;
      visualContext.drawImage(
        compositor,
        width * 0.27,
        height * 0.24,
        width * 0.46,
        height * 0.44,
        0,
        0,
        visualCanvas.width,
        visualCanvas.height,
      );
      const pixels = visualContext.getImageData(
        0,
        0,
        visualCanvas.width,
        visualCanvas.height,
      ).data;
      let sum = 0;
      let sumSquares = 0;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 16) {
        const luminance = (
          pixels[index] * 0.2126
          + pixels[index + 1] * 0.7152
          + pixels[index + 2] * 0.0722
        );
        sum += luminance;
        sumSquares += luminance * luminance;
        count++;
      }
      const mean = sum / Math.max(1, count);
      state.frameVariance = Math.sqrt(
        Math.max(0, sumSquares / Math.max(1, count) - mean * mean),
      );
    }
    const shade = context.createLinearGradient(0, height * 0.48, 0, height);
    shade.addColorStop(0, "rgba(1, 13, 18, 0)");
    shade.addColorStop(1, "rgba(1, 13, 18, .34)");
    context.fillStyle = shade;
    context.fillRect(0, height * 0.48, width, height * 0.52);
    drawMinimap();
    drawTelemetry();
    drawCaption();
    requestAnimationFrame(drawFrame);
  };
  requestAnimationFrame(drawFrame);

  window.__HD_DEMO__ = {
    ...state,
    deltas,
    setCaption(caption) {
      state.caption = caption;
    },
    setSupportCue(cue) {
      state.supportCue = cue;
    },
    setFocusMode(value) {
      state.focusMode = value;
    },
    getVisualDiagnostics() {
      return {
        frameVariance: state.frameVariance,
      };
    },
    async startRecording() {
      stream = compositor.captureStream(60);
      chunks = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitsPerSecond,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.start(1000);
      recording = true;
    },
    stopRecording() {
      return new Promise((resolve, reject) => {
        if (!recorder || !recording) {
          reject(new Error("MediaRecorder was not started."));
          return;
        }
        recorder.onerror = (event) => reject(event.error || new Error("MediaRecorder error"));
        recorder.onstop = () => {
          recording = false;
          const blob = new Blob(chunks, { type: recorder.mimeType });
          window.__HD_DEMO__.downloadUrl = URL.createObjectURL(blob);
          stream.getTracks().forEach((track) => track.stop());
          resolve({ size: blob.size, mimeType: recorder.mimeType });
        };
        setTimeout(() => recorder.stop(), 250);
      });
    },
  };
}, { width: captureWidth, height: captureHeight, bitsPerSecond: videoBitsPerSecond });

async function setOverlay(index, style, title, subtitle) {
  await page.evaluate((caption) => {
    window.__HD_DEMO__.setCaption(caption);
  }, { index, style, title, subtitle });
}

async function evaluate(action, argument) {
  await page.evaluate(action, argument);
}

async function setSupportCue(phase, index, label, detail) {
  await page.evaluate((cue) => {
    window.__HD_DEMO__.setSupportCue(cue);
  }, { phase, index, label, detail });
}

async function hideSupportCue() {
  await page.evaluate(() => {
    window.__HD_DEMO__.setSupportCue(null);
  });
}

async function setFocusMode(active) {
  await page.evaluate((value) => {
    window.__HD_DEMO__.setFocusMode(value);
  }, active);
}

const viewChecks = [];
const motionChecks = [];
let activeViewGuard = null;
const fallbackRigs = {
  left: {
    position: [3.4, 1.55, -2.2],
    target: [0, 0.82, 1],
  },
  right: {
    position: [-3.4, 1.55, -2.2],
    target: [0, 0.82, 1],
  },
  front: {
    position: [0.8, 1.65, 4.2],
    target: [0, 0.88, 0.2],
  },
};

async function ensureClearView(label, fallback = "left") {
  await page.waitForTimeout(520);
  let diagnostics = await page.evaluate(() => window.__WULING_DEBUG__.getViewDiagnostics());
  let visual = await page.evaluate(() => window.__HD_DEMO__.getVisualDiagnostics());
  let usedFallback = null;
  if (!diagnostics.clear || visual.frameVariance < 12) {
    usedFallback = fallback;
    const rig = fallbackRigs[fallback];
    await page.evaluate((value) => {
      window.__WULING_DEBUG__.setCameraRig(value.position, value.target);
    }, rig);
    await page.waitForTimeout(520);
    diagnostics = await page.evaluate(() => window.__WULING_DEBUG__.getViewDiagnostics());
    visual = await page.evaluate(() => window.__HD_DEMO__.getVisualDiagnostics());
  }
  const clear = diagnostics.clear && visual.frameVariance >= 12;
  viewChecks.push({ label, usedFallback, diagnostics, visual, clear });
  if (!clear) {
    throw new Error(
      `camera view remains occluded: ${label} ${JSON.stringify({ diagnostics, visual })}`,
    );
  }
  activeViewGuard = { label, fallback };
}

async function sampleFreeMotion(label) {
  const sample = await page.evaluate((sampleLabel) => {
    const debug = window.__WULING_DEBUG__;
    return {
      label: sampleLabel,
      time: performance.now(),
      x: debug.freeRide.position.x,
      z: debug.freeRide.position.z,
      speed: debug.freeRide.speed,
      collisionPulse: debug.freeRide.collisionPulse,
      nearestDistance: debug.freeRide.nearestDistance,
    };
  }, label);
  const previous = motionChecks.at(-1);
  motionChecks.push(sample);
  if (
    previous
    && sample.time - previous.time >= 700
    && (
      (
        sample.speed > 2
        && Math.hypot(sample.x - previous.x, sample.z - previous.z) < 0.55
      )
      || (
        sample.speed < 0.9
        && sample.collisionPulse > 0.5
      )
    )
  ) {
    throw new Error(`free ride appears stuck at ${label}: ${JSON.stringify({ previous, sample })}`);
  }
  return sample;
}

async function waitForTimestamp(timestamp) {
  while (performance.now() < timestamp) {
    const remaining = timestamp - performance.now();
    if (remaining <= 0) break;
    await page.waitForTimeout(Math.min(500, remaining));
    if (!activeViewGuard) continue;
    const visual = await page.evaluate(() => window.__HD_DEMO__.getVisualDiagnostics());
    if (visual.frameVariance >= 12) continue;
    const diagnostics = await page.evaluate(
      () => window.__WULING_DEBUG__.getViewDiagnostics(),
    );
    const rig = fallbackRigs[activeViewGuard.fallback];
    await page.evaluate((value) => {
      window.__WULING_DEBUG__.setCameraRig(value.position, value.target);
    }, rig);
    await page.waitForTimeout(520);
    const fallbackDiagnostics = await page.evaluate(
      () => window.__WULING_DEBUG__.getViewDiagnostics(),
    );
    const fallbackVisual = await page.evaluate(
      () => window.__HD_DEMO__.getVisualDiagnostics(),
    );
    const clear = fallbackDiagnostics.clear && fallbackVisual.frameVariance >= 12;
    viewChecks.push({
      label: `${activeViewGuard.label}:live`,
      usedFallback: activeViewGuard.fallback,
      diagnostics: fallbackDiagnostics,
      visual: fallbackVisual,
      clear,
      trigger: { diagnostics, visual },
    });
    if (!clear) {
      throw new Error(
        `live camera view remains occluded: ${activeViewGuard.label} `
          + JSON.stringify({ fallbackDiagnostics, fallbackVisual }),
      );
    }
  }
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

async function startWorldOrbit(durationSeconds) {
  await page.evaluate((duration) => {
    window.__WULING_DEBUG__.startWorldOrbit({
      center: [0, 0, 41],
      target: [0, 5.5, 41],
      radius: 92,
      height: 54,
      startAngle: 0.65,
      duration,
    });
  }, durationSeconds);
}

async function stopWorldOrbit() {
  await page.evaluate(() => window.__WULING_DEBUG__.stopWorldOrbit());
}

const sceneRunners = [
  async (sceneStart, duration) => {
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.018);
    });
    await startWorldOrbit((duration * 0.58) / 1000);
    await waitForTimestamp(sceneStart + duration * 0.28);
    await setOverlay(0, "caption", "", "");
    await waitForTimestamp(sceneStart + duration * 0.58);
    await stopWorldOrbit();
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.58);
      debug.setRideMode("free");
      debug.freeRide.speed = 0;
      debug.freeRide.footDown = 0;
      debug.keys.clear();
      debug.setCamera("chase");
    });
    await setOverlay(0, "caption", "佩丽卡已就位", "方兴衢起点 · 准备开始骑行");
    await ensureClearView("intro-parked", "left");
    await waitForTimestamp(sceneStart + duration * 0.78);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRideMode("auto");
      debug.setRouteT(0.02);
      debug.setCamera("chase");
    });
    await setOverlay(0, "caption", "开始骑行", "DeepSeek-v4.1-flash · 武陵骑行计划");
    await ensureClearView("intro-ride", "left");
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
    await ensureClearView("map-cinema", "front");
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
    await ensureClearView("auto-chase", "front");
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await resetFreeRide(0.02);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.speed = 4.2;
      debug.keys.add("KeyW");
      debug.setCamera("chase");
    });
    await ensureClearView("free-chase", "left");
    await sampleFreeMotion("free-start");
    await waitForTimestamp(sceneStart + duration * 0.38);
    await sampleFreeMotion("free-mid");
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.keys.delete("KeyW");
      debug.keys.add("Space");
    });
    await waitForTimestamp(sceneStart + duration * 0.58);
    await evaluate(() => window.__WULING_DEBUG__.keys.delete("Space"));
    await sampleFreeMotion("free-brake");
    await waitForTimestamp(sceneStart + duration * 0.76);
    await sampleFreeMotion("free-stop");
    await waitForTimestamp(sceneStart + duration);
    await sampleFreeMotion("free-finish");
    const firstFreeSample = motionChecks.find((sample) => sample.label === "free-start");
    const finalFreeSample = motionChecks.at(-1);
    if (
      !firstFreeSample
      || Math.hypot(
        finalFreeSample.x - firstFreeSample.x,
        finalFreeSample.z - firstFreeSample.z,
      ) < 10
    ) {
      throw new Error("free ride did not cover enough open road");
    }
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
    await ensureClearView("support-left", "front");
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
    await ensureClearView("support-right", "front");
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
    await ensureClearView("reverse-low", "left");
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
    await ensureClearView("drivetrain-low", "front");
    await waitForTimestamp(sceneStart + duration * 0.55);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setCamera("chase");
      debug.setCameraOffset(1.15, 0.05);
    });
    await ensureClearView("drivetrain-chase", "left");
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
    await ensureClearView("details-low", "front");
    await waitForTimestamp(sceneStart + duration * 0.5);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setCamera("chase");
      debug.setCameraOffset(0.8, 0.1);
      debug.bicycle.ringBell();
    });
    await ensureClearView("details-chase", "left");
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
    await ensureClearView("world-start", "front");
    await waitForTimestamp(sceneStart + duration * 0.55);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.setRouteT(0.2);
      debug.setCamera("chase");
      debug.setCameraOffset(-0.7, 0.15);
    });
    await ensureClearView("world-finish", "left");
    await waitForTimestamp(sceneStart + duration);
  },
  async (sceneStart, duration) => {
    await resetFreeRide(0.02);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.freeRide.speed = 2.8;
      debug.keys.add("KeyW");
      debug.setCamera("chase");
      debug.setCameraOffset(0.55, 0.12);
    });
    await ensureClearView("credits-start", "front");
    await waitForTimestamp(sceneStart + duration * 0.6);
    await evaluate(() => {
      const debug = window.__WULING_DEBUG__;
      debug.keys.clear();
      debug.keys.add("Space");
      debug.setCameraOffset(-0.5, 0.1);
    });
    await page.waitForTimeout(1000);
    await evaluate(() => window.__WULING_DEBUG__.keys.clear());
    await ensureClearView("credits-finish", "left");
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
    await ensureClearView("outro-chase", "front");
    await waitForTimestamp(sceneStart + duration);
  },
];

const sceneCopy = [
  {
    style: "title",
    title: "由 DeepSeek-v4.1-flash 生成",
    subtitle: "风起武陵 · 佩丽卡骑行计划\nAI 声音复刻演示",
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
    subtitle: "W / 方向键自由前进 · 玩家接管速度与路线",
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
    subtitle: "DeepSeek-v4.1-flash · Playwright · Three.js · PID · IK · QwenTTS · FFmpeg",
  },
  {
    style: "title",
    title: "风起武陵，等你出发",
    subtitle: "https://susieglitter.github.io/perlica/\nGitHub: github.com/SusieGlitter/perlica",
  },
];

await page.evaluate(() => window.__HD_DEMO__.startRecording());
const timelineStartedAt = performance.now();
for (let index = 0; index < scenes.length; index++) {
  const scene = scenes[index];
  const sceneStart = timelineStartedAt + sceneStarts[index] * 1000;
  const copy = sceneCopy[index];
  await page.evaluate(() => window.__WULING_DEBUG__.clearCameraRig());
  await setOverlay(index, copy.style, copy.title, copy.subtitle);
  await sceneRunners[index](sceneStart, scene.duration * 1000);
}

await page.waitForTimeout(500);
const recordingResult = await page.evaluate(() => window.__HD_DEMO__.stopRecording());
const renderStats = await page.evaluate(() => {
  const deltas = window.__HD_DEMO__.deltas.slice().sort((left, right) => left - right);
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
const downloadPromise = page.waitForEvent("download");
await page.evaluate(() => {
  const link = document.createElement("a");
  link.href = window.__HD_DEMO__.downloadUrl;
  link.download = "wuling-perlica-demo-hd.webm";
  document.body.appendChild(link);
  link.click();
  link.remove();
});
const download = await downloadPromise;
await download.saveAs(rawOutput);
const setupSeconds = 0;
await context.close();
await browser.close();
const recordedPath = rawOutput;

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
      captureWidth,
      captureHeight,
      requestedVideoBitsPerSecond: videoBitsPerSecond,
      recordingResult,
      rendererInfo,
      renderStats,
      viewChecks,
      motionChecks,
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
  viewChecks,
  motionChecks,
  sceneCount: scenes.length,
  runtimeErrors,
}, null, 2));
