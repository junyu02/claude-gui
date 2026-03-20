import React, { useState, useRef, useEffect, useCallback } from 'react'
import { gsap } from 'gsap'
import {
  FolderOpen, Folder, Plus, Send, RefreshCw, Sparkles, Languages,
  Globe, Cpu, Terminal as TerminalIcon, Zap, FileCode, FileText, Package,
  LayoutGrid, ListChecks,
} from 'lucide-react'
import {
  Lang, T, Message, FileNode, Project, Part, B, BM,
  SKILLS, DEFAULT_MODEL,
} from './types'
import { loadRegistry, saveRegistry, ensureGuiDir, loadHistory, appendHistory,
  loadContext, generateContext, hasGsdPlanning, trackCommand,
  HistoryEntry, ProjectContext } from './storage'
import { readDir, readFileContent, streamChat, abortChat } from './api'
import { AppLayout, ColumnConfig, PanelId, PANEL_META, PanelMode, loadLayout, saveLayout } from './layout'

// ── Components ────────────────────────────────────────────────────────
import { MarkdownPreview } from './components/MarkdownPreview'
import { FileViewer, FileTreeNode } from './components/FileViewer'
import { Bubble, Palette } from './components/ChatBubble'
import { ModelSelector } from './components/ModelSelector'
import { TerminalTab } from './components/TerminalTab'
import { PluginMarketplace } from './components/PluginMarketplace'
import { LayoutEditor } from './components/LayoutEditor'
import { MARKETPLACE_PLUGINS } from './plugins'

// ── Resize handle (column) ────────────────────────────────────────────
function ResizeHandle({ onDragStart, onDoubleClick }: { onDragStart: () => void; onDoubleClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{width:4,flexShrink:0,cursor:'col-resize',position:'relative',background:'transparent'}}
      onMouseDown={e=>{e.preventDefault();onDragStart()}}
      onDoubleClick={onDoubleClick}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <div style={{position:'absolute',top:0,bottom:0,left:-2,right:-2,background:hover?'rgba(124,92,252,0.35)':B,transition:'background 0.15s'}}/>
    </div>
  )
}

// ── Row resize handle (between stacked panels) ────────────────────────
function RowResizeHandle({ onDragStart }: { onDragStart: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{height:4,flexShrink:0,cursor:'row-resize',position:'relative',background:'transparent'}}
      onMouseDown={e=>{e.preventDefault();onDragStart()}}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <div style={{position:'absolute',left:0,right:0,top:-2,bottom:-2,background:hover?'rgba(124,92,252,0.35)':B,transition:'background 0.15s'}}/>
    </div>
  )
}

// ── Tab bar (browser-like panel tabs) ────────────────────────────────
function TabBar({ panels, activeIdx, onChange, lang }: {
  panels: PanelId[]; activeIdx: number; onChange: (i: number) => void; lang: Lang
}) {
  return (
    <div style={{display:'flex', gap:1, padding:'4px 6px 0', borderBottom:`1px solid ${B}`, flexShrink:0, background:'#131316', overflowX:'auto'}}>
      {panels.map((id, i) => {
        const m = PANEL_META[id]
        const active = i === activeIdx
        return (
          <button key={id} onClick={() => onChange(i)} style={{
            display:'flex', alignItems:'center', gap:4,
            padding:'5px 12px', borderRadius:'6px 6px 0 0',
            border:`1px solid ${active ? B : 'transparent'}`,
            borderBottom: active ? `1px solid #0C0C0F` : 'none',
            background: active ? '#0C0C0F' : 'transparent',
            color: active ? m.color : '#50505A',
            fontSize:11, fontWeight:600, cursor:'pointer',
            whiteSpace:'nowrap', flexShrink:0,
            transition:'all 0.12s',
            marginBottom: active ? -1 : 0,
          }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#8B8B96' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#50505A' }}
          >
            <span style={{fontSize:13}}>{m.emoji}</span>
            {lang === 'zh' ? m.label : m.labelEn}
          </button>
        )
      })}
    </div>
  )
}

// ── Panel label bar ───────────────────────────────────────────────────
function PanelBar({ id, lang }: { id: PanelId; lang: Lang }) {
  const m = PANEL_META[id]
  return (
    <div style={{
      display:'flex',alignItems:'center',gap:6,
      padding:'6px 12px',flexShrink:0,
      borderBottom:`1px solid ${B}`,
      background:'#131316',
    }}>
      <span style={{fontSize:13}}>{m.emoji}</span>
      <span style={{fontSize:11,fontWeight:600,color:m.color}}>
        {lang === 'zh' ? m.label : m.labelEn}
      </span>
    </div>
  )
}

// ── Panel renderer ────────────────────────────────────────────────────
interface PanelSharedProps {
  lang: Lang
  project: Project | null
  hasPlanningDir: boolean
  gsdState: string | null
  gsdRoadmap: string | null
  selectedFile: string | null
  fileContent: string | null
  fileMtime: number | null
  fileLoading: boolean
  showMdPreview: boolean
  fileBlobUrl: string | null
  installedPluginIds: string[]
  onFileSelect: (path: string) => void
  onToggleMdPreview: () => void
  onRefreshFile: () => void
  onInsertSkill: (cmd: string) => void
  onPluginsChange: (ids: string[]) => void
  extraPluginSkills: Array<{ cmd: string; name: string; desc: string }>
}

function PanelContent({ id, props }: { id: PanelId; props: PanelSharedProps }) {
  const { lang, project } = props
  switch (id) {
    case 'chat':
      return null // chat is rendered inline in App
    case 'preview':
      return <PreviewPanel port={project?.devPort} lang={lang} />
    case 'terminal':
      return <TerminalTab projectPath={project?.path ?? null} lang={lang} />
    case 'code':
      return (
        <FileViewer
          selectedPath={props.selectedFile} content={props.fileContent}
          isLoading={props.fileLoading} mtime={props.fileMtime}
          onRefresh={props.onRefreshFile}
          showMdPreview={props.showMdPreview} onToggleMdPreview={props.onToggleMdPreview}
          lang={lang} blobUrl={props.fileBlobUrl}
        />
      )
    case 'skills':
      return (
        <SkillsPanel
          onInsert={props.onInsertSkill} lang={lang}
          extraCmds={props.extraPluginSkills}
        />
      )
    case 'mcp':
      return <MCPPanel lang={lang} />
    case 'plugins':
      return <PluginMarketplace lang={lang} onPluginsChange={props.onPluginsChange} />
    case 'progress':
      return <ProgressPanel stateContent={props.gsdState} roadmapContent={props.gsdRoadmap} lang={lang} />
  }
}

// ── Leaf panels ───────────────────────────────────────────────────────
function PreviewPanel({ port, lang }: { port?: number; lang: Lang }) {
  const [p, setP] = useState(String(port ?? 5173))
  const [active, setActive] = useState(String(port ?? 5173))
  const iref = useRef<HTMLIFrameElement>(null)
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderBottom:`1px solid ${B}`,flexShrink:0}}>
        <Globe size={10} style={{color:'#50505A'}}/>
        <div style={{flex:1,display:'flex',alignItems:'center',background:'#0C0C0F',border:`1px solid ${B}`,borderRadius:6,padding:'3px 8px'}}>
          <span style={{fontSize:10,color:'#50505A',fontFamily:'JetBrains Mono'}}>localhost:</span>
          <input value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setActive(p)}
            style={{width:36,background:'transparent',border:'none',outline:'none',fontSize:10,color:'#ECECF1',fontFamily:'JetBrains Mono'}}/>
        </div>
        <button onClick={()=>{if(iref.current)iref.current.src=iref.current.src}} style={{padding:3,background:'transparent',border:'none',cursor:'pointer',color:'#50505A',display:'flex'}}
          onMouseEnter={e=>e.currentTarget.style.color='#ECECF1'} onMouseLeave={e=>e.currentTarget.style.color='#50505A'}>
          <RefreshCw size={10}/>
        </button>
        <a href={`http://localhost:${active}`} target="_blank" rel="noreferrer" style={{fontSize:10,color:'#50505A',textDecoration:'none'}}
          onMouseEnter={e=>(e.currentTarget.style.color='#ECECF1')} onMouseLeave={e=>(e.currentTarget.style.color='#50505A')}>↗</a>
      </div>
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <iframe ref={iref} src={`http://localhost:${active}`} style={{width:'100%',height:'100%',border:'none'}} title="Preview"/>
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,background:'#0C0C0F',pointerEvents:'none'}}>
          <Globe size={20} style={{color:'#3A3A42'}}/>
          <p style={{fontSize:11,color:'#50505A',fontFamily:'JetBrains Mono'}}>localhost:{active}</p>
          <p style={{fontSize:10,color:'#3A3A42'}}>{T[lang].startServer}</p>
        </div>
      </div>
    </div>
  )
}

