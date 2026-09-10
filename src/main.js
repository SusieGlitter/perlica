import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  createIcons,
  Camera,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  CircleStop,
  Gauge,
  Code2,
  Pause,
  Play,
  Route,
  ScanEye,
  Volume2,
  VolumeX,
} from "lucide";
import { createRoute, FANGXING_ROADS, RIDE_ZONES } from "./route.js";
import { createWulingWorld } from "./world.js";
import { createBicycle, loadRider } from "./bike.js";
import { RideMusic } from "./music.js";

const canvas = document.querySelector("#scene");
const app = document.querySelector("#app");
const loadingScreen = document.querySelector("#loading-screen");
const loadingBar = document.querySelector("#loading-bar");
const loadingValue = document.querySelector("#loading-value");
const playToggle = document.querySelector("#play-toggle");
const soundToggle = document.querySelector("#sound-toggle");
const progressFill = document.querySelector("#progress-fill");
const progressThumb = document.querySelector("#progress-thumb");
const progressValue = document.querySelector("#progress-value");
const progressLabel = document.querySelector("#progress-label");
const telemetrySpeed = document.querySelector("#telemetry-speed");
const telemetryDistance = document.querySelector("#telemetry-distance");
const telemetryElevation = document.querySelector("#telemetry-elevation");
const locationCard = document.querySelector("#location-card");
const locationIndex = locationCard.querySelector(".location-index");
const locationName = document.querySelector("#location-name");
const locationNote = document.querySelector("#location-note");
const routeStopElements = [...document.querySelectorAll("#route-stops li")];
const cameraButtons = [...document.querySelectorAll("[data-camera]")];
const speedButtons = [...document.querySelectorAll("[data-speed]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const touchRide = document.querySelector("#touch-ride");
const touchButtons = [...document.querySelectorAll("[data-touch]")];
const telemetryMode = document.querySelector("#telemetry-mode");
const telemetryState = document.querySelector("#telemetry-state");
const worldLabelContainer = document.querySelector("#world-labels");
const heroCopy = document.querySelector(".hero-copy");
const startRide = document.querySelector("#start-ride");
const brandHome = document.querySelector("#brand-home");
const localTime = document.querySelector("#local-time");
const minimapCanvas = document.querySelector("#minimap");
const minimapContext = minimapCanvas.getContext("2d");
const minimapCoordinate = document.querySelector("#minimap-coordinate");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 760px)").matches;

createIcons({
  icons: {
    Pause,
    Play,
    Route,
    Camera,
    ChevronLeft,
    ChevronRight,
    ArrowDown,
    CircleStop,
    Gauge,
    Code2,
    ScanEye,
    Volume2,
    VolumeX,
  },
  attrs: {
    "stroke-width": 1.7,
  },
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.08, 420);
camera.position.set(4, 3, -7);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobile,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.35 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;

const route = createRoute();
const world = createWulingWorld(scene, route);
const bicycle = createBicycle();
scene.add(bicycle.group);
bicycle.group.visible = false;

let rider = null;
let rideReady = false;
let playing = !reducedMotion;
let speedMultiplier = 1;
let rideMode = "auto";
let routeT = 0.025;
let totalDistance = 0;
let activeCamera = "chase";
let cameraLift = 0;
let cameraSideOffset = 0;
let pointerDown = false;
let pointerMoved = false;
let previousPointer = new THREE.Vector2();
let activeStopIndex = -1;
let routeDirty = true;
let cameraSnap = true;
let elapsedTime = 0;
let lastFrameTime = performance.now();

const freeRide = {
  position: new THREE.Vector3(),
  heading: 0,
  speed: 0,
  steer: 0,
  steerVisual: 0,
  throttle: 0,
  brake: 0,
  footDown: 0,
  reverse: 0,
  supportSide: 1,
  supportTarget: 1,
  supportTransition: 0,
  bothFeet: 0,
  lateralBias: 0,
  lean: 0,
  suspension: 0,
  nearestT: routeT,
  nearestDistance: 0,
  inZone: null,
  collisionPulse: 0,
};
const pathFollower = {
  initialized: false,
  heading: 0,
  integral: 0,
  previousError: 0,
  derivative: 0,
  steering: 0,
  bank: 0,
  speed: 0,
  returning: false,
};
const keys = new Set();
const touchState = {
  throttle: false,
  brake: false,
  reverse: false,
  left: false,
  right: false,
};
const RIDER_CLEARANCE = 0.76;
const BIKE_COLLISION_RADIUS = 0.54;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const RIDE_OBSTACLES = world.rideObstacles;
const MINIMAP_BOUNDS = { minX: -68, maxX: 68, minZ: -8, maxZ: 88 };
const MINIMAP_BLOCKS = [
  [-24, 19, 19, 10],
  [17, 19, 20, 10],
  [-24, 41, 20, 11],
  [18, 41, 21, 11],
  [-24, 63, 20, 10],
  [18, 63, 20, 10],
  [-54, 41, 11, 10],
  [-54, 63, 11, 10],
  [53, 19, 12, 10],
  [53, 41, 12, 11],
];

const smoothCameraPosition = new THREE.Vector3();
const smoothCameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const desiredCameraTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const bikePosition = new THREE.Vector3();
const bikeTangent = new THREE.Vector3();
const localCamera = new THREE.Vector3();
const localLook = new THREE.Vector3();
const projected = new THREE.Vector3();
const minimapSize = { width: 0, height: 0, pixelRatio: 0 };
const worldLabels = world.labels.map((item) => {
  const element = document.createElement("span");
  element.className = "world-label";
  element.innerHTML = `${item.name}<small>${item.english}</small>`;
  worldLabelContainer.appendChild(element);
  return { ...item, element };
});

const stopNotes = new Map();

function initializeStops() {
  stopNotes.clear();
  route.stops.forEach((stop, index) => {
    stopNotes.set(index, stop.note);
  });
  updateStop(0, false);
}

function updateLoading(percent) {
  const clamped = THREE.MathUtils.clamp(percent, 0, 100);
  loadingBar.style.width = `${clamped}%`;
  loadingValue.textContent = `${Math.round(clamped)}%`;
}

function finishLoading() {
  updateLoading(100);
  window.setTimeout(() => {
    loadingScreen.classList.add("hidden");
    rideReady = true;
    bicycle.group.visible = true;
    cameraSnap = true;
  }, 380);
}

function createFallbackRider() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#e8eeea",
    roughness: 0.65,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: "#1d3542",
    roughness: 0.55,
  });
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: "#e5e3df",
    roughness: 0.72,
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.38, 8, 12), bodyMaterial);
  torso.position.set(0, 1.18, -0.1);
  torso.rotation.x = 0.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), hairMaterial);
  head.position.set(0, 1.61, -0.01);
  group.add(head);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.14), darkMaterial);
  backpack.position.set(0, 1.2, -0.3);
  group.add(backpack);
  bicycle.visual.add(group);
  return {
    group,
    updatePose() {},
  };
}

