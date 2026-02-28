import { uploadFile, uploadMapped, previewCSV, loadSample, getSnapshot } from "../api/client";
import type { CSVPreview } from "../api/client";
import { computePositions } from "../layout";
import { WizardParticles } from "./wizardParticles";
import type { SceneContext } from "../scene";
import type { NodeLayer } from "../graph/NodeLayer";
import type { Snapshot } from "../types";

// --- DOM elements ---
const backdrop = document.getElementById("wizard-backdrop") as HTMLDivElement;
const card = document.getElementById("wizard-card") as HTMLDivElement;
const uploadStep = document.getElementById("wizard-upload") as HTMLDivElement;
const mappingStep = document.getElementById("wizard-mapping") as HTMLDivElement;
const sequenceStep = document.getElementById("wizard-sequence") as HTMLDivElement;
const readyStep = document.getElementById("wizard-ready") as HTMLDivElement;
const dropzone = document.getElementById("upload-dropzone") as HTMLDivElement;
const fileInput = document.getElementById("upload-file") as HTMLInputElement;
const sampleBtn = document.getElementById("load-sample-btn") as HTMLButtonElement;
const errorEl = document.getElementById("upload-error") as HTMLDivElement;
const mappingError = document.getElementById("mapping-error") as HTMLDivElement;
const mappingPreview = document.getElementById("mapping-preview") as HTMLDivElement;
const mappingBack = document.getElementById("mapping-back") as HTMLButtonElement;
const mappingConfirm = document.getElementById("mapping-confirm") as HTMLButtonElement;
const seqPhase = document.getElementById("seq-phase") as HTMLDivElement;
const seqSubtitle = document.getElementById("seq-subtitle") as HTMLDivElement;
const seqProgressBar = document.getElementById("seq-progress-bar") as HTMLDivElement;
const seqCounter = document.getElementById("seq-counter") as HTMLDivElement;
const seqDots = document.querySelectorAll("#seq-steps .seq-dot");

// Mapping select elements
const MAPPING_FIELDS = ["from_id", "to_id", "amount", "timestamp", "from_bank", "to_bank", "label", "currency"] as const;
const REQUIRED_FIELDS = new Set(["from_id", "to_id", "amount", "timestamp"]);
const mapSelects: Record<string, HTMLSelectElement> = {};
for (const f of MAPPING_FIELDS) {
  mapSelects[f] = document.getElementById(`map-${f}`) as HTMLSelectElement;
}

// --- State ---
interface UploadMeta {
  n_entities: number;
  n_transactions: number;
  n_buckets: number;
}

interface WizardDeps {
  ctx: SceneContext;
  nodeLayer: NodeLayer;
}

let deps: WizardDeps | null = null;
let onLoadedCallback: ((snapshot: Snapshot) => void) | null = null;
let particles: WizardParticles | null = null;
let pendingFile: File | null = null;

// --- Public API ---

export function init(d: WizardDeps): void {
  deps = d;
}

export function show(): void {
  backdrop.classList.remove("hidden", "step-0", "step-1", "step-2", "step-3", "step-4", "reveal");
  card.classList.remove("hidden", "sequencing", "reveal");
  uploadStep.style.display = "";
  mappingStep.style.display = "none";
  sequenceStep.style.display = "none";
  readyStep.style.display = "none";
  clearError();
  sampleBtn.disabled = false;
  dropzone.style.pointerEvents = "auto";
  pendingFile = null;
}

export function hide(): void {
  backdrop.classList.add("hidden");
  card.classList.add("hidden");
  if (particles) {
    particles.dispose();
    particles = null;
  }
}

export function onLoaded(cb: (snapshot: Snapshot) => void): void {
  onLoadedCallback = cb;
}

// --- Drag-drop events ---
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
  fileInput.value = "";
});

sampleBtn.addEventListener("click", () => {
  clearError();
  setFormDisabled(true);
  startUpload(loadSample());
});

// --- Mapping step events ---

mappingBack.addEventListener("click", () => {
  mappingStep.style.display = "none";
  uploadStep.style.display = "";
  setFormDisabled(false);
  pendingFile = null;
});

mappingConfirm.addEventListener("click", () => {
  if (!pendingFile) return;

  // Validate required fields
  const mapping: Record<string, string> = {};
  for (const f of MAPPING_FIELDS) {
    const val = mapSelects[f].value;
    if (REQUIRED_FIELDS.has(f) && !val) {
      mappingError.textContent = `"${f.replace("_", " ")}" is required`;
      mappingError.style.display = "block";
      return;
    }
    if (val) mapping[f] = val;
  }

  mappingError.style.display = "none";
  mappingStep.style.display = "none";
  startUpload(uploadMapped(pendingFile, mapping));
});

