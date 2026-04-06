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

## Blockquote

> Good terminal UI should feel quick, legible, and quiet.
> Search should help you move, not interrupt you.

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
| Rendering | Working | Headings, lists, tables, and code |
| Search | In progress | Match jumping and highlighting |
| Themes | Working | Includes dark, light, and Tokyo Night |

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
