import { Chess, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from '/chess.js';

const stockfish = new Worker('engine/stockfish-17-lite-single.js');
const boardElement = document.getElementById('board');
const statusMessageElement = document.getElementById('status-message');
const fenInputElement = document.getElementById('fen-input');
const newGameBtn = document.getElementById('play-bot-btn');
const evaluationBar = document.getElementById('evaluation-bar');
const eloSlider = document.getElementById('elo-slider');
const eloValue = document.getElementById('elo-value');
const flipBoardBtn = document.getElementById('flip-board-btn');
const gameSetupControls = document.getElementById('game-setup-controls');
const gameOverModal = document.getElementById('game-over-modal');
const gameOverMessage = document.getElementById('game-over-message');
const playAgainBtn = document.getElementById('play-again-btn');
const shareBtn = document.getElementById('share-btn');
const shareModal = document.getElementById('share-modal');
const shareLinkInput = document.getElementById('share-link-input');
const copyLinkBtn = document.getElementById('copy-link-btn');
const botAvatar = document.getElementById('bot-avatar');


const pieceImages = {
    [PAWN.toLowerCase()]: 'https://chesscompiler.github.io/assests/bP.svg',
    [PAWN.toUpperCase()]: 'https://chesscompiler.github.io/assests/wP.svg',
    [ROOK.toLowerCase()]: 'https://chesscompiler.github.io/assests/bR.svg',
    [ROOK.toUpperCase()]: 'https://chesscompiler.github.io/assests/wR.svg',
    [KNIGHT.toLowerCase()]: 'https://chesscompiler.github.io/assests/bN.svg',
    [KNIGHT.toUpperCase()]: 'https://chesscompiler.github.io/assests/wN.svg',
    [BISHOP.toLowerCase()]: 'https://chesscompiler.github.io/assests/bB.svg',
    [BISHOP.toUpperCase()]: 'https://chesscompiler.github.io/assests/wB.svg',
    [QUEEN.toLowerCase()]: 'https://chesscompiler.github.io/assests/bQ.svg',
    [QUEEN.toUpperCase()]: 'https://chesscompiler.github.io/assests/wQ.svg',
    [KING.toLowerCase()]: 'https://chesscompiler.github.io/assests/bK.svg',
    [KING.toUpperCase()]: 'https://chesscompiler.github.io/assests/wK.svg'
};

const chess = new Chess();

let board = [];
let draggedPiece = null;
let draggedPieceElement = null;
let selectedSquare = null;
let lastEvaluation = 0;
let isBoardFlipped = false;
let playerColor = WHITE;
let isGameActive = false;
let isEvaluatingOnly = false;

function renderBoard() {
    const board = chess.board();
    //console.log('Board array from chess.board():', board);
    boardElement.innerHTML = '';
    
    const ranks = '87654321';
    const files = 'abcdefgh';

    const boardRows = isBoardFlipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
    const boardCols = isBoardFlipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];

    for (const i of boardRows) {
        for (const j of boardCols) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((i + j) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = i;
            square.dataset.col = j;

            const rankCoordFile = isBoardFlipped ? 7 : 0;
            const fileCoordRank = isBoardFlipped ? 0 : 7;

            if (j === rankCoordFile) {
                const rank = document.createElement('div');
                rank.classList.add('coords', 'ranks');
                rank.textContent = ranks[i];
                square.appendChild(rank);
            }
            if (i === fileCoordRank) {
                const file = document.createElement('div');
                file.classList.add('coords', 'files');
                file.textContent = files[j];
                square.appendChild(file);
            }

            const piece = board[i][j];
            if (piece) {
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                const pieceChar = piece.color === WHITE ? piece.type.toUpperCase() : piece.type.toLowerCase();
                pieceElement.style.backgroundImage = `url(${pieceImages[pieceChar]})`;
                pieceElement.draggable = true;
                pieceElement.dataset.piece = pieceChar;
                square.appendChild(pieceElement);
            }
            boardElement.appendChild(square);
        }
    }
    boardElement.parentElement.classList.toggle('is-flipped', isBoardFlipped);
    fenInputElement.value = chess.fen();
    clearValidMoveDots();
    if (selectedSquare) {
        showValidMoves(selectedSquare.dataset.row, selectedSquare.dataset.col);
    }
}

function clearValidMoveDots() {
    const dots = document.querySelectorAll('.valid-move-dot');
    dots.forEach(dot => dot.remove());
}