function loadModel() {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    updateLoading((loaded / Math.max(1, total)) * 92);
  };

  const loader = new GLTFLoader(manager);
  loader.load(
    `${import.meta.env.BASE_URL}assets/models/perlica_rigged.glb`,
    async (gltf) => {
      rider = await loadRider(gltf, bicycle);
      updateLoading(100);
      finishLoading();
    },
    (event) => {
      if (event.lengthComputable) {
        updateLoading(12 + (event.loaded / event.total) * 82);
      }
    },
    (error) => {
      console.error("Perlica model failed to load.", error);
      rider = createFallbackRider();
      finishLoading();
    },
  );
}

function setIcon(button, name) {
  button.querySelector("svg")?.remove();
  const icon = document.createElement("i");
  icon.dataset.lucide = name;
  button.prepend(icon);
  createIcons({
    icons: {
      Pause,
      Play,
      Route,
      Camera,
      ChevronLeft,
      ChevronRight,
      ArrowDown,
      CircleStop,
      Gauge,
      Code2,
      ScanEye,
      Volume2,
      VolumeX,
    },
    attrs: {
      "stroke-width": 1.7,
    },
  });
}

function setPlaying(nextPlaying) {
  playing = nextPlaying;
  playToggle.setAttribute("aria-label", playing ? "暂停" : "播放");
  playToggle.dataset.tooltip = playing ? "暂停" : "播放";
  setIcon(playToggle, playing ? "pause" : "play");
  app.classList.toggle("paused", !playing);
}

function updateStop(index, animate = true) {
  if (index === activeStopIndex || !route.stops[index]) return;
  activeStopIndex = index;
  const stop = route.stops[index];

  routeStopElements.forEach((element, elementIndex) => {
    element.classList.toggle("active", elementIndex === index);
    element.classList.toggle("passed", elementIndex < index);
  });

  locationIndex.textContent = stop.index;
  locationName.textContent = stop.name;
  locationNote.textContent = stop.note;
  progressLabel.textContent = stop.name;

  if (animate) {
    locationCard.classList.add("updating");
    window.setTimeout(() => locationCard.classList.remove("updating"), 220);
  }
}

function getStopIndex(t) {
  let index = 0;
  for (let i = 0; i < route.stops.length; i++) {
    if (t + 0.006 >= route.stops[i].t) index = i;
  }
  return index;
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function getRideZone(position) {
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const zone of RIDE_ZONES) {
    if (zone.shape === "rect") {
      const halfX = Math.max(0, zone.halfX - RIDER_CLEARANCE);
      const halfZ = Math.max(0, zone.halfZ - RIDER_CLEARANCE);
      const distanceX = Math.max(0, Math.abs(position.x - zone.x) - halfX);
      const distanceZ = Math.max(0, Math.abs(position.z - zone.z) - halfZ);
      const distance = Math.hypot(distanceX, distanceZ);
      if (distance <= 0 && distance < closestDistance) {
        closest = zone;
        closestDistance = distance;
      }
      continue;
    }
    const distance = Math.max(
      0,
      Math.hypot(position.x - zone.x, position.z - zone.z) - Math.max(0, zone.radius - RIDER_CLEARANCE),
    );
    if (distance <= 0 && distance < closestDistance) {
      closest = zone;
      closestDistance = distance;
    }
  }
  return closest;
}

function projectIntoRideZone(position, zone) {
  if (zone.shape === "rect") {
    const halfX = Math.max(0, zone.halfX - RIDER_CLEARANCE);
    const halfZ = Math.max(0, zone.halfZ - RIDER_CLEARANCE);
    return new THREE.Vector3(
      THREE.MathUtils.clamp(position.x, zone.x - halfX, zone.x + halfX),
      zone.y,
      THREE.MathUtils.clamp(position.z, zone.z - halfZ, zone.z + halfZ),
    );
  }
  const dx = position.x - zone.x;
  const dz = position.z - zone.z;
  const distance = Math.hypot(dx, dz);
  const safeRadius = Math.max(0, zone.radius - RIDER_CLEARANCE);
  if (distance <= safeRadius) return new THREE.Vector3(position.x, zone.y, position.z);
  return new THREE.Vector3(
    zone.x + (dx / distance) * safeRadius,
    zone.y,
    zone.z + (dz / distance) * safeRadius,
  );
}

function syncFreeRideFromRoute() {
  freeRide.position.copy(route.curve.getPointAt(routeT));
  const tangent = route.curve.getTangentAt(routeT).normalize();
  freeRide.heading = Math.atan2(tangent.x, tangent.z);
  freeRide.speed = THREE.MathUtils.clamp(2.4 * speedMultiplier, 1.5, 4.8);
  freeRide.steer = 0;
  freeRide.steerVisual = 0;
  freeRide.footDown = 0;
  freeRide.supportSide = 1;
  freeRide.supportTarget = 1;
  freeRide.supportTransition = 0;
  freeRide.bothFeet = 0;
  freeRide.lateralBias = 0;
  freeRide.lean = 0;
  freeRide.suspension = 0;
  freeRide.nearestT = routeT;
}

