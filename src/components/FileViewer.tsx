import React, { useState } from 'react'
import { FolderOpen, Folder, FileCode, ChevronRight, ChevronDown, RefreshCw, Eye, Code2, FileText } from 'lucide-react'
import { B, extClr, Lang, T, FileNode } from '../types'
import { MarkdownPreview } from './MarkdownPreview'

// ── SyntaxLine ───────────────────────────────────────────────────────
export function SyntaxLine({ code, ext }: { code: string; ext: string }) {
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

// ── FileViewer ───────────────────────────────────────────────────────
const IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','svg']

export function FileViewer({
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

  if (isMd && showMdPreview && content !== null) {
    return (
      <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
        {header}
        <MarkdownPreview content={content} />
      </div>
    )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {header}
      <div style={{padding:'4px 12px',fontFamily:'JetBrains Mono, monospace',fontSize:10,color:'#3A3A42',borderBottom:`1px solid ${B}`,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {selectedPath}
      </div>
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
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 12px',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#3A3A42',borderTop:`1px solid ${B}`,flexShrink:0}}>
        <span>{lines.length} {t.lines}</span>
        <span>{ext.toUpperCase() || 'TEXT'}</span>
      </div>
    </div>
  )
}

// ── FileTreeNode ─────────────────────────────────────────────────────
export function FileTreeNode({ node, depth=0, basePath, onSelect, selectedPath }: {
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
