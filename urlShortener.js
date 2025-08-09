// Exports: encodeFenForUrl, decodeFenFromUrl, v2

// Optimized FEN URL shortener implementing:
// - presence-mask per-piece streams (no per-piece index bytes)
// - unsigned LEB128 varints for counts/lengths
// - nibble-board (4-bit per square) fallback for dense positions
// - actual-encoding-size simulation to pick best delta/base
// - simplified single-byte diffs in piece streams
// - stricter base64 decode validation
// - improved bit counting

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// === CONSTANTS AND GLOBALS ===
const PIECE_SYMBOLS = "PNBRQKpnbrqk"; // 12 symbols
const START_FEN_PIECES = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const EMPTY_FEN_PIECES = "8/8/8/8/8/8/8/8";
const COMMON_PATTERNS = [
    START_FEN_PIECES,
    "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR",
    "8/8/8/8/8/8/8/8"
];

// Precompute bitboards for patterns
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
    // Kernighan-style popcount for BigInt
    let c = 0;
    while (n) {
        n &= (n - 1n);
        c++;
    }
    return c;
}

// --- LEB128 (unsigned) helpers ---
function encodeVarUint(n) {
    const out = [];
    let v = n >>> 0; // coerce to number
    // Note: for values > 2^32 this will break; our values are small here.
    while (v >= 0x80) {
        out.push((v & 0x7F) | 0x80);
        v = v >>> 7;
    }
    out.push(v);
    return out;
}
function decodeVarUint(data, ptr = 0) {
    let shift = 0, res = 0, b;
    while (true) {
        if (ptr >= data.length) throw new Error('varint truncated');
        b = data[ptr++];
        res |= (b & 0x7F) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
    }
    return { value: res, newPtr: ptr };
}

// --- ENCODE / DECODE piece position streams ---
// Format (simple & compact):
// - empty -> no data
// - single position -> single byte: 0x80 | pos (pos 0..63)
// - multi positions -> [count(varint), diff1, diff2, ...] where each diff fits in a byte (0..127)
function encodePiecePositionsSimple(bitboard) {
    if (bitboard === 0n) return new Uint8Array(0);
    const positions = [];
    for (let i = 0; i < 64; i++) {
        if ((bitboard & (1n << BigInt(i))) !== 0n) positions.push(i);
    }
    if (positions.length === 0) return new Uint8Array(0);
    if (positions.length === 1) return new Uint8Array([0x80 | positions[0]]);
    const out = [];
    out.push(...encodeVarUint(positions.length));
    let prev = 0;
    for (const p of positions) {
        const diff = p - prev; // 0..63
        if (diff < 0 || diff > 127) throw new Error('unexpected diff size');
        out.push(diff);
        prev = p;
    }
    return new Uint8Array(out);
}
function decodePiecePositionsSimple(data, offset) {
    if (offset >= data.length) return { bitboard: 0n, newOffset: offset };
    let ptr = offset;
    const first = data[ptr];
    if (first & 0x80) {
        const pos = first & 0x7F;
        const bitboard = 1n << BigInt(pos);
        return { bitboard, newOffset: ptr + 1 };
    }
    // read count varint
    const { value: count, newPtr } = decodeVarUint(data, ptr);
    ptr = newPtr;
    let currentPos = 0;
    let bitboard = 0n;
    for (let i = 0; i < count; i++) {
        if (ptr >= data.length) throw new Error('Unexpected end of piece stream');
        const diff = data[ptr++];
        currentPos += diff;
        bitboard |= (1n << BigInt(currentPos));
    }
    return { bitboard, newOffset: ptr };
}

// --- NIBBLE BOARD (4-bit per square) ---
function buildNibbleBoardFromBitboards(bitboards) {
    // map PIECE_SYMBOLS -> 1..12 values, 0 = empty
    const map = {};
    for (let i = 0; i < PIECE_SYMBOLS.length; i++) map[PIECE_SYMBOLS[i]] = i + 1;
    const arr = new Uint8Array(32);
    for (let sq = 0; sq < 64; sq++) {
        let v = 0;
        for (const p of PIECE_SYMBOLS) {
            if ((bitboards[p] & (1n << BigInt(sq))) !== 0n) { v = map[p]; break; }
        }
        const byteIndex = (sq >>> 1);
        if ((sq & 1) === 0) arr[byteIndex] |= (v & 0xF) << 4; // high nibble
        else arr[byteIndex] |= (v & 0xF); // low nibble
    }
    return arr;
}