function setRideMode(nextMode) {
  if (nextMode === rideMode) return;
  if (nextMode === "free") {
    syncFreeRideFromRoute();
    keys.clear();
  } else {
    routeT = freeRide.nearestT;
    routeDirty = true;
    pathFollower.initialized = false;
    pathFollower.integral = 0;
    pathFollower.previousError = 0;
    pathFollower.derivative = 0;
    pathFollower.steering = 0;
    pathFollower.bank = 0;
    pathFollower.speed = 0;
    pathFollower.returning = false;
  }
  rideMode = nextMode;
  app.classList.toggle("free-mode", rideMode === "free");
  if (rideMode === "free") app.classList.add("ride-started");
  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === rideMode);
  });
  telemetryMode.textContent = rideMode === "free" ? "自由" : "巡游";
  cameraSnap = true;
  if (rideMode === "free") {
    heroCopy.classList.add("compact");
    setPlaying(true);
  }
}

function constrainFreeRide() {
  const routeInfo = route.distanceToRoute(freeRide.position.x, freeRide.position.z);
  const zone = getRideZone(freeRide.position);
  const roadLimit = 5.8 - RIDER_CLEARANCE;
  freeRide.nearestT = routeInfo.nearest.t;
  freeRide.nearestDistance = routeInfo.distance;
  freeRide.inZone = zone;

  if (routeInfo.distance <= roadLimit || zone) return routeInfo;

  let nearestZonePoint = null;
  let nearestZoneDistance = Number.POSITIVE_INFINITY;
  for (const candidate of RIDE_ZONES) {
    const projected = projectIntoRideZone(freeRide.position, candidate);
    const distance = projected.distanceToSquared(freeRide.position);
    if (distance < nearestZoneDistance) {
      nearestZoneDistance = distance;
      nearestZonePoint = projected;
    }
  }

  const roadOutside = routeInfo.distance - roadLimit;
  const zoneOutside = Math.sqrt(nearestZoneDistance);
  if (nearestZonePoint && zoneOutside < roadOutside) {
    freeRide.position.x = nearestZonePoint.x;
    freeRide.position.z = nearestZonePoint.z;
    freeRide.speed *= 0.76;
    freeRide.collisionPulse = 1;
    freeRide.inZone = getRideZone(freeRide.position);
    return route.distanceToRoute(freeRide.position.x, freeRide.position.z);
  }

  const side = new THREE.Vector3(
    freeRide.position.x - routeInfo.nearest.position.x,
    0,
    freeRide.position.z - routeInfo.nearest.position.z,
  );
  if (side.lengthSq() < 0.0001) {
    side.copy(new THREE.Vector3().crossVectors(routeInfo.nearest.tangent, new THREE.Vector3(0, 1, 0)));
  }
  side.normalize();
  freeRide.position.x = routeInfo.nearest.position.x + side.x * roadLimit;
  freeRide.position.z = routeInfo.nearest.position.z + side.z * roadLimit;
  freeRide.speed *= 0.72;
  freeRide.collisionPulse = 1;
  return routeInfo;
}

function resolveRideObstacles(position = freeRide.position) {
  for (const obstacle of RIDE_OBSTACLES) {
    let pushX = 0;
    let pushZ = 0;

    if (obstacle.shape === "rect") {
      const dx = position.x - obstacle.x;
      const dz = position.z - obstacle.z;
      const overlapX = obstacle.halfX + BIKE_COLLISION_RADIUS - Math.abs(dx);
      const overlapZ = obstacle.halfZ + BIKE_COLLISION_RADIUS - Math.abs(dz);
      if (overlapX <= 0 || overlapZ <= 0) continue;
      if (overlapX < overlapZ) {
        pushX = Math.sign(dx || 1) * overlapX;
      } else {
        pushZ = Math.sign(dz || 1) * overlapZ;
      }
    } else {
      const dx = position.x - obstacle.x;
      const dz = position.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const safeRadius = obstacle.radius + BIKE_COLLISION_RADIUS;
      if (distance >= safeRadius) continue;
      if (distance < 0.0001) {
        pushX = safeRadius;
      } else {
        const push = safeRadius - distance;
        pushX = (dx / distance) * push;
        pushZ = (dz / distance) * push;
      }
    }

    if (pushX === 0 && pushZ === 0) continue;
    position.x += pushX;
    position.z += pushZ;
    if (position === freeRide.position) {
      freeRide.speed *= 0.68;
      freeRide.collisionPulse = 1;
    }
  }
}

