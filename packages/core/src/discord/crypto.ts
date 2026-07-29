import * as Effect from "effect/Effect";

export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;
export const DEFAULT_MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> | null => {
  if (hex.length === 0 || hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) return null;
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

export interface VerifyEd25519SignatureInput {
  readonly publicKeyHex: string;
  readonly signatureHex: string;
  readonly timestamp: string;
  readonly rawBody: string;
}

/**
 * Verifies a Discord interaction signature per
 * https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization.
 * The signed message is the exact concatenation of the raw timestamp header and the raw request
 * body, so callers must pass the untouched body string rather than a re-serialized JSON value.
 */
export const verifyEd25519Signature = (
  input: VerifyEd25519SignatureInput,
): Effect.Effect<boolean> =>
  Effect.promise(async () => {
    const publicKeyBytes = hexToBytes(input.publicKeyHex);
    const signatureBytes = hexToBytes(input.signatureHex);
    if (
      publicKeyBytes === null ||
      signatureBytes === null ||
      publicKeyBytes.length !== ED25519_PUBLIC_KEY_BYTES ||
      signatureBytes.length !== ED25519_SIGNATURE_BYTES
    ) {
      return false;
    }
    try {
      const key = await crypto.subtle.importKey("raw", publicKeyBytes, { name: "Ed25519" }, false, [
        "verify",
      ]);
      const message = new TextEncoder().encode(`${input.timestamp}${input.rawBody}`);
      return await crypto.subtle.verify("Ed25519", key, signatureBytes, message);
    } catch {
      return false;
    }
  });

export interface TimestampFreshnessOptions {
  readonly nowMs?: number;
  readonly maxSkewMs?: number;
}

export const isTimestampStale = (
  timestampSeconds: string,
  options: TimestampFreshnessOptions = {},
): boolean => {
  const timestampMs = Number(timestampSeconds) * 1000;
  if (!Number.isFinite(timestampMs)) return true;
  const now = options.nowMs ?? Date.now();
  const maxSkewMs = options.maxSkewMs ?? DEFAULT_MAX_TIMESTAMP_SKEW_MS;
  return Math.abs(now - timestampMs) > maxSkewMs;
};
