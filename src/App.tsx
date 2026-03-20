import React, { useState, useRef, useEffect, useCallback } from 'react'
import { gsap } from 'gsap'
import {
  FolderOpen, Folder, FileCode, Plus, ChevronRight, ChevronDown,
  Send, RefreshCw, Copy, Check, ExternalLink, Zap, Terminal,
  Globe, Cpu, AlignLeft, Columns2, Sparkles, Hash, Languages,
  Eye, Code2, FileText, GripVertical, ListChecks,
} from 'lucide-react'
import { loadRegistry, saveRegistry, ensureGuiDir, loadHistory, appendHistory, loadContext, generateContext, hasGsdPlanning, trackCommand, HistoryEntry, ProjectContext } from './storage'
import { readDir, readFileContent, streamChat, abortChat, type ChatStreamEvent } from './api'

// ─── i18n ─────────────────────────────────────────────────────────────
type Lang = 'zh' | 'en'
const T = {
  zh: {
    projects:'项目', files:'文件', addProject:'添加项目',
    preview:'预览', skills:'Skills', mcp:'MCP', code:'代码',
    placeholder:'输入消息，或用 / 触发命令…',
    hint:'Enter 发送 · Shift+Enter 换行 · / 触发命令',
    startServer:'启动 dev server 后显示预览',
    noMatch:'无匹配命令', copied:'已复制', copy:'复制',
    before:'修改前', after:'修改后',
    read:'读取', write:'修改', exec:'执行',
    selectFile:'点击左侧文件以查看内容',
    live:'实时', lines:'行', raw:'源码', rendered:'预览',
  },
  en: {
    projects:'Projects', files:'Files', addProject:'Add Project',
    preview:'Preview', skills:'Skills', mcp:'MCP', code:'Code',
    placeholder:'Message, or / for commands…',
    hint:'Enter to send · Shift+Enter for newline · / for commands',
    startServer:'Start dev server to show preview',
    noMatch:'No commands found', copied:'Copied', copy:'Copy',
    before:'Before', after:'After',
    read:'Read', write:'Write', exec:'Exec',
    selectFile:'Click a file on the left to view its contents',
    live:'Live', lines:'lines', raw:'Raw', rendered:'Preview',
  },
} as const

// ─── Types ────────────────────────────────────────────────────────────
type MsgRole = 'user' | 'assistant'
type Part =
  | { type: 'text'; content: string }
  | { type: 'file_op'; op: 'read' | 'write' | 'exec'; path: string }
  | { type: 'code'; lang: string; content: string }
  | { type: 'diff'; filename: string; before: string; after: string }
interface Message { id: string; role: MsgRole; parts: Part[]; time: string }
interface FileNode { name: string; type: 'file' | 'folder'; ext?: string; children?: FileNode[] }
interface Project { id: string; name: string; path: string; devPort?: number; files: FileNode[] }
interface Skill { id: string; name: string; desc: string; descEn: string; cmd: string; cat: 'ui'|'code'|'workflow'|'ai' }


const SKILLS: Skill[] = [
  { id:'fe',    name:'frontend-design',   desc:'生成生产级前端界面',    descEn:'Generate production-grade UI',    cmd:'/frontend-design',    cat:'ui'       },
  { id:'cine',  name:'cinematic-frontend', desc:'电影级像素完美前端',    descEn:'Cinematic pixel-perfect frontend', cmd:'/cinematic-frontend', cat:'ui'       },
  { id:'ui',    name:'ui-design',          desc:'APP UI/UX 原型设计',   descEn:'APP UI/UX prototyping',           cmd:'/ui-design',          cat:'ui'       },
  { id:'commit',name:'commit',             desc:'创建规范的 Git commit', descEn:'Create a conventional commit',    cmd:'/commit',             cat:'workflow' },
  { id:'rev',   name:'code-review',        desc:'审查代码质量',          descEn:'Review code quality',             cmd:'/code-review',        cat:'code'     },
  { id:'plan',  name:'gsd:plan-phase',     desc:'规划实现阶段',          descEn:'Plan a phase',                    cmd:'/gsd:plan-phase',     cat:'workflow' },
  { id:'exec',  name:'gsd:execute-phase',  desc:'执行阶段计划',          descEn:'Execute a phase plan',            cmd:'/gsd:execute-phase',  cat:'workflow' },
  { id:'sum',   name:'summarizer',         desc:'总结任意内容',          descEn:'Summarize anything',              cmd:'/summarizer',         cat:'ai'       },
]

// ─── Design tokens ────────────────────────────────────────────────────
const B  = 'rgba(255,255,255,0.07)'
const BM = 'rgba(255,255,255,0.12)'
const EXT_CLR: Record<string,string> = {
  tsx:'#61AFEF', ts:'#61AFEF', jsx:'#56B6C2', js:'#E5C07B',
  css:'#C678DD', json:'#E06C75', md:'#98C379', py:'#E5C07B',
  svg:'#56B6C2', pdf:'#F87171', png:'#56B6C2', jpg:'#56B6C2',
}
const extClr = (e?: string) => e ? (EXT_CLR[e] ?? '#70737D') : '#70737D'
const CAT_CLR = {
  ui:       { bg:'rgba(124,92,252,0.12)', txt:'#9B82FF', bdr:'rgba(124,92,252,0.25)' },
  code:     { bg:'rgba(97,175,239,0.10)', txt:'#61AFEF', bdr:'rgba(97,175,239,0.20)' },
  workflow: { bg:'rgba(62,207,142,0.10)', txt:'#3ECF8E', bdr:'rgba(62,207,142,0.20)' },
  ai:       { bg:'rgba(229,192,123,0.10)',txt:'#E5C07B', bdr:'rgba(229,192,123,0.20)' },
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

// ─── Markdown parser ──────────────────────────────────────────────────
type MdBlock =
  | { t: 'h';      level: 1|2|3|4|5|6; text: string }
  | { t: 'code';   lang: string; code: string }
  | { t: 'quote';  lines: string[] }
  | { t: 'ul';     items: string[] }
  | { t: 'ol';     items: string[] }
  | { t: 'task';   items: { done: boolean; text: string }[] }
  | { t: 'hr' }
  | { t: 'table';  head: string[]; rows: string[][] }
  | { t: 'p';      text: string }

function parseBlocks(md: string): MdBlock[] {
  const lines = md.split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    // Fenced code block
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim(); const code: string[] = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      blocks.push({ t:'code', lang, code: code.join('\n') }); i++; continue
    }
    // Heading
    const hm = line.match(/^(#{1,6})\s+(.+)/)
    if (hm) { blocks.push({ t:'h', level: hm[1].length as 1|2|3|4|5|6, text: hm[2] }); i++; continue }
    // HR
    if (line.match(/^[-*_]{3,}$/)) { blocks.push({ t:'hr' }); i++; continue }
    // Blockquote
    if (line.startsWith('>')) {
      const ql: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) { ql.push(lines[i].replace(/^>\s?/, '')); i++ }
      blocks.push({ t:'quote', lines: ql }); continue
    }
    // Task list (before ul)
    if (line.match(/^[-*+]\s+\[[ x]\]/i)) {
      const items: { done: boolean; text: string }[] = []
      while (i < lines.length && lines[i].match(/^[-*+]\s+\[[ x]\]/i)) {
        const done = /\[x\]/i.test(lines[i])
        items.push({ done, text: lines[i].replace(/^[-*+]\s+\[[ x]\]\s*/i, '') }); i++
      }
      blocks.push({ t:'task', items }); continue
    }
    // Unordered list
    if (line.match(/^[-*+]\s+/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*+]\s+/)) { items.push(lines[i].replace(/^[-*+]\s+/, '')); i++ }
      blocks.push({ t:'ul', items }); continue
    }
    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++ }
      blocks.push({ t:'ol', items }); continue
    }
    // Table (GFM): line with | and next line is separator
    if (line.includes('|') && i+1 < lines.length && lines[i+1].match(/^\|?[-:| ]+\|/)) {
      const parseRow = (r: string) => r.split('|').map(c=>c.trim()).filter((_,ci,a) => ci>0 || a.length>1).filter(c=>c!=='')
      const head = parseRow(line); i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) { rows.push(parseRow(lines[i])); i++ }
      blocks.push({ t:'table', head, rows }); continue
    }
    // Paragraph
    const pl: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|[-*_]{3,}$)/)) {
      pl.push(lines[i]); i++
    }
    if (pl.length) blocks.push({ t:'p', text: pl.join(' ') })
  }
  return blocks
}

