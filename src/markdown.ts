import { marked } from "marked"
import { TextNodeRenderable } from "@opentui/core"
import type { Theme } from "./theme"

export type Match = { start: number; end: number; globalIndex?: number }

const TEXT_ATTRIBUTE_BOLD = 1
const TEXT_ATTRIBUTE_ITALIC = 2
const TEXT_ATTRIBUTE_UNDERLINE = 4
const TEXT_ATTRIBUTE_STRIKETHROUGH = 8

const LIST_MARKERS = ["•", "◦", "▪", "–"] as const
const TABLE_MIN_COLUMN_WIDTH = 10

export type MarkdownParseOptions = {
  maxWidth?: number
}

export type Segment = {
  text: string
  style: {
    fg?: string
    bg?: string
    attributes?: number
    link?: { url: string }
  }
  searchable?: boolean
}

export type MarkdownBlock = {
  id: string
  kind: string
  plainText: string
  segments: Segment[]
  level?: number
}

type MarkdownToken = {
  type?: string
  text?: string
  raw?: string
  href?: string
  title?: string | null
  tokens?: MarkdownToken[]
  items?: ListItemToken[]
  header?: TableCellToken[]
  rows?: TableCellToken[][]
  cells?: TableCellToken[][]
  ordered?: boolean
  start?: number
  depth?: number
  lang?: string
  content?: string
  align?: CellAlign
  loose?: boolean
  checked?: boolean
  task?: boolean
}

type InlineToken = MarkdownToken
type BlockToken = MarkdownToken
type TableCellToken = MarkdownToken
type ListItemToken = MarkdownToken
type CellAlign = "left" | "center" | "right" | null | undefined

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

function cloneSegment(segment: Segment): Segment {
  return { text: segment.text, style: cloneStyle(segment.style), searchable: segment.searchable }
}

function buildPlainText(segments: Segment[]): string {
  return segments
    .filter((segment) => segment.searchable !== false)
    .map((segment) => segment.text)
    .join("")
}

function measureText(text: string): number {
  return Array.from(text).length
}

function pushSegment(segments: Segment[], text: string, style: Segment["style"], searchable = true): void {
  if (text.length === 0) return
  segments.push({ text, style: cloneStyle(style), searchable })
}

function cloneInto(target: Segment[], source: Segment[]): void {
  for (const segment of source) {
    target.push(cloneSegment(segment))
  }
}

function splitSegmentsIntoLines(segments: Segment[]): Segment[][] {
  const lines: Segment[][] = [[]]

  for (const segment of segments) {
    const parts = segment.text.split("\n")

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]
      if (part.length > 0) {
        lines[lines.length - 1].push({
          text: part,
          style: cloneStyle(segment.style),
          searchable: segment.searchable,
        })
      }

      if (index < parts.length - 1) {
        lines.push([])
      }
    }
  }

  return lines
}

function prefixSegmentLines(segments: Segment[], getPrefix: (lineIndex: number) => Segment[]): Segment[] {
  const lines = splitSegmentsIntoLines(segments)
  const prefixed: Segment[] = []

  lines.forEach((line, index) => {
    const prefix = getPrefix(index)
    if (index > 0) {
      pushSegment(prefixed, "\n", baseStyleFromSegments(prefix), true)
    }
    cloneInto(prefixed, prefix)
    cloneInto(prefixed, line)
  })

  return prefixed
}

function prefixBlockLines(segments: Segment[], firstPrefix: Segment[], restPrefix = firstPrefix): Segment[] {
  return prefixSegmentLines(segments, (index) => (index === 0 ? firstPrefix : restPrefix))
}

function prefixEachLine(segments: Segment[], prefix: Segment[]): Segment[] {
  return prefixBlockLines(segments, prefix, prefix)
}

