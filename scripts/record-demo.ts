/**
 * record-demo.ts — Automated demo clip recorder using Puppeteer screencast.
 *
 * Prerequisites:
 *   - Backend running on localhost:8000
 *   - Frontend running on localhost:5173
 *   - ffmpeg installed
 *
 * Usage:
 *   pnpm tsx scripts/record-demo.ts
 *   pnpm tsx scripts/record-demo.ts 3        # record only clip 3
 *   pnpm tsx scripts/record-demo.ts 1 4 8    # record clips 1, 4, 8
 */

import puppeteer, { type Page, type ScreenRecorder } from "puppeteer";
import { mkdirSync } from "fs";
import { resolve } from "path";

const OUT = resolve(__dirname, "../docs/demo-clips");
const URL = "http://localhost:5173";
const WIDTH = 1920;
const HEIGHT = 1080;

mkdirSync(OUT, { recursive: true });

// ─── Helpers ───

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickNode(page: Page, xPct: number, yPct: number) {
  const rect = await page.evaluate(() => {
    const c = document.getElementById("scene-canvas")!;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const x = rect.left + rect.width * xPct;
  const y = rect.top + rect.height * yPct;
  await page.evaluate(
    (cx, cy) => {
      const canvas = document.getElementById("scene-canvas")!;
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: cx, clientY: cy,
          bubbles: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent("click", { clientX: cx, clientY: cy, bubbles: true }),
      );
    },
    x, y,
  );
}

async function dragOrbit(page: Page, startX: number, startY: number, dx: number, dy: number, steps = 30) {
  const canvas = await page.$("#scene-canvas");
  if (!canvas) return;
  const box = await canvas.boundingBox();
  if (!box) return;
  const sx = box.x + box.width * startX;
  const sy = box.y + box.height * startY;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps);
    await delay(30);
  }
  await page.mouse.up();
}

async function typeSlowly(page: Page, selector: string, text: string, delayMs = 60) {
  await page.click(selector, { count: 3 }); // select all
  for (const ch of text) {
    await page.type(selector, ch, { delay: delayMs });
  }
}

async function waitForPanel(page: Page, sel: string, timeout = 5000) {
  await page.waitForFunction(
    (s: string) => document.querySelector(s)?.classList.contains("open"),
    { timeout },
    sel,
  );
}

async function startClip(page: Page, name: string): Promise<ScreenRecorder> {
  const path = `${OUT}/${name}.webm` as `${string}.webm`;
  console.log(`  ▶ Recording ${name}...`);
  return page.screencast({ path });
}

async function stopClip(recorder: ScreenRecorder, name: string) {
  await recorder.stop();
  console.log(`  ✓ ${name} saved`);
}

// ─── Clip Recorders ───

async function clip01_ingestion(page: Page) {
  // Start from the wizard
  await page.goto(URL, { waitUntil: "networkidle2" });
  await delay(1000);

  const rec = await startClip(page, "01-ingestion");
  await delay(500);
  await page.evaluate(() => (document.getElementById("load-sample-btn") as HTMLButtonElement).click());

  // Wait for boot sequence to finish — wizard hides, graph appears
  await page.waitForFunction(
    () => document.getElementById("wizard-backdrop")?.classList.contains("hidden"),
    { timeout: 30000 },
  );
  await delay(3000); // linger on the graph appearing
  await stopClip(rec, "01-ingestion");
}

async function clip02_graph(page: Page) {
  const rec = await startClip(page, "02-graph-overview");
  await delay(1000);

  // Slow orbit drag
  await dragOrbit(page, 0.5, 0.5, 200, -50, 40);
  await delay(1500);

  // Hover over node area for tooltips
  const canvas = await page.$("#scene-canvas");
  const box = await canvas!.boundingBox();
  if (box) {
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(
        box.x + box.width * (0.3 + i * 0.08),
        box.y + box.height * (0.35 + i * 0.04),
      );
      await delay(600);
    }
  }
  await delay(500);

  // TOP camera
  await page.click("#cam-top");
  await delay(2500);

  // Back to overview
  await page.click("#cam-overview");
  await delay(2000);

  await stopClip(rec, "02-graph-overview");
}

async function clip03_nlq(page: Page) {
  const rec = await startClip(page, "03-nlq-query");
  await delay(500);

  await typeSlowly(page, "#nlq-input", "show entities receiving more than 10000");
  await delay(300);
  await page.click("#nlq-submit");

  // Wait for results
  await page.waitForSelector("#nlq-result", { visible: true, timeout: 15000 }).catch(() => {});
  await delay(4000); // linger on highlighted graph

  // Clear
  const clearBtn = await page.$("#nlq-clear");
  if (clearBtn) {
    await clearBtn.click();
    await delay(1500);
  }

  await stopClip(rec, "03-nlq-query");
}

async function clip04_agent(page: Page) {
  const rec = await startClip(page, "04-agent-run");
  await delay(500);

  // Click AGENT to expand panel
  await page.click("#agent-submit");
  await delay(1000);

  // Type query and submit
  await page.evaluate(() => {
    const input = document.getElementById("nlq-input") as HTMLInputElement;
    input.value = "";
  });
  await typeSlowly(page, "#nlq-input", "investigate suspicious circular flows");
  await delay(300);
  await page.click("#agent-submit");

  // Wait for agent to complete (look for "Run completed" text)
  await page.waitForFunction(
    () => document.querySelector("#nlq-bar")?.textContent?.includes("Run completed"),
    { timeout: 60000 },
  ).catch(() => {});
  await delay(4000); // linger on results

  await stopClip(rec, "04-agent-run");
}

