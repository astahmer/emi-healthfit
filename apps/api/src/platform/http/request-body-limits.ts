export const CHAT_REQUEST_BODY_MAX_CHARS = 512_000;

export const isRequestBodyTooLarge = ({
  body,
  maxChars = CHAT_REQUEST_BODY_MAX_CHARS,
}: {
  body: string;
  maxChars?: number;
}): boolean => body.length > maxChars;
