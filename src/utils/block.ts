/**
 * Calculate the number of blocks assigned to each fragment image
 * @param totalBlocks Total number of blocks
 * @param fragmentCount Number of fragment images
 * @returns Array of block counts per fragment
 */
export function calcBlocksPerFragment(
    totalBlocks: number,
    fragmentCount: number,
  ): number[] {
    const blocksPerImage = Math.ceil(totalBlocks / fragmentCount);
    let remainingBlocks = totalBlocks;
    const fragmentBlocksCount: number[] = [];
    for (let i = 0; i < fragmentCount; i++) {
      const count = Math.min(blocksPerImage, remainingBlocks);
      fragmentBlocksCount.push(count);
      remainingBlocks -= count;
    }
    return fragmentBlocksCount;
  }

// ブラウザ用: Uint8ClampedArray対応 extractBlock
export function extractBlockBrowser(
  buffer: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number | undefined,
  startX: number,
  startY: number,
  blockSize: number,
): Uint8ClampedArray {
  const channels = 4;
  const blockWidth = imageWidth
    ? Math.min(blockSize, imageWidth - startX)
    : blockSize;
  const blockHeight =
    imageHeight !== undefined
      ? Math.min(blockSize, imageHeight - startY)
      : blockSize;
  const blockData: number[] = [];
  for (let y = 0; y < blockHeight; y++) {
    for (let x = 0; x < blockWidth; x++) {
      const srcX = startX + x;
      const srcY = startY + y;
      const pixelIndex = (srcY * imageWidth + srcX) * channels;
      for (let c = 0; c < channels; c++) {
        blockData.push(buffer[pixelIndex + c] || 0);
      }
    }
  }
  return new Uint8ClampedArray(blockData);
}

// ブラウザ用: Uint8ClampedArray対応 splitImageToBlocks
export function splitImageToBlocksBrowserRaw(
  buffer: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number,
): { data: Uint8ClampedArray; width: number; height: number }[] {
  const blocks: { data: Uint8ClampedArray; width: number; height: number }[] = [];
  const blockCountX = Math.ceil(width / blockSize);
  const blockCountY = Math.ceil(height / blockSize);
  for (let by = 0; by < blockCountY; by++) {
    for (let bx = 0; bx < blockCountX; bx++) {
      const block = extractBlockBrowser(
        buffer,
        width,
        height,
        bx * blockSize,
        by * blockSize,
        blockSize,
      );
      const w = bx === blockCountX - 1 ? width - bx * blockSize : blockSize;
      const h = by === blockCountY - 1 ? height - by * blockSize : blockSize;
      blocks.push({ data: block, width: w, height: h });
    }
  }
  return blocks;
}

// ブラウザ用: Uint8ClampedArray対応 placeBlock
export function placeBlockBrowser(
  targetBuffer: Uint8ClampedArray,
  blockData: Uint8ClampedArray,
  targetWidth: number,
  destX: number,
  destY: number,
  blockSize: number,
  blockWidth?: number,
  blockHeight?: number,
): void {
  const channels = 4;
  const w = blockWidth ?? blockSize;
  const h = blockHeight ?? blockSize;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIndex = (y * w + x) * channels;
      const destIndex = ((destY + y) * targetWidth + (destX + x)) * channels;
      if (destIndex + channels <= targetBuffer.length) {
        for (let c = 0; c < channels; c++) {
          targetBuffer[destIndex + c] = blockData[srcIndex + c];
        }
      }
    }
  }
}

// ブラウザ用: Uint8ClampedArray対応 blocksToImageBuffer
export function blocksToImageBufferBrowser(
  blocks: Uint8ClampedArray[],
  width: number,
  height: number,
  blockSize: number,
): Uint8ClampedArray {
  const channels = 4;
  const imageBuffer = new Uint8ClampedArray(width * height * channels);
  const blockCountX = Math.ceil(width / blockSize);
  const blockCountY = Math.ceil(height / blockSize);
  let blockIndex = 0;
  for (let by = 0; by < blockCountY; by++) {
    for (let bx = 0; bx < blockCountX; bx++) {
      if (blockIndex < blocks.length) {
        const blockWidth =
          bx === blockCountX - 1 ? width - bx * blockSize : blockSize;
        const blockHeight =
          by === blockCountY - 1 ? height - by * blockSize : blockSize;
        placeBlockBrowser(
          imageBuffer,
          blocks[blockIndex],
          width,
          bx * blockSize,
          by * blockSize,
          blockSize,
          blockWidth,
          blockHeight,
        );
        blockIndex++;
      }
    }
  }
  return imageBuffer;
}
