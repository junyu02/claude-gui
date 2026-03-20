import React, { useState, useRef, useEffect, useCallback } from 'react'
import { gsap } from 'gsap'
import {
  FolderOpen, Folder, Plus, Send, RefreshCw, Sparkles, Languages,
  Globe, Cpu, Terminal as TerminalIcon, Zap, Hash, GripVertical,
  ListChecks, FileCode, FileText, Package,
} from 'lucide-react'
import {
  Lang, T, Message, FileNode, Project, Part, ColId, B, BM,
  SKILLS, DEFAULT_MODEL,
} from './types'
import { loadRegistry, saveRegistry, ensureGuiDir, loadHistory, appendHistory,
  loadContext, generateContext, hasGsdPlanning, trackCommand, HistoryEntry, ProjectContext } from './storage'
import { readDir, readFileContent, streamChat, abortChat, type ChatStreamEvent } from './api'

// ── Components ────────────────────────────────────────────────────────
import { MarkdownPreview } from './components/MarkdownPreview'
import { FileViewer, FileTreeNode } from './components/FileViewer'
import { Bubble, Palette } from './components/ChatBubble'
import { ModelSelector } from './components/ModelSelector'
import { TerminalTab } from './components/TerminalTab'
import { PluginMarketplace, InstalledCount } from './components/PluginMarketplace'
import { MARKETPLACE_PLUGINS } from './plugins'

// ── ResizeHandle ──────────────────────────────────────────────────────
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

// ── PreviewTab ────────────────────────────────────────────────────────
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
        <a href={`http://localhost:${active}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/[0.06] text-t3 hover:text-t2 transition-colors">↗</a>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <iframe ref={iref} src={`http://localhost:${active}`} className="w-full h-full border-0" title="Preview"/>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none" style={{background:'#0C0C0F'}}>
          <Globe size={18} className="text-accent opacity-30"/>
          <p className="text-xs text-t3 font-mono">localhost:{active}</p>
          <p className="text-[10px] text-t3">{T[lang].startServer}</p>
        </div>
      </div>
    </div>
  )
}

// ── SkillsTab ─────────────────────────────────────────────────────────
function SkillsTab({ onInsert, lang, extraCmds }: {
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
    ...(extraCmds ?? []).map(c => ({ id: c.cmd, name: c.name, desc: c.desc, descEn: c.desc, cmd: c.cmd, cat: 'workflow' as const, category: 'workflow' }))
  ]
  return (
    <div className="p-3 space-y-2">
      {all.map(s=>(
        <button key={s.id} onClick={()=>onInsert(s.cmd+' ')} className="w-full flex items-start gap-3 p-3 rounded-xl text-left group transition-all"
          style={{background:'#1A1A1E',border:`1px solid ${B}`}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=BM} onMouseLeave={e=>e.currentTarget.style.borderColor=B}>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-accent mb-0.5 truncate">{s.cmd}</p>
            <p className="text-[11px] text-t3 group-hover:text-t2 transition-colors">{lang==='zh'?s.desc:s.descEn}</p>
          </div>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 mt-0.5"
            style={{background:CAT_CLR[s.cat]?.bg,color:CAT_CLR[s.cat]?.txt,border:`1px solid ${CAT_CLR[s.cat]?.bdr}`}}>{s.cat}</span>
        </button>
      ))}
    </div>
  )
}