function SkillsPanel({ onInsert, lang, extraCmds }: {
  onInsert: (cmd:string)=>void; lang:Lang
  extraCmds?: Array<{ cmd: string; name: string; desc: string }>
}) {
  const CAT_CLR = {
    ui:       { bg:'rgba(124,92,252,0.12)', txt:'#9B82FF', bdr:'rgba(124,92,252,0.25)' },
    code:     { bg:'rgba(97,175,239,0.10)', txt:'#61AFEF', bdr:'rgba(97,175,239,0.20)' },
    workflow: { bg:'rgba(62,207,142,0.10)', txt:'#3ECF8E', bdr:'rgba(62,207,142,0.20)' },
    ai:       { bg:'rgba(229,192,123,0.10)',txt:'#E5C07B', bdr:'rgba(229,192,123,0.20)' },
  }
  const all = [
    ...SKILLS,
    ...(extraCmds ?? []).map(c => ({ id:c.cmd, name:c.name, desc:c.desc, descEn:c.desc, cmd:c.cmd, cat:'workflow' as const }))
  ]
  return (
    <div style={{padding:10,display:'flex',flexDirection:'column',gap:6}}>
      {all.map(s=>(
        <button key={s.id} onClick={()=>onInsert(s.cmd+' ')} style={{width:'100%',display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',borderRadius:10,textAlign:'left',background:'#1A1A1E',border:`1px solid ${B}`,cursor:'pointer',transition:'border-color 0.15s'}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=BM} onMouseLeave={e=>e.currentTarget.style.borderColor=B}>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontFamily:'JetBrains Mono',fontSize:11,color:'#9B82FF',margin:'0 0 2px'}}>{s.cmd}</p>
            <p style={{fontSize:10,color:'#50505A',margin:0}}>{lang==='zh'?s.desc:s.descEn}</p>
          </div>
          <span style={{fontSize:9,padding:'1px 5px',borderRadius:10,fontWeight:600,textTransform:'uppercase',background:CAT_CLR[s.cat]?.bg,color:CAT_CLR[s.cat]?.txt,border:`1px solid ${CAT_CLR[s.cat]?.bdr}`,flexShrink:0}}>{s.cat}</span>
        </button>
      ))}
    </div>
  )
}

function MCPPanel({ lang }: { lang: Lang }) {
  const [servers, setServers] = useState<Array<{name:string;command:string;args:string[];status:string}>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/mcp-status').then(r=>r.json()).then(d=>{setServers(d.servers??[]);setLoading(false)}).catch(()=>setLoading(false))
  }, [])
  const dot = { configured:'#61AFEF', unknown:'#50505A' }
  if (loading) return <div style={{padding:20,textAlign:'center',color:'#50505A',fontSize:11,fontFamily:'JetBrains Mono'}}>loading…</div>
  if (!servers.length) return (
    <div style={{padding:20,textAlign:'center',color:'#50505A',fontSize:11}}>
      {lang==='zh'?'未检测到 MCP 服务器':'No MCP servers detected'}
    </div>
  )
  return (
    <div style={{padding:10,display:'flex',flexDirection:'column',gap:6}}>
      {servers.map(s=>(
        <div key={s.name} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:'#1A1A1E',border:`1px solid ${B}`}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:dot[s.status as keyof typeof dot]??dot.unknown,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:12,fontWeight:600,color:'#ECECF1',margin:0}}>{s.name}</p>
            <p style={{fontSize:9,color:'#50505A',fontFamily:'JetBrains Mono',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.command} {s.args.join(' ')}</p>
          </div>
          <span style={{fontSize:9,color:dot[s.status as keyof typeof dot]??dot.unknown,textTransform:'uppercase'}}>{s.status}</span>
        </div>
      ))}
    </div>
  )
}

