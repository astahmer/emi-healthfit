const blockedDataMediaTypes = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/html",
  "text/javascript",
]);

const getDataMediaType = ({ href }: { href: string }): string => {
  const metadata = href.slice("data:".length).split(",", 1)[0] ?? "";
  const mediaType = metadata.split(";", 1)[0] ?? "";
  return mediaType === "" ? "text/plain" : mediaType.toLowerCase();
};

export const isSafeMarkdownHref = (href: string | undefined): boolean => {
  if (href === undefined) return false;
  const trimmed = href.trim();
  if (trimmed === "") return false;
  if (trimmed.startsWith("message:")) return true;
  if (trimmed.startsWith("#")) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
};

export const isSafeAttachmentUrl = ({
  href,
  mediaType,
}: {
  href: string | undefined;
  mediaType: string | undefined;
}): boolean => {
  if (href === undefined) return false;
  const trimmed = href.trim();
  if (trimmed === "") return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:")
      return true;
    if (url.protocol !== "data:") return false;
    const dataMediaType = getDataMediaType({ href: trimmed });
    return (
      mediaType !== undefined &&
      mediaType.toLowerCase() === dataMediaType &&
      !blockedDataMediaTypes.has(dataMediaType)
    );
  } catch {
    return false;
  }
};

export const shouldRenderMarkdownImage = (src: string | undefined): boolean => {
  if (src === undefined) return false;
  const trimmed = src.trim();
  if (trimmed === "") return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("data:image/")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:";
  } catch {
    return false;
  }
};
