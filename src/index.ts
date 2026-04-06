import {
  BoxRenderable,
  CliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  ScrollBoxRenderable,
  createCliRenderer,
  type ParsedKey,
  type SelectOption,
} from "@opentui/core"
import { existsSync } from "node:fs"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { extname, join, relative, resolve } from "node:path"
import { buildBlockRenderable, findMatchesInBlock, parseMarkdownBlocks, type MarkdownBlock, type Match } from "./markdown"
import { themes, themeOrder, type ThemeName } from "./theme"

type CommandId = "search" | "theme" | "refresh" | "open" | "edit"

type AppMode = "view" | "search" | "commands" | "themes" | "files"

const SAMPLE_MARKDOWN = `# OpenMarkdown

A polished terminal markdown viewer built with OpenTUI.

## Features

- Beautiful theme system inspired by OpenCode
- Incremental search with match navigation
- Refresh with r
- Command palette with Ctrl+P

## Code

typescript
const greeting = "hello world"
console.log(greeting)


> Search is fast, refresh is instant, and the UI stays out of the way.`.replaceAll("\u007f", "`")

const CONFIG_DIR = join(homedir(), ".config", "openmarkdown")
const CONFIG_PATH = join(CONFIG_DIR, "config.json")
const PICKER_ROOT = process.cwd()
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".mdown", ".mkd", ".txt"])
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".sst", ".astro", "dist", "build"])
const EDIT_REQUEST_EXIT_CODE = 91

class MarkdownApp {
  private renderer: CliRenderer
  private source = ""
  private sourcePath = ""
  private themeName: ThemeName = "opencode-dark"
  private mode: AppMode = "view"
  private query = ""
  private activeMatchIndex = 0
  private blocks: MarkdownBlock[] = []
  private matches: Array<Match & { blockIndex: number; blockId: string }> = []

  private root: BoxRenderable | null = null
  private shell: BoxRenderable | null = null
  private contentShell: BoxRenderable | null = null
  private scrollBox: ScrollBoxRenderable | null = null
  private documentRoot: BoxRenderable | null = null
  private footer: TextRenderable | null = null
  private searchBar: BoxRenderable | null = null
  private searchValue: TextRenderable | null = null
  private commandPalette: BoxRenderable | null = null
  private commandSelect: SelectRenderable | null = null
  private themePalette: BoxRenderable | null = null
  private themeSelect: SelectRenderable | null = null
  private filePalette: BoxRenderable | null = null
  private fileSelect: SelectRenderable | null = null
  private fileOptions: SelectOption[] = []
  private selectionListener: ((event: ParsedKey) => void) | null = null
  private fileReloading = false
  private pendingScrollTimer: ReturnType<typeof setTimeout> | null = null
  private pendingStatusTimer: ReturnType<typeof setTimeout> | null = null
  private statusMessage = ""

  constructor(renderer: CliRenderer, initialPath?: string) {
    this.renderer = renderer
    this.sourcePath = initialPath ?? ""
  }

  async start(): Promise<void> {
    await this.loadPreferences()
    await this.loadSource()
    this.buildLayout()
    this.applyTheme()
    this.rebuildDocument()
    this.bindKeys()
    this.renderer.start()
  }