// --- CHOOSE BEST DELTA BASE (simulate real encoded sizes) ---
function simulatePackedDeltaSize(deltaBitboards) {
    // presence mask 12 bits -> store as 2 bytes
    let size = 2; // mask
    // for each present piece, we will store varint(length) + data
    for (let i = 0; i < PIECE_SYMBOLS.length; i++) {
        const p = PIECE_SYMBOLS[i];
        const bytes = encodePiecePositionsSimple(deltaBitboards[p]);
        if (bytes.length === 0) continue;
        const lenVar = encodeVarUint(bytes.length);
        size += lenVar.length + bytes.length;
    }
    return size;
}

function calculateOptimalDelta(currentBitboards) {
    let bestDelta = null;
    let bestSize = Infinity;
    let bestMode = "";
    let bestModeIndex = -1;

    // Candidate 1: delta from start
    const deltaFromStart = {};
    for (const piece of PIECE_SYMBOLS) deltaFromStart[piece] = currentBitboards[piece] ^ START_BITBOARDS[piece];
    const startSize = simulatePackedDeltaSize(deltaFromStart);
    if (startSize < bestSize) {
        bestSize = startSize; bestDelta = deltaFromStart; bestMode = 'Delta from Start'; bestModeIndex = 0;
    }
    // Candidate 2: raw (delta from empty)
    const deltaFromEmpty = {};
    for (const piece of PIECE_SYMBOLS) deltaFromEmpty[piece] = currentBitboards[piece] ^ EMPTY_BITBOARDS[piece];
    const emptySize = simulatePackedDeltaSize(deltaFromEmpty);
    if (emptySize < bestSize) {
        bestSize = emptySize; bestDelta = deltaFromEmpty; bestMode = 'Raw Bitboards'; bestModeIndex = 1;
    }
    // Candidate 3: from common patterns
    for (let i = 0; i < COMMON_BITBOARDS.length; i++) {
        const deltaFromPattern = {};
        for (const piece of PIECE_SYMBOLS) deltaFromPattern[piece] = currentBitboards[piece] ^ COMMON_BITBOARDS[i][piece];
        const s = simulatePackedDeltaSize(deltaFromPattern);
        if (s < bestSize) { bestSize = s; bestDelta = deltaFromPattern; bestMode = `Delta from Pattern ${i}`; bestModeIndex = 2 + i; }
    }
    return { delta: bestDelta, mode: bestMode, size: bestSize, modeIndex: bestModeIndex };
}