function padTextToWidth(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - measureText(text)))}`
}

function baseStyleFromSegments(segments: Segment[]): Segment["style"] {
  return segments[0]?.style ? cloneStyle(segments[0].style) : {}
}

function normalizeCodeLine(line: string): string {
  return line.replaceAll("\t", "  ")
}

function renderInlineTokens(tokens: InlineToken[] | undefined, theme: Theme, style: Segment["style"]): Segment[] {
  const segments: Segment[] = []
  if (!tokens) return segments

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        if (token.tokens?.length) {
          segments.push(...renderInlineTokens(token.tokens, theme, style))
        } else {
          pushSegment(segments, token.text ?? "", style)
        }
        break
      case "strong":
        segments.push(...renderInlineTokens(token.tokens, theme, mergeStyle(style, { attributes: TEXT_ATTRIBUTE_BOLD })))
        break
      case "em":
        segments.push(...renderInlineTokens(token.tokens, theme, mergeStyle(style, { attributes: TEXT_ATTRIBUTE_ITALIC })))
        break
      case "codespan": {
        const codeStyle = mergeStyle(style, { fg: theme.codeText, bg: theme.codeBg, attributes: TEXT_ATTRIBUTE_BOLD })
        pushSegment(segments, " ", codeStyle, false)
        pushSegment(segments, token.text ?? token.raw ?? "", codeStyle)
        pushSegment(segments, " ", codeStyle, false)
        break
      }
      case "link": {
        const linkStyle = mergeStyle(style, { fg: theme.accent, attributes: TEXT_ATTRIBUTE_UNDERLINE, link: { url: token.href ?? "" } })
        if (token.tokens?.length) {
          segments.push(...renderInlineTokens(token.tokens, theme, linkStyle))
        } else {
          pushSegment(segments, token.text ?? token.href ?? "", linkStyle)
        }
        if (token.href) {
          pushSegment(segments, " ↗", mergeStyle(style, { fg: theme.muted, link: { url: token.href } }), false)
        }
        break
      }
      case "image": {
        const imageLabel = token.text?.trim() || token.href || "image"
        pushSegment(segments, "[", mergeStyle(style, { fg: theme.muted }), false)
        pushSegment(segments, "Image", mergeStyle(style, { fg: theme.muted, attributes: TEXT_ATTRIBUTE_BOLD }), false)
        pushSegment(segments, ": ", mergeStyle(style, { fg: theme.muted }), false)
        pushSegment(segments, imageLabel, mergeStyle(style, { fg: theme.accentSoft, attributes: TEXT_ATTRIBUTE_BOLD }))
        pushSegment(segments, "]", mergeStyle(style, { fg: theme.muted }), false)
        break
      }
      case "del":
        segments.push(...renderInlineTokens(token.tokens, theme, mergeStyle(style, { attributes: TEXT_ATTRIBUTE_STRIKETHROUGH })))
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
      case "text":
        out += token.tokens?.length ? flattenInlineText(token.tokens) : token.text ?? token.raw ?? ""
        break
      case "br":
        out += "\n"
        break
      case "strong":
      case "em":
      case "del":
      case "link":
        out += flattenInlineText(token.tokens) || token.text || token.href || ""
        break
      case "image":
        out += token.text || token.href || "image"
        break
      default:
        out += token.tokens?.length ? flattenInlineText(token.tokens) : token.text ?? token.raw ?? ""
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
    const searchableLength = segment.searchable === false ? 0 : segmentText.length
    const localMatches = matches
      .filter((match) => match.start < plainOffset + searchableLength && match.end > plainOffset)
      .map((match) => ({
        start: Math.max(0, match.start - plainOffset),
        end: Math.min(searchableLength, match.end - plainOffset),
        globalIndex: match.globalIndex,
      }))

    if (localMatches.length > 0 && searchableLength > 0) {
      for (const piece of applySearchHighlight(segmentText, segment.style, localMatches, activeGlobalIndex, theme)) {
        root.add(TextNodeRenderable.fromString(piece.text, piece.style))
      }
    } else {
      root.add(TextNodeRenderable.fromString(segmentText, segment.style))
    }

    plainOffset += searchableLength
  }

  return root
}

function renderCodeContent(line: string, theme: Theme): Segment[] {
  const segments: Segment[] = []
  const pattern = /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[{}()[\].,:;=+\-*/<>!&|%]+)/g

  let lastIndex = 0
  for (const match of line.matchAll(pattern)) {
    const value = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      pushSegment(segments, line.slice(lastIndex, index), { fg: theme.codeText, bg: theme.codeBg })
    }

    if (value.startsWith("//") || value.startsWith("#")) {
      pushSegment(segments, value, { fg: theme.muted, bg: theme.codeBg, attributes: TEXT_ATTRIBUTE_ITALIC })
    } else if (value.startsWith('"') || value.startsWith("'") || value.startsWith("`")) {
      pushSegment(segments, value, { fg: theme.success, bg: theme.codeBg })
    } else if (/^\d/.test(value)) {
      pushSegment(segments, value, { fg: theme.warning, bg: theme.codeBg })
    } else if (/^[{}()[\].,:;=+\-*/<>!&|%]+$/.test(value)) {
      pushSegment(segments, value, { fg: theme.borderStrong, bg: theme.codeBg })
    } else if (CODE_KEYWORDS.has(value)) {
      pushSegment(segments, value, { fg: theme.info, bg: theme.codeBg, attributes: TEXT_ATTRIBUTE_BOLD })
    } else if (/^[A-Z]/.test(value)) {
      pushSegment(segments, value, { fg: theme.accentSoft, bg: theme.codeBg })
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

function pushLabeledBorder(
  segments: Segment[],
  left: string,
  right: string,
  label: string,
  width: number,
  borderStyle: Segment["style"],
  labelStyle: Segment["style"],
): void {
  const labelText = ` ${label} `
  const trailing = Math.max(0, width - measureText(labelText) - 1)

  pushSegment(segments, left, borderStyle, false)
  pushSegment(segments, "─", borderStyle, false)
  pushSegment(segments, labelText, labelStyle, false)
  pushSegment(segments, "─".repeat(trailing), borderStyle, false)
  pushSegment(segments, right, borderStyle, false)
}

function pushDualLabelBorder(
  segments: Segment[],
  left: string,
  right: string,
  leadLabel: string,
  trailLabel: string,
  width: number,
  borderStyle: Segment["style"],
  leadStyle: Segment["style"],
  trailStyle: Segment["style"],
): void {
  const leadText = ` ${leadLabel} `
  const trailText = ` ${trailLabel} `
  const centerWidth = Math.max(0, width - measureText(leadText) - measureText(trailText) - 2)

  pushSegment(segments, left, borderStyle, false)
  pushSegment(segments, "─", borderStyle, false)
  pushSegment(segments, leadText, leadStyle, false)
  pushSegment(segments, "─".repeat(centerWidth), borderStyle, false)
  pushSegment(segments, trailText, trailStyle, false)
  pushSegment(segments, "─", borderStyle, false)
  pushSegment(segments, right, borderStyle, false)
}

function renderCodeBlock(token: BlockToken, theme: Theme): MarkdownBlock {
  const code = (token.text ?? token.content ?? "").replace(/\r\n?/g, "\n")
  const lines = code.split("\n").map(normalizeCodeLine)
  const segments: Segment[] = []
  const language = (token.lang?.trim().split(/\s+/)[0] || "code").toUpperCase()
  const lineLabel = lines.length === 1 ? "1 line" : `${lines.length} lines`
  const gutterWidth = Math.max(2, String(lines.length).length)
  const longestLine = Math.max(0, ...lines.map((line) => measureText(line)))
  const innerWidth = Math.max(gutterWidth + longestLine + 5, measureText(` ${language} `) + measureText(` ${lineLabel} `) + 2, 24)
  const contentWidth = innerWidth - gutterWidth - 5
  const borderStyle = { fg: theme.borderStrong, bg: theme.codeBg }
  const labelStyle = { fg: theme.accentSoft, bg: theme.codeBg, attributes: TEXT_ATTRIBUTE_BOLD }
  const metaStyle = { fg: theme.muted, bg: theme.codeBg }

  pushDualLabelBorder(segments, "╭", "╮", language, lineLabel, innerWidth, borderStyle, labelStyle, metaStyle)

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = String(i + 1).padStart(gutterWidth, "0")
    const lineContent = lines[i]
    const linePadding = " ".repeat(Math.max(0, contentWidth - measureText(lineContent)))

    pushSegment(segments, "\n", { fg: theme.codeText, bg: theme.codeBg }, i > 0)
    pushSegment(segments, "│ ", borderStyle, false)
    pushSegment(segments, lineNumber, { fg: theme.muted, bg: theme.codeBg }, false)
    pushSegment(segments, " │ ", { fg: theme.border, bg: theme.codeBg }, false)
    segments.push(...renderCodeContent(lineContent, theme))
    pushSegment(segments, linePadding, { fg: theme.codeText, bg: theme.codeBg }, false)
    pushSegment(segments, " │", borderStyle, false)
  }

  pushSegment(segments, "\n", borderStyle, false)
  pushSegment(segments, `╰${"─".repeat(innerWidth)}╯`, borderStyle, false)

  return { id: "block-code", kind: "code", plainText: buildPlainText(segments), segments }
}

