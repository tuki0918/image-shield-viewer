import type { ManifestData } from "./types";
import { unshuffleArrayWithKey } from "./utils/random";
import { calcBlocksPerFragment, splitImageToBlocksBrowserRaw, blocksToImageBufferBrowser } from "./utils/block";
import { uuidToIV } from "./utils/crypto.browser";
import CryptoJS from "crypto-js";

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

// ArrayBuffer を AES-256-CBC で復号
function decryptArrayBuffer(arrayBuffer: ArrayBuffer, secretKey: string, uuid: string): ArrayBuffer {
  // Node.jsと同じくkeyはSHA-256で32バイト化
  const key = CryptoJS.SHA256(secretKey);
  const iv = CryptoJS.enc.Hex.parse(Array.from(uuidToIV(uuid)).map(b => b.toString(16).padStart(2, "0")).join(""));
  const encrypted = CryptoJS.lib.WordArray.create(new Uint8Array(arrayBuffer) as any);
  const encryptedBase64 = CryptoJS.enc.Base64.stringify(encrypted);
  const decrypted = CryptoJS.AES.decrypt(encryptedBase64, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
  // WordArray → Uint8Array → ArrayBuffer
  const decryptedBytes = decrypted.words.reduce((arr: number[], word: number) => {
    arr.push((word >> 24) & 0xff, (word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff);
    return arr;
  }, []);
  // 長さ調整
  const len = decrypted.sigBytes;
  return (new Uint8Array(decryptedBytes.slice(0, len))).buffer;
}

export class ImageRestorerBrowser {
  private secretKey?: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey;
  }

  // fragmentImageからブロック配列を抽出する（Node.jsのextractBlocksFromFragment相当）
  private async extractBlocksFromFragmentBrowser(
    fragmentImage: File | Blob | ArrayBuffer | Uint8Array,
    manifest: ManifestData
  ): Promise<{ data: Uint8ClampedArray; width: number; height: number }[]> {
    let arrayBuffer = await toArrayBuffer(fragmentImage);
    if (manifest.secure && this.secretKey) {
      arrayBuffer = decryptArrayBuffer(arrayBuffer, this.secretKey, manifest.id);
    }
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
