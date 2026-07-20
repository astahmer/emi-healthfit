import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const ENCRYPTION_VERSION = "1";
const IV_BYTES = 12;

export class HevyCredentialConfigError extends Schema.TaggedErrorClass<HevyCredentialConfigError>()(
  "HevyCredentialConfigError",
  { message: Schema.String },
) {}

export class HevyCredentialCryptoError extends Schema.TaggedErrorClass<HevyCredentialCryptoError>()(
  "HevyCredentialCryptoError",
  { message: Schema.String },
) {}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const parseEncryptionKey = (raw: string) => {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  try {
    const bytes = base64ToBytes(trimmed);
    if (bytes.byteLength === 32) return bytes;
  } catch {
    // fall through
  }

  return null;
};

export const resolveHevyEncryptionKey = Effect.fn("hevy.credential.resolveKey")(function* ({
  environment,
}: {
  environment: Record<string, unknown>;
}) {
  const raw = environment.HEVY_CREDENTIAL_ENCRYPTION_KEY;
  if (typeof raw !== "string" || raw.trim() === "") {
    return yield* new HevyCredentialConfigError({
      message: "HEVY_CREDENTIAL_ENCRYPTION_KEY is not configured",
    });
  }
  const keyBytes = parseEncryptionKey(raw);
  if (keyBytes === null) {
    return yield* new HevyCredentialConfigError({
      message: "HEVY_CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (hex or base64)",
    });
  }
  return keyBytes;
});

const toBufferSource = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const importAesKey = (keyBytes: Uint8Array) =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle.importKey("raw", toBufferSource(keyBytes), { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
      ]),
    catch: () => new HevyCredentialCryptoError({ message: "Failed to import Hevy encryption key" }),
  });

export type HevyCredentialEnvelope = {
  ciphertext: string;
  iv: string;
  version: string;
};

export const encryptHevyApiKey = Effect.fn("hevy.credential.encrypt")(function* ({
  apiKey,
  userId,
  keyBytes,
}: {
  apiKey: string;
  userId: string;
  keyBytes: Uint8Array;
}) {
  const key = yield* importAesKey(keyBytes);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: new TextEncoder().encode(userId),
        },
        key,
        new TextEncoder().encode(apiKey),
      ),
    catch: () => new HevyCredentialCryptoError({ message: "Failed to encrypt Hevy API key" }),
  });

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    version: ENCRYPTION_VERSION,
  } satisfies HevyCredentialEnvelope;
});

export const decryptHevyApiKey = Effect.fn("hevy.credential.decrypt")(function* ({
  envelope,
  userId,
  keyBytes,
}: {
  envelope: HevyCredentialEnvelope;
  userId: string;
  keyBytes: Uint8Array;
}) {
  if (envelope.version !== ENCRYPTION_VERSION) {
    return yield* new HevyCredentialCryptoError({
      message: "Unsupported Hevy credential encryption version",
    });
  }

  const key = yield* importAesKey(keyBytes);
  const plaintext = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(envelope.iv),
          additionalData: new TextEncoder().encode(userId),
        },
        key,
        base64ToBytes(envelope.ciphertext),
      ),
    catch: () => new HevyCredentialCryptoError({ message: "Failed to decrypt Hevy API key" }),
  });

  return new TextDecoder().decode(plaintext);
});
