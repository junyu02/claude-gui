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

export interface ColumnConfig {
  /** Top panel in this column */
  top: PanelId
  /** Optional second panel stacked below */
  bottom?: PanelId
  /** Fraction of height the top panel takes when both are set (0–1), default 0.5 */
  splitRatio?: number
  /** Pixel width of this column. undefined = flex:1 (takes remaining space) */
  width?: number
}

export interface AppLayout {
  sidebarWidth: number
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
        { top: 'chat' },
        { top: 'preview', width: 360 },
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
        { top: 'chat' },
        { top: 'preview', bottom: 'terminal', width: 380, splitRatio: 0.55 },
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
        { top: 'chat', bottom: 'terminal', splitRatio: 0.65 },
        { top: 'preview', width: 380 },
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
        { top: 'chat' },
        { top: 'code', width: 420 },
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
        { top: 'chat' },
        { top: 'preview', width: 340 },
        { top: 'terminal', width: 300 },
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
        { top: 'chat' },
      ],
    },
  },
]

// ── Persistence ───────────────────────────────────────────────────────
const STORAGE_KEY = 'claude-gui-layout-v2'

export function loadLayout(): AppLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppLayout
  } catch {}
  return LAYOUT_PRESETS[0].layout
}

export function saveLayout(layout: AppLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {}
}