// --- File handling ---

async function handleFile(file: File): Promise<void> {
  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".csv") && !ext.endsWith(".json")) {
    showError("Please upload a .csv or .json file");
    return;
  }
  clearError();
  setFormDisabled(true);

  // JSON files skip mapping, go straight to upload
  if (ext.endsWith(".json")) {
    startUpload(uploadFile(file));
    return;
  }

  // CSV files: preview + schema mapping
  try {
    const preview = await previewCSV(file);
    pendingFile = file;
    showMappingStep(preview);
  } catch (err) {
    setFormDisabled(false);
    showError(err instanceof Error ? err.message : "Preview failed");
  }
}

function showMappingStep(preview: CSVPreview): void {
  uploadStep.style.display = "none";
  mappingStep.style.display = "";
  mappingError.style.display = "none";

  // Populate selects with detected columns
  for (const f of MAPPING_FIELDS) {
    const sel = mapSelects[f];
    const isRequired = REQUIRED_FIELDS.has(f);
    sel.innerHTML = `<option value="">${isRequired ? "-- select --" : "-- skip --"}</option>`;
    for (const col of preview.columns) {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      sel.appendChild(opt);
    }

    // Apply smart defaults
    const suggested = preview.suggested_mapping[f];
    if (suggested && preview.columns.includes(suggested)) {
      sel.value = suggested;
      sel.classList.add("matched");
    } else {
      sel.classList.remove("matched");
    }
  }

  // Show sample data preview table
  if (preview.sample_rows.length > 0) {
    let html = "<table><thead><tr>";
    for (const col of preview.columns) {
      html += `<th>${esc(col)}</th>`;
    }
    html += "</tr></thead><tbody>";
    for (const row of preview.sample_rows.slice(0, 3)) {
      html += "<tr>";
      for (const cell of row) {
        html += `<td>${esc(cell)}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    mappingPreview.innerHTML = html;
    mappingPreview.style.display = "block";
  } else {
    mappingPreview.style.display = "none";
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Boot sequence orchestration ---

const STEPS = [
  { label: "TRANSMITTING", subtitle: "Uploading transaction data...", duration: 800, progress: 10 },
  { label: "PARSING", subtitle: "Decoding {n} transactions...", duration: 1000, progress: 30 },
  { label: "MAPPING", subtitle: "Resolving {n} entity identities...", duration: 1200, progress: 55 },
  { label: "ANALYZING", subtitle: "Computing risk scores...", duration: 1200, progress: 85 },
  { label: "SYSTEM READY", subtitle: "Intelligence graph online.", duration: 800, progress: 100 },
];

async function startUpload(uploadPromise: Promise<unknown>): Promise<void> {
  if (!deps) return;

  // Fire backend call — store promise for later await
  const backendCall = uploadPromise.then(
    (res) => ({ ok: true as const, data: res as UploadMeta }),
    (err) => ({ ok: false as const, message: err instanceof Error ? err.message : "Upload failed" }),
  );

  // Transition to boot sequence view
  uploadStep.style.display = "none";
  mappingStep.style.display = "none";
  sequenceStep.style.display = "";
  card.classList.add("sequencing");

  // Create particles
  particles = new WizardParticles(deps.ctx.scene);
  particles.setStream();

  // Wire particle updates into frame loop
  let particleFrameId: number | null = null;
  let lastTime = performance.now();
  function animateParticles(): void {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    particles?.update(dt);
    particleFrameId = requestAnimationFrame(animateParticles);
  }
  animateParticles();

  // --- Step 0: TRANSMITTING ---
  setStep(0);
  backdrop.classList.add("step-0");
  await delay(STEPS[0].duration);

  // Wait for backend
  const result = await backendCall;

  // Handle error
  if (!result.ok) {
    if (particleFrameId !== null) cancelAnimationFrame(particleFrameId);
    if (particles) { particles.dispose(); particles = null; }
    card.classList.remove("sequencing");
    backdrop.classList.remove("step-0");
    sequenceStep.style.display = "none";
    uploadStep.style.display = "";
    setFormDisabled(false);
    showError(result.message);
    return;
  }

  const m = result.data;

  // Preload snapshot 0 in background
  const snapshotPromise = getSnapshot(0);

  // --- Step 1: PARSING ---
  setStep(1);
  swapBackdrop("step-0", "step-1");
  seqSubtitle.textContent = `Decoding ${m.n_transactions.toLocaleString()} transactions...`;
  particles.setRing();
  animateCounter(seqCounter, m.n_transactions, STEPS[1].duration);
  await delay(STEPS[1].duration);

  // --- Step 2: MAPPING ---
  setStep(2);
  swapBackdrop("step-1", "step-2");
  seqSubtitle.textContent = `Resolving ${m.n_entities.toLocaleString()} entity identities...`;

  // Try to get snapshot data for particle positions
  let snapshot: Snapshot | null = null;
  try {
    snapshot = await snapshotPromise;
    const positions = computePositions(snapshot.nodes);
    particles.setExplode(positions);
  } catch {
    // If snapshot fails, just use random scatter
    particles.setExplode(new Float32Array(0));
  }

  animateCounter(seqCounter, m.n_entities, STEPS[2].duration);
  await delay(STEPS[2].duration);

  // --- Step 3: ANALYZING ---
  setStep(3);
  swapBackdrop("step-2", "step-3");
  seqSubtitle.textContent = "Computing risk scores...";

  // Populate real nodes now (visible through the 30% opacity backdrop)
  if (snapshot) {
    deps.nodeLayer.update(snapshot.nodes);
  }

  particles.setFade();

  // Bloom pulse
  const baseStrength = deps.ctx.bloomPass.strength;
  deps.ctx.bloomPass.strength = 1.4;
  setTimeout(() => { if (deps) deps.ctx.bloomPass.strength = baseStrength; }, 600);

  const riskSignals = Math.floor(m.n_entities * 0.3);
  animateCounter(seqCounter, riskSignals, STEPS[3].duration, "", " signals");
  await delay(STEPS[3].duration);

  // --- Step 4: SYSTEM READY ---
  setStep(4);
  swapBackdrop("step-3", "step-4");
  sequenceStep.style.display = "none";
  readyStep.style.display = "";

  // Animate ready stats
  const entitiesEl = document.getElementById("ready-entities")!;
  const txEl = document.getElementById("ready-tx")!;
  const bucketsEl = document.getElementById("ready-buckets")!;
  animateCounter(entitiesEl, m.n_entities, 600);
  animateCounter(txEl, m.n_transactions, 600);
  animateCounter(bucketsEl, m.n_buckets, 600);

  // Slow auto-orbit
  deps.ctx.controls.autoRotate = true;
  deps.ctx.controls.autoRotateSpeed = 0.5;

  await delay(STEPS[4].duration);

  // --- Reveal ---
  swapBackdrop("step-4", "reveal");
  card.classList.add("reveal");

  await delay(600);

  // Cleanup
  if (particleFrameId !== null) cancelAnimationFrame(particleFrameId);
  if (particles) { particles.dispose(); particles = null; }
  deps.ctx.controls.autoRotate = false;

  hide();

  // Fire callback with preloaded snapshot
  if (snapshot && onLoadedCallback) {
    onLoadedCallback(snapshot);
  }
}

// --- Helpers ---

function setStep(index: number): void {
  const step = STEPS[index];
  seqPhase.textContent = step.label;
  seqSubtitle.textContent = step.subtitle;
  seqProgressBar.style.width = `${step.progress}%`;
  seqCounter.innerHTML = "&nbsp;";

  // Update dots
  seqDots.forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i < index) dot.classList.add("done");
    if (i === index) dot.classList.add("active");
  });
}

function swapBackdrop(remove: string, add: string): void {
  backdrop.classList.remove(remove);
  backdrop.classList.add(add);
}

function showError(msg: string): void {
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

function clearError(): void {
  errorEl.textContent = "";
  errorEl.style.display = "none";
}

function setFormDisabled(disabled: boolean): void {
  dropzone.style.pointerEvents = disabled ? "none" : "auto";
  sampleBtn.disabled = disabled;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function animateCounter(
  el: HTMLElement,
  target: number,
  durationMs: number,
  prefix = "",
  suffix = "",
): void {
  const start = performance.now();
  function tick(): void {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / durationMs, 1);
    // Ease-out quad
    const e = 1 - (1 - t) * (1 - t);
    const current = Math.round(target * e);
    el.textContent = `${prefix}${current.toLocaleString()}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