async function clip05_autopilot(page: Page) {
  // Clear any highlights first
  const clearBtn = await page.$("#nlq-clear");
  if (clearBtn) await clearBtn.click();
  await delay(500);

  const rec = await startClip(page, "05-autopilot");
  await delay(500);

  await page.click("#autopilot-btn");
  await delay(10000); // let camera fly through hotspots

  // Stop autopilot
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find((b) => b.textContent?.includes("STOP"));
    btn?.click();
  });
  await delay(2000);

  await stopClip(rec, "05-autopilot");
}

async function clip06_counterfactual(page: Page) {
  // Make sure we're at overview
  await page.click("#cam-overview");
  await delay(1500);

  const rec = await startClip(page, "06-counterfactual");
  await delay(500);

  // Click a node
  await clickNode(page, 0.35, 0.42);
  await delay(500);

  // Wait for entity panel
  try {
    await waitForPanel(page, "#entity-panel", 3000);
  } catch {
    // Try another spot if first click missed
    await clickNode(page, 0.42, 0.38);
    await waitForPanel(page, "#entity-panel", 3000).catch(() => {});
  }
  await delay(2000);

  // Click What If
  await page.click("#panel-cf-btn").catch(() => {});
  await delay(3000);

  // Scroll panel to show delta
  await page.evaluate(() => {
    document.getElementById("panel-content")?.scrollTo(0, 9999);
  });
  await delay(2000);

  // Click Show Suspicious Edges if available
  await page.evaluate(() => {
    const btn = document.getElementById("cf-toggle");
    btn?.click();
  });
  await delay(3000);

  await stopClip(rec, "06-counterfactual");
}

async function clip07_sar(page: Page) {
  // If entity panel isn't open, click a node
  const isOpen = await page.evaluate(() =>
    document.getElementById("entity-panel")?.classList.contains("open"),
  );
  if (!isOpen) {
    await clickNode(page, 0.55, 0.45);
    await waitForPanel(page, "#entity-panel", 3000).catch(() => {});
    await delay(1000);
  }

  // Scroll panel back to top
  await page.evaluate(() => {
    document.getElementById("panel-content")?.scrollTo(0, 0);
  });

  const rec = await startClip(page, "07-sar-report");
  await delay(500);

  await page.click("#panel-sar-btn").catch(() => {});

  // Wait for SAR panel
  await page.waitForSelector("#sar-panel.open", { timeout: 15000 }).catch(() =>
    page.waitForFunction(
      () => document.getElementById("sar-panel")?.style.display !== "none",
      { timeout: 10000 },
    ).catch(() => {}),
  );
  await delay(5000); // linger on SAR narrative

  // Close SAR panel
  await page.click("#sar-close").catch(() => {});
  await delay(1000);

  await stopClip(rec, "07-sar-report");
}

async function clip08_dashboard(page: Page) {
  // Close entity panel
  await page.click("#panel-close").catch(() => {});
  await delay(500);

  const rec = await startClip(page, "08-exec-dashboard");
  await delay(500);

  await page.click("#dashboard-btn");
  await delay(1000);

  // Wait for dashboard content
  await page.waitForSelector("#dash-content", { visible: true, timeout: 10000 }).catch(() => {});
  await delay(5000); // linger on KPIs, charts

  // Close dashboard
  await page.click("#dash-close").catch(() => {});
  await delay(1500);

  await stopClip(rec, "08-exec-dashboard");
}

// ─── Main ───

const CLIPS = [
  { id: 1, name: "01-ingestion", fn: clip01_ingestion },
  { id: 2, name: "02-graph-overview", fn: clip02_graph },
  { id: 3, name: "03-nlq-query", fn: clip03_nlq },
  { id: 4, name: "04-agent-run", fn: clip04_agent },
  { id: 5, name: "05-autopilot", fn: clip05_autopilot },
  { id: 6, name: "06-counterfactual", fn: clip06_counterfactual },
  { id: 7, name: "07-sar-report", fn: clip07_sar },
  { id: 8, name: "08-exec-dashboard", fn: clip08_dashboard },
];

async function main() {
  // Parse args — e.g. `pnpm tsx scripts/record-demo.ts 1 4 8`
  const args = process.argv.slice(2).map(Number).filter(Boolean);
  const selectedClips = args.length
    ? CLIPS.filter((c) => args.includes(c.id))
    : CLIPS;

  console.log(`\n🎬 ANGELA Demo Recorder`);
  console.log(`  Clips: ${selectedClips.map((c) => c.name).join(", ")}`);
  console.log(`  Output: ${OUT}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      "--force-device-scale-factor=1",
      "--disable-features=TranslateUI",
      "--disable-infobars",
    ],
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  // For clips 2+, we need data loaded. Clip 1 handles its own loading.
  if (!selectedClips.find((c) => c.id === 1) && selectedClips.some((c) => c.id > 1)) {
    console.log("  Loading sample data for non-ingestion clips...");
    await page.goto(URL, { waitUntil: "networkidle2" });
    await delay(1000);
    await page.evaluate(() => (document.getElementById("load-sample-btn") as HTMLButtonElement).click());
    await page.waitForFunction(
      () => document.getElementById("wizard-backdrop")?.classList.contains("hidden"),
      { timeout: 30000 },
    );
    await delay(2000);
  }

  for (const clip of selectedClips) {
    console.log(`\n── Clip ${clip.id}: ${clip.name} ──`);
    try {
      await clip.fn(page);
    } catch (err) {
      console.error(`  ✗ Error in ${clip.name}:`, err);
    }
  }

  console.log(`\n✅ Done! Clips saved to ${OUT}`);
  await browser.close();
}

main().catch(console.error);
