import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FANGXING_ROADS, RIDE_ZONES } from "./route.js";

const UP = new THREE.Vector3(0, 1, 0);

function distanceToRideZone(x, z, zone) {
  if (zone.shape === "rect") {
    const distanceX = Math.max(0, Math.abs(x - zone.x) - zone.halfX);
    const distanceZ = Math.max(0, Math.abs(z - zone.z) - zone.halfZ);
    return Math.hypot(distanceX, distanceZ);
  }
  return Math.max(0, Math.hypot(x - zone.x, z - zone.z) - zone.radius);
}

function isInsideRideNetwork(x, z, margin = 0) {
  return RIDE_ZONES.some((zone) => distanceToRideZone(x, z, zone) <= margin);
}

function seededRandom(seed = 19041) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function bakeGeometry(geometry, matrix) {
  geometry.applyMatrix4(matrix);
  return geometry;
}

function boxGeometry(size, position, rotation = [0, 0, 0]) {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  return bakeGeometry(geometry, matrix);
}

function cylinderGeometry(radius, depth, position, rotation = [0, 0, 0], radialSegments = 8) {
  const geometry = new THREE.CylinderGeometry(radius, radius, depth, radialSegments);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  return bakeGeometry(geometry, matrix);
}

function cylinderBetween(start, end, radius, radialSegments = 8) {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.92, length, radialSegments, 1, false);
  const matrix = new THREE.Matrix4().compose(
    startVector.clone().add(endVector).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()),
    new THREE.Vector3(1, 1, 1),
  );
  return bakeGeometry(geometry, matrix);
}

function addMerged(group, material, geometries, options = {}) {
  if (!geometries.length) return null;
  const normalized = geometries.map((geometry) => (
    geometry.index ? geometry.toNonIndexed() : geometry
  ));
  const geometry = mergeGeometries(normalized, false);
  if (!geometry) {
    console.error("Unable to merge world geometry", {
      count: geometries.length,
      name: options.name ?? material.name,
    });
    return null;
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  group.add(mesh);
  return mesh;
}

function createSky(scene) {
  const skyGeometry = new THREE.SphereGeometry(235, 40, 24);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color("#6bb6c7") },
      horizonColor: { value: new THREE.Color("#dcebe3") },
      lowColor: { value: new THREE.Color("#a7cfc8") },
      sunDirection: { value: new THREE.Vector3(-0.55, 0.35, -0.75).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 lowColor;
      uniform vec3 sunDirection;
      varying vec3 vWorldPosition;
      void main() {
        vec3 direction = normalize(vWorldPosition);
        float h = direction.y;
        vec3 base = h > 0.0
          ? mix(horizonColor, topColor, smoothstep(0.0, 0.78, h))
          : mix(horizonColor, lowColor, smoothstep(0.0, -0.5, h));
        float sunGlow = pow(max(dot(direction, sunDirection), 0.0), 96.0);
        float haze = pow(max(dot(direction, sunDirection), 0.0), 9.0);
        base += vec3(1.0, 0.76, 0.48) * sunGlow * 0.9;
        base += vec3(1.0, 0.86, 0.67) * haze * 0.08;
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeometry, skyMaterial));

  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: "#ffe4ad",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sun.position.set(-78, 66, -126);
  sun.scale.set(22, 22, 1);
  scene.add(sun);
}

function createCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 68, 2, 128, 68, 94);
  gradient.addColorStop(0, "rgba(244, 252, 248, .78)");
  gradient.addColorStop(0.45, "rgba(237, 249, 246, .44)");
  gradient.addColorStop(1, "rgba(232, 247, 244, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createClouds(scene, random) {
  const texture = createCloudTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    fog: true,
  });
  const clouds = new THREE.Group();

  for (let i = 0; i < 26; i++) {
    const sprite = new THREE.Sprite(material.clone());
    const angle = random() * Math.PI * 2;
    const radius = 45 + random() * 105;
    sprite.position.set(
      Math.cos(angle) * radius,
      23 + random() * 28,
      Math.sin(angle) * radius,
    );
    const scale = 18 + random() * 30;
    sprite.scale.set(scale, scale * (0.34 + random() * 0.18), 1);
    sprite.material.opacity = 0.14 + random() * 0.24;
    sprite.userData.baseX = sprite.position.x;
    sprite.userData.drift = 0.4 + random() * 0.6;
    clouds.add(sprite);
  }

  scene.add(clouds);
  return clouds;
}

function createTerrain(scene, random) {
  const geometry = new THREE.PlaneGeometry(260, 260, 54, 54);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const radius = Math.hypot(x, z);
    const edge = THREE.MathUtils.smoothstep(radius, 62, 125);
    const ridge = Math.sin(x * 0.08) * Math.cos(z * 0.075) * 2.4
      + Math.sin((x + z) * 0.035) * 1.6;
    const cityShelf = -0.55 + edge * (3.4 + random() * 1.2) + ridge * edge;
    positions.setY(i, cityShelf);

    const green = 0.38 + edge * 0.1 + Math.max(0, ridge) * 0.008;
    color.setRGB(0.25 + edge * 0.05, green, 0.31 + edge * 0.03);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  scene.add(terrain);
  return terrain;
}

function createMountains(scene, random) {
  const group = new THREE.Group();
  const stoneGeometries = [];
  const capGeometries = [];
  const placements = [
    [-110, -92, 29, 44],
    [-77, -119, 36, 51],
    [-24, -132, 31, 47],
    [35, -125, 34, 46],
    [98, -96, 30, 41],
    [123, -38, 33, 48],
    [126, 40, 31, 43],
    [90, 99, 36, 53],
    [28, 128, 30, 43],
    [-42, 125, 37, 50],
    [-108, 82, 34, 46],
    [-129, 10, 35, 48],
  ];

  for (const [x, z, radius, height] of placements) {
    const variation = 0.88 + random() * 0.25;
    const y = -2;
    const mountain = new THREE.ConeGeometry(radius * variation, height, 9, 4);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + height * 0.5, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    stoneGeometries.push(bakeGeometry(mountain, matrix));

    const cap = new THREE.ConeGeometry(radius * variation * 0.3, height * 0.24, 9, 1);
    const capMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + height * 0.895, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    capGeometries.push(bakeGeometry(cap, capMatrix));
  }

  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#66877d",
    roughness: 1,
    flatShading: true,
  }), stoneGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#dce9e3",
    roughness: 1,
    flatShading: true,
  }), capGeometries, { castShadow: false });
  scene.add(group);
  return group;
}

function createWater(scene) {
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: "#3f8f98",
    roughness: 0.2,
    metalness: 0.06,
    transmission: 0.14,
    transparent: true,
    opacity: 0.76,
    clearcoat: 0.65,
    clearcoatRoughness: 0.24,
  });
  const group = new THREE.Group();

  const basinGeometry = new THREE.BoxGeometry(28, 1.1, 9);
  const basin = new THREE.Mesh(basinGeometry, new THREE.MeshStandardMaterial({
    color: "#173f47",
    roughness: 0.65,
  }));
  basin.position.set(62, 0.1, 22);
  basin.receiveShadow = true;
  group.add(basin);

  const channel = new THREE.Mesh(new THREE.PlaneGeometry(15, 108), waterMaterial);
  channel.rotation.x = -Math.PI / 2;
  channel.position.set(62, 0.69, -2);
  group.add(channel);

  const pond = new THREE.Mesh(new THREE.CircleGeometry(12, 48), waterMaterial);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-73, 0.77, 24);
  pond.scale.set(1.3, 0.72, 1);
  group.add(pond);

  const southPond = new THREE.Mesh(new THREE.CircleGeometry(8, 40), waterMaterial);
  southPond.rotation.x = -Math.PI / 2;
  southPond.position.set(-73, 1.19, 58);
  southPond.scale.set(1.1, 0.65, 1);
  group.add(southPond);

  scene.add(group);
  return group;
}