function alignCellPadding(width: number, textWidth: number, align: CellAlign): { left: number; right: number } {
  const remaining = Math.max(0, width - textWidth)
  if (align === "right") return { left: remaining, right: 0 }
  if (align === "center") {
    const left = Math.floor(remaining / 2)
    return { left, right: remaining - left }
  }
  return { left: 0, right: remaining }
}

function buildTableBorder(widths: number[], left: string, middle: string, right: string): string {
  return `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`
}

function renderTableCell(cell: TableCellToken | undefined, theme: Theme, style: Segment["style"]): { text: string; segments: Segment[]; align: CellAlign } {
  const text = flattenInlineText(cell?.tokens) || cell?.text || ""
  const segments = cell?.tokens?.length ? renderInlineTokens(cell.tokens, theme, style) : []

  if (segments.length === 0 && text.length > 0) {
    pushSegment(segments, text, style)
  }

  return { text, segments, align: cell?.align }
}

function getTableTotalWidth(widths: number[]): number {
  return measureText(buildTableBorder(widths, "┌", "┬", "┐"))
}

function shouldRenderStackedTable(measuredWidths: number[], constrainedWidths: number[], columnCount: number, maxWidth: number): boolean {
  if (columnCount < 4) return false
  if (getTableTotalWidth(measuredWidths) <= maxWidth) return false

  const narrowColumns = constrainedWidths.filter((width) => width <= TABLE_MIN_COLUMN_WIDTH + 1).length
  const averageWidth = constrainedWidths.reduce((total, width) => total + width, 0) / Math.max(1, constrainedWidths.length)

  return columnCount >= 6 || narrowColumns >= Math.ceil(columnCount / 2) || averageWidth < 14
}

