import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.WULING_URL ?? "http://127.0.0.1:4173";
const previewDir = new URL("../preview/", import.meta.url);

await mkdir(previewDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const warnings = [];

async function openPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(60_000);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (
      message.type() === "warning"
      && !/GL Driver Message|ReadPixels/.test(message.text())
    ) {
      warnings.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "page must return HTTP 200");
  await page.waitForFunction(() => window.__WULING_DEBUG__?.rider, null, {
    timeout: 60_000,
  });
  await page.locator("#start-ride").evaluate((button) => button.click());
  await page.waitForTimeout(700);
  return page;
}

const desktop = await openPage({ width: 1440, height: 900 });
const mechanics = await desktop.evaluate(() => {
  const debug = window.__WULING_DEBUG__;
  const { THREE, bicycle, freeRide, rider } = debug;
  const toBikeLocal = (object) => {
    const inverse = bicycle.group.matrixWorld.clone().invert();
    return object
      .getWorldPosition(new THREE.Vector3())
      .applyMatrix4(inverse)
      .toArray();
  };
  const runSteering = (code) => {
    debug.setRideMode("auto");
    debug.setRideMode("free");
    freeRide.position.set(0, 1.12, 8);
    freeRide.heading = Math.PI / 2;
    freeRide.speed = 5;
    debug.keys.clear();
    debug.keys.add("KeyW");
    debug.keys.add(code);
    for (let index = 0; index < 120; index++) debug.stepFreeRide(1 / 60);
    return {
      heading: freeRide.heading,
      steering: bicycle.steering.rotation.y,
    };
  };

  const left = runSteering("KeyA");
  const right = runSteering("KeyD");
  const pedalAtZero = bicycle.updateCrank(0);
  const pedalAfterStep = bicycle.updateCrank(0.1);
  const pedalForwardMotion = (
    pedalAfterStep.left.z > pedalAtZero.left.z
    && pedalAfterStep.right.z < pedalAtZero.right.z
  );
  const pedalTargetsForMesh = bicycle.updateCrank(0.72);
  const pedalMeshError = Math.max(
    bicycle.pedals[0].position.distanceTo(pedalTargetsForMesh.left),
    bicycle.pedals[1].position.distanceTo(pedalTargetsForMesh.right),
  );

  debug.setRideMode("free");
  freeRide.position.set(0, 1.12, 41);
  freeRide.heading = Math.PI / 2;
  freeRide.speed = 0;
  debug.keys.clear();
  debug.stepFreeRide(0);
  debug.setRideMode("auto");
  const returnStartDistance = debug.route.distanceToRoute(
    bicycle.group.position.x,
    bicycle.group.position.z,
  ).distance;
  for (let index = 0; index < 900; index++) debug.stepBike(1 / 60);
  const returnEndDistance = debug.route.distanceToRoute(
    bicycle.group.position.x,
    bicycle.group.position.z,
  ).distance;
  debug.setRouteT(0);
  let autoMaxSteerStep = 0;
  let autoMaxRouteDistance = 0;
  let previousSteering = bicycle.steering.rotation.y;
  for (let index = 0; index < 1500; index++) {
    debug.stepBike(1 / 60);
    const steering = bicycle.steering.rotation.y;
    autoMaxSteerStep = Math.max(autoMaxSteerStep, Math.abs(steering - previousSteering));
    previousSteering = steering;
    autoMaxRouteDistance = Math.max(
      autoMaxRouteDistance,
      debug.route.distanceToRoute(
        bicycle.group.position.x,
        bicycle.group.position.z,
      ).distance,
    );
  }

  const samples = [];
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    bicycle.group.userData.crankAngle = angle;
    const targets = bicycle.updateCrank(angle);
    rider.updatePose(0, {
      speed: 10,
      steer: 0,
      braking: 0,
      footDown: 0,
    });
    bicycle.group.updateMatrixWorld(true);
    const leftFoot = toBikeLocal(rider.bones[33]);
    const rightFoot = toBikeLocal(rider.bones[29]);
    const leftKnee = toBikeLocal(rider.bones[31]);
    const rightKnee = toBikeLocal(rider.bones[27]);
    const leftHip = toBikeLocal(rider.bones[30]);
    const rightHip = toBikeLocal(rider.bones[26]);
    samples.push({
      leftError: Math.hypot(
        leftFoot[0] - targets.left.x,
        leftFoot[1] - targets.left.y,
        leftFoot[2] - targets.left.z,
      ),
      rightError: Math.hypot(
        rightFoot[0] - targets.right.x,
        rightFoot[1] - targets.right.y,
        rightFoot[2] - targets.right.z,
      ),
      leftKneeForward: leftKnee[2] - leftHip[2],
      rightKneeForward: rightKnee[2] - rightHip[2],
    });
  }
  bicycle.group.userData.crankAngle = Math.PI * 1.5;
  const supportPedal = bicycle.updateCrank(Math.PI * 1.5).left;
  rider.updatePose(0, {
    speed: 0,
    steer: 0,
    braking: 0,
    footDown: 1,
    reverse: 0,
  });
  bicycle.group.updateMatrixWorld(true);
  const supportFoot = toBikeLocal(rider.bones[33]);
  const supportClearance = supportFoot[1] < 0.22
    && supportPedal.y - supportFoot[1] > 0.05;
  rider.updatePose(0, {
    speed: 0,
    steer: 0,
    braking: 0,
    footDown: 1,
    reverse: 0,
    supportSide: -1,
    bothFeet: 0,
  });
  bicycle.group.updateMatrixWorld(true);
  const rightSupportFoot = toBikeLocal(rider.bones[29]);
  const rightSupportClearance = rightSupportFoot[1] < 0.22;
  rider.updatePose(0, { speed: 0, steer: 0, braking: 0, footDown: 0 });
  const skirtBase = rider.bones[680]?.quaternion.clone();
  rider.updatePose(1.2, { speed: 8, steer: 0, braking: 0, footDown: 0 });
  const skirtRigged = Boolean(
    skirtBase
    && rider.bones[680]
    && 2 * Math.acos(Math.min(1, Math.abs(skirtBase.dot(rider.bones[680].quaternion)))) > 0.005,
  );

  freeRide.position.set(17, 1.12, 34.72);
  freeRide.heading = 0;
  freeRide.speed = 8;
  debug.keys.clear();
  for (let index = 0; index < 240; index++) debug.stepFreeRide(1 / 60);
  const collisionZ = freeRide.position.z;

  debug.setRideMode("auto");
  debug.setRideMode("free");
  freeRide.position.set(0, 1.12, 8);
  freeRide.heading = Math.PI / 2;
  freeRide.speed = 0;
  debug.keys.clear();
  debug.keys.add("KeyS");
  const reverseFootSamples = [];
  for (let index = 0; index < 180; index++) {
    debug.stepFreeRide(1 / 60);
    if (index % 15 === 0) {
      bicycle.group.updateMatrixWorld(true);
      reverseFootSamples.push(toBikeLocal(rider.bones[33])[2]);
    }
  }
  const reverse = {
    speed: freeRide.speed,
    x: freeRide.position.x,
    footDown: freeRide.footDown,
    amount: freeRide.reverse,
    footTravel: Math.max(...reverseFootSamples) - Math.min(...reverseFootSamples),
  };

  debug.setRideMode("auto");
  debug.setRideMode("free");
  freeRide.position.set(0, 1.12, 8);
  freeRide.heading = Math.PI / 2;
  freeRide.speed = 0;
  freeRide.footDown = 1;
  freeRide.supportSide = 1;
  freeRide.supportTarget = 1;
  freeRide.supportTransition = 0;
  freeRide.bothFeet = 0;
  freeRide.lateralBias = -0.2;
  debug.keys.clear();
  let supportBothFeetPeak = 0;
  for (let index = 0; index < 40; index++) {
    debug.stepFreeRide(1 / 60);
    supportBothFeetPeak = Math.max(supportBothFeetPeak, freeRide.bothFeet);
  }
  for (let index = 0; index < 30; index++) debug.stepFreeRide(1 / 60);
  const supportSwitchCompleted = freeRide.supportSide === -1;

  debug.keys.clear();
  debug.setRideMode("auto");
  freeRide.position.set(0, 1.12, 8);
  freeRide.heading = Math.PI / 2;
  freeRide.speed = 5;
  freeRide.reverse = 0;
  freeRide.footDown = 0;
  debug.keys.add("KeyW");
  const before = bicycle.group.userData.drivetrain;
  for (let index = 0; index < 90; index++) debug.stepFreeRide(1 / 60);
  const after = bicycle.group.userData.drivetrain;

  return {
    left,
    right,
    pedalForwardMotion,
    pedalMeshError,
    returnStartDistance,
    returnEndDistance,
    autoMaxSteerStep,
    autoMaxRouteDistance,
    maxFootError: Math.max(...samples.map((sample) => Math.max(sample.leftError, sample.rightError))),
    minLeftKneeForward: Math.min(...samples.map((sample) => sample.leftKneeForward)),
    minRightKneeForward: Math.min(...samples.map((sample) => sample.rightKneeForward)),
    supportClearance,
    rightSupportClearance,
    skirtRigged,
    supportBothFeetPeak,
    supportSwitchCompleted,
    collisionZ,
    reverse,
    wheelDelta: after.wheelAngle - before.wheelAngle,
    crankDelta: after.crankAngle - before.crankAngle,
    ratio: (after.crankAngle - before.crankAngle) / (after.wheelAngle - before.wheelAngle),
  };
});

