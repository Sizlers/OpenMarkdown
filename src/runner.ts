import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

type EditorCandidate = {
  label: string
  command: string
  args: string[]
  configured: boolean
}

const EDIT_REQUEST_EXIT_CODE = 91
const EDITOR_FALLBACKS = ["hx", "helix", "nvim", "vim", "nano", "vi"]
const CONTROL_ENV_KEY = "OPENMARKDOWN_CONTROL_FILE"
const entryPath = join(dirname(fileURLToPath(import.meta.url)), "index.ts")

function parseCommandString(commandLine: string): string[] | null {
  const args: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of commandLine) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === "\\" && quote !== "'") {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (escaping || quote) return null
  if (current.length > 0) args.push(current)
  return args
}

function commandExists(command: string): boolean {
  if (!command) return false

  if (command.includes("/")) {
    return existsSync(command)
  }

  return (process.env.PATH ?? "")
    .split(":")
    .filter(Boolean)
    .some((entry) => existsSync(join(entry, command)))
}

function resolveEditorCandidates(): EditorCandidate[] | null {
  const configured = process.env.VISUAL?.trim() || process.env.EDITOR?.trim() || ""
  const candidates: EditorCandidate[] = []
  const seen = new Set<string>()

  if (configured) {
    const parsed = parseCommandString(configured)
    if (!parsed || parsed.length === 0) {
      return null
    }

    candidates.push({
      label: configured,
      command: parsed[0],
      args: parsed.slice(1),
      configured: true,
    })
    seen.add(parsed[0])
  }

  for (const fallback of EDITOR_FALLBACKS) {
    if (seen.has(fallback)) continue
    candidates.push({ label: fallback, command: fallback, args: [], configured: false })
  }

  return candidates
}

function runEditor(filePath: string): boolean {
  const candidates = resolveEditorCandidates()
  if (!candidates) {
    console.error("Could not parse $VISUAL or $EDITOR")
    return false
  }

  for (const candidate of candidates) {
    if (!commandExists(candidate.command)) continue

    const result = spawnSync(candidate.command, [...candidate.args, filePath], {
      stdio: "inherit",
      env: process.env,
    })

    if (result.error) {
      const code = typeof result.error === "object" && "code" in result.error ? String(result.error.code) : ""
      if (code === "ENOENT") continue
      console.error(`Editor launch failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`)
      return false
    }

    if (candidate.configured || result.signal || (result.status ?? 0) === 0) {
      return true
    }
  }

  console.error("No working editor found. Set $VISUAL or $EDITOR")
  return false
}

function readEditRequest(controlFile: string): { action?: string; filePath?: string } {
  try {
    const raw = readFileSync(controlFile, "utf8").trim()
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const controlDir = mkdtempSync(join(tmpdir(), "openmarkdown-"))
const controlFile = join(controlDir, "control.json")
let nextArgs = process.argv.slice(2)

try {
  while (true) {
    writeFileSync(controlFile, "", "utf8")

    const result = spawnSync(process.execPath, [entryPath, ...nextArgs], {
      stdio: "inherit",
      env: { ...process.env, [CONTROL_ENV_KEY]: controlFile },
    })

    if (result.error) {
      throw result.error
    }

    if (result.signal) {
      process.kill(process.pid, result.signal)
      break
    }

    const exitCode = result.status ?? 1
    if (exitCode !== EDIT_REQUEST_EXIT_CODE) {
      process.exit(exitCode)
    }

    const request = readEditRequest(controlFile)
    if (request.action !== "edit" || !request.filePath) {
      console.error("Edit request was missing a file path")
      process.exit(1)
    }

    if (!runEditor(request.filePath)) {
      process.exit(1)
    }

    nextArgs = [request.filePath]
  }
} finally {
  rmSync(controlDir, { recursive: true, force: true })
}
