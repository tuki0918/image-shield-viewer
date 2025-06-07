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
