export interface FragmentationConfig {
  /** Pixel block size (e.g., 10x10 to 10) */
  blockSize: number;
  /** Prefix for fragment files (optional, default: "fragment") */
  prefix?: string;
  /** Random seed (auto-generated if not specified) */
  seed?: number;
}

export interface ShortImageInfo {
  /** Width */
  w: number;
  /** Height */
  h: number;
  /** Number of channels */
  c: number;
  /** Number of blocks X */
  x: number;
  /** Number of blocks Y */
  y: number;
}

export type EncryptionAlgorithm = "aes-256-cbc";

export interface ManifestData {
  /** UUID */
  id: string;
  /** Version */
  version: string;
  /** Timestamp */
  timestamp: string;
  /** Config */
  config: Required<FragmentationConfig>;
  /** Image information */
  images: ShortImageInfo[];
  /** Algorithm (only set if secure is true) */
  algorithm?: EncryptionAlgorithm;
  /** Secure (true if encrypted) */
  secure: boolean;
}