function createRoad(scene, route) {
  const group = new THREE.Group();
  group.name = "wuling-road";
  const segments = 720;
  const halfWidth = 5.8;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = route.curve.getPointAt(t % 1);
    const tangent = route.curve.getTangentAt(t % 1).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, UP).normalize();
    const left = point.clone().addScaledVector(side, halfWidth);
    const right = point.clone().addScaledVector(side, -halfWidth);
    positions.push(left.x, left.y + 0.02, left.z, right.x, right.y + 0.02, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, t * 56, 1, t * 56);

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, c, d, b);
    }
  }

  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  roadGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  roadGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  roadGeometry.setIndex(indices);
  roadGeometry.computeBoundingSphere();

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: "#d7d4c4",
    roughness: 0.88,
    metalness: 0.02,
  });
  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.receiveShadow = true;
  group.add(road);

  const curbGeometries = [];
  const lightGeometries = [];
  const supportGeometries = [];
  const lanternGeometries = [];

  for (let i = 0; i < segments; i += 2) {
    const t = i / segments;
    const point = route.curve.getPointAt(t);
    const tangent = route.curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, UP).normalize();

    for (const direction of [1, -1]) {
      const center = point.clone().addScaledVector(side, direction * (halfWidth + 0.26));
      const yaw = Math.atan2(tangent.x, tangent.z);
      curbGeometries.push(boxGeometry([0.42, 0.34, 2.45], [center.x, center.y + 0.16, center.z], [0, yaw, 0]));
    }

    if (i % 16 === 0) {
      const left = point.clone().addScaledVector(side, halfWidth - 0.33);
      const right = point.clone().addScaledVector(side, -halfWidth + 0.33);
      const yaw = Math.atan2(tangent.x, tangent.z);
      lightGeometries.push(boxGeometry([0.12, 0.02, 2.6], [left.x, left.y + 0.045, left.z], [0, yaw, 0]));
      lightGeometries.push(boxGeometry([0.12, 0.02, 2.6], [right.x, right.y + 0.045, right.z], [0, yaw, 0]));
    }

    if (i % 30 === 0 && point.y > 2.4) {
      const supportTop = point.y - 0.16;
      supportGeometries.push(cylinderGeometry(0.34, supportTop + 0.8, [point.x, supportTop * 0.5 - 0.35, point.z], [0, 0, 0], 10));
    }

    if (i % 54 === 0) {
      for (const direction of [1, -1]) {
        const lanternPosition = point.clone().addScaledVector(side, direction * (halfWidth + 1.45));
        lanternPosition.y += 3.45;
        const lanternGeometry = new THREE.OctahedronGeometry(0.2, 0);
        const lanternMatrix = new THREE.Matrix4().compose(
          lanternPosition,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 4)),
          new THREE.Vector3(0.82, 1.35, 0.82),
        );
        lanternGeometries.push(bakeGeometry(lanternGeometry, lanternMatrix));
      }
    }
  }

  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#a9b1aa",
    roughness: 0.92,
  }), curbGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#72f0df",
    emissive: "#2cbeb5",
    emissiveIntensity: 1.9,
    roughness: 0.35,
  }), lightGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#445f60",
    roughness: 0.88,
  }), supportGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#ff9c56",
    emissive: "#e35a2f",
    emissiveIntensity: 2,
    roughness: 0.42,
  }), lanternGeometries, { castShadow: false });

  scene.add(group);
  return group;
}

function createBuildingGeometry(x, z, baseY, width, depth, height, random) {
  const bodyGeometries = [];
  const roofGeometries = [];
  const trimGeometries = [];
  const windowGeometries = [];
  const warmWindowGeometries = [];
  const isRound = random() > 0.82;
  const stories = 1 + Math.floor(random() * 3);

  if (isRound) {
    const radius = Math.min(width, depth) * 0.5;
    bodyGeometries.push(cylinderGeometry(radius, height, [x, baseY + height * 0.5, z], [0, 0, 0], 12));
    roofGeometries.push(cylinderGeometry(radius * 1.18, 0.55, [x, baseY + height + 0.16, z], [0, 0, 0], 12));
  } else {
    const storyHeight = height / stories;
    for (let story = 0; story < stories; story++) {
      const sw = width * (1 - story * 0.05);
      const sd = depth * (1 - story * 0.04);
      const sy = baseY + storyHeight * (story + 0.5);
      bodyGeometries.push(boxGeometry([sw, storyHeight, sd], [x, sy, z]));
      if (story > 0) {
        trimGeometries.push(boxGeometry([sw + 0.3, 0.22, sd + 0.3], [x, baseY + story * storyHeight, z]));
      }
    }
    roofGeometries.push(boxGeometry([width * 1.35, 0.5, depth * 1.35], [x, baseY + height + 0.12, z]));
    roofGeometries.push(boxGeometry([width * 1.02, 0.3, depth * 1.02], [x, baseY + height + 0.48, z]));
    const roofCone = new THREE.ConeGeometry(1, 1, 4, 1);
    const roofMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, baseY + height + 1.05, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      new THREE.Vector3(width * 0.82, 1.1, depth * 0.82),
    );
    roofGeometries.push(bakeGeometry(roofCone, roofMatrix));
  }

  const windowRows = Math.max(1, Math.floor(height / 2.25));
  const windowCols = Math.max(2, Math.floor(Math.min(width, depth) / 1.8));
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowCols; col++) {
      const wx = x + (col - (windowCols - 1) / 2) * (width / (windowCols + 0.35));
      const wy = baseY + 1.2 + row * Math.min(2.2, height / windowRows);
      const front = random() > 0.5 ? 1 : -1;
      const target = random() > 0.84 ? warmWindowGeometries : windowGeometries;
      target.push(boxGeometry([0.72, 0.78, 0.08], [wx, wy, z + front * (depth * 0.5 + 0.05)]));
    }
  }

  return {
    bodyGeometries,
    roofGeometries,
    trimGeometries,
    windowGeometries,
    warmWindowGeometries,
  };
}

