import { Chat } from "@emi/core/chat";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";

export const maxAttachmentBytes = Chat.attachments.limits.maxAttachmentBytes;
export const maxTotalAttachmentBytesPerMessage =
  Chat.attachments.limits.maxTotalAttachmentBytesPerMessage;

export const maxAttachmentsPerMessage = 10;

export const maxStoredMessagePartsBytes = CoreCloudflare.attachments.maxStoredMessagePartsBytes;

export const dataUrlPayloadBytes = (value: string): number => {
  const commaIndex = value.indexOf(",");
  const encoded = commaIndex === -1 ? value : value.slice(commaIndex + 1);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
};

export const messagePartsJsonBytes = CoreCloudflare.attachments.messagePartsJsonBytes;
