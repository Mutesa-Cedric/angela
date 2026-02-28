import * as THREE from "three";
import { RISK_LAYOUT } from "../layout";

/**
 * Add high-contrast axis guides + labels to improve 3D readability.
 */

const N_JURISDICTIONS = 8;
const AXIS_Y_MAX = RISK_LAYOUT.heightScale + 0.8;
const LANE_HALF_SPAN = ((N_JURISDICTIONS - 1) * RISK_LAYOUT.laneSpacing) / 2;
const AXIS_ANCHOR_X = -LANE_HALF_SPAN - 4.2;
const AXIS_ANCHOR_Z = -RISK_LAYOUT.kycZOffset - 3.1;
const FLOOR_Y = -0.2;
const Z_MIN = -RISK_LAYOUT.jitterRadiusMax - RISK_LAYOUT.laneWave - 0.85;
const Z_MAX = RISK_LAYOUT.kycZOffset + RISK_LAYOUT.jitterRadiusMax + RISK_LAYOUT.laneWave + 0.85;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeTextSprite(
  text: string,
  color: string = "#9fc7ff",
  bg: string = "rgba(8, 14, 28, 0.55)",
  scaleX: number = 1.8,
  scaleY: number = 0.5,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bg !== "transparent") {
    drawRoundedRect(ctx, 6, 8, canvas.width - 12, canvas.height - 16, 10);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(110, 170, 255, 0.22)";
    ctx.stroke();
  }

  ctx.font = "700 24px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scaleX, scaleY, 1);
  return sprite;
}

function addLine(
  group: THREE.Group,
  a: THREE.Vector3,
  b: THREE.Vector3,
  color: number,
  opacity: number,
): void {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
  });
  const line = new THREE.Line(geometry, material);
  group.add(line);
}

function addGuideBox(
  group: THREE.Group,
  size: THREE.Vector3,
  center: THREE.Vector3,
  color: number,
  edgeOpacity: number = 0.1,
  fillOpacity: number = 0.008,
): void {
  const fillGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: fillOpacity,
    depthWrite: false,
    depthTest: false,
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.position.copy(center);
  group.add(fillMesh);

  const edgeGeo = new THREE.EdgesGeometry(fillGeo);
  const edgeMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: edgeOpacity,
    depthWrite: false,
    depthTest: false,
  });
  const edgeMesh = new THREE.LineSegments(edgeGeo, edgeMat);
  edgeMesh.position.copy(center);
  group.add(edgeMesh);
}

