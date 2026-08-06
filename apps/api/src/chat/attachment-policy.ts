import { Chat } from "@emi/core/chat";

export const maxAttachmentBytes = Chat.attachments.limits.maxAttachmentBytes;
export const maxTotalAttachmentBytesPerMessage =
  Chat.attachments.limits.maxTotalAttachmentBytesPerMessage;

export const maxAttachmentsPerMessage = 10;

// Cloudflare D1 caps a single stored string/blob at 2 MB; keep a safety margin
// so persisted message JSON never trips SQLITE_TOOBIG.
export const maxStoredMessagePartsBytes = 1_800_000;

export const dataUrlPayloadBytes = (value: string): number => {
  const commaIndex = value.indexOf(",");
  const encoded = commaIndex === -1 ? value : value.slice(commaIndex + 1);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
};

export const messagePartsJsonBytes = (parts: readonly unknown[]): number =>
  new TextEncoder().encode(JSON.stringify(parts)).byteLength;
