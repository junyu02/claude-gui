import React, { useState, useRef } from 'react'
import { X, Plus, Trash2, LayoutGrid, ChevronRight } from 'lucide-react'
import { B, BM, Lang } from '../types'
import {
  AppLayout, ColumnConfig, PanelId, PANEL_META, LAYOUT_PRESETS,
} from '../layout'

// ── Panel pill (in palette and in slots) ─────────────────────────────
function PanelPill({ id, lang, draggable, onDragStart, small }: {
  id: PanelId; lang: Lang; draggable?: boolean
  onDragStart?: (id: PanelId) => void
  small?: boolean
}) {
  const m = PANEL_META[id]
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? e => { e.dataTransfer.setData('panel-id', id); onDragStart?.(id) } : undefined}
      style={{
        display:'flex', alignItems:'center', gap:5,
        padding: small ? '3px 8px' : '6px 10px',
        borderRadius:8,
        background:`${m.color}18`,
        border:`1px solid ${m.color}40`,
        color: m.color,
        fontSize: small ? 10 : 12,
        fontWeight: 500,
        cursor: draggable ? 'grab' : 'default',
        userSelect:'none',
        whiteSpace:'nowrap',
      }}
    >
      <span style={{fontSize: small ? 11 : 14}}>{m.emoji}</span>
      {lang === 'zh' ? m.label : m.labelEn}
    </div>
  )
}

// ── Drop slot ─────────────────────────────────────────────────────────
function DropSlot({ panelId, onDrop, onClear, lang, height, label }: {
  panelId: PanelId | undefined
  onDrop: (id: PanelId) => void
  onClear?: () => void
  lang: Lang
  height?: number
  label?: string
}) {
  const [dragOver, setDragOver] = useState(false)
  const m = panelId ? PANEL_META[panelId] : null

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        const id = e.dataTransfer.getData('panel-id') as PanelId
        if (id) onDrop(id)
        setDragOver(false)
      }}
      style={{
        flex: height ? undefined : 1,
        height: height,
        minHeight: 44,
        borderRadius:10,
        border: dragOver
          ? '2px dashed rgba(124,92,252,0.6)'
          : panelId
            ? `1px solid ${m!.color}40`
            : `1.5px dashed rgba(255,255,255,0.1)`,
        background: dragOver
          ? 'rgba(124,92,252,0.08)'
          : panelId
            ? `${m!.color}0D`
            : 'rgba(255,255,255,0.02)',
        display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative',
        transition:'all 0.15s',
        overflow:'hidden',
        flexShrink: 0,
      }}
    >
      {panelId ? (
        <>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{fontSize:16}}>{m!.emoji}</span>
            <span style={{fontSize:11, fontWeight:600, color:m!.color}}>
              {lang === 'zh' ? m!.label : m!.labelEn}
            </span>
          </div>
          {onClear && (
            <button
              onClick={onClear}
              style={{
                position:'absolute', top:4, right:4,
                padding:3, borderRadius:5, border:'none',
                background:'rgba(255,255,255,0.05)', color:'#50505A',
                cursor:'pointer', display:'flex', alignItems:'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#E63B2E')}
              onMouseLeave={e => (e.currentTarget.style.color = '#50505A')}
            >
              <X size={10}/>
            </button>
          )}
        </>
      ) : (
        <span style={{fontSize:10, color:'#3A3A42'}}>
          {label ?? (lang === 'zh' ? '拖入面板' : 'Drop panel')}
        </span>
      )}
    </div>
  )
}

