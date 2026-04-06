import { marked } from "marked"
import { TextNodeRenderable } from "@opentui/core"
import type { Theme } from "./theme"

export type Match = { start: number; end: number; globalIndex?: number }

export type Segment = {
  text: string
  style: {
    fg?: string
    bg?: string
    attributes?: number
    link?: { url: string }
  }
}

export type MarkdownBlock = {
  id: string
  kind: string
  plainText: string
  segments: Segment[]
}

type InlineToken = {
  type?: string
  text?: string
  raw?: string
  href?: string
  tokens?: InlineToken[]
  items?: any[]
}

type BlockToken = InlineToken & {
  header?: InlineToken[]
  rows?: InlineToken[][]
  cells?: InlineToken[][]
  ordered?: boolean
  start?: number
  depth?: number
  lang?: string
  content?: string
  text?: string
}

type ListItemToken = {
  text?: string
  tokens?: InlineToken[]
}

const CODE_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "null",
  "return",
  "switch",
  "throw",
  "true",
  "try",
  "type",
  "undefined",
  "var",
  "while",
])

function baseStyle(theme: Theme): Segment["style"] {
  return { fg: theme.text }
}

function cloneStyle(style: Segment["style"]): Segment["style"] {
  return { ...style }
}

function mergeStyle(style: Segment["style"], extra: Segment["style"]): Segment["style"] {
  return { ...style, ...extra, attributes: (style.attributes ?? 0) | (extra.attributes ?? 0) }
}

function pushSegment(segments: Segment[], text: string, style: Segment["style"]): void {
  if (text.length === 0) return
  segments.push({ text, style: cloneStyle(style) })
}

function renderInlineTokens(tokens: InlineToken[] | undefined, theme: Theme, style: Segment["style"]): Segment[] {
  const segments: Segment[] = []
  if (!tokens) return segments

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        pushSegment(segments, token.text ?? "", style)
        break
      case "strong":
        segments.push(...renderInlineTokens(token.tokens, theme, mergeStyle(style, { attributes: 1 })))
        break
      case "em":
        segments.push(...renderInlineTokens(token.tokens, theme, mergeStyle(style, { attributes: 2 })))
        break
      case "codespan":
        pushSegment(
          segments,
          token.text ?? token.raw ?? "",
          mergeStyle(style, { fg: theme.accentSoft, bg: theme.codeBg, attributes: 1 }),
        )
        break
      case "link": {
        const linkStyle = mergeStyle(style, { fg: theme.accent, attributes: 4, link: { url: token.href ?? "" } })
        if (token.tokens?.length) {
          segments.push(...renderInlineTokens(token.tokens, theme, linkStyle))
        } else {
          pushSegment(segments, token.text ?? token.href ?? "", linkStyle)
        }
        break
      }
      case "del":
        segments.push(...renderInlineTokens(token.tokens, theme, mergeStyle(style, { attributes: 8 })))
        break
      case "br":
        pushSegment(segments, "\n", style)
        break
      default:
        if (token.tokens?.length) {
          segments.push(...renderInlineTokens(token.tokens, theme, style))
        } else {
          pushSegment(segments, token.text ?? token.raw ?? "", style)
        }
        break
    }
  }

  return segments
}

function flattenInlineText(tokens: InlineToken[] | undefined): string {
  if (!tokens) return ""
  let out = ""
  for (const token of tokens) {
    switch (token.type) {
      case "br":
        out += "\n"
        break
      case "strong":
      case "em":
      case "del":
      case "link":
        out += flattenInlineText(token.tokens) || token.text || token.href || ""
        break
      default:
        out += token.text ?? token.raw ?? ""
        break
    }
  }
  return out
}

function buildSearchRanges(text: string, query: string): Match[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const normalizedText = text.toLowerCase()
  const matches: Match[] = []
  let index = 0
  while (index <= normalizedText.length - normalizedQuery.length) {
    const found = normalizedText.indexOf(normalizedQuery, index)
    if (found === -1) break
    matches.push({ start: found, end: found + normalizedQuery.length })
    index = found + Math.max(1, normalizedQuery.length)
  }
  return matches
}