function renderInline(text: string, key?: string | number): React.ReactNode {
  const parts = text.split(/(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\))/g)
  return (
    <React.Fragment key={key}>
      {parts.map((seg, i) => {
        if (!seg) return null
        if (seg.startsWith('***') && seg.endsWith('***')) return <strong key={i}><em>{seg.slice(3,-3)}</em></strong>
        if (seg.startsWith('**')  && seg.endsWith('**'))  return <strong key={i}>{seg.slice(2,-2)}</strong>
        if (seg.startsWith('*')   && seg.endsWith('*'))   return <em key={i}>{seg.slice(1,-1)}</em>
        if (seg.startsWith('~~')  && seg.endsWith('~~'))  return <del key={i} style={{color:'#70737D'}}>{seg.slice(2,-2)}</del>
        if (seg.startsWith('`')   && seg.endsWith('`'))
          return <code key={i} style={{background:'rgba(124,92,252,0.15)',color:'#9B82FF',padding:'1px 5px',borderRadius:4,fontFamily:'JetBrains Mono, monospace',fontSize:'0.85em'}}>{seg.slice(1,-1)}</code>
        const img  = seg.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
        if (img)  return <img key={i} src={img[2]} alt={img[1]} style={{maxWidth:'100%',borderRadius:8,margin:'4px 0'}} />
        const link = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer" style={{color:'#9B82FF',textDecoration:'underline',textDecorationColor:'rgba(155,130,255,0.4)'}}>{link[1]}</a>
        return seg
      })}
    </React.Fragment>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks = parseBlocks(content)
  const hSizes: Record<number, {size:string, weight:string, mt:string}> = {
    1:{size:'1.6rem',weight:'700',mt:'0'},
    2:{size:'1.3rem',weight:'600',mt:'1.5rem'},
    3:{size:'1.1rem',weight:'600',mt:'1.25rem'},
    4:{size:'1rem',  weight:'600',mt:'1rem'},
    5:{size:'0.9rem',weight:'600',mt:'0.75rem'},
    6:{size:'0.85rem',weight:'600',mt:'0.5rem'},
  }
  return (
    <div style={{padding:'24px 28px',overflowY:'auto',flex:1,lineHeight:1.75,color:'#ECECF1',fontSize:'14px'}}>
      {blocks.map((b, bi) => {
        switch (b.t) {
          case 'h': {
            const s = hSizes[b.level]
            return <div key={bi} style={{fontSize:s.size,fontWeight:s.weight,marginTop:s.mt,marginBottom:'0.4rem',color:'#fff',lineHeight:1.3}}>{renderInline(b.text)}</div>
          }
          case 'code':
            return (
              <pre key={bi} style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${B}`,borderRadius:10,padding:'14px 16px',margin:'12px 0',overflowX:'auto',fontFamily:'JetBrains Mono, monospace',fontSize:'0.78rem',lineHeight:1.6,color:'#ABB2BF'}}>
                {b.lang && <div style={{fontSize:'9px',color:'#50505A',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>{b.lang}</div>}
                <code>{b.code}</code>
              </pre>
            )
          case 'quote':
            return (
              <blockquote key={bi} style={{borderLeft:'3px solid #7C5CFC',paddingLeft:16,margin:'12px 0',color:'#8B8B96',fontStyle:'italic'}}>
                {b.lines.map((l,li) => <p key={li} style={{margin:'4px 0'}}>{renderInline(l)}</p>)}
              </blockquote>
            )
          case 'ul':
            return <ul key={bi} style={{paddingLeft:20,margin:'8px 0',listStyleType:'disc',color:'#C8C8CF'}}>{b.items.map((item,ii)=><li key={ii} style={{marginBottom:4}}>{renderInline(item)}</li>)}</ul>
          case 'ol':
            return <ol key={bi} style={{paddingLeft:20,margin:'8px 0',listStyleType:'decimal',color:'#C8C8CF'}}>{b.items.map((item,ii)=><li key={ii} style={{marginBottom:4}}>{renderInline(item)}</li>)}</ol>
          case 'task':
            return (
              <ul key={bi} style={{paddingLeft:4,margin:'8px 0',listStyle:'none'}}>
                {b.items.map((item,ii)=>(
                  <li key={ii} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:4,color:item.done?'#3ECF8E':'#C8C8CF'}}>
                    <span style={{marginTop:2,flexShrink:0,opacity:item.done?1:0.4}}>{item.done ? '☑' : '☐'}</span>
                    <span style={{textDecoration:item.done?'line-through':'none',opacity:item.done?0.6:1}}>{renderInline(item.text)}</span>
                  </li>
                ))}
              </ul>
            )
          case 'hr':
            return <hr key={bi} style={{border:'none',borderTop:`1px solid ${B}`,margin:'20px 0'}} />
          case 'table':
            return (
              <div key={bi} style={{overflowX:'auto',margin:'12px 0'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                  <thead>
                    <tr>{b.head.map((h,hi)=><th key={hi} style={{padding:'8px 12px',textAlign:'left',borderBottom:`1px solid ${BM}`,color:'#ECECF1',fontWeight:600,whiteSpace:'nowrap'}}>{renderInline(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row,ri)=>(
                      <tr key={ri} style={{borderBottom:`1px solid ${B}`}}>
                        {row.map((cell,ci)=><td key={ci} style={{padding:'7px 12px',color:'#C8C8CF'}}>{renderInline(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'p':
            return <p key={bi} style={{margin:'8px 0',color:'#C8C8CF'}}>{renderInline(b.text)}</p>
          default: return null
        }
      })}
    </div>
  )
}

// ─── SyntaxLine ───────────────────────────────────────────────────────
function SyntaxLine({ code, ext }: { code: string; ext: string }) {
  const t = code.trimStart()
  if (t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--'))
    return <span style={{color:'#6A9955',fontStyle:'italic'}}>{code||'\u00A0'}</span>
  if (['ts','tsx','js','jsx'].includes(ext) && (t.startsWith('import ') || t.startsWith('export ')))
    return <span style={{color:'#C586C0'}}>{code||'\u00A0'}</span>
  if (ext==='md' && t.startsWith('#'))
    return <span style={{color:'#569CD6',fontWeight:600}}>{code||'\u00A0'}</span>
  if (ext==='json' && /^\s*"[^"]+"\s*:/.test(code))
    return <span style={{color:'#9CDCFE'}}>{code||'\u00A0'}</span>
  if (ext==='css' && /^\s*[a-z-]+\s*:/.test(code))
    return <span style={{color:'#9CDCFE'}}>{code||'\u00A0'}</span>
  return <span style={{color:'#ECECF1'}}>{code||'\u00A0'}</span>
}

// ─── FileViewer ───────────────────────────────────────────────────────
const IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','svg']
const TEXT_EXTS  = ['md','markdown','txt','ts','tsx','js','jsx','css','json','yaml','yml','py','html','sh','env']

function FileViewer({
  selectedPath, content, isLoading, mtime, onRefresh,
  showMdPreview, onToggleMdPreview, lang, blobUrl,
}: {
  selectedPath: string | null
  content: string | null
  isLoading: boolean
  mtime: number | null
  onRefresh: () => void
  showMdPreview: boolean
  onToggleMdPreview: () => void
  lang: Lang
  blobUrl?: string | null
}) {
  const t   = T[lang]
  const ext = selectedPath?.split('.').pop()?.toLowerCase() ?? ''
  const filename = selectedPath?.split('/').pop() ?? ''
  const rawUrl = blobUrl || (selectedPath ? `/api/raw?path=${encodeURIComponent(selectedPath)}` : '')
  const isImage = IMAGE_EXTS.includes(ext)
  const isPDF   = ext === 'pdf'
  const isMd    = ['md','markdown'].includes(ext)
  const lines   = content?.split('\n') ?? []

  if (!selectedPath) {
    return (
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24,textAlign:'center'}}>
        <FileText size={28} style={{color:'#3A3A42'}} />
        <p style={{fontSize:12,color:'#50505A'}}>{t.selectFile}</p>
        <p style={{fontSize:10,color:'#3A3A42',fontFamily:'JetBrains Mono, monospace'}}>⇧⌘V — {t.rendered}</p>
      </div>
    )
  }

  // Shared header
  const header = (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderBottom:`1px solid ${B}`,flexShrink:0}}>
      <FileCode size={11} style={{color:extClr(ext),flexShrink:0}} />
      <span style={{fontSize:12,color:'#8B8B96',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:'JetBrains Mono, monospace'}}>{filename}</span>
      {isLoading
        ? <span style={{fontSize:9,color:'#7C5CFC',fontFamily:'JetBrains Mono',animation:'pulse 1s infinite'}}>loading…</span>
        : mtime ? <span style={{fontSize:9,color:'#3ECF8E',fontFamily:'JetBrains Mono',display:'flex',alignItems:'center',gap:3}}><span style={{width:5,height:5,borderRadius:'50%',background:'#3ECF8E',display:'inline-block'}} />{t.live}</span> : null
      }
      {isMd && (
        <button onClick={onToggleMdPreview}
          style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,border:`1px solid ${showMdPreview?'rgba(124,92,252,0.4)':B}`,background:showMdPreview?'rgba(124,92,252,0.12)':'transparent',color:showMdPreview?'#9B82FF':'#50505A',fontSize:10,cursor:'pointer',transition:'all 0.15s'}}
          title="⇧⌘V"
        >
          {showMdPreview ? <><Code2 size={10}/>{t.raw}</> : <><Eye size={10}/>{t.rendered}</>}
        </button>
      )}
      <button onClick={onRefresh} style={{padding:4,borderRadius:6,background:'transparent',border:'none',cursor:'pointer',color:'#50505A',display:'flex',alignItems:'center'}}
        onMouseEnter={e=>e.currentTarget.style.color='#ECECF1'} onMouseLeave={e=>e.currentTarget.style.color='#50505A'}>
        <RefreshCw size={10} style={{animation:isLoading?'spin 1s linear infinite':undefined}} />
      </button>
    </div>
  )

  // Image viewer
  if (isImage) {
    return (
      <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
        {header}
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflow:'auto',background:'rgba(0,0,0,0.2)'}}>
          <img src={rawUrl} alt={filename} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:8,boxShadow:'0 4px 24px rgba(0,0,0,0.4)'}} />
        </div>
      </div>
    )
  }

  // PDF viewer
  if (isPDF) {
    return (
      <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
        {header}
        <div style={{flex:1,position:'relative'}}>
          <iframe src={rawUrl} style={{width:'100%',height:'100%',border:'none'}} title={filename} />
        </div>
      </div>
    )
  }

  // Markdown rendered preview
  if (isMd && showMdPreview && content !== null) {
    return (
      <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
        {header}
        <MarkdownPreview content={content} />
      </div>
    )
  }

  // Code / text viewer (default)
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {header}
      {/* Path breadcrumb */}
      <div style={{padding:'4px 12px',fontFamily:'JetBrains Mono, monospace',fontSize:10,color:'#3A3A42',borderBottom:`1px solid ${B}`,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {selectedPath}
      </div>
      {/* Code lines */}
      <div style={{flex:1,overflowY:'auto'}}>
        {content === null
          ? <div style={{padding:16,fontSize:12,color:'#50505A',fontFamily:'JetBrains Mono, monospace'}}>load failed</div>
          : (
            <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'JetBrains Mono, monospace',fontSize:12}}>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} style={{lineHeight:1.6}}>
                    <td style={{width:36,minWidth:36,textAlign:'right',paddingRight:12,paddingLeft:12,paddingTop:0,paddingBottom:0,color:'#3A3A42',fontSize:10,borderRight:`1px solid ${B}`,userSelect:'none',verticalAlign:'top'}}>{i+1}</td>
                    <td style={{paddingLeft:14,paddingRight:12,paddingTop:0,paddingBottom:0,verticalAlign:'top',whiteSpace:'pre'}}>
                      <SyntaxLine code={line} ext={ext} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
      {/* Footer */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 12px',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#3A3A42',borderTop:`1px solid ${B}`,flexShrink:0}}>
        <span>{lines.length} {t.lines}</span>
        <span>{ext.toUpperCase() || 'TEXT'}</span>
      </div>
    </div>
  )
}

// ─── FileTreeNode ─────────────────────────────────────────────────────
function FileTreeNode({ node, depth=0, basePath, onSelect, selectedPath }: {
  node: FileNode; depth?: number; basePath: string
  onSelect: (path: string) => void; selectedPath: string | null
}) {
  const [open, setOpen] = useState(depth < 1)
  const pl = 8 + depth * 12
  const fullPath = `${basePath}/${node.name}`
  if (node.type === 'folder') {
    return (
      <div>
        <button onClick={() => setOpen(o=>!o)}
          className="flex items-center gap-1.5 w-full py-0.5 rounded hover:bg-white/[0.04] group transition-colors"
          style={{paddingLeft:pl}}>
          {open ? <ChevronDown size={11} className="text-t3 shrink-0"/> : <ChevronRight size={11} className="text-t3 shrink-0"/>}
          {open ? <FolderOpen size={12} className="text-accent shrink-0"/> : <Folder size={12} className="text-t2 shrink-0"/>}
          <span className="text-xs text-t2 group-hover:text-t1 truncate transition-colors">{node.name}</span>
        </button>
        {open && node.children?.map((c,i) => <FileTreeNode key={i} node={c} depth={depth+1} basePath={fullPath} onSelect={onSelect} selectedPath={selectedPath}/>)}
      </div>
    )
  }
  const isSel = fullPath === selectedPath
  return (
    <button onClick={() => onSelect(fullPath)}
      className="flex items-center gap-1.5 w-full py-0.5 rounded transition-all"
      style={{paddingLeft:pl+16, background:isSel?'rgba(124,92,252,0.1)':'transparent'}}
      onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='rgba(255,255,255,0.03)'}}
      onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent'}}>
      <FileCode size={11} style={{color:isSel?'#9B82FF':extClr(node.ext),flexShrink:0}}/>
      <span className="text-xs truncate transition-colors" style={{color:isSel?'#9B82FF':'#50505A'}}>{node.name}</span>
    </button>
  )
}

// ─── Chat components ──────────────────────────────────────────────────
function FileOp({ op, path, lang }: { op:'read'|'write'|'exec'; path:string; lang:Lang }) {
  const t = T[lang]
  const cfg = { read:{icon:'📄',label:t.read,color:'#61AFEF'}, write:{icon:'✏️',label:t.write,color:'#3ECF8E'}, exec:{icon:'⚡',label:t.exec,color:'#E5C07B'} }[op]
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg my-0.5 font-mono text-xs" style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${B}`}}>
      <span>{cfg.icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{color:cfg.color}}>{cfg.label}</span>
      <span className="text-t3">{path}</span>
    </div>
  )
}

function CodeBlock({ lang: cLang, content, uiLang }: { lang:string; content:string; uiLang:Lang }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  const t = T[uiLang]
  return (
    <div className="rounded-xl overflow-hidden my-2 font-mono text-xs" style={{border:`1px solid ${B}`}}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{background:'rgba(255,255,255,0.03)',borderBottom:`1px solid ${B}`}}>
        <span className="text-t3 text-[10px] uppercase tracking-wider">{cLang}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-t3 hover:text-t1 transition-colors">
          {copied ? <Check size={11} style={{color:'#3ECF8E'}}/> : <Copy size={11}/>}
          <span className="text-[10px]">{copied ? t.copied : t.copy}</span>
        </button>
      </div>
      <pre className="p-4 text-t1 leading-relaxed overflow-x-auto bg-black/20 whitespace-pre">{content}</pre>
    </div>
  )
}

function DiffViewer({ filename, before, after, lang }: { filename:string; before:string; after:string; lang:Lang }) {
  const [mode, setMode] = useState<'split'|'inline'>('split')
  const t = T[lang]; const bL=before.split('\n'); const aL=after.split('\n')
  return (
    <div className="rounded-xl overflow-hidden my-2 font-mono text-xs" style={{border:`1px solid ${B}`}}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{background:'rgba(255,255,255,0.03)',borderBottom:`1px solid ${B}`}}>
        <div className="flex items-center gap-2"><FileCode size={11} className="text-t3"/><span className="text-t2">{filename}</span></div>
        <div className="flex rounded-lg overflow-hidden" style={{border:`1px solid ${B}`}}>
          {(['split','inline'] as const).map(m=>(
            <button key={m} onClick={()=>setMode(m)} className="flex items-center gap-1 px-2.5 py-1 text-[10px] transition-colors"
              style={{background:mode===m?'#7C5CFC':'transparent',color:mode===m?'#fff':'#50505A'}}>
              {m==='split'?<Columns2 size={10}/>:<AlignLeft size={10}/>}{m==='split'?'Split':'Inline'}
            </button>
          ))}
        </div>
      </div>
      {mode==='split' ? (
        <div className="flex">
          <div className="flex-1 p-3 min-w-0 overflow-x-auto" style={{background:'rgba(248,113,113,0.05)',borderRight:`1px solid ${B}`}}>
            <div className="text-[9px] text-t3 uppercase tracking-wider mb-2">{t.before}</div>
            {bL.map((l,i)=><div key={i} className="leading-relaxed whitespace-pre" style={{color:'rgba(248,113,113,0.75)'}}>{l}</div>)}
          </div>
          <div className="flex-1 p-3 min-w-0 overflow-x-auto" style={{background:'rgba(62,207,142,0.04)'}}>
            <div className="text-[9px] text-t3 uppercase tracking-wider mb-2">{t.after}</div>
            {aL.map((l,i)=><div key={i} className="leading-relaxed whitespace-pre" style={{color:'rgba(62,207,142,0.85)'}}>{l}</div>)}
          </div>
        </div>
      ) : (
        <div className="p-3 overflow-x-auto bg-black/20">
          {bL.map((l,i)=><div key={`b${i}`} className="flex leading-relaxed" style={{background:'rgba(248,113,113,0.08)'}}><span className="w-4 shrink-0 select-none" style={{color:'rgba(248,113,113,0.4)'}}>-</span><span className="whitespace-pre flex-1 px-1" style={{color:'rgba(248,113,113,0.8)'}}>{l}</span></div>)}
          {aL.map((l,i)=><div key={`a${i}`} className="flex leading-relaxed" style={{background:'rgba(62,207,142,0.06)'}}><span className="w-4 shrink-0 select-none" style={{color:'rgba(62,207,142,0.4)'}}>+</span><span className="whitespace-pre flex-1 px-1" style={{color:'rgba(62,207,142,0.85)'}}>{l}</span></div>)}
        </div>
      )}
    </div>
  )
}

function RenderPart({ part, idx, lang }: { part:Part; idx:number; lang:Lang }) {
  if (part.type==='file_op') return <FileOp key={idx} op={part.op} path={part.path} lang={lang}/>
  if (part.type==='code')    return <CodeBlock key={idx} lang={part.lang} content={part.content} uiLang={lang}/>
  if (part.type==='diff')    return <DiffViewer key={idx} filename={part.filename} before={part.before} after={part.after} lang={lang}/>
  const renderText = (text:string) => text.split('\n').map((line,li)=>(
    <p key={li} className="leading-relaxed" style={{marginBottom:line===''?'0.5em':0}}>
      {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg,si)=>{
        if(seg.startsWith('**')&&seg.endsWith('**')) return <strong key={si} className="text-t1 font-semibold">{seg.slice(2,-2)}</strong>
        if(seg.startsWith('`')&&seg.endsWith('`')) return <code key={si} className="font-mono text-[11px] px-1.5 py-0.5 rounded-md" style={{background:'rgba(124,92,252,0.15)',color:'#9B82FF'}}>{seg.slice(1,-1)}</code>
        return <span key={si}>{seg}</span>
      })}
    </p>
  ))
  return <div key={idx} className="text-sm text-t2 space-y-0.5">{renderText(part.content)}</div>
}

