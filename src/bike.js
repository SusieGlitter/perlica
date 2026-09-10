import * as THREE from "three";

function createTube(start, end, radius, material, radialSegments = 8) {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const length = direction.length();
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, radialSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(startVector).add(endVector).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

function createWheel(radius, tireWidth, materials) {
  const pivot = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tireWidth, 8, 36),
    materials.tire,
  );
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  pivot.add(tire);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius - tireWidth * 0.95, tireWidth * 0.28, 6, 36),
    materials.rim,
  );
  rim.rotation.y = Math.PI / 2;
  rim.castShadow = true;
  pivot.add(rim);

  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.08, radius * 0.08, tireWidth * 3.2, 10),
    materials.hub,
  );
  axle.rotation.z = Math.PI / 2;
  pivot.add(axle);

  const spokePositions = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    spokePositions.push(
      0,
      Math.cos(angle) * radius * 0.12,
      Math.sin(angle) * radius * 0.12,
      0,
      Math.cos(angle) * (radius - 0.035),
      Math.sin(angle) * (radius - 0.035),
    );
  }
  const spokeGeometry = new THREE.BufferGeometry();
  spokeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(spokePositions, 3));
  const spokes = new THREE.LineSegments(
    spokeGeometry,
    new THREE.LineBasicMaterial({
      color: "#cddeda",
      transparent: true,
      opacity: 0.74,
    }),
  );
  pivot.add(spokes);
  return pivot;
}

function createDisc(radius, x, z, materials, side) {
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.018, 36),
    materials.disc,
  );
  disc.rotation.z = Math.PI / 2;
  disc.position.set(side * x, 0.43, z);
  disc.castShadow = true;
  return disc;
}

