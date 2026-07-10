# Scripture Desk

A standalone Bible reading workspace designed for original-language reading, parallel comparison, notes, and Obsidian-friendly exports.

## What works in the first build

- NET Bible through the official online API.
- Reader tabs, split-screen reading, book/chapter/verse pickers, typed references, and verse/pericope focus.
- NET, CUV Simplified, CUV Traditional, SBLGNT, WLC, and LXX source adapters.
- Verse highlighting, bookmarks, and reference-linked notes stored in the browser.
- Rich-text note formatting plus Markdown mode.
- Markdown download, print-to-PDF export, and selected-folder saving for Obsidian-capable browsers.
- Text size, dark mode, and white/parchment/black reader canvases.

## Bible text sources

- NET uses the official NET Bible web service and must comply with its copyright terms: https://labs.bible.org/api_web_service
- WLC and LXX are configured through the GetBible API, which is sourced from CrossWire modules: https://getbible.life/docs
- SBLGNT loads from the public Faithlife source repository and is licensed CC BY 4.0. Keep the required attribution with every public release: https://github.com/LogosBible/SBLGNT
- CUV Simplified and Traditional load through GetBible. The source layer also supports approved local JSON files when offline bundling is wanted; confirm the license and required attribution before adding them to the public repository.

## Run locally

This is a dependency-free static site. From this folder, run:

~~~powershell
python -m http.server 4173
~~~

Then open http://localhost:4173.

## Deploy

Run deploy.bat and enter a commit message. It asks for a GitHub personal access token with hidden input, uses it only for that push, then clears it. It safely adds, commits, and pushes the current branch; it never force-pushes. The included GitHub Actions workflow publishes pushes to main through GitHub Pages.

Before the first public deployment, open the repository Settings, then Pages, and set the source to GitHub Actions.

## Dashboard integration

The reusable dashboard entry point is src/dashboard-adapter/BibleReaderWidget.js. The full reader is deliberately independent, so the Personal Dashboard can either link to the deployed reader or import the adapter and later share the core modules.