function showValidMoves(row, col) {
    const from = String.fromCharCode(97 + parseInt(col)) + (8 - parseInt(row));
    const moves = chess.moves({ square: from, verbose: true });
    
    moves.forEach(move => {
        let toRow = 8 - parseInt(move.to.substring(1));
        let toCol = move.to.charCodeAt(0) - 97;
        
        const square = document.querySelector(`[data-row='${toRow}'][data-col='${toCol}']`);
        if (square) {
            const dot = document.createElement('div');
            dot.classList.add('valid-move-dot');
            square.appendChild(dot);
        }
    });
}

function updateStatus(message) {
    statusMessageElement.textContent = message;
}

function updateEvaluationBar(evaluation) {
    const maxEval = 1000;
    
    let evalForWhite = chess.turn() === WHITE ? evaluation : -evaluation;
    
    const cappedEval = Math.max(-maxEval, Math.min(maxEval, evalForWhite));
    const percentage = 50 + (cappedEval / maxEval) * 50;

    const isHorizontal = window.innerWidth <= 900;
    if (isHorizontal) {
        evaluationBar.style.width = `${percentage}%`;
        evaluationBar.style.height = '100%';
    } else {
        evaluationBar.style.height = `${percentage}%`;
        evaluationBar.style.width = '100%';
    }
}

function movePiece(fromRow, fromCol, toRow, toCol) {
    const from = String.fromCharCode(97 + fromCol) + (8 - fromRow);
    const to = String.fromCharCode(97 + toCol) + (8 - toRow);
    
    const move = chess.move({
        from: from,
        to: to,
        promotion: QUEEN // NOTE: always promote to a queen for simplicity
    });

    if (move === null) {
        // Illegal move
        // You can optionally provide feedback to the user here
        console.log('Illegal move');
        // Re-render the board to reset the piece positions
        renderBoard();
        return;
    }

    renderBoard(); // Re-render the board with the player's move
    checkGameOver();

    if(isGameActive && !chess.isGameOver()) {
        // Then, send the new position to Stockfish and ask for its move
        setTimeout(() => {
            updateStatus("I am thinking...");
            stockfish.postMessage(`position fen ${chess.fen()}`);
            stockfish.postMessage('go depth 15');
        }, 750);
    }
}

function handleAiMove(bestMove) {
    chess.move(bestMove);
    renderBoard(); // Re-render the board with the AI's move
    stockfish.postMessage(`position fen ${chess.fen()}`);
    updateStatus('Your turn.');
    checkGameOver();
}

boardElement.addEventListener('dragstart', (e) => {
    if (!isGameActive) return;
    if (e.target.classList.contains('piece')) {
        if (selectedSquare) {
            selectedSquare.classList.remove('selected');
            clearValidMoveDots();
            selectedSquare = null;
        }

        const piece = e.target.dataset.piece;
        const isWhitePiece = piece === piece.toUpperCase();
        if ((playerColor === WHITE && !isWhitePiece) || (playerColor === BLACK && isWhitePiece)) {
            return; 
        }

        draggedPieceElement = e.target;
        draggedPiece = {
            piece: e.target.dataset.piece,
            fromRow: e.target.parentElement.dataset.row,
            fromCol: e.target.parentElement.dataset.col
        };
        setTimeout(() => {
            e.target.classList.add('dragging');
        }, 0);
    }
});

boardElement.addEventListener('dragover', (e) => {
    e.preventDefault();
});

boardElement.addEventListener('drop', (e) => {
    e.preventDefault();
    if (draggedPieceElement) {
        const toSquare = e.target.closest('.square');
        if (toSquare) {
            const toRow = toSquare.dataset.row;
            const toCol = toSquare.dataset.col;
            
            if (draggedPiece.fromRow !== toRow || draggedPiece.fromCol !== toCol) {
                movePiece(parseInt(draggedPiece.fromRow), parseInt(draggedPiece.fromCol), parseInt(toRow), parseInt(toCol));
            }
        }
        draggedPieceElement.classList.remove('dragging');
        draggedPieceElement = null;
        draggedPiece = null;
    }
});

boardElement.addEventListener('dragend', (e) => {
    if (draggedPieceElement) {
        draggedPieceElement.classList.remove('dragging');
    }
    draggedPieceElement = null;
    draggedPiece = null;
    clearValidMoveDots();
});