console.log("mechanism-check", JSON.stringify(mechanics));

assert.ok(mechanics.left.heading > Math.PI / 2 + 0.2, "A must turn left");
assert.ok(mechanics.right.heading < Math.PI / 2 - 0.2, "D must turn right");
assert.ok(mechanics.left.steering > 0.1, "front wheel must visually follow A");
assert.ok(mechanics.right.steering < -0.1, "front wheel must visually follow D");
assert.ok(mechanics.pedalForwardMotion, "crank must rotate in the forward pedalling direction");
assert.ok(mechanics.pedalMeshError < 0.001, "pedal meshes must follow the crank targets");
assert.ok(mechanics.returnStartDistance > 20, "free-to-cruise transition must start off route");
assert.ok(mechanics.returnEndDistance < 4.5, "PID must return to the nearby cruise route");
assert.ok(mechanics.autoMaxSteerStep < 0.035, "automatic steering must not visibly oscillate");
assert.ok(mechanics.autoMaxRouteDistance < 5.8, "automatic rider must remain inside the cruise corridor");
assert.ok(mechanics.maxFootError < 0.08, "feet must remain on the pedals");
assert.ok(mechanics.minLeftKneeForward > 0, "left knee must stay in front of the hip");
assert.ok(mechanics.minRightKneeForward > 0, "right knee must stay in front of the hip");
assert.ok(mechanics.supportClearance, "stopped rider must plant a foot clear of the pedal");
assert.ok(mechanics.rightSupportClearance, "right support side must also reach the ground");
assert.ok(mechanics.skirtRigged, "skirt controls must react to riding motion");
assert.ok(mechanics.supportBothFeetPeak > 0.9, "support transfer must lower both feet first");
assert.ok(mechanics.supportSwitchCompleted, "support transfer must finish on the requested side");
assert.ok(mechanics.collisionZ < 34.98, "building collision must stop forward penetration");
assert.ok(mechanics.reverse.speed < -0.1, "S must reverse slowly");
assert.ok(mechanics.reverse.x < -0.05, "reverse must move opposite the bicycle heading");
assert.ok(mechanics.reverse.footDown > 0.8, "reverse must keep a foot ready to scuff the ground");
assert.ok(mechanics.reverse.amount > 0.8, "reverse input must enter the reverse state");
assert.ok(mechanics.reverse.footTravel > 0.12, "reverse must visibly scuff the ground with a foot");
assert.ok(mechanics.wheelDelta > 0, "forward riding must rotate the wheels forward");
assert.ok(mechanics.crankDelta > 0, "forward pedalling must rotate the crank forward");
assert.ok(Math.abs(mechanics.ratio - 18 / 46) < 0.0001, "drivetrain ratio must be 18/46");

