export class SecureCompare {
  private constructor() {}

  static equals(left: string, right: string): boolean {
    const encoder = new TextEncoder();
    const leftBytes = encoder.encode(left);
    const rightBytes = encoder.encode(right);
    const maxLength = Math.max(leftBytes.length, rightBytes.length);
    let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;
    for (let index = 0; index < maxLength; index += 1) {
      const leftByte = index < leftBytes.length ? leftBytes[index]! : 0;
      const rightByte = index < rightBytes.length ? rightBytes[index]! : 0;
      mismatch |= leftByte ^ rightByte;
    }
    return mismatch === 0;
  }
}