function createCity(scene, route, random) {
  const group = new THREE.Group();
  group.name = "wuling-city";
  const bodyGeometries = [];
  const roofGeometries = [];
  const trimGeometries = [];
  const windowGeometries = [];
  const warmWindowGeometries = [];
  const plinthGeometries = [];
  const terraceGeometries = [];
  const bannerGeometries = [];

  const clusters = [
    { center: [-83, 25], spread: [20, 44], baseOffset: 0.9, count: 24 },
    { center: [83, 23], spread: [20, 42], baseOffset: 0.6, count: 23 },
    { center: [-82, 62], spread: [20, 30], baseOffset: 1.4, count: 18 },
    { center: [82, 61], spread: [20, 28], baseOffset: 1.2, count: 17 },
    { center: [-37, -83], spread: [44, 18], baseOffset: 2.8, count: 20 },
    { center: [37, -83], spread: [44, 18], baseOffset: 2.5, count: 20 },
  ];

  for (const cluster of clusters) {
    let made = 0;
    let attempts = 0;
    while (made < cluster.count && attempts < cluster.count * 18) {
      attempts++;
      const x = cluster.center[0] + (random() - 0.5) * cluster.spread[0];
      const z = cluster.center[1] + (random() - 0.5) * cluster.spread[1];
      if (Math.abs(x) < 70 && z > -7 && z < 86) continue;
      const routeInfo = route.distanceToRoute(x, z);
      if (routeInfo.distance < 12.5) continue;
      if (isInsideRideNetwork(x, z, 7.5)) continue;
      if (Math.hypot(x + 6, z - 16) < 18) continue;

      const width = 4.2 + random() * 5.4;
      const depth = 4.5 + random() * 5.8;
      const height = 3.8 + random() * 8.6;
      const baseY = Math.max(-1.2, routeInfo.nearest.position.y + cluster.baseOffset + random() * 0.7);
      const building = createBuildingGeometry(x, z, baseY, width, depth, height, random);
      bodyGeometries.push(...building.bodyGeometries);
      roofGeometries.push(...building.roofGeometries);
      trimGeometries.push(...building.trimGeometries);
      windowGeometries.push(...building.windowGeometries);
      warmWindowGeometries.push(...building.warmWindowGeometries);
      plinthGeometries.push(boxGeometry([width + 1.5, 0.55, depth + 1.5], [x, baseY - 0.12, z]));
      const supportHeight = Math.max(0.6, baseY + 0.45);
      terraceGeometries.push(
        boxGeometry(
          [width + 3.1, supportHeight, depth + 3.1],
          [x, baseY - supportHeight * 0.5, z],
        ),
      );

      if (random() > 0.7) {
        const bannerX = x + width * 0.51;
        bannerGeometries.push(boxGeometry([0.08, 2.8, 0.65], [bannerX, baseY + 2.1, z + depth * 0.28]));
      }
      made++;
    }
  }

  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#d7dbd2",
    roughness: 0.88,
  }), bodyGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#415c62",
    roughness: 0.72,
    metalness: 0.08,
  }), roofGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#687b78",
    roughness: 0.78,
  }), trimGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#79d8d0",
    emissive: "#2a8b8a",
    emissiveIntensity: 1.25,
    roughness: 0.34,
  }), windowGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#ff9a56",
    emissive: "#d7592f",
    emissiveIntensity: 1.55,
    roughness: 0.4,
  }), warmWindowGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#879690",
    roughness: 0.96,
  }), plinthGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#73847e",
    roughness: 0.98,
  }), terraceGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#d96742",
    roughness: 0.82,
    side: THREE.DoubleSide,
  }), bannerGeometries, { castShadow: false });

  scene.add(group);
  return group;
}

