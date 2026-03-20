// ── Shared types & design tokens ────────────────────────────────────

export type Lang = 'zh' | 'en'
export const T = {
  zh: {
    projects:'项目', files:'文件', addProject:'添加项目',
    preview:'预览', skills:'Skills', mcp:'MCP', code:'代码',
    placeholder:'输入消息，或用 / 触发命令…',
    hint:'Enter 发送 · Shift+Enter 换行 · / 触发命令 · Shift+Tab 切换模式',
    startServer:'启动 dev server 后显示预览',
    noMatch:'无匹配命令', copied:'已复制', copy:'复制',
    before:'修改前', after:'修改后',
    read:'读取', write:'修改', exec:'执行',
    selectFile:'点击左侧文件以查看内容',
    live:'实时', lines:'行', raw:'源码', rendered:'预览',
    terminal:'终端', plugins:'插件',
    modelLabel:'模型', effortLabel:'能力',
    pluginInstalled:'已安装', pluginInstall:'安装', pluginUninstall:'卸载',
    pluginMarketplace:'插件市场',
    tokenCost:'费用', tokenInput:'输入', tokenOutput:'输出',
  },
  en: {
    projects:'Projects', files:'Files', addProject:'Add Project',
    preview:'Preview', skills:'Skills', mcp:'MCP', code:'Code',
    placeholder:'Message, or / for commands…',
    hint:'Enter to send · Shift+Enter for newline · / for commands · Shift+Tab to cycle mode',
    startServer:'Start dev server to show preview',
    noMatch:'No commands found', copied:'Copied', copy:'Copy',
    before:'Before', after:'After',
    read:'Read', write:'Write', exec:'Exec',
    selectFile:'Click a file on the left to view its contents',
    live:'Live', lines:'lines', raw:'Raw', rendered:'Preview',
    terminal:'Terminal', plugins:'Plugins',
    modelLabel:'Model', effortLabel:'Effort',
    pluginInstalled:'Installed', pluginInstall:'Install', pluginUninstall:'Remove',
    pluginMarketplace:'Plugin Marketplace',
    tokenCost:'Cost', tokenInput:'In', tokenOutput:'Out',
  },
} as const

export type MsgRole = 'user' | 'assistant'
export type Part =
  | { type: 'text'; content: string }
  | { type: 'file_op'; op: 'read' | 'write' | 'exec'; path: string }
  | { type: 'code'; lang: string; content: string }
  | { type: 'diff'; filename: string; before: string; after: string }

export interface Message {
  id: string
  role: MsgRole
  parts: Part[]
  time: string
  cost?: number
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
}
export interface FileNode { name: string; type: 'file' | 'folder'; ext?: string; children?: FileNode[] }
export interface Project { id: string; name: string; path: string; devPort?: number; files: FileNode[] }
export interface Skill { id: string; name: string; desc: string; descEn: string; cmd: string; cat: 'ui'|'code'|'workflow'|'ai' }
export type ColId = 'sidebar' | 'chat' | 'right'

// ── Design tokens ────────────────────────────────────────────────────
export const B  = 'rgba(255,255,255,0.07)'
export const BM = 'rgba(255,255,255,0.12)'
export const EXT_CLR: Record<string,string> = {
  tsx:'#61AFEF', ts:'#61AFEF', jsx:'#56B6C2', js:'#E5C07B',
  css:'#C678DD', json:'#E06C75', md:'#98C379', py:'#E5C07B',
  svg:'#56B6C2', pdf:'#F87171', png:'#56B6C2', jpg:'#56B6C2',
}
export const extClr = (e?: string) => e ? (EXT_CLR[e] ?? '#70737D') : '#70737D'
export const CAT_CLR = {
  ui:       { bg:'rgba(124,92,252,0.12)', txt:'#9B82FF', bdr:'rgba(124,92,252,0.25)' },
  code:     { bg:'rgba(97,175,239,0.10)', txt:'#61AFEF', bdr:'rgba(97,175,239,0.20)' },
  workflow: { bg:'rgba(62,207,142,0.10)', txt:'#3ECF8E', bdr:'rgba(62,207,142,0.20)' },
  ai:       { bg:'rgba(229,192,123,0.10)',txt:'#E5C07B', bdr:'rgba(229,192,123,0.20)' },
}

export const SKILLS: Skill[] = [
  { id:'fe',    name:'frontend-design',   desc:'生成生产级前端界面',    descEn:'Generate production-grade UI',    cmd:'/frontend-design',    cat:'ui'       },
  { id:'cine',  name:'cinematic-frontend', desc:'电影级像素完美前端',    descEn:'Cinematic pixel-perfect frontend', cmd:'/cinematic-frontend', cat:'ui'       },
  { id:'ui',    name:'ui-design',          desc:'APP UI/UX 原型设计',   descEn:'APP UI/UX prototyping',           cmd:'/ui-design',          cat:'ui'       },
  { id:'commit',name:'commit',             desc:'创建规范的 Git commit', descEn:'Create a conventional commit',    cmd:'/commit',             cat:'workflow' },
  { id:'rev',   name:'code-review',        desc:'审查代码质量',          descEn:'Review code quality',             cmd:'/code-review',        cat:'code'     },
  { id:'plan',  name:'gsd:plan-phase',     desc:'规划实现阶段',          descEn:'Plan a phase',                    cmd:'/gsd:plan-phase',     cat:'workflow' },
  { id:'exec',  name:'gsd:execute-phase',  desc:'执行阶段计划',          descEn:'Execute a phase plan',            cmd:'/gsd:execute-phase',  cat:'workflow' },
  { id:'sum',   name:'summarizer',         desc:'总结任意内容',          descEn:'Summarize anything',              cmd:'/summarizer',         cat:'ai'       },
]

// ── Model options ────────────────────────────────────────────────────
export interface ModelOption {
  id: string
  label: string
  desc: string
  badge: string
  color: string
}
export const MODELS: ModelOption[] = [
  { id:'claude-haiku-4-5-20251001', label:'Haiku',  desc:'快速&经济', badge:'⚡', color:'#E5C07B' },
  { id:'claude-sonnet-4-5',         label:'Sonnet', desc:'均衡',      badge:'◉', color:'#61AFEF' },
  { id:'claude-opus-4-5',           label:'Opus',   desc:'最强能力',  badge:'◆', color:'#9B82FF' },
]
export const DEFAULT_MODEL = 'claude-sonnet-4-5'
