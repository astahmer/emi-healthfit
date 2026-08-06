// Chat requests carry attachments as base64 data URLs (up to 25 MB per client
// file, ~34M characters each) before the server externalizes them to R2. The
// cap must fit several maximum-size attachments plus history/system overhead
// while staying below the account request-body ceiling (100 MB on the paid
// plan), and the per-attachment validation still runs after decoding.
export const CHAT_REQUEST_BODY_MAX_CHARS = 90_000_000;

export const isRequestBodyTooLarge = ({
  body,
  maxChars = CHAT_REQUEST_BODY_MAX_CHARS,
}: {
  body: string;
  maxChars?: number;
}): boolean => body.length > maxChars;
