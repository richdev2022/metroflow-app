import { describe, it, expect } from "vitest";
import {
  applyCaptionSegment,
  latestCaptionKey,
  visibleCaptions,
  MAX_FINALS,
  type CaptionItem,
} from "./captions";

function seg(partial: Partial<CaptionItem> & { text: string }): CaptionItem {
  return {
    id: partial.id || `id-${Math.random().toString(36).slice(2, 8)}`,
    speakerId: partial.speakerId || "alice",
    speakerName: partial.speakerName || "Alice",
    ts: partial.ts || "2026-01-01T00:00:00.000Z",
    isFinal: partial.isFinal ?? true,
    text: partial.text,
  };
}

describe("applyCaptionSegment", () => {
  it("drops empty/whitespace-only segments", () => {
    const buffer = applyCaptionSegment([], seg({ text: "   " }));
    expect(buffer).toEqual([]);
  });

  it("appends finals and trims to the last 3", () => {
    let buffer: CaptionItem[] = [];
    for (let i = 1; i <= 6; i++) {
      buffer = applyCaptionSegment(buffer, seg({ text: `line ${i}`, speakerId: `spk-${i}` }));
    }
    expect(buffer.map((b) => b.text)).toEqual(["line 4", "line 5", "line 6"]);
    expect(buffer.every((b) => b.isFinal)).toBe(true);
    expect(buffer.length).toBe(MAX_FINALS);
  });

  it("replaces a trailing interim IN PLACE with a stable id (no reflow)", () => {
    const interim1 = seg({ text: "hel", isFinal: false, speakerId: "alice" });
    let buffer = applyCaptionSegment([], interim1);
    expect(buffer.length).toBe(1);

    const interim2 = seg({ text: "hello", isFinal: false, speakerId: "alice" });
    buffer = applyCaptionSegment(buffer, interim2);
    expect(buffer.length).toBe(1);
    expect(buffer[0].text).toBe("hello");
    expect(buffer[0].id).toBe(interim1.id); // same DOM node — updates in place
  });

  it("promotes the trailing interim to the final with a stable id when text descends", () => {
    let buffer = applyCaptionSegment([], seg({ text: "hello wor", isFinal: false }));
    const interimId = buffer[0].id;
    buffer = applyCaptionSegment(buffer, seg({ text: "hello world", isFinal: true }));
    expect(buffer.length).toBe(1);
    expect(buffer[0].isFinal).toBe(true);
    expect(buffer[0].id).toBe(interimId);
  });

  it("never keeps more than one trailing interim", () => {
    let buffer = applyCaptionSegment([], seg({ text: "a from bob", isFinal: false, speakerId: "bob" }));
    // Alice starts speaking — her interim replaces Bob's stale one.
    buffer = applyCaptionSegment(buffer, seg({ text: "b from alice", isFinal: false, speakerId: "alice" }));
    expect(buffer.length).toBe(1);
    expect(buffer[0].speakerId).toBe("alice");
  });

  it("keeps finals and appends the interim after them", () => {
    let buffer = applyCaptionSegment([], seg({ text: "one" }));
    buffer = applyCaptionSegment(buffer, seg({ text: "two", speakerId: "bob" }));
    buffer = applyCaptionSegment(buffer, seg({ text: "th", isFinal: false, speakerId: "carol" }));
    expect(buffer.map((b) => b.text)).toEqual(["one", "two", "th"]);
    expect(buffer[2].isFinal).toBe(false);
  });

  it("is idempotent for repeated identical finals (relay echo)", () => {
    let buffer = applyCaptionSegment([], seg({ text: "same line" }));
    const again = applyCaptionSegment(buffer, seg({ text: "same line" }));
    expect(again.map((b) => b.id + b.text)).toEqual(buffer.map((b) => b.id + b.text));
  });

  it("does not mutate the input array", () => {
    const input = [seg({ text: "keep" })];
    const frozen = [...input];
    applyCaptionSegment(input, seg({ text: "new" }));
    expect(input.map((i) => i.text)).toEqual(frozen.map((i) => i.text));
  });
});

describe("visibleCaptions / latestCaptionKey", () => {
  it("shows at most the previous line + the latest", () => {
    let buffer: CaptionItem[] = [];
    for (const t of ["a", "b", "c"]) {
      buffer = applyCaptionSegment(buffer, seg({ text: t }));
    }
    const visible = visibleCaptions(buffer);
    expect(visible.map((v) => v.text)).toEqual(["b", "c"]);
  });

  it("latestCaptionKey changes while an interim grows (auto-hide reset)", () => {
    let buffer = applyCaptionSegment([], seg({ text: "hel", isFinal: false }));
    const k1 = latestCaptionKey(buffer);
    buffer = applyCaptionSegment(buffer, seg({ text: "hello", isFinal: false }));
    const k2 = latestCaptionKey(buffer);
    expect(k1).not.toBe(k2);
  });
});
