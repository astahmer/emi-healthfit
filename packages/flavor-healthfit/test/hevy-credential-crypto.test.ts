import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import {
  decryptHevyApiKey,
  encryptHevyApiKey,
  resolveHevyEncryptionKey,
} from "../src/integrations/hevy/credential-crypto.ts";

const hexKey = "a".repeat(64);

describe("Hevy credential crypto", () => {
  it("round-trips an API key bound to a user id", async () => {
    const keyBytes = await Effect.runPromise(
      resolveHevyEncryptionKey({
        environment: { HEVY_CREDENTIAL_ENCRYPTION_KEY: hexKey },
      }),
    );
    const envelope = await Effect.runPromise(
      encryptHevyApiKey({ apiKey: "hevy-secret", userId: "user-a", keyBytes }),
    );
    const plain = await Effect.runPromise(
      decryptHevyApiKey({ envelope, userId: "user-a", keyBytes }),
    );
    expect(plain).toBe("hevy-secret");
  });

  it("rejects ciphertext transplanted to another user id", async () => {
    const keyBytes = await Effect.runPromise(
      resolveHevyEncryptionKey({
        environment: { HEVY_CREDENTIAL_ENCRYPTION_KEY: hexKey },
      }),
    );
    const envelope = await Effect.runPromise(
      encryptHevyApiKey({ apiKey: "hevy-secret", userId: "user-a", keyBytes }),
    );
    const exit = await Effect.runPromiseExit(
      decryptHevyApiKey({ envelope, userId: "user-b", keyBytes }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause;
      expect(String(error)).toContain("HevyCredentialCryptoError");
    }
  });

  it("rejects invalid encryption key material", async () => {
    const exit = await Effect.runPromiseExit(
      resolveHevyEncryptionKey({
        environment: { HEVY_CREDENTIAL_ENCRYPTION_KEY: "too-short" },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("HevyCredentialConfigError");
    }
  });
});
