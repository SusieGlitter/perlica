import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const capturePath = path.join(root, ".cache", "video", "capture", "capture.json");
const narrationManifestPath = path.join(root, "video", "narration.json");
const narrationOutput = path.join(root, "video", "narration.wav");
const videoOutput = path.join(root, "video", "wuling-perlica-demo.mp4");
const reportOutput = path.join(root, "video", "build-report.json");
const musicPath = path.join(root, "public", "assets", "audio", "wuling-cloudway.wav");
const ffmpeg = process.env.FFMPEG_PATH
  ?? path.join(root, ".cache", "tools", "ffmpeg", "bin", "ffmpeg.exe");
const ffprobe = process.env.FFPROBE_PATH
  ?? path.join(root, ".cache", "tools", "ffmpeg", "bin", "ffprobe.exe");

const capture = JSON.parse(await readFile(capturePath, "utf8"));
const manifest = JSON.parse(await readFile(narrationManifestPath, "utf8"));
assert.equal(capture.runtimeErrors.length, 0, "browser capture must have no errors");

const rawVideo = capture.recordedPath;
const trimStart = Math.max(0, capture.setupSeconds - 0.05);
const duration = capture.timelineDuration;
const leadMs = Math.round(capture.leadSeconds * 1000);
const gapSeconds = capture.gapSeconds;
const segmentPaths = manifest.segments.map((segment) => (
  path.join(root, "video", "audio", `${segment.id}.wav`)
));

async function probe(input) {
  const { stdout } = await execFileAsync(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels",
    "-of",
    "json",
    input,
  ]);
  return JSON.parse(stdout);
}

const rawProbe = await probe(rawVideo);
const rawDuration = Number.parseFloat(rawProbe.format.duration);
assert.ok(
  rawDuration >= trimStart + duration - 0.25,
  "raw recording must cover the complete narration timeline",
);
assert.equal(rawProbe.streams[0].width, 1440, "raw capture width must be 1440");
assert.equal(rawProbe.streams[0].height, 900, "raw capture height must be 900");

const narrationFilters = segmentPaths.map((_, index) => {
  const delay = index === 0 ? `,adelay=${leadMs}|${leadMs}` : "";
  return (
    `[${index}:a]aresample=48000,`
    + `aformat=sample_fmts=s16:channel_layouts=stereo`
    + `${delay},apad=pad_dur=${gapSeconds}[a${index}]`
  );
});
const narrationConcat = `${
  segmentPaths.map((_, index) => `[a${index}]`).join("")
}concat=n=${segmentPaths.length}:v=0:a=1[out]`;

await mkdir(path.dirname(narrationOutput), { recursive: true });
await execFileAsync(ffmpeg, [
  "-y",
  "-hide_banner",
  "-loglevel",
  "warning",
  ...segmentPaths.flatMap((segmentPath) => ["-i", segmentPath]),
  "-filter_complex",
  [...narrationFilters, narrationConcat].join(";"),
  "-map",
  "[out]",
  "-c:a",
  "pcm_s16le",
  narrationOutput,
]);

const fadeOutStart = Math.max(0, duration - 1.5);
const videoFilter = [
  `[0:v]trim=start=${trimStart}:duration=${duration},`
    + "setpts=PTS-STARTPTS,fps=25[video]",
];
const audioFilter = [
  "[1:a]volume=1.12,apad=pad_dur=1[narration]",
  `[2:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.15,`
    + `afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=1.5[music]`,
  "[narration][music]amix=inputs=2:duration=longest:normalize=0,"
    + "alimiter=limit=0.95[audio]",
].join(";");

await execFileAsync(
  ffmpeg,
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    rawVideo,
    "-i",
    narrationOutput,
    "-stream_loop",
    "-1",
    "-i",
    musicPath,
    "-filter_complex",
    [...videoFilter, audioFilter].join(";"),
    "-map",
    "[video]",
    "-map",
    "[audio]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "22",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "25",
    "-g",
    "50",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-shortest",
    videoOutput,
  ],
  { maxBuffer: 10 * 1024 * 1024 },
);

const narrationProbe = await probe(narrationOutput);
const videoProbe = await probe(videoOutput);
const videoStream = videoProbe.streams.find((stream) => stream.codec_type === "video");
const audioStream = videoProbe.streams.find((stream) => stream.codec_type === "audio");
const finalDuration = Number.parseFloat(videoProbe.format.duration);

assert.equal(videoStream.codec_name, "h264", "final video must be H.264");
assert.equal(videoStream.width, 1440, "final video width must be 1440");
assert.equal(videoStream.height, 900, "final video height must be 900");
assert.equal(audioStream.codec_name, "aac", "final audio must be AAC");
assert.equal(Number(audioStream.sample_rate), 48000, "final audio must be 48 kHz");
assert.equal(Number(audioStream.channels), 2, "final audio must be stereo");
assert.ok(
  Math.abs(finalDuration - duration) < 0.35,
  `final duration ${finalDuration} must match timeline ${duration}`,
);

const report = {
  sourceCapture: rawVideo,
  sourceDuration: rawDuration,
  trimStart,
  timelineDuration: duration,
  narration: {
    path: narrationOutput,
    duration: Number.parseFloat(narrationProbe.format.duration),
    size: Number(narrationProbe.format.size),
  },
  video: {
    path: videoOutput,
    duration: finalDuration,
    size: Number(videoProbe.format.size),
    bitRate: Number(videoProbe.format.bit_rate),
    videoCodec: videoStream.codec_name,
    audioCodec: audioStream.codec_name,
    width: videoStream.width,
    height: videoStream.height,
    frameRate: videoStream.r_frame_rate,
  },
  scenes: capture.scenes,
};

await writeFile(reportOutput, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
