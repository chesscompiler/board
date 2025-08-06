// Exports: encodeFenForUrl, decodeFenFromUrl

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';





// === ADVANCED FEN URL SHORTENER (ULTRA COMPRESSION) ===

// --- CONSTANTS AND GLOBALS ---
const PIECE_SYMBOLS = "PNBRQKpnbrqk";
const START_FEN_PIECES = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const EMPTY_FEN_PIECES = "8/8/8/8/8/8/8/8";
const COMMON_PATTERNS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
    "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR",
    "8/8/8/8/8/8/8/8"
];

// --- BITBOARD INITIALIZATION ---
function fenToBitboards(fenPieces) {
    const bitboards = {};
    for (const p of PIECE_SYMBOLS) bitboards[p] = 0n;
    const ranks = fenPieces.split('/');
    for (let rank = 7; rank >= 0; rank--) {
        let file = 0;
        for (const char of ranks[7 - rank]) {
            if (isNaN(parseInt(char))) {
                bitboards[char] |= (1n << BigInt(rank * 8 + file));
                file++;
            } else {
                file += parseInt(char);
            }
        }
    }
    return bitboards;
}
function bitboardsToFen(bitboards) {
    let fen = '';
    for (let rank = 7; rank >= 0; rank--) {
        let empty = 0;
        for (let file = 0; file < 8; file++) {
            const squareIndex = BigInt(rank * 8 + file);
            let piece = null;
            for (const p of PIECE_SYMBOLS) {
                if ((bitboards[p] & (1n << squareIndex)) !== 0n) {
                    piece = p;
                    break;
                }
            }
            if (piece) {
                if (empty > 0) { fen += empty; empty = 0; }
                fen += piece;
    } else {
                empty++;
            }
        }
        if (empty > 0) fen += empty;
        if (rank > 0) fen += '/';
    }
    return fen;
}

const START_BITBOARDS = fenToBitboards(START_FEN_PIECES);
const EMPTY_BITBOARDS = fenToBitboards(EMPTY_FEN_PIECES);
const COMMON_BITBOARDS = COMMON_PATTERNS.map(fenToBitboards);

// --- BITBOARD HELPERS ---
function countBits(n) {
    let count = 0;
    while (n > 0n) {
        count += Number(n & 1n);
        n >>= 1n;
    }
    return count;
}
function calculateOptimalDelta(currentBitboards) {
    let bestDelta = null;
    let bestSize = Infinity;
    let bestMode = "";
    let bestModeIndex = -1;
    const estimateBitboardSize = (bitboards) => {
        let totalBits = 0;
        for (const piece of PIECE_SYMBOLS) {
            if (bitboards[piece] !== 0n) {
                totalBits += countBits(bitboards[piece]) * 6;
            }
        }
        return totalBits;
    };
    // Strategy 1: Delta from starting position
    const deltaFromStart = {};
    for (const piece of PIECE_SYMBOLS) {
        deltaFromStart[piece] = currentBitboards[piece] ^ START_BITBOARDS[piece];
    }
    const startSize = estimateBitboardSize(deltaFromStart);
    if (startSize < bestSize) {
        bestSize = startSize;
        bestDelta = deltaFromStart;
        bestMode = "Delta from Start";
        bestModeIndex = 0;
    }
    // Strategy 2: Delta from empty board
    const deltaFromEmpty = currentBitboards;
    const emptySize = estimateBitboardSize(deltaFromEmpty);
    if (emptySize < bestSize) {
        bestSize = emptySize;
        bestDelta = deltaFromEmpty;
        bestMode = "Raw Bitboards";
        bestModeIndex = 1;
    }
    // Strategy 3: Delta from common patterns
    for (let i = 0; i < COMMON_BITBOARDS.length; i++) {
        const deltaFromPattern = {};
        for (const piece of PIECE_SYMBOLS) {
            deltaFromPattern[piece] = currentBitboards[piece] ^ COMMON_BITBOARDS[i][piece];
        }
        const patternSize = estimateBitboardSize(deltaFromPattern);
        if (patternSize < bestSize) {
            bestSize = patternSize;
            bestDelta = deltaFromPattern;
            bestMode = `Delta from Pattern ${i}`;
            bestModeIndex = 2 + i;
        }
    }
    return { delta: bestDelta, mode: bestMode, size: bestSize, modeIndex: bestModeIndex };
}
// --- ADVANCED BITBOARD ENCODING/DECODING ---
function encodeBitboardAdvanced(bitboard) {
    if (bitboard === 0n) return [];
    const positions = [];
    for (let i = 0; i < 64; i++) {
        if ((bitboard & (1n << BigInt(i))) !== 0n) {
            positions.push(i);
        }
    }
    if (positions.length === 0) return [];
    if (positions.length === 1) return [0x80 | positions[0]];
    const result = [positions.length];
    let prev = 0;
    for (const pos of positions) {
        const diff = pos - prev;
        if (diff < 128) {
            result.push(diff);
        } else {
            result.push(0x80 | (diff & 0x7F), diff >> 7);
        }
        prev = pos;
    }
    return result;
}
function decodeBitboardAdvanced(data, offset) {
    if (offset >= data.length) return { bitboard: 0n, newOffset: offset };
    let bitboard = 0n;
    let ptr = offset;
    if (data[ptr] & 0x80) {
        const pos = data[ptr] & 0x7F;
        bitboard = 1n << BigInt(pos);
        return { bitboard, newOffset: ptr + 1 };
    }
    const count = data[ptr++];
    let currentPos = 0;
    for (let i = 0; i < count; i++) {
        if (ptr >= data.length) throw new Error("Unexpected end of data in bitboard stream.");
        let diff = data[ptr++];
        if (diff & 0x80) {
            if (ptr >= data.length) throw new Error("Unexpected end of data in bitboard stream.");
            diff = (diff & 0x7F) | (data[ptr++] << 7);
        }
        currentPos += diff;
        bitboard |= (1n << BigInt(currentPos));
    }
    return { bitboard, newOffset: ptr };
}