await desktop.evaluate(() => {
  const debug = window.__WULING_DEBUG__;
  debug.setRideMode("auto");
  debug.setRouteT(0.115);
  debug.setCamera("chase");
});
await desktop.waitForTimeout(1200);
await desktop.screenshot({ path: fileURLToPath(new URL("desktop.png", previewDir)) });

const audioResponse = await desktop.request.get(`${baseUrl}/assets/audio/wuling-cloudway.wav`);
assert.equal(audioResponse.status(), 200, "soundtrack must be served");
const audioBytes = (await audioResponse.body()).byteLength;
assert.ok(audioBytes > 18_000_000, "soundtrack delivery must not be truncated");
await desktop.locator("#sound-toggle").evaluate((button) => button.click());
await desktop.waitForTimeout(500);
const soundPlaying = await desktop.locator("#sound-toggle").getAttribute("aria-pressed");
assert.equal(soundPlaying, "true", "soundtrack playback must start after user input");
await desktop.keyboard.press("b");

const mobile = await openPage({ width: 390, height: 844 });
await mobile.evaluate(() => {
  const debug = window.__WULING_DEBUG__;
  debug.setRouteT(0.115);
  debug.setCamera("chase");
});
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: fileURLToPath(new URL("mobile.png", previewDir)) });

assert.deepEqual(errors, [], `runtime console errors: ${errors.join(" | ")}`);
assert.deepEqual(warnings, [], `runtime console warnings: ${warnings.join(" | ")}`);

console.log(JSON.stringify({
  mechanics,
  audioBytes,
  soundPlaying,
  screenshots: [
    fileURLToPath(new URL("desktop.png", previewDir)),
    fileURLToPath(new URL("mobile.png", previewDir)),
  ],
  consoleErrors: errors.length,
  consoleWarnings: warnings.length,
}, null, 2));

await browser.close();