export function addAxisLabels(scene: THREE.Scene): void {
  const group = new THREE.Group();
  group.name = "AxisGuideLayer";

  // ── Light bounding boxes (readability guides) ────────────────────────
  const laneBoxWidth = RISK_LAYOUT.laneSpacing * 0.78;
  const laneBoxHeight = AXIS_Y_MAX + 0.6;
  const laneBoxDepth = Z_MAX - Z_MIN;
  const laneCenterY = FLOOR_Y + laneBoxHeight / 2;
  const laneCenterZ = (Z_MIN + Z_MAX) / 2;
  for (let lane = 0; lane < N_JURISDICTIONS; lane += 1) {
    const x = lane * RISK_LAYOUT.laneSpacing - LANE_HALF_SPAN;
    const color = lane % 2 === 0 ? 0x77aefc : 0x67c3dd;
    addGuideBox(
      group,
      new THREE.Vector3(laneBoxWidth, laneBoxHeight, laneBoxDepth),
      new THREE.Vector3(x, laneCenterY, laneCenterZ),
      color,
    );
  }

  // Subtle high-risk zone box near the top (helps read y-axis bands).
  const highRiskHeight = RISK_LAYOUT.heightScale * 0.33;
  const highRiskCenterY = RISK_LAYOUT.heightScale * 0.84;
  addGuideBox(
    group,
    new THREE.Vector3(LANE_HALF_SPAN * 2 + RISK_LAYOUT.laneSpacing, highRiskHeight, laneBoxDepth),
    new THREE.Vector3(0, highRiskCenterY, laneCenterZ),
    0xff9878,
    0.12,
    0.012,
  );

  // ── Axis rails ────────────────────────────────────────────────────────
  addLine(
    group,
    new THREE.Vector3(-LANE_HALF_SPAN, FLOOR_Y, AXIS_ANCHOR_Z),
    new THREE.Vector3(LANE_HALF_SPAN, FLOOR_Y, AXIS_ANCHOR_Z),
    0x7fb2ff,
    0.9,
  );
  addLine(
    group,
    new THREE.Vector3(AXIS_ANCHOR_X, FLOOR_Y, AXIS_ANCHOR_Z),
    new THREE.Vector3(AXIS_ANCHOR_X, AXIS_Y_MAX, AXIS_ANCHOR_Z),
    0x8ec2ff,
    0.9,
  );
  addLine(
    group,
    new THREE.Vector3(AXIS_ANCHOR_X, FLOOR_Y, 0),
    new THREE.Vector3(AXIS_ANCHOR_X, FLOOR_Y, RISK_LAYOUT.kycZOffset),
    0x8fd6ff,
    0.9,
  );

  // ── X ticks (jurisdiction lanes) ─────────────────────────────────────
  for (let lane = 0; lane < N_JURISDICTIONS; lane += 1) {
    const x = lane * RISK_LAYOUT.laneSpacing - LANE_HALF_SPAN;
    addLine(
      group,
      new THREE.Vector3(x, FLOOR_Y - 0.16, AXIS_ANCHOR_Z),
      new THREE.Vector3(x, FLOOR_Y + 0.16, AXIS_ANCHOR_Z),
      0x79a7e8,
      0.7,
    );
  }

  // ── Y ticks (risk bands) ─────────────────────────────────────────────
  const yBands = [0, 0.5, 1];
  for (const band of yBands) {
    const y = band * RISK_LAYOUT.heightScale;
    addLine(
      group,
      new THREE.Vector3(AXIS_ANCHOR_X - 0.16, y, AXIS_ANCHOR_Z),
      new THREE.Vector3(AXIS_ANCHOR_X + 0.16, y, AXIS_ANCHOR_Z),
      0x8eb0e8,
      0.7,
    );
    const pct = makeTextSprite(`${Math.round(band * 100)}%`, "#9ebce8", "rgba(10, 14, 26, 0.5)", 0.9, 0.3);
    pct.position.set(AXIS_ANCHOR_X - 1.5, y, AXIS_ANCHOR_Z);
    group.add(pct);
  }

  // ── Axis labels ───────────────────────────────────────────────────────
  const yLabel = makeTextSprite("RISK", "#9fd0ff", "rgba(8, 14, 28, 0.62)", 1.55, 0.42);
  yLabel.position.set(AXIS_ANCHOR_X, AXIS_Y_MAX + 0.95, AXIS_ANCHOR_Z);
  group.add(yLabel);

  const xLabel = makeTextSprite("JURISDICTION", "#9fd0ff", "rgba(8, 14, 28, 0.62)", 2.3, 0.46);
  xLabel.position.set(0, FLOOR_Y - 1.22, AXIS_ANCHOR_Z);
  group.add(xLabel);

  const zLabel = makeTextSprite("KYC", "#9ce4d6", "rgba(8, 14, 28, 0.62)", 1.4, 0.42);
  zLabel.position.set(AXIS_ANCHOR_X, FLOOR_Y + 0.66, RISK_LAYOUT.kycZOffset * 0.5);
  group.add(zLabel);

  const zStd = makeTextSprite("Std", "#9eb8d8", "rgba(10, 14, 26, 0.44)", 0.9, 0.28);
  zStd.position.set(AXIS_ANCHOR_X + 1.55, FLOOR_Y + 0.03, -0.05);
  group.add(zStd);

  const zEnh = makeTextSprite("Enh", "#ffc67b", "rgba(18, 14, 10, 0.44)", 0.95, 0.28);
  zEnh.position.set(AXIS_ANCHOR_X + 1.65, FLOOR_Y + 0.03, RISK_LAYOUT.kycZOffset);
  group.add(zEnh);

  scene.add(group);
}
