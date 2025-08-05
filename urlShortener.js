// FEN URL Shortener Library (Advanced Hybrid Huffman + RLE)
// Exports: encodeFenForUrl, decodeFenFromUrl

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// --- Advanced Piece Codes (short, can be optimized further with frequency analysis) ---
const PIECE_CODES = {
    'P': '000', 'N': '001', 'B': '010', 'R': '011',
    'Q': '100', 'K': '101',
    'p': '110', 'n': '1110', 'b': '11110', 'r': '111110',
    'q': '1111110', 'k': '1111111'
};
const PIECE_CODES_REVERSE = {};
for (const [k, v] of Object.entries(PIECE_CODES)) PIECE_CODES_REVERSE[v] = k;

function encodePlacement(placement) {
    let bits = '';
    for (const char of placement.replace(/\//g, '')) {
        if (char >= '1' && char <= '8') {
            bits += '0'; // RLE flag
            bits += (parseInt(char) - 1).toString(3).padStart(3, '0'); // 3 bits for 1–8
        } else {
            bits += '1'; // Piece flag
            bits += PIECE_CODES[char];
        }
    }
    return bits;
}

function decodePlacement(bits) {
    let i = 0, placement = '', file = 0;
    while (file < 64) {
        if (bits[i++] === '0') {
            const run = parseInt(bits.slice(i, i+3), 3) + 1;
            placement += run;
            file += run;
            i += 3;
        } else {
            // Find matching piece code (longest match first)
            let found = false;
            for (let len = 7; len >= 3; len--) {
                const code = bits.slice(i, i+len);
                if (PIECE_CODES_REVERSE[code]) {
                    placement += PIECE_CODES_REVERSE[code];
                    file++;
                    i += len;
                    found = true;
                    break;
                }
            }
            if (!found) {
                // Try 3-bit codes
                const code = bits.slice(i, i+3);
                if (PIECE_CODES_REVERSE[code]) {
                    placement += PIECE_CODES_REVERSE[code];
                    file++;
                    i += 3;
                    found = true;
                }
            }
            if (!found) throw new Error('Invalid piece code');
        }
        if (file % 8 === 0 && file < 64) placement += '/';
    }
    return placement;
}

function encodeFenForUrl(fen) {
    const [placement, turn, castling, enpassant, halfmove, fullmove] = fen.split(' ');
    let bits = '';

    // --- Metadata Packing ---
    // Turn: 1 bit
    bits += (turn === 'w' ? '0' : '1');

    // Castling: 4 bits (KQkq order)
    let castlingBits = 0;
    if (castling.includes('K')) castlingBits |= 8;
    if (castling.includes('Q')) castlingBits |= 4;
    if (castling.includes('k')) castlingBits |= 2;
    if (castling.includes('q')) castlingBits |= 1;
    bits += castlingBits.toString(2).padStart(4, '0');

    // En passant: 6 bits (3 bits file, 1 bit rank, 2 bits for none)
    if (enpassant === '-') {
        bits += '111111'; // Special code for no en passant
    } else {
        const file = enpassant.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
        const rank = enpassant[1] === '6' ? '1' : '0'; // Only 3 or 6 are possible
        bits += file.toString(2).padStart(3, '0') + rank + '00';
    }

    // Halfmove clock: 6 bits (0-63)
    bits += Math.min(parseInt(halfmove), 63).toString(2).padStart(6, '0');

    // Fullmove number: 8 bits (0-255)
    bits += Math.min(parseInt(fullmove), 255).toString(2).padStart(8, '0');

    // --- Placement ---
    bits += encodePlacement(placement);

    // Pad to multiple of 6 for Base64
    while (bits.length % 6 !== 0) bits += '0';

    let encoded = '';
    for (let i = 0; i < bits.length; i += 6) {
        const chunk = bits.substr(i, 6);
        encoded += BASE64_CHARS[parseInt(chunk, 2)];
    }
    return encoded;
}

function decodeFenFromUrl(encoded) {
    let bits = '';
    for (const char of encoded) {
        const index = BASE64_CHARS.indexOf(char);
        if (index === -1) throw new Error('Invalid character in encoded FEN: ' + char);
        bits += index.toString(2).padStart(6, '0');
    }
    let pointer = 0;
    const read = (len) => bits.slice(pointer, pointer += len);

    // --- Metadata ---
    const turn = read(1) === '0' ? 'w' : 'b';
    const castlingBits = parseInt(read(4), 2);
    let castling = '';
    if (castlingBits & 8) castling += 'K';
    if (castlingBits & 4) castling += 'Q';
    if (castlingBits & 2) castling += 'k';
    if (castlingBits & 1) castling += 'q';
    if (castling === '') castling = '-';

    const epBits = read(6);
    let enpassant = '-';
    if (epBits !== '111111') {
        const file = parseInt(epBits.slice(0, 3), 2);
        const rank = epBits[3] === '1' ? '6' : '3';
        enpassant = String.fromCharCode('a'.charCodeAt(0) + file) + rank;
    }

    const halfmove = parseInt(read(6), 2).toString();
    const fullmove = parseInt(read(8), 2).toString();

    // --- Placement ---
    const placementBits = bits.slice(pointer);
    const placement = decodePlacement(placementBits);

    return [placement, turn, castling, enpassant, halfmove, fullmove].join(' ');
}

// Export for browser and module usage
if (typeof window !== 'undefined') {
    window.encodeFenForUrl = encodeFenForUrl;
    window.decodeFenFromUrl = decodeFenFromUrl;
}

export { encodeFenForUrl, decodeFenFromUrl };