function applySearchHighlight(text: string, style: Segment["style"], matches: Match[], activeGlobalIndex: number, theme: Theme): Segment[] {
  if (matches.length === 0) return [{ text, style }]

  const segments: Segment[] = []
  let cursor = 0

  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ text: text.slice(cursor, match.start), style: cloneStyle(style) })
    }

    const isActive = match.globalIndex === activeGlobalIndex
    segments.push({
      text: text.slice(match.start, match.end),
      style: cloneStyle(
        mergeStyle(style, {
          fg: isActive ? theme.searchActiveText : theme.searchText,
          bg: isActive ? theme.searchActiveBg : theme.searchBg,
          attributes: 1,
        }),
      ),
    })

    cursor = match.end
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), style: cloneStyle(style) })
  }

  return segments
}

function buildTextNodeFromSegments(
  segments: Segment[],
  matches: Match[],
  activeGlobalIndex: number,
  theme: Theme,
): TextNodeRenderable {
  const root = TextNodeRenderable.fromNodes([])
  let plainOffset = 0

  for (const segment of segments) {
    const segmentText = segment.text
    const localMatches = matches
      .filter((match) => match.start < plainOffset + segmentText.length && match.end > plainOffset)
      .map((match) => ({
        start: Math.max(0, match.start - plainOffset),
        end: Math.min(segmentText.length, match.end - plainOffset),
        globalIndex: match.globalIndex,
      }))

    if (localMatches.length > 0) {
      for (const piece of applySearchHighlight(segmentText, segment.style, localMatches, activeGlobalIndex, theme)) {
        root.add(TextNodeRenderable.fromString(piece.text, piece.style))
      }
    } else {
      root.add(TextNodeRenderable.fromString(segmentText, segment.style))
    }

    plainOffset += segmentText.length
  }

  return root
}

function renderCodeContent(line: string, theme: Theme): Segment[] {
  const segments: Segment[] = []
  const pattern = /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g

  let lastIndex = 0
  for (const match of line.matchAll(pattern)) {
    const value = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      pushSegment(segments, line.slice(lastIndex, index), { fg: theme.codeText, bg: theme.codeBg })
    }

    if (value.startsWith("//") || value.startsWith("#")) {
      pushSegment(segments, value, { fg: theme.muted, bg: theme.codeBg, attributes: 2 })
    } else if (value.startsWith('"') || value.startsWith("'") || value.startsWith("`")) {
      pushSegment(segments, value, { fg: theme.success, bg: theme.codeBg })
    } else if (/^\d/.test(value)) {
      pushSegment(segments, value, { fg: theme.warning, bg: theme.codeBg })
    } else if (CODE_KEYWORDS.has(value)) {
      pushSegment(segments, value, { fg: theme.info, bg: theme.codeBg, attributes: 1 })
    } else {
      pushSegment(segments, value, { fg: theme.codeText, bg: theme.codeBg })
    }

    lastIndex = index + value.length
  }

  if (lastIndex < line.length) {
    pushSegment(segments, line.slice(lastIndex), { fg: theme.codeText, bg: theme.codeBg })
  }

  if (segments.length === 0) {
    pushSegment(segments, line, { fg: theme.codeText, bg: theme.codeBg })
  }

  return segments
}

function renderCodeBlock(token: BlockToken, theme: Theme): MarkdownBlock {
  const code = token.text ?? token.content ?? ""
  const lines = code.split("\n")
  const segments: Segment[] = []
  const langLabel = token.lang ? ` ${token.lang.toUpperCase()} ` : " CODE "
  const width = Math.max(langLabel.length + 6, ...lines.map((line) => line.length + 5), 24)
  const top = `╭${"─".repeat(Math.max(0, width - langLabel.length - 1))}${langLabel}╮`
  const bottom = `╰${"─".repeat(width)}╯`

  pushSegment(segments, top, { fg: theme.borderStrong, bg: theme.codeBg })

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = `${String(i + 1).padStart(2, "0")} `
    const lineContent = lines[i]
    const linePadding = " ".repeat(Math.max(0, width - lineNumber.length - lineContent.length))

    pushSegment(segments, `\n│ `, { fg: theme.borderStrong, bg: theme.codeBg })
    pushSegment(segments, lineNumber, { fg: theme.muted, bg: theme.codeBg })
    segments.push(...renderCodeContent(lineContent, theme))
    pushSegment(segments, linePadding, { fg: theme.codeText, bg: theme.codeBg })
    pushSegment(segments, " │", { fg: theme.borderStrong, bg: theme.codeBg })
  }

  pushSegment(segments, `\n${bottom}`, { fg: theme.borderStrong, bg: theme.codeBg })

  return { id: "block-code", kind: "code", plainText: code, segments }
}

