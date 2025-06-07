import type { ManifestData } from "./types";
import { unshuffleArrayWithKey } from "./utils/random";

// Type guard for ArrayBuffer (not SharedArrayBuffer)
function isArrayBuffer(input: any): input is ArrayBuffer {
  return (
    input &&
    typeof input === "object" &&
    input.constructor &&
    input.constructor.name === "ArrayBuffer"
  );
}

// For browser: File/Blob/ArrayBuffer/Uint8Array → ArrayBuffer
async function toArrayBuffer(input: File | Blob | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  if (isArrayBuffer(input)) return input;
  if (input instanceof Uint8Array) return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  if (input instanceof Blob) {
    return await input.arrayBuffer();
  }
  throw new Error("Unsupported input type");
}

// Block splitting: Use canvas to get ImageData and split by blockSize
async function splitImageToBlocksBrowser(
  arrayBuffer: ArrayBuffer,
  blockSize: number
): Promise<{ data: Uint8ClampedArray; width: number; height: number }[]> {
  // Convert image data to ImageBitmap
  const blob = new Blob([arrayBuffer]);
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const blocks: { data: Uint8ClampedArray; width: number; height: number }[] = [];
  for (let y = 0; y < img.height; y += blockSize) {
    for (let x = 0; x < img.width; x += blockSize) {
      const w = Math.min(blockSize, img.width - x);
      const h = Math.min(blockSize, img.height - y);
      const imageData = ctx.getImageData(x, y, w, h);
      blocks.push({ data: new Uint8ClampedArray(imageData.data), width: w, height: h });
    }
  }
  return blocks;
}

// Reconstruct image from blocks
async function blocksToPngImageBrowser(
  blocks: { data: Uint8ClampedArray; width: number; height: number }[],
  width: number,
  height: number,
  blockSize: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  let blockIndex = 0;
  const blockCountX = Math.ceil(width / blockSize);
  const blockCountY = Math.ceil(height / blockSize);
  for (let by = 0; by < blockCountY; by++) {
    for (let bx = 0; bx < blockCountX; bx++) {
      if (blockIndex < blocks.length) {
        const { data, width: w, height: h } = blocks[blockIndex];
        const imageData = new ImageData(new Uint8ClampedArray(data), w, h);
        ctx.putImageData(imageData, bx * blockSize, by * blockSize);
        blockIndex++;
      }
    }
  }
  // Output as PNG Blob
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), "image/png")
  );
}

export class ImageRestorerBrowser {
  async restoreImages(
    fragmentImages: (File | Blob | ArrayBuffer | Uint8Array)[],
    manifest: ManifestData
  ): Promise<Blob[]> {
    // 1. Extract blocks from each fragment image
    const fragmentBlocksCount = manifest.images.map((img) => img.x * img.y);
    const totalBlocks = fragmentBlocksCount.reduce((a, b) => a + b, 0);

    // 2. Extract blocks from each fragment image
    const allBlocks: { data: Uint8ClampedArray; width: number; height: number }[] = [];
    for (let i = 0; i < fragmentImages.length; i++) {
      const arrayBuffer = await toArrayBuffer(fragmentImages[i]);
      const blocks = await splitImageToBlocksBrowser(
        arrayBuffer,
        manifest.config.blockSize
      );
      // Only take the required number of blocks for each fragment
      allBlocks.push(...blocks.slice(0, fragmentBlocksCount[i]));
    }

    // 3. Unshuffle
    const restoredBlocks = unshuffleArrayWithKey(
      allBlocks,
      manifest.config.seed
    );

    // 4. Assign blocks to each image and restore
    const restoredImages: Blob[] = [];
    let blockPtr = 0;
    for (let imgIdx = 0; imgIdx < manifest.images.length; imgIdx++) {
      const imageInfo = manifest.images[imgIdx];
      const blockCount = imageInfo.x * imageInfo.y;
      const imageBlocks = restoredBlocks.slice(blockPtr, blockPtr + blockCount);
      blockPtr += blockCount;
      const pngBlob = await blocksToPngImageBrowser(
        imageBlocks,
        imageInfo.w,
        imageInfo.h,
        manifest.config.blockSize
      );
      restoredImages.push(pngBlob);
    }
    return restoredImages;
  }
} 