function updateFreeRide(delta) {
  const forwardInput = touchState.throttle || keys.has("KeyW") || keys.has("ArrowUp");
  const brakeInput = touchState.brake || keys.has("Space");
  const reverseInput = touchState.reverse || keys.has("KeyS") || keys.has("ArrowDown");
  const steerInput =
    (touchState.right || keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0)
    - (touchState.left || keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);

  const boost = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const maxSpeed = (boost ? 12.5 : 8.4) * THREE.MathUtils.clamp(speedMultiplier, 0.65, 1.5);
  const maxReverseSpeed = 1.45;
  const throttle = forwardInput && !reverseInput ? (boost ? 1 : 0.68) : 0;
  const brake = brakeInput ? 1 : 0;
  const reverse = reverseInput ? 1 : 0;
  const rollingDrag = Math.abs(freeRide.speed) > 0.01
    ? (0.32 + Math.abs(freeRide.speed) * 0.055) * Math.sign(freeRide.speed)
    : 0;
  const brakeForce = 12.5;

  freeRide.throttle = THREE.MathUtils.damp(freeRide.throttle, throttle, 8, delta);
  freeRide.brake = THREE.MathUtils.damp(freeRide.brake, brake, 12, delta);
  freeRide.reverse = THREE.MathUtils.damp(freeRide.reverse, reverse, 8, delta);
  freeRide.speed += (
    freeRide.throttle * 6.8
    - rollingDrag
    - freeRide.brake * brakeForce
    - freeRide.reverse * 2.8
  ) * delta;
  freeRide.speed = THREE.MathUtils.clamp(freeRide.speed, -maxReverseSpeed, maxSpeed);

  const steerLimit = THREE.MathUtils.lerp(
    0.62,
    0.42,
    THREE.MathUtils.clamp(Math.abs(freeRide.speed) / maxSpeed, 0, 1),
  );
  const steerTarget = steerInput * steerLimit;
  freeRide.steer = THREE.MathUtils.damp(freeRide.steer, steerTarget, steerInput ? 7.5 : 9.5, delta);
  freeRide.steerVisual = THREE.MathUtils.damp(freeRide.steerVisual, freeRide.steer, 10, delta);

  if (Math.abs(freeRide.speed) > 0.12) {
    const speedFactor = THREE.MathUtils.clamp(Math.abs(freeRide.speed) / 7.2, 0.08, 1);
    freeRide.heading -= (
      freeRide.steerVisual
      * Math.sign(freeRide.speed)
      * speedFactor
      * delta
      * (2.15 + Math.abs(freeRide.speed) * 0.08)
    );
  }

  const motion = new THREE.Vector3(
    Math.sin(freeRide.heading),
    0,
    Math.cos(freeRide.heading),
  );
  const travelDistance = freeRide.speed * delta;
  const substeps = Math.max(1, Math.ceil(travelDistance / 0.1));
  const substepDelta = delta / substeps;
  let routeInfo = null;
  for (let step = 0; step < substeps; step++) {
    freeRide.position.addScaledVector(motion, freeRide.speed * substepDelta);
    resolveRideObstacles();
    routeInfo = constrainFreeRide();
    resolveRideObstacles();
  }
  routeInfo ??= constrainFreeRide();
  const groundY = freeRide.inZone ? freeRide.inZone.y : routeInfo.nearest.position.y + 0.04;
  freeRide.position.y = THREE.MathUtils.damp(freeRide.position.y, groundY, 9, delta);
  freeRide.collisionPulse = THREE.MathUtils.damp(freeRide.collisionPulse, 0, 4.5, delta);

  const stopping = Math.abs(freeRide.speed) < 0.75;
  const footDownTarget = stopping || freeRide.brake > 0.55 || freeRide.reverse > 0.2 ? 1 : 0;
  const speedLean = THREE.MathUtils.clamp(Math.abs(freeRide.speed) / 9, 0, 1);
  freeRide.lateralBias = THREE.MathUtils.damp(
    freeRide.lateralBias,
    -freeRide.steerVisual * (0.08 + speedLean * 0.92),
    3.6,
    delta,
  );
  freeRide.footDown = THREE.MathUtils.damp(freeRide.footDown, footDownTarget, stopping ? 3.4 : 7.5, delta);
  if (footDownTarget > 0.5) {
    const requestedSupport = freeRide.lateralBias > 0.008
      ? 1
      : freeRide.lateralBias < -0.008
        ? -1
        : freeRide.supportTarget;
    if (requestedSupport !== freeRide.supportTarget && requestedSupport !== freeRide.supportSide) {
      freeRide.supportTarget = requestedSupport;
      freeRide.supportTransition = 0.58;
    }
    if (freeRide.supportTransition > 0) {
      freeRide.bothFeet = THREE.MathUtils.damp(freeRide.bothFeet, 1, 15, delta);
      freeRide.supportTransition = Math.max(0, freeRide.supportTransition - delta);
      if (freeRide.supportTransition === 0) {
        freeRide.supportSide = freeRide.supportTarget;
      }
    } else {
      freeRide.bothFeet = THREE.MathUtils.damp(freeRide.bothFeet, 0, 10, delta);
    }
  } else {
    freeRide.bothFeet = THREE.MathUtils.damp(freeRide.bothFeet, 0, 12, delta);
    freeRide.supportTransition = 0;
  }
  freeRide.lean = THREE.MathUtils.damp(
    freeRide.lean,
    -freeRide.lateralBias * speedLean * 0.78
      + freeRide.footDown * -freeRide.supportSide * 0.09,
    7,
    delta,
  );
  freeRide.suspension = THREE.MathUtils.damp(
    freeRide.suspension,
    -Math.min(0.055, freeRide.brake * 0.05 + freeRide.collisionPulse * 0.025),
    11,
    delta,
  );

  bikePosition.copy(freeRide.position);
  const tangent = routeInfo.nearest.tangent;
  bikeTangent.copy(tangent);
  const slopePitch = -Math.asin(THREE.MathUtils.clamp(tangent.y, -0.32, 0.32));
  bicycle.group.position.copy(freeRide.position);
  bicycle.group.rotation.order = "YXZ";
  bicycle.group.rotation.set(
    slopePitch + freeRide.brake * 0.025,
    freeRide.heading,
    freeRide.lean,
    "YXZ",
  );
  bicycle.group.updateMatrixWorld();
  bicycle.group.visible = rideReady;

  bikePosition.copy(freeRide.position);
  let drivetrain = bicycle.updateDrivetrain(freeRide.speed * delta);
  if (Math.abs(freeRide.speed) < 0.35 || freeRide.reverse > 0.2) {
    drivetrain = bicycle.settleCrank(delta, freeRide.supportSide);
  }
  bicycle.group.userData.crankAngle = drivetrain.crankAngle;
  bicycle.group.userData.drivetrain = drivetrain;
  bicycle.setSteering(-freeRide.steerVisual * 0.72);
  bicycle.setSuspension(freeRide.suspension);
  bicycle.setRideEnergy(THREE.MathUtils.clamp(freeRide.speed / 9, 0, 1));
  totalDistance += Math.abs(freeRide.speed) * delta;

  if (rider) {
    rider.group.position.x = THREE.MathUtils.damp(
      rider.group.position.x,
      freeRide.footDown * 0.065,
      8,
      delta,
    );
    rider.group.position.y = THREE.MathUtils.damp(
      rider.group.position.y,
      0.01 - freeRide.footDown * 0.018,
      8,
      delta,
    );
    rider.updatePose(elapsedTime, {
      speed: freeRide.speed,
      steer: freeRide.steerVisual,
      braking: freeRide.brake,
      footDown: freeRide.footDown,
      reverse: freeRide.reverse,
      supportSide: freeRide.supportSide,
      bothFeet: freeRide.bothFeet,
    });
  }

  return {
    yaw: freeRide.heading,
    pitch: slopePitch,
    bank: freeRide.lean,
  };
}