function renderTable(token: BlockToken, theme: Theme): MarkdownBlock {
  const header = token.header?.map((cell) => flattenInlineText(cell.tokens)) ?? []
  const rows = token.rows?.map((row) => row.map((cell) => flattenInlineText(cell.tokens))) ?? []
  const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 0)
  const widths = Array.from({ length: columnCount }, (_, index) => {
    const headerWidth = header[index]?.length ?? 0
    const rowWidth = Math.max(0, ...rows.map((row) => row[index]?.length ?? 0))
    return Math.max(3, headerWidth, rowWidth)
  })

  const plainRows: string[] = []
  const segments: Segment[] = []
  const borderStyle = { fg: theme.borderStrong }

  const buildBorder = (left: string, middle: string, right: string) => {
    return `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`
  }

  const renderRow = (cells: string[], isHeader = false, rowIndex = 0) => {
    const background = isHeader ? theme.tableHeadBg : rowIndex % 2 === 0 ? theme.tableRowBg : theme.panelAlt
    const foreground = isHeader ? theme.accent : theme.text
    const prefix = segments.length > 0 ? "\n" : ""

    plainRows.push(cells.join(" "))
    pushSegment(segments, `${prefix}│`, borderStyle)

    for (let index = 0; index < widths.length; index++) {
      const width = widths[index]
      const cell = (cells[index] ?? "").padEnd(width, " ")
      pushSegment(segments, ` ${cell} `, { fg: foreground, bg: background, attributes: isHeader ? 1 : 0 })
      pushSegment(segments, "│", borderStyle)
    }
  }

  pushSegment(segments, buildBorder("┌", "┬", "┐"), borderStyle)

  if (header.length > 0) {
    renderRow(header, true)
    pushSegment(segments, `\n${buildBorder("├", "┼", "┤")}`, borderStyle)
  }

  for (let index = 0; index < rows.length; index++) {
    renderRow(rows[index], false, index)
  }

  pushSegment(segments, `\n${buildBorder("└", "┴", "┘")}`, borderStyle)

  return { id: "block-table", kind: "table", plainText: plainRows.join("\n"), segments }
}

function renderListItems(
  token: BlockToken,
  theme: Theme,
  depth: number,
  segments: Segment[],
  plain: string[],
): void {
  const items = token.items ?? []
  const indent = "  ".repeat(depth)

  items.forEach((item, index) => {
    const prefix = token.ordered ? `${(token.start ?? 1) + index}. ` : "• "
    const itemTokens = (item.tokens ?? []) as InlineToken[]
    const inlineTokens = itemTokens.filter((child: InlineToken) => child.type !== "list")
    const itemText = flattenInlineText(inlineTokens) || item.text || ""

    plain.push(`${indent}${prefix}${itemText}`)
    pushSegment(segments, `${segments.length === 0 ? "" : "\n"}${indent}`, { fg: theme.text })
    pushSegment(segments, prefix, { fg: token.ordered ? theme.info : theme.accent, attributes: 1 })
    segments.push(...renderInlineTokens(inlineTokens, theme, baseStyle(theme)))

    for (const child of itemTokens) {
      if (child.type === "list") {
        renderListItems(child as BlockToken, theme, depth + 1, segments, plain)
      }
    }
  })
}

function renderList(token: BlockToken, theme: Theme): MarkdownBlock {
  const segments: Segment[] = []
  const plain: string[] = []
  renderListItems(token, theme, 0, segments, plain)

  return { id: "block-list", kind: "list", plainText: plain.join("\n"), segments }
}