function constrainTableWidths(measuredWidths: number[], maxWidth: number): number[] {
  const widths = measuredWidths.map((width) => Math.max(3, width))
  const targetWidth = Math.max(getTableTotalWidth(widths), maxWidth)

  if (getTableTotalWidth(widths) <= maxWidth) {
    return widths
  }

  while (getTableTotalWidth(widths) > maxWidth) {
    let widestIndex = -1
    for (let index = 0; index < widths.length; index++) {
      if (widths[index] <= TABLE_MIN_COLUMN_WIDTH) continue
      if (widestIndex === -1 || widths[index] > widths[widestIndex]) {
        widestIndex = index
      }
    }

    if (widestIndex === -1) {
      break
    }

    widths[widestIndex] -= 1
  }

  if (getTableTotalWidth(widths) > targetWidth) {
    return widths
  }

  return widths
}

function wrapSegmentsToWidth(segments: Segment[], width: number): { lines: Segment[][]; lineWidths: number[] } {
  const maxWidth = Math.max(1, width)
  const lines: Segment[][] = [[]]
  const lineWidths = [0]
  let pendingWhitespace: Segment[] = []
  let pendingWhitespaceWidth = 0

  const getCurrentIndex = () => lines.length - 1
  const pushPiece = (segment: Segment, text: string): void => {
    if (!text) return
    lines[getCurrentIndex()].push({ text, style: cloneStyle(segment.style), searchable: segment.searchable })
    lineWidths[getCurrentIndex()] += measureText(text)
  }

  const startNewLine = (): void => {
    lines.push([])
    lineWidths.push(0)
  }

  const flushPendingWhitespace = (): void => {
    for (const part of pendingWhitespace) {
      pushPiece(part, part.text)
    }
    pendingWhitespace = []
    pendingWhitespaceWidth = 0
  }

  for (const segment of segments) {
    const parts = segment.text.split(/(\n|\s+)/)
    for (const part of parts) {
      if (!part) continue

      if (part === "\n") {
        pendingWhitespace = []
        pendingWhitespaceWidth = 0
        startNewLine()
        continue
      }

      if (/^\s+$/.test(part)) {
        pendingWhitespace.push({ text: part, style: cloneStyle(segment.style), searchable: segment.searchable })
        pendingWhitespaceWidth += measureText(part)
        continue
      }

      const chars = Array.from(part)
      if (lineWidths[getCurrentIndex()] > 0 && lineWidths[getCurrentIndex()] + pendingWhitespaceWidth + chars.length > maxWidth) {
        let carryWhitespaceToNextLine = false
        if (pendingWhitespaceWidth > 0 && lineWidths[getCurrentIndex()] + pendingWhitespaceWidth <= maxWidth) {
          flushPendingWhitespace()
        } else if (pendingWhitespaceWidth > 0) {
          carryWhitespaceToNextLine = true
        }

        if (carryWhitespaceToNextLine) {
          const whitespaceSource = pendingWhitespace[0]
          pendingWhitespace = whitespaceSource
            ? [{ text: " ", style: cloneStyle(whitespaceSource.style), searchable: whitespaceSource.searchable }]
            : []
          pendingWhitespaceWidth = pendingWhitespace.length > 0 ? 1 : 0
        } else {
          pendingWhitespace = []
          pendingWhitespaceWidth = 0
        }

        startNewLine()
      }

      if (pendingWhitespaceWidth > 0) {
        flushPendingWhitespace()
      }

      let cursor = 0
      while (cursor < chars.length) {
        let remaining = maxWidth - lineWidths[getCurrentIndex()]
        if (remaining <= 0) {
          startNewLine()
          remaining = maxWidth
        }

        const chunkChars = chars.slice(cursor, cursor + remaining)
        pushPiece(segment, chunkChars.join(""))
        cursor += chunkChars.length

        if (cursor < chars.length) {
          startNewLine()
        }
      }
    }
  }

  if (pendingWhitespaceWidth > 0) {
    flushPendingWhitespace()
  }

  return { lines, lineWidths }
}

