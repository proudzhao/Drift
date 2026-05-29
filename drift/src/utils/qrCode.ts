const ERROR_CORRECTION_LEVEL_L = 1;
const PAD0 = 0xec;
const PAD1 = 0x11;

const RS_BLOCK_TABLE: Record<number, Array<[number, number, number]>> = {
  1: [[1, 26, 19]],
  2: [[1, 44, 34]],
  3: [[1, 70, 55]],
  4: [[1, 100, 80]],
  5: [[1, 134, 108]],
  6: [[2, 86, 68]],
  7: [[2, 98, 78]],
  8: [[2, 121, 97]],
};

const ALIGNMENT_PATTERN_POSITIONS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
};

const EXP_TABLE = new Array<number>(256);
const LOG_TABLE = new Array<number>(256);

for (let i = 0; i < 8; i += 1) {
  EXP_TABLE[i] = 1 << i;
}
for (let i = 8; i < 256; i += 1) {
  EXP_TABLE[i] =
    EXP_TABLE[i - 4] ^
    EXP_TABLE[i - 5] ^
    EXP_TABLE[i - 6] ^
    EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i += 1) {
  LOG_TABLE[EXP_TABLE[i]] = i;
}

export function createQrSvgDataUri(data: string, cellSize = 5, margin = 4) {
  const modules = createQrModules(data);
  const moduleCount = modules.length;
  const size = (moduleCount + margin * 2) * cellSize;
  const rects: string[] = [];

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!modules[row][col]) continue;
      rects.push(
        `<rect x="${(col + margin) * cellSize}" y="${(row + margin) * cellSize}" width="${cellSize}" height="${cellSize}"/>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${rects.join("")}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createQrModules(data: string) {
  const dataBytes = new TextEncoder().encode(data);
  const typeNumber = selectTypeNumber(dataBytes.length);
  const moduleCount = typeNumber * 4 + 17;
  const modules = createEmptyModules(moduleCount);
  const reserved = createEmptyModules(moduleCount);

  setupPositionProbePattern(modules, reserved, 0, 0);
  setupPositionProbePattern(modules, reserved, moduleCount - 7, 0);
  setupPositionProbePattern(modules, reserved, 0, moduleCount - 7);
  setupTimingPattern(modules, reserved);
  setupAlignmentPattern(modules, reserved, typeNumber);
  setupTypeInfo(modules, reserved, 0);
  if (typeNumber >= 7) {
    setupTypeNumber(modules, reserved, typeNumber);
  }

  const codewords = createCodewords(dataBytes, typeNumber);
  mapData(modules, reserved, codewords, 0);
  return modules;
}

function selectTypeNumber(dataLength: number) {
  for (let typeNumber = 1; typeNumber <= 8; typeNumber += 1) {
    const capacity = RS_BLOCK_TABLE[typeNumber].reduce(
      (total, [count, , dataCount]) => total + count * dataCount,
      0,
    );
    // Byte mode header is 12 bits for versions 1-8. Reserve two bytes for
    // header/terminator alignment to keep selection conservative.
    if (dataLength + 2 <= capacity) return typeNumber;
  }
  throw new Error("二维码内容过长");
}

function createEmptyModules(size: number) {
  return Array.from({ length: size }, () => Array<boolean>(size).fill(false));
}

function setupPositionProbePattern(
  modules: boolean[][],
  reserved: boolean[][],
  row: number,
  col: number,
) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const y = row + r;
      const x = col + c;
      if (!isInside(modules, y, x)) continue;
      reserved[y][x] = true;
      modules[y][x] =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
    }
  }
}

function setupTimingPattern(modules: boolean[][], reserved: boolean[][]) {
  for (let i = 8; i < modules.length - 8; i += 1) {
    if (!reserved[6][i]) {
      modules[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      modules[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }
}

function setupAlignmentPattern(
  modules: boolean[][],
  reserved: boolean[][],
  typeNumber: number,
) {
  const positions = ALIGNMENT_PATTERN_POSITIONS[typeNumber];
  for (const row of positions) {
    for (const col of positions) {
      if (reserved[row][col]) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          modules[row + r][col + c] =
            Math.max(Math.abs(r), Math.abs(c)) === 2 || (r === 0 && c === 0);
          reserved[row + r][col + c] = true;
        }
      }
    }
  }
}

function setupTypeInfo(
  modules: boolean[][],
  reserved: boolean[][],
  maskPattern: number,
) {
  const bits = getBchTypeInfo((ERROR_CORRECTION_LEVEL_L << 3) | maskPattern);
  const size = modules.length;

  for (let i = 0; i < 15; i += 1) {
    const value = ((bits >> i) & 1) === 1;
    const vertical = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : [size - 15 + i, 8];
    const horizontal = i < 8 ? [8, size - i - 1] : [8, 15 - i - 1];
    modules[vertical[0]][vertical[1]] = value;
    reserved[vertical[0]][vertical[1]] = true;
    modules[horizontal[0]][horizontal[1]] = value;
    reserved[horizontal[0]][horizontal[1]] = true;
  }

  modules[size - 8][8] = true;
  reserved[size - 8][8] = true;
}

function setupTypeNumber(
  modules: boolean[][],
  reserved: boolean[][],
  typeNumber: number,
) {
  const bits = getBchTypeNumber(typeNumber);
  const size = modules.length;

  for (let i = 0; i < 18; i += 1) {
    const value = ((bits >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = i % 3;
    modules[row][size - 11 + col] = value;
    reserved[row][size - 11 + col] = true;
    modules[size - 11 + col][row] = value;
    reserved[size - 11 + col][row] = true;
  }
}

function createCodewords(dataBytes: Uint8Array, typeNumber: number) {
  const blocks = RS_BLOCK_TABLE[typeNumber];
  const buffer = new BitBuffer();
  buffer.put(4, 4);
  buffer.put(dataBytes.length, 8);
  for (const byte of dataBytes) {
    buffer.put(byte, 8);
  }

  const totalDataCount = blocks.reduce(
    (total, [count, , dataCount]) => total + count * dataCount,
    0,
  );

  if (buffer.length + 4 <= totalDataCount * 8) {
    buffer.put(0, 4);
  }
  while (buffer.length % 8 !== 0) {
    buffer.putBit(false);
  }
  while (buffer.bytes.length < totalDataCount) {
    buffer.put(PAD0, 8);
    if (buffer.bytes.length < totalDataCount) buffer.put(PAD1, 8);
  }

  return createBytes(buffer.bytes, blocks);
}

function createBytes(data: number[], blocks: Array<[number, number, number]>) {
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  let maxDataCount = 0;
  let maxEccCount = 0;

  for (const [count, totalCount, dataCount] of blocks) {
    const eccCount = totalCount - dataCount;
    const generator = getErrorCorrectionPolynomial(eccCount);
    for (let i = 0; i < count; i += 1) {
      const dataBlock = data.slice(offset, offset + dataCount);
      offset += dataCount;
      const rawPoly = dataBlock.concat(Array(eccCount).fill(0));
      const modPoly = polynomialMod(rawPoly, generator);
      const eccBlock = Array(eccCount - modPoly.length)
        .fill(0)
        .concat(modPoly);
      dataBlocks.push(dataBlock);
      eccBlocks.push(eccBlock);
      maxDataCount = Math.max(maxDataCount, dataBlock.length);
      maxEccCount = Math.max(maxEccCount, eccBlock.length);
    }
  }

  const result: number[] = [];
  for (let i = 0; i < maxDataCount; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < maxEccCount; i += 1) {
    for (const block of eccBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  return result;
}

function mapData(
  modules: boolean[][],
  reserved: boolean[][],
  data: number[],
  maskPattern: number,
) {
  const size = modules.length;
  let row = size - 1;
  let direction = -1;
  let bitIndex = 7;
  let byteIndex = 0;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    while (true) {
      for (let c = 0; c < 2; c += 1) {
        const x = col - c;
        if (!reserved[row][x]) {
          let dark = false;
          if (byteIndex < data.length) {
            dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
          }
          if (mask(maskPattern, row, x)) {
            dark = !dark;
          }
          modules[row][x] = dark;
          reserved[row][x] = true;
          bitIndex -= 1;
          if (bitIndex === -1) {
            byteIndex += 1;
            bitIndex = 7;
          }
        }
      }
      row += direction;
      if (row < 0 || row >= size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

function mask(maskPattern: number, row: number, col: number) {
  switch (maskPattern) {
    case 0:
      return (row + col) % 2 === 0;
    default:
      return false;
  }
}

function getErrorCorrectionPolynomial(errorCorrectionLength: number) {
  let poly = [1];
  for (let i = 0; i < errorCorrectionLength; i += 1) {
    poly = polynomialMultiply(poly, [1, gexp(i)]);
  }
  return poly;
}

function polynomialMultiply(left: number[], right: number[]) {
  const result = Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] ^= gexp(glog(left[i]) + glog(right[j]));
    }
  }
  return result;
}

function polynomialMod(dividend: number[], divisor: number[]) {
  let result = dividend.slice();
  while (result.length >= divisor.length) {
    const ratio = glog(result[0]) - glog(divisor[0]);
    for (let i = 0; i < divisor.length; i += 1) {
      result[i] ^= gexp(glog(divisor[i]) + ratio);
    }
    while (result.length > 0 && result[0] === 0) {
      result.shift();
    }
  }
  return result;
}

function getBchTypeInfo(data: number) {
  let d = data << 10;
  while (getBchDigit(d) - getBchDigit(0x537) >= 0) {
    d ^= 0x537 << (getBchDigit(d) - getBchDigit(0x537));
  }
  return ((data << 10) | d) ^ 0x5412;
}

function getBchTypeNumber(data: number) {
  let d = data << 12;
  while (getBchDigit(d) - getBchDigit(0x1f25) >= 0) {
    d ^= 0x1f25 << (getBchDigit(d) - getBchDigit(0x1f25));
  }
  return (data << 12) | d;
}

function getBchDigit(data: number) {
  let digit = 0;
  let value = data;
  while (value !== 0) {
    digit += 1;
    value >>>= 1;
  }
  return digit;
}

function glog(value: number) {
  if (value < 1) throw new Error("QR finite field log input must be positive");
  return LOG_TABLE[value];
}

function gexp(value: number) {
  let normalized = value;
  while (normalized < 0) normalized += 255;
  while (normalized >= 256) normalized -= 255;
  return EXP_TABLE[normalized];
}

function isInside(modules: boolean[][], row: number, col: number) {
  return row >= 0 && row < modules.length && col >= 0 && col < modules.length;
}

class BitBuffer {
  bytes: number[] = [];
  length = 0;

  put(value: number, length: number) {
    for (let i = 0; i < length; i += 1) {
      this.putBit(((value >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufferIndex = Math.floor(this.length / 8);
    if (this.bytes.length <= bufferIndex) {
      this.bytes.push(0);
    }
    if (bit) {
      this.bytes[bufferIndex] |= 0x80 >>> this.length % 8;
    }
    this.length += 1;
  }
}
