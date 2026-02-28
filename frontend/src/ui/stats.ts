const fpsEl = document.getElementById("stats-fps") as HTMLSpanElement;
const nodesEl = document.getElementById("stats-nodes") as HTMLSpanElement;
const edgesEl = document.getElementById("stats-edges") as HTMLSpanElement;

let frames = 0;
let lastTime = performance.now();

export function tick(): void {
  frames++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fpsEl.textContent = `${frames} FPS`;
    frames = 0;
    lastTime = now;
  }
}

export function updateCounts(nodes: number, edges: number): void {
  nodesEl.textContent = `${nodes.toLocaleString()} ENTITIES`;
  edgesEl.textContent = `${edges.toLocaleString()} CONNECTIONS`;
}
