/**
 * Demo autoplay: scripted sequence that showcases ANGELA capabilities.
 *
 * Sequence:
 * 1. Load bucket 0 (clean state)
 * 2. Pan camera to overview
 * 3. Inject velocity anomaly
 * 4. Wait for risk update + cluster detection
 * 5. Select the injected entity
 * 6. Show AI explanation
 * 7. Inject structuring pattern
 * 8. Final overview
 */

const BASE = "/api";
const btn = document.getElementById("demo-btn") as HTMLButtonElement;

type DemoCallbacks = {
  loadBucket: (t: number) => Promise<void>;
  selectEntity: (id: string | null) => Promise<void>;
  overview: () => void;
  focusEntity: (id: string | null) => void;
};

let running = false;
let abortController: AbortController | null = null;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Demo aborted"));
    });
  });
}

async function runDemo(cbs: DemoCallbacks, signal: AbortSignal): Promise<void> {
  // Step 1: Clean state — load bucket 0
  await cbs.loadBucket(0);
  await sleep(1500, signal);

  // Step 2: Overview camera
  cbs.overview();
  await sleep(2000, signal);

  // Step 3: Inject velocity anomaly
  const injectRes = await fetch(
    `${BASE}/inject?pattern=velocity&t=0`,
    { method: "POST", signal },
  );
  const inject = await injectRes.json();
  await sleep(2000, signal);

  // Step 4: Focus on the injected entity
  const targetId = inject.target_entity as string;
  cbs.focusEntity(targetId);
  await sleep(1500, signal);

  // Step 5: Select the entity (opens panel + AI summary)
  await cbs.selectEntity(targetId);
  await sleep(4000, signal);

  // Step 6: Back to overview
  cbs.overview();
  await sleep(2000, signal);

  // Step 7: Inject structuring pattern
  await fetch(`${BASE}/inject?pattern=structuring&t=0`, { method: "POST", signal });
  await sleep(3000, signal);

  // Step 8: Final overview
  cbs.selectEntity(null);
  cbs.overview();
}

export function init(callbacks: DemoCallbacks): void {
  btn.addEventListener("click", () => {
    if (running) {
      // Stop demo
      abortController?.abort();
      stop();
      return;
    }

    running = true;
    btn.textContent = "STOP";
    btn.classList.add("running");
    abortController = new AbortController();

    runDemo(callbacks, abortController.signal)
      .catch((err) => {
        if (err.message !== "Demo aborted") {
          console.error("Demo error:", err);
        }
      })
      .finally(() => stop());
  });
}

function stop(): void {
  running = false;
  btn.textContent = "DEMO";
  btn.classList.remove("running");
  abortController = null;
}
