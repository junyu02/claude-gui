import { checkExists, readJson, writeJson, appendLine, readLines, readFileContent } from './api'

// ── Types ──
export interface ProjectContext {
  summary: string
  tags: string[]
  notes: string
  techStack: string[]
  lastUpdated: string
}

export interface ProjectPreferences {
  devPort?: number
  favoriteSkills: string[]
  modelPreference?: string
}

export interface HistoryEntry {
  id: string
  role: 'user' | 'assistant'
  parts: any[]
  time: string
  ts: number
}

export interface ProjectCommands {
  recent: string[]
  frequent: Record<string, number>
}

export interface ProjectRegistry {
  projects: { id: string; name: string; path: string; devPort?: number }[]
}

// ── Paths ──
const guiDir   = (pp: string) => `${pp}/.claude-gui`
const ctxPath  = (pp: string) => `${guiDir(pp)}/context.json`
const prefPath = (pp: string) => `${guiDir(pp)}/preferences.json`
const histPath = (pp: string) => `${guiDir(pp)}/history.jsonl`
const cmdPath  = (pp: string) => `${guiDir(pp)}/commands.json`

const REGISTRY = '~/.claude-gui/projects.json'

// ── Registry (global project list) ──
export async function loadRegistry(): Promise<ProjectRegistry> {
  const data = await readJson<ProjectRegistry>(REGISTRY)
  return data ?? { projects: [] }
}

export async function saveRegistry(reg: ProjectRegistry): Promise<void> {
  await writeJson(REGISTRY, reg)
}

// ── Ensure .claude-gui/ exists with defaults ──
export async function ensureGuiDir(pp: string): Promise<void> {
  const { exists } = await checkExists(guiDir(pp))
  if (!exists) {
    await writeJson(prefPath(pp), { favoriteSkills: [] } satisfies ProjectPreferences)
    await writeJson(cmdPath(pp),  { recent: [], frequent: {} } satisfies ProjectCommands)
    // context.json and history.jsonl are created on demand
  }
}

// ── History ──
export async function loadHistory(pp: string): Promise<HistoryEntry[]> {
  const lines = await readLines(histPath(pp))
  const entries: HistoryEntry[] = []
  for (const line of lines) {
    try { entries.push(JSON.parse(line)) } catch { /* skip malformed */ }
  }
  return entries
}

export async function appendHistory(pp: string, entry: HistoryEntry): Promise<void> {
  await appendLine(histPath(pp), JSON.stringify(entry))
}

// ── Preferences ──
export async function loadPreferences(pp: string): Promise<ProjectPreferences> {
  const data = await readJson<ProjectPreferences>(prefPath(pp))
  return data ?? { favoriteSkills: [] }
}

export async function savePreferences(pp: string, prefs: ProjectPreferences): Promise<void> {
  await writeJson(prefPath(pp), prefs)
}

// ── Context ──
export async function loadContext(pp: string): Promise<ProjectContext | null> {
  return readJson<ProjectContext>(ctxPath(pp))
}

export async function saveContext(pp: string, ctx: ProjectContext): Promise<void> {
  await writeJson(ctxPath(pp), ctx)
}

// ── Commands ──
export async function loadCommands(pp: string): Promise<ProjectCommands> {
  const data = await readJson<ProjectCommands>(cmdPath(pp))
  return data ?? { recent: [], frequent: {} }
}

export async function saveCommands(pp: string, cmds: ProjectCommands): Promise<void> {
  await writeJson(cmdPath(pp), cmds)
}

export async function trackCommand(pp: string, cmd: string): Promise<void> {
  const cmds = await loadCommands(pp)
  cmds.recent = [cmd, ...cmds.recent.filter(c => c !== cmd)].slice(0, 20)
  cmds.frequent[cmd] = (cmds.frequent[cmd] ?? 0) + 1
  await saveCommands(pp, cmds)
}

// ── Auto-generate context by scanning project files ──
export async function generateContext(pp: string): Promise<ProjectContext> {
  let summary = ''
  const tags: string[] = []
  const techStack: string[] = []

  // Try README
  const readme = await readFileContent(`${pp}/README.md`)
  if (readme) {
    const firstPara = readme.content.split('\n\n').slice(0, 2).join(' ').slice(0, 300)
    summary = firstPara.replace(/^#\s+.*\n?/, '').trim()
  }

  // Try package.json
  const pkg = await readJson<any>(`${pp}/package.json`)
  if (pkg) {
    tags.push('node')
    if (!summary && pkg.description) summary = pkg.description
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps.react)      { tags.push('react'); techStack.push('React') }
    if (deps.vue)        { tags.push('vue'); techStack.push('Vue') }
    if (deps.next)       { tags.push('next'); techStack.push('Next.js') }
    if (deps.typescript) { tags.push('typescript'); techStack.push('TypeScript') }
    if (deps.tailwindcss){ tags.push('tailwind'); techStack.push('Tailwind CSS') }
    if (deps.vite)       { tags.push('vite'); techStack.push('Vite') }
    if (deps.express)    { tags.push('express'); techStack.push('Express') }
  }

  // Try pyproject.toml / requirements.txt
  const { exists: hasPy } = await checkExists(`${pp}/pyproject.toml`)
  const { exists: hasReq } = await checkExists(`${pp}/requirements.txt`)
  if (hasPy || hasReq) { tags.push('python'); techStack.push('Python') }

  // Try Cargo.toml
  const { exists: hasCargo } = await checkExists(`${pp}/Cargo.toml`)
  if (hasCargo) { tags.push('rust'); techStack.push('Rust') }

  // Try go.mod
  const { exists: hasGo } = await checkExists(`${pp}/go.mod`)
  if (hasGo) { tags.push('go'); techStack.push('Go') }

  if (!summary) summary = 'No description available'

  const ctx: ProjectContext = { summary, tags, techStack, notes: '', lastUpdated: new Date().toISOString() }
  await saveContext(pp, ctx)
  return ctx
}

// ── Detect .planning/ for GSD ──
export async function hasGsdPlanning(pp: string): Promise<boolean> {
  const { exists, isDir } = await checkExists(`${pp}/.planning`)
  return exists && isDir
}