  private buildLayout(): void {
    this.root = new BoxRenderable(this.renderer, {
      id: "app-root",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: themes[this.themeName].background,
    })
    this.renderer.root.add(this.root)

    this.shell = new BoxRenderable(this.renderer, {
      id: "app-shell",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: 1,
      backgroundColor: "transparent",
    })
    this.root.add(this.shell)

    this.contentShell = new BoxRenderable(this.renderer, {
      id: "content-shell",
      flexGrow: 1,
      flexDirection: "column",
      marginBottom: 1,
      backgroundColor: themes[this.themeName].panel,
      border: true,
      borderStyle: "single",
      borderColor: themes[this.themeName].border,
      padding: 1,
    })
    this.shell.add(this.contentShell)

    this.scrollBox = new ScrollBoxRenderable(this.renderer, {
      id: "document-scrollbox",
      flexGrow: 1,
      scrollY: true,
      scrollX: false,
      stickyScroll: false,
      backgroundColor: "transparent",
      viewportCulling: true,
    })
    this.contentShell.add(this.scrollBox)

    this.documentRoot = new BoxRenderable(this.renderer, {
      id: "document-root",
      flexDirection: "column",
      width: "100%",
      backgroundColor: "transparent",
      paddingRight: 1,
    })
    this.scrollBox.add(this.documentRoot)

    this.footer = new TextRenderable(this.renderer, {
      id: "footer",
      content: "",
      height: 1,
      fg: themes[this.themeName].muted,
      wrapMode: "none",
      flexShrink: 0,
      alignSelf: "center",
    })
    this.shell.add(this.footer)

    this.searchBar = new BoxRenderable(this.renderer, {
      id: "search-bar",
      visible: false,
      flexDirection: "row",
      position: "absolute",
      left: "50%",
      bottom: 3,
      width: 72,
      height: 3,
      marginLeft: -36,
      border: true,
      borderStyle: "single",
      borderColor: themes[this.themeName].borderStrong,
      backgroundColor: themes[this.themeName].panelAlt,
      paddingX: 1,
      zIndex: 50,
    })
    this.root.add(this.searchBar)

    const searchLabel = new TextRenderable(this.renderer, {
      id: "search-label",
      content: " / ",
      fg: themes[this.themeName].accent,
      height: 1,
      flexShrink: 0,
    })
    this.searchBar.add(searchLabel)

    this.searchValue = new TextRenderable(this.renderer, {
      id: "search-value",
      content: "Search markdown...",
      width: "100%",
      height: 1,
      fg: themes[this.themeName].muted,
      wrapMode: "none",
    })
    this.searchBar.add(this.searchValue)

    this.commandPalette = new BoxRenderable(this.renderer, {
      id: "command-palette",
      visible: false,
      position: "absolute",
      left: "50%",
      top: "50%",
      width: 64,
      height: 14,
      marginLeft: -32,
      marginTop: -7,
      border: true,
      borderStyle: "single",
      borderColor: themes[this.themeName].borderStrong,
      backgroundColor: themes[this.themeName].panelAlt,
      title: "Commands",
      titleAlignment: "center",
      padding: 1,
      zIndex: 80,
    })
    this.root.add(this.commandPalette)

    const commandOptions: SelectOption[] = [
      { name: "Open file", description: "Browse markdown files", value: "open" },
      { name: "Edit current file", description: "Open in your default editor", value: "edit" },
      { name: "Search", description: "Open search bar", value: "search" },
      { name: "Theme Finder", description: "Browse available themes", value: "theme" },
      { name: "Refresh", description: "Reload current file", value: "refresh" },
    ]

    this.commandSelect = new SelectRenderable(this.renderer, {
      id: "command-select",
      options: commandOptions,
      height: "100%",
      backgroundColor: "transparent",
      focusedBackgroundColor: "transparent",
      selectedBackgroundColor: themes[this.themeName].selectionBg,
      textColor: themes[this.themeName].text,
      selectedTextColor: themes[this.themeName].selectionText,
      descriptionColor: themes[this.themeName].muted,
      selectedDescriptionColor: themes[this.themeName].muted,
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
    })
    this.commandPalette.add(this.commandSelect)

    this.filePalette = new BoxRenderable(this.renderer, {
      id: "file-palette",
      visible: false,
      position: "absolute",
      left: "50%",
      top: "50%",
      width: 82,
      height: 18,
      marginLeft: -41,
      marginTop: -9,
      border: true,
      borderStyle: "single",
      borderColor: themes[this.themeName].borderStrong,
      backgroundColor: themes[this.themeName].panelAlt,
      title: "File Picker",
      titleAlignment: "center",
      padding: 1,
      zIndex: 85,
    })
    this.root.add(this.filePalette)

    this.fileSelect = new SelectRenderable(this.renderer, {
      id: "file-select",
      options: [{ name: "Loading...", description: PICKER_ROOT, value: "" }],
      height: "100%",
      backgroundColor: "transparent",
      focusedBackgroundColor: "transparent",
      selectedBackgroundColor: themes[this.themeName].selectionBg,
      textColor: themes[this.themeName].text,
      selectedTextColor: themes[this.themeName].selectionText,
      descriptionColor: themes[this.themeName].muted,
      selectedDescriptionColor: themes[this.themeName].muted,
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
    })
    this.filePalette.add(this.fileSelect)

    this.themePalette = new BoxRenderable(this.renderer, {
      id: "theme-palette",
      visible: false,
      position: "absolute",
      left: "50%",
      top: "50%",
      width: 64,
      height: 16,
      marginLeft: -32,
      marginTop: -8,
      border: true,
      borderStyle: "single",
      borderColor: themes[this.themeName].borderStrong,
      backgroundColor: themes[this.themeName].panelAlt,
      title: "Theme Finder",
      titleAlignment: "center",
      padding: 1,
      zIndex: 90,
    })
    this.root.add(this.themePalette)

    const themeOptions: SelectOption[] = themeOrder.map((name) => ({
      name: themes[name].name,
      description: name === this.themeName ? "Current theme" : "Apply this theme",
      value: name,
    }))

    this.themeSelect = new SelectRenderable(this.renderer, {
      id: "theme-select",
      options: themeOptions,
      height: "100%",
      backgroundColor: "transparent",
      focusedBackgroundColor: "transparent",
      selectedBackgroundColor: themes[this.themeName].selectionBg,
      textColor: themes[this.themeName].text,
      selectedTextColor: themes[this.themeName].selectionText,
      descriptionColor: themes[this.themeName].muted,
      selectedDescriptionColor: themes[this.themeName].muted,
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
    })
    this.themePalette.add(this.themeSelect)

    this.commandSelect.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
      const value = option.value as CommandId
      this.hideCommandPalette()
      if (value === "open") void this.showFilePalette()
      if (value === "edit") void this.editCurrentFile()
      if (value === "search") this.showSearch()
      if (value === "theme") this.showThemePalette()
      if (value === "refresh") void this.refresh()
    })

    this.themeSelect.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
      this.hideThemePalette()
      this.themeName = option.value as ThemeName
      this.applyTheme()
      this.rebuildDocument(true)
      void this.savePreferences()
    })

    this.fileSelect.on(SelectRenderableEvents.ITEM_SELECTED, async (_index, option) => {
      const nextPath = option.value as string
      if (!nextPath) return
      this.hideFilePalette()
      await this.openFile(nextPath)
    })

    this.updateFooter()
  }

  private applyTheme(): void {
    const theme = themes[this.themeName]
    this.renderer.setBackgroundColor(theme.background)

    if (this.root) this.root.backgroundColor = theme.background
    if (this.contentShell) {
      this.contentShell.backgroundColor = theme.panel
      this.contentShell.borderColor = theme.border
    }
    if (this.footer) this.footer.fg = theme.muted
    if (this.searchBar) {
      this.searchBar.backgroundColor = theme.panelAlt
      this.searchBar.borderColor = theme.borderStrong
    }
    if (this.commandPalette) {
      this.commandPalette.backgroundColor = theme.panelAlt
      this.commandPalette.borderColor = theme.borderStrong
    }
    if (this.themePalette) {
      this.themePalette.backgroundColor = theme.panelAlt
      this.themePalette.borderColor = theme.borderStrong
    }
    if (this.filePalette) {
      this.filePalette.backgroundColor = theme.panelAlt
      this.filePalette.borderColor = theme.borderStrong
    }
    if (this.commandSelect) {
      this.commandSelect.selectedBackgroundColor = theme.selectionBg
      this.commandSelect.textColor = theme.text
      this.commandSelect.selectedTextColor = theme.selectionText
      this.commandSelect.descriptionColor = theme.muted
      this.commandSelect.selectedDescriptionColor = theme.muted
    }
    if (this.themeSelect) {
      this.themeSelect.selectedBackgroundColor = theme.selectionBg
      this.themeSelect.textColor = theme.text
      this.themeSelect.selectedTextColor = theme.selectionText
      this.themeSelect.descriptionColor = theme.muted
      this.themeSelect.selectedDescriptionColor = theme.muted
    }
    if (this.fileSelect) {
      this.fileSelect.selectedBackgroundColor = theme.selectionBg
      this.fileSelect.textColor = theme.text
      this.fileSelect.selectedTextColor = theme.selectionText
      this.fileSelect.descriptionColor = theme.muted
      this.fileSelect.selectedDescriptionColor = theme.muted
    }
    if (this.documentRoot) {
      this.documentRoot.backgroundColor = "transparent"
    }
    this.updateSearchDisplay()
    this.renderer.requestRender()
  }

  private async loadSource(): Promise<void> {
    const candidatePath = this.sourcePath || process.argv[2] || ""
    const defaultPath = "./plan.md"

    if (candidatePath && candidatePath !== "-") {
      try {
        this.sourcePath = candidatePath
        this.source = await readFile(candidatePath, "utf8")
        return
      } catch {
        this.source = `# Missing file\n\nCould not load \`${candidatePath}\`. Showing sample content instead.`
      }
    }

    if (!process.stdin.isTTY) {
      try {
        const stdin = await this.readStdin()
        if (stdin.trim().length > 0) {
          this.sourcePath = "stdin"
          this.source = stdin
          return
        }
      } catch {
        // Fall through to local sample content.
      }
    }

    if (!candidatePath) {
      this.sourcePath = defaultPath
      if (existsSync(defaultPath)) {
        try {
          this.source = await readFile(defaultPath, "utf8")
          return
        } catch {
          // Fall through to sample content.
        }
      }
      this.source = SAMPLE_MARKDOWN
    }
  }

  private async readStdin(): Promise<string> {
    let output = ""
    for await (const chunk of process.stdin) {
      output += chunk.toString()
    }
    return output
  }

  private async loadPreferences(): Promise<void> {
    if (!existsSync(CONFIG_PATH)) return

    try {
      const raw = await readFile(CONFIG_PATH, "utf8")
      const parsed = JSON.parse(raw) as { themeName?: string }
      if (parsed.themeName && parsed.themeName in themes) {
        this.themeName = parsed.themeName as ThemeName
      }
    } catch {
      // Ignore invalid local config and continue with defaults.
    }
  }

  private async discoverMarkdownFiles(): Promise<SelectOption[]> {
    const paths: string[] = []

    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (IGNORED_DIRECTORIES.has(entry.name)) continue
          await visit(join(directory, entry.name))
          continue
        }

        if (!entry.isFile()) continue
        const extension = extname(entry.name).toLowerCase()
        if (!MARKDOWN_EXTENSIONS.has(extension)) continue
        paths.push(join(directory, entry.name))
      }
    }

    try {
      await visit(PICKER_ROOT)
    } catch {
      return [{ name: "No files found", description: PICKER_ROOT, value: "" }]
    }

    paths.sort((a, b) => a.localeCompare(b))

    if (paths.length === 0) {
      return [{ name: "No files found", description: PICKER_ROOT, value: "" }]
    }

    return paths.map((absolutePath) => ({
      name: relative(PICKER_ROOT, absolutePath) || absolutePath,
      description: absolutePath,
      value: absolutePath,
    }))
  }

  private async savePreferences(): Promise<void> {
    try {
      await mkdir(CONFIG_DIR, { recursive: true })
      await writeFile(CONFIG_PATH, JSON.stringify({ themeName: this.themeName }, null, 2))
    } catch {
      // Ignore preference save failures so the viewer stays responsive.
    }
  }

  private rebuildDocument(preserveScroll = false): void {
    if (!this.documentRoot) return

    const theme = themes[this.themeName]
    this.blocks = parseMarkdownBlocks(this.source, theme, { maxWidth: this.getDocumentMaxWidth() })
    this.matches = []

    if (this.documentRoot) {
      this.scrollBox?.remove(this.documentRoot.id)
      this.documentRoot.destroy()
    }

    this.documentRoot = new BoxRenderable(this.renderer, {
      id: "document-root",
      flexDirection: "column",
      width: "100%",
      backgroundColor: "transparent",
      paddingRight: 1,
    })
    this.scrollBox?.add(this.documentRoot)

    let globalIndex = 0
    this.blocks.forEach((block, index) => {
      const localMatches = findMatchesInBlock(block.plainText, this.query).map((match) => ({
        ...match,
        globalIndex: globalIndex++,
      }))
      localMatches.forEach((match) => {
        this.matches.push({ ...match, blockIndex: index, blockId: `doc-block-${index}` })
      })

      if (block.kind === "space") return

      const spacing = this.getBlockSpacing(block, index)

      const renderable = new TextRenderable(this.renderer, {
        id: `doc-block-${index}`,
        content: "",
        width: "100%",
        wrapMode: "word",
        fg: theme.text,
        bg: "transparent",
        marginTop: spacing.top,
        marginBottom: spacing.bottom,
      })
      renderable.add(buildBlockRenderable(theme, block, localMatches, this.activeMatchIndex))
      this.documentRoot?.add(renderable)
    })

    if (!preserveScroll) {
      this.scrollBox?.scrollTo({ x: 0, y: 0 })
    }

    this.updateFooter()
    this.renderer.requestRender()
  }

  private updateFooter(): void {
    const total = this.matches.length
    const active = total > 0 ? Math.min(this.activeMatchIndex + 1, total) : 0
    const searchStatus = this.query ? `  ${active}/${total}` : ""
    const status = this.statusMessage ? `  ${this.statusMessage}` : ""
    const text = ` / search  j/k scroll  e edit  o open  r refresh  t themes  n next  N prev  ctrl+p commands  q quit${searchStatus}${status} `
    if (this.footer) this.footer.content = text
  }

  private bindKeys(): void {
    this.selectionListener = (key: ParsedKey) => {
      if (key.ctrl && key.name === "c") {
        this.cleanup()
        return
      }

      if (key.ctrl && key.name === "q") {
        this.cleanup()
        return
      }

      if (this.mode === "search") {
        if (key.name === "escape" || key.raw === "\u001b" || key.sequence === "\u001b") {
          this.hideSearch()
          return
        }

        if (key.name === "return" || key.name === "linefeed" || key.name === "enter") {
          this.hideSearch()
          return
        }

        if (key.name === "backspace") {
          this.query = this.query.slice(0, -1)
          this.activeMatchIndex = 0
          this.rebuildDocument(true)
          this.updateSearchDisplay()
          this.scrollToActiveMatch()
          return
        }

        if (!key.ctrl && !key.meta && !key.super && !key.hyper) {
          const char = key.name === "space" ? " " : key.sequence || key.raw || (key.name.length === 1 ? key.name : "")
          if (char.length === 1 && char >= " " && char !== "\u007f") {
            this.query += char
            this.activeMatchIndex = 0
            this.rebuildDocument(true)
            this.updateSearchDisplay()
            this.scrollToActiveMatch()
            return
          }
        }

        return
      }

      if (this.mode === "commands") {
        if (key.name === "q" && !key.ctrl) {
          this.cleanup()
          return
        }
        if (key.name === "escape") this.hideCommandPalette()
        return
      }

      if (this.mode === "themes") {
        if (key.name === "q" && !key.ctrl) {
          this.cleanup()
          return
        }
        if (key.name === "escape") this.hideThemePalette()
        return
      }

      if (this.mode === "files") {
        if (key.name === "q" && !key.ctrl) {
          this.cleanup()
          return
        }
        if (key.name === "escape") this.hideFilePalette()
        return
      }

      if (key.name === "slash" || key.raw === "/") {
        this.showSearch()
        return
      }

      if (key.ctrl && key.name === "p") {
        this.showCommandPalette()
        return
      }

      if (key.name === "o" && !key.ctrl) {
        void this.showFilePalette()
        return
      }

      if (key.name === "r" && !key.ctrl) {
        void this.refresh()
        return
      }

      if (key.name === "t" && !key.ctrl) {
        this.showThemePalette()
        return
      }

      if (key.name === "q" && !key.ctrl) {
        this.cleanup()
        return
      }

      if ((key.name === "j" && !key.ctrl) || key.name === "down") {
        this.scrollDocument(1)
        return
      }

      if ((key.name === "k" && !key.ctrl) || key.name === "up") {
        this.scrollDocument(-1)
        return
      }

      if (key.name === "e" && !key.ctrl) {
        void this.editCurrentFile()
        return
      }

      if (key.name === "n" && !key.shift) {
        this.nextMatch()
        return
      }

      if (key.name === "n" && key.shift) {
        this.previousMatch()
        return
      }
    }

    this.renderer.keyInput.on("keypress", this.selectionListener)
    this.renderer.on("resize", () => this.rebuildDocument(true))
  }

  private showSearch(): void {
    this.collapseCommandPalette()
    this.collapseThemePalette()
    this.mode = "search"
    if (this.searchBar) this.searchBar.visible = true
    this.updateSearchDisplay()
    this.renderer.requestRender()
  }

  private hideSearch(): void {
    this.collapseSearch()
    if (this.mode === "search") this.mode = "view"
    this.renderer.requestRender()
  }

  private showCommandPalette(): void {
    this.collapseSearch()
    this.collapseThemePalette()
    this.collapseFilePalette()
    this.mode = "commands"
    if (this.commandPalette) this.commandPalette.visible = true
    if (this.commandSelect) this.commandSelect.focus()
    this.renderer.requestRender()
  }

  private hideCommandPalette(): void {
    this.collapseCommandPalette()
    if (this.mode === "commands") this.mode = "view"
    this.renderer.requestRender()
  }

  private showThemePalette(): void {
    this.collapseCommandPalette()
    this.collapseSearch()
    this.collapseFilePalette()
    this.mode = "themes"
    if (this.themePalette) this.themePalette.visible = true
    if (this.themeSelect) {
      this.themeSelect.setSelectedIndex(themeOrder.indexOf(this.themeName))
      this.themeSelect.focus()
    }
    this.renderer.requestRender()
  }

  private hideThemePalette(): void {
    this.collapseThemePalette()
    if (this.mode === "themes") this.mode = "view"
    this.renderer.requestRender()
  }

  private async showFilePalette(): Promise<void> {
    this.collapseCommandPalette()
    this.collapseSearch()
    this.collapseThemePalette()
    this.mode = "files"

    if (this.filePalette) this.filePalette.visible = true
    if (this.fileSelect) {
      this.fileSelect.options = [{ name: "Loading...", description: PICKER_ROOT, value: "" }]
      this.fileSelect.setSelectedIndex(0)
      this.fileSelect.focus()
    }
    this.renderer.requestRender()

    this.fileOptions = await this.discoverMarkdownFiles()
    if (this.mode !== "files") return
    if (this.fileSelect) {
      this.fileSelect.options = this.fileOptions
      const currentIndex = this.fileOptions.findIndex((option) => option.value === resolve(this.sourcePath))
      this.fileSelect.setSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
      this.fileSelect.focus()
    }
    this.renderer.requestRender()
  }

  private hideFilePalette(): void {
    this.collapseFilePalette()
    if (this.mode === "files") this.mode = "view"
    this.renderer.requestRender()
  }

  private collapseSearch(): void {
    if (this.searchBar) this.searchBar.visible = false
  }

  private collapseCommandPalette(): void {
    if (this.commandPalette) this.commandPalette.visible = false
    if (this.commandSelect) this.commandSelect.blur()
  }

  private collapseThemePalette(): void {
    if (this.themePalette) this.themePalette.visible = false
    if (this.themeSelect) this.themeSelect.blur()
  }

  private collapseFilePalette(): void {
    if (this.filePalette) this.filePalette.visible = false
    if (this.fileSelect) this.fileSelect.blur()
  }

  private nextMatch(): void {
    if (!this.matches.length) return
    this.activeMatchIndex = (this.activeMatchIndex + 1) % this.matches.length
    this.rebuildDocument(true)
    this.scheduleScrollToActiveMatch()
  }

  private previousMatch(): void {
    if (!this.matches.length) return
    this.activeMatchIndex = (this.activeMatchIndex - 1 + this.matches.length) % this.matches.length
    this.rebuildDocument(true)
    this.scheduleScrollToActiveMatch()
  }

  private scrollToActiveMatch(): void {
    if (!this.matches.length) {
      this.activeMatchIndex = 0
      this.updateFooter()
      this.renderer.requestRender()
      return
    }

    if (this.activeMatchIndex >= this.matches.length) {
      this.activeMatchIndex = this.matches.length - 1
    }

    const match = this.matches[this.activeMatchIndex]
    this.scrollBox?.scrollChildIntoView(match.blockId)
    this.updateFooter()
    this.renderer.requestRender()
  }

  private scheduleScrollToActiveMatch(): void {
    if (this.pendingScrollTimer) clearTimeout(this.pendingScrollTimer)
    this.pendingScrollTimer = setTimeout(() => {
      this.pendingScrollTimer = null
      this.scrollToActiveMatch()
    }, 0)
  }

  private scrollDocument(delta: number): void {
    this.scrollBox?.scrollBy(delta / 5, "viewport")
    this.renderer.requestRender()
  }

  private showStatus(message: string, duration = 3000): void {
    if (this.pendingStatusTimer) clearTimeout(this.pendingStatusTimer)
    this.pendingStatusTimer = null
    this.statusMessage = message
    this.updateFooter()
    this.renderer.requestRender()

    if (duration <= 0) return

    this.pendingStatusTimer = setTimeout(() => {
      this.pendingStatusTimer = null
      this.statusMessage = ""
      this.updateFooter()
      this.renderer.requestRender()
    }, duration)
  }

  private clearStatus(): void {
    if (this.pendingStatusTimer) clearTimeout(this.pendingStatusTimer)
    this.pendingStatusTimer = null
    if (!this.statusMessage) return
    this.statusMessage = ""
    this.updateFooter()
    this.renderer.requestRender()
  }

  private getEditableSourcePath(): string | null {
    if (!this.sourcePath || this.sourcePath === "stdin") return null

    const resolvedPath = resolve(this.sourcePath)
    return existsSync(resolvedPath) ? resolvedPath : null
  }

  private async editCurrentFile(): Promise<void> {
    const filePath = this.getEditableSourcePath()
    if (!filePath) {
      this.showStatus("Edit is only available for files on disk")
      return
    }

    const controlFile = process.env.OPENMARKDOWN_CONTROL_FILE
    if (!controlFile) {
      this.showStatus("Edit mode requires the OpenMarkdown launcher")
      return
    }

    this.clearStatus()

    try {
      await writeFile(controlFile, JSON.stringify({ action: "edit", filePath }), "utf8")
      this.cleanup()
      process.exit(EDIT_REQUEST_EXIT_CODE)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.showStatus(`Edit request failed: ${message}`)
      process.exit(1)
    }
  }

  private async refresh(): Promise<void> {
    if (this.fileReloading) return
    this.fileReloading = true
    try {
      await this.loadSource()
      this.rebuildDocument(true)
      this.scrollToActiveMatch()
    } finally {
      this.fileReloading = false
    }
  }

  private async openFile(nextPath: string): Promise<void> {
    this.sourcePath = nextPath
    this.activeMatchIndex = 0
    await this.loadSource()
    this.rebuildDocument(false)
  }

  private cleanup(): void {
    if (this.pendingScrollTimer) clearTimeout(this.pendingScrollTimer)
    if (this.pendingStatusTimer) clearTimeout(this.pendingStatusTimer)
    if (this.selectionListener) {
      this.renderer.keyInput.off("keypress", this.selectionListener)
      this.selectionListener = null
    }
    if (!this.renderer.isDestroyed) {
      this.renderer.destroy()
    }
  }

  isSearchActive(): boolean {
    return this.mode === "search"
  }

  closeSearch(): void {
    this.hideSearch()
  }

  private updateSearchDisplay(): void {
    const theme = themes[this.themeName]
    if (this.searchBar) {
      this.searchBar.borderColor = this.mode === "search" ? theme.accent : theme.borderStrong
    }
    if (!this.searchValue) return

    if (this.query.length > 0) {
      this.searchValue.content = this.mode === "search" ? `${this.query}█` : this.query
      this.searchValue.fg = theme.text
      return
    }

    this.searchValue.content = this.mode === "search" ? "█" : "Search markdown..."
    this.searchValue.fg = this.mode === "search" ? theme.text : theme.muted
  }

  private getBlockSpacing(block: MarkdownBlock, index: number): { top: number; bottom: number } {
    if (block.kind === "heading") {
      if (block.level === 1) {
        return { top: index === 0 ? 0 : 2, bottom: 1 }
      }

      if (block.level === 2) {
        return { top: index === 0 ? 0 : 1, bottom: 1 }
      }

      return { top: 1, bottom: 1 }
    }

    if (block.kind === "paragraph") {
      return { top: 0, bottom: 1 }
    }

    if (block.kind === "code" || block.kind === "table" || block.kind === "quote" || block.kind === "list" || block.kind === "hr") {
      return { top: 0, bottom: 1 }
    }

    return { top: 0, bottom: 0 }
  }

  private getDocumentMaxWidth(): number {
    return Math.max(44, this.renderer.terminalWidth - 10)
  }
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  targetFps: 60,
  useKittyKeyboard: {
    disambiguate: true,
    alternateKeys: true,
  },
})

const app = new MarkdownApp(renderer, process.argv[2])
await app.start()