function Bubble({ msg, lang }: { msg:Message; lang:Lang }) {
  const isUser = msg.role==='user'
  return (
    <div className={`flex gap-3 mb-5 ${isUser?'flex-row-reverse':'flex-row'}`}>
      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5"
        style={isUser?{background:'#7C5CFC',color:'#fff'}:{background:'rgba(255,255,255,0.06)',border:`1px solid ${B}`,color:'#70737D'}}>
        {isUser?'O':'✦'}
      </div>
      <div className={`flex flex-col gap-1.5 max-w-[86%] ${isUser?'items-end':'items-start'}`}>
        <div className="px-4 py-3 rounded-2xl"
          style={isUser?{background:'#7C5CFC',color:'#fff',borderBottomRightRadius:6}:{background:'#1A1A1E',border:`1px solid ${B}`,borderTopLeftRadius:6}}>
          {msg.parts.map((p,i)=><RenderPart key={i} part={p} idx={i} lang={lang}/>)}
        </div>
        <span className="text-[10px] px-1" style={{color:'#3A3A42'}}>{msg.time}</span>
      </div>
    </div>
  )
}

function Palette({ query, onSelect, lang }: { query:string; onSelect:(cmd:string)=>void; lang:Lang }) {
  const filtered = SKILLS.filter(s=>s.cmd.toLowerCase().includes(query.toLowerCase())||s.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl overflow-hidden shadow-2xl z-50" style={{background:'#1A1A1E',border:`1px solid ${BM}`}}>
      <div className="px-3 py-2 flex items-center gap-2" style={{borderBottom:`1px solid ${B}`}}>
        <Hash size={11} className="text-accent"/>
        <span className="text-[10px] text-t3 font-medium">Skills & Commands</span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {filtered.length===0
          ? <div className="px-4 py-5 text-center text-t3 text-xs">{T[lang].noMatch}</div>
          : filtered.map(s=>(
            <button key={s.id} onClick={()=>onSelect(s.cmd)} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/[0.04] text-left group transition-colors">
              <span className="font-mono text-xs text-accent shrink-0">{s.cmd}</span>
              <span className="text-xs text-t3 group-hover:text-t2 flex-1 truncate transition-colors">{lang==='zh'?s.desc:s.descEn}</span>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
                style={{background:CAT_CLR[s.cat].bg,color:CAT_CLR[s.cat].txt,border:`1px solid ${CAT_CLR[s.cat].bdr}`}}>{s.cat}</span>
            </button>
          ))
        }
      </div>
    </div>
  )
}

