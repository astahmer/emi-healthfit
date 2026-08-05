// Chat requests embed attachments as base64 data URLs (up to 5 MB per client
// file, ~6.7M characters each). The cap must fit at least one maximum-size
// attachment plus history/system overhead while staying below the Workers
// request-body ceiling, and the per-attachment validation still runs after
// decoding.
export const CHAT_REQUEST_BODY_MAX_CHARS = 20_000_000;

export const isRequestBodyTooLarge = ({
  body,
  maxChars = CHAT_REQUEST_BODY_MAX_CHARS,
}: {
  body: string;
  maxChars?: number;
}): boolean => body.length > maxChars;
