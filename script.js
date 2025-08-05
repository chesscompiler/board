import { Chess, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './chess.js';
import { encodeFenForUrl, decodeFenFromUrl } from './urlshortener.js'

const stockfish = new Worker('engine/stockfish-17-lite-single.js');
const boardElement = document.getElementById('board');
const statusMessageElement = document.getElementById('status-message');
const fenInputElement = document.getElementById('fen-input');
const newGameBtn = document.getElementById('play-bot-btn');
const evaluationBar = document.getElementById('evaluation-bar');
const evaluationScore = document.getElementById('evaluation-score');
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
const prevMoveBtn = document.getElementById('prev-move-btn');
const nextMoveBtn = document.getElementById('next-move-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const pgnInput = document.getElementById('pgn-input');
const analyzePgnBtn = document.getElementById('analyze-pgn-btn');
const analysisModal = document.getElementById('analysis-modal');
const analysisResults = document.getElementById('analysis-results');
const closeAnalysisModalBtn = document.getElementById('close-analysis-modal-btn');


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
let isAnalyzing = false; // Flag to control engine access
let isEvaluatingOnly = false;
let gameHistory = [];
let currentMoveIndex = -1;

function navigateHistory(direction) {
    if (!isGameActive) return;

    const newIndex = currentMoveIndex + direction;

    if (newIndex >= 0 && newIndex < gameHistory.length && newIndex !== currentMoveIndex) {
        currentMoveIndex = newIndex;
        const historyEntry = gameHistory[currentMoveIndex];
        
        chess.load(historyEntry.fen);
        renderBoard();
        
        prevMoveBtn.disabled = newIndex <= 0;
        nextMoveBtn.disabled = newIndex >= gameHistory.length - 1;

        if (historyEntry.evaluation !== null && historyEntry.evaluation !== undefined) {
            updateEvaluationBar(historyEntry.evaluation);
            updateStatus('Navigating history (cached).');
        } else {
            // Disable buttons during navigation to prevent race conditions
            prevMoveBtn.disabled = true;
            nextMoveBtn.disabled = true;
            
            isEvaluatingOnly = true;
            updateStatus('Navigating history...');
            stockfish.postMessage('stop'); // Stop any ongoing analysis
            stockfish.postMessage(`position fen ${historyEntry.fen}`);
            stockfish.postMessage('go depth 15');
        }
    }
}


function updateHistory(newMove = null) {
    // If we make a new move while in the middle of the history, truncate the future.
    if (currentMoveIndex < gameHistory.length - 1) {
        gameHistory = gameHistory.slice(0, currentMoveIndex + 1);
    }

    if(newMove) {
        gameHistory.push(newMove);
    }
    
    currentMoveIndex = gameHistory.length - 1;

    prevMoveBtn.disabled = currentMoveIndex <= 0;
    nextMoveBtn.disabled = true; // Nothing to go forward to yet
}

function handleBoardEdit(from, to) {
    if (from === to) return;
    const pieceToMove = chess.remove(from);
    if (pieceToMove) {
        chess.put(pieceToMove, to);
    }
    chess.setComment('Position set up manually.');
    updateHistory({fen: chess.fen(), comment: chess.getComment(), evaluation: null});
    renderBoard();
    updateStatus('Position set. Ready to play.');
}

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

 // Mobile nav toggle (from index.html)
 const menuBtn = document.getElementById('menu-toggle');
 const nav = document.getElementById('main-nav');
 const glassNav = document.querySelector('.glass-nav');
 menuBtn.addEventListener('click', () => {
     nav.classList.toggle('open');
     menuBtn.classList.toggle('open');
     document.body.classList.toggle('nav-open');
     if (window.innerWidth <= 768) {
         glassNav.classList.toggle('menu-open', nav.classList.contains('open'));
     }
 });
 // Close nav on link click (mobile)
 document.querySelectorAll('#main-nav a').forEach(link => {
     link.addEventListener('click', () => {
         nav.classList.remove('open');
         menuBtn.classList.remove('open');
         document.body.classList.remove('nav-open');
         if (window.innerWidth <= 768) {
             glassNav.classList.remove('menu-open');
         }
     });
 });

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

    const score = (evaluation / 100).toFixed(1);
    evaluationScore.textContent = score;
}

function movePiece(fromRow, fromCol, toRow, toCol) {
    const from = String.fromCharCode(97 + fromCol) + (8 - fromRow);
    const to = String.fromCharCode(97 + toCol) + (8 - toRow);
    
    if (!isGameActive) {
        handleBoardEdit(from, to);
        return;
    }

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

    updateHistory({fen: chess.fen(), move: move, evaluation: null });
    renderBoard(); // Re-render the board with the player's move
    checkGameOver();

    if(isGameActive && !chess.isGameOver()) {
        // Then, send the new position to Stockfish and ask for its move
        setTimeout(() => {
            updateStatus("I am thinking...");
            stockfish.postMessage(`position fen ${chess.fen()}`);
            stockfish.postMessage('go depth 15');
        }, 550);
    }
}

function handleAiMove(bestMove) {
    const move = chess.move(bestMove);
    updateHistory({fen: chess.fen(), move: move, evaluation: null});
    renderBoard(); // Re-render the board with the AI's move
    updateStatus('Your turn.');
    checkGameOver();

    if (isGameActive && !chess.isGameOver()) {
        isEvaluatingOnly = true;
        stockfish.postMessage(`position fen ${chess.fen()}`);
        stockfish.postMessage('go depth 15');
    }
    
    // After AI moves, check if user can go forward
    nextMoveBtn.disabled = currentMoveIndex >= gameHistory.length - 1;
}

boardElement.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('piece')) {
        if (selectedSquare) {
            selectedSquare.classList.remove('selected');
            clearValidMoveDots();
            selectedSquare = null;
        }

        const piece = e.target.dataset.piece;
        const isWhitePiece = piece === piece.toUpperCase();
        if (isGameActive && ((playerColor === WHITE && !isWhitePiece) || (playerColor === BLACK && isWhitePiece))) {
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
    if (isGameActive) {
        clearValidMoveDots();
    }
});