function createSignTexture(text, background, foreground) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,.52)";
  context.lineWidth = 6;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = foreground;
  context.font = "700 72px 'Microsoft YaHei', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createFangxingDistrict(scene, random) {
  const group = new THREE.Group();
  group.name = "fangxing-district";
  const foundationGeometries = [];
  const pavingGeometries = [];
  const curbGeometries = [];
  const laneGeometries = [];
  const paverJointGeometries = [];
  const sidewalkGeometries = [];
  const bodyGeometries = [];
  const roofGeometries = [];
  const greenRoofGeometries = [];
  const roofRidgeGeometries = [];
  const trimGeometries = [];
  const facadeGeometries = [];
  const storefrontGeometries = [];
  const mullionGeometries = [];
  const upperFloorGeometries = [];
  const towerBayGeometries = [];
  const entryStepGeometries = [];
  const verticalBannerGeometries = [];
  const balconyGeometries = [];
  const plinthGeometries = [];
  const windowGeometries = [];
  const windowFrameGeometries = [];
  const warmWindowGeometries = [];
  const courtyardGeometries = [];
  const awningGeometries = [];
  const lanternGeometries = [];
  const planterGeometries = [];
  const campaignPoleGeometries = [];
  const skywalkGeometries = [];
  const skywalkRailGeometries = [];
  const skywalkRoofGeometries = [];
  const streetLampGeometries = [];
  const lampHeadGeometries = [];
  const colliders = [];
  const { horizontal: horizontalRoads, vertical: verticalRoads } = FANGXING_ROADS;

  for (const road of horizontalRoads) {
    foundationGeometries.push(
      boxGeometry([124, 1.2, road.halfZ * 2 + 1.1], [0, 0.32, road.z]),
    );
    pavingGeometries.push(boxGeometry([124, 0.2, road.halfZ * 2], [0, 1.02, road.z]));
    for (const edge of [-1, 1]) {
      curbGeometries.push(
        boxGeometry([124, 0.3, 0.48], [0, 1.12, road.z + edge * (road.halfZ + 0.23)]),
      );
    }
    for (const lane of [-1, 1]) {
      laneGeometries.push(
        boxGeometry([119, 0.026, 0.14], [0, 1.13, road.z + lane * road.halfZ * 0.42]),
      );
      sidewalkGeometries.push(
        boxGeometry([124, 0.12, 0.72], [0, 1.17, road.z + lane * (road.halfZ + 0.74)]),
      );
    }
    for (let x = -58; x <= 58; x += 5.8) {
      paverJointGeometries.push(
        boxGeometry([0.035, 0.018, road.halfZ * 1.72], [x, 1.126, road.z]),
      );
    }
  }

  for (const road of verticalRoads) {
    foundationGeometries.push(
      boxGeometry([road.halfX * 2 + 1.1, 1.2, 84], [road.x, 0.32, 41]),
    );
    pavingGeometries.push(boxGeometry([road.halfX * 2, 0.2, 84], [road.x, 1.02, 41]));
    for (const edge of [-1, 1]) {
      curbGeometries.push(
        boxGeometry([0.48, 0.3, 84], [road.x + edge * (road.halfX + 0.23), 1.12, 41]),
      );
    }
    for (const lane of [-1, 1]) {
      laneGeometries.push(
        boxGeometry([0.14, 0.026, 82], [road.x + lane * road.halfX * 0.42, 1.13, 41]),
      );
      sidewalkGeometries.push(
        boxGeometry([0.72, 0.12, 84], [road.x + lane * (road.halfX + 0.74), 1.17, 41]),
      );
    }
    for (let z = -1; z <= 82; z += 5.8) {
      paverJointGeometries.push(
        boxGeometry([road.halfX * 1.72, 0.018, 0.035], [road.x, 1.126, z]),
      );
    }
  }

  const lampXs = [-58, -30, -14, 14, 30, 58];
  const lampZs = [-2, 20, 40, 64, 82];
  for (const road of horizontalRoads) {
    const lampZ = road.z - road.halfZ - 0.72;
    for (const x of lampXs) {
      streetLampGeometries.push(
        cylinderGeometry(0.055, 3.1, [x, 2.58, lampZ], [0, 0, 0], 7),
        boxGeometry([0.72, 0.08, 0.08], [x + 0.28, 4.08, lampZ]),
      );
      lampHeadGeometries.push(
        boxGeometry([0.38, 0.09, 0.18], [x + 0.52, 4.04, lampZ]),
      );
    }
  }
  for (const road of verticalRoads) {
    const lampX = road.x + road.halfX + 0.72;
    for (const z of lampZs) {
      streetLampGeometries.push(
        cylinderGeometry(0.055, 3.1, [lampX, 2.58, z], [0, 0, 0], 7),
        boxGeometry([0.08, 0.08, 0.72], [lampX, 4.08, z + 0.28]),
      );
      lampHeadGeometries.push(
        boxGeometry([0.18, 0.09, 0.38], [lampX, 4.04, z + 0.52]),
      );
    }
  }

  const blocks = [
    [-24, 19, 19, 10, 4.6, "辣么大", "#c85132", -1, "z"],
    [17, 19, 20, 10, 5.2, "岳研", "#466e59", -1, "z"],
    [-24, 41, 20, 11, 4.4, "方兴衢", "#315767", -1, "z"],
    [18, 41, 21, 11, 5.4, "武陵车行", "#d28645", -1, "z"],
    [-24, 63, 20, 10, 4.8, "新源能源", "#347d74", 1, "z"],
    [18, 63, 20, 10, 4.2, "方兴街市", "#b54d35", 1, "z"],
    [-54, 41, 11, 10, 4.2, "武陵驿", "#805f3f", 1, "x"],
    [-54, 63, 11, 10, 4.8, "南门茶铺", "#6f4f37", 1, "x"],
    [53, 19, 12, 10, 4.3, "协议工坊", "#355e6d", -1, "x"],
    [53, 41, 12, 11, 5.1, "岳研二店", "#48684d", -1, "x"],
  ];

  for (let index = 0; index < blocks.length; index++) {
    const [x, z, width, depth, height, label, color, facing, facadeAxis] = blocks[index];
    const baseY = 1.12;
    colliders.push({
      shape: "rect",
      x,
      z,
      halfX: width * 0.5,
      halfZ: depth * 0.5,
      name: label,
    });
    bodyGeometries.push(boxGeometry([width, height, depth], [x, baseY + height * 0.5, z]));
    plinthGeometries.push(
      boxGeometry([width + 0.48, 0.58, depth + 0.48], [x, baseY + 0.24, z]),
    );
    const faceOnX = facadeAxis === "x";
    const facadeLength = faceOnX ? depth : width;
    const columns = Math.max(2, Math.floor(facadeLength / 3.2));
    const frontX = x + facing * (width * 0.5 + 0.11);
    const frontZ = z + facing * (depth * 0.5 + 0.11);
    facadeGeometries.push(
      faceOnX
        ? boxGeometry([0.18, Math.min(2.35, height), depth - 0.7], [frontX, baseY + 1.18, z])
        : boxGeometry([width - 0.7, Math.min(2.35, height), 0.18], [x, baseY + 1.18, frontZ]),
    );
    storefrontGeometries.push(
      faceOnX
        ? boxGeometry([0.12, 1.52, depth * 0.78], [frontX + facing * 0.09, baseY + 0.82, z])
        : boxGeometry([width * 0.78, 1.52, 0.12], [x, baseY + 0.82, frontZ + facing * 0.09]),
    );
    for (let col = 0; col <= columns; col++) {
      const ratio = col / Math.max(1, columns);
      const along = -facadeLength * 0.42 + ratio * facadeLength * 0.84;
      mullionGeometries.push(
        faceOnX
          ? boxGeometry([0.2, Math.min(2.65, height), 0.16], [frontX + facing * 0.11, baseY + 1.32, z + along])
          : boxGeometry([0.16, Math.min(2.65, height), 0.2], [x + along, baseY + 1.32, frontZ + facing * 0.11]),
      );
    }
    trimGeometries.push(
      boxGeometry([width + 0.8, 0.42, depth + 0.8], [x, baseY + height + 0.05, z]),
      boxGeometry([width + 0.4, 0.2, depth + 0.4], [x, baseY + 2.72, z]),
    );
    const roofTarget = index === 1 || index === 4 || index === 6
      ? greenRoofGeometries
      : roofGeometries;
    const upperLevel = index === 0 || index === 3 || index === 5 || index === 8;
    const roofLift = upperLevel ? 1.62 : 0.72;
    if (upperLevel) {
      upperFloorGeometries.push(
        boxGeometry(
          [width * 0.7, 1.32, depth * 0.72],
          [x, baseY + height + 0.68, z],
        ),
      );
    }
    const towerBay = index === 2 || index === 4 || index === 7 || index === 9;
    if (towerBay) {
      const bayWidth = Math.min(4.2, width * 0.28);
      const bayDepth = depth * 0.68;
      const bayHeight = height + 1.25;
      towerBayGeometries.push(
        boxGeometry(
          [bayWidth, bayHeight, bayDepth],
          [x - width * 0.34, baseY + bayHeight * 0.5, z],
        ),
      );
      const bayRoof = new THREE.ConeGeometry(1, 1, 4, 1);
      const bayRoofMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x - width * 0.34, baseY + bayHeight + 0.58, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
        new THREE.Vector3(bayWidth * 0.72, 0.82, bayDepth * 0.64),
      );
      roofTarget.push(bakeGeometry(bayRoof, bayRoofMatrix));
    }
    entryStepGeometries.push(
      faceOnX
        ? boxGeometry([1.2, 0.24, Math.min(3.8, depth * 0.34)], [frontX + facing * 0.52, baseY + 0.12, z])
        : boxGeometry([Math.min(3.8, width * 0.34), 0.24, 1.2], [x, baseY + 0.12, frontZ + facing * 0.52]),
    );
    const roof = new THREE.ConeGeometry(1, 1, 4, 1);
    const roofMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, baseY + height + roofLift, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      new THREE.Vector3(width * 0.54, 0.82 + random() * 0.2, depth * 0.54),
    );
    roofTarget.push(bakeGeometry(roof, roofMatrix));
    roofRidgeGeometries.push(
      boxGeometry(
        [width + (upperLevel ? 0.5 : 1.15), 0.16, depth + (upperLevel ? 0.5 : 1.15)],
        [x, baseY + height + roofLift - 0.54, z],
      ),
      boxGeometry([width * 0.72, 0.25, 0.34], [x, baseY + height + roofLift + 0.36, z]),
    );
    for (const edge of [-1, 1]) {
      roofRidgeGeometries.push(
        boxGeometry(
          [0.72, 0.18, 0.22],
          [x + edge * width * 0.48, baseY + height + roofLift + 0.2, z],
          [0, 0, edge * 0.18],
        ),
      );
      const horn = new THREE.ConeGeometry(0.18, 0.62, 4, 1);
      const hornMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(
          x + edge * (width * 0.5 + 0.28),
          baseY + height + roofLift + 0.24,
          z,
        ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, -edge * 0.62)),
        new THREE.Vector3(1, 1, 1),
      );
      roofRidgeGeometries.push(bakeGeometry(horn, hornMatrix));
    }
    if (index === 1 || index === 4 || index === 6) {
      balconyGeometries.push(
        boxGeometry([width * 0.62, 0.18, 0.9], [x, baseY + 2.82, z + depth * 0.5 + 0.46]),
        boxGeometry([width * 0.62, 0.09, 0.08], [x, baseY + 3.34, z + depth * 0.5 + 0.9]),
      );
    }
    if (index % 2 === 0) {
      const bannerX = faceOnX ? frontX + facing * 0.22 : x - facing * width * 0.38;
      const bannerZ = faceOnX ? z - facing * depth * 0.35 : frontZ + facing * 0.22;
      verticalBannerGeometries.push(
        boxGeometry([0.28, 2.5, 0.16], [bannerX, baseY + 2.55, bannerZ]),
      );
    }

    const rows = Math.max(2, Math.floor(height / 1.68));
    for (let col = 0; col < columns; col++) {
      for (let row = 0; row < rows; row++) {
        const along = -facadeLength * 0.38
          + (col / Math.max(1, columns - 1)) * facadeLength * 0.76;
        const wy = baseY + 1.25 + row * 1.42;
        const target = index % 3 === 0 && row === 0 ? warmWindowGeometries : windowGeometries;
        windowFrameGeometries.push(
          faceOnX
            ? boxGeometry([0.09, 0.86, 0.98], [frontX + facing * 0.12, wy, z + along])
            : boxGeometry([0.98, 0.86, 0.09], [x + along, wy, frontZ + facing * 0.12]),
        );
        target.push(
          faceOnX
            ? boxGeometry([0.08, 0.68, 0.78], [frontX + facing * 0.16, wy, z + along])
            : boxGeometry([0.78, 0.68, 0.08], [x + along, wy, frontZ + facing * 0.16]),
        );
      }
    }

    if (label) {
      const signWidth = Math.min(6.8, facadeLength * 0.76);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(signWidth, 2.1),
        new THREE.MeshBasicMaterial({
          map: createSignTexture(label, color, "#fff8e8"),
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      if (faceOnX) {
        sign.position.set(frontX + facing * 0.15, baseY + 3.15, z);
        sign.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        sign.position.set(x, baseY + 3.15, frontZ + facing * 0.15);
        if (facing < 0) sign.rotation.y = Math.PI;
      }
      group.add(sign);
    }

    awningGeometries.push(
      faceOnX
        ? boxGeometry([1.3, 0.15, depth * 0.9], [frontX + facing * 0.55, baseY + 2.05, z])
        : boxGeometry([width * 0.9, 0.15, 1.3], [x, baseY + 2.05, frontZ + facing * 0.55]),
    );

    if (index < 8) {
      for (const offset of [-0.3, 0, 0.3]) {
        const lamp = new THREE.OctahedronGeometry(0.14, 0);
        const lampMatrix = new THREE.Matrix4().compose(
          faceOnX
            ? new THREE.Vector3(frontX + facing * 0.76, baseY + 2.58, z + depth * offset)
            : new THREE.Vector3(x + width * offset, baseY + 2.58, frontZ + facing * 0.76),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, 0, Math.PI / 4)),
          new THREE.Vector3(0.8, 1.15, 0.8),
        );
        lanternGeometries.push(bakeGeometry(lamp, lampMatrix));
      }
    }

  }

  pavingGeometries.push(boxGeometry([13, 0.2, 10], [0, 1.02, 41]));
  courtyardGeometries.push(cylinderGeometry(2.1, 0.38, [0, 1.29, 41], [0, 0, 0], 24));
  const campaignSeal = new THREE.TorusGeometry(1.2, 0.12, 8, 36);
  const campaignSealMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 1.5, 41),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  courtyardGeometries.push(bakeGeometry(campaignSeal, campaignSealMatrix));

  for (const [x, z] of [[-60, 20], [60, 20], [-62, 55], [62, 55], [-58, -5], [58, -5]]) {
    courtyardGeometries.push(cylinderGeometry(0.14, 2.2, [x, 1.5, z], [0, 0, 0], 6));
    const crown = new THREE.IcosahedronGeometry(1.1, 1);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 3, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI, 0)),
      new THREE.Vector3(1, 1.45, 1),
    );
    courtyardGeometries.push(bakeGeometry(crown, matrix));
  }

  for (const [x, z] of [[-13, 24], [14, 24], [-13, 37], [14, 37], [25, 24], [25, 37], [-32, 24], [-32, 37]]) {
    planterGeometries.push(boxGeometry([2.1, 0.6, 1.15], [x, 1.42, z]));
    const shrub = new THREE.IcosahedronGeometry(0.72, 1);
    const shrubMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 2.05, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI, 0)),
      new THREE.Vector3(1.25, 1.05, 1),
    );
    planterGeometries.push(bakeGeometry(shrub, shrubMatrix));
  }

  for (const x of [-30, 10, 28]) {
    for (const z of [21.5, 42.5, 61.5]) {
      campaignPoleGeometries.push(cylinderGeometry(0.075, 4.3, [x, 3.15, z], [0, 0, 0], 7));
      campaignPoleGeometries.push(boxGeometry([0.08, 1.25, 0.72], [x + 0.04, 4.45, z], [0, 0, 0]));
    }
  }

  for (const [x, z, span, axis] of [
    [0, 41, 14, "x"],
    [38, 30, 14, "x"],
  ]) {
    skywalkGeometries.push(
      axis === "x"
        ? boxGeometry([span, 0.38, 2.7], [x, 6.15, z])
        : boxGeometry([2.7, 0.38, span], [x, 6.15, z]),
    );
    for (const edge of [-1, 1]) {
      skywalkRailGeometries.push(
        axis === "x"
          ? boxGeometry([span, 0.12, 0.1], [x, 6.75, z + edge * 1.25])
          : boxGeometry([0.1, 0.12, span], [x + edge * 1.25, 6.75, z]),
      );
    }
    for (const edge of [-1, 1]) {
      skywalkGeometries.push(
        axis === "x"
          ? boxGeometry([0.38, 5.7, 0.42], [x + edge * span * 0.43, 3.18, z])
          : boxGeometry([0.42, 5.7, 0.38], [x, 3.18, z + edge * span * 0.43]),
      );
    }
  }
  for (const x of [-1.8, 1.8]) {
    for (const z of [39.9, 42.1]) {
      skywalkGeometries.push(
        boxGeometry([0.2, 2.05, 0.2], [x, 7.28, z]),
      );
    }
  }
  const skywalkRoof = new THREE.ConeGeometry(1, 1, 4, 1);
  const skywalkRoofMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 8.72, 41),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
    new THREE.Vector3(3.25, 1.15, 2.6),
  );
  skywalkRoofGeometries.push(bakeGeometry(skywalkRoof, skywalkRoofMatrix));

  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#86928b",
    roughness: 0.98,
  }), foundationGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#c7c8be",
    roughness: 0.92,
  }), pavingGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#89968f",
    roughness: 0.9,
  }), curbGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#aeb5ad",
    roughness: 0.94,
  }), sidewalkGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#7e8985",
    roughness: 0.96,
  }), paverJointGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#72e6da",
    emissive: "#2a8f8b",
    emissiveIntensity: 1.05,
    roughness: 0.42,
  }), laneGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#cdd3cc",
    roughness: 0.86,
  }), bodyGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#87918b",
    roughness: 0.95,
  }), plinthGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#b4b9b1",
    roughness: 0.88,
  }), facadeGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#6a4936",
    roughness: 0.82,
    metalness: 0.04,
  }), mullionGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#40575a",
    roughness: 0.68,
    metalness: 0.1,
  }), windowFrameGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#d7d7ca",
    roughness: 0.9,
  }), upperFloorGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#c7cbc1",
    roughness: 0.9,
  }), towerBayGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#9ea89f",
    roughness: 0.96,
  }), entryStepGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#c95639",
    roughness: 0.78,
    side: THREE.DoubleSide,
  }), verticalBannerGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#253e43",
    roughness: 0.52,
    metalness: 0.12,
  }), storefrontGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#435f64",
    roughness: 0.7,
    metalness: 0.08,
  }), roofGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#4f7057",
    roughness: 0.74,
    metalness: 0.06,
  }), greenRoofGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#243f46",
    roughness: 0.62,
    metalness: 0.12,
  }), roofRidgeGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#6e817c",
    roughness: 0.76,
  }), trimGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#6ed8d0",
    emissive: "#278b88",
    emissiveIntensity: 1.2,
    roughness: 0.36,
  }), windowGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#ff9a56",
    emissive: "#d6532f",
    emissiveIntensity: 1.6,
    roughness: 0.38,
  }), warmWindowGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#486f5c",
    roughness: 0.94,
    flatShading: true,
  }), courtyardGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#36525a",
    roughness: 0.72,
  }), awningGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#61746e",
    roughness: 0.7,
    metalness: 0.16,
  }), balconyGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#ffad5b",
    emissive: "#d85d2f",
    emissiveIntensity: 1.85,
    roughness: 0.42,
  }), lanternGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#696f62",
    roughness: 0.95,
  }), planterGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#536c68",
    roughness: 0.7,
    metalness: 0.24,
  }), streetLampGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#8ef5e4",
    emissive: "#2fb8b1",
    emissiveIntensity: 2,
    roughness: 0.3,
  }), lampHeadGeometries, { castShadow: false });
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#486b69",
    roughness: 0.72,
    metalness: 0.18,
  }), campaignPoleGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#596d68",
    roughness: 0.72,
    metalness: 0.18,
  }), skywalkGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#a7bab2",
    roughness: 0.48,
    metalness: 0.36,
  }), skywalkRailGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#304d54",
    roughness: 0.7,
    metalness: 0.08,
  }), skywalkRoofGeometries);

  scene.add(group);
  return { group, colliders };
}