function ProgressPanel({ stateContent, roadmapContent, lang }: { stateContent:string|null; roadmapContent:string|null; lang:Lang }) {
  if (!stateContent && !roadmapContent)
    return <div style={{padding:24,textAlign:'center',color:'#50505A',fontSize:12}}>No .planning/ directory</div>
  return (
    <div style={{flex:1,overflowY:'auto'}}>
      {stateContent && <><div style={{padding:'10px 14px',fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',borderBottom:`1px solid ${B}`}}>{lang==='zh'?'当前状态':'State'}</div><MarkdownPreview content={stateContent}/></>}
      {roadmapContent && <><div style={{padding:'10px 14px',fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',borderBottom:`1px solid ${B}`}}>{lang==='zh'?'路线图':'Roadmap'}</div><MarkdownPreview content={roadmapContent}/></>}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang]         = useState<Lang>('zh')
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject]   = useState<Project | null>(null)
  const [messagesByProject, setMessagesByProject] = useState<Record<string, Message[]>>({})
  const messages = messagesByProject[project?.id ?? ''] ?? []
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null)
  const [hasPlanningDir, setHasPlanningDir] = useState(false)
  const [gsdState, setGsdState]     = useState<string | null>(null)
  const [gsdRoadmap, setGsdRoadmap] = useState<string | null>(null)
  const [appLoading, setAppLoading] = useState(true)
  const [streaming, setStreaming]   = useState(false)
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)

  // Project adding
  const [addingProject, setAddingProject] = useState(false)
  const [addPath, setAddPath]   = useState('')
  const [addError, setAddError] = useState('')

  // Input
  const [input, setInput]   = useState('')
  const [palette, setPalette] = useState(false)
  const [pQuery, setPQuery]   = useState('')
  const [mode, setMode]       = useState<'trust'|'plan'|'normal'>('trust')

  // Model
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)

  // Layout — loaded from localStorage, persisted on every change
  const [layout, setLayout] = useState<AppLayout>(() => loadLayout())
  const [showLayoutEditor, setShowLayoutEditor] = useState(false)

  // Plugins
  const [installedPluginIds, setInstalledPluginIds] = useState<string[]>([])

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
  const wrapRef = useRef<HTMLDivElement>(null)

  // Column widths (runtime overrides, separate from layout.columns[i].width)
  const [colWidths, setColWidths] = useState<Record<number, number>>({})

  // Active tab index per column (for tab mode)
  const [activeTabs, setActiveTabs] = useState<Record<number, number>>({})

  // Active tab index in sidebar bottom (for sidebar tab mode)
  const [sidebarActiveTab, setSidebarActiveTab] = useState(0)

  // Per-column panel ratios: Record<colIdx, number[]> — array of N fractions summing to 1
  const [panelRatios, setPanelRatios] = useState<Record<number, number[]>>({})

  // Sidebar split ratio runtime override
  const [sidebarRatio, setSidebarRatio] = useState<number | null>(null)

  // Sidebar bottom row resize ref
  const sidebarRowResizeRef = useRef<{ startY: number; startRatio: number; sidebarH: number } | null>(null)

  // Active resize handles
  const colResizeRef = useRef<{ colIdx: number; startX: number; startW: number } | null>(null)
  const rowResizeRef = useRef<{
    colIdx: number
    handleIdx: number   // index of gap (0 = between panels[0] and panels[1], etc.)
    startY: number
    startRatios: number[]
    colHeight: number
  } | null>(null)

  const extraPluginSkills = MARKETPLACE_PLUGINS
    .filter(p => installedPluginIds.includes(p.id) && !!p.skillCmd)
    .map(p => ({ cmd: p.skillCmd!, name: p.name, desc: lang==='zh' ? p.description : p.descriptionEn }))

  // Apply and persist layout
  const applyLayout = (l: AppLayout) => {
    setLayout(l)
    saveLayout(l)
    setColWidths({})
    setPanelRatios({})
    setSidebarRatio(null)
    setActiveTabs({})
    setSidebarActiveTab(0)
  }

  // ── Load registry ─────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const reg = await loadRegistry()
      if (reg.projects.length > 0) {
        const loaded: Project[] = []
        for (const p of reg.projects) {
          try {
            const dir = await readDir(p.path)
            loaded.push(dir ? { ...p, files: dir.files } : { ...p, files: [] })
          } catch { loaded.push({ ...p, files: [] }) }
        }
        setProjects(loaded)
        setProject(loaded[0])
      }
      setAppLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (projects.length > 0)
      saveRegistry({ projects: projects.map(p => ({ id: p.id, name: p.name, path: p.path, devPort: p.devPort })) })
  }, [projects])

  // ── On project switch ─────────────────────────────────────────────
  useEffect(() => {
    if (!project) return
    const pid = project.id
    ;(async () => {
      await ensureGuiDir(project.path)
      if (!messagesByProject[pid]) {
        const entries = await loadHistory(project.path)
        setMessagesByProject(prev => ({ ...prev, [pid]: entries.map(e => ({ id:e.id, role:e.role, parts:e.parts, time:e.time })) }))
      }
      let ctx = await loadContext(project.path)
      if (!ctx) ctx = await generateContext(project.path)
      setProjectContext(ctx)
      const hasGsd = await hasGsdPlanning(project.path)
      setHasPlanningDir(hasGsd)
      if (hasGsd) {
        const state  = await readFileContent(`${project.path}/.planning/STATE.md`)
        const roadmap = await readFileContent(`${project.path}/.planning/ROADMAP.md`)
        setGsdState(state?.content ?? null); setGsdRoadmap(roadmap?.content ?? null)
      } else { setGsdState(null); setGsdRoadmap(null) }
    })()
  }, [project?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── GSAP entrance ─────────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(wrapRef.current, { opacity:0, duration:0.4, ease:'power2.out' })
    })
    return () => ctx.revert()
  }, [])

  // ── Column resize (horizontal) ────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = colResizeRef.current
      if (!r) return
      const delta = e.clientX - r.startX
      setColWidths(prev => ({ ...prev, [r.colIdx]: Math.max(180, r.startW + delta) }))
    }
    const onUp = () => {
      colResizeRef.current = null
      document.body.style.cursor = ''; document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Row resize (vertical, N-panel) ───────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = rowResizeRef.current
      if (!r) return
      const delta = e.clientY - r.startY
      const ratios = [...r.startRatios]
      const hi = r.handleIdx
      const pairSum = ratios[hi] + ratios[hi + 1]
      const newA = Math.max(0.1, Math.min(pairSum - 0.1, ratios[hi] + delta / r.colHeight))
      ratios[hi] = newA
      ratios[hi + 1] = pairSum - newA
      setPanelRatios(prev => ({ ...prev, [r.colIdx]: ratios }))
    }
    const onUp = () => {
      rowResizeRef.current = null
      document.body.style.cursor = ''; document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Sidebar row resize ────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = sidebarRowResizeRef.current
      if (!r) return
      const delta = e.clientY - r.startY
      const newRatio = Math.max(0.2, Math.min(0.8, r.startRatio + delta / r.sidebarH))
      setSidebarRatio(newRatio)
    }
    const onUp = () => {
      sidebarRowResizeRef.current = null
      document.body.style.cursor = ''; document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── File loading ──────────────────────────────────────────────────
  const TEXT_EXTS = ['md','markdown','txt','ts','tsx','js','jsx','css','json','yaml','yml','py','html','sh','env']
  const loadFile = useCallback(async (path: string, checkMtime?: number) => {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    if (!TEXT_EXTS.includes(ext)) { setFileContent(null); setFileMtime(null); return }
    setFileLoading(true)
    try {
      const res  = await fetch(`/api/file?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.content !== undefined) {
        if (checkMtime === undefined || data.mtime !== checkMtime)
          { setFileContent(data.content); setFileMtime(data.mtime) }
      } else setFileContent(null)
    } catch { setFileContent(null) }
    finally { setFileLoading(false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-poll file
  useEffect(() => {
    const hasCodePanel = layout.columns.some(c => c.panels.includes('code'))
    if (!selectedFile || !hasCodePanel) return
    const id = setInterval(() => loadFile(selectedFile, fileMtime ?? undefined), 3000)
    return () => clearInterval(id)
  }, [selectedFile, layout, fileMtime, loadFile])

  // ⇧⌘V
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey||e.ctrlKey) && e.shiftKey && e.key.toLowerCase()==='v') {
        e.preventDefault(); setShowMdPreview(p=>!p)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── File drop ─────────────────────────────────────────────────────
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    let counter = 0
    const overlay = document.getElementById('file-drop-overlay')
    const show = (v: boolean) => { if (overlay) overlay.style.display = v ? 'flex' : 'none' }
    const onEnter = (e: DragEvent) => { if (!isFileDrag(e)) return; if (counter++ === 0) show(true) }
    const onLeave = (e: DragEvent) => { if (!isFileDrag(e)) return; if (--counter <= 0) { counter=0; show(false) } }
    const onOver  = (e: DragEvent) => { if (isFileDrag(e)) e.preventDefault() }
    const onDrop  = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault(); counter=0; show(false)
      const f = e.dataTransfer!.files[0]
      if (!f) return
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
      if (['png','jpg','jpeg','gif','webp','svg','pdf'].includes(ext)) {
        const url = URL.createObjectURL(f)
        blobUrlRef.current = url
        setFileBlobUrl(url); setSelectedFile(f.name); setFileContent(null); setFileMtime(Date.now())
        return
      }
      setFileBlobUrl(null)
      new FileReader().onload = ev => { setSelectedFile(f.name); setFileContent(ev.target?.result as string); setFileMtime(Date.now()) }
      new FileReader().readAsText(f)
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
  }, [])

  const onFileSelect = (path: string) => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    setFileBlobUrl(null); setSelectedFile(path)
    setShowMdPreview(['md','markdown'].includes(path.split('.').pop() ?? ''))
    loadFile(path)
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value; setInput(v)
    const ta = e.target; ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'
    const last = v.split(/\s+/).pop()??''
    if (last.startsWith('/')) { setPalette(true); setPQuery(last.slice(1)) } else setPalette(false)
  }
  const cycleMode = () => setMode(m => m==='trust'?'plan':m==='plan'?'normal':'trust')
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key==='Tab'&&e.shiftKey) { e.preventDefault(); cycleMode(); return }
    if (e.key==='Escape') { setPalette(false); return }
    if (e.key==='Enter'&&!e.shiftKey&&!palette&&!streaming) { e.preventDefault(); send() }
  }

  const send = async () => {
    if (!input.trim() || !project || streaming) return
    const now = new Date()
    const timeStr = now.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
    const userMsg: Message = { id:String(Date.now()), role:'user', parts:[{type:'text', content:input.trim()}], time:timeStr }
    const pid = project.id, pp = project.path
    setMessagesByProject(prev => ({ ...prev, [pid]: [...(prev[pid]??[]), userMsg] }))
    appendHistory(pp, { ...userMsg, ts: Date.now() })
    const trimmed = input.trim()
    if (trimmed.startsWith('/')) trackCommand(pp, trimmed.split(' ')[0])
    setInput(''); setPalette(false)
    if (taRef.current) taRef.current.style.height = 'auto'

    setStreaming(true)
    const assistantId = String(Date.now()+1)
    const aTime = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
    const assistantMsg: Message = { id:assistantId, role:'assistant', parts:[], time:aTime }
    setMessagesByProject(prev => ({ ...prev, [pid]: [...(prev[pid]??[]), assistantMsg] }))
    const ctrl = new AbortController()
    abortRef.current = ctrl

    let fullText = ''
    const toolOps: Part[] = []
    let finalCost: number|undefined, finalIn: number|undefined, finalOut: number|undefined, finalDur: number|undefined

    const updateAssistant = (text: string, meta?: Partial<Message>) => {
      const parts: Part[] = [...toolOps]
      if (text) parts.push({ type:'text', content:text })
      setMessagesByProject(prev => {
        const msgs = [...(prev[pid]??[])]
        const idx = msgs.findIndex(m => m.id === assistantId)
        if (idx >= 0) msgs[idx] = { ...msgs[idx], parts, ...meta }
        return { ...prev, [pid]: msgs }
      })
    }

    const addToolOp = (name: string, inp: any) => {
      let op: 'read'|'write'|'exec' = 'exec', opPath = ''
      if (name==='Read')                    { op='read';  opPath=inp.file_path??'' }
      else if (name==='Edit'||name==='Write') { op='write'; opPath=inp.file_path??'' }
      else if (name==='Bash')               { op='exec';  opPath=(inp.command??'').slice(0,80) }
      else if (name==='Glob'||name==='Grep') { op='read';  opPath=inp.pattern??inp.path??'' }
      else                                  { op='exec';  opPath=name }
      const key = `${op}:${opPath}`
      if (!toolOps.some(t => t.type==='file_op' && `${(t as any).op}:${(t as any).path}`===key))
        toolOps.push({ type:'file_op', op, path:opPath })
    }

    try {
      for await (const event of streamChat(trimmed, pp, sessionIds[pid], selectedModel, ctrl.signal, mode)) {
        if (event.type==='stream_event'&&event.event?.type==='content_block_delta'&&event.event.delta?.type==='text_delta') {
          fullText += event.event.delta.text; updateAssistant(fullText)
        }
        if (event.type==='assistant'&&event.message?.content) {
          for (const block of event.message.content) {
            if (block.type==='text'&&block.text) fullText=block.text
            if (block.type==='tool_use'&&block.name) addToolOp(block.name, block.input??{})
          }
          updateAssistant(fullText)
        }
        if (event.type==='result') {
          if (event.session_id) setSessionIds(prev => ({ ...prev, [pid]: event.session_id! }))
          if (!fullText&&event.result) { fullText=event.result; updateAssistant(fullText) }
          finalCost=event.total_cost_usd; finalDur=event.duration_ms
          if (event.usage) { finalIn=event.usage.input_tokens; finalOut=event.usage.output_tokens }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') updateAssistant(fullText+(fullText?'\n\n':'')+`⚠️ Error: ${e}`)
    } finally {
      setStreaming(false); abortRef.current=null
      updateAssistant(fullText, { cost:finalCost, inputTokens:finalIn, outputTokens:finalOut, durationMs:finalDur })
      setMessagesByProject(prev => {
        const msgs = prev[pid]??[]
        const final = msgs.find(m => m.id===assistantId)
        if (final&&final.parts.length>0) appendHistory(pp, { ...final, ts:Date.now() })
        return prev
      })
    }
  }

  const stopStreaming = () => {
    abortRef.current?.abort()
    if (project) abortChat(project.path)
    setStreaming(false)
  }
  const selectCmd = (cmd:string) => {
    const w=input.split(/\s+/); w[w.length-1]=cmd
    setInput(w.join(' ')+' '); setPalette(false); taRef.current?.focus()
  }

  // ── Add project ───────────────────────────────────────────────────
  const pickFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker()
      const res = await fetch(`/api/find-dir?name=${encodeURIComponent(handle.name)}`).then(r=>r.json())
      if (res.matches?.length===1) {
        const dir = await fetch(`/api/dir?path=${encodeURIComponent(res.matches[0])}`).then(r=>r.json())
        if (!dir.error) {
          const np: Project = { id:String(Date.now()), name:dir.name, path:dir.path, files:dir.files }
          setProjects(prev => prev.some(p=>p.path===dir.path)?prev:[...prev,np]); setProject(np); return
        }
      }
      setAddingProject(true); setAddPath(res.matches?.[0]??'~/'+handle.name)
    } catch {}
  }
  const addProject = async () => {
    if (!addPath.trim()) return; setAddError('')
    try {
      const data = await fetch(`/api/dir?path=${encodeURIComponent(addPath.trim())}`).then(r=>r.json())
      if (data.error) { setAddError(data.error); return }
      const np: Project = { id:String(Date.now()), name:data.name, path:data.path, files:data.files }
      setProjects(prev=>[...prev,np]); setProject(np); setAddingProject(false); setAddPath('')
    } catch(e) { setAddError(String(e)) }
  }

  const t = T[lang]

  // ── Shared props for panel rendering ─────────────────────────────
  const sharedProps: PanelSharedProps = {
    lang, project, hasPlanningDir, gsdState, gsdRoadmap,
    selectedFile, fileContent, fileMtime, fileLoading, showMdPreview, fileBlobUrl,
    installedPluginIds,
    onFileSelect,
    onToggleMdPreview: () => setShowMdPreview(p=>!p),
    onRefreshFile: () => selectedFile && loadFile(selectedFile),
    onInsertSkill: (cmd:string) => { setInput(cmd); taRef.current?.focus() },
    onPluginsChange: setInstalledPluginIds,
    extraPluginSkills,
  }

  // ── Get runtime panel ratios for a column ────────────────────────
  const getRatios = (col: ColumnConfig, colIdx: number): number[] => {
    const override = panelRatios[colIdx]
    if (override && override.length === col.panels.length) return override
    if (col.splitRatios && col.splitRatios.length === col.panels.length - 1) {
      const last = Math.max(0.05, 1 - col.splitRatios.reduce((a, b) => a + b, 0))
      return [...col.splitRatios, last]
    }
    return Array(col.panels.length).fill(1 / col.panels.length)
  }

  // ── Chat panel ────────────────────────────────────────────────────
  const renderChatPanel = () => (
    <>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px 10px 12px',borderBottom:`1px solid ${B}`,flexShrink:0,gap:8,background:'#0C0C0F'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
          <span style={{fontSize:14,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {project?.name ?? (lang==='zh'?'未选择项目':'No project')}
          </span>
          {project && <span style={{fontSize:10,fontFamily:'JetBrains Mono',color:'#50505A',padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.04)',border:`1px solid ${B}`,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:0}}>{project.path}</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <ModelSelector selectedModel={selectedModel} onSelect={setSelectedModel} lang={lang}/>
          <span style={{width:6,height:6,borderRadius:'50%',background:streaming?'#E5C07B':'#3ECF8E',boxShadow:streaming?'0 0 6px #E5C07B':'0 0 6px #3ECF8E',flexShrink:0}}/>
          <span style={{fontSize:10,fontFamily:'JetBrains Mono',color:'#50505A'}}>{streaming?(lang==='zh'?'思考中…':'thinking…'):'ready'}</span>
        </div>
      </div>
      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
        {!project ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,color:'#50505A'}}>
            <FolderOpen size={32} style={{color:'#3A3A42'}}/>
            <p style={{fontSize:13}}>{lang==='zh'?'选择或添加一个项目以开始':'Select or add a project to start'}</p>
          </div>
        ) : (
          <>{messages.map(m=><Bubble key={m.id} msg={m} lang={lang}/>)}<div ref={endRef}/></>
        )}
      </div>
      {/* Input */}
      <div style={{padding:'0 16px 16px',flexShrink:0}}>
        <div style={{position:'relative'}}>
          {palette && <Palette query={pQuery} onSelect={selectCmd} lang={lang} extraSkills={extraPluginSkills}/>}
          <div style={{display:'flex',alignItems:'flex-end',gap:10,padding:'10px 14px',borderRadius:16,background:'#131316',border:`1px solid ${B}`,transition:'border-color 0.2s'}}
            onFocusCapture={e=>e.currentTarget.style.borderColor='rgba(124,92,252,0.4)'}
            onBlurCapture={e=>e.currentTarget.style.borderColor=B}>
            <button onClick={cycleMode} style={{flexShrink:0,alignSelf:'flex-end',marginBottom:4,fontSize:10,fontFamily:'JetBrains Mono',padding:'2px 6px',borderRadius:5,border:`1px solid ${mode==='trust'?'rgba(62,207,142,0.35)':mode==='plan'?'rgba(97,175,239,0.35)':'rgba(255,255,255,0.1)'}`,background:mode==='trust'?'rgba(62,207,142,0.08)':mode==='plan'?'rgba(97,175,239,0.08)':'transparent',color:mode==='trust'?'#3ECF8E':mode==='plan'?'#61AFEF':'#50505A',cursor:'pointer',whiteSpace:'nowrap'}}>
              {mode==='trust'?'⚡ Trust':mode==='plan'?'📋 Plan':'🔒 Normal'}
            </button>
            <textarea ref={taRef} value={input} onChange={onInput} onKeyDown={onKey} disabled={!project||streaming} rows={1}
              placeholder={!project?(lang==='zh'?'请先选择项目':'Select a project'):streaming?(lang==='zh'?'Claude 思考中…':'thinking…'):t.placeholder}
              style={{flex:1,background:'transparent',fontSize:14,outline:'none',resize:'none',lineHeight:1.6,color:'#ECECF1',caretColor:'#7C5CFC',minHeight:20,maxHeight:120,fontFamily:'Inter, sans-serif',opacity:(!project||streaming)?0.4:1}}/>
            {streaming ? (
              <button onClick={stopStreaming} style={{flexShrink:0,width:30,height:30,borderRadius:9,background:'#E63B2E',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{width:9,height:9,borderRadius:2,background:'#fff'}}/>
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim()} style={{flexShrink:0,width:30,height:30,borderRadius:9,background:input.trim()?'#7C5CFC':'rgba(255,255,255,0.05)',border:'none',cursor:input.trim()?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}
                onMouseEnter={e=>{if(input.trim())e.currentTarget.style.transform='scale(1.08)'}}
                onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                <Send size={12} style={{color:input.trim()?'#fff':'#50505A'}}/>
              </button>
            )}
          </div>
          <p style={{fontSize:10,color:'#3A3A42',marginTop:5,paddingLeft:2}}>{t.hint}</p>
        </div>
      </div>
    </>
  )

  if (appLoading) return (
    <div style={{display:'flex',height:'100vh',alignItems:'center',justifyContent:'center',background:'#0C0C0F',color:'#50505A',fontFamily:'JetBrains Mono',fontSize:12}}>loading…</div>
  )

  return (
    <div ref={wrapRef} style={{display:'flex',height:'100vh',overflow:'hidden',background:'#0C0C0F',color:'#ECECF1',fontFamily:'Inter, system-ui, sans-serif',position:'relative'}}>
      {/* Noise overlay */}
      <svg style={{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',opacity:0.025,zIndex:0}} aria-hidden="true">
        <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter>
        <rect width="100%" height="100%" filter="url(#noise)"/>
      </svg>

      {/* File drop overlay */}
      <div id="file-drop-overlay" style={{display:'none',position:'fixed',inset:0,zIndex:50,alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,background:'rgba(12,12,15,0.8)',border:'2px dashed rgba(124,92,252,0.5)',borderRadius:16,margin:8,pointerEvents:'none'}}>
        <FileText size={36} style={{color:'#9B82FF'}}/>
        <p style={{color:'#9B82FF',fontSize:15,fontWeight:500}}>{lang==='zh'?'拖入以打开文件':'Drop to open file'}</p>
      </div>

      {/* ── Sidebar ── */}
      <aside data-sidebar style={{width:layout.sidebarWidth,flexShrink:0,display:'flex',flexDirection:'column',background:'#131316',overflow:'hidden',zIndex:1}}>
        {/* Top section — flex-sized so it shrinks when sidebarBottomPanels is active */}
        <div style={{flex: (layout.sidebarBottomPanels?.length ?? 0) > 0 ? (sidebarRatio ?? layout.sidebarSplitRatio ?? 0.45) : 1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>
        {/* Sidebar header */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 10px 12px 8px',borderBottom:`1px solid ${B}`,flexShrink:0}}>
          <div style={{width:22,height:22,borderRadius:7,background:'#7C5CFC',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Sparkles size={11} style={{color:'#fff'}}/>
          </div>
          <span style={{fontSize:13,fontWeight:500}}>claude</span>
          <span style={{fontSize:13,color:'#50505A'}}>gui</span>
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:4}}>
            {/* Layout button */}
            <button onClick={()=>setShowLayoutEditor(true)} title={lang==='zh'?'排版':'Layout'}
              style={{padding:4,borderRadius:7,border:`1px solid ${B}`,background:'transparent',color:'#50505A',cursor:'pointer',display:'flex',alignItems:'center',transition:'all 0.15s'}}
              onMouseEnter={e=>{e.currentTarget.style.color='#9B82FF';e.currentTarget.style.borderColor='rgba(124,92,252,0.4)'}}
              onMouseLeave={e=>{e.currentTarget.style.color='#50505A';e.currentTarget.style.borderColor=B}}>
              <LayoutGrid size={13}/>
            </button>
            {/* Language */}
            <button onClick={()=>setLang(l=>l==='zh'?'en':'zh')}
              style={{display:'flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:20,background:'rgba(124,92,252,0.1)',color:'#9B82FF',border:`1px solid rgba(124,92,252,0.25)`,fontSize:10,cursor:'pointer'}}>
              <Languages size={9}/>{lang==='zh'?'EN':'中'}
            </button>
          </div>
        </div>
        {/* Projects */}
        <div style={{padding:'12px 12px 4px',flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A'}}>{t.projects}</span>
        </div>
        <div style={{padding:'0 6px',flexShrink:0}}>
          {projects.map(p=>(
            <button key={p.id} onClick={()=>setProject(p)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'5px 7px',borderRadius:7,background:project?.id===p.id?'rgba(124,92,252,0.1)':'transparent',color:project?.id===p.id?'#9B82FF':'#8B8B96',border:'none',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}
              onMouseEnter={e=>{if(project?.id!==p.id)e.currentTarget.style.background='rgba(255,255,255,0.03)'}}
              onMouseLeave={e=>{if(project?.id!==p.id)e.currentTarget.style.background='transparent'}}>
              <Folder size={12} style={{flexShrink:0}}/>
              <span style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{p.name}</span>
            </button>
          ))}
        </div>
        {project && projectContext?.tags.length! > 0 && (
          <div style={{padding:'4px 10px 6px',display:'flex',flexWrap:'wrap',gap:3}}>
            {projectContext!.tags.map(tag=><span key={tag} style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(124,92,252,0.08)',color:'#9B82FF',border:'1px solid rgba(124,92,252,0.15)'}}>{tag}</span>)}
          </div>
        )}
        {/* Files */}
        <div style={{padding:'10px 12px 4px',flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A'}}>{t.files}</span>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'0 6px 8px'}}>
          {project
            ? project.files.map((n,i)=><FileTreeNode key={i} node={n} basePath={project.path} onSelect={onFileSelect} selectedPath={selectedFile}/>)
            : <div style={{padding:12,textAlign:'center',color:'#50505A',fontSize:11}}>{lang==='zh'?'选择或添加项目':'Select or add a project'}</div>
          }
        </div>
        {/* Add project */}
        <div style={{padding:10,borderTop:`1px solid ${B}`,flexShrink:0}}>
          {addingProject ? (
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              <input autoFocus value={addPath} onChange={e=>{setAddPath(e.target.value);setAddError('')}}
                onKeyDown={e=>{if(e.key==='Enter')addProject();if(e.key==='Escape'){setAddingProject(false);setAddPath('');setAddError('')}}}
                placeholder={lang==='zh'?'~/Projects/my-app':'~/Projects/my-app'}
                style={{width:'100%',padding:'6px 9px',borderRadius:7,border:`1px solid ${addError?'#E63B2E':BM}`,background:'#0C0C0F',color:'#ECECF1',fontSize:11,fontFamily:'JetBrains Mono',outline:'none',boxSizing:'border-box'}}
              />
              {addError && <p style={{fontSize:10,color:'#E63B2E',margin:0}}>{addError}</p>}
              <div style={{display:'flex',gap:5}}>
                <button onClick={addProject} style={{flex:1,padding:'4px',borderRadius:7,border:'none',background:'#7C5CFC',color:'#fff',fontSize:11,cursor:'pointer'}}>{lang==='zh'?'添加':'Add'}</button>
                <button onClick={()=>{setAddingProject(false);setAddPath('');setAddError('')}} style={{flex:1,padding:'4px',borderRadius:7,border:`1px solid ${B}`,background:'transparent',color:'#70737D',fontSize:11,cursor:'pointer'}}>{lang==='zh'?'取消':'Cancel'}</button>
              </div>
            </div>
          ) : (
            <div style={{display:'flex',gap:5}}>
              <button onClick={pickFolder} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'7px',borderRadius:10,border:`1px dashed rgba(255,255,255,0.08)`,background:'transparent',color:'#50505A',fontSize:11,cursor:'pointer',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(124,92,252,0.35)';e.currentTarget.style.color='#9B82FF'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.08)';e.currentTarget.style.color='#50505A'}}>
                <FolderOpen size={11}/>{lang==='zh'?'选择文件夹':'Pick Folder'}
              </button>
              <button onClick={()=>setAddingProject(true)} style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'7px 10px',borderRadius:10,border:`1px dashed rgba(255,255,255,0.08)`,background:'transparent',color:'#50505A',cursor:'pointer',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.15)';e.currentTarget.style.color='#70737D'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.08)';e.currentTarget.style.color='#50505A'}}>
                <Plus size={12}/>
              </button>
            </div>
          )}
        </div>
      </div>{/* end file-tree section */}

      {/* ── Sidebar bottom panels (optional) ── */}
      {layout.sidebarBottomPanels && layout.sidebarBottomPanels.length > 0 && (() => {
        const bPanels = layout.sidebarBottomPanels!
        const sMode = layout.sidebarMode ?? 'split'
        const topRatio = sidebarRatio ?? layout.sidebarSplitRatio ?? 0.45

        const renderBottomContent = () => {
          if (sMode === 'tabs' && bPanels.length > 1) {
            const activeIdx = Math.min(sidebarActiveTab, bPanels.length - 1)
            return (
              <>
                <TabBar panels={bPanels} activeIdx={activeIdx} onChange={setSidebarActiveTab} lang={lang}/>
                <div style={{flex:1, overflow:'auto', display:'flex', flexDirection:'column'}}>
                  <PanelContent id={bPanels[activeIdx]} props={sharedProps}/>
                </div>
              </>
            )
          }
          // Split mode: single panel or multiple split
          return bPanels.map((sid, i) => (
            <React.Fragment key={sid}>
              {i > 0 && <div style={{height:1, background:B, flexShrink:0}}/>}
              <div style={{flex: 1 / bPanels.length, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>
                <PanelBar id={sid} lang={lang}/>
                <div style={{flex:1, overflow:'auto', display:'flex', flexDirection:'column'}}>
                  <PanelContent id={sid} props={sharedProps}/>
                </div>
              </div>
            </React.Fragment>
          ))
        }

        return (
          <>
            <RowResizeHandle onDragStart={() => {
              const el = document.querySelector('[data-sidebar]') as HTMLElement
              const rect = el?.getBoundingClientRect()
              sidebarRowResizeRef.current = {
                startY: 0,
                startRatio: topRatio,
                sidebarH: rect?.height ?? 600,
              }
              document.body.style.cursor='row-resize'; document.body.style.userSelect='none'
              const cap = (e: MouseEvent) => {
                if (sidebarRowResizeRef.current) sidebarRowResizeRef.current.startY = e.clientY
                window.removeEventListener('mousemove', cap)
              }
              window.addEventListener('mousemove', cap)
            }}/>
            <div style={{flex: 1 - topRatio, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>
              {renderBottomContent()}
            </div>
          </>
        )
      })()}
      </aside>

      {/* ── Sidebar resize handle ── */}
      <ResizeHandle
        onDragStart={() => {
          document.body.style.cursor='col-resize'; document.body.style.userSelect='none'
          // save new sidebarWidth on mouseup via a one-time handler
          const onUp = () => { document.body.style.cursor=''; document.body.style.userSelect=''; window.removeEventListener('mouseup', onUp) }
          window.addEventListener('mouseup', onUp)
        }}
        onDoubleClick={() => applyLayout({ ...layout, sidebarWidth: 240 })}
      />
      {/* Actually we handle sidebar resize separately via layout.sidebarWidth in the LayoutEditor,
          so this handle just works live via colResizeRef mechanism for the sidebar */}

      {/* ── Content columns ── */}
      {layout.columns.map((col, colIdx) => {
        const isLast = colIdx === layout.columns.length - 1
        const effectiveWidth = colWidths[colIdx] ?? col.width
        return (
          <React.Fragment key={colIdx}>
            <div
              data-col={colIdx}
              style={{
                flex: effectiveWidth ? 0 : 1,
                width: effectiveWidth,
                minWidth: 200,
                display:'flex', flexDirection:'column',
                background:'#0C0C0F', overflow:'hidden', position:'relative',
              }}
            >
              {(() => {
                const mode = col.mode ?? 'split'

                if (mode === 'tabs' && col.panels.length > 1) {
                  // ── Tab mode ──────────────────────────────────────
                  const activeIdx = Math.min(activeTabs[colIdx] ?? 0, col.panels.length - 1)
                  const panelId = col.panels[activeIdx]
                  return (
                    <>
                      <TabBar
                        panels={col.panels}
                        activeIdx={activeIdx}
                        onChange={i => setActiveTabs(prev => ({ ...prev, [colIdx]: i }))}
                        lang={lang}
                      />
                      <div style={{flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>
                        <div style={{flex:1, overflow:'auto', display:'flex', flexDirection:'column'}}>
                          {panelId === 'chat' ? renderChatPanel() : <PanelContent id={panelId} props={sharedProps}/>}
                        </div>
                      </div>
                    </>
                  )
                }

                // ── Split mode (default) ───────────────────────────
                const ratios = getRatios(col, colIdx)
                return col.panels.map((panelId, pIdx) => (
                  <React.Fragment key={panelId}>
                    {pIdx > 0 && (
                      <RowResizeHandle onDragStart={() => {
                        const el = document.querySelector(`[data-col="${colIdx}"]`) as HTMLElement
                        const rect = el?.getBoundingClientRect()
                        rowResizeRef.current = {
                          colIdx, handleIdx: pIdx - 1,
                          startY: 0, startRatios: getRatios(col, colIdx),
                          colHeight: rect?.height ?? 600,
                        }
                        document.body.style.cursor='row-resize'; document.body.style.userSelect='none'
                        const cap = (e: MouseEvent) => { if (rowResizeRef.current) rowResizeRef.current.startY = e.clientY; window.removeEventListener('mousemove', cap) }
                        window.addEventListener('mousemove', cap)
                      }}/>
                    )}
                    <div style={{flex: ratios[pIdx], display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>
                      {panelId !== 'chat' && <PanelBar id={panelId} lang={lang}/>}
                      <div style={{flex:1, overflow:'auto', display:'flex', flexDirection:'column'}}>
                        {panelId === 'chat' ? renderChatPanel() : <PanelContent id={panelId} props={sharedProps}/>}
                      </div>
                    </div>
                  </React.Fragment>
                ))
              })()}
            </div>
            {!isLast && (
              <ResizeHandle
                onDragStart={() => {
                  const startW = colWidths[colIdx] ?? col.width ?? 360
                  colResizeRef.current = { colIdx, startX: 0, startW }
                  document.body.style.cursor='col-resize'; document.body.style.userSelect='none'
                  const cap = (e: MouseEvent) => { if (colResizeRef.current) colResizeRef.current.startX = e.clientX; window.removeEventListener('mousemove', cap) }
                  window.addEventListener('mousemove', cap)
                }}
                onDoubleClick={() => {
                  setColWidths(prev => { const next = {...prev}; delete next[colIdx]; return next })
                }}
              />
            )}
          </React.Fragment>
        )
      })}

      {/* ── Layout Editor modal ── */}
      {showLayoutEditor && (
        <LayoutEditor
          current={layout}
          lang={lang}
          hasPlanningDir={hasPlanningDir}
          onApply={applyLayout}
          onClose={() => setShowLayoutEditor(false)}
        />
      )}
    </div>
  )
}