boardElement.addEventListener('click', (e) => {
    const square = e.target.closest('.square');
    if (!square) return;

    if (!isGameActive) {
        if (selectedSquare) {
            const fromRow = selectedSquare.dataset.row;
            const fromCol = selectedSquare.dataset.col;
            const toRow = square.dataset.row;
            const toCol = square.dataset.col;
            
            const from = String.fromCharCode(97 + parseInt(fromCol)) + (8 - parseInt(fromRow));
            const to = String.fromCharCode(97 + parseInt(toCol)) + (8 - parseInt(toRow));

            selectedSquare.classList.remove('selected');
            selectedSquare = null;
            
            handleBoardEdit(from, to);
        } else {
            const clickedPiece = chess.board()[square.dataset.row][square.dataset.col];
            if (clickedPiece) {
                selectedSquare = square;
                selectedSquare.classList.add('selected');
            }
        }
        return;
    }

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

    // If an analysis is running, ignore messages to prevent conflicts.
    if (isAnalyzing) {
        return;
    }

    if (message === 'uciok') {
        stockfish.postMessage('isready');
    }

    if (message === 'readyok') {
        stockfish.postMessage('setoption name UCI_LimitStrength value true');
        stockfish.postMessage(`setoption name UCI_Elo value 2750`);
        updateStatus('Ready to play.');
        renderBoard();
        removeSkeletons();
    }

    if (message.startsWith('bestmove')) {
        if (isEvaluatingOnly) {
            isEvaluatingOnly = false;
            // The evaluation for the current position is now cached.
            // We just need to ensure nav buttons are in the correct state.
            if (statusMessageElement.textContent.startsWith('Navigating history')) {
                updateStatus('Position loaded.');
            }
            prevMoveBtn.disabled = currentMoveIndex <= 0;
            nextMoveBtn.disabled = currentMoveIndex >= gameHistory.length - 1;
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
            if (gameHistory[currentMoveIndex]) {
                gameHistory[currentMoveIndex].evaluation = evaluation;
            }
            updateEvaluationBar(evaluation);
        } else {
            match = message.match(/score mate (-?\d+)/);
            if (match) {
                const mateIn = parseInt(match[1]);
                // A mate is a very high evaluation. Use a large number, preserving the sign.
                const evaluation = (mateIn > 0 ? 1 : -1) * (20000 - Math.abs(mateIn));
                lastEvaluation = evaluation;
                if (gameHistory[currentMoveIndex]) {
                    gameHistory[currentMoveIndex].evaluation = evaluation;
                }
                updateEvaluationBar(evaluation);
            }
        }
    }
};

function resetGame() {
    isGameActive = false;
    chess.reset();
    gameHistory = [];
    currentMoveIndex = -1;
    updateHistory({fen: chess.fen(), comment: "Initial position.", evaluation: 0});
    renderBoard();
    
    fenInputElement.value = chess.fen();
    fenInputElement.disabled = false;
    flipBoardBtn.disabled = false;
    prevMoveBtn.disabled = true;
    nextMoveBtn.disabled = true;
    
    gameOverModal.classList.add('hidden');
    newGameBtn.innerHTML = '<span class="material-icons">play_arrow</span>Play';
    
    updateStatus('Set up the board or click Play to start.');
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

function encodeFenForUrlold(fen) {
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

function decodeFenFromUrlold(encoded) {
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

        document.querySelector('.move-navigation').style.display = 'flex';
        
        if (selectedSquare) {
            selectedSquare.classList.remove('selected');
            selectedSquare = null;
        }

        // Assume player color based on board orientation.
        playerColor = isBoardFlipped ? BLACK : WHITE;

        stockfish.postMessage(`position fen ${chess.fen()}`);
        prevMoveBtn.disabled = currentMoveIndex <= 0;
        nextMoveBtn.disabled = currentMoveIndex >= gameHistory.length - 1;

        if (chess.turn() !== playerColor) {
            setTimeout(() => {
                updateStatus("I am thinking...");
                isEvaluatingOnly = false;
                stockfish.postMessage('go depth 15');
            }, 1000);
        } else {
            updateStatus('Your turn.');
        }
        newGameBtn.innerHTML = '<span class="material-icons">stop</span>Start New Game';
    } else {
        resetGame();
    }
});

prevMoveBtn.addEventListener('click', () => navigateHistory(-1));
nextMoveBtn.addEventListener('click', () => navigateHistory(1));

fenInputElement.addEventListener('change', () => {
    if (isGameActive) return;
    const fen = fenInputElement.value.trim();
    if (!fen) {
        chess.reset();
        gameHistory = [];
        currentMoveIndex = -1;
        updateHistory({fen: chess.fen(), comment: "Initial position.", evaluation: 0});
        renderBoard();
        stockfish.postMessage(`position fen ${chess.fen()}`);
        updateStatus('Ready to play.');
        return;
    }

    try {
        chess.load(fen);
        renderBoard();
        gameHistory = [];
        currentMoveIndex = -1;
        updateHistory({fen: chess.fen(), comment: "Loaded from FEN.", evaluation: null});
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

function closeModal(modal) {
    modal.classList.add('hidden');
}

closeModalBtn.addEventListener('click', () => closeModal(gameOverModal));

shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) {
        closeModal(shareModal);
    }
});

gameOverModal.addEventListener('click', (e) => {
    if (e.target === gameOverModal) {
        closeModal(gameOverModal);
    }
});

closeAnalysisModalBtn.addEventListener('click', () => closeModal(analysisModal));

analysisModal.addEventListener('click', (e) => {
    if (e.target === analysisModal) {
        closeModal(analysisModal);
    }
});

async function analyzePgn() {
    if (isGameActive) {
        alert("Please stop the current game before starting an analysis.");
        return;
    }
    const pgn = pgnInput.value.trim();
    if (!pgn) {
        updateStatus('Please paste a PGN to analyze.');
        return;
    }

    const tempChess = new Chess();
    try {
        tempChess.loadPgn(pgn, { sloppy: true });
    } catch (e) {
        updateStatus('Invalid PGN string.');
        console.error("PGN Parsing Error:", e);
        return;
    }

    const moves = tempChess.history({ verbose: true });
    
    analysisModal.classList.remove('hidden');
    analysisResults.innerHTML = `<h2>Analyzing...</h2><p>Found ${moves.length} moves. This may take a moment.</p>`;

    try {
        isAnalyzing = true; // Set a flag to block other engine commands
        const analysisData = await runFullAnalysis(moves);
        renderAnalysisReport(analysisData);
    } catch(err) {
        console.error("Analysis failed:", err);
        analysisResults.innerHTML = `<h2>Analysis Failed</h2><p>Something went wrong during the analysis. Please check the console for details.</p>`;
    } finally {
        isAnalyzing = false; // Release the lock
    }
}

function getEngineMove(fen) {
    return new Promise((resolve) => {
        let bestMove = null;
        let evaluation = null;

        const onMessage = (event) => {
            const message = event.data;
            if (message.startsWith('info') && message.includes('score cp')) {
                const match = message.match(/score cp (-?\d+)/);
                if (match) {
                    evaluation = parseInt(match[1]);
                }
            } else if (message.startsWith('info') && message.includes('score mate')) {
                const match = message.match(/score mate (-?\d+)/);
                if (match) {
                    const mateIn = parseInt(match[1]);
                    evaluation = (mateIn > 0 ? 1 : -1) * (20000 - Math.abs(mateIn));
                }
            } else if (message.startsWith('bestmove')) {
                bestMove = message.split(' ')[1];
                stockfish.removeEventListener('message', onMessage);
                resolve({ evaluation, bestMove });
            }
        };
        stockfish.addEventListener('message', onMessage);
        stockfish.postMessage('stop');
        stockfish.postMessage(`position fen ${fen}`);
        stockfish.postMessage('go depth 15');
    });
}

async function runFullAnalysis(moves) {
    let playerAccuracy = { w: { total: 0, count: 0 }, b: { total: 0, count: 0 } };
    const analysisResults = [];
    const game = new Chess();

    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const player = move.color;
        const prevFen = game.fen();
        
        // Get engine eval for the position BEFORE the user's move
        const engineAnalysisBefore = await getEngineMove(prevFen);
        const engineEvalBefore = engineAnalysisBefore.evaluation;
        const bestMove = engineAnalysisBefore.bestMove;

        // Make the user's move and get the eval AFTER
        game.move(move.san);
        const userMoveFen = game.fen();
        const engineAnalysisAfter = await getEngineMove(userMoveFen);
        const userMoveEval = engineAnalysisAfter.evaluation;
        
        const evalLoss = (engineEvalBefore - userMoveEval) * (player === 'w' ? 1 : -1);
        const accuracy = 100 * Math.exp(-0.004 * evalLoss);
        
        playerAccuracy[player].total += accuracy;
        playerAccuracy[player].count++;

        analysisResults.push({
            move: move,
            fen: userMoveFen,
            accuracy: accuracy,
            evalLoss: evalLoss,
            bestMove: bestMove
        });
        
        // Update progress
        analysisResults.innerHTML = `<h2>Analyzing...</h2><p>Move ${i + 1} of ${moves.length} analyzed.</p>`;
    }

    return {
        results: analysisResults,
        accuracy: {
            w: playerAccuracy.w.count > 0 ? playerAccuracy.w.total / playerAccuracy.w.count : 100,
            b: playerAccuracy.b.count > 0 ? playerAccuracy.b.total / playerAccuracy.b.count : 100
        }
    };
}