function createWulingWalls(scene) {
  const group = new THREE.Group();
  group.name = "wuling-city-wall";
  const wallGeometries = [];
  const capGeometries = [];
  const towerGeometries = [];
  const roofGeometries = [];
  const halfX = 69;
  const halfZ = 76;
  const wallHeight = 4.4;

  const addWall = (x, z, width, depth) => {
    wallGeometries.push(boxGeometry([width, wallHeight, depth], [x, wallHeight * 0.5, z]));
    capGeometries.push(boxGeometry([width + 0.7, 0.35, depth + 0.7], [x, wallHeight, z]));
  };

  addWall(-44, halfZ, 46, 1.6);
  addWall(44, halfZ, 46, 1.6);
  addWall(0, -halfZ, 138, 1.6);
  addWall(-halfX, 0, 1.6, 152);
  addWall(halfX, 0, 1.6, 152);

  for (let x = -65; x <= 65; x += 5.3) {
    if (Math.abs(x) < 20) continue;
    for (const z of [-halfZ, halfZ]) {
      capGeometries.push(boxGeometry([1.15, 0.85, 1.25], [x, wallHeight + 0.6, z]));
    }
  }
  for (let z = -72; z <= 72; z += 5.3) {
    for (const x of [-halfX, halfX]) {
      capGeometries.push(boxGeometry([1.25, 0.85, 1.15], [x, wallHeight + 0.6, z]));
    }
  }

  const towerPositions = [
    [-halfX, halfZ], [halfX, halfZ], [-halfX, -halfZ], [halfX, -halfZ],
    [-halfX, 0], [halfX, 0], [0, -halfZ],
  ];
  for (const [x, z] of towerPositions) {
    towerGeometries.push(boxGeometry([8.5, 9.8, 8.5], [x, 4.9, z]));
    towerGeometries.push(boxGeometry([10.2, 0.55, 10.2], [x, 9.9, z]));
    const roof = new THREE.ConeGeometry(1, 1, 4, 1);
    const roofMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 11.4, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      new THREE.Vector3(7.9, 2.2, 7.9),
    );
    roofGeometries.push(bakeGeometry(roof, roofMatrix));
  }

  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#b8c2bb",
    roughness: 0.93,
  }), wallGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#536a6a",
    roughness: 0.82,
  }), capGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#c8d0c7",
    roughness: 0.88,
  }), towerGeometries);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#314c54",
    roughness: 0.72,
  }), roofGeometries);
  scene.add(group);
  return group;
}