// ── Column card in canvas ─────────────────────────────────────────────
function ColumnCard({ col, colIdx, lang, onUpdate, onRemove, canRemove, availablePanels }: {
  col: ColumnConfig
  colIdx: number
  lang: Lang
  onUpdate: (updated: ColumnConfig) => void
  onRemove: () => void
  canRemove: boolean
  availablePanels: PanelId[]
}) {
  const setPanel = (i: number, id: PanelId) => {
    if (col.panels.includes(id)) return
    const panels = [...col.panels]
    panels[i] = id
    onUpdate({ ...col, panels })
  }

  const clearSlot = (i: number) => {
    const panels = col.panels.filter((_, j) => j !== i)
    // Reset ratios to equal when panel count changes
    onUpdate({ ...col, panels, splitRatios: undefined })
  }

  const addPanel = () => {
    const next = availablePanels.find(id => !col.panels.includes(id))
    if (!next) return
    onUpdate({ ...col, panels: [...col.panels, next], splitRatios: undefined })
  }

  const setSplitRatio = (i: number, pct: number) => {
    const n = col.panels.length
    const ratios = col.splitRatios && col.splitRatios.length === n - 1
      ? [...col.splitRatios]
      : Array(n - 1).fill(Math.round(100 / n) / 100)
    ratios[i] = pct / 100
    onUpdate({ ...col, splitRatios: ratios })
  }

  const getRatioForSlider = (i: number): number => {
    const n = col.panels.length
    return col.splitRatios?.[i] ?? 1 / n
  }

  const setWidth = (w: number | undefined) => onUpdate({ ...col, width: w })
  const widthLabel = col.width === undefined
    ? (lang === 'zh' ? '弹性' : 'Flex')
    : `${col.width}px`

  const canAddPanel = availablePanels.some(id => !col.panels.includes(id))

  return (
    <div style={{
      display:'flex', flexDirection:'column', gap:5,
      background:'#1A1A1E', border:`1px solid ${B}`,
      borderRadius:14, padding:10, minWidth:120, width:140,
      flexShrink:0,
    }}>
      {/* Column header */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2}}>
        <span style={{fontSize:10, color:'#50505A', fontFamily:'JetBrains Mono'}}>
          {lang === 'zh' ? `列 ${colIdx + 1}` : `Col ${colIdx + 1}`}
        </span>
        {canRemove && (
          <button onClick={onRemove} style={{padding:2,border:'none',background:'transparent',cursor:'pointer',color:'#3A3A42',display:'flex'}}
            onMouseEnter={e=>(e.currentTarget.style.color='#E63B2E')}
            onMouseLeave={e=>(e.currentTarget.style.color='#3A3A42')}>
            <Trash2 size={10}/>
          </button>
        )}
      </div>

      {/* N panel slots with ratio sliders between them */}
      {col.panels.map((panelId, i) => (
        <React.Fragment key={i}>
          <DropSlot
            panelId={panelId}
            onDrop={id => setPanel(i, id)}
            onClear={i === 0 && col.panels.length === 1 ? undefined : () => clearSlot(i)}
            lang={lang}
            label={i === 0 ? (lang === 'zh' ? '主面板' : 'Main') : (lang === 'zh' ? '拖入面板' : 'Drop panel')}
          />
          {/* Ratio slider between this slot and the next */}
          {i < col.panels.length - 1 && (
            <div style={{display:'flex', alignItems:'center', gap:4}}>
              <span style={{fontSize:9, color:'#50505A', minWidth:24, textAlign:'right'}}>
                {Math.round(getRatioForSlider(i) * 100)}%
              </span>
              <input
                type="range" min={10} max={80} step={5}
                value={Math.round(getRatioForSlider(i) * 100)}
                onChange={e => setSplitRatio(i, Number(e.target.value))}
                style={{flex:1, accentColor:'#7C5CFC', height:3}}
              />
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Add panel button */}
      {canAddPanel && (
        <button
          onClick={addPanel}
          style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:4,
            padding:'5px 8px', borderRadius:8, flexShrink:0,
            border:`1.5px dashed rgba(255,255,255,0.1)`,
            background:'transparent', color:'#3A3A42',
            fontSize:10, cursor:'pointer', transition:'all 0.15s',
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(124,92,252,0.35)';e.currentTarget.style.color='#9B82FF'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.1)';e.currentTarget.style.color='#3A3A42'}}
        >
          <Plus size={10}/>
          {lang === 'zh' ? '叠加面板' : 'Stack panel'}
        </button>
      )}

      {/* Width control */}
      <div style={{marginTop:2}}>
        <div style={{fontSize:9, color:'#50505A', marginBottom:4}}>
          {lang === 'zh' ? '宽度' : 'Width'}: {widthLabel}
        </div>
        <div style={{display:'flex', gap:3, flexWrap:'wrap'}}>
          {([undefined, 280, 360, 440] as const).map(w => (
            <button key={String(w)} onClick={() => setWidth(w)}
              style={{
                fontSize:9, padding:'2px 5px', borderRadius:5, cursor:'pointer',
                border:`1px solid ${col.width === w ? 'rgba(124,92,252,0.5)' : B}`,
                background: col.width === w ? 'rgba(124,92,252,0.1)' : 'transparent',
                color: col.width === w ? '#9B82FF' : '#50505A',
              }}>
              {w === undefined ? (lang === 'zh' ? '弹' : 'Flex') : w}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Layout preview thumbnail ──────────────────────────────────────────
function LayoutThumb({ layout, active }: { layout: AppLayout; active: boolean }) {
  return (
    <div style={{
      display:'flex', gap:2, height:36, padding:3,
      border:`1px solid ${active ? '#7C5CFC' : B}`,
      borderRadius:8, background: active ? 'rgba(124,92,252,0.08)' : 'rgba(255,255,255,0.02)',
      transition:'all 0.15s',
    }}>
      {/* Sidebar */}
      <div style={{width:10, display:'flex', flexDirection:'column', gap:1, borderRadius:3}}>
        <div style={{flex: layout.sidebarBottom ? layout.sidebarSplitRatio ?? 0.55 : 1, background:'rgba(255,255,255,0.08)', borderRadius:2}}/>
        {layout.sidebarBottom && <div style={{flex: 1-(layout.sidebarSplitRatio??0.55), background:`${PANEL_META[layout.sidebarBottom].color}50`, borderRadius:2}}/>}
      </div>
      {/* Columns */}
      {layout.columns.map((col, i) => {
        const n = col.panels.length
        const ratios = col.splitRatios && col.splitRatios.length === n - 1
          ? [...col.splitRatios, Math.max(0.05, 1 - col.splitRatios.reduce((a, b) => a + b, 0))]
          : Array(n).fill(1 / n)
        return (
          <div key={i} style={{
            flex: col.width ? 0 : 1,
            width: col.width ? Math.round(col.width / 12) : undefined,
            minWidth: 8,
            display:'flex', flexDirection:'column', gap:1,
          }}>
            {col.panels.map((pid, j) => (
              <div key={pid} style={{flex: ratios[j], background: `${PANEL_META[pid].color}40`, borderRadius:3}}/>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Main editor modal ─────────────────────────────────────────────────
interface LayoutEditorProps {
  current: AppLayout
  lang: Lang
  hasPlanningDir: boolean
  onApply: (layout: AppLayout) => void
  onClose: () => void
}

export function LayoutEditor({ current, lang, hasPlanningDir, onApply, onClose }: LayoutEditorProps) {
  const [draft, setDraft] = useState<AppLayout>(() => JSON.parse(JSON.stringify(current)))
  const dragPanelRef = useRef<PanelId | null>(null)

  const allPanelIds: PanelId[] = [
    'chat', 'preview', 'terminal', 'code', 'skills', 'mcp', 'plugins',
    ...(hasPlanningDir ? ['progress' as PanelId] : [])
  ]

  const usedPanels = new Set<PanelId>()
  draft.columns.forEach(c => c.panels.forEach(id => usedPanels.add(id)))
  if (draft.sidebarBottom) usedPanels.add(draft.sidebarBottom)
  const availablePanels = allPanelIds.filter(id => !usedPanels.has(id))

  const updateColumn = (idx: number, col: ColumnConfig) => {
    const cols = [...draft.columns]
    cols[idx] = col
    setDraft({ ...draft, columns: cols })
  }
  const removeColumn = (idx: number) => {
    const cols = draft.columns.filter((_, i) => i !== idx)
    setDraft({ ...draft, columns: cols })
  }
  const addColumn = () => {
    const next = availablePanels[0]
    if (!next) return
    setDraft({ ...draft, columns: [...draft.columns, { panels: [next], width: 360 }] })
  }

  const applyPreset = (layout: AppLayout) => {
    setDraft(JSON.parse(JSON.stringify(layout)))
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position:'fixed', inset:0, zIndex:200,
        background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}
    >
      <div style={{
        width:'min(90vw, 860px)', maxHeight:'90vh',
        background:'#131316', border:`1px solid ${BM}`,
        borderRadius:20, display:'flex', flexDirection:'column',
        overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'16px 20px',borderBottom:`1px solid ${B}`}}>
          <LayoutGrid size={16} style={{color:'#9B82FF'}}/>
          <span style={{fontSize:14,fontWeight:600}}>
            {lang === 'zh' ? '自定义排版' : 'Customize Layout'}
          </span>
          <span style={{flex:1,fontSize:11,color:'#50505A'}}>
            {lang === 'zh' ? '拖拽面板，点击"叠加面板"支持多层叠放' : 'Drag panels · click "Stack panel" to layer multiple panels'}
          </span>
          <button onClick={onClose} style={{padding:6,borderRadius:8,border:'none',background:'transparent',color:'#50505A',cursor:'pointer',display:'flex'}}
            onMouseEnter={e=>(e.currentTarget.style.color='#ECECF1')} onMouseLeave={e=>(e.currentTarget.style.color='#50505A')}>
            <X size={16}/>
          </button>
        </div>

        <div style={{flex:1,overflow:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:16}}>
          {/* Presets */}
          <div>
            <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',marginBottom:8}}>
              {lang === 'zh' ? '预设布局' : 'Presets'}
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {LAYOUT_PRESETS.map(preset => {
                const isActive = JSON.stringify(draft) === JSON.stringify(preset.layout)
                return (
                  <button key={preset.id} onClick={() => applyPreset(preset.layout)}
                    style={{
                      display:'flex',flexDirection:'column',alignItems:'center',gap:5,
                      padding:'8px 10px',borderRadius:10,cursor:'pointer',
                      border:`1px solid ${isActive ? 'rgba(124,92,252,0.5)' : B}`,
                      background: isActive ? 'rgba(124,92,252,0.08)' : 'transparent',
                      color: isActive ? '#9B82FF' : '#70737D',
                      transition:'all 0.15s',
                    }}
                    onMouseEnter={e => { if(!isActive) e.currentTarget.style.borderColor = BM }}
                    onMouseLeave={e => { if(!isActive) e.currentTarget.style.borderColor = B }}
                  >
                    <LayoutThumb layout={preset.layout} active={isActive}/>
                    <span style={{fontSize:10,fontWeight:500}}>
                      {lang === 'zh' ? preset.name : preset.nameEn}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Panel palette */}
          <div>
            <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',marginBottom:8}}>
              {lang === 'zh' ? '可用面板（拖入列）' : 'Available panels (drag into columns)'}
            </div>
            {availablePanels.length === 0 ? (
              <span style={{fontSize:11,color:'#3A3A42'}}>
                {lang === 'zh' ? '所有面板已放置' : 'All panels placed'}
              </span>
            ) : (
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {availablePanels.map(id => (
                  <PanelPill key={id} id={id} lang={lang} draggable onDragStart={id => dragPanelRef.current = id}/>
                ))}
              </div>
            )}
          </div>

          {/* Canvas */}
          <div>
            <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:'#50505A',marginBottom:8}}>
              {lang === 'zh' ? '布局画布' : 'Layout canvas'}
            </div>
            <div style={{
              display:'flex',gap:8,alignItems:'flex-start',
              padding:14,borderRadius:14,
              background:'#0C0C0F',border:`1px solid ${B}`,
              minHeight:160,
            }}>
              {/* Sidebar card */}
              <div style={{
                width: Math.max(90, Math.min(110, draft.sidebarWidth / 3)),
                flexShrink:0, display:'flex', flexDirection:'column', gap:5,
                background:'#1A1A1E', border:`1px solid ${B}`,
                borderRadius:14, padding:8,
              }}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
                  <span style={{fontSize:9,color:'#50505A',fontFamily:'JetBrains Mono'}}>
                    {lang === 'zh' ? '侧边栏' : 'Sidebar'}
                  </span>
                </div>
                {/* Fixed file-tree top section */}
                <div style={{
                  borderRadius:8, padding:'6px 8px',
                  background:'rgba(255,255,255,0.03)', border:`1px solid ${B}`,
                  display:'flex',alignItems:'center',gap:5, flexShrink:0,
                }}>
                  <span style={{fontSize:12}}>🗂</span>
                  <span style={{fontSize:10,color:'#50505A'}}>
                    {lang === 'zh' ? '文件树' : 'Files'}
                  </span>
                </div>
                {/* Split ratio when bottom is set */}
                {draft.sidebarBottom && (
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <span style={{fontSize:9,color:'#50505A'}}>
                      {Math.round((draft.sidebarSplitRatio ?? 0.55) * 100)}%
                    </span>
                    <input type="range" min={20} max={80} step={5}
                      value={Math.round((draft.sidebarSplitRatio ?? 0.55) * 100)}
                      onChange={e => setDraft({ ...draft, sidebarSplitRatio: Number(e.target.value) / 100 })}
                      style={{flex:1, accentColor:'#7C5CFC', height:3}}
                    />
                  </div>
                )}
                {/* Bottom drop slot */}
                <DropSlot
                  panelId={draft.sidebarBottom}
                  onDrop={id => setDraft({ ...draft, sidebarBottom: id })}
                  onClear={() => { const { sidebarBottom: _, sidebarSplitRatio: __, ...rest } = draft; setDraft(rest as typeof draft) }}
                  lang={lang}
                  label={lang === 'zh' ? '+ 下方面板' : '+ Bottom panel'}
                />
              </div>

              {/* Columns */}
              {draft.columns.map((col, idx) => (
                <ColumnCard
                  key={idx}
                  col={col}
                  colIdx={idx}
                  lang={lang}
                  onUpdate={updated => updateColumn(idx, updated)}
                  onRemove={() => removeColumn(idx)}
                  canRemove={draft.columns.length > 1}
                  availablePanels={availablePanels}
                />
              ))}

              {/* Add column */}
              {draft.columns.length < 4 && availablePanels.length > 0 && (
                <button onClick={addColumn}
                  style={{
                    height:140,width:48,borderRadius:12,flexShrink:0,
                    border:`1.5px dashed rgba(255,255,255,0.1)`,
                    background:'transparent',color:'#3A3A42',
                    cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                    transition:'all 0.15s',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(124,92,252,0.35)';e.currentTarget.style.color='#9B82FF'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.1)';e.currentTarget.style.color='#3A3A42'}}
                >
                  <Plus size={18}/>
                </button>
              )}
            </div>
          </div>

          {/* Sidebar width */}
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:11,color:'#70737D',whiteSpace:'nowrap'}}>
              {lang === 'zh' ? '侧边栏宽度' : 'Sidebar width'}:
            </span>
            <input type="range" min={160} max={360} step={10}
              value={draft.sidebarWidth}
              onChange={e => setDraft({ ...draft, sidebarWidth: Number(e.target.value) })}
              style={{flex:1,accentColor:'#7C5CFC'}}
            />
            <span style={{fontSize:11,color:'#50505A',fontFamily:'JetBrains Mono',width:36}}>{draft.sidebarWidth}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,padding:'14px 20px',borderTop:`1px solid ${B}`}}>
          <button onClick={onClose}
            style={{padding:'8px 18px',borderRadius:10,border:`1px solid ${B}`,background:'transparent',color:'#70737D',fontSize:13,cursor:'pointer'}}>
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button onClick={() => { onApply(draft); onClose() }}
            style={{padding:'8px 20px',borderRadius:10,border:'none',background:'#7C5CFC',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
            {lang === 'zh' ? '应用排版' : 'Apply Layout'} <ChevronRight size={14}/>
          </button>
        </div>
      </div>
    </div>
  )
}