// --- BASE64 (URL-SAFE) ---
const BASE64_MAP = new Map();
for (let i = 0; i < BASE64_CHARS.length; i++) BASE64_MAP.set(BASE64_CHARS[i], i);
function base64EncodeBytes(data) {
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
function base64DecodeToBytes(str) {
    const result = [];
    let i = 0;
    for (i = 0; i + 3 < str.length; i += 4) {
        const a = BASE64_MAP.has(str[i]) ? BASE64_MAP.get(str[i]) : null;
        const b = BASE64_MAP.has(str[i + 1]) ? BASE64_MAP.get(str[i + 1]) : null;
        const c = BASE64_MAP.has(str[i + 2]) ? BASE64_MAP.get(str[i + 2]) : null;
        const d = BASE64_MAP.has(str[i + 3]) ? BASE64_MAP.get(str[i + 3]) : null;
        if (a === null || b === null || c === null || d === null) throw new Error('Invalid base64 input');
        const bitmap = (a << 18) | (b << 12) | (c << 6) | d;
        result.push((bitmap >> 16) & 255, (bitmap >> 8) & 255, bitmap & 255);
    }
    if (i < str.length) {
        const a = BASE64_MAP.has(str[i]) ? BASE64_MAP.get(str[i]) : null;
        const b = BASE64_MAP.has(str[i + 1]) ? BASE64_MAP.get(str[i + 1]) : null;
        if (a === null || b === null) throw new Error('Invalid base64 input');
        const bitmap = (a << 18) | (b << 12);
        result.push((bitmap >> 16) & 255);
        if (i + 2 < str.length) {
            const c = BASE64_MAP.has(str[i + 2]) ? BASE64_MAP.get(str[i + 2]) : null;
            if (c === null) throw new Error('Invalid base64 input');
            const fullBitmap = bitmap | (c << 6);
            result.push((fullBitmap >> 8) & 255);
        }
    }
    return new Uint8Array(result);
}

// --- MAIN COMPRESSION PIPELINE ---
function ultraCompress(fenString) {
    if (!fenString || typeof fenString !== 'string') throw new Error("Invalid FEN string provided.");
    const parts = fenString.split(' ');
    if (parts.length !== 6) throw new Error("FEN string must have 6 parts.");
    const [fenPieces, activeColor, castling, enPassant, halfmoveStr, fullmoveStr] = parts;

    // 1) Direct pattern match (fast-path)
    const patternIndex = COMMON_PATTERNS.indexOf(fenPieces);
    const flagsBase = (() => {
        let flags = 0;
        if (activeColor === 'w') flags |= 0x80;
        if (castling.includes('K')) flags |= 0x40;
        if (castling.includes('Q')) flags |= 0x20;
        if (castling.includes('k')) flags |= 0x10;
        if (castling.includes('q')) flags |= 0x08;
        if (enPassant !== '-') flags |= 0x04;
        return flags;
    })();
    const halfmove = parseInt(halfmoveStr) || 0;
    const fullmove = parseInt(fullmoveStr) || 1;

    if (patternIndex !== -1) {
        // pattern format: [0xFF, patternIndex, flags, optional enPassantByte, halfmoveVarint..., fullmoveVarint...]
        const out = [0xFF, patternIndex, flagsBase];
        if (enPassant !== '-') {
            const file = enPassant.charCodeAt(0) - 'a'.charCodeAt(0);
            const rank = parseInt(enPassant[1]) - 1;
            out.push(rank * 8 + file);
        }
        out.push(...encodeVarUint(halfmove));
        out.push(...encodeVarUint(fullmove));
        return { compressed: base64EncodeBytes(new Uint8Array(out)), mode: `Pattern Match #${patternIndex}`, algorithm: "Direct Pattern Reference", layers: ["Pattern Matching", "Base64"] };
    }

    // 2) Full compression pipeline
    const currentBitboards = fenToBitboards(fenPieces);
    const { delta, mode, modeIndex } = calculateOptimalDelta(currentBitboards);

    // Build packed-delta bytes (presence mask + per-piece lengths + piece data)
    function buildPackedDeltaBytes(deltaBitboards) {
        const out = [];
        // presence mask (12 bits, little-endian into two bytes)
        let mask = 0;
        for (let i = 0; i < PIECE_SYMBOLS.length; i++) {
            if (deltaBitboards[PIECE_SYMBOLS[i]] !== 0n) mask |= (1 << i);
        }
        out.push(mask & 0xFF, (mask >>> 8) & 0xFF);
        for (let i = 0; i < PIECE_SYMBOLS.length; i++) {
            const p = PIECE_SYMBOLS[i];
            const bytes = Array.from(encodePiecePositionsSimple(deltaBitboards[p]));
            if (bytes.length === 0) continue;
            out.push(...encodeVarUint(bytes.length));
            out.push(...bytes);
        }
        return new Uint8Array(out);
    }

    const packedDeltaBytes = buildPackedDeltaBytes(delta);
    // Build nibble board bytes
    const nibbleBoard = buildNibbleBoardFromBitboards(currentBitboards);

    // Decide which board encoding to use
    // Metadata bytes to include after header: flags (1), modeIndex(varint), optional enPassant byte, halfmove varint, fullmove varint
    const metaBytes = [];
    metaBytes.push(flagsBase);
    metaBytes.push(...encodeVarUint(modeIndex));
    if (enPassant !== '-') {
        const file = enPassant.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = parseInt(enPassant[1]) - 1;
        metaBytes.push(rank * 8 + file);
    }
    metaBytes.push(...encodeVarUint(halfmove));
    metaBytes.push(...encodeVarUint(fullmove));

    // Candidate A: nibble-board format: [0x01, ...meta..., nibble(32 bytes)]
    const nibbleCandidate = new Uint8Array([0x01, ...metaBytes, ...Array.from(nibbleBoard)]);
    // Candidate B: packed delta format: [0x02, ...meta..., packedDeltaBytes]
    const packedCandidate = new Uint8Array([0x02, ...metaBytes, ...Array.from(packedDeltaBytes)]);

    // choose smaller
    let finalBytes, chosenModeLabel;
    if (nibbleCandidate.length <= packedCandidate.length) {
        finalBytes = nibbleCandidate;
        chosenModeLabel = 'Nibble Board';
    } else {
        finalBytes = packedCandidate;
        chosenModeLabel = 'Packed Delta';
    }

    return { compressed: base64EncodeBytes(finalBytes), mode: mode + ` (${chosenModeLabel})`, algorithm: "Presence-mask + Varints + NibbleFallback", layers: ["Delta Encoding", "Varints", "Nibble-board fallback", "Base64"] };
}

// --- MAIN DECOMPRESSION ---
function ultraDecompress(compressedStr) {
    if (!compressedStr || typeof compressedStr !== 'string') throw new Error("Invalid compressed string provided.");
    const data = Array.from(base64DecodeToBytes(compressedStr));
    let ptr = 0;
    const header = data[ptr++];
    if (header === 0xFF) {
        // pattern path
        const patternIndex = data[ptr++];
        if (patternIndex < 0 || patternIndex >= COMMON_PATTERNS.length) throw new Error('Invalid pattern index');
        const flags = data[ptr++];
        let enPassant = '-';
        if (flags & 0x04) {
            const ep = data[ptr++];
            enPassant = String.fromCharCode('a'.charCodeAt(0) + (ep % 8)) + (Math.floor(ep / 8) + 1);
        }
        const { value: halfmove, newPtr: p2 } = decodeVarUint(data, ptr); ptr = p2;
        const { value: fullmove, newPtr: p3 } = decodeVarUint(data, ptr); ptr = p3;
        const activeColor = (flags & 0x80) ? 'w' : 'b';
        let castling = ((flags & 0x40) ? 'K' : '') + ((flags & 0x20) ? 'Q' : '') + ((flags & 0x10) ? 'k' : '') + ((flags & 0x08) ? 'q' : '');
        if (!castling) castling = '-';
        return [COMMON_PATTERNS[patternIndex], activeColor, castling, enPassant, halfmove.toString(), fullmove.toString()].join(' ');
    }
    if (header !== 0x01 && header !== 0x02) throw new Error('Unknown compression format');

    // read metadata
    const flags = data[ptr++];
    // modeIndex varint
    const { value: modeIndex, newPtr } = decodeVarUint(data, ptr); ptr = newPtr;
    let enPassant = '-';
    if (flags & 0x04) {
        const ep = data[ptr++];
        enPassant = String.fromCharCode('a'.charCodeAt(0) + (ep % 8)) + (Math.floor(ep / 8) + 1);
    }
    const { value: halfmove, newPtr: p2 } = decodeVarUint(data, ptr); ptr = p2;
    const { value: fullmove, newPtr: p3 } = decodeVarUint(data, ptr); ptr = p3;

    const deltaBitboards = {};
    for (const p of PIECE_SYMBOLS) deltaBitboards[p] = 0n;

    if (header === 0x01) {
        // nibble board: next 32 bytes
        const nibble = data.slice(ptr, ptr + 32);
        ptr += 32;
        // reconstruct bitboards
        for (let sq = 0; sq < 64; sq++) {
            const byteIndex = (sq >>> 1);
            const isHigh = ((sq & 1) === 0);
            const v = isHigh ? (nibble[byteIndex] >>> 4) & 0xF : (nibble[byteIndex] & 0xF);
            if (v === 0) continue;
            const piece = PIECE_SYMBOLS[v - 1];
            deltaBitboards[piece] |= (1n << BigInt(sq));
        }
    } else {
        // header === 0x02 -> packed delta
        // read presence mask 2 bytes
        const mask = data[ptr++] | (data[ptr++] << 8);
        for (let i = 0; i < PIECE_SYMBOLS.length; i++) {
            if (!(mask & (1 << i))) continue;
            // read length varint
            const { value: len, newPtr: np } = decodeVarUint(data, ptr); ptr = np;
            const pieceData = data.slice(ptr, ptr + len);
            ptr += len;
            const { bitboard } = decodePiecePositionsSimple(pieceData, 0);
            deltaBitboards[PIECE_SYMBOLS[i]] = bitboard;
        }
    }

    // reconstruct base boards
    let baseBitboards;
    if (modeIndex === 0) baseBitboards = START_BITBOARDS;
    else if (modeIndex === 1) baseBitboards = EMPTY_BITBOARDS;
    else {
        const patternIndex = modeIndex - 2;
        if (patternIndex < 0 || patternIndex >= COMMON_BITBOARDS.length) throw new Error('Invalid delta pattern index');
        baseBitboards = COMMON_BITBOARDS[patternIndex];
    }

    const originalBitboards = {};
    for (const p of PIECE_SYMBOLS) originalBitboards[p] = deltaBitboards[p] ^ baseBitboards[p];
    const fenPieces = bitboardsToFen(originalBitboards);
    const activeColor = (flags & 0x80) ? 'w' : 'b';
    let castling = ((flags & 0x40) ? 'K' : '') + ((flags & 0x20) ? 'Q' : '') + ((flags & 0x10) ? 'k' : '') + ((flags & 0x08) ? 'q' : '');
    if (!castling) castling = '-';
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