function renderStackedTable(token: BlockToken, theme: Theme, options: MarkdownParseOptions): MarkdownBlock {
  const header = token.header ?? []
  const rows = token.rows ?? []
  const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 0)
  const labels = Array.from({ length: columnCount }, (_, index) => {
    const text = flattenInlineText(header[index]?.tokens) || header[index]?.text || ""
    return text.trim().length > 0 ? text : `Column ${index + 1}`
  })

  const totalWidth = Math.max(36, options.maxWidth ?? 88)
  const innerWidth = totalWidth - 2
  const labelWidthCap = Math.max(8, Math.min(18, totalWidth - 18))
  const labelWidth = Math.min(labelWidthCap, Math.max(8, ...labels.map((label) => measureText(label))))
  const valueWidth = Math.max(12, totalWidth - labelWidth - 6)

  const segments: Segment[] = []
  const borderStyle = { fg: theme.borderStrong }
  const labelStyle = { fg: theme.accent, attributes: TEXT_ATTRIBUTE_BOLD }
  const metaStyle = { fg: theme.muted }

  pushDualLabelBorder(segments, "┌", "┐", "TABLE", "STACKED", innerWidth, borderStyle, labelStyle, metaStyle)

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const background = rowIndex % 2 === 0 ? theme.tableRowBg : theme.panelAlt
    const rowStyle = { fg: theme.text, bg: background }
    const rowLabelStyle = { fg: theme.info, bg: background, attributes: TEXT_ATTRIBUTE_BOLD }

    pushSegment(segments, "\n", borderStyle, false)
    pushLabeledBorder(segments, "├", "┤", `ROW ${rowIndex + 1}`, innerWidth, borderStyle, rowLabelStyle)

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const cell = renderTableCell(row[columnIndex], theme, rowStyle)
      const wrapped = wrapSegmentsToWidth(cell.segments, valueWidth)
      const label = labels[columnIndex]

      for (let lineIndex = 0; lineIndex < Math.max(1, wrapped.lines.length); lineIndex++) {
        pushSegment(segments, "\n", rowStyle, lineIndex === 0 && (rowIndex > 0 || columnIndex > 0))
        pushSegment(segments, "│", borderStyle, false)
        pushSegment(segments, " ", { bg: background }, false)

        if (lineIndex === 0) {
          pushSegment(segments, padTextToWidth(label, labelWidth), { fg: theme.accent, bg: background, attributes: TEXT_ATTRIBUTE_BOLD })
          pushSegment(segments, ": ", { fg: theme.muted, bg: background })
        } else {
          pushSegment(segments, " ".repeat(labelWidth), { bg: background }, false)
          pushSegment(segments, "  ", { bg: background }, false)
        }

        const lineSegments = wrapped.lines[lineIndex] ?? []
        const lineWidth = wrapped.lineWidths[lineIndex] ?? 0
        cloneInto(segments, lineSegments)
        pushSegment(segments, " ".repeat(Math.max(0, valueWidth - lineWidth)), { bg: background }, false)
        pushSegment(segments, " ", { bg: background }, false)
        pushSegment(segments, "│", borderStyle, false)
      }
    }
  }

  pushSegment(segments, "\n", borderStyle, false)
  pushSegment(segments, `└${"─".repeat(innerWidth)}┘`, borderStyle, false)

  return { id: "block-table-stacked", kind: "table", plainText: buildPlainText(segments), segments }
}