function updateBike(delta) {
  if (rideMode === "free") return updateFreeRide(delta);

  const targetSpeed = 5.16 * speedMultiplier;
  if (!pathFollower.initialized) {
    if (bikePosition.lengthSq() < 0.001) {
      bikePosition.copy(route.curve.getPointAt(routeT));
      const initialTangent = route.curve.getTangentAt(routeT).normalize();
      pathFollower.heading = Math.atan2(initialTangent.x, initialTangent.z);
    } else {
      pathFollower.heading = freeRide.heading;
    }
    pathFollower.integral = 0;
    pathFollower.previousError = 0;
    pathFollower.derivative = 0;
    pathFollower.steering = 0;
    pathFollower.bank = 0;
    pathFollower.speed = 0;
    pathFollower.returning = false;
    pathFollower.initialized = true;
  }

  let pathInfo = route.distanceToRoute(bikePosition.x, bikePosition.z);
  routeT = pathInfo.nearest.t;
  const roadLimit = 5.8;
  pathFollower.returning = pathInfo.distance > roadLimit;
  if (delta > 0) {
    const tangent = pathInfo.nearest.tangent;
    pathFollower.speed = THREE.MathUtils.damp(
      pathFollower.speed,
      targetSpeed,
      1.15,
      delta,
    );
    const lookaheadDistance = THREE.MathUtils.clamp(
      5.2 + pathFollower.speed * 0.64,
      5.8,
      11.5,
    );
    const targetT = (routeT + lookaheadDistance / route.length + 1) % 1;
    const targetPoint = pathFollower.returning
      ? pathInfo.nearest.position
      : route.curve.getPointAt(targetT);
    const desiredHeading = Math.atan2(
      targetPoint.x - bikePosition.x,
      targetPoint.z - bikePosition.z,
    );
    const headingError = wrapAngle(desiredHeading - pathFollower.heading);
    const side = new THREE.Vector3().crossVectors(tangent, WORLD_UP).normalize();
    const crossTrack = new THREE.Vector3(
      bikePosition.x - pathInfo.nearest.position.x,
      0,
      bikePosition.z - pathInfo.nearest.position.z,
    ).dot(side);
    const controlError = headingError - (
      pathFollower.returning
        ? 0
        : THREE.MathUtils.clamp(crossTrack * 0.16, -0.42, 0.42)
    );
    pathFollower.integral = THREE.MathUtils.clamp(
      pathFollower.integral + controlError * delta,
      -0.8,
      0.8,
    );
    pathFollower.derivative = THREE.MathUtils.clamp(
      (controlError - pathFollower.previousError) / Math.max(delta, 0.001),
      -1.4,
      1.4,
    );
    pathFollower.previousError = controlError;
    const rawSteering = THREE.MathUtils.clamp(
      0.92 * controlError
        + 0.032 * pathFollower.integral
        + 0.075 * pathFollower.derivative,
      -0.44,
      0.44,
    );
    pathFollower.steering = THREE.MathUtils.damp(
      pathFollower.steering,
      rawSteering,
      4.2,
      delta,
    );
    pathFollower.heading = wrapAngle(
      pathFollower.heading + pathFollower.steering * (pathFollower.speed / 1.08) * delta,
    );
    const motion = new THREE.Vector3(
      Math.sin(pathFollower.heading),
      0,
      Math.cos(pathFollower.heading),
    );
    const travelDistance = pathFollower.speed * delta;
    const substeps = Math.max(1, Math.ceil(travelDistance / 0.1));
    const substepDelta = delta / substeps;
    for (let step = 0; step < substeps; step++) {
      bikePosition.addScaledVector(motion, pathFollower.speed * substepDelta);
      resolveRideObstacles(bikePosition);
    }

    pathInfo = route.distanceToRoute(bikePosition.x, bikePosition.z);
    if (pathFollower.returning && pathInfo.distance <= roadLimit * 0.92) {
      pathFollower.returning = false;
    }
    if (!pathFollower.returning && pathInfo.distance > roadLimit) {
      const correction = new THREE.Vector3(
        bikePosition.x - pathInfo.nearest.position.x,
        0,
        bikePosition.z - pathInfo.nearest.position.z,
      );
      if (correction.lengthSq() < 0.0001) {
        correction.crossVectors(pathInfo.nearest.tangent, WORLD_UP).normalize();
      } else {
        correction.normalize();
      }
      bikePosition.x = pathInfo.nearest.position.x + correction.x * roadLimit;
      bikePosition.z = pathInfo.nearest.position.z + correction.z * roadLimit;
      pathInfo = route.distanceToRoute(bikePosition.x, bikePosition.z);
    }
    routeT = pathInfo.nearest.t;
  }

  bikeTangent.copy(pathInfo.nearest.tangent).normalize();
  bikePosition.y = THREE.MathUtils.damp(
    bikePosition.y,
    pathInfo.nearest.position.y,
    9,
    delta,
  );
  const yaw = pathFollower.heading;
  const pitch = -Math.asin(THREE.MathUtils.clamp(bikeTangent.y, -0.35, 0.35));
  const steering = pathFollower.steering;
  const bankTarget = THREE.MathUtils.clamp(-steering * 0.42, -0.17, 0.17);
  pathFollower.bank = THREE.MathUtils.damp(pathFollower.bank, bankTarget, 3.2, delta);

  bicycle.group.position.copy(bikePosition);
  bicycle.group.rotation.order = "YXZ";
  bicycle.group.rotation.set(pitch, yaw, pathFollower.bank, "YXZ");
  bicycle.group.updateMatrixWorld();
  bicycle.group.visible = rideReady;

  totalDistance += pathFollower.speed * delta;
  const drivetrain = bicycle.updateDrivetrain(pathFollower.speed * delta);
  bicycle.group.userData.crankAngle = drivetrain.crankAngle;
  bicycle.group.userData.drivetrain = drivetrain;
  bicycle.setSteering(steering);
  bicycle.setSuspension(0);
  bicycle.setRideEnergy(THREE.MathUtils.clamp(pathFollower.speed / 8, 0, 1));

  if (rider) {
    rider.group.position.x = THREE.MathUtils.damp(rider.group.position.x, 0, 8, delta);
    rider.group.position.y = THREE.MathUtils.damp(rider.group.position.y, 0.01, 8, delta);
    rider.updatePose(elapsedTime, {
      speed: pathFollower.speed,
      steer: steering,
      braking: 0,
      footDown: 0,
    });
  }

  return {
    yaw,
    pitch,
    bank: pathFollower.bank,
  };
}

