# openmarkdown

A polished terminal markdown viewer with search, themes, refresh, and a file picker.

`openmarkdown` is built with OpenTUI and is designed to make markdown feel good in the terminal instead of looking like a raw text dump.

## Features

- Pretty markdown rendering for headings, paragraphs, lists, quotes, code blocks, and tables
- Search with live highlighting and next/previous result navigation
- Theme support, including OpenCode-inspired themes and Tokyo Night
- File picker for browsing markdown files in the current workspace
- Refresh support for reloading the current file from disk
- Theme persistence between launches

## Install

`openmarkdown` is published on npm, but it requires Bun at runtime.

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

Install `openmarkdown` globally:

```bash
npm install -g openmarkdown
```

Or run it without a global install:

```bash
npx openmarkdown README.md
```

## Usage

Open a markdown file:

```bash
openmarkdown README.md
```

Open the sample file in this repo:

```bash
openmarkdown sample-content.md
```

Pipe markdown in from stdin:

```bash
cat README.md | openmarkdown -
```

If no file is passed, `openmarkdown` will try to open `./plan.md` and fall back to sample content if it does not exist.

## Controls

| Key | Action |
| --- | --- |
| `/` | Open search |
| `n` | Jump to next search result |
| `Shift+n` | Jump to previous search result |
| `o` | Open file picker |
| `r` | Refresh current file |
| `t` | Open theme picker |
| `Ctrl+P` | Open command palette |
| `Esc` | Close the current dialog |
| `q` | Quit |
| `Ctrl+C` | Quit |

## Themes

The viewer includes multiple built-in themes, including:

- OpenCode Dark
- OpenCode Light
- Nord
- Monokai
- Tokyo Night

Your selected theme is saved locally and restored on the next launch.

## What It Looks Like

`openmarkdown` is tuned for terminal reading rather than plain text inspection:

- stronger heading hierarchy
- styled code blocks with lightweight syntax coloring
- improved table rendering
- nested list indentation
- cleaner quote and list styling

## Development

Clone the repo and install dependencies:

```bash
npm install
```

Run the app during development:

```bash
bun run src/index.ts sample-content.md
```

Type-check the project:

```bash
npm run check
```

## Publishing

The package is published to npm and launched through a small Node wrapper that executes the app with Bun.

This repo also includes GitHub Actions workflows to:

- bump the package version on pushes to `main`
- publish new versions to npm when a new version is detected

## Repository

- GitHub: https://github.com/Sizlers/OpenMarkdown
- npm: https://www.npmjs.com/package/openmarkdown

## License

MIT