boardElement.addEventListener('click', (e) => {
    const square = e.target.closest('.square');
    if (!square) return;

    const clickedPiece = chess.board()[square.dataset.row][square.dataset.col];
    const isWhiteTurn = chess.turn() === WHITE;

    if (selectedSquare) {
        const fromRow = selectedSquare.dataset.row;
        const fromCol = selectedSquare.dataset.col;
        const fromPiece = chess.board()[fromRow][fromCol];
        
        // If clicked on another piece of the same color, change selection
        if (clickedPiece && fromPiece && clickedPiece.color === fromPiece.color) {
            selectedSquare.classList.remove('selected');
            clearValidMoveDots();
            if (selectedSquare === square) {
                selectedSquare = null; // deselect if clicking the same square
            } else {
                selectedSquare = square;
                selectedSquare.classList.add('selected'); // select new piece
                showValidMoves(square.dataset.row, square.dataset.col);
            }
            return;
        }

        const toRow = square.dataset.row;
        const toCol = square.dataset.col;

        selectedSquare.classList.remove('selected');
        selectedSquare = null;
        clearValidMoveDots();
        
        movePiece(parseInt(fromRow), parseInt(fromCol), parseInt(toRow), parseInt(toCol));
    } else if (clickedPiece) {
        const isPieceWhite = clickedPiece.color === WHITE;

        if ((isWhiteTurn && isPieceWhite) || (!isWhiteTurn && !isPieceWhite)) {
            // Check if it's the player's piece
            if ((playerColor === WHITE && !isPieceWhite) || (playerColor === BLACK && isPieceWhite)) {
                return;
            }
            selectedSquare = square;
            selectedSquare.classList.add('selected');
            showValidMoves(square.dataset.row, square.dataset.col);
        }
    }
});

stockfish.onmessage = (event) => {
    const message = event.data;
    //console.log(message);

    if (message === 'uciok') {
        stockfish.postMessage('isready');
    }

    if (message === 'readyok') {
        stockfish.postMessage('setoption name UCI_LimitStrength value true');
        stockfish.postMessage(`setoption name UCI_Elo value ${eloSlider.value}`);
        updateStatus('Ready to play.');
        renderBoard();
        removeSkeletons();
    }

    if (message.startsWith('bestmove')) {
        if (isEvaluatingOnly) {
            isEvaluatingOnly = false;
            updateStatus('Position loaded. Your turn.');
            return;
        }
        const bestMove = message.split(' ')[1];
        if (bestMove !== '(none)') {
            handleAiMove(bestMove);
        }
    }

    if (message.startsWith('info')) {
        let match = message.match(/score cp (-?\d+)/);
        if (match) {
            const evaluation = parseInt(match[1]);
            lastEvaluation = evaluation;
            updateEvaluationBar(evaluation);
        } else {
            match = message.match(/score mate (-?\d+)/);
            if (match) {
                const mateIn = parseInt(match[1]);
                // A mate is a very high evaluation. Use a large number, preserving the sign.
                const evaluation = (mateIn > 0 ? 1 : -1) * (20000 - Math.abs(mateIn));
                lastEvaluation = evaluation;
                updateEvaluationBar(evaluation);
            }
        }
    }
};

function resetGame() {
    isGameActive = false;
    chess.reset();
    renderBoard();
    
    fenInputElement.value = '';
    fenInputElement.disabled = false;
    flipBoardBtn.disabled = false;
    
    gameOverModal.classList.add('hidden');
    newGameBtn.innerHTML = '<span class="material-icons">play_arrow</span>Play';
    
    updateStatus('Enter a FEN or click Play to start.');
    stockfish.postMessage('stop');
    stockfish.postMessage('ucinewgame');
    stockfish.postMessage('isready');
}

function checkGameOver() {
    if (!isGameActive || !chess.isGameOver()) {
        return;
    }

    isGameActive = false;
    let message = '';
    if (chess.isCheckmate()) {
        message = `Checkmate! ${chess.turn() === WHITE ? 'Black' : 'White'} wins.`;
    } else if (chess.isDraw()) {
        message = 'Draw!';
        if(chess.isStalemate()){
            message = 'Stalemate!';
        } else if (chess.isThreefoldRepetition()){
            message = 'Draw by threefold repetition!';
        } else if (chess.isInsufficientMaterial()){
            message = 'Draw by insufficient material!';
        }
    }

    if (message) {
        gameOverMessage.textContent = message;
        gameOverModal.classList.remove('hidden');
    }
}

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