function renderTable(token: BlockToken, theme: Theme, options: MarkdownParseOptions): MarkdownBlock {
  const header = token.header ?? []
  const rows = token.rows ?? []
  const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 0)
  const measuredWidths = Array.from({ length: columnCount }, (_, index) => {
    const headerWidth = measureText(flattenInlineText(header[index]?.tokens) || header[index]?.text || "")
    const rowWidth = Math.max(
      0,
      ...rows.map((row) => measureText(flattenInlineText(row[index]?.tokens) || row[index]?.text || "")),
    )
    return Math.max(3, headerWidth, rowWidth)
  })
  const maxTableWidth = Math.max(getTableTotalWidth(Array.from({ length: columnCount }, () => TABLE_MIN_COLUMN_WIDTH)), options.maxWidth ?? 88)
  const widths = constrainTableWidths(measuredWidths, maxTableWidth)

  if (rows.length > 0 && shouldRenderStackedTable(measuredWidths, widths, columnCount, maxTableWidth)) {
    return renderStackedTable(token, theme, options)
  }

  const segments: Segment[] = []
  const borderStyle = { fg: theme.borderStrong }
  const labelStyle = { fg: theme.accent, attributes: TEXT_ATTRIBUTE_BOLD }
  const metaStyle = { fg: theme.muted }
  const tableWidth = measureText(buildTableBorder(widths, "┌", "┬", "┐")) - 2
  const rowCount = header.length > 0 ? rows.length + 1 : rows.length

  const renderRow = (cells: TableCellToken[], isHeader = false, rowIndex = 0, searchableBreak = false) => {
    const background = isHeader ? theme.tableHeadBg : rowIndex % 2 === 0 ? theme.tableRowBg : theme.panelAlt
    const foreground = isHeader ? theme.accent : theme.text
    const rowStyle = { fg: foreground, bg: background, attributes: isHeader ? TEXT_ATTRIBUTE_BOLD : 0 }

    const wrappedCells = widths.map((width, index) => {
      const cell = renderTableCell(cells[index], theme, rowStyle)
      const wrapped = wrapSegmentsToWidth(cell.segments, width)
      return { ...cell, ...wrapped }
    })
    const rowHeight = Math.max(1, ...wrappedCells.map((cell) => cell.lines.length))

    for (let lineIndex = 0; lineIndex < rowHeight; lineIndex++) {
      if (segments.length > 0) {
        pushSegment(segments, "\n", rowStyle, lineIndex === 0 ? searchableBreak : false)
      }
      pushSegment(segments, "│", borderStyle, false)

      for (let index = 0; index < widths.length; index++) {
        const width = widths[index]
        const cell = wrappedCells[index]
        const lineSegments = cell.lines[lineIndex] ?? []
        const lineWidth = cell.lineWidths[lineIndex] ?? 0
        const padding = alignCellPadding(width, lineWidth, cell.align)

        pushSegment(segments, " ", { bg: background }, index > 0 && lineIndex === 0)
        pushSegment(segments, " ".repeat(padding.left), { bg: background }, false)
        cloneInto(segments, lineSegments)
        pushSegment(segments, " ".repeat(padding.right), { bg: background }, false)
        pushSegment(segments, " ", { bg: background }, false)
        pushSegment(segments, "│", borderStyle, false)
      }
    }
  }

  pushDualLabelBorder(segments, "┌", "┐", "TABLE", `${rowCount}×${columnCount}`, tableWidth, borderStyle, labelStyle, metaStyle)

  if (header.length > 0) {
    renderRow(header, true, 0, false)
    pushSegment(segments, `\n${buildTableBorder(widths, "├", "┼", "┤")}`, borderStyle, false)
  }

  for (let index = 0; index < rows.length; index++) {
    renderRow(rows[index], false, index, header.length > 0 || index > 0)
  }

  pushSegment(segments, `\n${buildTableBorder(widths, "└", "┴", "┘")}`, borderStyle, false)

  return { id: "block-table", kind: "table", plainText: buildPlainText(segments), segments }
}

function buildListGuidePrefix(depth: number, theme: Theme): Segment[] {
  const segments: Segment[] = []
  for (let index = 0; index < depth; index++) {
    pushSegment(segments, "│ ", { fg: index === depth - 1 ? theme.borderStrong : theme.border }, false)
  }
  return segments
}

function buildListPrefixes(
  depth: number,
  marker: string,
  markerWidth: number,
  markerStyle: Segment["style"],
  theme: Theme,
): { first: Segment[]; rest: Segment[] } {
  const guide = buildListGuidePrefix(depth, theme)
  const first: Segment[] = []
  const rest: Segment[] = []

  cloneInto(first, guide)
  cloneInto(rest, guide)
  pushSegment(first, padTextToWidth(marker, markerWidth), markerStyle, false)
  pushSegment(rest, " ".repeat(markerWidth), { fg: theme.muted }, false)

  return { first, rest }
}

function buildListMarker(token: BlockToken, item: ListItemToken, index: number, depth: number, items: ListItemToken[], theme: Theme): {
  marker: string
  markerWidth: number
  markerStyle: Segment["style"]
} {
  const prefixColor = item.task ? (item.checked ? theme.success : theme.warning) : token.ordered ? theme.info : theme.accent
  const marker = item.task
    ? item.checked
      ? "☑ "
      : "☐ "
    : token.ordered
      ? `${(token.start ?? 1) + index}. `
      : `${LIST_MARKERS[depth % LIST_MARKERS.length]} `

  const markerWidth = Math.max(
    2,
    ...items.map((entry, itemIndex) =>
      measureText(
        entry.task
          ? entry.checked
            ? "☑ "
            : "☐ "
          : token.ordered
            ? `${(token.start ?? 1) + itemIndex}. `
            : `${LIST_MARKERS[depth % LIST_MARKERS.length]} `,
      ),
    ),
  )

  return {
    marker,
    markerWidth,
    markerStyle: { fg: prefixColor, attributes: TEXT_ATTRIBUTE_BOLD },
  }
}

