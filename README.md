# Chess Analysis Web App

This small static web application provides an interactive chess board for analyzing positions, editing the board, or playing against the Stockfish chess engine directly in your browser.

## Features

* Drag-and-drop chessboard (powered by **chessboard.js**)
* Full move-legality and game state tracking (via **chess.js**)
* Embedded **Stockfish** engine running inside a Web Worker (no server needed)
* Continuous analysis mode with live evaluation display
* Board editor: add/remove pieces, load any FEN, clear board, flip board
* Play against the engine (you as White by default)
* Clean UI – no build step, just open the page in any modern browser

## Getting started

1. Clone or download this repository.
2. Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari). That’s it!

No build process or web-server is required because all dependencies are loaded from CDNs and the engine runs completely in-browser using WebAssembly.

If you prefer to serve the files locally (recommended for mobile browsers or strict CORS settings):

```bash
python3 -m http.server 8000
```

Then navigate to http://localhost:8000 in your browser.

## Project structure

```
/               – root folder
├─ index.html    – main web page & UI layout
├─ main.js       – application logic (board ↔ engine glue code)
└─ README.md     – this file
```

## Tech stack & licenses

| Library         | License | CDN link |
|-----------------|---------|----------|
| chessboard.js   | MIT     | https://cdnjs.cloudflare.com/ajax/libs/chessboard-js/1.0.0/chessboard-1.0.0.min.js |
| chess.js        | MIT     | https://cdnjs.cloudflare.com/ajax/libs/chess.js/1.0.0/chess.min.js |
| Stockfish WASM  | GPL v3  | https://cdn.jsdelivr.net/npm/stockfish@16/stockfish.wasm.js |

All third-party libraries are fetched directly from the respective public CDNs – no files are bundled in the repo.

## Customization

* **Search depth** – edit the `engineDepth` constant in `main.js`.
* **Player side** – change `playerColor` in `startPlaying()` or extend the UI to let the user choose.
* **Styling** – tweak the CSS section in `index.html`.

Feel free to fork and extend – pull requests are welcome!