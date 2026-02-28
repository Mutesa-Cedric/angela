import "./style.css";
import { initScene } from "./scene";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Canvas element #scene-canvas not found");
}

const { scene, camera, renderer, controls } = initScene(canvas);

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__angela = { scene, camera, renderer, controls };
}