function PreviewTab({ port, lang }: { port?:number; lang:Lang }) {
  const [p,setP]=useState(String(port??5173)); const [active,setActive]=useState(String(port??5173))
  const iref=useRef<HTMLIFrameElement>(null)
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2" style={{borderBottom:`1px solid ${B}`}}>
        <Globe size={11} className="text-t3 shrink-0"/>
        <div className="flex-1 flex items-center rounded-lg px-2.5 py-1.5 font-mono text-xs" style={{background:'#0C0C0F',border:`1px solid ${B}`}}>
          <span className="text-t3">localhost:</span>
          <input value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setActive(p)} className="w-10 bg-transparent text-t2 outline-none"/>
        </div>
        <button onClick={()=>{if(iref.current)iref.current.src=iref.current.src}} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-t3 hover:text-t2 transition-colors"><RefreshCw size={11}/></button>
        <a href={`http://localhost:${active}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/[0.06] text-t3 hover:text-t2 transition-colors"><ExternalLink size={11}/></a>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <iframe ref={iref} src={`http://localhost:${active}`} className="w-full h-full border-0" title="Preview"/>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none" style={{background:'#0C0C0F'}}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{background:'rgba(124,92,252,0.1)',border:`1px solid rgba(124,92,252,0.2)`}}><Globe size={18} className="text-accent opacity-60"/></div>
          <div className="text-center space-y-1">
            <p className="text-xs text-t3 font-mono">localhost:{active}</p>
            <p className="text-[10px] text-t3">{T[lang].startServer}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkillsTab({ onInsert, lang }: { onInsert:(cmd:string)=>void; lang:Lang }) {
  return (
    <div className="p-3 space-y-2">
      {SKILLS.map(s=>(
        <button key={s.id} onClick={()=>onInsert(s.cmd+' ')} className="w-full flex items-start gap-3 p-3 rounded-xl text-left group transition-all"
          style={{background:'#1A1A1E',border:`1px solid ${B}`}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=BM} onMouseLeave={e=>e.currentTarget.style.borderColor=B}>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-accent mb-0.5 truncate">{s.cmd}</p>
            <p className="text-[11px] text-t3 group-hover:text-t2 transition-colors">{lang==='zh'?s.desc:s.descEn}</p>
          </div>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 mt-0.5"
            style={{background:CAT_CLR[s.cat].bg,color:CAT_CLR[s.cat].txt,border:`1px solid ${CAT_CLR[s.cat].bdr}`}}>{s.cat}</span>
        </button>
      ))}
    </div>
  )
}

function MCPTab() {
  const items=[{name:'Google Calendar',status:'connected',tools:8},{name:'Gmail',status:'connected',tools:5},{name:'Context7',status:'idle',tools:3},{name:'Figma',status:'off',tools:12}]
  const dot={connected:'#3ECF8E',idle:'#E5C07B',off:'#3A3A42'}
  return (
    <div className="p-3 space-y-2">
      {items.map(item=>(
        <div key={item.name} className="flex items-center gap-3 p-3 rounded-xl" style={{background:'#1A1A1E',border:`1px solid ${B}`}}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{background:dot[item.status as keyof typeof dot]}}/>
          <div className="flex-1 min-w-0"><p className="text-xs text-t1">{item.name}</p><p className="text-[10px] text-t3 font-mono">{item.tools} tools</p></div>
          <span className="text-[10px] uppercase tracking-wide font-medium" style={{color:dot[item.status as keyof typeof dot]}}>{item.status}</span>
        </div>
      ))}
    </div>
  )
}

