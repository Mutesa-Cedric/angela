const slider = document.getElementById("time-slider") as HTMLInputElement;
const sliderLabel = document.getElementById("time-label") as HTMLSpanElement;

let changeCallback: ((t: number) => void) | null = null;
let debounceTimer: number | null = null;

slider.addEventListener("input", () => {
  const t = parseInt(slider.value, 10);
  sliderLabel.textContent = `Window ${t + 1}`;

  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    changeCallback?.(t);
  }, 150);
});

export function init(nBuckets: number, initial: number = 0): void {
  slider.min = "0";
  slider.max = String(nBuckets - 1);
  slider.value = String(initial);
  sliderLabel.textContent = `Window ${initial + 1}`;
}

export function onChange(cb: (t: number) => void): void {
  changeCallback = cb;
}

export function getValue(): number {
  return parseInt(slider.value, 10);
}
