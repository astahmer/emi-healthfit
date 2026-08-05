import { convertFileListToFileUIParts, type FileUIPart } from "ai";

const maximumAttachments = 10;
const maximumFileBytes = 25 * 1024 * 1024;
const compressionThresholdBytes = 1_500_000;
const maximumImageDimension = 2048;
const compressibleImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const heicImageTypes = new Set(["image/heic", "image/heif"]);
const supportedImageTypes = new Set([...compressibleImageTypes, ...heicImageTypes, "image/gif"]);

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
    throw new AttachmentValidationError(`${oversized.name} is larger than 25 MB.`);
  }
  const unsupportedImage = files.find(
    (file) => file.type.startsWith("image/") && !supportedImageTypes.has(file.type),
  );
  if (unsupportedImage !== undefined) {
    throw new AttachmentValidationError(
      `${unsupportedImage.name || "Clipboard image"} uses an unsupported image format. Use PNG, JPEG, WebP, GIF, or HEIC.`,
    );
  }
};

export const isAnimatedWebp = async (file: File): Promise<boolean> => {
  const header = new TextDecoder().decode(await file.slice(0, 16).arrayBuffer());
  return (
    header.startsWith("RIFF") &&
    header.slice(8, 12) === "WEBP" &&
    (header.slice(12, 16) === "ANIM" || header.slice(12, 16) === "ANMF")
  );
};

const canvasBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));

const heicToJpegBlob = async (file: File): Promise<File> => {
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.82 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    if (blob === undefined || blob.size === 0)
      throw new Error("HEIC conversion produced no output");
    const basename = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${basename}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    throw new AttachmentValidationError(
      "Couldn't convert this HEIC photo. Try saving it as JPEG first.",
    );
  }
};

const compressImage = async (file: File): Promise<File> => {
  const source = heicImageTypes.has(file.type) ? await heicToJpegBlob(file) : file;
  if (!compressibleImageTypes.has(source.type) || source.size < compressionThresholdBytes)
    return source;
  if (source.type === "image/webp" && (await isAnimatedWebp(source))) return source;
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maximumImageDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context === null) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const outputType = source.type === "image/png" ? "image/webp" : source.type;
  const blob = await canvasBlob(canvas, outputType);
  if (blob === null || blob.size >= source.size) return source;
  const extension = outputType === "image/webp" ? "webp" : "jpg";
  const basename = source.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${basename}.${extension}`, {
    type: outputType,
    lastModified: source.lastModified,
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
  const prepared = await Promise.all(
    selected.map((file) =>
      compressImage(file).catch((error) => {
        if (error instanceof AttachmentValidationError) throw error;
        if (heicImageTypes.has(file.type)) {
          throw new AttachmentValidationError(
            "Couldn't convert this HEIC photo. Try saving it as JPEG first.",
          );
        }
        return file;
      }),
    ),
  );
  const transfer = new DataTransfer();
  for (const file of prepared) transfer.items.add(file);
  return transfer.files;
};

export const prepareAttachmentParts = async ({
  files,
  existingCount,
}: {
  files: FileList;
  existingCount: number;
}): Promise<FileUIPart[]> => {
  const prepared = await prepareAttachments({ files, existingCount });
  return convertFileListToFileUIParts(prepared);
};