function getCameraRig() {
  const chaseDistance = isMobile ? 4.6 : 3.85;
  const cinemaTime = elapsedTime * 0.24;

  if (isMobile) {
    if (activeCamera === "low") {
      localCamera.set(-2.25 + cameraSideOffset * 0.35, 1.25 + cameraLift * 0.4, -5.8);
      localLook.set(0.82, 0.82, 0.2);
    } else if (activeCamera === "cinema") {
      localCamera.set(
        0.8 + Math.sin(cinemaTime) * 0.65,
        4.8 + cameraLift * 0.45,
        -9.2,
      );
      localLook.set(0, 0.95, 0.2);
    } else {
      localCamera.set(-2.05 + cameraSideOffset * 0.25, 1.82 + cameraLift * 0.45, -7.25);
      localLook.set(0, 0.92, 0);
    }
    desiredCameraPosition.copy(localCamera).applyQuaternion(bicycle.group.quaternion).add(bikePosition);
    desiredCameraTarget.copy(bikePosition).setY(bikePosition.y + 0.92);
    return;
  }

  if (activeCamera === "low") {
    localCamera.set(-2.2 + cameraSideOffset, 1.08 + cameraLift, -2);
    localLook.set(0, 0.88, 1.0);
  } else if (activeCamera === "cinema") {
    localCamera.set(
      1.55 + Math.sin(cinemaTime) * 1.35 + cameraSideOffset,
      4.15 + Math.sin(cinemaTime * 1.4) * 0.55 + cameraLift,
      -8.1 + Math.cos(cinemaTime) * 0.8,
    );
    localLook.set(0, 1.0, 0.95);
  } else {
    localCamera.set(-2.45 + cameraSideOffset * 0.7, 1.5 + cameraLift, -chaseDistance);
    localLook.set(0, 0.94, 0.72);
  }

  desiredCameraPosition.copy(localCamera).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);
  desiredCameraPosition.applyQuaternion(bicycle.group.quaternion).add(bikePosition);
  desiredCameraTarget.copy(localLook).applyQuaternion(bicycle.group.quaternion).add(bikePosition);
}

function updateCamera(delta) {
  getCameraRig();
  if (cameraSnap) {
    smoothCameraPosition.copy(desiredCameraPosition);
    smoothCameraTarget.copy(desiredCameraTarget);
    cameraSnap = false;
  } else {
    const positionFactor = 1 - Math.exp(-delta * 4.5);
    const targetFactor = 1 - Math.exp(-delta * 6.5);
    smoothCameraPosition.lerp(desiredCameraPosition, positionFactor);
    smoothCameraTarget.lerp(desiredCameraTarget, targetFactor);
  }
  camera.position.copy(smoothCameraPosition);
  camera.lookAt(smoothCameraTarget);

  const speedFov = rideMode === "free" ? THREE.MathUtils.clamp(freeRide.speed * 0.32, 0, 3.2) : 0;
  camera.fov = (activeCamera === "cinema" ? 38 : 43) + speedFov;
  if (rideMode === "free") camera.rotateZ(-freeRide.lean * 0.14);
  camera.updateProjectionMatrix();
}

function updateTelemetry(delta) {
  const speed = rideMode === "free" ? freeRide.speed * 3.6 : 18.6 * speedMultiplier;
  const elevation = Math.round(1018 + bikePosition.y * 2.75);
  telemetrySpeed.textContent = speed.toFixed(1);
  telemetryDistance.textContent = (totalDistance / 1000).toFixed(2);
  telemetryElevation.textContent = elevation.toLocaleString("zh-CN");

  const displayT = rideMode === "free" ? freeRide.nearestT : routeT;
  const percentage = displayT * 100;
  progressFill.style.width = `${percentage}%`;
  progressThumb.style.left = `${percentage}%`;
  progressValue.textContent = `${Math.round(percentage)}%`;

  const nextStop = getStopIndex(displayT);
  updateStop(nextStop);
  telemetryMode.textContent = rideMode === "free" ? "自由" : "巡游";
  if (rideMode === "free") {
    telemetryState.textContent = freeRide.reverse > 0.25
      ? "倒退"
      : freeRide.footDown > 0.55
        ? "落脚"
      : freeRide.brake > 0.45
        ? "制动"
        : Math.abs(freeRide.steer || freeRide.steerVisual) > 0.06
          ? "转向"
          : freeRide.speed > 0.4
            ? "踩踏"
            : "待机";
  } else {
    telemetryState.textContent = "巡航";
  }
}

