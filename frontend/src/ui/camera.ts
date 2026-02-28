import type { SceneContext } from "../scene";
import type { NodeLayer } from "../graph/NodeLayer";

const TRANSITION_MS = 600;

function smoothMove(
  ctx: SceneContext,
  targetPos: { x: number; y: number; z: number },
  targetLookAt: { x: number; y: number; z: number },
): void {
  const startPos = ctx.camera.position.clone();
  const startTarget = ctx.controls.target.clone();
  const start = performance.now();

  function step(): void {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / TRANSITION_MS, 1);
    // Ease-out cubic
    const e = 1 - Math.pow(1 - t, 3);

    ctx.camera.position.set(
      startPos.x + (targetPos.x - startPos.x) * e,
      startPos.y + (targetPos.y - startPos.y) * e,
      startPos.z + (targetPos.z - startPos.z) * e,
    );

    ctx.controls.target.set(
      startTarget.x + (targetLookAt.x - startTarget.x) * e,
      startTarget.y + (targetLookAt.y - startTarget.y) * e,
      startTarget.z + (targetLookAt.z - startTarget.z) * e,
    );

    ctx.controls.update();

    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

export function overview(ctx: SceneContext): void {
  smoothMove(
    ctx,
    { x: 24, y: 16, z: 24 },
    { x: 0, y: 2.8, z: 0 },
  );
}

export function topDown(ctx: SceneContext): void {
  smoothMove(
    ctx,
    { x: 0, y: 36, z: 0.1 },
    { x: 0, y: 0, z: 0 },
  );
}

export function focusEntity(
  ctx: SceneContext,
  nodeLayer: NodeLayer,
  entityId: string | null,
): void {
  if (!entityId) {
    overview(ctx);
    return;
  }

  const pos = nodeLayer.getPosition(entityId);
  if (!pos) {
    overview(ctx);
    return;
  }

  smoothMove(
    ctx,
    { x: pos.x + 5.2, y: pos.y + 3.8, z: pos.z + 5.2 },
    { x: pos.x, y: pos.y, z: pos.z },
  );
}
