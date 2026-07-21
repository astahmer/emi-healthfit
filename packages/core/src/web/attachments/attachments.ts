const maximumAttachments = 10;
const maximumFileBytes = 12 * 1024 * 1024;
const compressionThresholdBytes = 1_500_000;
const maximumImageDimension = 2048;
const compressibleImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const supportedImageTypes = new Set([...compressibleImageTypes, "image/gif"]);

export class AttachmentValidationError extends Error {}

export const validateAttachments = ({
  files,
  existingCount,
}: {
  files: File[];
  existingCount: number;
}) => {
  if (existingCount + files.length > maximumAttachments) {
    throw new AttachmentValidationError(`You can attach up to ${maximumAttachments} files.`);
  }
  const oversized = files.find((file) => file.size > maximumFileBytes);
  if (oversized !== undefined) {
    throw new AttachmentValidationError(`${oversized.name} is larger than 12 MB.`);
  }
  const unsupportedImage = files.find(
    (file) => file.type.startsWith("image/") && !supportedImageTypes.has(file.type),
  );
  if (unsupportedImage !== undefined) {
    throw new AttachmentValidationError(
      `${unsupportedImage.name || "Clipboard image"} uses an unsupported image format. Use PNG, JPEG, WebP, or GIF.`,
    );
  }
};

const canvasBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));

const compressImage = async (file: File): Promise<File> => {
  if (!compressibleImageTypes.has(file.type) || file.size < compressionThresholdBytes) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maximumImageDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context === null) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const outputType = file.type === "image/png" ? "image/webp" : file.type;
  const blob = await canvasBlob(canvas, outputType);
  if (blob === null || blob.size >= file.size) return file;
  const extension = outputType === "image/webp" ? "webp" : "jpg";
  const basename = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${basename}.${extension}`, {
    type: outputType,
    lastModified: file.lastModified,
  });
};

export const prepareAttachments = async ({
  files,
  existingCount,
}: {
  files: FileList;
  existingCount: number;
}) => {
  const selected = Array.from(files);
  validateAttachments({ files: selected, existingCount });
  const prepared = await Promise.all(selected.map((file) => compressImage(file).catch(() => file)));
  const transfer = new DataTransfer();
  for (const file of prepared) transfer.items.add(file);
  return transfer.files;
};