function drawMinimap() {
  const rect = minimapCanvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  if (
    minimapSize.width !== rect.width
    || minimapSize.height !== rect.height
    || minimapSize.pixelRatio !== pixelRatio
  ) {
    minimapSize.width = rect.width;
    minimapSize.height = rect.height;
    minimapSize.pixelRatio = pixelRatio;
    minimapCanvas.width = Math.round(rect.width * pixelRatio);
    minimapCanvas.height = Math.round(rect.height * pixelRatio);
  }

  const context = minimapContext;
  const width = rect.width;
  const height = rect.height;
  const padding = 5;
  const mapWidth = width - padding * 2;
  const mapHeight = height - padding * 2;
  const project = (x, z) => [
    padding + ((x - MINIMAP_BOUNDS.minX) / (MINIMAP_BOUNDS.maxX - MINIMAP_BOUNDS.minX)) * mapWidth,
    padding + ((MINIMAP_BOUNDS.maxZ - z) / (MINIMAP_BOUNDS.maxZ - MINIMAP_BOUNDS.minZ)) * mapHeight,
  ];
  const projectRect = (x, z, halfX, halfZ) => {
    const [left, top] = project(x - halfX, z + halfZ);
    const [right, bottom] = project(x + halfX, z - halfZ);
    return [left, top, right - left, bottom - top];
  };

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#42514e";
  context.fillRect(0, 0, width, height);

  context.save();
  context.beginPath();
  context.rect(padding, padding, mapWidth, mapHeight);
  context.clip();
  const haze = context.createRadialGradient(
    width * 0.5,
    height * 0.45,
    2,
    width * 0.5,
    height * 0.45,
    width * 0.72,
  );
  haze.addColorStop(0, "rgba(194, 207, 190, .42)");
  haze.addColorStop(0.72, "rgba(116, 139, 122, .2)");
  haze.addColorStop(1, "rgba(32, 56, 56, .52)");
  context.fillStyle = haze;
  context.fillRect(padding, padding, mapWidth, mapHeight);

  context.fillStyle = "rgba(112, 151, 107, .28)";
  context.beginPath();
  context.ellipse(width * 0.18, height * 0.2, width * 0.2, height * 0.3, 0.35, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(width * 0.88, height * 0.7, width * 0.26, height * 0.32, -0.25, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(235, 245, 230, .07)";
  context.lineWidth = 0.7;
  for (let line = -60; line <= 80; line += 10) {
    const [x] = project(line, 0);
    const [, y] = project(0, line);
    context.beginPath();
    context.moveTo(x, padding);
    context.lineTo(x, height - padding);
    context.stroke();
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();
  }

  context.fillStyle = "rgba(222, 220, 205, .92)";
  context.strokeStyle = "rgba(28, 42, 42, .46)";
  context.lineWidth = 1;
  for (const [x, z, blockWidth, blockDepth] of MINIMAP_BLOCKS) {
    const [left, top, drawWidth, drawHeight] = projectRect(
      x,
      z,
      blockWidth * 0.5,
      blockDepth * 0.5,
    );
    context.fillRect(left, top, drawWidth, drawHeight);
    context.strokeRect(left, top, drawWidth, drawHeight);
  }

  context.lineCap = "round";
  context.strokeStyle = "#d8d6c8";
  context.lineWidth = 6;
  for (const road of FANGXING_ROADS.horizontal) {
    const [, y] = project(0, road.z);
    context.beginPath();
    context.moveTo(project(-62, 0)[0], y);
    context.lineTo(project(62, 0)[0], y);
    context.stroke();
  }
  for (const road of FANGXING_ROADS.vertical) {
    const [x] = project(road.x, 0);
    context.beginPath();
    context.moveTo(x, project(0, 80)[1]);
    context.lineTo(x, project(0, -3)[1]);
    context.stroke();
  }

  context.strokeStyle = "rgba(122, 239, 223, .92)";
  context.lineWidth = 1.5;
  context.setLineDash([5, 3]);
  context.beginPath();
  route.samples.forEach((sample, index) => {
    const [x, y] = project(sample.position.x, sample.position.z);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.stroke();
  context.setLineDash([]);

  for (const [index, stop] of route.stops.entries()) {
    const point = route.curve.getPointAt(stop.t);
    const [x, y] = project(point.x, point.z);
    context.fillStyle = index === activeStopIndex ? "#ff9a58" : "#e9f5ef";
    context.strokeStyle = "#173a3e";
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(x, y, index === activeStopIndex ? 3.4 : 2.4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  const [playerX, playerY] = project(bikePosition.x, bikePosition.z);
  const screenHeading = Math.atan2(-Math.cos(bicycle.group.rotation.y), Math.sin(bicycle.group.rotation.y));
  context.save();
  context.translate(playerX, playerY);
  context.rotate(screenHeading);
  context.fillStyle = "#f7fff9";
  context.strokeStyle = "#16383c";
  context.lineWidth = 1.2;
  context.shadowColor = "#7bfff0";
  context.shadowBlur = 7;
  context.beginPath();
  context.moveTo(6.5, 0);
  context.lineTo(-4, 3.6);
  context.lineTo(-2, 0);
  context.lineTo(-4, -3.6);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();

  context.strokeStyle = "rgba(235, 249, 242, .36)";
  context.lineWidth = 1;
  context.strokeRect(padding, padding, mapWidth, mapHeight);
  context.fillStyle = "rgba(239, 250, 244, .76)";
  context.font = "700 7px Bahnschrift, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "top";
  context.fillText("N", width - 8, 6);
  context.restore();

  minimapCoordinate.textContent = `X ${bikePosition.x >= 0 ? "+" : ""}${bikePosition.x.toFixed(1)} / Z ${bikePosition.z >= 0 ? "+" : ""}${bikePosition.z.toFixed(1)}`;
}

function updateWorldLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (const label of worldLabels) {
    projected.copy(label.position).project(camera);
    const inFront = projected.z < 1;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const distance = camera.position.distanceTo(label.position);
    const visible = inFront && x > -100 && x < width + 100 && y > 90 && y < height - 90 && distance < 145;
    label.element.style.opacity = visible ? String(THREE.MathUtils.mapLinear(distance, 0, 145, 0.82, 0.15)) : "0";
    label.element.style.left = `${x}px`;
    label.element.style.top = `${y}px`;
  }
}

const ambientSound = new RideMusic(`${import.meta.env.BASE_URL}assets/audio/wuling-cloudway.wav`);

function updateClock() {
  const now = new Date();
  localTime.textContent = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, width <= 760 ? 1.35 : 1.75));
  renderer.setSize(width, height, false);
}

function animate() {
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  elapsedTime += delta;
  const elapsed = elapsedTime;

  if (rideReady) {
    if (playing) {
      updateBike(delta);
      updateTelemetry(delta);
    } else if (routeDirty) {
      updateBike(0);
      updateTelemetry(0);
      routeDirty = false;
    } else if (rider) {
      rider.updatePose(elapsed, {
        speed: 0,
        steer: rideMode === "free" ? freeRide.steerVisual : 0,
        braking: 1,
        footDown: 1,
      });
    }
  } else {
    bicycle.group.position.set(0, 1.2, 84);
  }

  world.update(elapsed, delta);
  updateCamera(delta);
  updateWorldLabels();
  drawMinimap();
  renderer.render(scene, camera);
}

initializeStops();
updateClock();
window.setInterval(updateClock, 1000);
loadModel();

playToggle.addEventListener("click", () => setPlaying(!playing));

soundToggle.addEventListener("click", () => {
  if (ambientSound.playing) {
    ambientSound.stop();
    soundToggle.setAttribute("aria-label", "开启原创配乐");
    soundToggle.setAttribute("aria-pressed", "false");
    setIcon(soundToggle, "volume-x");
  } else {
    ambientSound.start().catch((error) => console.error("Music playback failed.", error));
    soundToggle.setAttribute("aria-label", "关闭原创配乐");
    soundToggle.setAttribute("aria-pressed", "true");
    setIcon(soundToggle, "volume-2");
  }
});

cameraButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeCamera = button.dataset.camera;
    cameraButtons.forEach((item) => item.classList.toggle("active", item === button));
  });
});