// ── MCPTab (live) ─────────────────────────────────────────────────────
function MCPTab({ lang }: { lang: Lang }) {
  const [servers, setServers] = useState<Array<{ name:string; command:string; args:string[]; status:string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/mcp-status')
      .then(r => r.json())
      .then(data => { setServers(data.servers ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const dot = { connected:'#3ECF8E', configured:'#61AFEF', idle:'#E5C07B', unknown:'#50505A', off:'#3A3A42' }

  if (loading) return <div style={{padding:24,textAlign:'center',color:'#50505A',fontSize:12,fontFamily:'JetBrains Mono'}}>loading…</div>
  if (servers.length === 0) return (
    <div style={{padding:24,textAlign:'center',color:'#50505A',fontSize:12}}>
      {lang === 'zh' ? '未检测到 MCP 服务器' : 'No MCP servers detected'}
      <p style={{fontSize:10,marginTop:8,color:'#3A3A42'}}>
        {lang === 'zh' ? '在插件市场安装 MCP 插件' : 'Install MCP plugins from marketplace'}
      </p>
    </div>
  )
  return (
    <div className="p-3 space-y-2">
      {servers.map(item=>(
        <div key={item.name} className="flex items-start gap-3 p-3 rounded-xl" style={{background:'#1A1A1E',border:`1px solid ${B}`}}>
          <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{background:dot[item.status as keyof typeof dot] ?? dot.unknown}}/>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-t1 font-semibold">{item.name}</p>
            <p className="text-[10px] text-t3 font-mono truncate">{item.command} {item.args.join(' ')}</p>
          </div>
          <span className="text-[10px] uppercase tracking-wide font-medium shrink-0" style={{color:dot[item.status as keyof typeof dot] ?? dot.unknown}}>
            {item.status}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── ProgressTab ───────────────────────────────────────────────────────
function ProgressTab({ stateContent, roadmapContent, lang }: { stateContent: string | null; roadmapContent: string | null; lang: Lang }) {
  if (!stateContent && !roadmapContent) {
    return <div style={{padding:24,textAlign:'center',color:'#50505A',fontSize:12}}>No .planning/ directory found</div>
  }
  return (
    <div style={{flex:1,overflowY:'auto'}}>
      {stateContent && (
        <div>
          <div style={{padding:'12px 16px',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',borderBottom:`1px solid ${B}`}}>
            {lang === 'zh' ? '当前状态' : 'Current State'}
          </div>
          <MarkdownPreview content={stateContent} />
        </div>
      )}
      {roadmapContent && (
        <div>
          <div style={{padding:'12px 16px',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',borderBottom:`1px solid ${B}`}}>
            {lang === 'zh' ? '路线图' : 'Roadmap'}
          </div>
          <MarkdownPreview content={roadmapContent} />
        </div>
      )}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────
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

  // Project adding
  const [addingProject, setAddingProject] = useState(false)
  const [addPath, setAddPath]     = useState('')
  const [addError, setAddError]   = useState('')

  // Input
  const [input, setInput]         = useState('')
  const [palette, setPalette]     = useState(false)
  const [pQuery, setPQuery]       = useState('')
  const [mode, setMode]           = useState<'trust'|'plan'|'normal'>('trust')

  // Model selection
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)

  // Right panel
  const [rTab, setRTab] = useState<'preview'|'skills'|'mcp'|'code'|'progress'|'terminal'|'plugins'>('preview')
  const [installedPluginIds, setInstalledPluginIds] = useState<string[]>([])

  // Column layout (free arrangement)
  const [colOrder, setColOrder]   = useState<ColId[]>(['sidebar', 'chat', 'right'])
  const [colDragOver, setColDragOver] = useState<ColId | null>(null)
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

  // ── Plugins → extra skill commands ────────────────────────────────
  const extraPluginSkills = MARKETPLACE_PLUGINS
    .filter(p => installedPluginIds.includes(p.id) && !!p.skillCmd)
    .map(p => ({ cmd: p.skillCmd!, name: p.name, desc: lang === 'zh' ? p.description : p.descriptionEn }))

  // ── Load registry on mount ────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
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

  useEffect(() => {
    if (projects.length > 0) {
      saveRegistry({ projects: projects.map(p => ({ id: p.id, name: p.name, path: p.path, devPort: p.devPort })) })
    }
  }, [projects])

  // ── On project switch ──────────────────────────────────────────────
  useEffect(() => {
    if (!project) return
    const projectId = project.id
    ;(async () => {
      await ensureGuiDir(project.path)
      if (!messagesByProject[projectId]) {
        const entries = await loadHistory(project.path)
        const msgs: Message[] = entries.map(e => ({ id: e.id, role: e.role, parts: e.parts, time: e.time }))
        setMessagesByProject(prev => ({ ...prev, [projectId]: msgs }))
      }
      let ctx = await loadContext(project.path)
      if (!ctx) ctx = await generateContext(project.path)
      setProjectContext(ctx)
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

  // ── GSAP entrance ─────────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(sideRef.current, {x:-16,opacity:0,duration:0.55,ease:'power3.out'})
      gsap.from(chatRef.current, {y:12, opacity:0,duration:0.55,delay:0.08,ease:'power3.out'})
      gsap.from(rpRef.current,   {x:16, opacity:0,duration:0.55,delay:0.16,ease:'power3.out'})
    })
    return () => ctx.revert()
  }, [])

  // ── Panel resize ───────────────────────────────────────────────────
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

  // ── Column reorder ─────────────────────────────────────────────────
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

  // ── File loading ───────────────────────────────────────────────────
  const TEXT_EXTS  = ['md','markdown','txt','ts','tsx','js','jsx','css','json','yaml','yml','py','html','sh','env']
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── File drop from OS ──────────────────────────────────────────────
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
      let folderName: string | null = null
      try {
        const entry = e.dataTransfer!.items?.[0]?.webkitGetAsEntry?.()
        if (entry?.isDirectory) folderName = entry.name
      } catch {}
      if (!folderName && e.dataTransfer!.files.length === 0 && e.dataTransfer!.items?.length > 0) {
        try { folderName = e.dataTransfer!.items[0]?.getAsFile?.()?.name ?? null } catch {}
      }
      const f0 = e.dataTransfer!.files[0]
      if (!folderName && f0 && f0.type === '' && f0.size === 0 && !f0.name.includes('.')) folderName = f0.name
      if (folderName) { handleFolderDrop(folderName); return }
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

  // Auto-poll file
  useEffect(() => {
    if (!selectedFile || rTab !== 'code') return
    const id = setInterval(() => loadFile(selectedFile, fileMtime ?? undefined), 3000)
    return () => clearInterval(id)
  }, [selectedFile, rTab, fileMtime, loadFile])

  // ⇧⌘V
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
      setAddingProject(true)
      setAddPath(data.matches?.[0] ?? '~/' + name)
    } catch { /* user cancelled */ }
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
  const cycleMode = () => setMode(m => m === 'trust' ? 'plan' : m === 'plan' ? 'normal' : 'trust')
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if(e.key==='Tab'&&e.shiftKey){e.preventDefault();cycleMode();return}
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

    setStreaming(true)
    const assistantId = String(Date.now() + 1)
    const aTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    const assistantMsg: Message = { id: assistantId, role: 'assistant', parts: [], time: aTime }
    setMessagesByProject(prev => ({ ...prev, [pid]: [...(prev[pid] ?? []), assistantMsg] }))

    const ctrl = new AbortController()
    abortRef.current = ctrl

    let fullText = ''
    const toolOps: Part[] = []
    let finalCost: number | undefined
    let finalInputTokens: number | undefined
    let finalOutputTokens: number | undefined
    let finalDuration: number | undefined

    const updateAssistant = (text: string, meta?: Partial<Message>) => {
      const parts: Part[] = [...toolOps]
      if (text) parts.push({ type: 'text', content: text })
      setMessagesByProject(prev => {
        const msgs = [...(prev[pid] ?? [])]
        const idx = msgs.findIndex(m => m.id === assistantId)
        if (idx >= 0) msgs[idx] = { ...msgs[idx], parts, ...meta }
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
      for await (const event of streamChat(trimmed, pp, sessionIds[pid], selectedModel, ctrl.signal, mode)) {
        if (event.type === 'stream_event' && event.event) {
          const ev = event.event
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            fullText += ev.delta.text
            updateAssistant(fullText)
          }
        }
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text' && block.text) fullText = block.text
            if (block.type === 'tool_use' && block.name) addToolOp(block.name, block.input ?? {})
          }
          updateAssistant(fullText)
        }
        if (event.type === 'result') {
          if (event.session_id) setSessionIds(prev => ({ ...prev, [pid]: event.session_id! }))
          if (!fullText && event.result) { fullText = event.result; updateAssistant(fullText) }
          // Capture cost & tokens
          finalCost         = event.total_cost_usd
          finalDuration     = event.duration_ms
          if (event.usage) {
            finalInputTokens  = event.usage.input_tokens
            finalOutputTokens = event.usage.output_tokens
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
      // Final update with cost metadata
      updateAssistant(fullText, {
        cost: finalCost,
        inputTokens: finalInputTokens,
        outputTokens: finalOutputTokens,
        durationMs: finalDuration,
      })
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

  type TabId = 'preview'|'code'|'progress'|'skills'|'mcp'|'terminal'|'plugins'
  const TABS: { id: TabId; label: string; Icon: React.ComponentType<any>; dot: boolean; extra?: React.ReactNode }[] = [
    {id:'preview',  label:t.preview,  Icon:Globe,          dot:false},
    {id:'code',     label:t.code,     Icon:FileCode,       dot:!!selectedFile},
    ...(hasPlanningDir ? [{id:'progress' as const, label:lang==='zh'?'进度':'Progress', Icon:ListChecks, dot:true, extra:undefined}] : []),
    {id:'skills',   label:t.skills,   Icon:Zap,            dot:false},
    {id:'mcp',      label:'MCP',      Icon:Cpu,            dot:false},
    {id:'terminal', label:t.terminal, Icon:TerminalIcon,   dot:false},
    {id:'plugins',  label:t.plugins,  Icon:Package,        dot:false, extra:<InstalledCount count={installedPluginIds.length}/>},
  ]

  // ── Grip handle ────────────────────────────────────────────────────
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

  // ── Render panels ──────────────────────────────────────────────────
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
                autoFocus value={addPath}
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
        {/* Chat header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px 10px 8px',borderBottom:`1px solid ${B}`,flexShrink:0,gap:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
            <Grip colId="chat"/>
            <TerminalIcon size={13} style={{color:'#50505A',flexShrink:0}}/>
            <span style={{fontSize:14,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{project?.name ?? (lang==='zh'?'未选择项目':'No project')}</span>
            {project && <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#50505A',padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.04)',border:`1px solid ${B}`,flexShrink:0,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{project.path}</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            {/* Model selector */}
            <ModelSelector selectedModel={selectedModel} onSelect={setSelectedModel} lang={lang}/>
            {/* Status dot */}
            <span style={{width:6,height:6,borderRadius:'50%',background:streaming?'#E5C07B':'#3ECF8E',boxShadow:streaming?'0 0 6px #E5C07B':'0 0 6px #3ECF8E',flexShrink:0,animation:streaming?'pulse 1s infinite':undefined}}/>
            <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#50505A'}}>{streaming?(lang==='zh'?'思考中…':'thinking…'):'ready'}</span>
          </div>
        </div>
        {/* Messages */}
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
        {/* Input area */}
        <div style={{padding:'0 20px 20px',flexShrink:0}}>
          <div style={{position:'relative'}}>
            {palette && <Palette query={pQuery} onSelect={selectCmd} lang={lang} extraSkills={extraPluginSkills}/>}
            <div style={{display:'flex',alignItems:'flex-end',gap:12,padding:'12px 16px',borderRadius:18,background:'#131316',border:`1px solid ${B}`,transition:'border-color 0.2s'}}
              onFocusCapture={e=>e.currentTarget.style.borderColor='rgba(124,92,252,0.4)'}
              onBlurCapture={e=>e.currentTarget.style.borderColor=B}>
              <button onClick={cycleMode} title="Shift+Tab 切换模式" style={{flexShrink:0,alignSelf:'flex-end',marginBottom:4,fontSize:10,fontFamily:'JetBrains Mono,monospace',padding:'2px 7px',borderRadius:6,border:`1px solid ${mode==='trust'?'rgba(62,207,142,0.35)':mode==='plan'?'rgba(97,175,239,0.35)':'rgba(255,255,255,0.1)'}`,background:mode==='trust'?'rgba(62,207,142,0.08)':mode==='plan'?'rgba(97,175,239,0.08)':'rgba(255,255,255,0.04)',color:mode==='trust'?'#3ECF8E':mode==='plan'?'#61AFEF':'#50505A',cursor:'pointer',transition:'all 0.15s',whiteSpace:'nowrap'}}>
                {mode==='trust'?'⚡ Trust':mode==='plan'?'📋 Plan':'🔒 Normal'}
              </button>
              <textarea ref={taRef} value={input} onChange={onInput} onKeyDown={onKey} disabled={!project || streaming} placeholder={!project ? (lang==='zh'?'请先选择一个项目':'Select a project first') : streaming ? (lang==='zh'?'Claude 正在思考…':'Claude is thinking…') : t.placeholder} rows={1}
                style={{flex:1,background:'transparent',fontSize:14,outline:'none',resize:'none',lineHeight:1.6,color:'#ECECF1',caretColor:'#7C5CFC',minHeight:20,maxHeight:128,fontFamily:'Inter, sans-serif',opacity:(!project||streaming)?0.4:1}}/>
              {streaming ? (
                <button onClick={stopStreaming}
                  style={{flexShrink:0,width:32,height:32,borderRadius:10,background:'#E63B2E',color:'#fff',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}>
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

    // Right panel
    return (
      <aside
        key="right" ref={(el: HTMLElement | null) => { rpRef.current = el; panelRefs.current.right = el }}
        style={{width:rightW,flexShrink:0,display:'flex',flexDirection:'column',background:'#131316',overflow:'hidden',...dropStyle}}
      >
        {/* Tabs */}
        <div style={{display:'flex',alignItems:'center',borderBottom:`1px solid ${B}`,flexShrink:0,overflowX:'auto'}}>
          <Grip colId="right"/>
          {TABS.map(({id,label,Icon,dot,extra})=>(
            <button key={id} onClick={()=>setRTab(id as any)} style={{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',gap:4,padding:'11px 8px',fontSize:10,fontWeight:500,cursor:'pointer',background:'transparent',border:'none',borderBottom:`2px solid ${rTab===id?'#7C5CFC':'transparent'}`,color:rTab===id?'#ECECF1':'#50505A',transition:'all 0.15s',whiteSpace:'nowrap'}}>
              <Icon size={11}/>{label}
              {dot && <span style={{width:5,height:5,borderRadius:'50%',background:'#3ECF8E',flexShrink:0}}/>}
              {extra}
            </button>
          ))}
        </div>
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {rTab==='preview'  && <PreviewTab port={project?.devPort} lang={lang}/>}
          {rTab==='code'     && <FileViewer selectedPath={selectedFile} content={fileContent} isLoading={fileLoading} mtime={fileMtime} onRefresh={()=>selectedFile&&loadFile(selectedFile)} showMdPreview={showMdPreview} onToggleMdPreview={()=>setShowMdPreview(p=>!p)} lang={lang} blobUrl={fileBlobUrl}/>}
          {rTab==='progress' && <ProgressTab stateContent={gsdState} roadmapContent={gsdRoadmap} lang={lang}/>}
          {rTab==='skills'   && <SkillsTab onInsert={insertSkill} lang={lang} extraCmds={extraPluginSkills}/>}
          {rTab==='mcp'      && <MCPTab lang={lang}/>}
          {rTab==='terminal' && <TerminalTab projectPath={project?.path ?? null} lang={lang}/>}
          {rTab==='plugins'  && <PluginMarketplace lang={lang} onPluginsChange={setInstalledPluginIds}/>}
        </div>
      </aside>
    )
  }

  if (appLoading) return (
    <div style={{display:'flex',height:'100vh',alignItems:'center',justifyContent:'center',background:'#0C0C0F',color:'#50505A',fontFamily:'JetBrains Mono, monospace',fontSize:12}}>
      loading…
    </div>
  )

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#0C0C0F',color:'#ECECF1',fontFamily:'Inter, system-ui, sans-serif',position:'relative'}}>
      <svg className="noise-overlay" aria-hidden="true">
        <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter>
        <rect width="100%" height="100%" filter="url(#noise)"/>
      </svg>

      {/* File drop overlay */}
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