function classifyMove(evalLoss) {
    if (evalLoss <= 10) return { text: "Best", icon: "⭐" };
    if (evalLoss <= 25) return { text: "Excellent", icon: "👍" };
    if (evalLoss <= 50) return { text: "Good", icon: "✔️" };
    if (evalLoss <= 100) return { text: "Inaccuracy", icon: " ?! " };
    if (evalLoss <= 200) return { text: "Mistake", icon: "?" };
    return { text: "Blunder", icon: "??", san: "" };
}

function renderAnalysisReport(analysisData) {
    let reportHtml = `
        <div class="analysis-summary">
            <div class="accuracy-score">
                White Accuracy
                <div class="score">${analysisData.accuracy.w.toFixed(1)}</div>
            </div>
            <h2>Game Report</h2>
            <div class="accuracy-score">
                Black Accuracy
                <div class="score">${analysisData.accuracy.b.toFixed(1)}</div>
            </div>
        </div>
    `;

    analysisData.results.forEach((result, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const turnIndicator = index % 2 === 0 ? '.' : '...';
        const classification = classifyMove(result.evalLoss);

        reportHtml += `
            <div class="move-analysis-item" data-fen="${result.fen}">
                <div class="move-number">${moveNumber}${turnIndicator}</div>
                <div class="move-notation">${result.move.san}</div>
                <div class="move-classification-icon">${classification.icon}</div>
                <div class="move-classification-text">${classification.text}</div>
            </div>
        `;
    });

    analysisResults.innerHTML = reportHtml;

    document.querySelectorAll('.move-analysis-item').forEach(item => {
        item.addEventListener('click', () => {
            const fen = item.dataset.fen;
            if (fen) {
                isGameActive = false; // Ensure we are not in "play" mode
                chess.load(fen);
                renderBoard();
                updateStatus('Position loaded from analysis.');
                closeModal(analysisModal);
            }
        });
    });
}

analyzePgnBtn.addEventListener('click', analyzePgn);


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