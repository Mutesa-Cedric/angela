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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060610);
  // Lighter fog improves depth without obscuring node/edge readability.
  scene.fog = new THREE.FogExp2(0x0b1020, 0.015);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
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

  // Cinematic lighting
  const ambient = new THREE.AmbientLight(0x95aacd, 0.62);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xfff1dc, 0.82);
  directional.position.set(10, 20, 15);
  scene.add(directional);

  const hemi = new THREE.HemisphereLight(0x8db2de, 0x101828, 0.28);
  scene.add(hemi);

  const fillLight = new THREE.PointLight(0x5fa0ff, 0.62, 70);
  fillLight.position.set(0, 15, 0);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff8a55, 0.36, 65);
  rimLight.position.set(-10, 5, -10);
  scene.add(rimLight);

  // Subtle warm uplight — lifts shadows under the graph
  const upLight = new THREE.PointLight(0x3f5e88, 0.42, 56);
  upLight.position.set(0, -5, 0);
  scene.add(upLight);

  // Ground grid for spatial reference
  const grid = new THREE.GridHelper(76, 76, 0x314f78, 0x182437);
  grid.position.y = -0.1;
  scene.add(grid);

  // Post-processing: bloom
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Selective bloom: high threshold ensures only glow sprites and emissive surfaces bloom
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.58, // strength — subtle, cinematic
    0.65, // radius — wide soft falloff
    0.82, // threshold — only the brightest surfaces bloom
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Raycaster for picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Resize handler
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

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