function createCentralTower(scene) {
  const group = new THREE.Group();
  group.name = "wuling-energy-tower";
  group.position.set(-7, 0, -31);

  const stone = new THREE.MeshStandardMaterial({
    color: "#cbd5cf",
    roughness: 0.7,
    metalness: 0.04,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#2d4a52",
    roughness: 0.52,
    metalness: 0.2,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: "#80f6e7",
    emissive: "#2fc8c3",
    emissiveIntensity: 2.6,
    transparent: true,
    opacity: 0.86,
    roughness: 0.26,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 10.8, 4.6, 12), stone);
  base.position.y = 2.3;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 6.4, 15, 10), stone);
  lower.position.y = 11.4;
  lower.castShadow = true;
  group.add(lower);

  const core = new THREE.Mesh(new THREE.BoxGeometry(4.4, 31, 4.4), dark);
  core.position.y = 22;
  core.castShadow = true;
  group.add(core);

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.75, 22, 0.75), dark);
    column.position.set(Math.cos(angle) * 5, 19.2, Math.sin(angle) * 5);
    column.castShadow = true;
    group.add(column);

    const light = new THREE.Mesh(new THREE.BoxGeometry(0.22, 18, 0.12), glow);
    light.position.set(Math.cos(angle) * 5.45, 19.6, Math.sin(angle) * 5.45);
    group.add(light);
  }

  for (const [radius, y, tilt] of [[7.7, 13, 0.2], [8.5, 21, -0.14], [6.2, 30, 0.28]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.34, 8, 48), glow);
    ring.rotation.x = Math.PI / 2 + tilt;
    ring.position.y = y;
    ring.castShadow = true;
    group.add(ring);
  }

  const rotor = new THREE.Group();
  rotor.position.y = 38.5;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.35, 1.7), dark);
    block.position.set(Math.cos(angle) * 6.4, Math.sin(i * 1.7) * 1.6, Math.sin(angle) * 6.4);
    block.rotation.y = -angle;
    block.castShadow = true;
    rotor.add(block);

    const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.22, 0.08), glow);
    beacon.position.copy(block.position);
    beacon.position.y += 0.78;
    beacon.rotation.y = -angle;
    rotor.add(beacon);
  }
  group.add(rotor);

  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 15, 8), dark);
  spire.position.y = 42;
  spire.castShadow = true;
  group.add(spire);

  const beacon = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 20, 1, true), glow);
  beacon.position.y = 52.5;
  group.add(beacon);

  scene.add(group);
  return {
    group,
    rotor,
    rings: group.children.filter((child) => child.geometry?.type === "TorusGeometry"),
    beacon,
  };
}

function createGate(scene) {
  const group = new THREE.Group();
  group.position.set(0, 1.1, 72);
  const stone = new THREE.MeshStandardMaterial({ color: "#c9d0c8", roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: "#304e56", roughness: 0.68 });
  const glow = new THREE.MeshStandardMaterial({
    color: "#84f5e8",
    emissive: "#2dbcb6",
    emissiveIntensity: 2.1,
    roughness: 0.34,
  });

  for (const x of [-16.5, 16.5]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 12, 3.3), stone);
    pillar.position.set(x, 6, 0);
    pillar.castShadow = true;
    group.add(pillar);

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.1, 4.4), dark);
    base.position.set(x, 0.55, 0);
    base.castShadow = true;
    group.add(base);
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(37.5, 2.1, 3.6), dark);
  beam.position.y = 12;
  beam.castShadow = true;
  group.add(beam);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(41, 0.65, 5.1), stone);
  canopy.position.y = 13.1;
  canopy.castShadow = true;
  group.add(canopy);

  const line = new THREE.Mesh(new THREE.BoxGeometry(33.8, 0.14, 0.12), glow);
  line.position.set(0, 12.45, 1.83);
  group.add(line);

  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512;
  signCanvas.height = 128;
  const context = signCanvas.getContext("2d");
  context.fillStyle = "#1c353d";
  context.fillRect(0, 0, signCanvas.width, signCanvas.height);
  context.strokeStyle = "#79f2e2";
  context.lineWidth = 8;
  context.strokeRect(7, 7, signCanvas.width - 14, signCanvas.height - 14);
  context.fillStyle = "#eefbf8";
  context.font = "700 70px 'Microsoft YaHei', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("武 陵", signCanvas.width / 2, signCanvas.height / 2 + 3);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.8, 1.95),
    new THREE.MeshBasicMaterial({
      map: signTexture,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  sign.position.set(0, 11.97, 1.88);
  group.add(sign);

  scene.add(group);
  return group;
}

function createRideCampaign(scene) {
  const group = new THREE.Group();
  group.name = "wuling-cycling-campaign";
  group.position.set(-22, 1.12, 0.2);
  group.rotation.y = 0.08;

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: "#203e46",
    metalness: 0.42,
    roughness: 0.48,
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: "#75f2df",
    emissive: "#2ebeb6",
    emissiveIntensity: 1.85,
    roughness: 0.3,
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 480;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#173741");
  gradient.addColorStop(0.62, "#27665f");
  gradient.addColorStop(1, "#b95e37");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(231, 248, 240, .13)";
  context.beginPath();
  context.moveTo(0, 380);
  context.lineTo(390, 120);
  context.lineTo(760, 330);
  context.lineTo(1160, 84);
  context.lineTo(1536, 280);
  context.lineTo(1536, 480);
  context.lineTo(0, 480);
  context.closePath();
  context.fill();
  context.strokeStyle = "#8cf8e9";
  context.lineWidth = 8;
  context.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  context.fillStyle = "#f4fff9";
  context.font = "800 104px 'Microsoft YaHei', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("风 起 武 陵 · 一 起 骑 行", canvas.width * 0.5, 205);
  context.fillStyle = "#a9f6e8";
  context.font = "600 36px 'Microsoft YaHei', sans-serif";
  context.fillText("WULING CYCLING FESTIVAL", canvas.width * 0.5, 316);
  context.fillStyle = "#ffe0b1";
  context.font = "500 28px 'Microsoft YaHei', sans-serif";
  context.fillText("沿方兴衢出发，让城市的风与你同速", canvas.width * 0.5, 382);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 3.3),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  board.position.y = 3.1;
  board.castShadow = true;
  group.add(board);

  const backing = new THREE.Mesh(new THREE.BoxGeometry(11.05, 3.85, 0.24), frameMaterial);
  backing.position.set(0, 3.1, -0.14);
  backing.castShadow = true;
  group.add(backing);

  for (const x of [-4.7, 4.7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.4, 0.3), frameMaterial);
    post.position.set(x, 1.2, 0);
    post.castShadow = true;
    group.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 1.1), glowMaterial);
    foot.position.set(x, 0.11, 0);
    group.add(foot);
  }

  scene.add(group);
  return group;
}

