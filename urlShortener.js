// FEN URL Shortener Library
// Exports: encodeFenForUrl, decodeFenFromUrl

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const FEN_PIECE_MAP = {
    'p': 1, 'n': 2, 'b': 3, 'r': 4, 'q': 5, 'k': 6,
    'P': 7, 'N': 8, 'B': 9, 'R': 10, 'Q': 11, 'K': 12
};
const FEN_PIECE_MAP_REV = Object.fromEntries(Object.entries(FEN_PIECE_MAP).map(a => a.reverse()));

function encodeFenForUrl(fen) {
    const [placement, turn, castling, enpassant, halfmove, fullmove] = fen.split(' ');
    let binaryString = '';
    // Turn: 1 bit
    binaryString += (turn === 'w' ? '0' : '1');
    // Castling: 4 bits
    let castlingBits = 0;
    if (castling.includes('K')) castlingBits |= 8;
    if (castling.includes('Q')) castlingBits |= 4;
    if (castling.includes('k')) castlingBits |= 2;
    if (castling.includes('q')) castlingBits |= 1;
    binaryString += castlingBits.toString(2).padStart(4, '0');
    // En Passant: 7 bits
    if (enpassant === '-') {
        binaryString += '1111111';
    } else {
        const file = enpassant.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = parseInt(enpassant[1]) - 1;
        const squareIndex = rank * 8 + file;
        binaryString += squareIndex.toString(2).padStart(7, '0');
    }
    // Halfmove clock: 7 bits
    binaryString += parseInt(halfmove).toString(2).padStart(7, '0');
    // Fullmove number: 10 bits
    binaryString += parseInt(fullmove).toString(2).padStart(10, '0');
    // Piece placement: 1 bit prefix (0 for piece, 1 for empty) + data
    for (const char of placement.replace(/\//g, '')) {
        if (isNaN(parseInt(char))) {
            binaryString += '0' + FEN_PIECE_MAP[char].toString(2).padStart(4, '0');
        } else {
            binaryString += '1' + (parseInt(char) - 1).toString(2).padStart(3, '0');
        }
    }
    // Pad to multiple of 6
    while (binaryString.length % 6 !== 0) {
        binaryString += '0';
    }
    let encoded = '';
    for (let i = 0; i < binaryString.length; i += 6) {
        const chunk = binaryString.substr(i, 6);
        encoded += BASE64_CHARS[parseInt(chunk, 2)];
    }
    return encoded;
}

function decodeFenFromUrl(encoded) {
    let binaryString = '';
    for (const char of encoded) {
        const index = BASE64_CHARS.indexOf(char);
        if (index === -1) {
            console.error('Invalid character in encoded FEN:', char);
            return null;
        }
        binaryString += index.toString(2).padStart(6, '0');
    }
    let pointer = 0;
    const read = (len) => {
        const data = binaryString.substr(pointer, len);
        pointer += len;
        return data;
    };
    const turn = read(1) === '0' ? 'w' : 'b';
    const castlingBits = parseInt(read(4), 2);
    let castling = '';
    if (castlingBits & 8) castling += 'K';
    if (castlingBits & 4) castling += 'Q';
    if (castlingBits & 2) castling += 'k';
    if (castlingBits & 1) castling += 'q';
    if (castling === '') castling = '-';
    const epBits = read(7);
    let enpassant = '-';
    if (epBits !== '1111111') {
        const squareIndex = parseInt(epBits, 2);
        const rank = Math.floor(squareIndex / 8) + 1;
        const file = String.fromCharCode('a'.charCodeAt(0) + (squareIndex % 8));
        enpassant = file + rank;
    }
    const halfmove = parseInt(read(7), 2).toString();
    const fullmove = parseInt(read(10), 2).toString();
    let placement = '';
    let totalSquares = 0;
    let file = 0;
    while (totalSquares < 64) {
        // Stop if not enough bits for a token, we are in the padding
        if (pointer > binaryString.length - 4) {
            break;
        }
        const isEmpties = read(1) === '1';
        if (isEmpties) {
            const numEmpties = parseInt(read(3), 2) + 1;
            placement += numEmpties;
            file += numEmpties;
            totalSquares += numEmpties;
        } else {
            const pieceIndex = parseInt(read(4), 2);
            if (FEN_PIECE_MAP_REV[pieceIndex]) {
                placement += FEN_PIECE_MAP_REV[pieceIndex];
                file++;
                totalSquares++;
            } else {
                // Invalid piece index, must be padding.
                break;
            }
        }
        if (file === 8 && totalSquares < 64) {
            placement += '/';
            file = 0;
        }
    }
    return [placement, turn, castling, enpassant, halfmove, fullmove].join(' ');
}

// Export for browser and module usage
if (typeof window !== 'undefined') {
    window.encodeFenForUrl = encodeFenForUrl;
    window.decodeFenFromUrl = decodeFenFromUrl;
}

export { encodeFenForUrl, decodeFenFromUrl };
