// ── Plugin system ────────────────────────────────────────────────────
import { readJson, writeJson } from './api'

export type PluginCategory = 'ui' | 'code' | 'workflow' | 'ai' | 'mcp'

export interface Plugin {
  id: string
  name: string
  description: string
  descriptionEn: string
  version: string
  author: string
  category: PluginCategory
  // For skill plugins: a slash command that gets injected into the palette
  skillCmd?: string
  // For MCP plugins: config to add to claude mcp
  mcpConfig?: { name: string; command: string; args: string[]; env?: Record<string, string> }
  homepage?: string
  tags: string[]
}

export interface InstalledPlugins {
  installed: string[]  // plugin ids
}

const PLUGINS_PATH = '~/.claude-gui/plugins.json'

export async function loadInstalledPlugins(): Promise<string[]> {
  const data = await readJson<InstalledPlugins>(PLUGINS_PATH)
  return data?.installed ?? []
}

export async function saveInstalledPlugins(ids: string[]): Promise<void> {
  await writeJson(PLUGINS_PATH, { installed: ids } satisfies InstalledPlugins)
}

export async function installPlugin(id: string): Promise<void> {
  const current = await loadInstalledPlugins()
  if (!current.includes(id)) {
    await saveInstalledPlugins([...current, id])
  }
}

export async function uninstallPlugin(id: string): Promise<void> {
  const current = await loadInstalledPlugins()
  await saveInstalledPlugins(current.filter(i => i !== id))
}

// ── Marketplace registry ─────────────────────────────────────────────
// In a real release this could be fetched from a GitHub JSON
export const MARKETPLACE_PLUGINS: Plugin[] = [
  {
    id: 'plugin-pptx',
    name: 'PPTX Creator',
    description: '用AI生成和编辑PowerPoint演示文稿',
    descriptionEn: 'Generate and edit PowerPoint presentations with AI',
    version: '1.0.0',
    author: 'claude-gui',
    category: 'workflow',
    skillCmd: '/pptx',
    tags: ['pptx', 'presentation', 'slides'],
  },
  {
    id: 'plugin-pdf',
    name: 'PDF Toolkit',
    description: '读取、合并、拆分PDF文件',
    descriptionEn: 'Read, merge, and split PDF files',
    version: '1.0.0',
    author: 'claude-gui',
    category: 'workflow',
    skillCmd: '/pdf',
    tags: ['pdf', 'document'],
  },
  {
    id: 'plugin-chinese-writing',
    name: 'Chinese Writing',
    description: '中文写作规范和优化助手',
    descriptionEn: 'Chinese writing style and grammar assistant',
    version: '1.0.0',
    author: 'claude-gui',
    category: 'ai',
    skillCmd: '/chinese-writing',
    tags: ['writing', 'chinese', '中文'],
  },
  {
    id: 'plugin-figma',
    name: 'Figma Integration',
    description: '将Figma设计转为生产级代码',
    descriptionEn: 'Convert Figma designs to production-ready code',
    version: '1.0.0',
    author: 'claude-gui',
    category: 'ui',
    skillCmd: '/figma:implement-design',
    tags: ['figma', 'design', 'ui'],
    homepage: 'https://www.figma.com/community',
  },
  {
    id: 'plugin-mcp-context7',
    name: 'Context7 MCP',
    description: '接入Context7文档检索服务',
    descriptionEn: 'Connect to Context7 documentation retrieval',
    version: '1.0.0',
    author: 'context7',
    category: 'mcp',
    mcpConfig: {
      name: 'context7',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp@latest'],
    },
    tags: ['mcp', 'docs', 'context'],
    homepage: 'https://context7.com',
  },
  {
    id: 'plugin-mcp-puppeteer',
    name: 'Puppeteer MCP',
    description: '浏览器自动化和截图',
    descriptionEn: 'Browser automation and screenshot capture',
    version: '1.0.0',
    author: 'anthropics',
    category: 'mcp',
    mcpConfig: {
      name: 'puppeteer',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
    tags: ['mcp', 'browser', 'automation'],
  },
  {
    id: 'plugin-code-review',
    name: 'Deep Code Review',
    description: '深度代码审查，包含安全扫描',
    descriptionEn: 'Deep code review with security scanning',
    version: '1.0.0',
    author: 'claude-gui',
    category: 'code',
    skillCmd: '/code-review',
    tags: ['code', 'review', 'security'],
  },
  {
    id: 'plugin-mcp-sequential-thinking',
    name: 'Sequential Thinking MCP',
    description: '结构化多步骤推理',
    descriptionEn: 'Structured multi-step reasoning',
    version: '1.0.0',
    author: 'anthropics',
    category: 'mcp',
    mcpConfig: {
      name: 'sequential-thinking',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    tags: ['mcp', 'reasoning', 'thinking'],
  },
]

export const CAT_LABEL: Record<PluginCategory, string> = {
  ui: 'UI',
  code: 'Code',
  workflow: 'Workflow',
  ai: 'AI',
  mcp: 'MCP',
}

export const CAT_COLOR: Record<PluginCategory, { bg: string; txt: string; bdr: string }> = {
  ui:       { bg:'rgba(124,92,252,0.12)', txt:'#9B82FF', bdr:'rgba(124,92,252,0.25)' },
  code:     { bg:'rgba(97,175,239,0.10)', txt:'#61AFEF', bdr:'rgba(97,175,239,0.20)' },
  workflow: { bg:'rgba(62,207,142,0.10)', txt:'#3ECF8E', bdr:'rgba(62,207,142,0.20)' },
  ai:       { bg:'rgba(229,192,123,0.10)',txt:'#E5C07B', bdr:'rgba(229,192,123,0.20)' },
  mcp:      { bg:'rgba(86,182,194,0.10)', txt:'#56B6C2', bdr:'rgba(86,182,194,0.20)' },
}