function createSquare(scene) {
  const group = new THREE.Group();
  group.name = "citizen-square";
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 18, 0.62, 32),
    new THREE.MeshStandardMaterial({ color: "#c9cbbb", roughness: 0.9 }),
  );
  plaza.position.set(-13, 0.3, 28);
  plaza.receiveShadow = true;
  group.add(plaza);

  const redPath = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.58, 4, 72, Math.PI * 1.5),
    new THREE.MeshStandardMaterial({ color: "#a84e3e", roughness: 0.88 }),
  );
  redPath.rotation.x = Math.PI / 2;
  redPath.rotation.z = -0.62;
  redPath.position.set(-13, 0.65, 28);
  group.add(redPath);

  const statueBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.5, 1.7, 12),
    new THREE.MeshStandardMaterial({ color: "#6b7d78", roughness: 0.75 }),
  );
  statueBase.position.set(-13, 1.3, 28);
  statueBase.castShadow = true;
  group.add(statueBase);

  const statue = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 8.2, 1.25),
    new THREE.MeshStandardMaterial({
      color: "#728985",
      emissive: "#254e4e",
      emissiveIntensity: 0.35,
      roughness: 0.62,
    }),
  );
  statue.position.set(-13, 5.9, 28);
  statue.rotation.z = -0.1;
  statue.castShadow = true;
  group.add(statue);

  scene.add(group);
  return group;
}

function createLandmarkTower(scene, position, height, rotation) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotation;
  const stone = new THREE.MeshStandardMaterial({
    color: "#d4d9d1",
    roughness: 0.78,
    metalness: 0.04,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: "#344e55",
    roughness: 0.62,
    metalness: 0.1,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: "#7af3e4",
    emissive: "#31c4bd",
    emissiveIntensity: 1.9,
    roughness: 0.3,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 4.2, 1.4, 8), stone);
  base.position.y = 0.7;
  base.castShadow = true;
  group.add(base);

  const core = new THREE.Mesh(new THREE.BoxGeometry(3.1, height, 3.1), stone);
  core.position.y = height * 0.5 + 0.7;
  core.castShadow = true;
  group.add(core);

  const tiers = [0.34, 0.62, 0.88];
  for (const offset of tiers) {
    const roofMesh = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 3.9, 0.42, 8), roof);
    roofMesh.position.y = 0.7 + height * offset;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.12, 0.16), glow);
    rim.position.set(0, 0.7 + height * offset + 0.24, 3.95);
    group.add(rim);
  }

  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.48, 4.4, 8), roof);
  finial.position.y = height + 2.5;
  finial.castShadow = true;
  group.add(finial);

  const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), glow);
  light.position.y = height + 4.8;
  group.add(light);

  scene.add(group);
  return { group, light, glow: light.material };
}

function createLandmarks(scene, route, random) {
  const towerSettings = [
    { t: 0.13, side: -1, height: 17 },
    { t: 0.35, side: 1, height: 14 },
    { t: 0.61, side: 1, height: 19 },
    { t: 0.84, side: -1, height: 15 },
  ];

  const towers = towerSettings.map((setting, index) => {
    const point = route.curve.getPointAt(setting.t);
    const tangent = route.curve.getTangentAt(setting.t).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, UP).normalize();
    const distance = 17 + random() * 4;
    point.addScaledVector(side, setting.side * distance);
    point.y = Math.max(0.3, point.y - 0.2);
    return createLandmarkTower(
      scene,
      point,
      setting.height,
      Math.atan2(tangent.x, tangent.z) + index * 0.16,
    );
  });
  return towers;
}

function createBridges(scene) {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: "#c5c9bf", roughness: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: "#3d565a", roughness: 0.84 });
  const bridges = [
    { position: [45, 1.15, 14], size: [17, 0.55, 3.1], rotation: 0 },
    { position: [45, 1.15, -10], size: [17, 0.55, 3.1], rotation: 0 },
    { position: [-13, 1.03, 50], size: [16, 0.55, 3.2], rotation: 0 },
    { position: [-13, 1.03, 6], size: [16, 0.55, 3.2], rotation: 0 },
  ];

  for (const bridge of bridges) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(...bridge.size), stone);
    deck.position.set(...bridge.position);
    deck.rotation.y = bridge.rotation;
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(bridge.size[0], 0.22, 0.14),
        dark,
      );
      rail.position.set(
        bridge.position[0],
        bridge.position[1] + 0.72,
        bridge.position[2] + side * bridge.size[2] * 0.43,
      );
      group.add(rail);
    }
  }
  scene.add(group);
  return group;
}

function createBellPavilion(scene) {
  const group = new THREE.Group();
  group.name = "wuling-bell-pavilion";
  group.position.set(-20, 1.25, -24);
  const stone = new THREE.MeshStandardMaterial({
    color: "#cfd4cb",
    roughness: 0.82,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: "#304c54",
    roughness: 0.64,
    metalness: 0.08,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: "#b87647",
    emissive: "#6d321f",
    emissiveIntensity: 0.35,
    metalness: 0.42,
    roughness: 0.42,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.8, 0.72, 12), stone);
  base.position.y = 0.36;
  base.receiveShadow = true;
  group.add(base);

  for (const x of [-3.55, 3.55]) {
    for (const z of [-2.6, 2.6]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 6.7, 10), stone);
      column.position.set(x, 3.7, z);
      column.castShadow = true;
      group.add(column);
    }
  }

  const lowerRoof = new THREE.Mesh(new THREE.ConeGeometry(6.8, 1.15, 4), roofMaterial);
  lowerRoof.position.y = 7.05;
  lowerRoof.rotation.y = Math.PI / 4;
  lowerRoof.scale.z = 0.82;
  lowerRoof.castShadow = true;
  group.add(lowerRoof);

  const upperRoof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 1.25, 4), roofMaterial);
  upperRoof.position.y = 8.12;
  upperRoof.rotation.y = Math.PI / 4;
  upperRoof.scale.z = 0.82;
  upperRoof.castShadow = true;
  group.add(upperRoof);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.34, 0.34), roofMaterial);
  beam.position.y = 6.1;
  group.add(beam);

  const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.62, 2.7, 18, 1, true), bronze);
  bell.position.y = 4.48;
  bell.castShadow = true;
  group.add(bell);

  const bellTop = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.14, 8, 24), bronze);
  bellTop.rotation.x = Math.PI / 2;
  bellTop.position.y = 5.82;
  group.add(bellTop);

  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), bronze);
  clapper.position.y = 3.15;
  group.add(clapper);

  scene.add(group);
  return { group, bell, clapper };
}

