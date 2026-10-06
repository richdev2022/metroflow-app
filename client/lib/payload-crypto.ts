/**
 * Browser-side AES-256-GCM payload encryption — the exact mirror of the
 * backend's server/lib/payload-crypto.ts.
 *
 * When VITE_PAYLOAD_ENCRYPTION_KEY is set (must equal the backend's
 * PAYLOAD_ENCRYPTION_KEY), every JSON request body is sent as an envelope
 * `{ v:1, iv, tag, ct }` with header `x-mfv-enc: 1`, and every response that
 * carries `x-mfv-enc: 1` is decrypted before it reaches application code —
 * the browser network tab only ever shows ciphertext.
 *
 * Envelope details (must match the server):
 *   - AES-256-GCM, 12-byte random IV, WebCrypto appends the 16-byte tag to
 *     the ciphertext; the envelope splits them (ct = all but last 16 bytes).
 *   - Envelope is a JSON object so standard JSON body parsers on the server
 *     parse it before the decrypt middleware takes over.
 */

const KEY_B64 = (import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY || "").trim();
const enabled = KEY_B64.length > 0;

let cryptoKey: CryptoKey | null = null;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function getKey(): Promise<CryptoKey | null> {
  if (!enabled) return null;
  if (cryptoKey) return cryptoKey;
  const raw = b64ToBytes(KEY_B64);
  if (raw.length !== 32) {
    console.error("[payload-crypto] VITE_PAYLOAD_ENCRYPTION_KEY must decode to 32 bytes — encryption disabled");
    return null;
  }
  cryptoKey = await crypto.subtle.importKey("raw", raw as unknown as ArrayBuffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  return cryptoKey;
}

export interface EncryptedEnvelope {
  v: number;
  iv: string;
  tag: string;
  ct: string;
}

export function isClientEncryptionEnabled(): boolean {
  return enabled;
}

export function looksLikeEncryptedEnvelope(data: any): data is EncryptedEnvelope {
  return (
    !!data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.v === 1 &&
    typeof data.iv === "string" &&
    typeof data.tag === "string" &&
    typeof data.ct === "string"
  );
}

/** Encrypt any JSON-serialisable request body into a wire envelope. */
export async function encryptPayload(value: unknown): Promise<EncryptedEnvelope> {
  const key = await getKey();
  if (!key) throw new Error("Payload encryption key unavailable");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value ?? null));
  const combined = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as ArrayBuffer }, key, plaintext as unknown as ArrayBuffer),
  );
  // WebCrypto layout: ciphertext || tag(16)
  const ct = combined.slice(0, combined.length - 16);
  const tag = combined.slice(combined.length - 16);
  return { v: 1, iv: bytesToB64(iv), tag: bytesToB64(tag), ct: bytesToB64(ct) };
}

/** Decrypt a response envelope back into the original JSON value. */
export async function decryptPayload<T = any>(envelope: EncryptedEnvelope): Promise<T> {
  const key = await getKey();
  if (!key) throw new Error("Payload encryption key unavailable");
  const iv = b64ToBytes(envelope.iv);
  const tag = b64ToBytes(envelope.tag);
  const ct = b64ToBytes(envelope.ct);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    combined as unknown as ArrayBuffer,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
