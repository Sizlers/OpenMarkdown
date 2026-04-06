# OpenMarkdown Sample

This file exercises a wide range of markdown elements so you can test rendering, spacing, search, navigation, and themes.

## Paragraphs

Markdown should feel comfortable to read in the terminal. This paragraph includes **bold text**, *italic text*, ~~strikethrough~~, `inline code`, and a [link to OpenTUI](https://github.com/anomalyco/opentui).

A second paragraph helps confirm vertical rhythm between blocks and heading spacing.

## Bullet Points

- First bullet item
- Second bullet item with `inline code`
- Third bullet item with **emphasis**

## Numbered List

1. Step one
2. Step two
3. Step three

## Task List

- [x] Search highlights stay aligned with rendered text
- [x] Headings feel distinct without overwhelming the page
- [ ] Keep polishing edge cases as new markdown samples appear

## Rich List Content

- Primary item with nested detail
  - Nested bullet with `inline code`
  - Nested bullet with a [reference link](https://github.com/anomalyco/opentui)
- Loose item with a follow-up paragraph

  This second paragraph should align under the item body instead of collapsing into the marker column.

- Item with quoted context
  > A note inside a list should still feel nested, not smashed against the edge.

- Item with code

  ```ts
  const nestedState = { ready: true }
  ```

## Blockquote

> Good terminal UI should feel quick, legible, and quiet.
> Search should help you move, not interrupt you.
>
> - Quotes can contain lists
> - And the structure should still read clearly

## Code Block

```ts
type ViewerState = {
  theme: string
  query: string
  activeMatchIndex: number
}

function nextIndex(current: number, total: number) {
  return total === 0 ? 0 : (current + 1) % total
}
```

## Table

| Feature | Status | Notes |
| --- | --- | --- |
| Rendering | Working | Headings, lists, tables, and `code` now hold together much better once the content stops being toy-sized and starts carrying actual explanation. |
| Search | Working | Match jumping stays aligned in rich blocks even when the rendered presentation adds decorative rails, borders, or wrapped cell content. |
| Themes | Working | Includes dark, light, and [Tokyo Night](https://github.com/enkia/tokyo-night-vscode-theme), with enough contrast to keep denser documentation comfortable to scan. |

## Dense Table

| Area | Owner | Status | Risk | Notes |
| --- | --- | --- | --- | --- |
| Rendering | Terminal UI | Working | Medium | A dense comparison table should fall back to a stacked layout before the columns get so narrow that the content becomes harder to parse than the raw markdown. |
| Search | Interaction | Working | Low | Search should still land on phrases inside the wrapped or stacked values instead of drifting because of decorative table chrome. |
| Themes | Visual Design | Working | Low | Color contrast still needs to hold up once the table turns into a list of row cards with repeated labels and longer descriptions. |

## Mixed Content

### Small Heading

Here is some body text under a smaller heading.

- Nested-feeling content is still flat markdown here
- Enough variety helps validate spacing rules

### Another Small Heading

Search terms to try:

- theme
- search
- terminal
- markdown

---

## Long Form Text

OpenMarkdown is intended to feel polished in the terminal, not merely functional. That means careful spacing, theme contrast, readable code blocks, obvious active state, and smooth navigation when jumping between search results.

## Final Notes

Use this file to test:

1. Heading spacing
2. Table rendering
3. Search hit jumping
4. Theme readability
