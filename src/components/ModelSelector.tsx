import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { B, MODELS, ModelOption, Lang, T } from '../types'

interface ModelSelectorProps {
  selectedModel: string
  onSelect: (modelId: string) => void
  lang: Lang
}

export function ModelSelector({ selectedModel, onSelect, lang }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = MODELS.find(m => m.id === selectedModel) ?? MODELS[1]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{position:'relative',flexShrink:0}}>
      <button
        onClick={() => setOpen(o => !o)}
        title={T[lang].modelLabel}
        style={{
          display:'flex', alignItems:'center', gap:5,
          padding:'3px 8px', borderRadius:8,
          border:`1px solid ${open ? 'rgba(124,92,252,0.4)' : B}`,
          background: open ? 'rgba(124,92,252,0.08)' : 'rgba(255,255,255,0.03)',
          color: current.color,
          fontSize:11, fontFamily:'JetBrains Mono, monospace',
          cursor:'pointer', transition:'all 0.15s',
        }}
      >
        <span style={{fontSize:12}}>{current.badge}</span>
        <span style={{fontWeight:600}}>{current.label}</span>
        <ChevronDown size={9} style={{opacity:0.6, transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.15s'}} />
      </button>

      {open && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 6px)', left:0,
          minWidth:200, borderRadius:12, overflow:'hidden',
          background:'#1A1A1E', border:`1px solid rgba(255,255,255,0.12)`,
          boxShadow:'0 8px 32px rgba(0,0,0,0.4)', zIndex:100,
        }}>
          <div style={{padding:'8px 12px 6px', fontSize:9, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.1em', color:'#50505A', borderBottom:`1px solid ${B}`}}>
            {T[lang].modelLabel}
          </div>
          {MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onSelect(m.id); setOpen(false) }}
              style={{
                display:'flex', alignItems:'center', gap:10,
                width:'100%', padding:'10px 12px',
                background: selectedModel === m.id ? 'rgba(124,92,252,0.08)' : 'transparent',
                border:'none', cursor:'pointer', textAlign:'left',
                transition:'background 0.1s',
              }}
              onMouseEnter={e => { if (selectedModel !== m.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
              onMouseLeave={e => { if (selectedModel !== m.id) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{fontSize:16, width:20, textAlign:'center'}}>{m.badge}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12, fontWeight:600, color: selectedModel === m.id ? m.color : '#ECECF1'}}>
                  {m.label}
                </div>
                <div style={{fontSize:10, color:'#50505A', marginTop:1}}>
                  {lang === 'zh' ? m.desc : { '快速&经济':'Fast & cheap', '均衡':'Balanced', '最强能力':'Most capable' }[m.desc] ?? m.desc}
                </div>
              </div>
              {selectedModel === m.id && (
                <div style={{width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0}} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
