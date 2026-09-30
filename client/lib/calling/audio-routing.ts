/**
 * Audio output routing (Google-Dialer-style speaker selection) — web only.
 *
 * The calling clients (LiveKit + MediaSoup) play remote participants through
 * central hidden <audio> elements. This module keeps:
 *   - the user's selected sink id (module-level, so EVERY new audio element
 *     picks it up at creation time),
 *   - a registry of the live playback elements so a route change applies to
 *     all of them instantly,
 *   - a localStorage-persisted selection so the choice survives reloads.
 *
 * Browser support: `setSinkId` is available on Chromium (desktop + Android).
 * iOS Safari does not expose it — there we degrade gracefully: the UI shows a
 * friendly "routing follows the system" notice instead of a device list.
 */

export interface AudioOutputDevice {
  /** deviceId to pass to setSinkId — "" means "system default". */
  deviceId: string;
  label: string;
  /** Heuristic classification for icons/grouping (best effort). */
  kind: "default" | "speaker" | "earpiece" | "bluetooth" | "headset" | "other";
}

const SINK_STORAGE_KEY = "metricorex:audio-sink-id";
const SYSTEM_DEFAULT_DEVICE_ID = "";

/** Module-level current sink — "" = system default. Exported getter/setter. */
let currentSinkId: string = SYSTEM_DEFAULT_DEVICE_ID;

/** Live playback elements (hidden <audio> pool owned by the calling clients). */
const registeredElements = new Set<HTMLMediaElement>();

export function getCurrentSinkId(): string {
  return currentSinkId;
}

/** True when the browser can actually switch the audio output device. */
export function supportsSinkId(): boolean {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    typeof (HTMLMediaElement.prototype as any).setSinkId === "function"
  );
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Restore the persisted sink selection (called lazily, never throws). */
export function loadPersistedSinkId(): string {
  const store = safeStorage();
  if (!store) return SYSTEM_DEFAULT_DEVICE_ID;
  try {
    const saved = store.getItem(SINK_STORAGE_KEY);
    if (typeof saved === "string") {
      currentSinkId = saved;
    }
  } catch {
    // corrupted storage — keep default
  }
  return currentSinkId;
}

function persistSinkId(sinkId: string) {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(SINK_STORAGE_KEY, sinkId);
  } catch {
    // storage full/blocked — selection still applies for this session
  }
}

/** Register a playback element; applies the current route immediately. */
export function registerAudioElement(el: HTMLMediaElement): void {
  registeredElements.add(el);
  void applySinkToElement(el, currentSinkId);
}

export function unregisterAudioElement(el: HTMLMediaElement): void {
  registeredElements.delete(el);
}

/** Apply a sink id to one media element (no-op where setSinkId is missing). */
export function applySinkToElement(el: HTMLMediaElement, sinkId: string): Promise<void> {
  const anyEl = el as any;
  if (!el || typeof anyEl.setSinkId !== "function") return Promise.resolve();
  try {
    // "" and "default" both mean the OS default — normalize to "".
    return Promise.resolve(anyEl.setSinkId(sinkId || "default")).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

/**
 * Apply the given sink to every registered (and still connected) element.
 * Elements that left the DOM are pruned from the registry.
 */
export function applySinkToAll(sinkId: string): void {
  for (const el of Array.from(registeredElements)) {
    if (!el.isConnected) {
      registeredElements.delete(el);
      continue;
    }
    void applySinkToElement(el, sinkId);
  }
}

/**
 * Select a new audio output: persists the choice and applies it to the whole
 * element pool. Returns true when the route was applied to at least one live
 * element (or the browser simply has no per-element routing — considered a
 * successful selection so the UI can remember the preference).
 */
export async function selectAudioOutput(sinkId: string): Promise<boolean> {
  currentSinkId = sinkId || SYSTEM_DEFAULT_DEVICE_ID;
  persistSinkId(currentSinkId);
  applySinkToAll(currentSinkId);
  return true;
}

/** Enumerate audio output devices (labels are empty before permission). */
export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return buildAudioOutputOptions(
      devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind })),
    );
  } catch {
    return [];
  }
}

export interface AudioOutputDeviceInput {
  deviceId: string;
  label: string;
  kind: string;
}

/**
 * Pure helper that turns a raw enumerateDevices() result into the user-facing
 * route list:
 *   - "System default" first (deviceId ""),
 *   - the browser's "Default — ..." alias entry is folded into it,
 *   - empty labels (pre-permission) get friendly generic names,
 *   - device kind is classified for icons (bluetooth / headset / earpiece…).
 */
export function buildAudioOutputOptions(devices: AudioOutputDeviceInput[]): AudioOutputDevice[] {
  const options: AudioOutputDevice[] = [
    { deviceId: SYSTEM_DEFAULT_DEVICE_ID, label: "System default", kind: "default" },
  ];
  let genericIndex = 0;
  for (const d of devices) {
    if (!d.deviceId || d.deviceId === "default") continue; // alias of System default
    const label = (d.label || "").trim();
    genericIndex += 1;
    options.push({
      deviceId: d.deviceId,
      label: label || `Speaker ${genericIndex}`,
      kind: classifyOutput(label),
    });
  }
  return options;
}

/** Best-effort classification from the device label. */
export function classifyOutput(label: string): AudioOutputDevice["kind"] {
  const l = (label || "").toLowerCase();
  if (/earpiece|ear-piece|receiver/.test(l)) return "earpiece";
  if (/bluetooth|airpods|galaxy buds|buds|headphones.*bt|wh-|wf-/.test(l)) return "bluetooth";
  if (/headset|headphone|airpod/.test(l)) return "headset";
  if (/hdmi|external|monitor|display/.test(l)) return "other";
  return "speaker";
}