// Legacy prototype kept only as a reference; the active bicycle is createCityBike().
function createBike() {
  const group = new THREE.Group();
  group.name = "perlica-bicycle";
  const visual = new THREE.Group();
  visual.position.y = 0.02;
  group.add(visual);

  const materials = {
    frame: new THREE.MeshStandardMaterial({
      color: "#1d3441",
      metalness: 0.58,
      roughness: 0.31,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: "#71f0df",
      emissive: "#2cbab3",
      emissiveIntensity: 1.6,
      metalness: 0.26,
      roughness: 0.28,
    }),
    tire: new THREE.MeshStandardMaterial({
      color: "#14262a",
      roughness: 0.86,
      metalness: 0.04,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: "#8fa9a6",
      metalness: 0.78,
      roughness: 0.28,
    }),
    hub: new THREE.MeshStandardMaterial({
      color: "#d47a4c",
      metalness: 0.54,
      roughness: 0.34,
    }),
    disc: new THREE.MeshStandardMaterial({
      color: "#7c8c8b",
      metalness: 0.9,
      roughness: 0.24,
    }),
    saddle: new THREE.MeshStandardMaterial({
      color: "#e5e8df",
      roughness: 0.48,
      metalness: 0.04,
    }),
  };

  const wheelRadius = 0.38;
  const drivetrain = {
    wheelRadius,
    chainringRadius: 0.16,
    cassetteRadius: 0.07,
    chainringTeeth: 46,
    cassetteTeeth: 18,
  };
  const frontWheel = createWheel(wheelRadius, 0.048, materials);
  const rearWheel = createWheel(wheelRadius, 0.048, materials);
  rearWheel.position.set(0, wheelRadius, -0.72);
  visual.add(rearWheel);
  const cassette = new THREE.Group();
  for (let index = 0; index < 5; index++) {
    const gear = new THREE.Mesh(
      new THREE.TorusGeometry(0.055 + index * 0.017, 0.009, 5, 20),
      materials.rim,
    );
    gear.rotation.y = Math.PI / 2;
    gear.position.x = 0.07 + index * 0.012;
    cassette.add(gear);
  }
  rearWheel.add(cassette);

  const steering = new THREE.Group();
  steering.name = "steering-assembly";
  steering.position.set(0, 0.59, 0.54);
  visual.add(steering);
  frontWheel.position.set(0, wheelRadius - steering.position.y, 0.18);
  steering.add(frontWheel);

  const bottomBracket = [0, 0.43, 0];
  const seatTop = [0, 0.98, 0];
  const headTop = [0, 1.03, 0.48];
  const headBottom = [0, 0.57, 0.54];
  const rearAxle = [0, wheelRadius, -0.72];
  const frontAxle = [0, wheelRadius, 0.72];

  const tubes = [
    createTube(bottomBracket, seatTop, 0.045, materials.frame),
    createTube(bottomBracket, headBottom, 0.052, materials.frame),
    createTube(seatTop, headTop, 0.045, materials.frame),
    createTube(headTop, headBottom, 0.043, materials.frame),
    createTube(bottomBracket, rearAxle, 0.026, materials.frame),
    createTube(seatTop, rearAxle, 0.027, materials.frame),
    createTube(headBottom, frontAxle, 0.035, materials.frame),
  ];
  visual.add(...tubes);

  const accentLine = createTube(
    [0.01, 0.53, 0.08],
    [-0.01, 1.01, 0.43],
    0.012,
    materials.accent,
    6,
  );
  visual.add(accentLine);

  const forkLeft = createTube(
    [-0.15, 0.02, 0],
    [-0.15, wheelRadius - steering.position.y, 0.18],
    0.022,
    materials.frame,
  );
  const forkRight = createTube(
    [0.15, 0.02, 0],
    [0.15, wheelRadius - steering.position.y, 0.18],
    0.022,
    materials.frame,
  );
  steering.add(forkLeft, forkRight);

  const handlebar = new THREE.Group();
  const handleBarCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.34, 10),
    materials.frame,
  );
  handleBarCore.rotation.z = Math.PI / 2;
  handleBarCore.castShadow = true;
  handlebar.add(handleBarCore);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.14, 10),
      materials.saddle,
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.x = side * 0.13;
    handlebar.add(grip);

    const end = new THREE.Mesh(new THREE.SphereGeometry(0.041, 10, 6), materials.accent);
    end.position.x = side * 0.18;
    handlebar.add(end);
  }
  handlebar.position.set(0, 0.55, 0.03);
  steering.add(handlebar);

  const bellGroup = new THREE.Group();
  const bellDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: "#e4b55f",
      metalness: 0.72,
      roughness: 0.24,
    }),
  );
  bellDome.scale.set(1, 0.72, 1);
  bellGroup.add(bellDome);
  const bellLever = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.012, 0.018),
    materials.rim,
  );
  bellLever.position.set(0.065, 0.005, 0);
  bellGroup.add(bellLever);
  bellGroup.position.set(0.085, 0.06, 0.02);
  handlebar.add(bellGroup);

  const saddle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.12, 0.36, 6, 10),
    materials.saddle,
  );
  saddle.rotation.x = Math.PI / 2;
  saddle.scale.set(1, 0.72, 1);
  saddle.position.set(0, 1.06, -0.01);
  saddle.castShadow = true;
  visual.add(saddle);

  const seatPost = createTube([0, 0.94, 0], [0, 1.04, -0.01], 0.024, materials.frame);
  visual.add(seatPost);
  const handlebarStem = createTube([0, 0, 0], [0, 0.55, 0.03], 0.025, materials.frame);
  steering.add(handlebarStem);

  const chainring = new THREE.Group();
  chainring.position.set(0.08, 0.43, 0);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, 6, 32),
    materials.accent,
  );
  ring.rotation.y = Math.PI / 2;
  chainring.add(ring);
  visual.add(chainring);

  const crankLeft = createTube([0, 0.43, 0], [0.18, 0.43, 0], 0.018, materials.frame);
  const crankRight = createTube([0, 0.43, 0], [-0.18, 0.43, 0], 0.018, materials.frame);
  visual.add(crankLeft, crankRight);

  const leftPedal = new THREE.Group();
  const rightPedal = new THREE.Group();
  for (const [pedal, side] of [[leftPedal, 1], [rightPedal, -1]]) {
    const pedalDeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.035, 0.12),
      materials.frame,
    );
    pedalDeck.castShadow = true;
    pedal.add(pedalDeck);
    pedal.userData.side = side;
    visual.add(pedal);
  }

  const protocolCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.105, 0),
    materials.accent,
  );
  protocolCore.position.set(0, 0.67, 0.06);
  protocolCore.rotation.z = Math.PI / 4;
  protocolCore.castShadow = true;
  visual.add(protocolCore);

  const coreCage = new THREE.Mesh(
    new THREE.TorusGeometry(0.145, 0.018, 6, 18),
    materials.rim,
  );
  coreCage.position.copy(protocolCore.position);
  coreCage.rotation.x = Math.PI / 2;
  visual.add(coreCage);

  const frameModule = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.32, 0.42),
    materials.saddle,
  );
  frameModule.position.set(0, 0.78, 0.14);
  frameModule.rotation.x = -0.12;
  frameModule.castShadow = true;
  visual.add(frameModule);

  const moduleLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.06, 0.1),
    materials.accent,
  );
  moduleLight.position.set(0, 0.8, 0.33);
  visual.add(moduleLight);

  const chainPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.08, 0.59, -0.04),
      new THREE.Vector3(0.1, 0.48, -0.72),
      new THREE.Vector3(0.1, 0.28, -0.72),
      new THREE.Vector3(0.08, 0.27, -0.04),
    ],
    true,
    "centripetal",
    0.22,
  );
  const chain = new THREE.Mesh(
    new THREE.TubeGeometry(chainPath, 96, 0.008, 5, true),
    materials.frame,
  );
  visual.add(chain);

  const chainLinkCount = 64;
  const chainLinks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.018, 0.018, 0.036),
    materials.rim,
    chainLinkCount,
  );
  chainLinks.castShadow = false;
  chainLinks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  visual.add(chainLinks);

  const basket = new THREE.Group();
  basket.name = "front-basket";
  const basketMaterial = new THREE.MeshStandardMaterial({
    color: "#5f4937",
    roughness: 0.82,
    metalness: 0.16,
  });
  const basketBandMaterial = new THREE.MeshStandardMaterial({
    color: "#8fe4d6",
    metalness: 0.42,
    roughness: 0.4,
  });
  const basketBottom = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.3), basketMaterial);
  basketBottom.position.y = -0.14;
  basket.add(basketBottom);
  for (const y of [-0.08, 0, 0.08]) {
    for (const z of [-0.14, 0.14]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.022, 0.02), basketMaterial);
      rail.position.set(0, y, z);
      basket.add(rail);
    }
    for (const x of [-0.22, 0.22]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.3), basketMaterial);
      rail.position.set(x, y, 0);
      basket.add(rail);
    }
  }
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.14, 0.14]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.3, 0.024), basketMaterial);
      post.position.set(x, 0, z);
      basket.add(post);
    }
  }
  for (const y of [-0.1, 0.05]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.012, 5, 20), basketBandMaterial);
    band.rotation.x = Math.PI / 2;
    band.scale.z = 0.64;
    band.position.y = y;
    basket.add(band);
  }
  basket.position.set(0, 0.5, 0.27);
  steering.add(basket);
  steering.add(
    createTube([-0.17, 0.32, 0.09], [-0.19, 0.46, 0.26], 0.009, materials.frame, 6),
    createTube([0.17, 0.32, 0.09], [0.19, 0.46, 0.26], 0.009, materials.frame, 6),
  );

  const plateCanvas = document.createElement("canvas");
  plateCanvas.width = 768;
  plateCanvas.height = 256;
  const plateContext = plateCanvas.getContext("2d");
  const plateGradient = plateContext.createLinearGradient(0, 0, plateCanvas.width, 0);
  plateGradient.addColorStop(0, "#1b5b42");
  plateGradient.addColorStop(0.55, "#8edf55");
  plateGradient.addColorStop(1, "#d9ef7c");
  plateContext.fillStyle = plateGradient;
  plateContext.fillRect(0, 0, plateCanvas.width, plateCanvas.height);
  plateContext.strokeStyle = "#e8ffe2";
  plateContext.lineWidth = 15;
  plateContext.strokeRect(9, 9, plateCanvas.width - 18, plateCanvas.height - 18);
  plateContext.fillStyle = "#0f3328";
  plateContext.font = "800 112px 'Microsoft YaHei', sans-serif";
  plateContext.textAlign = "center";
  plateContext.textBaseline = "middle";
  plateContext.fillText("武陵 E·01", plateCanvas.width / 2, 120);
  plateContext.font = "700 36px 'Arial Narrow', sans-serif";
  plateContext.fillText("NEW ENERGY", plateCanvas.width / 2, 210);
  const plateTexture = new THREE.CanvasTexture(plateCanvas);
  plateTexture.colorSpace = THREE.SRGBColorSpace;
  plateTexture.anisotropy = 8;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.14),
    new THREE.MeshBasicMaterial({
      map: plateTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  plate.position.set(0, 0.59, -0.858);
  plate.rotation.y = Math.PI;
  visual.add(plate);
  const plateFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.415, 0.155, 0.022),
    materials.frame,
  );
  plateFrame.position.set(0, 0.59, -0.835);
  visual.add(plateFrame);

  const plateMount = createTube([0, 0.7, -0.72], [0, 0.59, -0.82], 0.014, materials.frame);
  visual.add(plateMount);

  for (const side of [-1, 1]) {
    const brakeCaliper = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.1, 0.08),
      materials.hub,
    );
    brakeCaliper.position.set(side * 0.095, side > 0 ? 0.42 : 0.39, side > 0 ? 0.69 : -0.69);
    brakeCaliper.rotation.x = side > 0 ? -0.2 : 0.2;
    visual.add(brakeCaliper);
  }

  const tailSignal = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.05, 0.035),
    new THREE.MeshStandardMaterial({
      color: "#ff7a48",
      emissive: "#ff4d2f",
      emissiveIntensity: 1.8,
      roughness: 0.35,
    }),
  );
  tailSignal.position.set(0, 0.92, -0.48);
  visual.add(tailSignal);

  let bellContext = null;
  let bellRingAmount = 0;
  let wheelAngle = 0;
  let crankAngle = 0;
  let chainTravel = 0;
  const chainLocation = new THREE.Vector3();
  const chainTangent = new THREE.Vector3();
  const chainQuaternion = new THREE.Quaternion();
  const chainMatrix = new THREE.Matrix4();
  const chainUnitZ = new THREE.Vector3(0, 0, 1);
  const chainScale = new THREE.Vector3(1, 1, 1);
  const updateChainVisual = () => {
    const chainLength = Math.max(0.01, chainPath.getLength());
    const travel = chainTravel / chainLength;
    const offset = Number.isFinite(travel) ? ((-travel % 1) + 1) % 1 : 0;
    for (let index = 0; index < chainLinkCount; index++) {
      const rawT = (index / chainLinkCount + offset) % 1;
      const t = THREE.MathUtils.clamp(rawT, 0, 0.999999);
      chainPath.getPoint(t, chainLocation);
      chainPath.getTangent(t, chainTangent).normalize();
      chainQuaternion.setFromUnitVectors(chainUnitZ, chainTangent);
      chainMatrix.compose(chainLocation, chainQuaternion, chainScale);
      chainLinks.setMatrixAt(index, chainMatrix);
    }
    chainLinks.instanceMatrix.needsUpdate = true;
  };

  const frontDisc = createDisc(0.15, 0.095, 0, materials, 1);
  frontDisc.position.set(0.076, 0, 0);
  frontWheel.add(frontDisc);
  const rearDisc = createDisc(0.14, 0.095, -0.72, materials, -1);
  visual.add(rearDisc);

  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return {
    group,
    visual,
    drivetrain,
    wheels: [frontWheel, rearWheel],
    handlebar,
    chainring,
    crankLeft,
    crankRight,
    pedals: [leftPedal, rightPedal],
    saddle,
    seatPost,
    steering,
    protocolCore,
    coreCage,
    frameModule,
    moduleLight,
    tailSignal,
    updateWheelSpin(angle) {
      frontWheel.rotation.x = angle;
      rearWheel.rotation.x = angle;
      rearDisc.rotation.x = angle;
    },
    updateCrank(angle) {
      chainring.rotation.x = angle;
      const leftAngle = angle;
      const rightAngle = angle + Math.PI;
      const radius = 0.18;
      const pivot = new THREE.Vector3(0, 0.43, 0);
      const left = new THREE.Vector3(
        0.08,
        pivot.y + Math.sin(leftAngle) * radius,
        pivot.z + Math.cos(leftAngle) * radius,
      );
      const right = new THREE.Vector3(
        -0.08,
        pivot.y + Math.sin(rightAngle) * radius,
        pivot.z + Math.cos(rightAngle) * radius,
      );

      leftPedal.position.copy(left);
      rightPedal.position.copy(right);
      crankLeft.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        left.clone().sub(pivot).normalize(),
      );
      crankLeft.position.copy(pivot).add(left).multiplyScalar(0.5);
      crankRight.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        right.clone().sub(pivot).normalize(),
      );
      crankRight.position.copy(pivot).add(right).multiplyScalar(0.5);
      return {
        left,
        right,
      };
    },
    updateDrivetrain(distanceDelta) {
      wheelAngle += distanceDelta / drivetrain.wheelRadius;
      const crankDelta = (
        distanceDelta
        / drivetrain.wheelRadius
        * drivetrain.cassetteTeeth
        / drivetrain.chainringTeeth
      );
      crankAngle += crankDelta;
      chainTravel += distanceDelta / drivetrain.wheelRadius * drivetrain.cassetteRadius;
      frontWheel.rotation.x = wheelAngle;
      rearWheel.rotation.x = wheelAngle;
      rearDisc.rotation.x = wheelAngle;
      const feet = this.updateCrank(crankAngle);
      updateChainVisual();
      return {
        ...feet,
        wheelAngle,
        crankAngle,
      };
    },
    settleCrank(delta) {
      const target = Math.PI * 1.5;
      const change = shortestAngleDelta(crankAngle, target) * Math.min(1, delta * 4.8);
      crankAngle += change;
      chainTravel += change * drivetrain.chainringRadius;
      const feet = this.updateCrank(crankAngle);
      updateChainVisual();
      return {
        ...feet,
        wheelAngle,
        crankAngle,
      };
    },
    setSteering(angle) {
      steering.rotation.y = angle;
    },
    setSuspension(offset) {
      steering.position.y = 0.59 + offset;
    },
    setRideEnergy(amount) {
      const intensity = 0.75 + amount * 1.7;
      protocolCore.material.emissiveIntensity = intensity;
      moduleLight.material.emissiveIntensity = intensity;
      tailSignal.material.emissiveIntensity = 1.1 + amount * 2;
    },
    ringBell() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!bellContext) bellContext = new AudioContext();
      const now = bellContext.currentTime;
      const gain = bellContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
      gain.connect(bellContext.destination);
      for (const [frequency, delay] of [[1640, 0], [2130, 0.055], [2780, 0.09]]) {
        const oscillator = bellContext.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(now + delay);
        oscillator.stop(now + 0.5);
      }
      bellRingAmount = 1;
    },
    updateBell(delta) {
      bellRingAmount = THREE.MathUtils.damp(bellRingAmount, 0, 5.5, delta);
      bellGroup.rotation.z = Math.sin(bellRingAmount * Math.PI * 3) * bellRingAmount * 0.08;
    },
  };
}

