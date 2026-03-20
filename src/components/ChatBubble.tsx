import React, { useState } from 'react'
import { FileCode, Copy, Check, Columns2, AlignLeft, Hash, DollarSign, Zap } from 'lucide-react'
import { B, CAT_CLR, SKILLS, Lang, T, Part, Message } from '../types'

// ── FileOp ───────────────────────────────────────────────────────────
export function FileOp({ op, path, lang }: { op:'read'|'write'|'exec'; path:string; lang:Lang }) {
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

// ── CodeBlock ─────────────────────────────────────────────────────────
export function CodeBlock({ lang: cLang, content, uiLang }: { lang:string; content:string; uiLang:Lang }) {
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

// ── DiffViewer ────────────────────────────────────────────────────────
export function DiffViewer({ filename, before, after, lang }: { filename:string; before:string; after:string; lang:Lang }) {
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

// ── RenderPart ───────────────────────────────────────────────────────
export function RenderPart({ part, idx, lang }: { part:Part; idx:number; lang:Lang }) {
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

// ── TokenBadge ───────────────────────────────────────────────────────
export function TokenBadge({ cost, inputTokens, outputTokens, durationMs, lang }: {
  cost?: number; inputTokens?: number; outputTokens?: number; durationMs?: number; lang: Lang
}) {
  const t = T[lang]
  if (!cost && !inputTokens) return null
  return (
    <div className="flex items-center gap-2 mt-1 px-1" style={{opacity:0.5}}>
      {cost !== undefined && cost > 0 && (
        <span className="flex items-center gap-1 font-mono" style={{fontSize:9,color:'#E5C07B'}}>
          <DollarSign size={8}/>{cost < 0.001 ? '<$0.001' : `$${cost.toFixed(4)}`}
        </span>
      )}
      {inputTokens !== undefined && (
        <span className="flex items-center gap-1 font-mono" style={{fontSize:9,color:'#61AFEF'}}>
          <Zap size={8}/>{t.tokenInput}:{inputTokens}
        </span>
      )}
      {outputTokens !== undefined && (
        <span className="font-mono" style={{fontSize:9,color:'#9B82FF'}}>
          {t.tokenOutput}:{outputTokens}
        </span>
      )}
      {durationMs !== undefined && (
        <span className="font-mono" style={{fontSize:9,color:'#50505A'}}>
          {(durationMs/1000).toFixed(1)}s
        </span>
      )}
    </div>
  )
}

// ── Bubble ───────────────────────────────────────────────────────────
export function Bubble({ msg, lang }: { msg:Message; lang:Lang }) {
  const isUser = msg.role==='user'
  return (
    <div className={`flex gap-3 mb-5 ${isUser?'flex-row-reverse':'flex-row'}`}>
      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5"
        style={isUser?{background:'#7C5CFC',color:'#fff'}:{background:'rgba(255,255,255,0.06)',border:`1px solid ${B}`,color:'#70737D'}}>
        {isUser?'O':'✦'}
      </div>
      <div className={`flex flex-col gap-0.5 max-w-[86%] ${isUser?'items-end':'items-start'}`}>
        <div className="px-4 py-3 rounded-2xl"
          style={isUser?{background:'#7C5CFC',color:'#fff',borderBottomRightRadius:6}:{background:'#1A1A1E',border:`1px solid ${B}`,borderTopLeftRadius:6}}>
          {msg.parts.map((p,i)=><RenderPart key={i} part={p} idx={i} lang={lang}/>)}
        </div>
        <div className={`flex items-center gap-2 ${isUser?'flex-row-reverse':''}`}>
          <span className="text-[10px] px-1" style={{color:'#3A3A42'}}>{msg.time}</span>
          {!isUser && <TokenBadge cost={msg.cost} inputTokens={msg.inputTokens} outputTokens={msg.outputTokens} durationMs={msg.durationMs} lang={lang}/>}
        </div>
      </div>
    </div>
  )
}

// ── Palette (/ command menu) ──────────────────────────────────────────
export function Palette({ query, onSelect, lang, extraSkills = [] }: {
  query: string
  onSelect: (cmd: string) => void
  lang: Lang
  extraSkills?: Array<{ cmd: string; name: string; desc: string }>
}) {
  const allSkills = [
    ...SKILLS,
    ...extraSkills.map(s => ({ id: s.cmd, name: s.name, desc: s.desc, descEn: s.desc, cmd: s.cmd, cat: 'workflow' as const, category: 'workflow' }))
  ]
  const filtered = allSkills.filter(s=>s.cmd.toLowerCase().includes(query.toLowerCase())||s.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl overflow-hidden shadow-2xl z-50" style={{background:'#1A1A1E',border:`1px solid rgba(255,255,255,0.12)`}}>
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
                style={{background:CAT_CLR[s.cat as keyof typeof CAT_CLR]?.bg,color:CAT_CLR[s.cat as keyof typeof CAT_CLR]?.txt,border:`1px solid ${CAT_CLR[s.cat as keyof typeof CAT_CLR]?.bdr}`}}>{s.cat}</span>
            </button>
          ))
        }
      </div>
    </div>
  )
}
