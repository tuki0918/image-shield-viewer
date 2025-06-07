// Convert UUID to IV (16 bytes) for browser
export function uuidToIV(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) throw new Error("Invalid UUID format");
  const iv = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    iv[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return iv;
}