function createCityBike() {
  const group = new THREE.Group();
  group.name = "perlica-city-bicycle-v2";
  const visual = new THREE.Group();
  group.add(visual);

  const materials = {
    frame: new THREE.MeshStandardMaterial({
      color: "#e27b45",
      metalness: 0.48,
      roughness: 0.34,
    }),
    frameDark: new THREE.MeshStandardMaterial({
      color: "#233e46",
      metalness: 0.64,
      roughness: 0.3,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: "#76f3e2",
      emissive: "#2bb8af",
      emissiveIntensity: 1.55,
      metalness: 0.36,
      roughness: 0.28,
    }),
    tire: new THREE.MeshStandardMaterial({
      color: "#101c20",
      roughness: 0.9,
      metalness: 0.02,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: "#b8c8c3",
      metalness: 0.82,
      roughness: 0.24,
    }),
    hub: new THREE.MeshStandardMaterial({
      color: "#d88955",
      metalness: 0.64,
      roughness: 0.3,
    }),
    disc: new THREE.MeshStandardMaterial({
      color: "#8c9a98",
      metalness: 0.92,
      roughness: 0.2,
    }),
    saddle: new THREE.MeshStandardMaterial({
      color: "#21383d",
      roughness: 0.5,
      metalness: 0.04,
    }),
    basket: new THREE.MeshStandardMaterial({
      color: "#76543a",
      roughness: 0.78,
      metalness: 0.08,
    }),
  };

  const wheelRadius = 0.345;
  const wheelbase = 1.46;
  const rearAxleZ = -wheelbase * 0.5;
  const frontAxleZ = wheelbase * 0.5;
  const bottomBracket = new THREE.Vector3(0, 0.43, -0.02);
  const seatTop = new THREE.Vector3(0, 0.98, -0.13);
  const headTop = new THREE.Vector3(0, 1.04, 0.46);
  const headBottom = new THREE.Vector3(0, 0.64, 0.58);
  const drivetrain = {
    wheelRadius,
    chainringRadius: 0.13,
    cassetteRadius: 0.051,
    chainringTeeth: 46,
    cassetteTeeth: 18,
  };

  const rearWheel = createWheel(wheelRadius, 0.04, materials);
  rearWheel.position.set(0, wheelRadius, rearAxleZ);
  visual.add(rearWheel);

  const cassette = new THREE.Group();
  cassette.name = "rear-cassette";
  for (let index = 0; index < 5; index++) {
    const radius = 0.045 + index * 0.009;
    const gear = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.006, 5, 24),
      materials.rim,
    );
    gear.rotation.y = Math.PI / 2;
    gear.position.x = -0.085 - index * 0.011;
    cassette.add(gear);
  }
  rearWheel.add(cassette);

  const steering = new THREE.Group();
  steering.name = "front-steering";
  steering.position.set(0, wheelRadius, frontAxleZ);
  visual.add(steering);
  const frontWheel = createWheel(wheelRadius, 0.04, materials);
  frontWheel.position.set(0, 0, 0);
  steering.add(frontWheel);

  const forkGeometries = [
    createTube(
      [-0.12, headBottom.y - wheelRadius, headBottom.z - frontAxleZ],
      [-0.09, 0, 0],
      0.018,
      materials.frameDark,
    ),
    createTube(
      [0.12, headBottom.y - wheelRadius, headBottom.z - frontAxleZ],
      [0.09, 0, 0],
      0.018,
      materials.frameDark,
    ),
  ];
  steering.add(...forkGeometries);

  const frameTubes = [
    createTube(bottomBracket.toArray(), seatTop.toArray(), 0.035, materials.frame),
    createTube(bottomBracket.toArray(), headBottom.toArray(), 0.04, materials.frame),
    createTube(seatTop.toArray(), [0, 0.74, 0.5], 0.029, materials.frame),
    createTube([0, 0.74, 0.5], headBottom.toArray(), 0.029, materials.frame),
    createTube(headTop.toArray(), headBottom.toArray(), 0.038, materials.frameDark),
    createTube(bottomBracket.toArray(), [0, wheelRadius, rearAxleZ], 0.022, materials.frameDark),
    createTube(seatTop.toArray(), [0, wheelRadius, rearAxleZ], 0.021, materials.frameDark),
  ];
  visual.add(...frameTubes);

  const downTubeAccent = createTube(
    [0.025, 0.49, -0.01],
    [-0.025, 0.91, 0.42],
    0.011,
    materials.accent,
    7,
  );
  visual.add(downTubeAccent);

  const handlebar = new THREE.Group();
  const handlebarCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.019, 0.48, 12),
    materials.frameDark,
  );
  handlebarCore.rotation.z = Math.PI / 2;
  handlebar.add(handlebarCore);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.13, 10),
      materials.saddle,
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.x = side * 0.175;
    handlebar.add(grip);
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 6), materials.accent);
    end.position.x = side * 0.235;
    handlebar.add(end);
  }
  handlebar.position.set(
    0,
    headTop.y - wheelRadius + 0.035,
    headTop.z - frontAxleZ,
  );
  steering.add(handlebar);

  const stem = createTube(
    [0, headTop.y - wheelRadius - 0.01, headTop.z - frontAxleZ],
    [0, headTop.y - wheelRadius + 0.03, headTop.z - frontAxleZ],
    0.018,
    materials.frameDark,
  );
  steering.add(stem);

  const bellGroup = new THREE.Group();
  const bellDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: "#e7b65f",
      metalness: 0.76,
      roughness: 0.22,
    }),
  );
  bellDome.scale.y = 0.72;
  bellGroup.add(bellDome);
  const bellLever = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.009, 0.014),
    materials.rim,
  );
  bellLever.position.set(0.052, 0.004, 0);
  bellGroup.add(bellLever);
  bellGroup.position.set(0.085, 0.045, 0);
  handlebar.add(bellGroup);

  const basket = new THREE.Group();
  basket.name = "front-basket";
  const basketBottom = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.028, 0.24), materials.basket);
  basketBottom.position.y = -0.115;
  basket.add(basketBottom);
  for (const y of [-0.075, -0.005, 0.065]) {
    for (const z of [-0.11, 0.11]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.017, 0.016), materials.basket);
      rail.position.set(0, y, z);
      basket.add(rail);
    }
    for (const x of [-0.165, 0.165]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.017, 0.24), materials.basket);
      rail.position.set(x, y, 0);
      basket.add(rail);
    }
  }
  for (const x of [-0.165, 0.165]) {
    for (const z of [-0.11, 0.11]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.021, 0.24, 0.021), materials.basket);
      post.position.set(x, -0.01, z);
      basket.add(post);
    }
  }
  for (const y of [-0.06, 0.055]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.009, 5, 20), materials.accent);
    band.rotation.x = Math.PI / 2;
    band.scale.z = 0.68;
    band.position.y = y;
    basket.add(band);
  }
  basket.position.set(
    0,
    headTop.y - wheelRadius + 0.17,
    headTop.z - frontAxleZ + 0.17,
  );
  steering.add(basket);
  steering.add(
    createTube(
      [-0.12, headTop.y - wheelRadius - 0.08, headTop.z - frontAxleZ + 0.08],
      [-0.16, basket.position.y - 0.13, basket.position.z - 0.03],
      0.008,
      materials.frameDark,
      6,
    ),
    createTube(
      [0.12, headTop.y - wheelRadius - 0.08, headTop.z - frontAxleZ + 0.08],
      [0.16, basket.position.y - 0.13, basket.position.z - 0.03],
      0.008,
      materials.frameDark,
      6,
    ),
  );

  const saddle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.105, 0.28, 6, 10),
    materials.saddle,
  );
  saddle.rotation.x = Math.PI / 2;
  saddle.scale.set(1, 0.68, 1);
  saddle.position.copy(seatTop).add(new THREE.Vector3(0, 0.08, -0.015));
  const seatPost = createTube(
    seatTop.toArray(),
    seatTop.clone().add(new THREE.Vector3(0, 0.085, -0.01)).toArray(),
    0.021,
    materials.frameDark,
  );
  visual.add(saddle, seatPost);

  const drivetrainAssembly = new THREE.Group();
  drivetrainAssembly.name = "crank-and-chainring";
  drivetrainAssembly.position.copy(bottomBracket);
  visual.add(drivetrainAssembly);

  const chainring = new THREE.Mesh(
    new THREE.TorusGeometry(drivetrain.chainringRadius, 0.012, 6, 40),
    materials.accent,
  );
  chainring.rotation.y = Math.PI / 2;
  chainring.position.x = -0.105;
  drivetrainAssembly.add(chainring);

  const crankAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.25, 12),
    materials.frameDark,
  );
  crankAxle.rotation.z = Math.PI / 2;
  drivetrainAssembly.add(crankAxle);

  const crankLength = 0.17;
  const crankLeft = createTube(
    [0.105, 0, 0],
    [0.105, crankLength, 0],
    0.013,
    materials.frameDark,
  );
  const crankRight = createTube(
    [-0.14, 0, 0],
    [-0.14, -crankLength, 0],
    0.013,
    materials.frameDark,
  );
  drivetrainAssembly.add(crankLeft, crankRight);

  const leftPedal = new THREE.Group();
  const rightPedal = new THREE.Group();
  for (const [pedal, x, y, side] of [
    [leftPedal, 0.105, crankLength, 1],
    [rightPedal, -0.14, -crankLength, -1],
  ]) {
    const pedalDeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.028, 0.075),
      materials.saddle,
    );
    pedalDeck.castShadow = true;
    pedal.add(pedalDeck);
    pedal.position.set(x, y, 0);
    pedal.userData.side = side;
    pedal.userData.base = new THREE.Vector3(x, y, 0);
    visual.add(pedal);
  }

  const chainX = -0.11;
  const chainPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(chainX, bottomBracket.y + drivetrain.chainringRadius, bottomBracket.z),
      new THREE.Vector3(chainX, wheelRadius + drivetrain.cassetteRadius, rearAxleZ),
      new THREE.Vector3(chainX, wheelRadius - drivetrain.cassetteRadius, rearAxleZ),
      new THREE.Vector3(chainX, bottomBracket.y - drivetrain.chainringRadius, bottomBracket.z),
    ],
    true,
    "centripetal",
    0.2,
  );
  const chain = new THREE.Mesh(
    new THREE.TubeGeometry(chainPath, 96, 0.006, 5, true),
    materials.frameDark,
  );
  visual.add(chain);

  const chainLinkCount = 68;
  const chainLinks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.014, 0.014, 0.028),
    materials.rim,
    chainLinkCount,
  );
  chainLinks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  visual.add(chainLinks);

  const rearRack = new THREE.Group();
  const rackTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.34), materials.frameDark);
  rackTop.position.set(0, 0.78, rearAxleZ);
  rearRack.add(rackTop);
  for (const x of [-0.11, 0.11]) {
    rearRack.add(
      createTube(
        [x, wheelRadius, rearAxleZ],
        [x, 0.77, rearAxleZ + 0.08],
        0.009,
        materials.frameDark,
        6,
      ),
    );
  }
  visual.add(rearRack);

  const plateCanvas = document.createElement("canvas");
  plateCanvas.width = 768;
  plateCanvas.height = 256;
  const plateContext = plateCanvas.getContext("2d");
  const plateGradient = plateContext.createLinearGradient(0, 0, plateCanvas.width, 0);
  plateGradient.addColorStop(0, "#1d5d45");
  plateGradient.addColorStop(0.58, "#95df58");
  plateGradient.addColorStop(1, "#e1ef83");
  plateContext.fillStyle = plateGradient;
  plateContext.fillRect(0, 0, plateCanvas.width, plateCanvas.height);
  plateContext.strokeStyle = "#edffe7";
  plateContext.lineWidth = 15;
  plateContext.strokeRect(9, 9, plateCanvas.width - 18, plateCanvas.height - 18);
  plateContext.fillStyle = "#12352b";
  plateContext.textAlign = "center";
  plateContext.textBaseline = "middle";
  plateContext.font = "800 108px 'Microsoft YaHei', sans-serif";
  plateContext.fillText("武陵 E·01", plateCanvas.width / 2, 117);
  plateContext.font = "700 34px 'Arial Narrow', sans-serif";
  plateContext.fillText("NEW ENERGY", plateCanvas.width / 2, 208);
  const plateTexture = new THREE.CanvasTexture(plateCanvas);
  plateTexture.colorSpace = THREE.SRGBColorSpace;
  plateTexture.anisotropy = 8;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.113),
    new THREE.MeshBasicMaterial({
      map: plateTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  plate.position.set(0, 0.59, rearAxleZ - 0.19);
  plate.rotation.y = Math.PI;
  const plateFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.37, 0.137, 0.02),
    materials.frameDark,
  );
  plateFrame.position.set(0, 0.59, rearAxleZ - 0.205);
  visual.add(plate, plateFrame);

  const frontDisc = createDisc(0.13, 0.075, 0, materials, 1);
  frontDisc.position.set(0.07, 0, 0);
  frontWheel.add(frontDisc);
  const rearDisc = createDisc(0.125, 0.075, rearAxleZ, materials, -1);
  rearDisc.position.y = wheelRadius;
  visual.add(rearDisc);

  for (const side of [-1, 1]) {
    const caliper = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.08, 0.07),
      materials.hub,
    );
    caliper.position.set(side * 0.075, side > 0 ? 0.38 : 0.36, side > 0 ? frontAxleZ : rearAxleZ);
    visual.add(caliper);
  }

  const tailSignal = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.04, 0.025),
    new THREE.MeshStandardMaterial({
      color: "#ff8351",
      emissive: "#ff4e2d",
      emissiveIntensity: 1.7,
      roughness: 0.34,
    }),
  );
  tailSignal.position.set(0, 0.84, rearAxleZ - 0.17);
  visual.add(tailSignal);

  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  let wheelAngle = 0;
  let crankAngle = 0;
  let chainTravel = 0;
  let bellContext = null;
  let bellRingAmount = 0;
  const chainLocation = new THREE.Vector3();
  const chainTangent = new THREE.Vector3();
  const chainQuaternion = new THREE.Quaternion();
  const chainMatrix = new THREE.Matrix4();
  const chainUnitZ = new THREE.Vector3(0, 0, 1);
  const chainScale = new THREE.Vector3(1, 1, 1);

  const updateChainVisual = () => {
    const chainLength = Math.max(0.01, chainPath.getLength());
    const travel = chainTravel / chainLength;
    const offset = Number.isFinite(travel) ? ((-travel % 1) + 1) % 1 : 0;
    for (let index = 0; index < chainLinkCount; index++) {
      const rawT = (index / chainLinkCount + offset) % 1;
      const t = THREE.MathUtils.clamp(rawT, 0, 0.999999);
      chainPath.getPoint(t, chainLocation);
      chainPath.getTangent(t, chainTangent).normalize();
      chainQuaternion.setFromUnitVectors(chainUnitZ, chainTangent);
      chainMatrix.compose(chainLocation, chainQuaternion, chainScale);
      chainLinks.setMatrixAt(index, chainMatrix);
    }
    chainLinks.instanceMatrix.needsUpdate = true;
  };

  const isolateAngle = (angle) => THREE.MathUtils.euclideanModulo(angle, Math.PI * 2);
  const nearestEquivalentAngle = (angle, target) => {
    const turns = Math.round((angle - target) / (Math.PI * 2));
    return target + turns * Math.PI * 2;
  };

  const updateCrank = (angle) => {
    drivetrainAssembly.rotation.x = angle;
    const right = rightPedal.userData.base.clone().applyQuaternion(drivetrainAssembly.quaternion)
      .add(drivetrainAssembly.position);
    const left = leftPedal.userData.base.clone().applyQuaternion(drivetrainAssembly.quaternion)
      .add(drivetrainAssembly.position);
    leftPedal.position.copy(left);
    rightPedal.position.copy(right);
    return { left, right };
  };

  const runDrivetrain = (distanceDelta) => {
    wheelAngle += distanceDelta / wheelRadius;
    const crankDelta = (
      distanceDelta
      / wheelRadius
      * drivetrain.cassetteTeeth
      / drivetrain.chainringTeeth
    );
    crankAngle += crankDelta;
    chainTravel += crankDelta * drivetrain.chainringRadius;
    frontWheel.rotation.x = wheelAngle;
    rearWheel.rotation.x = wheelAngle;
    rearDisc.rotation.x = wheelAngle;
    updateChainVisual();
    return {
      ...updateCrank(crankAngle),
      wheelAngle,
      crankAngle,
    };
  };

  return {
    group,
    visual,
    drivetrain,
    wheels: [frontWheel, rearWheel],
    steering,
    handlebar,
    chainring,
    crankLeft,
    crankRight,
    pedals: [leftPedal, rightPedal],
    saddle,
    seatPost,
    updateWheelSpin(angle) {
      wheelAngle = angle;
      frontWheel.rotation.x = angle;
      rearWheel.rotation.x = angle;
      rearDisc.rotation.x = angle;
    },
    updateCrank,
    updateDrivetrain: runDrivetrain,
    settleCrank(delta, supportSide = 1) {
      const target = supportSide > 0 ? Math.PI : 0;
      const equivalent = nearestEquivalentAngle(crankAngle, target);
      const change = (equivalent - crankAngle) * Math.min(1, delta * 4.8);
      crankAngle += change;
      chainTravel += change * drivetrain.chainringRadius;
      updateChainVisual();
      return {
        ...updateCrank(crankAngle),
        wheelAngle,
        crankAngle,
      };
    },
    isolateAngle,
    setSteering(angle) {
      steering.rotation.y = angle;
    },
    setSuspension(offset) {
      steering.position.y = wheelRadius + offset;
    },
    setRideEnergy(amount) {
      const intensity = 0.7 + amount * 1.65;
      materials.accent.emissiveIntensity = intensity;
      tailSignal.material.emissiveIntensity = 1.05 + amount * 1.9;
    },
    ringBell() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!bellContext) bellContext = new AudioContext();
      const now = bellContext.currentTime;
      const gain = bellContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      gain.connect(bellContext.destination);
      for (const [frequency, delay] of [[1570, 0], [2090, 0.05], [2730, 0.085]]) {
        const oscillator = bellContext.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(now + delay);
        oscillator.stop(now + 0.48);
      }
      bellRingAmount = 1;
    },
    updateBell(delta) {
      bellRingAmount = THREE.MathUtils.damp(bellRingAmount, 0, 5.5, delta);
      bellGroup.rotation.z = Math.sin(bellRingAmount * Math.PI * 3) * bellRingAmount * 0.08;
    },
  };
}