function createVegetation(scene, route, random) {
  const group = new THREE.Group();
  const trunks = [];
  const crowns = [];
  const bamboo = [];

  for (let i = 0; i < 180; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 26 + random() * 82;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x) < 25 && Math.abs(z) < 38) continue;
    if (isInsideRideNetwork(x, z, 4.5)) continue;
    const routeInfo = route.distanceToRoute(x, z);
    if (routeInfo.distance < 10.5) continue;
    const baseY = Math.max(-0.4, routeInfo.nearest.position.y - 0.75 + random() * 1.2);
    const height = 1.8 + random() * 2.8;

    trunks.push(cylinderGeometry(0.11 + random() * 0.08, height, [x, baseY + height * 0.5, z], [0, 0, 0], 6));
    const crownGeometry = new THREE.IcosahedronGeometry(1.2 + random() * 0.75, 1);
    const crownMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, baseY + height + 0.8, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(random(), random() * Math.PI, random() * 0.22)),
      new THREE.Vector3(1.15, 1.55 + random() * 0.45, 1.15),
    );
    crowns.push(bakeGeometry(crownGeometry, crownMatrix));

    if (i % 7 === 0) {
      for (let stalk = 0; stalk < 4; stalk++) {
        bamboo.push(cylinderGeometry(0.09, 5 + random() * 3, [x + (random() - 0.5) * 3, baseY + 2.5, z + (random() - 0.5) * 3], [0, 0, 0], 5));
      }
    }
  }

  addMerged(group, new THREE.MeshStandardMaterial({ color: "#5e6758", roughness: 1 }), trunks);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#496e61",
    roughness: 0.94,
    flatShading: true,
  }), crowns);
  addMerged(group, new THREE.MeshStandardMaterial({
    color: "#65845d",
    roughness: 0.95,
  }), bamboo, { castShadow: false });
  scene.add(group);
  return group;
}

function createRideZoneMarkers(scene) {
  const group = new THREE.Group();
  group.name = "rideable-zone-markers";
  const markerMaterial = new THREE.LineBasicMaterial({
    color: "#78f6e5",
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const accentMaterial = new THREE.LineBasicMaterial({
    color: "#f6b05f",
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });

  for (const zone of RIDE_ZONES) {
    if (zone.shape === "rect") {
      const positions = [
        zone.x - zone.halfX, zone.y + 0.035, zone.z - zone.halfZ,
        zone.x + zone.halfX, zone.y + 0.035, zone.z - zone.halfZ,
        zone.x + zone.halfX, zone.y + 0.035, zone.z + zone.halfZ,
        zone.x - zone.halfX, zone.y + 0.035, zone.z + zone.halfZ,
      ];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      group.add(new THREE.LineLoop(geometry, markerMaterial));
      continue;
    }

    const ringPositions = [];
    for (let index = 0; index < 64; index++) {
      const angle = (index / 64) * Math.PI * 2;
      ringPositions.push(
        zone.x + Math.cos(angle) * zone.radius,
        zone.y + 0.035,
        zone.z + Math.sin(angle) * zone.radius,
      );
    }
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute("position", new THREE.Float32BufferAttribute(ringPositions, 3));
    group.add(new THREE.LineLoop(ringGeometry, markerMaterial));

    const crossPositions = [
      zone.x - 1.1, zone.y + 0.04, zone.z,
      zone.x + 1.1, zone.y + 0.04, zone.z,
      zone.x, zone.y + 0.04, zone.z - 1.1,
      zone.x, zone.y + 0.04, zone.z + 1.1,
    ];
    const crossGeometry = new THREE.BufferGeometry();
    crossGeometry.setAttribute("position", new THREE.Float32BufferAttribute(crossPositions, 3));
    group.add(new THREE.LineSegments(crossGeometry, accentMaterial));
  }

  scene.add(group);
  return group;
}

function createWorldLabels(scene) {
  return [
    { name: "武陵南门", english: "WULING GATE", position: new THREE.Vector3(0, 15, 74) },
    { name: "方兴衢", english: "FANGXING DISTRICT", position: new THREE.Vector3(0, 9, 41) },
    { name: "岳研东街", english: "YUEYAN EAST", position: new THREE.Vector3(38, 8, 30) },
    { name: "武陵驿", english: "WULING POST", position: new THREE.Vector3(-49, 8, 30) },
    { name: "巨钟亭", english: "WULING BELL", position: new THREE.Vector3(-20, 13, -24) },
    { name: "武陵中枢", english: "WULING CORE", position: new THREE.Vector3(-7, 58, -31) },
  ].map((label) => {
    const anchor = new THREE.Object3D();
    anchor.position.copy(label.position);
    scene.add(anchor);
    return { ...label, anchor };
  });
}

export function createWulingWorld(scene, route) {
  const random = seededRandom(941207);
  const rideObstacles = [];
  scene.fog = new THREE.FogExp2("#a8c9c3", 0.0062);

  const hemisphere = new THREE.HemisphereLight("#d9f2ee", "#304538", 1.35);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight("#fff2d6", 2.35);
  sun.position.set(-48, 72, -62);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.00025;
  scene.add(sun);

  createSky(scene);
  createTerrain(scene, random);
  createMountains(scene, random);
  createWater(scene);
  createRoad(scene, route);
  createRideZoneMarkers(scene);
  createWulingWalls(scene);
  const district = createFangxingDistrict(scene, random);
  rideObstacles.push(...district.colliders);
  createCity(scene, route, random);
  const tower = createCentralTower(scene);
  const landmarks = [];
  const gate = createGate(scene);
  createRideCampaign(scene);
  const bellPavilion = createBellPavilion(scene);
  createVegetation(scene, route, random);
  const clouds = createClouds(scene, random);
  const labels = createWorldLabels(scene);

  const towerLight = new THREE.PointLight("#72f5e6", 28, 54, 1.8);
  towerLight.position.set(-7, 16, -31);
  scene.add(towerLight);

  rideObstacles.push(
    { shape: "circle", x: -7, z: -31, radius: 11.5, name: "武陵中枢" },
    { shape: "circle", x: 0, z: 41, radius: 2.65, name: "方兴衢骑行徽记" },
    { shape: "circle", x: -16.5, z: 74, radius: 2.5, name: "武陵南门西柱" },
    { shape: "circle", x: 16.5, z: 74, radius: 2.5, name: "武陵南门东柱" },
  );

  return {
    update(time, delta) {
      tower.rotor.rotation.y += delta * 0.22;
      tower.rings.forEach((ring, index) => {
        ring.rotation.z += delta * (index % 2 === 0 ? 0.08 : -0.06);
      });
      tower.beacon.material.emissiveIntensity = 2.2 + Math.sin(time * 2.3) * 0.65;
      towerLight.intensity = 24 + Math.sin(time * 1.8) * 6;
      landmarks.forEach((landmark, index) => {
        landmark.group.rotation.y += delta * (index % 2 === 0 ? 0.025 : -0.018);
        landmark.light.material.emissiveIntensity = 1.7 + Math.sin(time * 2.4 + index) * 0.5;
      });
      gate.children.at(-1).material.emissiveIntensity = 1.8 + Math.sin(time * 1.5) * 0.35;
      const bellSwing = Math.sin(time * 0.72) * 0.025;
      bellPavilion.bell.rotation.z = bellSwing;
      bellPavilion.clapper.position.x = Math.sin(time * 1.05) * 0.18;

      for (const cloud of clouds.children) {
        cloud.position.x += cloud.userData.drift * delta;
        if (cloud.position.x > cloud.userData.baseX + 135) {
          cloud.userData.baseX += 135;
        }
      }
    },
    labels,
    tower,
    rideObstacles,
  };
}
