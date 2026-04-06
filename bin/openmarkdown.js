#!/usr/bin/env node

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const binDir = dirname(fileURLToPath(import.meta.url))
const entryPath = join(binDir, "..", "src", "runner.ts")
const args = [entryPath, ...process.argv.slice(2)]
const defaultBunPath = join(homedir(), ".bun", "bin", "bun")
const bunBinary = process.env.BUN_BINARY || (existsSync(defaultBunPath) ? defaultBunPath : "bun")

const child = spawn(bunBinary, args, {
  stdio: "inherit",
  env: process.env,
})

child.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    console.error("openmarkdown requires Bun. Install it from https://bun.sh and try again.")
    process.exit(1)
  }

  console.error(error)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
