import type { ManifestData } from "./types";
import { unshuffleArrayWithKey } from "./utils/random";
import { calcBlocksPerFragment, splitImageToBlocksBrowserRaw, blocksToImageBufferBrowser } from "./utils/block";

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
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  // 共通ロジックで分割
  return splitImageToBlocksBrowserRaw(imageData.data, img.width, img.height, blockSize);
}

// Reconstruct image from blocks
async function blocksToPngImageBrowser(
  blocks: { data: Uint8ClampedArray; width: number; height: number }[],
  width: number,
  height: number,
  blockSize: number
): Promise<Blob> {
  // dataのみ抽出してbuffer化
  const blockBuffers = blocks.map(b => b.data);
  // Node.jsと同じロジックでバッファを復元
  const imageBuffer = blocksToImageBufferBrowser(blockBuffers, width, height, blockSize);
  // 型エラー回避のため、Uint8ClampedArrayとして明示的にコピー
  const clampedBuffer = new Uint8ClampedArray(imageBuffer);
  const imageData = new ImageData(clampedBuffer, width, height);
  // canvasに描画
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  // Output as PNG Blob
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), "image/png")
  );
}

export class ImageRestorerBrowser {
  // fragmentImageからブロック配列を抽出する（Node.jsのextractBlocksFromFragment相当）
  private async extractBlocksFromFragmentBrowser(
    fragmentImage: File | Blob | ArrayBuffer | Uint8Array,
    manifest: ManifestData
  ): Promise<{ data: Uint8ClampedArray; width: number; height: number }[]> {
    const arrayBuffer = await toArrayBuffer(fragmentImage);
    // 暗号化対応は省略（必要なら追加）
    return await splitImageToBlocksBrowser(arrayBuffer, manifest.config.blockSize);
  }

  async restoreImages(
    fragmentImages: (File | Blob | ArrayBuffer | Uint8Array)[],
    manifest: ManifestData
  ): Promise<Blob[]> {
    // 1. Calculate the number of blocks for each image
    const imageBlockCounts = manifest.images.map((img) => img.x * img.y);
    const totalBlocks = imageBlockCounts.reduce((a, b) => a + b, 0);

    // 2. Calculate the number of blocks per fragment image
    const fragmentBlocksCount = calcBlocksPerFragment(
      totalBlocks,
      fragmentImages.length
    );

    // 3. Extract all blocks from fragment images (extract the correct number from each fragment image)
    const allBlocks: { data: Uint8ClampedArray; width: number; height: number }[] = [];
    for (let i = 0; i < fragmentImages.length; i++) {
      const blocks = await this.extractBlocksFromFragmentBrowser(
        fragmentImages[i],
        manifest
      );
      allBlocks.push(...blocks.slice(0, fragmentBlocksCount[i]));
    }

    // 4. Reproduce the shuffle order (common logic)
    const restoredBlocks = unshuffleArrayWithKey(
      allBlocks,
      manifest.config.seed
    );

    // 6. Assign blocks to each image and restore
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
