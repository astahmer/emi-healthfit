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
