/* main.js - Chess Analysis & Play with Stockfish engine in Web Worker */

// GLOBAL STATE
let board = null;          // chessboard.js instance
let game = new Chess();    // chess.js game logic
let engine = null;         // Stockfish web worker
let isAnalyzing = false;   // continuous analysis flag
let isPlaying = false;     // playing vs engine flag
let engineDepth = 15;      // default search depth
let playerColor = 'white'; // human plays as white by default

// Helper for URL FEN compression
const compressFen = (fen) => LZString.compressToEncodedURIComponent(fen);
const decompressFen = (enc) => LZString.decompressFromEncodedURIComponent(enc);

/* -------------------- INIT -------------------- */
window.addEventListener('DOMContentLoaded', () => {
    // Load FEN from URL param if present
    const urlFen = (() => {
        const p = new URLSearchParams(window.location.search);
        const param = p.get('fen');
        if (!param) return null;

        // Try decompress first, fallback to raw FEN
        const decoded = decompressFen(param) || decodeURIComponent(param);
        return decoded;
    })();

    if (urlFen) {
        try { game.load(urlFen); } catch (_) { /* ignore invalid */ }
    }

    initBoard();
    initEngine();
    bindUI();
});

function initBoard() {
    board = Chessboard('board', {
        draggable: true,
        position: game.fen(),
        sparePieces: true, // allow editing
        onDrop: onPieceDrop,
        onChange: onBoardChange
    });

    // Update FEN textarea initially
    document.getElementById('fen-input').value = game.fen();
}

function initEngine() {
    // Use CDN hosted Stockfish WASM build
    // The wasm.js script spawns a worker when imported via Worker constructor
    const enginePath = 'https://cdn.jsdelivr.net/npm/stockfish@16/stockfish.wasm.js';
    engine = new Worker(enginePath);

    engine.onmessage = (e) => {
        const line = typeof e === 'string' ? e : e.data;
        handleEngineMessage(line);
    };

    sendCmd('uci');
    sendCmd('isready');
}

