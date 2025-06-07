export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // This method uses a Linear Congruential Generator (LCG) to produce pseudo-random numbers.
  // The numbers 9301 (multiplier), 49297 (increment), and 233280 (modulus) are classic parameters
  // often used in simple LCG implementations, such as in old BASIC languages. They provide a reasonable
  // period and distribution for non-cryptographic purposes, but are not suitable for cryptographic use.
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Generate a shuffled index array for a given length and seed
 */
export function generateShuffleIndices(length: number, seed: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  const random = new SeededRandom(seed);
  return random.shuffle(indices);
}

/**
 * Unshuffle an array using the shuffle indices (restore original order)
 */
export function unshuffleByIndices<T>(array: T[], indices: number[]): T[] {
  const result: T[] = new Array(array.length);
  for (let i = 0; i < indices.length; i++) {
    result[indices[i]] = array[i];
  }
  return result;
}

/**
 * Unshuffle an array using a seed
 * @param array Shuffled array
 * @param seed Seed value
 * @returns Unshuffled (restored) array
 */
export function unshuffleArrayWithKey<T>(array: T[], seed: number): T[] {
  const indices = generateShuffleIndices(array.length, seed);
  return unshuffleByIndices(array, indices);
}