function renderListItemContent(
  token: BlockToken,
  item: ListItemToken,
  index: number,
  theme: Theme,
  depth: number,
  segments: Segment[],
  options: MarkdownParseOptions,
): void {
  const itemTokens = item.tokens ?? []
  const { marker, markerWidth, markerStyle } = buildListMarker(token, item, index, depth, token.items ?? [], theme)
  const prefixes = buildListPrefixes(depth, marker, markerWidth, markerStyle, theme)
  let hasRenderedContent = false
  let pendingBlankLine = false

  for (const child of itemTokens) {
    if (child.type === "space") {
      pendingBlankLine = hasRenderedContent
      continue
    }

    if (child.type === "list") {
      if (pendingBlankLine) {
        pushSegment(segments, "\n", baseStyle(theme))
      }
      renderListItems(child as BlockToken, theme, depth + 1, segments, options)
      hasRenderedContent = true
      pendingBlankLine = false
      continue
    }

    const blocks = renderTokens([child as BlockToken], theme, options).filter((block) => block.kind !== "space")
    for (const block of blocks) {
      if (hasRenderedContent) {
        pushSegment(segments, pendingBlankLine ? "\n\n" : "\n", baseStyle(theme))
      }
      const prefixed = prefixBlockLines(block.segments, hasRenderedContent ? prefixes.rest : prefixes.first, prefixes.rest)
      cloneInto(segments, prefixed)
      hasRenderedContent = true
      pendingBlankLine = false
    }
  }

  if (!hasRenderedContent) {
    const fallbackText = item.text ?? ""
    const fallbackSegments: Segment[] = []
    pushSegment(fallbackSegments, fallbackText, baseStyle(theme))
    cloneInto(segments, prefixBlockLines(fallbackSegments, prefixes.first, prefixes.rest))
  }
}

function renderListItems(
  token: BlockToken,
  theme: Theme,
  depth: number,
  segments: Segment[],
  options: MarkdownParseOptions,
): void {
  const items = token.items ?? []

  items.forEach((item, index) => {
    pushSegment(segments, segments.length === 0 ? "" : token.loose || item.loose ? "\n\n" : "\n", baseStyle(theme))
    renderListItemContent(token, item, index, theme, depth, segments, options)
  })
}

function renderList(token: BlockToken, theme: Theme, options: MarkdownParseOptions): MarkdownBlock {
  const segments: Segment[] = []
  renderListItems(token, theme, 0, segments, options)

  return { id: "block-list", kind: "list", plainText: buildPlainText(segments), segments }
}

function renderQuote(token: BlockToken, theme: Theme, options: MarkdownParseOptions): MarkdownBlock {
  const innerBlocks = renderTokens((token.tokens ?? []) as BlockToken[], theme, options).filter((block) => block.kind !== "space")
  const innerSegments: Segment[] = []

  if (innerBlocks.length === 0) {
    const fallback = renderParagraph(token, theme)
    cloneInto(innerSegments, fallback.segments)
  } else {
    innerBlocks.forEach((block, index) => {
      if (index > 0) {
        pushSegment(innerSegments, "\n\n", { fg: theme.quote })
      }
      cloneInto(innerSegments, block.segments)
    })
  }

  const firstPrefix = [{ text: "▋ ", style: { fg: theme.accent, attributes: TEXT_ATTRIBUTE_BOLD }, searchable: false }]
  const restPrefix = [{ text: "│ ", style: { fg: theme.borderStrong }, searchable: false }]
  const segments = prefixBlockLines(innerSegments, firstPrefix, restPrefix)
  return { id: "block-quote", kind: "quote", plainText: buildPlainText(segments), segments }
}

function renderParagraph(token: BlockToken, theme: Theme): MarkdownBlock {
  const segments = renderInlineTokens(token.tokens, theme, baseStyle(theme))
  if (segments.length === 0 && (token.text ?? "").length > 0) {
    pushSegment(segments, token.text ?? "", baseStyle(theme))
  }
  return { id: "block-paragraph", kind: "paragraph", plainText: buildPlainText(segments), segments }
}

