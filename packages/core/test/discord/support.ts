export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const generateDiscordKeyPair = () =>
  crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);

export const exportPublicKeyHex = async (key: CryptoKey): Promise<string> => {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToHex(new Uint8Array(raw));
};

export const signInteractionBody = async (
  privateKey: CryptoKey,
  timestamp: string,
  rawBody: string,
): Promise<string> => {
  const message = new TextEncoder().encode(`${timestamp}${rawBody}`);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, message);
  return bytesToHex(new Uint8Array(signature));
};
