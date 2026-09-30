import { describe, it, expect } from "vitest";
import { buildAudioOutputOptions, classifyOutput } from "./audio-routing";

const raw = (deviceId: string, label: string) => ({ deviceId, label, kind: "audiooutput" });

describe("buildAudioOutputOptions", () => {
  it("always starts with System default (deviceId '')", () => {
    const options = buildAudioOutputOptions([]);
    expect(options.length).toBe(1);
    expect(options[0]).toMatchObject({ deviceId: "", label: "System default", kind: "default" });
  });

  it("folds the browser's 'default' alias entry into System default", () => {
    const options = buildAudioOutputOptions([raw("default", "Default — Speakers"), raw("abc", "Speakers")]);
    expect(options.map((o) => o.deviceId)).toEqual(["", "abc"]);
    expect(options[1].label).toBe("Speakers");
  });

  it("falls back to friendly generic labels when permission has not been granted", () => {
    const options = buildAudioOutputOptions([raw("d1", ""), raw("d2", "")]);
    expect(options.map((o) => o.label)).toEqual(["System default", "Speaker 1", "Speaker 2"]);
  });

  it("classifies bluetooth and headset entries for icons", () => {
    const options = buildAudioOutputOptions([raw("bt", "AirPods Pro"), raw("hs", "Logitech USB Headset")]);
    expect(options[1].kind).toBe("bluetooth");
    expect(options[2].kind).toBe("headset");
  });
});

describe("classifyOutput", () => {
  it("detects earpiece", () => {
    expect(classifyOutput("Phone Earpiece")).toBe("earpiece");
  });
  it("detects bluetooth by brand names", () => {
    expect(classifyOutput("Galaxy Buds2")).toBe("bluetooth");
  });
  it("defaults to speaker", () => {
    expect(classifyOutput("Realtek Audio")).toBe("speaker");
  });
});