newGameBtn.addEventListener('click', () => {
    if (newGameBtn.textContent.includes('Play')) {
        isGameActive = true;
        fenInputElement.disabled = true;
        flipBoardBtn.disabled = true;
        playerColor = isBoardFlipped ? BLACK : WHITE;

        stockfish.postMessage(`position fen ${chess.fen()}`);

        if (chess.turn() !== playerColor) {
            setTimeout(() => {
                updateStatus("I am thinking...");
                isEvaluatingOnly = false;
                stockfish.postMessage('go depth 15');
            }, 1000);
        } else {
            updateStatus('Your turn.');
        }
        newGameBtn.innerHTML = '<span class="material-icons">stop</span>New Game';
    } else {
        resetGame();
    }
});

fenInputElement.addEventListener('change', () => {
    if (isGameActive) return;
    const fen = fenInputElement.value.trim();
    if (!fen) {
        chess.reset();
        renderBoard();
        stockfish.postMessage(`position fen ${chess.fen()}`);
        updateStatus('Ready to play.');
        return;
    }

    try {
        chess.load(fen);
        renderBoard();
        stockfish.postMessage(`position fen ${chess.fen()}`);
        updateStatus('Position loaded. Analyzing...');
        isEvaluatingOnly = true;
        stockfish.postMessage('go depth 15');
    } catch (e) {
        updateStatus('Invalid FEN string.');
        fenInputElement.value = chess.fen();
    }
});

eloSlider.addEventListener('input', () => {
    eloValue.textContent = eloSlider.value;
});

eloSlider.addEventListener('change', () => {
    stockfish.postMessage(`setoption name UCI_Elo value ${eloSlider.value}`);
});

window.addEventListener('resize', () => {
    updateEvaluationBar(lastEvaluation);
});

flipBoardBtn.addEventListener('click', () => {
    isBoardFlipped = !isBoardFlipped;
    renderBoard();
});

playAgainBtn.addEventListener('click', resetGame);

shareBtn.addEventListener('click', () => {
    const fen = chess.fen();
    const encodedFen = encodeFenForUrl(fen);
    const shareLink = `${window.location.origin}${window.location.pathname}?fen=${encodedFen}`;
    shareLinkInput.value = shareLink;
    shareModal.classList.remove('hidden');
});

copyLinkBtn.addEventListener('click', () => {
    shareLinkInput.select();
    document.execCommand('copy');
    copyLinkBtn.innerHTML = '<span class="material-icons">check</span>Copied!';
    setTimeout(() => {
        copyLinkBtn.innerHTML = '<span class="material-icons">content_copy</span>Copy Link';
    }, 2000);
});

shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) {
        shareModal.classList.add('hidden');
    }
});

function removeSkeletons() {
    document.querySelectorAll('.skeleton').forEach(el => {
        el.classList.remove('skeleton', 'skeleton-text', 'skeleton-bubble');
    });
}

function lazyLoadAvatar() {
    const avatar = botAvatar;
    const avatarContainer = document.getElementById('bot-avatar-container');
    if (avatar.dataset.src) {
        const tempImg = new Image();
        tempImg.src = avatar.dataset.src;
        tempImg.onload = () => {
            avatar.src = avatar.dataset.src;
            avatar.classList.add('loaded');
            avatarContainer.classList.remove('skeleton');
            avatar.removeAttribute('data-src');
        };
    }
}

function loadFenFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const fenParam = urlParams.get('fen');
    if (fenParam) {
        const decodedFen = decodeFenFromUrl(fenParam);
        if (decodedFen) {
            try {
                chess.load(decodedFen);
                fenInputElement.value = chess.fen();
                renderBoard();
                
                updateStatus('Position loaded. Analyzing...');
                isEvaluatingOnly = true;
                stockfish.postMessage(`position fen ${chess.fen()}`);
                stockfish.postMessage('go depth 15');

                if (newGameBtn.textContent.includes('Play')) {
                   // newGameBtn.click();
                }
            } catch (e) {
                updateStatus('Invalid FEN from URL.');
            }
        } else {
            updateStatus('Could not decode FEN from URL.');
        }
    }
}

// Initial setup
stockfish.postMessage('uci');
updateStatus('Initializing engine...');
window.addEventListener('load', () => {
    loadFenFromUrl();
    lazyLoadAvatar();
});