function renderQuote(token: BlockToken, theme: Theme): MarkdownBlock {
  const quoted = flattenInlineText(token.tokens) || token.text || ""
  const lines = quoted.split("\n")
  const segments: Segment[] = []
  lines.forEach((line, index) => {
    pushSegment(segments, `${index === 0 ? "" : "\n"}▎ `, { fg: theme.accent })
    pushSegment(segments, line, { fg: theme.quote, attributes: 2 })
  })
  return { id: "block-quote", kind: "quote", plainText: quoted, segments }
}

function renderParagraph(token: BlockToken, theme: Theme): MarkdownBlock {
  const text = flattenInlineText(token.tokens) || token.text || ""
  const segments = renderInlineTokens(token.tokens, theme, baseStyle(theme))
  return { id: "block-paragraph", kind: "paragraph", plainText: text, segments }
}

function renderHeading(token: BlockToken, theme: Theme): MarkdownBlock {
  const text = flattenInlineText(token.tokens) || token.text || ""
  const level = token.depth ?? 1
  const accent = level === 1 ? theme.accentSoft : level === 2 ? theme.accent : level === 3 ? theme.info : theme.text
  const segments: Segment[] = []

  if (level === 1) {
    pushSegment(segments, "◆ ", { fg: theme.accentSoft, attributes: 1 })
    segments.push(...renderInlineTokens(token.tokens, theme, { fg: accent, attributes: 1 }))
  } else if (level === 2) {
    pushSegment(segments, "◦ ", { fg: theme.accent, attributes: 1 })
    segments.push(...renderInlineTokens(token.tokens, theme, { fg: accent, attributes: 1 }))
  } else if (level === 3) {
    pushSegment(segments, "› ", { fg: theme.info, attributes: 1 })
    segments.push(...renderInlineTokens(token.tokens, theme, { fg: accent, attributes: 1 }))
  } else {
    pushSegment(segments, "· ", { fg: theme.muted, attributes: 1 })
    segments.push(...renderInlineTokens(token.tokens, theme, { fg: accent, attributes: 1 }))
  }

  return { id: `block-heading-${level}`, kind: "heading", plainText: text, segments }
}

function renderHr(theme: Theme): MarkdownBlock {
  const line = "─".repeat(56)
  return { id: "block-hr", kind: "hr", plainText: line, segments: [{ text: line, style: { fg: theme.borderStrong } }] }
}

function renderSpace(theme: Theme): MarkdownBlock {
  return { id: "block-space", kind: "space", plainText: "", segments: [] }
}

export function parseMarkdownBlocks(source: string, theme: Theme): MarkdownBlock[] {
  const tokens = marked.lexer(source, { gfm: true, breaks: false }) as BlockToken[]
  const blocks: MarkdownBlock[] = []

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        blocks.push(renderHeading(token, theme))
        break
      case "paragraph":
        blocks.push(renderParagraph(token, theme))
        break
      case "blockquote":
        blocks.push(renderQuote(token, theme))
        break
      case "list":
        blocks.push(renderList(token, theme))
        break
      case "code":
        blocks.push(renderCodeBlock(token, theme))
        break
      case "table":
        blocks.push(renderTable(token, theme))
        break
      case "hr":
        blocks.push(renderHr(theme))
        break
      case "space":
        blocks.push(renderSpace(theme))
        break
      default: {
        const fallbackText = flattenInlineText(token.tokens) || token.text || token.raw || ""
        if (fallbackText.trim().length > 0) {
          blocks.push({ id: `block-${token.type}`, kind: token.type ?? "unknown", plainText: fallbackText, segments: [{ text: fallbackText, style: baseStyle(theme) }] })
        }
      }
    }
  }

  return blocks
}

export function findMatchesInBlock(plainText: string, query: string): Match[] {
  return buildSearchRanges(plainText, query)
}

export function buildBlockRenderable(
  theme: Theme,
  block: MarkdownBlock,
  matches: Match[],
  activeGlobalIndex: number,
): TextNodeRenderable {
  return buildTextNodeFromSegments(block.segments, matches, activeGlobalIndex, theme)
}