function bindUI() {
    const $ = (id) => document.getElementById(id);

    // Board buttons
    $('flip-btn').addEventListener('click', () => board.flip());
    $('reset-btn').addEventListener('click', () => {
        stopAnalysis();
        stopPlaying();
        game.reset();
        board.position('start');
        $('fen-input').value = game.fen();
    });
    $('clear-btn').addEventListener('click', () => {
        stopAnalysis();
        stopPlaying();
        game.clear();
        board.position({});
        $('fen-input').value = game.fen();
    });

    // FEN load
    $('load-fen-btn').addEventListener('click', () => {
        const fen = $('fen-input').value.trim();
        if (game.load(fen)) {
            board.position(fen);
        } else {
            alert('Invalid FEN');
        }
    });

    // Share link button
    $('share-link-btn').addEventListener('click', () => {
        const fen = game.fen();
        const encoded = compressFen(fen);
        const shareUrl = `${window.location.origin}${window.location.pathname}?fen=${encoded}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('Shareable link copied to clipboard!');
        }).catch(() => {
            prompt('Copy this link:', shareUrl);
        });
    });

    // Analyze buttons
    $('analyze-btn').addEventListener('click', () => startAnalysis());
    $('stop-analyze-btn').addEventListener('click', () => stopAnalysis());

    // Play buttons
    $('play-btn').addEventListener('click', () => startPlaying());
    $('stop-play-btn').addEventListener('click', () => stopPlaying());
}

/* -------------------- BOARD EVENTS -------------------- */
function onPieceDrop(source, target) {
    // Disallow illegal moves when game logic is active (playing vs engine)
    if (isPlaying) {
        const moveObj = game.move({ from: source, to: target, promotion: 'q' });
        if (moveObj === null) return 'snapback';
        // Valid move, update board FEN and send to engine
        afterMoveActions();
    } else {
        // In editing mode we accept any drop
    }
}

function onBoardChange() {
    // Sync chess.js with board when not playing
    if (!isPlaying) {
        const fen = board.fen();
        game.load(fen);
        document.getElementById('fen-input').value = fen;
        if (isAnalyzing) {
            analyzePositionOnce();
        }
    }
}

/* -------------------- ANALYZE MODE -------------------- */
function startAnalysis() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    toggleAnalyzeButtons(true);
    analyzePositionLoop();
}

function stopAnalysis() {
    if (!isAnalyzing) return;
    isAnalyzing = false;
    toggleAnalyzeButtons(false);
    sendCmd('stop');
    setEvalText('--');
}

function analyzePositionLoop() {
    if (!isAnalyzing) return;
    analyzePositionOnce();
    // Re-run every 1.5 seconds
    setTimeout(analyzePositionLoop, 1500);
}

function analyzePositionOnce() {
    const fen = game.fen();
    sendCmd(`position fen ${fen}`);
    sendCmd(`go depth ${engineDepth}`);
}

function toggleAnalyzeButtons(running) {
    document.getElementById('analyze-btn').classList.toggle('hidden', running);
    document.getElementById('stop-analyze-btn').classList.toggle('hidden', !running);
}

/* -------------------- PLAY VS ENGINE -------------------- */
function startPlaying() {
    if (isPlaying) return;
    stopAnalysis();
    isPlaying = true;
    togglePlayButtons(true);

    // Decide side randomly or default white
    playerColor = 'white';
    game.reset();
    board.orientation(playerColor);
    board.position('start');
    document.getElementById('fen-input').value = game.fen();

    if (playerColor === 'black') {
        // Engine plays first
        requestEngineMove();
    }
}

function stopPlaying() {
    if (!isPlaying) return;
    isPlaying = false;
    togglePlayButtons(false);
    sendCmd('stop');
}

function togglePlayButtons(running) {
    document.getElementById('play-btn').classList.toggle('hidden', running);
    document.getElementById('stop-play-btn').classList.toggle('hidden', !running);
}

function afterMoveActions() {
    document.getElementById('fen-input').value = game.fen();
    setEvalText('--');
    // Request engine reply move
    requestEngineMove();
}

function requestEngineMove() {
    const fen = game.fen();
    sendCmd(`position fen ${fen}`);
    sendCmd(`go depth ${engineDepth}`);
}

/* -------------------- ENGINE COMMUNICATION -------------------- */
function sendCmd(cmd) {
    engine.postMessage(cmd);
}

function handleEngineMessage(line) {
    // Debug: console.log(line);
    if (line.startsWith('info depth')) {
        parseEvaluation(line);
        appendEngineOutput(line);
    } else if (line.startsWith('bestmove')) {
        const best = line.split(' ')[1];
        if (isPlaying && best !== '(none)') {
            makeEngineMove(best);
        }
    } else if (line === 'readyok' || line.startsWith('uciok')) {
        // ignore
    } else {
        appendEngineOutput(line);
    }
}

function makeEngineMove(bestmove) {
    const from = bestmove.substring(0, 2);
    const to = bestmove.substring(2, 4);
    const promotion = bestmove.length === 5 ? bestmove[4] : undefined;

    game.move({ from, to, promotion });
    board.position(game.fen());
    document.getElementById('fen-input').value = game.fen();

    // After engine move human plays again; if analysis active, update
    if (isAnalyzing) analyzePositionOnce();
}

/* -------------------- UI HELPERS -------------------- */
function appendEngineOutput(text) {
    const out = document.getElementById('engine-output');
    out.textContent += text + '\n';
    out.scrollTop = out.scrollHeight;
}

function setEvalText(val) {
    document.getElementById('eval').textContent = `Eval: ${val}`;
}

function parseEvaluation(infoLine) {
    // Example: info depth 15 score cp 34 ... or score mate n
    const parts = infoLine.split(' ');
    const scoreIdx = parts.indexOf('score');
    if (scoreIdx !== -1 && scoreIdx + 2 < parts.length) {
        const type = parts[scoreIdx + 1];
        const value = parts[scoreIdx + 2];
        let display;
        if (type === 'cp') {
            display = (value / 100).toFixed(2);
        } else if (type === 'mate') {
            display = `Mate in ${value}`;
        }
        if (display) setEvalText(display);
    }
}