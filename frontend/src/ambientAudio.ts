// Future voice-over engines (e.g., Minimax TTS) can dispatch this event:
// window.dispatchEvent(new CustomEvent(VOICEOVER_STATE_EVENT, { detail: { active: true } }));
export const VOICEOVER_STATE_EVENT = "angela:voiceover-state";

export interface AmbientAudioState {
  enabled: boolean;
  ready: boolean;
  voiceoverActive: boolean;
}

export interface AmbientAudioOptions {
  introUrl: string;
  loopUrl: string;
}

type AmbientAudioListener = (state: AmbientAudioState) => void;

const AMBIENCE_STORAGE_KEY = "angela.ambience.enabled";

function getAudioContextCtor(): typeof AudioContext | null {
  const maybeWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? maybeWindow.webkitAudioContext ?? null;
}

export class AmbientAudioController {
  private readonly introUrl: string;
  private readonly loopUrl: string;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private introEl: HTMLAudioElement | null = null;
  private loopEl: HTMLAudioElement | null = null;
  private introDone = false;
  private activeTrack: "none" | "intro" | "loop" = "none";
  private pitchMode = false;
  private autopilotActive = false;
  private voiceoverActive = false;
  private started = false;
  private enabled = true;
  private listeners: AmbientAudioListener[] = [];
  private gestureArmed = false;
  private graphReady = false;

  constructor(options: AmbientAudioOptions) {
    this.introUrl = options.introUrl;
    this.loopUrl = options.loopUrl;
    this.enabled = this.loadEnabledSetting();
    this.bindVoiceoverDucking();
  }

  onStateChange(listener: AmbientAudioListener): void {
    this.listeners.push(listener);
    listener(this.snapshot());
  }

  armUserGestureUnlock(): void {
    if (this.gestureArmed) return;
    this.gestureArmed = true;

    const unlock = () => {
      void this.start();
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
  }

  toggleEnabled(): void {
    this.setEnabled(!this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.persistEnabledSetting(enabled);
    if (enabled) {
      void this.start();
    } else {
      this.pausePlayback();
      this.applyTargetGain(0.22);
    }
    this.emit();
  }

  setPitchMode(enabled: boolean): void {
    this.pitchMode = enabled;
    this.applyTargetGain();
  }

  setAutopilotActive(active: boolean): void {
    this.autopilotActive = active;
    this.applyTargetGain();
  }

  setVoiceoverActive(active: boolean): void {
    this.voiceoverActive = active;
    this.applyTargetGain(0.2);
    this.emit();
  }

  private async start(): Promise<void> {
    if (!this.enabled) return;
    if (!this.ensureMediaGraph()) return;
    if (!this.audioContext) return;

    try {
      await this.audioContext.resume();
      await this.playPreferredTrack();
      this.started = this.audioContext.state === "running" && this.activeTrack !== "none";
      this.applyTargetGain();
    } catch {
      // Browser autoplay policy may still block playback before user gesture.
    }
    this.emit();
  }

  private ensureMediaGraph(): boolean {
    if (this.graphReady) return true;

    const Ctor = getAudioContextCtor();
    if (!Ctor) return false;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const intro = new Audio(this.introUrl);
    intro.preload = "auto";

    const loop = new Audio(this.loopUrl);
    loop.preload = "auto";
    loop.loop = true;

    const introSource = ctx.createMediaElementSource(intro);
    const loopSource = ctx.createMediaElementSource(loop);
    introSource.connect(master);
    loopSource.connect(master);

    intro.addEventListener("ended", () => {
      this.introDone = true;
      this.activeTrack = "none";
      if (this.enabled) {
        void this.playLoop(true);
      }
    });

    intro.addEventListener("error", () => {
      this.introDone = true;
      this.activeTrack = "none";
      if (this.enabled) {
        void this.playLoop(true);
      }
    });

    loop.addEventListener("play", () => {
      this.activeTrack = "loop";
      this.started = true;
      this.emit();
    });

    intro.addEventListener("play", () => {
      this.activeTrack = "intro";
      this.started = true;
      this.emit();
    });

    this.audioContext = ctx;
    this.masterGain = master;
    this.introEl = intro;
    this.loopEl = loop;
    this.graphReady = true;
    return true;
  }

  private async playPreferredTrack(): Promise<void> {
    if (!this.introEl || !this.loopEl) return;

    if (this.activeTrack === "intro") {
      await this.playElement(this.introEl, "intro");
      return;
    }
    if (this.activeTrack === "loop") {
      await this.playElement(this.loopEl, "loop");
      return;
    }
    if (!this.introDone) {
      await this.playElement(this.introEl, "intro");
      return;
    }
    await this.playLoop(false);
  }

  private async playLoop(fromStart: boolean): Promise<void> {
    if (!this.loopEl) return;
    if (fromStart) this.loopEl.currentTime = 0;
    await this.playElement(this.loopEl, "loop");
  }

  private async playElement(el: HTMLAudioElement, track: "intro" | "loop"): Promise<void> {
    if (!this.enabled) return;

    if (track === "intro") {
      this.loopEl?.pause();
    } else {
      this.introEl?.pause();
    }

    try {
      await el.play();
      this.activeTrack = track;
      this.started = true;
    } catch {
      // Playback can fail if browser blocks autoplay until a trusted gesture.
    }
  }

  private pausePlayback(): void {
    this.introEl?.pause();
    this.loopEl?.pause();
  }

  private applyTargetGain(timeConstant: number = 0.6): void {
    if (!this.audioContext || !this.masterGain) return;
    const target = this.computeTargetGain();
    this.masterGain.gain.setTargetAtTime(target, this.audioContext.currentTime, timeConstant);
  }

  private computeTargetGain(): number {
    if (!this.enabled) return 0;
    let gain = this.pitchMode ? 0.13 : 0.105;
    if (this.autopilotActive) {
      gain += 0.02;
    }
    if (this.voiceoverActive) {
      gain *= 0.24;
    }
    return gain;
  }

  private bindVoiceoverDucking(): void {
    window.addEventListener(VOICEOVER_STATE_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      this.setVoiceoverActive(Boolean(detail?.active));
    });
  }

  private snapshot(): AmbientAudioState {
    return {
      enabled: this.enabled,
      ready: this.started,
      voiceoverActive: this.voiceoverActive,
    };
  }

  private emit(): void {
    const state = this.snapshot();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private loadEnabledSetting(): boolean {
    try {
      const stored = localStorage.getItem(AMBIENCE_STORAGE_KEY);
      return stored !== "0";
    } catch {
      return true;
    }
  }

  private persistEnabledSetting(enabled: boolean): void {
    try {
      localStorage.setItem(AMBIENCE_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // ignore restricted localStorage environments
    }
  }
}