function setPose(bone, baseQuaternion, rotation) {
  if (!bone) return;
  const offset = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
  );
  bone.quaternion.copy(baseQuaternion).multiply(offset);
}

function solveLeg(hipY, footY, footZ, upperLength, lowerLength) {
  const dy = footY - hipY;
  const dz = footZ;
  const distance = Math.min(
    Math.hypot(dy, dz),
    upperLength + lowerLength - 0.001,
  );
  const targetAngle = Math.atan2(dz, -dy);
  const hipAngle = Math.acos(
    THREE.MathUtils.clamp(
      (upperLength * upperLength + distance * distance - lowerLength * lowerLength)
        / (2 * upperLength * distance),
      -1,
      1,
    ),
  );
  const kneeAngle = Math.PI - Math.acos(
    THREE.MathUtils.clamp(
      (upperLength * upperLength + lowerLength * lowerLength - distance * distance)
        / (2 * upperLength * lowerLength),
      -1,
      1,
    ),
  );
  return {
    thigh: -(targetAngle + hipAngle),
    knee: THREE.MathUtils.clamp(kneeAngle, 0.06, 2.36),
  };
}

function shortestAngleDelta(from, to) {
  return ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function solvePlanarIK(joints, endpoint, targetWorld, axisWorld, iterations = 7) {
  if (joints.some((joint) => !joint) || !endpoint) return;
  const jointWorld = new THREE.Vector3();
  const endpointWorld = new THREE.Vector3();
  const jointToEndpoint = new THREE.Vector3();
  const jointToTarget = new THREE.Vector3();
  const worldDelta = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const localDelta = new THREE.Quaternion();

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const joint of joints) {
      joint.updateWorldMatrix(true, true);
      joint.getWorldPosition(jointWorld);
      endpoint.getWorldPosition(endpointWorld);
      const jointPosition = jointWorld;
      jointToEndpoint.copy(endpointWorld).sub(jointPosition);
      jointToTarget.copy(targetWorld).sub(jointPosition);
      jointToEndpoint.addScaledVector(axisWorld, -jointToEndpoint.dot(axisWorld));
      jointToTarget.addScaledVector(axisWorld, -jointToTarget.dot(axisWorld));
      if (jointToEndpoint.lengthSq() < 0.000001 || jointToTarget.lengthSq() < 0.000001) continue;
      jointToEndpoint.normalize();
      jointToTarget.normalize();
      const cross = new THREE.Vector3().crossVectors(jointToEndpoint, jointToTarget);
      const signedAngle = Math.atan2(axisWorld.dot(cross), jointToEndpoint.dot(jointToTarget));
      const step = THREE.MathUtils.clamp(signedAngle, -0.18, 0.18) * 0.72;
      if (Math.abs(step) < 0.0001) continue;
      worldDelta.setFromAxisAngle(axisWorld, step);
      joint.parent.getWorldQuaternion(parentWorld);
      localDelta.copy(parentWorld).invert().multiply(worldDelta).multiply(parentWorld);
      joint.quaternion.premultiply(localDelta).normalize();
      joint.updateWorldMatrix(false, true);
    }
  }
}

