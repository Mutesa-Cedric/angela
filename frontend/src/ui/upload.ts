import { uploadFile, loadSample } from "../api/client";

const modal = document.getElementById("upload-modal") as HTMLDivElement;
const dropzone = document.getElementById("upload-dropzone") as HTMLDivElement;
const fileInput = document.getElementById("upload-file") as HTMLInputElement;
const sampleBtn = document.getElementById("load-sample-btn") as HTMLButtonElement;
const errorEl = document.getElementById("upload-error") as HTMLDivElement;
const spinnerEl = document.getElementById("upload-spinner") as HTMLDivElement;

let onLoadedCallback: (() => void) | null = null;

// Drag-drop events
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
  setLoading(true);
  clearError();
  loadSample()
    .then(() => {
      hide();
      onLoadedCallback?.();
    })
    .catch((err) => showError(err.message || "Failed to load sample data"))
    .finally(() => setLoading(false));
});

async function handleFile(file: File): Promise<void> {
  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".csv") && !ext.endsWith(".json")) {
    showError("Please upload a .csv or .json file");
    return;
  }

  setLoading(true);
  clearError();

  try {
    await uploadFile(file);
    hide();
    onLoadedCallback?.();
  } catch (err) {
    showError(err instanceof Error ? err.message : "Upload failed");
  } finally {
    setLoading(false);
  }
}

function showError(msg: string): void {
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

function clearError(): void {
  errorEl.textContent = "";
  errorEl.style.display = "none";
}

function setLoading(loading: boolean): void {
  spinnerEl.style.display = loading ? "block" : "none";
  dropzone.style.pointerEvents = loading ? "none" : "auto";
  sampleBtn.disabled = loading;
}

export function show(): void {
  modal.style.display = "flex";
}

export function hide(): void {
  modal.style.display = "none";
}

export function onLoaded(cb: () => void): void {
  onLoadedCallback = cb;
}
