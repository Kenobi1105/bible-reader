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

The app fetches texts and language data from the relevant upstream services. Each reader footer is a link to that source's licence or terms, and the complete release record is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- NET is fetched on demand from the official NET Bible service and is never cached or bundled by this app.
- SBLGNT is fetched from the Faithlife source repository under CC BY 4.0; its required attribution remains visible in the reader.
- WLC is obtained through GetBible/CrossWire and is listed by CrossWire as public domain.
- CUV Simplified and Traditional are fetched through GetBible, whose listings identify the editions as public domain.
- The current LXX source is fetched through GetBible. Its listing permits free non-commercial distribution, so this build never caches or bundles it. Do not use that source in a commercial release without an additional rights review or a differently licensed replacement.

## Licensing and release checklist

Before a public release, retain `THIRD_PARTY_NOTICES.md`, preserve the in-app source attributions, and confirm any new text or data file against its upstream terms. Do not add NET or LXX JSON files to `public/data`. Keep the source attribution in place when modifying or redistributing the Hebrew and Greek morphology features.

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
