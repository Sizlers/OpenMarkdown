# Plan

Build a pretty terminal markdown viewer using `@opentui/core` with the same theme language as `opencode` and first-class search.

## Goals

- Render markdown clearly in the terminal with polished spacing, typography, and color.
- Reuse the visual feel of `opencode` themes so the viewer feels native to that ecosystem.
- Add fast text search with highlights and match navigation.

## Scope

- Markdown rendering for headings, paragraphs, lists, links, code blocks, blockquotes, tables, and inline emphasis.
- Theme support with at least light and dark palettes modeled after `opencode`.
- Search UI with incremental filtering, match counts, next/previous navigation, and in-document highlight.
- Scroll, jump-to-match, refresh, and wrap handling for long content.

## Architecture

- Use OpenTUI for layout, input handling, and rendering.
- Keep the document model separate from the rendered view.
- Parse markdown into an intermediate AST so styling and search can operate independently.
- Track view state for scroll position, focused search term, active match index, and theme selection.

## Theme Work

- Inspect `opencode` theme tokens and reproduce the same semantic roles:
  - background, surface, border, text, muted text
  - accent, success, warning, error, info
  - code, selection, search highlight, current match
- Define themes as token maps rather than hardcoded colors in render code.
- Support runtime theme switching and a fallback default.

## Search Work

- Add `/` to open search mode.
- Add `r` to refresh the current document from disk.
- Update matches as the query changes.
- Highlight all matches and strongly mark the active match.
- Support `n` / `Shift+n` for next and previous match.
- Preserve search state when scrolling or resizing.

## Milestones

1. Scaffold the OpenTUI app and basic document viewer.
2. Implement markdown parsing and styled rendering.
3. Add theme tokens and match `opencode`-style palettes.
4. Build search input, match highlighting, and navigation.
5. Polish scrolling, wrapping, empty states, and resize behavior.
6. Test with large documents and edge cases.

## Implementation Checklist

- [ ] Set up the OpenTUI app shell and keyboard handling.
- [ ] Add file loading for local markdown paths and stdin.
- [ ] Parse markdown into a view-friendly AST or block model.
- [ ] Render block types with semantic styles.
- [ ] Add inline styling for emphasis, code, links, and highlights.
- [ ] Define shared theme tokens aligned with `opencode`.
- [ ] Implement light and dark theme palettes.
- [ ] Wire theme switching and persisted default choice.
- [ ] Add search entry mode with live query updates.
- [ ] Add a `Ctrl+P` command palette.
- [ ] Expose search, theme setting, and refresh in the palette.
- [ ] Make command execution preserve or restore view state where appropriate.
- [ ] Add `r` refresh to reload the current markdown file.
- [ ] Build global match indexing across the rendered document.
- [ ] Highlight all matches and focus the active match.
- [ ] Implement next and previous match navigation.
- [ ] Keep search results stable during scroll and resize events.
- [ ] Add empty, loading, and no-results states.
- [ ] Validate wrapping, wide code blocks, and long lines.
- [ ] Test with large markdown files and mixed content.
- [ ] Compare the final look against `opencode` screenshots or tokens.

## Risks

- Markdown rendering can get visually cluttered if too many styles compete, so semantic hierarchy matters.
- Search indexing must use the same text model as rendering or match offsets will drift.
- Terminal width changes can break layout if wrapping and scroll state are not kept in sync.

## Verification

- Open a markdown file with headings, lists, code blocks, and tables.
- Search for repeated terms and confirm counts, highlights, and navigation.
- Resize the terminal from narrow to wide and verify layout remains stable.
- Switch themes and confirm contrast and emphasis remain readable.

## Command Palette

- Add `Ctrl+P` to open a command palette.
- Include commands for search, theme setting, and refresh.
- Keep the palette keyboard-driven and fast to dismiss.
- Reuse the current view state when launching commands where possible.

## Acceptance Criteria

- A markdown file opens and renders cleanly in the terminal.
- The viewer visually matches the `opencode` style family.
- Search works across the whole document with visible match counts.
- Navigation between matches is smooth and reliable.
- The app behaves correctly on narrow and wide terminals.
