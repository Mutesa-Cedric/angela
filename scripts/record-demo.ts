/**
 * record-demo.ts — Single continuous demo recording with visible cursor + click ripples.
 *
 * Features shown (in order):
 *   1. Data ingestion (wizard → boot sequence → graph appears)
 *   2. 3D graph exploration (orbit, top-down, overview, node hover)
 *   3. NLQ natural language query
 *   4. Agent investigation pipeline
 *   5. Autopilot guided tour
 *   6. Counterfactual what-if analysis
 *   7. SAR report generation (waits for full narrative)
 *   8. Executive dashboard
 *
 * Prerequisites:
 *   - Backend running on localhost:8000
 *   - Frontend running on localhost:5173
 *   - ffmpeg installed
 *
 * Usage:
 *   pnpm tsx scripts/record-demo.ts
 */

import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "fs";
import { resolve } from "path";

const OUT = resolve(__dirname, "../docs/demo-clips");
const URL = "http://localhost:5173";
const WIDTH = 1920;
const HEIGHT = 1080;

mkdirSync(OUT, { recursive: true });

// ─── Helpers ───

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Inject a CSS cursor and click ripple overlay into the page. */
async function injectCursorAndRipple(page: Page) {
  await page.evaluate(() => {
    // Custom cursor (white circle with blue glow)
    const style = document.createElement("style");
    style.textContent = `
      * { cursor: none !important; }
      #demo-cursor {
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 0 8px rgba(68, 136, 255, 0.6);
        pointer-events: none;
        z-index: 99999;
        transform: translate(-50%, -50%);
        transition: width 0.1s, height 0.1s, border-color 0.1s;
      }
      #demo-cursor.clicking {
        width: 14px;
        height: 14px;
        border-color: #4488ff;
        box-shadow: 0 0 16px rgba(68, 136, 255, 0.9);
      }
      .demo-ripple {
        position: fixed;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid rgba(68, 136, 255, 0.7);
        pointer-events: none;
        z-index: 99998;
        transform: translate(-50%, -50%) scale(0.3);
        opacity: 1;
        animation: demo-ripple-out 0.6s ease-out forwards;
      }
      @keyframes demo-ripple-out {
        to {
          transform: translate(-50%, -50%) scale(2);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    document.body.appendChild(cursor);

    // Track mouse moves
    document.addEventListener("mousemove", (e) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
    });

    // Click ripple
    document.addEventListener("mousedown", (e) => {
      cursor.classList.add("clicking");
      const ripple = document.createElement("div");
      ripple.className = "demo-ripple";
      ripple.style.left = e.clientX + "px";
      ripple.style.top = e.clientY + "px";
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
    document.addEventListener("mouseup", () => {
      cursor.classList.remove("clicking");
    });
  });
}

/** Click a button by ID using page.evaluate (avoids clickability issues with overlays). */
async function clickBtn(page: Page, id: string) {
  // First move cursor to the button position for visual feedback
  const pos = await page.evaluate((btnId) => {
    const el = document.getElementById(btnId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  if (pos) {
    await page.mouse.move(pos.x, pos.y, { steps: 10 });
    await delay(150);
    // Trigger visual ripple via mousedown then click
    await page.mouse.down();
    await delay(80);
    await page.mouse.up();
  }
  await page.evaluate((btnId) => {
    (document.getElementById(btnId) as HTMLElement)?.click();
  }, id);
}

/** Click on the Three.js canvas at a percentage position. */
async function clickNode(page: Page, xPct: number, yPct: number) {
  const rect = await page.evaluate(() => {
    const c = document.getElementById("scene-canvas")!;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const x = rect.left + rect.width * xPct;
  const y = rect.top + rect.height * yPct;
  // Move cursor visibly
  await page.mouse.move(x, y, { steps: 15 });
  await delay(200);
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

/** Drag orbit on the canvas with visible cursor movement. */
async function dragOrbit(page: Page, startX: number, startY: number, dx: number, dy: number, steps = 30) {
  const canvas = await page.$("#scene-canvas");
  if (!canvas) return;
  const box = await canvas.boundingBox();
  if (!box) return;
  const sx = box.x + box.width * startX;
  const sy = box.y + box.height * startY;
  await page.mouse.move(sx, sy, { steps: 8 });
  await delay(100);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps);
    await delay(30);
  }
  await page.mouse.up();
}

/** Type text character by character with visible cursor in the input. */
async function typeSlowly(page: Page, selector: string, text: string, delayMs = 55) {
  // Move cursor to input
  const pos = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (pos) {
    await page.mouse.move(pos.x, pos.y, { steps: 10 });
    await delay(200);
    await page.mouse.down();
    await delay(60);
    await page.mouse.up();
  }
  // Focus and clear
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement;
    el?.focus();
    el.value = "";
  }, selector);
  await delay(200);
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

// ─── Main Recording ───

async function main() {
  console.log(`\n🎬 ANGELA Demo — Continuous Recording`);
  console.log(`  Output: ${OUT}/angela-demo.webm\n`);

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

  // Navigate and wait for page ready
  await page.goto(URL, { waitUntil: "networkidle2" });
  await delay(2000);

  // Inject visible cursor + click ripple
  await injectCursorAndRipple(page);
  await delay(500);

  // ══════════════════════════════════════════════════════
  // START RECORDING
  // ══════════════════════════════════════════════════════
  const rec = await page.screencast({ path: `${OUT}/angela-demo.webm` as `${string}.webm` });
  console.log("  ▶ Recording started\n");

  // ── 1. DATA INGESTION ──
  console.log("  [1/8] Data ingestion");

  // Show the wizard landing page for a moment
  await delay(2000);

  // Move cursor to "Load Sample Data" and click
  await clickBtn(page, "load-sample-btn");
  await delay(500);

  // Watch the boot sequence (TRANSMITTING → PARSING → MAPPING → ANALYZING → READY)
  await page.waitForFunction(
    () => document.getElementById("wizard-backdrop")?.classList.contains("hidden"),
    { timeout: 45000 },
  );
  await delay(2000);

  // Minimize the legend so graph has full screen
  await clickBtn(page, "legend-toggle-btn");
  await delay(2000); // linger on graph appearing

  // ── 2. 3D GRAPH ──
  console.log("  [2/8] 3D graph exploration");

  // Slow cinematic orbit right
  await dragOrbit(page, 0.5, 0.5, 300, -80, 60);
  await delay(2000);

  // TOP-DOWN camera
  await clickBtn(page, "cam-top");
  await delay(3000);

  // Back to OVERVIEW
  await clickBtn(page, "cam-overview");
  await delay(2500);

  // Orbit left to show depth
  await dragOrbit(page, 0.5, 0.5, -180, 40, 40);
  await delay(2000);

  // ── 3. NLQ QUERY ──
  console.log("  [3/8] Natural language query");

  await typeSlowly(page, "#nlq-input", "show entities receiving more than 10000", 55);
  await delay(600);
  await clickBtn(page, "nlq-submit");

  // Wait for NLQ result
  await page.waitForSelector("#nlq-result", { visible: true, timeout: 20000 }).catch(() => {});
  await delay(5000); // linger on highlighted graph

  // Clear
  await clickBtn(page, "nlq-clear");
  await delay(1500);

  // ── 4. AGENT PIPELINE ──
  console.log("  [4/8] Agent investigation pipeline");

  await typeSlowly(page, "#nlq-input", "show high risk entries", 55);
  await delay(600);
  await clickBtn(page, "agent-submit");

  // Wait for agent to complete — watch the pipeline stages animate
  await page.waitForFunction(
    () => {
      const status = document.getElementById("agent-status")?.textContent || "";
      return status.includes("Completed") || status.includes("completed");
    },
    { timeout: 120000 },
  ).catch(() => {
    console.log("    (agent timed out, continuing...)");
  });
  await delay(5000); // linger on results

  // Scroll agent summary into view
  await page.evaluate(() => {
    const el = document.getElementById("agent-summary");
    el?.scrollIntoView({ behavior: "smooth" });
  });
  await delay(3000);

  // Close agent panel
  await clickBtn(page, "agent-close");
  await delay(1000);

  // ── 5. AUTOPILOT ──
  console.log("  [5/8] Autopilot guided tour");

  await clickBtn(page, "autopilot-btn");
  await delay(10000); // let camera fly through several hotspots

  // Stop autopilot
  await page.evaluate(() => {
    const btn = document.getElementById("autopilot-btn");
    if (btn?.textContent?.includes("STOP")) btn.click();
  });
  await delay(2000);

  // ── 6. COUNTERFACTUAL ──
  console.log("  [6/8] Counterfactual what-if analysis");

  await clickBtn(page, "cam-overview");
  await delay(2000);

  // Click a node to open entity panel — try multiple spots
  await clickNode(page, 0.38, 0.40);
  await delay(800);
  try {
    await waitForPanel(page, "#entity-panel", 3000);
  } catch {
    await clickNode(page, 0.45, 0.42);
    await delay(800);
    try {
      await waitForPanel(page, "#entity-panel", 3000);
    } catch {
      await clickNode(page, 0.50, 0.35);
      await waitForPanel(page, "#entity-panel", 3000).catch(() => {});
    }
  }
  await delay(2000);

  // Click "What If?"
  await clickBtn(page, "panel-cf-btn");
  await delay(4000); // wait for counterfactual computation

  // Scroll to show risk delta
  await page.evaluate(() => {
    document.getElementById("panel-content")?.scrollTo({ top: 9999, behavior: "smooth" });
  });
  await delay(2500);

  // Show suspicious edges
  await page.evaluate(() => document.getElementById("cf-toggle")?.click());
  await delay(3000);

  // ── 7. SAR REPORT ──
  console.log("  [7/8] SAR report generation");

  // Scroll panel back up to SAR button
  await page.evaluate(() => {
    document.getElementById("panel-content")?.scrollTo({ top: 0, behavior: "smooth" });
  });
  await delay(1000);

  await clickBtn(page, "panel-sar-btn");

  // Wait for SAR panel to open
  await page.waitForSelector("#sar-panel.open", { timeout: 15000 }).catch(() =>
    page.waitForFunction(
      () => document.getElementById("sar-panel")?.style.display !== "none",
      { timeout: 10000 },
    ).catch(() => {}),
  );
  await delay(2000);

  // Wait for SAR content to actually load (not just the panel opening)
  console.log("    Waiting for SAR narrative to generate...");
  await page.waitForFunction(
    () => {
      const content = document.getElementById("sar-content");
      if (!content) return false;
      const text = content.textContent || "";
      // Check that there's substantial content (not just a spinner or "Generating...")
      return text.length > 100 && !text.includes("Generating");
    },
    { timeout: 60000 },
  ).catch(() => {
    console.log("    (SAR generation timed out, continuing...)");
  });
  await delay(5000); // linger on the full SAR narrative

  // Scroll through the SAR content
  await page.evaluate(() => {
    const el = document.getElementById("sar-content");
    el?.scrollTo({ top: el.scrollHeight / 2, behavior: "smooth" });
  });
  await delay(3000);

  // Close SAR + entity panel
  await clickBtn(page, "sar-close");
  await delay(800);
  await clickBtn(page, "panel-close");
  await delay(1000);

  // ── 8. EXEC DASHBOARD ──
  console.log("  [8/8] Executive dashboard");

  await clickBtn(page, "dashboard-btn");
  await delay(1500);
  await page.waitForSelector("#dash-content", { visible: true, timeout: 10000 }).catch(() => {});
  await delay(5000); // linger on KPIs, charts, heatmap

  // Close dashboard
  await clickBtn(page, "dash-close");
  await delay(1500);

  // ── CLOSING SHOT ──
  console.log("  Closing shot");

  // Final cinematic orbit
  await dragOrbit(page, 0.5, 0.5, 200, -40, 50);
  await delay(3000);

  // ══════════════════════════════════════════════════════
  // STOP RECORDING
  // ══════════════════════════════════════════════════════
  await rec.stop();
  console.log("\n  ✓ Recording saved: angela-demo.webm");
  console.log(`\n✅ Done! File at ${OUT}/angela-demo.webm`);

  await browser.close();
}

main().catch(console.error);