export async function loadRider(gltf, bike) {
  const model = gltf.scene;
  const rider = new THREE.Group();
  rider.name = "perlica-rider";
  rider.position.set(0, 0.01, -0.12);
  rider.rotation.x = 0.16;
  rider.add(model);
  bike.visual.add(rider);

  const boneByOriginalIndex = new Map();
  model.traverse((object) => {
    const association = gltf.parser.associations.get(object);
    const nodeIndex = association?.nodes ?? association?.node;
    if (object.isBone && Number.isInteger(nodeIndex)) {
      boneByOriginalIndex.set(nodeIndex, object);
    }

    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;

      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of sourceMaterials) {
        if (!material) continue;
        material.side = THREE.DoubleSide;
        material.roughness = Math.min(0.82, material.roughness ?? 0.72);
        material.metalness = Math.min(0.08, material.metalness ?? 0.02);
        material.alphaTest = Math.max(material.alphaTest ?? 0, 0.04);
        material.emissiveIntensity = 0;
        if (/Cloth2Alpha/i.test(material.name)) {
          material.transparent = true;
          material.alphaTest = 0.16;
          material.depthWrite = true;
        }
        material.needsUpdate = true;
      }
    }
  });

  const requiredBones = [
    26, 27, 28, 29, 30, 31, 32, 33,
    39, 40, 41,
    160, 161, 162, 163, 167,
    206, 207, 208, 209, 213,
    666, 667, 668, 669, 670, 671, 672, 673,
    674, 675, 676, 677, 678, 679,
    680, 681, 682, 683, 684,
    685, 686, 687,
  ];
  const bones = Object.fromEntries(
    requiredBones.map((index) => [index, boneByOriginalIndex.get(index)]),
  );
  const baseQuaternions = new Map();
  for (const bone of Object.values(bones)) {
    if (bone) baseQuaternions.set(bone, bone.quaternion.clone());
  }

  const set = (index, rotation) => {
    const bone = bones[index];
    setPose(bone, baseQuaternions.get(bone), rotation);
  };
  const leftAbduction = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -0.06,
  );
  const rightAbduction = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    0.06,
  );

  const updatePose = (time, rideState = {}) => {
    const speed = rideState.speed ?? 0;
    const steer = rideState.steer ?? 0;
    const braking = rideState.braking ?? 0;
    const footDownTarget = rideState.footDown ?? 0;
    const reverse = rideState.reverse ?? 0;
    const supportSide = rideState.supportSide ?? 1;
    const bothFeet = rideState.bothFeet ?? 0;
    const crankAngle = (bike.group.userData.crankAngle ?? 0);
    const pedalTargets = bike.updateCrank(crankAngle);
    const modelFootL = pedalTargets.left.clone().sub(new THREE.Vector3(0, 0, -0.12));
    const modelFootR = pedalTargets.right.clone().sub(new THREE.Vector3(0, 0, -0.12));

    const leftLeg = solveLeg(1.03, modelFootL.y, modelFootL.z, 0.391, 0.47);
    const rightLeg = solveLeg(1.03, modelFootR.y, modelFootR.z, 0.391, 0.47);
    const plantedLeft = solveLeg(1.03, 0.16, 0.3, 0.391, 0.47);
    const plantedRight = solveLeg(1.03, 0.16, 0.3, 0.391, 0.47);
    const pedalWeight = THREE.MathUtils.clamp(Math.abs(speed) / 5.5, 0, 1);
    const footDown = THREE.MathUtils.smoothstep(footDownTarget, 0, 1);
    const leftSupportWeight = THREE.MathUtils.lerp(
      supportSide > 0 ? 1 : 0,
      1,
      bothFeet,
    );
    const rightSupportWeight = THREE.MathUtils.lerp(
      supportSide < 0 ? 1 : 0,
      1,
      bothFeet,
    );
    const bob = Math.sin(crankAngle * 2) * 0.08 * pedalWeight;
    const leftThigh = THREE.MathUtils.lerp(
      leftLeg.thigh,
      plantedLeft.thigh,
      footDown * leftSupportWeight,
    );
    const rightThigh = THREE.MathUtils.lerp(
      rightLeg.thigh,
      plantedRight.thigh,
      footDown * rightSupportWeight,
    );
    const leftKnee = THREE.MathUtils.lerp(
      leftLeg.knee,
      plantedLeft.knee,
      footDown * leftSupportWeight,
    );
    const rightKnee = THREE.MathUtils.lerp(
      rightLeg.knee,
      plantedRight.knee,
      footDown * rightSupportWeight,
    );

    set(30, [leftThigh + bob * 0.025, 0, -0.025]);
    set(26, [rightThigh - bob * 0.025, 0, 0.025]);
    bones[30]?.quaternion.premultiply(leftAbduction).normalize();
    bones[26]?.quaternion.premultiply(rightAbduction).normalize();
    set(31, [leftKnee, 0, 0]);
    set(27, [rightKnee, 0, 0]);
    set(32, [-0.18 + footDown * leftSupportWeight * 0.1, 0, -0.08]);
    set(28, [-0.18 + footDown * rightSupportWeight * 0.1, 0, 0.08]);

    bike.visual.updateWorldMatrix(true, true);
    const legAxisWorld = new THREE.Vector3(1, 0, 0)
      .transformDirection(bike.group.matrixWorld)
      .normalize();
    const leftContactTarget = pedalTargets.left.clone();
    const paddlePhase = (Math.sin(time * 4.6) + 1) * 0.5;
    const plantedLeftTarget = new THREE.Vector3(
      0.075,
      0.16,
      0.18 + paddlePhase * reverse * (supportSide > 0 ? 0.28 : 0),
    );
    leftContactTarget.lerp(plantedLeftTarget, footDown * leftSupportWeight);
    bike.visual.localToWorld(leftContactTarget);
    solvePlanarIK(
      [bones[30], bones[31], bones[32]],
      bones[33],
      leftContactTarget,
      legAxisWorld,
    );

    const rightContactTarget = pedalTargets.right.clone();
    const plantedRightTarget = new THREE.Vector3(
      -0.075,
      0.16,
      0.18 + paddlePhase * reverse * (supportSide < 0 ? 0.28 : 0),
    );
    rightContactTarget.lerp(plantedRightTarget, footDown * rightSupportWeight);
    bike.visual.localToWorld(rightContactTarget);
    solvePlanarIK(
      [bones[26], bones[27], bones[28]],
      bones[29],
      rightContactTarget,
      legAxisWorld,
    );

    set(160, [0, steer * 0.16, 0]);
    set(206, [0, -steer * 0.16, 0]);
    set(161, [0, 0, -0.85 - steer * 0.06]);
    set(207, [0, 0, -0.85 + steer * 0.06]);
    set(163, [0, 0, -0.55 + steer * 0.08]);
    set(209, [0, 0, -0.55 - steer * 0.08]);
    set(167, [0, 0, -0.18]);
    set(213, [0, 0, -0.18]);

    set(39, [
      0.045 + braking * 0.08,
      Math.sin(time * 0.8) * 0.012,
      steer * -0.075,
    ]);
    set(40, [0.08 + Math.sin(time * 1.3) * 0.012 + braking * 0.04, 0, -0.02]);
    set(41, [
      -0.045 + Math.sin(time * 0.9) * 0.02,
      0.04 + Math.sin(time * 0.42) * 0.035 + steer * 0.34,
      0,
    ]);

    const skirtFlow = THREE.MathUtils.clamp(Math.abs(speed) / 8, 0, 1);
    const skirtLift = footDown * 0.055 + reverse * 0.035;
    set(680, [-0.08 - skirtFlow * 0.06 + skirtLift, -steer * 0.09, 0.02]);
    set(681, [-0.045 - skirtFlow * 0.035, -steer * 0.05, 0.012]);
    set(682, [-0.03 - skirtFlow * 0.025, -steer * 0.025, 0.008]);
    set(683, [-0.02 - skirtFlow * 0.015, -steer * 0.012, 0]);
    set(684, [-0.012 - skirtFlow * 0.01, -steer * 0.006, 0]);
    set(685, [-0.08 - skirtFlow * 0.06 + skirtLift, steer * 0.09, -0.02]);
    set(686, [-0.045 - skirtFlow * 0.035, steer * 0.05, -0.012]);
    set(687, [-0.03 - skirtFlow * 0.025, steer * 0.025, -0.008]);
    for (let index = 666; index <= 679; index++) {
      const side = index <= 672 ? -1 : 1;
      set(index, [
        -0.025 - skirtFlow * 0.018,
        Math.sin(time * 1.5 + index * 0.31) * 0.018 + steer * side * 0.025,
        side * (0.02 + skirtFlow * 0.025),
      ]);
    }
  };

  return {
    group: rider,
    model,
    bones,
    updatePose,
  };
}

export function createBicycle() {
  return createCityBike();
}