// ─── ProgressTab ──────────────────────────────────────────────────────
function ProgressTab({ stateContent, roadmapContent, lang }: { stateContent: string | null; roadmapContent: string | null; lang: Lang }) {
  if (!stateContent && !roadmapContent) {
    return <div style={{padding:24,textAlign:'center',color:'#50505A',fontSize:12}}>No .planning/ directory found</div>
  }
  return (
    <div style={{flex:1,overflowY:'auto'}}>
      {stateContent && (
        <div>
          <div style={{padding:'12px 16px',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
            {lang === 'zh' ? '当前状态' : 'Current State'}
          </div>
          <MarkdownPreview content={stateContent} />
        </div>
      )}
      {roadmapContent && (
        <div>
          <div style={{padding:'12px 16px',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
            {lang === 'zh' ? '路线图' : 'Roadmap'}
          </div>
          <MarkdownPreview content={roadmapContent} />
        </div>
      )}
    </div>
  )
}

// ─── Resize handle ────────────────────────────────────────────────────
function ResizeHandle({ onDragStart, onDoubleClick }: { onDragStart: () => void; onDoubleClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{width:4,flexShrink:0,cursor:'col-resize',position:'relative',background:'transparent'}}
      onMouseDown={e=>{e.preventDefault();onDragStart()}}
      onDoubleClick={onDoubleClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
    >
      <div style={{
        position:'absolute',top:0,bottom:0,left:-2,right:-2,
        background: hover ? 'rgba(124,92,252,0.35)' : B,
        transition:'background 0.15s',
      }}/>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────
type ColId = 'sidebar' | 'chat' | 'right'
type HandleState = { panel: 'sidebar' | 'right'; dir: 1 | -1 }

export default function App() {
  const [lang, setLang]           = useState<Lang>('zh')
  const [projects, setProjects]   = useState<Project[]>([])
  const [project, setProject]     = useState<Project | null>(null)
  const [messagesByProject, setMessagesByProject] = useState<Record<string, Message[]>>({})
  const messages = messagesByProject[project?.id ?? ''] ?? []
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null)
  const [hasPlanningDir, setHasPlanningDir] = useState(false)
  const [gsdState, setGsdState]   = useState<string | null>(null)
  const [gsdRoadmap, setGsdRoadmap] = useState<string | null>(null)
  const [appLoading, setAppLoading] = useState(true)
  const [streaming, setStreaming]   = useState(false)
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)
  const [addingProject, setAddingProject] = useState(false)
  const [addPath, setAddPath]     = useState('')
  const [addError, setAddError]   = useState('')
  const [input, setInput]         = useState('')
  const [palette, setPalette]     = useState(false)
  const [pQuery, setPQuery]       = useState('')
  const [rTab, setRTab]           = useState<'preview'|'skills'|'mcp'|'code'|'progress'>('preview')
  const [colOrder, setColOrder]   = useState<ColId[]>(['sidebar', 'chat', 'right'])
  const [colDragOver, setColDragOver]   = useState<ColId | null>(null)
  const fileDragCounter = useRef(0)
  const fileOverlayRef  = useRef<HTMLDivElement>(null)
  const showOverlay = (v: boolean) => { if (fileOverlayRef.current) fileOverlayRef.current.style.display = v ? 'flex' : 'none' }

  // Panel widths
  const [sidebarW, setSidebarW] = useState(240)
  const [rightW,   setRightW]   = useState(360)
  const activeHandle = useRef<HandleState | null>(null)
  const draggingCol  = useRef<ColId | null>(null)

  // File viewer
  const [selectedFile,  setSelectedFile]  = useState<string|null>(null)
  const [fileContent,   setFileContent]   = useState<string|null>(null)
  const [fileMtime,     setFileMtime]     = useState<number|null>(null)
  const [fileLoading,   setFileLoading]   = useState(false)
  const [showMdPreview, setShowMdPreview] = useState(false)
  const [fileBlobUrl,   setFileBlobUrl]   = useState<string|null>(null)
  const blobUrlRef = useRef<string|null>(null)

  const endRef  = useRef<HTMLDivElement>(null)
  const taRef   = useRef<HTMLTextAreaElement>(null)
  const sideRef = useRef<HTMLElement | null>(null)
  const chatRef = useRef<HTMLElement | null>(null)
  const rpRef   = useRef<HTMLElement | null>(null)

  // Load projects from registry on mount
  useEffect(() => {
    (async () => {
      const reg = await loadRegistry()
      if (reg.projects.length > 0) {
        const loaded: Project[] = []
        for (const p of reg.projects) {
          try {
            const dir = await readDir(p.path)
            if (dir) loaded.push({ ...p, files: dir.files })
            else loaded.push({ ...p, files: [] })
          } catch { loaded.push({ ...p, files: [] }) }
        }
        setProjects(loaded)
        setProject(loaded[0])
      }
      setAppLoading(false)
    })()
  }, [])

  // Persist registry whenever projects change
  useEffect(() => {
    if (projects.length > 0) {
      saveRegistry({ projects: projects.map(p => ({ id: p.id, name: p.name, path: p.path, devPort: p.devPort })) })
    }
  }, [projects])

  // On project switch — load history, context, detect GSD
  useEffect(() => {
    if (!project) return
    const projectId = project.id
    ;(async () => {
      await ensureGuiDir(project.path)

      // Load chat history if not already loaded
      if (!messagesByProject[projectId]) {
        const entries = await loadHistory(project.path)
        const msgs: Message[] = entries.map(e => ({ id: e.id, role: e.role, parts: e.parts, time: e.time }))
        setMessagesByProject(prev => ({ ...prev, [projectId]: msgs }))
      }

      // Load context
      let ctx = await loadContext(project.path)
      if (!ctx) ctx = await generateContext(project.path)
      setProjectContext(ctx)

      // Detect GSD .planning/
      const hasGsd = await hasGsdPlanning(project.path)
      setHasPlanningDir(hasGsd)
      if (hasGsd) {
        const state = await readFileContent(`${project.path}/.planning/STATE.md`)
        const roadmap = await readFileContent(`${project.path}/.planning/ROADMAP.md`)
        setGsdState(state?.content ?? null)
        setGsdRoadmap(roadmap?.content ?? null)
      } else {
        setGsdState(null); setGsdRoadmap(null)
      }
    })()
  }, [project?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // GSAP entrance
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(sideRef.current, {x:-16,opacity:0,duration:0.55,ease:'power3.out'})
      gsap.from(chatRef.current, {y:12, opacity:0,duration:0.55,delay:0.08,ease:'power3.out'})
      gsap.from(rpRef.current,   {x:16, opacity:0,duration:0.55,delay:0.16,ease:'power3.out'})
    })
    return () => ctx.revert()
  }, [])

  // Panel resize — direction-aware
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!activeHandle.current) return
      const { panel, dir } = activeHandle.current
      const delta = e.movementX * dir
      if (panel === 'sidebar') setSidebarW(w => Math.max(0, w + delta))
      else                     setRightW(w   => Math.max(0, w + delta))
    }
    const onUp = () => {
      activeHandle.current = null
      document.body.style.cursor = ''; document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const startHandle = (leftId: ColId, rightId: ColId) => {
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    if (leftId === 'sidebar' || rightId === 'sidebar')
      activeHandle.current = { panel: 'sidebar', dir: leftId === 'sidebar' ? 1 : -1 }
    else if (leftId === 'right' || rightId === 'right')
      activeHandle.current = { panel: 'right', dir: leftId === 'right' ? 1 : -1 }
  }
  const resetHandle = (leftId: ColId, rightId: ColId) => {
    if (leftId === 'sidebar' || rightId === 'sidebar') setSidebarW(240)
    else if (leftId === 'right' || rightId === 'right') setRightW(360)
  }

  // ── Column reorder — native listeners (no React synthetic events during drag) ──
  const onColDragStart = (e: React.DragEvent, colId: ColId) => {
    draggingCol.current = colId
    e.dataTransfer.setData('text/x-panel', colId)
    e.dataTransfer.effectAllowed = 'move'
  }
  const colDragOverRef = useRef<ColId | null>(null)
  const panelRefs = useRef<Record<ColId, HTMLElement | null>>({ sidebar: null, chat: null, right: null })

  useEffect(() => {
    const findPanel = (target: EventTarget | null): ColId | null => {
      const node = target as Node | null
      if (!node) return null
      for (const id of ['sidebar','chat','right'] as ColId[]) {
        if (panelRefs.current[id]?.contains(node)) return id
      }
      return null
    }
    const onOver = (e: DragEvent) => {
      if (!draggingCol.current) return
      const target = findPanel(e.target)
      if (!target || target === draggingCol.current) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      if (colDragOverRef.current !== target) { colDragOverRef.current = target; setColDragOver(target) }
    }
    const onLeave = (e: DragEvent) => {
      if (!draggingCol.current) return
      const to = findPanel(e.relatedTarget)
      if (!to && colDragOverRef.current) { colDragOverRef.current = null; setColDragOver(null) }
    }
    const onDrop = (e: DragEvent) => {
      if (!draggingCol.current) return
      e.preventDefault()
      const target = findPanel(e.target)
      const src = draggingCol.current
      if (target && src !== target) {
        setColOrder(order => { const a=[...order]; const fi=a.indexOf(src); const ti=a.indexOf(target); [a[fi],a[ti]]=[a[ti],a[fi]]; return a })
      }
      draggingCol.current = null; colDragOverRef.current = null; setColDragOver(null)
    }
    const onEnd = () => { draggingCol.current = null; colDragOverRef.current = null; setColDragOver(null) }

    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onEnd)
    return () => {
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onEnd)
    }
  }, [])

  // File loading
  const loadFile = useCallback(async (path: string, checkMtime?: number) => {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    if (!TEXT_EXTS.includes(ext) && !['md','markdown','txt'].includes(ext)) {
      setFileContent(null); setFileMtime(null); return
    }
    setFileLoading(true)
    try {
      const res  = await fetch(`/api/file?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.content !== undefined) {
        if (checkMtime === undefined || data.mtime !== checkMtime) {
          setFileContent(data.content); setFileMtime(data.mtime)
        }
      } else { setFileContent(null) }
    } catch { setFileContent(null) }
    finally  { setFileLoading(false) }
  }, [])

  // ── File drop from OS — native window listeners, zero React re-renders during drag ──
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e) || draggingCol.current) return
      if (fileDragCounter.current++ === 0) showOverlay(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      if (--fileDragCounter.current <= 0) { fileDragCounter.current = 0; showOverlay(false) }
    }
    const onOver  = (e: DragEvent) => { if (isFileDrag(e) && !draggingCol.current) e.preventDefault() }
    const handleFolderDrop = (folderName: string) => {
      fetch(`/api/find-dir?name=${encodeURIComponent(folderName)}`)
        .then(r => r.json())
        .then(data => {
          if (data.matches?.length === 1) {
            return fetch(`/api/dir?path=${encodeURIComponent(data.matches[0])}`).then(r => r.json())
          }
          setAddingProject(true)
          setAddPath(data.matches?.length > 1 ? data.matches[0] : '~/' + folderName)
          return null
        })
        .then(dir => {
          if (!dir || dir.error) return
          const newP: Project = { id: String(Date.now()), name: dir.name, path: dir.path, files: dir.files }
          setProjects(prev => prev.some(p => p.path === dir.path) ? prev : [...prev, newP])
          setProject(newP)
        })
        .catch(() => { setAddingProject(true); setAddPath('~/' + folderName) })
    }

    const onDrop  = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault(); fileDragCounter.current = 0; showOverlay(false)

      // ── Detect folder: multiple fallback methods ──
      let folderName: string | null = null
      // Method 1: webkitGetAsEntry (Chrome)
      try {
        const entry = e.dataTransfer!.items?.[0]?.webkitGetAsEntry?.()
        if (entry?.isDirectory) folderName = entry.name
      } catch {}
      // Method 2: files array is empty but items exist → folder (Finder/Chrome)
      if (!folderName && e.dataTransfer!.files.length === 0 && e.dataTransfer!.items?.length > 0) {
        try { folderName = e.dataTransfer!.items[0]?.getAsFile?.()?.name ?? null } catch {}
      }
      // Method 3: file has no type, no extension, size 0 → likely folder
      const f0 = e.dataTransfer!.files[0]
      if (!folderName && f0 && f0.type === '' && f0.size === 0 && !f0.name.includes('.')) {
        folderName = f0.name
      }
      if (folderName) { handleFolderDrop(folderName); return }

      // ── Single file ──
      const file = f0
      if (!file) return
      const name = file.name
      const ext  = name.split('.').pop()?.toLowerCase() ?? ''
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
      if (['png','jpg','jpeg','gif','webp','svg','pdf'].includes(ext)) {
        const url = URL.createObjectURL(file)
        blobUrlRef.current = url
        setFileBlobUrl(url); setSelectedFile(name); setFileContent(null)
        setFileMtime(Date.now()); setRTab('code'); setShowMdPreview(false)
        return
      }
      setFileBlobUrl(null)
      const reader = new FileReader()
      reader.onload = () => {
        setSelectedFile(name); setFileContent(reader.result as string)
        setFileMtime(Date.now()); setRTab('code')
        setShowMdPreview(['md','markdown'].includes(ext))
      }
      reader.readAsText(file)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover',  onOver)
    window.addEventListener('drop',      onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover',  onOver)
      window.removeEventListener('drop',      onDrop)
    }
  }, [loadFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-poll when code tab active
  useEffect(() => {
    if (!selectedFile || rTab !== 'code') return
    const id = setInterval(() => loadFile(selectedFile, fileMtime ?? undefined), 3000)
    return () => clearInterval(id)
  }, [selectedFile, rTab, fileMtime, loadFile])

  // ⇧⌘V → toggle markdown preview
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey||e.ctrlKey) && e.shiftKey && e.key.toLowerCase()==='v') {
        e.preventDefault(); setShowMdPreview(p=>!p)
        if (rTab !== 'code') setRTab('code')
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [rTab])

  const pickFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker()
      const name: string = handle.name
      const res = await fetch(`/api/find-dir?name=${encodeURIComponent(name)}`)
      const data = await res.json()
      if (data.matches?.length === 1) {
        const dir = await fetch(`/api/dir?path=${encodeURIComponent(data.matches[0])}`).then((r: Response) => r.json())
        if (!dir.error) {
          const newP: Project = { id: String(Date.now()), name: dir.name, path: dir.path, files: dir.files }
          setProjects(prev => prev.some(p => p.path === dir.path) ? prev : [...prev, newP])
          setProject(newP); return
        }
      }
      // Fallback: open input pre-filled
      setAddingProject(true)
      setAddPath(data.matches?.[0] ?? '~/' + name)
    } catch { /* user cancelled picker */ }
  }

  const addProject = async () => {
    if (!addPath.trim()) return
    setAddError('')
    try {
      const res = await fetch(`/api/dir?path=${encodeURIComponent(addPath.trim())}`)
      const data = await res.json()
      if (data.error) { setAddError(data.error); return }
      const newP: Project = { id: String(Date.now()), name: data.name, path: data.path, files: data.files }
      setProjects(prev => [...prev, newP])
      setProject(newP)
      setAddingProject(false); setAddPath('')
    } catch (e) { setAddError(String(e)) }
  }

  const onFileSelect = (path: string) => {
    // Clear blob URL from previous drag-drop
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    setFileBlobUrl(null)
    setSelectedFile(path); setRTab('code')
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    setShowMdPreview(['md','markdown'].includes(ext))
    loadFile(path)
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v=e.target.value; setInput(v)
    const ta=e.target; ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'
    const last=v.split(/\s+/).pop()??''
    if(last.startsWith('/')) { setPalette(true); setPQuery(last.slice(1)) } else setPalette(false)
  }
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if(e.key==='Escape'){setPalette(false);return}
    if(e.key==='Enter'&&!e.shiftKey&&!palette&&!streaming){e.preventDefault();send()}
  }
  const send = async () => {
    if(!input.trim() || !project || streaming) return
    const now = new Date()
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    const userMsg: Message = { id: String(Date.now()), role: 'user', parts: [{ type: 'text', content: input.trim() }], time: timeStr }
    const pid = project.id
    const pp = project.path
    setMessagesByProject(prev => ({ ...prev, [pid]: [...(prev[pid] ?? []), userMsg] }))
    const entry: HistoryEntry = { ...userMsg, ts: Date.now() }
    appendHistory(pp, entry)
    const trimmed = input.trim()
    if (trimmed.startsWith('/')) trackCommand(pp, trimmed.split(' ')[0])

    setInput(''); setPalette(false)
    if(taRef.current) taRef.current.style.height='auto'

    // ── Stream from Claude Code CLI ──
    setStreaming(true)
    const assistantId = String(Date.now() + 1)
    const aTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    const assistantMsg: Message = { id: assistantId, role: 'assistant', parts: [], time: aTime }
    setMessagesByProject(prev => ({ ...prev, [pid]: [...(prev[pid] ?? []), assistantMsg] }))

    const ctrl = new AbortController()
    abortRef.current = ctrl

    let fullText = ''
    const toolOps: Part[] = []

    const updateAssistant = (text: string) => {
      const parts: Part[] = [...toolOps]
      if (text) parts.push({ type: 'text', content: text })
      setMessagesByProject(prev => {
        const msgs = [...(prev[pid] ?? [])]
        const idx = msgs.findIndex(m => m.id === assistantId)
        if (idx >= 0) msgs[idx] = { ...msgs[idx], parts }
        return { ...prev, [pid]: msgs }
      })
    }

    const addToolOp = (name: string, inp: any) => {
      let op: 'read' | 'write' | 'exec' = 'exec'
      let opPath = ''
      if (name === 'Read') { op = 'read'; opPath = inp.file_path ?? '' }
      else if (name === 'Edit' || name === 'Write') { op = 'write'; opPath = inp.file_path ?? '' }
      else if (name === 'Bash') { op = 'exec'; opPath = (inp.command ?? '').slice(0, 80) }
      else if (name === 'Glob' || name === 'Grep') { op = 'read'; opPath = inp.pattern ?? inp.path ?? '' }
      else { op = 'exec'; opPath = name }
      const key = `${op}:${opPath}`
      if (!toolOps.some(t => t.type === 'file_op' && `${(t as any).op}:${(t as any).path}` === key)) {
        toolOps.push({ type: 'file_op', op, path: opPath })
      }
    }

    try {
      for await (const event of streamChat(trimmed, pp, sessionIds[pid], undefined, ctrl.signal)) {
        // Real-time text deltas from stream events
        if (event.type === 'stream_event' && event.event) {
          const ev = event.event
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            fullText += ev.delta.text
            updateAssistant(fullText)
          }
        }
        // Partial/full assistant messages (snapshot of accumulated content)
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text' && block.text) {
              fullText = block.text
            }
            if (block.type === 'tool_use' && block.name) {
              addToolOp(block.name, block.input ?? {})
            }
          }
          updateAssistant(fullText)
        }
        if (event.type === 'result') {
          if (event.session_id) setSessionIds(prev => ({ ...prev, [pid]: event.session_id! }))
          if (!fullText && event.result) {
            fullText = event.result
            updateAssistant(fullText)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const errText = fullText + (fullText ? '\n\n' : '') + `⚠️ Error: ${e}`
        updateAssistant(errText)
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      // Persist final assistant message
      setMessagesByProject(prev => {
        const msgs = prev[pid] ?? []
        const final = msgs.find(m => m.id === assistantId)
        if (final && final.parts.length > 0) {
          appendHistory(pp, { ...final, ts: Date.now() })
        }
        return prev
      })
    }
  }

  const stopStreaming = () => {
    if (abortRef.current) abortRef.current.abort()
    if (project) abortChat(project.path)
    setStreaming(false)
  }
  const selectCmd = (cmd:string) => { const w=input.split(/\s+/); w[w.length-1]=cmd; setInput(w.join(' ')+' '); setPalette(false); taRef.current?.focus() }
  const insertSkill = (cmd:string) => { setInput(cmd); setRTab('preview'); taRef.current?.focus() }

  const t = T[lang]
  const TABS: { id: 'preview'|'code'|'progress'|'skills'|'mcp'; label: string; Icon: typeof Globe; dot: boolean }[] = [
    {id:'preview', label:t.preview, Icon:Globe,    dot:false},
    {id:'code',    label:t.code,    Icon:FileCode, dot:!!selectedFile},
    ...(hasPlanningDir ? [{id:'progress' as const, label:lang === 'zh' ? '进度' : 'Progress', Icon:ListChecks, dot:true}] : []),
    {id:'skills',  label:t.skills,  Icon:Zap,      dot:false},
    {id:'mcp',     label:'MCP',      Icon:Cpu,      dot:false},
  ]

  // ── Grip handle (drag to reorder column) ──
  const Grip = ({ colId }: { colId: ColId }) => (
    <div
      draggable
      onDragStart={e => onColDragStart(e, colId)}
      title="拖动重排列"
      style={{display:'flex',alignItems:'center',padding:'0 4px',cursor:'grab',color:'#3A3A42',flexShrink:0,userSelect:'none'}}
      onMouseEnter={e=>e.currentTarget.style.color='#70737D'}
      onMouseLeave={e=>e.currentTarget.style.color='#3A3A42'}
    >
      <GripVertical size={12}/>
    </div>
  )

  // ── Render each panel ──
  const renderPanel = (colId: ColId) => {
    const isDropTarget = colDragOver === colId
    const dropStyle: React.CSSProperties = isDropTarget
      ? { outline: '2px solid rgba(124,92,252,0.5)', outlineOffset: -2 }
      : {}

    if (colId === 'sidebar') return (
      <aside
        key="sidebar" ref={(el: HTMLElement | null) => { sideRef.current = el; panelRefs.current.sidebar = el }}
        style={{width:sidebarW,flexShrink:0,display:'flex',flexDirection:'column',background:'#131316',overflow:'hidden',...dropStyle}}
      >
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'14px 12px 14px 8px',borderBottom:`1px solid ${B}`,flexShrink:0}}>
          <Grip colId="sidebar"/>
          <div style={{width:22,height:22,borderRadius:7,background:'#7C5CFC',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Sparkles size={11} style={{color:'#fff'}}/>
          </div>
          <span style={{fontSize:13,fontWeight:500}}>claude</span>
          <span style={{fontSize:13,color:'#50505A'}}>gui</span>
          <button onClick={()=>setLang(l=>l==='zh'?'en':'zh')}
            style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:20,background:'rgba(124,92,252,0.12)',color:'#9B82FF',border:`1px solid rgba(124,92,252,0.25)`,fontSize:10,fontWeight:500,cursor:'pointer'}}>
            <Languages size={10}/>{lang==='zh'?'EN':'中'}
          </button>
        </div>
        <div style={{padding:'16px 16px 4px',flexShrink:0}}><span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A'}}>{t.projects}</span></div>
        <div style={{padding:'0 8px',flexShrink:0}}>
          {projects.map(p=>(
            <button key={p.id} onClick={()=>setProject(p)} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'6px 8px',borderRadius:8,background:project?.id===p.id?'rgba(124,92,252,0.1)':'transparent',color:project?.id===p.id?'#9B82FF':'#8B8B96',border:'none',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}
              onMouseEnter={e=>{if(project?.id!==p.id)e.currentTarget.style.background='rgba(255,255,255,0.03)'}}
              onMouseLeave={e=>{if(project?.id!==p.id)e.currentTarget.style.background='transparent'}}>
              <Folder size={13} style={{flexShrink:0}}/>
              <span style={{fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{p.name}</span>
              {p.devPort && <span style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#50505A',flexShrink:0}}>:{p.devPort}</span>}
            </button>
          ))}
        </div>
        {project && projectContext && projectContext.tags.length > 0 && (
          <div style={{padding:'4px 12px 8px',display:'flex',flexWrap:'wrap',gap:4}}>
            {projectContext.tags.map(tag => (
              <span key={tag} style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(124,92,252,0.1)',color:'#9B82FF',border:'1px solid rgba(124,92,252,0.2)'}}>{tag}</span>
            ))}
          </div>
        )}
        <div style={{padding:'16px 16px 4px',flexShrink:0}}><span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A'}}>{t.files}</span></div>
        <div style={{flex:1,overflowY:'auto',padding:'0 8px 8px'}}>
          {project ? project.files.map((n,i)=><FileTreeNode key={i} node={n} basePath={project.path} onSelect={onFileSelect} selectedPath={selectedFile}/>) : (
            <div style={{padding:16,textAlign:'center',color:'#50505A',fontSize:11}}>{lang==='zh'?'选择或添加项目':'Select or add a project'}</div>
          )}
        </div>
        <div style={{padding:12,borderTop:`1px solid ${B}`,flexShrink:0}}>
          {addingProject ? (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <input
                autoFocus
                value={addPath}
                onChange={e=>{ setAddPath(e.target.value); setAddError('') }}
                onKeyDown={e=>{ if(e.key==='Enter') addProject(); if(e.key==='Escape'){ setAddingProject(false); setAddPath(''); setAddError('') } }}
                placeholder={lang==='zh'?'输入项目路径，如 ~/Projects/my-app':'Path, e.g. ~/Projects/my-app'}
                style={{width:'100%',padding:'7px 10px',borderRadius:8,border:`1px solid ${addError?'#E63B2E':BM}`,background:'#0C0C0F',color:'#ECECF1',fontSize:12,fontFamily:'JetBrains Mono, monospace',outline:'none'}}
              />
              {addError && <p style={{fontSize:10,color:'#E63B2E',margin:0,paddingLeft:2}}>{addError}</p>}
              <div style={{display:'flex',gap:6}}>
                <button onClick={addProject} style={{flex:1,padding:'5px 0',borderRadius:8,border:'none',background:'#7C5CFC',color:'#fff',fontSize:11,fontWeight:500,cursor:'pointer'}}>{lang==='zh'?'添加':'Add'}</button>
                <button onClick={()=>{ setAddingProject(false); setAddPath(''); setAddError('') }} style={{flex:1,padding:'5px 0',borderRadius:8,border:`1px solid ${B}`,background:'transparent',color:'#70737D',fontSize:11,cursor:'pointer'}}>{lang==='zh'?'取消':'Cancel'}</button>
              </div>
            </div>
          ) : (
            <div style={{display:'flex',gap:6}}>
              <button onClick={pickFolder} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 0',borderRadius:12,border:`1px dashed rgba(255,255,255,0.1)`,background:'transparent',color:'#50505A',fontSize:11,cursor:'pointer',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(124,92,252,0.4)';e.currentTarget.style.color='#9B82FF'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.1)';e.currentTarget.style.color='#50505A'}}>
                <FolderOpen size={12}/>{lang==='zh'?'选择文件夹':'Pick Folder'}
              </button>
              <button onClick={()=>setAddingProject(true)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 10px',borderRadius:12,border:`1px dashed rgba(255,255,255,0.1)`,background:'transparent',color:'#50505A',fontSize:11,cursor:'pointer',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.2)';e.currentTarget.style.color='#70737D'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.1)';e.currentTarget.style.color='#50505A'}}>
                <Plus size={12}/>
              </button>
            </div>
          )}
        </div>
      </aside>
    )

    if (colId === 'chat') return (
      <main
        key="chat" ref={(el: HTMLElement | null) => { (chatRef as React.MutableRefObject<HTMLElement | null>).current = el; panelRefs.current.chat = el }}
        style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,background:'#0C0C0F',overflow:'hidden',...dropStyle}}
      >
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px 12px 8px',borderBottom:`1px solid ${B}`,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <Grip colId="chat"/>
            <Terminal size={13} style={{color:'#50505A'}}/>
            <span style={{fontSize:14,fontWeight:500}}>{project?.name ?? (lang==='zh'?'未选择项目':'No project')}</span>
            {project && <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#50505A',padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.04)',border:`1px solid ${B}`}}>{project.path}</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:streaming?'#E5C07B':'#3ECF8E',boxShadow:streaming?'0 0 6px #E5C07B':'0 0 6px #3ECF8E',flexShrink:0,animation:streaming?'pulse 1s infinite':undefined}}/>
            <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#50505A'}}>{streaming?(lang==='zh'?'思考中…':'thinking…'):'ready'}</span>
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'24px'}} className="space-y-0">
          {!project ? (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,color:'#50505A'}}>
              <FolderOpen size={32} style={{color:'#3A3A42'}}/>
              <p style={{fontSize:13}}>{lang==='zh'?'选择或添加一个项目以开始':'Select or add a project to start'}</p>
            </div>
          ) : (
            <>
              {messages.map(m=><Bubble key={m.id} msg={m} lang={lang}/>)}
              <div ref={endRef}/>
            </>
          )}
        </div>
        <div style={{padding:'0 20px 20px',flexShrink:0}}>
          <div style={{position:'relative'}}>
            {palette && <Palette query={pQuery} onSelect={selectCmd} lang={lang}/>}
            <div style={{display:'flex',alignItems:'flex-end',gap:12,padding:'12px 16px',borderRadius:18,background:'#131316',border:`1px solid ${B}`,transition:'border-color 0.2s'}}
              onFocusCapture={e=>e.currentTarget.style.borderColor='rgba(124,92,252,0.4)'}
              onBlurCapture={e=>e.currentTarget.style.borderColor=B}>
              <textarea ref={taRef} value={input} onChange={onInput} onKeyDown={onKey} disabled={!project || streaming} placeholder={!project ? (lang==='zh'?'请先选择一个项目':'Select a project first') : streaming ? (lang==='zh'?'Claude 正在思考…':'Claude is thinking…') : t.placeholder} rows={1}
                style={{flex:1,background:'transparent',fontSize:14,outline:'none',resize:'none',lineHeight:1.6,color:'#ECECF1',caretColor:'#7C5CFC',minHeight:20,maxHeight:128,fontFamily:'Inter, sans-serif',opacity:(!project||streaming)?0.4:1}}/>
              {streaming ? (
                <button onClick={stopStreaming}
                  style={{flexShrink:0,width:32,height:32,borderRadius:10,background:'#E63B2E',color:'#fff',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}
                  title={lang==='zh'?'停止':'Stop'}>
                  <div style={{width:10,height:10,borderRadius:2,background:'#fff'}}/>
                </button>
              ) : (
                <button onClick={send} disabled={!input.trim()}
                  style={{flexShrink:0,width:32,height:32,borderRadius:10,background:input.trim()?'#7C5CFC':'rgba(255,255,255,0.06)',color:input.trim()?'#fff':'#50505A',border:'none',cursor:input.trim()?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}
                  onMouseEnter={e=>{if(input.trim())e.currentTarget.style.transform='scale(1.08)'}}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                  <Send size={13}/>
                </button>
              )}
            </div>
            <p style={{fontSize:10,color:'#3A3A42',marginTop:6,paddingLeft:4}}>{t.hint}</p>
          </div>
        </div>
      </main>
    )

    // right panel
    return (
      <aside
        key="right" ref={(el: HTMLElement | null) => { rpRef.current = el; panelRefs.current.right = el }}
        style={{width:rightW,flexShrink:0,display:'flex',flexDirection:'column',background:'#131316',overflow:'hidden',...dropStyle}}
      >
        <div style={{display:'flex',alignItems:'center',borderBottom:`1px solid ${B}`,flexShrink:0}}>
          <Grip colId="right"/>
          {TABS.map(({id,label,Icon,dot})=>(
            <button key={id} onClick={()=>setRTab(id)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'12px 0',fontSize:11,fontWeight:500,cursor:'pointer',background:'transparent',border:'none',borderBottom:`2px solid ${rTab===id?'#7C5CFC':'transparent'}`,color:rTab===id?'#ECECF1':'#50505A',transition:'all 0.15s'}}>
              <Icon size={12}/>{label}
              {dot && <span style={{width:5,height:5,borderRadius:'50%',background:'#3ECF8E',flexShrink:0}}/>}
            </button>
          ))}
        </div>
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {rTab==='preview' && <PreviewTab port={project?.devPort} lang={lang}/>}
          {rTab==='code'    && <FileViewer selectedPath={selectedFile} content={fileContent} isLoading={fileLoading} mtime={fileMtime} onRefresh={()=>selectedFile&&loadFile(selectedFile)} showMdPreview={showMdPreview} onToggleMdPreview={()=>setShowMdPreview(p=>!p)} lang={lang} blobUrl={fileBlobUrl}/>}
          {rTab==='progress' && <ProgressTab stateContent={gsdState} roadmapContent={gsdRoadmap} lang={lang}/>}
          {rTab==='skills'  && <SkillsTab onInsert={insertSkill} lang={lang}/>}
          {rTab==='mcp'     && <MCPTab/>}
        </div>
      </aside>
    )
  }

  return (
    <div
      style={{display:'flex',height:'100vh',overflow:'hidden',background:'#0C0C0F',color:'#ECECF1',fontFamily:'Inter, system-ui, sans-serif',position:'relative'}}
    >
      {/* Noise */}
      <svg className="noise-overlay" aria-hidden="true">
        <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter>
        <rect width="100%" height="100%" filter="url(#noise)"/>
      </svg>

      {/* File drop overlay — always in DOM, shown/hidden via ref (no React re-render during drag) */}
      <div ref={fileOverlayRef} style={{display:'none',position:'fixed',inset:0,zIndex:50,alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,background:'rgba(12,12,15,0.75)',border:'2px dashed rgba(124,92,252,0.5)',borderRadius:16,margin:8,pointerEvents:'none'}}>
        <FileText size={36} style={{color:'#9B82FF'}}/>
        <p style={{color:'#9B82FF',fontSize:15,fontWeight:500}}>{lang==='zh'?'拖入以打开文件':'Drop to open file'}</p>
        <p style={{color:'#50505A',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>{lang==='zh'?'自动识别路径':'Path auto-detected'}</p>
      </div>

      {/* Columns */}
      {colOrder.map((colId, idx) => {
        const isLast = idx === colOrder.length - 1
        const nextId = isLast ? null : colOrder[idx + 1]
        return (
          <React.Fragment key={colId}>
            {renderPanel(colId)}
            {!isLast && (
              <ResizeHandle
                onDragStart={() => startHandle(colId, nextId!)}
                onDoubleClick={() => resetHandle(colId, nextId!)}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
