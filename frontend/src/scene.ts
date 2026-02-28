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
  scene.fog = new THREE.FogExp2(0x060610, 0.012);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.set(15, 12, 15);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 2, 0);

  // Cinematic lighting
  const ambient = new THREE.AmbientLight(0x8899bb, 0.4);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffeedd, 0.6);
  directional.position.set(10, 20, 15);
  scene.add(directional);

  const fillLight = new THREE.PointLight(0x4488ff, 0.4, 60);
  fillLight.position.set(0, 15, 0);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff6633, 0.2, 40);
  rimLight.position.set(-10, 5, -10);
  scene.add(rimLight);

  // Ground grid for spatial reference
  const grid = new THREE.GridHelper(40, 40, 0x222233, 0x111122);
  grid.position.y = -0.1;
  scene.add(grid);

  // Post-processing: bloom
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8, 0.4, 0.6,
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
