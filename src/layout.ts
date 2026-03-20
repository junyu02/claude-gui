// ── Layout system — free canvas panel arrangement ────────────────────

export type PanelId =
  | 'chat'
  | 'preview'
  | 'terminal'
  | 'code'
  | 'skills'
  | 'mcp'
  | 'plugins'
  | 'progress'

export type PanelMode = 'split' | 'tabs'

export interface ColumnConfig {
  /** Ordered panels top→bottom, min length 1 */
  panels: PanelId[]
  /**
   * Height fractions for panels[0..N-2] (split mode only).
   * panels[N-1] gets the remainder: 1 - sum(splitRatios).
   * When omitted, panels are equally sized.
   */
  splitRatios?: number[]
  /** Pixel width of this column. undefined = flex:1 (takes remaining space) */
  width?: number
  /** 'split' = panels divided vertically, 'tabs' = browser-like tab bar. Default: 'split' */
  mode?: PanelMode
}

export interface AppLayout {
  sidebarWidth: number
  /** Panels in the bottom section of the sidebar (length >= 1 = show bottom section) */
  sidebarBottomPanels?: PanelId[]
  /** 'split' = panels divided vertically, 'tabs' = tab bar. Default: 'split' */
  sidebarMode?: PanelMode
  /** Fraction of sidebar height the file-tree takes when sidebarBottomPanels is set (0–1), default 0.45 */
  sidebarSplitRatio?: number
  /** Ordered columns (excluding sidebar) */
  columns: ColumnConfig[]
}

// ── Panel metadata ────────────────────────────────────────────────────
export const PANEL_META: Record<PanelId, { label: string; labelEn: string; color: string; emoji: string }> = {
  chat:     { label:'对话',    labelEn:'Chat',     color:'#7C5CFC', emoji:'💬' },
  preview:  { label:'预览',    labelEn:'Preview',  color:'#56B6C2', emoji:'🌐' },
  terminal: { label:'终端',    labelEn:'Terminal', color:'#3ECF8E', emoji:'⌨️' },
  code:     { label:'代码',    labelEn:'Code',     color:'#61AFEF', emoji:'📄' },
  skills:   { label:'Skills', labelEn:'Skills',   color:'#E5C07B', emoji:'⚡' },
  mcp:      { label:'MCP',    labelEn:'MCP',      color:'#C678DD', emoji:'🔌' },
  plugins:  { label:'插件',    labelEn:'Plugins',  color:'#E06C75', emoji:'📦' },
  progress: { label:'进度',    labelEn:'Progress', color:'#98C379', emoji:'📊' },
}

// ── Preset layouts ────────────────────────────────────────────────────
export interface LayoutPreset {
  id: string
  name: string
  nameEn: string
  layout: AppLayout
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'default',
    name: '默认',
    nameEn: 'Default',
    layout: {
      sidebarWidth: 240,
      columns: [
        { panels: ['chat'] },
        { panels: ['preview'], width: 360 },
      ],
    },
  },
  {
    id: 'dev',
    name: '开发者',
    nameEn: 'Developer',
    layout: {
      sidebarWidth: 240,
      columns: [
        { panels: ['chat'] },
        { panels: ['preview', 'terminal'], splitRatios: [0.55], width: 380 },
      ],
    },
  },
  {
    id: 'fullstack',
    name: '全栈',
    nameEn: 'Full Stack',
    layout: {
      sidebarWidth: 220,
      columns: [
        { panels: ['chat', 'terminal'], splitRatios: [0.65] },
        { panels: ['preview'], width: 380 },
      ],
    },
  },
  {
    id: 'code-review',
    name: '代码审查',
    nameEn: 'Code Review',
    layout: {
      sidebarWidth: 220,
      columns: [
        { panels: ['chat'] },
        { panels: ['code'], width: 420 },
      ],
    },
  },
  {
    id: 'triple',
    name: '三栏',
    nameEn: 'Triple',
    layout: {
      sidebarWidth: 200,
      columns: [
        { panels: ['chat'] },
        { panels: ['preview'], width: 340 },
        { panels: ['terminal'], width: 300 },
      ],
    },
  },
  {
    id: 'focused',
    name: '专注对话',
    nameEn: 'Focused',
    layout: {
      sidebarWidth: 200,
      columns: [
        { panels: ['chat'] },
      ],
    },
  },
]

// ── Migration ─────────────────────────────────────────────────────────
export function migrateLayout(raw: any): AppLayout {
  if (!raw || typeof raw !== 'object') return LAYOUT_PRESETS[0].layout

  const migrateCol = (c: any): ColumnConfig => {
    // Already v3+ format
    if (Array.isArray(c.panels)) return c as ColumnConfig
    // v2 format: {top, bottom?, splitRatio?, width?}
    const panels: PanelId[] = [c.top, ...(c.bottom ? [c.bottom] : [])]
    const splitRatios = c.bottom ? [c.splitRatio ?? 0.5] : undefined
    return {
      panels,
      ...(splitRatios ? { splitRatios } : {}),
      ...(c.width !== undefined ? { width: c.width } : {}),
    }
  }

  // Migrate sidebarBottom (old single panel) → sidebarBottomPanels
  const sidebarBottomPanels: PanelId[] | undefined =
    Array.isArray(raw.sidebarBottomPanels) ? raw.sidebarBottomPanels
    : raw.sidebarBottom ? [raw.sidebarBottom]
    : undefined

  return {
    sidebarWidth: raw.sidebarWidth ?? 240,
    ...(sidebarBottomPanels ? { sidebarBottomPanels } : {}),
    ...(raw.sidebarMode ? { sidebarMode: raw.sidebarMode } : {}),
    ...(raw.sidebarSplitRatio != null ? { sidebarSplitRatio: raw.sidebarSplitRatio } : {}),
    columns: Array.isArray(raw.columns) ? raw.columns.map(migrateCol) : LAYOUT_PRESETS[0].layout.columns,
  }
}

// ── Persistence ───────────────────────────────────────────────────────
const STORAGE_KEY_V3 = 'claude-gui-layout-v3'
const STORAGE_KEY_V2 = 'claude-gui-layout-v2'

export function loadLayout(): AppLayout {
  try {
    const v3 = localStorage.getItem(STORAGE_KEY_V3)
    if (v3) return migrateLayout(JSON.parse(v3))
    const v2 = localStorage.getItem(STORAGE_KEY_V2)
    if (v2) {
      const migrated = migrateLayout(JSON.parse(v2))
      localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(migrated))
      return migrated
    }
  } catch {}
  return LAYOUT_PRESETS[0].layout
}

export function saveLayout(layout: AppLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(layout))
  } catch {}
}