// --- ADVANCED RLE ---
function advancedRLE(data) {
    const result = [];
    for (let i = 0; i < data.length; ) {
        const byte = data[i];
        let count = 1;
        while (i + count < data.length && data[i + count] === byte && count < 255) {
            count++;
        }
        if (count >= 4 || (count >= 3 && byte === 0)) {
            result.push(0xFF, byte, count);
            i += count;
        } else {
            if (byte === 0xFF) {
                result.push(0xFF, 0xFF, 1);
            } else {
                result.push(byte);
            }
            i++;
        }
    }
    return new Uint8Array(result);
}
function advancedRLEDecompress(data) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (data[i] === 0xFF && i + 2 < data.length) {
            const byte = data[i + 1];
            const count = data[i + 2];
            for (let j = 0; j < count; j++) {
                result.push(byte);
            }
            i += 2;
        } else {
            result.push(data[i]);
        }
    }
    return new Uint8Array(result);
}
// --- BASE64 (URL-SAFE) ---
const BASE64_MAP = new Map();
for (let i = 0; i < BASE64_CHARS.length; i++) {
    BASE64_MAP.set(BASE64_CHARS[i], i);
}
function base64Encode(data) {
    let result = '';
    let i = 0;
    for (i = 0; i + 2 < data.length; i += 3) {
        const a = data[i];
        const b = data[i + 1];
        const c = data[i + 2];
        const bitmap = (a << 16) | (b << 8) | c;
        result += BASE64_CHARS[(bitmap >> 18) & 63] + BASE64_CHARS[(bitmap >> 12) & 63] + BASE64_CHARS[(bitmap >> 6) & 63] + BASE64_CHARS[bitmap & 63];
    }
    if (i < data.length) {
        const a = data[i];
        const b = (i + 1 < data.length) ? data[i + 1] : 0;
        const bitmap = (a << 16) | (b << 8);
        result += BASE64_CHARS[(bitmap >> 18) & 63] + BASE64_CHARS[(bitmap >> 12) & 63];
        if (i + 1 < data.length) {
            result += BASE64_CHARS[(bitmap >> 6) & 63];
        }
    }
    return result;
}
function base64Decode(str) {
    const result = [];
    let i = 0;
    for (i = 0; i + 3 < str.length; i += 4) {
        const a = BASE64_MAP.get(str[i]) || 0;
        const b = BASE64_MAP.get(str[i + 1]) || 0;
        const c = BASE64_MAP.get(str[i + 2]) || 0;
        const d = BASE64_MAP.get(str[i + 3]) || 0;
        const bitmap = (a << 18) | (b << 12) | (c << 6) | d;
        result.push((bitmap >> 16) & 255, (bitmap >> 8) & 255, bitmap & 255);
    }
    if (i < str.length) {
        const a = BASE64_MAP.get(str[i]) || 0;
        const b = BASE64_MAP.get(str[i + 1]) || 0;
        const bitmap = (a << 18) | (b << 12);
        result.push((bitmap >> 16) & 255);
        if (i + 2 < str.length) {
            const c = BASE64_MAP.get(str[i + 2]) || 0;
            const fullBitmap = bitmap | (c << 6);
            result.push((fullBitmap >> 8) & 255);
        }
    }
    return new Uint8Array(result);
}