speedButtons.forEach((button) => {
  button.addEventListener("click", () => {
    speedMultiplier = Number(button.dataset.speed);
    speedButtons.forEach((item) => item.classList.toggle("active", item === button));
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setRideMode(button.dataset.mode));
});

touchButtons.forEach((button) => {
  const control = button.dataset.touch;
  const setTouch = (active) => {
    if (control === "brake") touchState.brake = active;
    if (control === "reverse") touchState.reverse = active;
    if (control === "throttle") touchState.throttle = active;
    if (control === "left") touchState.left = active;
    if (control === "right") touchState.right = active;
    button.classList.toggle("active", active);
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    setTouch(true);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events do not own a native pointer capture.
    }
  });
  button.addEventListener("pointerup", (event) => {
    setTouch(false);
    try {
      button.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may have already released the pointer.
    }
  });
  button.addEventListener("pointercancel", () => setTouch(false));
  button.addEventListener("contextmenu", (event) => event.preventDefault());
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
  if (event.code === "KeyF" && !event.repeat) {
    setRideMode(rideMode === "free" ? "auto" : "free");
  }
  if (event.code === "KeyB" && !event.repeat) {
    bicycle.ringBell();
  }
  if (event.code === "Space" && !event.repeat && rideMode === "auto") {
    setPlaying(!playing);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
  touchState.throttle = false;
  touchState.brake = false;
  touchState.reverse = false;
  touchState.left = false;
  touchState.right = false;
  touchButtons.forEach((button) => button.classList.remove("active"));
});

startRide.addEventListener("click", () => {
  setPlaying(true);
  app.classList.add("ride-started");
  heroCopy.classList.add("compact");
});

brandHome.addEventListener("click", (event) => {
  event.preventDefault();
  setRideMode("auto");
  routeT = 0.025;
  totalDistance = 0;
  activeStopIndex = -1;
  routeDirty = true;
  cameraSnap = true;
  updateStop(0, false);
  heroCopy.classList.remove("compact");
  app.classList.remove("ride-started");
  setPlaying(true);
});

progressThumb.addEventListener("pointerdown", (event) => {
  if (rideMode !== "auto") setRideMode("auto");
  pointerDown = true;
  pointerMoved = true;
  previousPointer.set(event.clientX, event.clientY);
  try {
    progressThumb.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events do not own a native pointer capture.
  }
});

progressThumb.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  const rect = progressThumb.parentElement.getBoundingClientRect();
  routeT = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 0.9999);
  routeDirty = true;
  cameraSnap = true;
});

progressThumb.addEventListener("pointerup", (event) => {
  pointerDown = false;
  try {
    progressThumb.releasePointerCapture(event.pointerId);
  } catch {
    // The browser may have already released the pointer.
  }
});

canvas.addEventListener("pointerdown", (event) => {
  pointerDown = true;
  pointerMoved = false;
  previousPointer.set(event.clientX, event.clientY);
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events do not own a native pointer capture.
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  const deltaX = event.clientX - previousPointer.x;
  const deltaY = event.clientY - previousPointer.y;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 3) pointerMoved = true;
  cameraSideOffset = THREE.MathUtils.clamp(cameraSideOffset + deltaX * 0.008, -2.2, 2.2);
  cameraLift = THREE.MathUtils.clamp(cameraLift + deltaY * 0.004, -0.5, 1.2);
  previousPointer.set(event.clientX, event.clientY);
});

canvas.addEventListener("pointerup", (event) => {
  pointerDown = false;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // The browser may have already released the pointer.
  }
});

window.addEventListener("resize", resize);

if (import.meta.env.DEV) {
  window.__WULING_DEBUG__ = {
    THREE,
    freeRide,
    bicycle,
    route,
    keys,
    stepFreeRide(delta = 1 / 60) {
      elapsedTime += delta;
      return updateFreeRide(delta);
    },
    stepBike(delta = 1 / 60) {
      return updateBike(delta);
    },
    get routeT() {
      return routeT;
    },
    setRouteT(value) {
      routeT = THREE.MathUtils.clamp(value, 0, 0.9999);
      if (rideMode === "auto") {
        bikePosition.copy(route.curve.getPointAt(routeT));
        pathFollower.initialized = false;
        pathFollower.speed = 0;
        pathFollower.returning = false;
      }
      routeDirty = true;
      cameraSnap = true;
    },
    setCamera(value) {
      activeCamera = value;
      cameraSnap = true;
    },
    setCameraOffset(side = 0, lift = 0) {
      cameraSideOffset = THREE.MathUtils.clamp(side, -2.2, 2.2);
      cameraLift = THREE.MathUtils.clamp(lift, -0.5, 1.2);
      cameraSnap = true;
    },
    get rider() {
      return rider;
    },
    setRideMode,
  };
}

renderer.setAnimationLoop(animate);
