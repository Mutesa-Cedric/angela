import * as THREE from "three";

/**
 * Add axis labels to the 3D scene as sprite text.
 */

function makeTextSprite(text: string, color: string = "#4488ff"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = 64;

  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size / 2, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 1, 1);
  return sprite;
}

export function addAxisLabels(scene: THREE.Scene): void {
  // Y axis — Risk Score
  const yLabel = makeTextSprite("RISK SCORE");
  yLabel.position.set(-16, 5, 0);
  scene.add(yLabel);

  const yLow = makeTextSprite("Low", "#446688");
  yLow.position.set(-16, 0.5, 0);
  scene.add(yLow);

  const yHigh = makeTextSprite("High", "#ff6644");
  yHigh.position.set(-16, 8.5, 0);
  scene.add(yHigh);

  // X axis — Jurisdiction
  const xLabel = makeTextSprite("JURISDICTION");
  xLabel.position.set(0, -0.8, -5);
  scene.add(xLabel);

  // Z axis — KYC Level
  const zStd = makeTextSprite("Standard KYC", "#446688");
  zStd.position.set(-16, -0.8, -1);
  scene.add(zStd);

  const zEnh = makeTextSprite("Enhanced KYC", "#ff8844");
  zEnh.position.set(-16, -0.8, 3.5);
  scene.add(zEnh);
}