function ultraCompress(fenString) {
    if (!fenString || typeof fenString !== 'string') throw new Error("Invalid FEN string provided.");
    const parts = fenString.split(' ');
    if (parts.length !== 6) throw new Error("FEN string must have 6 parts.");
    const [fenPieces, activeColor, castling, enPassant, halfmove, fullmove] = parts;
    // 1. Direct Pattern Matching
    const patternIndex = COMMON_PATTERNS.indexOf(fenPieces);
    if (patternIndex !== -1) {
        let metadataBytes = [];
        let flags = 0;
        if (activeColor === 'w') flags |= 0x80;
        if (castling.includes('K')) flags |= 0x40;
        if (castling.includes('Q')) flags |= 0x20;
        if (castling.includes('k')) flags |= 0x10;
        if (castling.includes('q')) flags |= 0x08;
        if (enPassant !== '-') {
            flags |= 0x04;
            const file = enPassant.charCodeAt(0) - 'a'.charCodeAt(0);
            const rank = parseInt(enPassant[1]) - 1;
            metadataBytes.push(rank * 8 + file);
        }
        metadataBytes.push(parseInt(halfmove), parseInt(fullmove));
        const finalData = [0xFF, patternIndex, flags, ...metadataBytes];
        return {
            compressed: base64Encode(new Uint8Array(finalData)),
            mode: `Pattern Match #${patternIndex}`,
            algorithm: "Direct Pattern Reference",
            layers: ["Pattern Matching", "Base64"]
        };
    }
    // 2. Full Compression Pipeline
    let metadataBytes = [];
    let flags = 0;
    if (activeColor === 'w') flags |= 0x80;
    if (castling.includes('K')) flags |= 0x40;
    if (castling.includes('Q')) flags |= 0x20;
    if (castling.includes('k')) flags |= 0x10;
    if (castling.includes('q')) flags |= 0x08;
    if (enPassant !== '-') {
        flags |= 0x04;
        const file = enPassant.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = parseInt(enPassant[1]) - 1;
        metadataBytes.push(rank * 8 + file);
    }
    metadataBytes.push(parseInt(halfmove), parseInt(fullmove));
    const currentBitboards = fenToBitboards(fenPieces);
    const { delta, mode, modeIndex } = calculateOptimalDelta(currentBitboards);
    let boardData = [];
    for (let i = 0; i < PIECE_SYMBOLS.length; i++) {
        const piece = PIECE_SYMBOLS[i];
        const encodedBoard = encodeBitboardAdvanced(delta[piece]);
        if (encodedBoard.length > 0) {
            boardData.push(i);
            boardData.push(encodedBoard.length);
            boardData.push(...encodedBoard);
        }
    }
    const rawData = [flags, modeIndex, ...metadataBytes, boardData.length, ...boardData];
    const rleCompressed = advancedRLE(new Uint8Array(rawData));
    const finalData = [0xFE, ...rleCompressed];
    const result = base64Encode(new Uint8Array(finalData));
    return {
        compressed: result,
        mode: mode,
        algorithm: "Multi-Layer Compression",
        layers: ["Delta Encoding", "Advanced RLE", "Base64"]
    };
}
function ultraDecompress(compressedStr) {
    if (!compressedStr || typeof compressedStr !== 'string') throw new Error("Invalid compressed string provided.");
    const data = Array.from(base64Decode(compressedStr));
    let ptr = 0;
    const compressionType = data[ptr++];
    if (compressionType === 0xFF) {
        const patternIndex = data[ptr++];
        if (patternIndex < 0 || patternIndex >= COMMON_PATTERNS.length) {
            throw new Error(`Invalid pattern index ${patternIndex} found in data.`);
        }
        const flags = data[ptr++];
        let enPassant = '-';
        if (flags & 0x04) {
            const enPassantIndex = data[ptr++];
            enPassant = String.fromCharCode('a'.charCodeAt(0) + (enPassantIndex % 8)) + (Math.floor(enPassantIndex / 8) + 1);
        }
        const halfmove = data[ptr++];
        const fullmove = data[ptr++];
        const activeColor = (flags & 0x80) ? 'w' : 'b';
        let castling = ((flags & 0x40) ? 'K' : '') + ((flags & 0x20) ? 'Q' : '') + ((flags & 0x10) ? 'k' : '') + ((flags & 0x08) ? 'q' : '') || '-';
        return [COMMON_PATTERNS[patternIndex], activeColor, castling, enPassant, halfmove.toString(), fullmove.toString()].join(' ');
    }
    if (compressionType !== 0xFE) {
        throw new Error("Unknown compression format header.");
    }
    const compressedData = new Uint8Array(data.slice(1));
    const rleDecompressed = advancedRLEDecompress(compressedData);
    const rawData = Array.from(rleDecompressed);
    ptr = 0;
    const flags = rawData[ptr++];
    const deltaModeIndex = rawData[ptr++];
    let enPassant = '-';
    if (flags & 0x04) {
        const enPassantIndex = rawData[ptr++];
        enPassant = String.fromCharCode('a'.charCodeAt(0) + (enPassantIndex % 8)) + (Math.floor(enPassantIndex / 8) + 1);
    }
    const halfmove = rawData[ptr++];
    const fullmove = rawData[ptr++];
    const boardDataLength = rawData[ptr++];
    const boardData = rawData.slice(ptr, ptr + boardDataLength);
    const deltaBitboards = {};
    for (const p of PIECE_SYMBOLS) deltaBitboards[p] = 0n;
    let boardPtr = 0;
    while (boardPtr < boardData.length) {
        const pieceIndex = boardData[boardPtr++];
        const dataLength = boardData[boardPtr++];
        const pieceData = boardData.slice(boardPtr, boardPtr + dataLength);
        boardPtr += dataLength;
        const { bitboard } = decodeBitboardAdvanced(pieceData, 0);
        deltaBitboards[PIECE_SYMBOLS[pieceIndex]] = bitboard;
    }
    let baseBitboards;
    if (deltaModeIndex === 0) {
        baseBitboards = START_BITBOARDS;
    } else if (deltaModeIndex === 1) {
        baseBitboards = EMPTY_BITBOARDS;
    } else {
        const patternIndex = deltaModeIndex - 2;
        if (patternIndex < 0 || patternIndex >= COMMON_BITBOARDS.length) {
            throw new Error("Invalid delta pattern index found in data.");
        }
        baseBitboards = COMMON_BITBOARDS[patternIndex];
    }
    const originalBitboards = {};
    for (const piece of PIECE_SYMBOLS) {
        originalBitboards[piece] = deltaBitboards[piece] ^ baseBitboards[piece];
    }
    const fenPieces = bitboardsToFen(originalBitboards);
    const activeColor = (flags & 0x80) ? 'w' : 'b';
    let castling = ((flags & 0x40) ? 'K' : '') + ((flags & 0x20) ? 'Q' : '') + ((flags & 0x10) ? 'k' : '') + ((flags & 0x08) ? 'q' : '') || '-';
    return [fenPieces, activeColor, castling, enPassant, halfmove.toString(), fullmove.toString()].join(' ');
}
function encodeFenForUrl(fenString) {
    return ultraCompress(fenString).compressed;
}
function decodeFenFromUrl(compressedStr) {
    return ultraDecompress(compressedStr);
}
// Export for browser and module usage
if (typeof window !== 'undefined') {
    window.encodeFenForUrl = encodeFenForUrl;
    window.decodeFenFromUrl = decodeFenFromUrl;
}
export { encodeFenForUrl, decodeFenFromUrl };