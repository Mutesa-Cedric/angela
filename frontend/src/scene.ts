import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  controls: OrbitControls;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  onFrame: (cb: () => void) => void;
}

export function initScene(canvas: HTMLCanvasElement): SceneContext {
  const container = canvas.parentElement!;
  const cw = container.clientWidth || window.innerWidth;
  const ch = container.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(cw, ch);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e13);
  // Gentle fog — at density 0.002, objects at 140 units are still 76% visible.
  scene.fog = new THREE.FogExp2(0x0a0e13, 0.002);

  const camera = new THREE.PerspectiveCamera(
    60,
    cw / ch,
    0.1,
    1000,
  );
  camera.position.set(24, 16, 24);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 2.8, 0);
  controls.minDistance = 4;
  controls.maxDistance = 140;
  controls.maxPolarAngle = Math.PI * 0.495;

  // Analytical lighting — neutral, even illumination
  const ambient = new THREE.AmbientLight(0x8899aa, 0.75);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xf0f0f0, 0.65);
  directional.position.set(10, 20, 15);
  scene.add(directional);

  const hemi = new THREE.HemisphereLight(0x8db2de, 0x0a0e13, 0.30);
  scene.add(hemi);

  const fillLight = new THREE.PointLight(0x4a7fbf, 0.45, 70);
  fillLight.position.set(0, 15, 0);
  scene.add(fillLight);

  // Ground grid — subtle spatial reference
  const grid = new THREE.GridHelper(160, 80, 0x151c26, 0x0f1620);
  grid.position.y = -0.1;
  (grid.material as THREE.Material).opacity = 0.4;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  // Post-processing: bloom
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Minimal bloom — analytical, not cinematic
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(cw, ch),
    0.12, // strength — barely perceptible
    0.4,  // radius — tight
    0.95, // threshold — only the very brightest pixels
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Raycaster for picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Resize handler — use ResizeObserver on the canvas container for grid layout
  function handleResize(): void {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }

  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);
  // Also handle window resize as fallback
  window.addEventListener("resize", handleResize);

  // Per-frame callbacks
  const frameCallbacks: (() => void)[] = [];

  // Animation loop
  function animate(): void {
    requestAnimationFrame(animate);
    controls.update();
    for (const cb of frameCallbacks) cb();
    composer.render();
  }
  animate();

  return {
    scene, camera, renderer, composer, bloomPass, controls, raycaster, pointer,
    onFrame: (cb: () => void) => frameCallbacks.push(cb),
  };
}
