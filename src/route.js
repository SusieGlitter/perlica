import * as THREE from "three";

export const ROUTE_POINTS = [
  [0, 1.1, 8],
  [18, 1.1, 8],
  [38, 1.1, 8],
  [38, 1.1, 20],
  [38, 1.1, 30],
  [38, 1.1, 42],
  [38, 1.1, 52],
  [38, 1.1, 63],
  [38, 1.1, 74],
  [19, 1.1, 74],
  [0, 1.1, 74],
  [-22, 1.1, 74],
  [-44, 1.1, 74],
  [-44, 1.1, 63],
  [-44, 1.1, 52],
  [-44, 1.1, 42],
  [-44, 1.1, 30],
  [-44, 1.1, 20],
  [-44, 1.1, 8],
  [-22, 1.1, 8],
];

export const ROUTE_STOPS = [
  {
    t: 0.005,
    index: "01",
    name: "方兴衢南街",
    english: "FANGXING SOUTH",
    note: "从城南市集出发，沿宽阔石路向东骑行。",
  },
  {
    t: 0.245,
    index: "02",
    name: "岳研东街",
    english: "YUEYAN EAST",
    note: "商铺檐廊与青色灯带沿着街面展开。",
  },
  {
    t: 0.49,
    index: "03",
    name: "方兴衢北庭",
    english: "FANGXING NORTH",
    note: "骑行活动从长街转入北侧商区的开阔前场。",
  },
  {
    t: 0.735,
    index: "04",
    name: "武陵驿西巷",
    english: "WULING POST WEST",
    note: "穿过西巷，古城屋檐在车铃声中后退。",
  },
  {
    t: 0.93,
    index: "05",
    name: "骑行集结点",
    english: "RIDE ASSEMBLY",
    note: "回到南街起点，把武陵的风留在身后。",
  },
];

export const RIDE_ZONES = [
  { name: "方兴衢南街", shape: "rect", x: 0, z: 8, halfX: 60, halfZ: 4.7, y: 1.12 },
  { name: "方兴衢中街", shape: "rect", x: 0, z: 30, halfX: 60, halfZ: 5.6, y: 1.12 },
  { name: "方兴衢北街", shape: "rect", x: 0, z: 52, halfX: 60, halfZ: 5.9, y: 1.12 },
  { name: "武陵南门大街", shape: "rect", x: 0, z: 74, halfX: 60, halfZ: 5.1, y: 1.12 },
  { name: "武陵驿西巷", shape: "rect", x: -44, z: 41, halfX: 5.1, halfZ: 38, y: 1.12 },
  { name: "方兴衢中路", shape: "rect", x: 0, z: 41, halfX: 6, halfZ: 38, y: 1.12 },
  { name: "岳研东街", shape: "rect", x: 38, z: 41, halfX: 5.1, halfZ: 38, y: 1.12 },
  { name: "方兴衢中心广场", shape: "rect", x: 0, z: 41, halfX: 6.5, halfZ: 4.8, y: 1.13 },
  { name: "岳研骑行前场", shape: "rect", x: 38, z: 30, halfX: 7.5, halfZ: 5.1, y: 1.13 },
  { name: "武陵驿集结点", shape: "rect", x: -44, z: 30, halfX: 6.4, halfZ: 5.1, y: 1.13 },
];

export const FANGXING_ROADS = {
  horizontal: [
    { z: 8, halfZ: 4.7 },
    { z: 30, halfZ: 5.6 },
    { z: 52, halfZ: 5.9 },
    { z: 74, halfZ: 5.1 },
  ],
  vertical: [
    { x: -44, halfX: 5.1 },
    { x: 0, halfX: 6 },
    { x: 38, halfX: 5.1 },
  ],
};

export function createRoute() {
  const curve = new THREE.CatmullRomCurve3(
    ROUTE_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    true,
    "catmullrom",
    0.42,
  );
  curve.arcLengthDivisions = 1000;

  const sampleCount = 900;
  const samples = [];
  const distanceToRoute = (x, z) => {
    let min = Number.POSITIVE_INFINITY;
    let nearest = samples[0];

    for (let i = 0; i < samples.length; i += 2) {
      const sample = samples[i];
      const dx = sample.position.x - x;
      const dz = sample.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min) {
        min = d2;
        nearest = sample;
      }
    }

    return { distance: Math.sqrt(min), nearest };
  };

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    samples.push({ t, position, tangent });
  }

  return {
    curve,
    samples,
    stops: ROUTE_STOPS,
    distanceToRoute,
    length: curve.getLength(),
  };
}