function renderHeading(token: BlockToken, theme: Theme): MarkdownBlock {
  const text = flattenInlineText(token.tokens) || token.text || ""
  const level = token.depth ?? 1
  const accent = level === 1 ? theme.accentSoft : level === 2 ? theme.accent : level === 3 ? theme.info : theme.text
  const titleStyle = { fg: accent, attributes: TEXT_ATTRIBUTE_BOLD }
  const titleSegments = renderInlineTokens(token.tokens, theme, titleStyle)
  const segments: Segment[] = []
  const titleWidth = Math.max(1, measureText(text))

  if (level === 1) {
    const ruleLength = Math.max(12, Math.min(titleWidth + 4, 64))
    pushSegment(segments, "┏", { fg: theme.accentSoft, attributes: TEXT_ATTRIBUTE_BOLD }, false)
    pushSegment(segments, "━".repeat(ruleLength), { fg: theme.accentSoft }, false)
    pushSegment(segments, "\n┃ ", { fg: theme.accentSoft, attributes: TEXT_ATTRIBUTE_BOLD }, false)
    if (titleSegments.length > 0) {
      cloneInto(segments, titleSegments)
    } else {
      pushSegment(segments, text, titleStyle)
    }
    pushSegment(segments, "\n┗", { fg: theme.borderStrong }, false)
    pushSegment(segments, "━".repeat(ruleLength), { fg: theme.borderStrong }, false)
  } else if (level === 2) {
    const ruleLength = Math.max(8, Math.min(titleWidth + 2, 28))
    pushSegment(segments, "▍ ", { fg: theme.accent, attributes: TEXT_ATTRIBUTE_BOLD }, false)
    if (titleSegments.length > 0) {
      cloneInto(segments, titleSegments)
    } else {
      pushSegment(segments, text, titleStyle)
    }
    pushSegment(segments, " ", { fg: theme.border }, false)
    pushSegment(segments, "─".repeat(ruleLength), { fg: theme.border }, false)
  } else if (level === 3) {
    pushSegment(segments, "◆ ", { fg: theme.info, attributes: TEXT_ATTRIBUTE_BOLD }, false)
    if (titleSegments.length > 0) {
      cloneInto(segments, titleSegments)
    } else {
      pushSegment(segments, text, titleStyle)
    }
  } else {
    pushSegment(segments, "· ", { fg: theme.muted, attributes: TEXT_ATTRIBUTE_BOLD }, false)
    if (titleSegments.length > 0) {
      cloneInto(segments, titleSegments)
    } else {
      pushSegment(segments, text, titleStyle)
    }
  }

  return { id: `block-heading-${level}`, kind: "heading", plainText: buildPlainText(segments), segments, level }
}

function renderHr(theme: Theme): MarkdownBlock {
  const segments: Segment[] = []
  pushSegment(segments, "─".repeat(18), { fg: theme.borderStrong }, false)
  pushSegment(segments, " ◈ ", { fg: theme.accent }, false)
  pushSegment(segments, "─".repeat(18), { fg: theme.borderStrong }, false)
  return { id: "block-hr", kind: "hr", plainText: "", segments }
}

function renderSpace(theme: Theme): MarkdownBlock {
  return { id: "block-space", kind: "space", plainText: "", segments: [] }
}

function renderTokens(tokens: BlockToken[], theme: Theme, options: MarkdownParseOptions): MarkdownBlock[] {
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
        blocks.push(renderQuote(token, theme, options))
        break
      case "list":
        blocks.push(renderList(token, theme, options))
        break
      case "code":
        blocks.push(renderCodeBlock(token, theme))
        break
      case "table":
        blocks.push(renderTable(token, theme, options))
        break
      case "hr":
        blocks.push(renderHr(theme))
        break
      case "space":
        blocks.push(renderSpace(theme))
        break
      default: {
        const fallbackSegments = renderInlineTokens(token.tokens, theme, baseStyle(theme))
        if (fallbackSegments.length > 0) {
          blocks.push({
            id: `block-${token.type}`,
            kind: token.type ?? "unknown",
            plainText: buildPlainText(fallbackSegments),
            segments: fallbackSegments,
          })
          break
        }

        const fallbackText = flattenInlineText(token.tokens) || token.text || token.raw || ""
        if (fallbackText.trim().length > 0) {
          blocks.push({
            id: `block-${token.type}`,
            kind: token.type ?? "unknown",
            plainText: fallbackText,
            segments: [{ text: fallbackText, style: baseStyle(theme) }],
          })
        }
      }
    }
  }

  return blocks
}

export function parseMarkdownBlocks(source: string, theme: Theme, options: MarkdownParseOptions = {}): MarkdownBlock[] {
  const tokens = marked.lexer(source, { gfm: true, breaks: false }) as BlockToken[]
  return renderTokens(tokens, theme, options)
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
