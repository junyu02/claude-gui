import React from 'react'
import { B, BM } from '../types'

// ── Block types ──────────────────────────────────────────────────────
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

export function parseBlocks(md: string): MdBlock[] {
  const lines = md.split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim(); const code: string[] = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      blocks.push({ t:'code', lang, code: code.join('\n') }); i++; continue
    }
    const hm = line.match(/^(#{1,6})\s+(.+)/)
    if (hm) { blocks.push({ t:'h', level: hm[1].length as 1|2|3|4|5|6, text: hm[2] }); i++; continue }
    if (line.match(/^[-*_]{3,}$/)) { blocks.push({ t:'hr' }); i++; continue }
    if (line.startsWith('>')) {
      const ql: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) { ql.push(lines[i].replace(/^>\s?/, '')); i++ }
      blocks.push({ t:'quote', lines: ql }); continue
    }
    if (line.match(/^[-*+]\s+\[[ x]\]/i)) {
      const items: { done: boolean; text: string }[] = []
      while (i < lines.length && lines[i].match(/^[-*+]\s+\[[ x]\]/i)) {
        const done = /\[x\]/i.test(lines[i])
        items.push({ done, text: lines[i].replace(/^[-*+]\s+\[[ x]\]\s*/i, '') }); i++
      }
      blocks.push({ t:'task', items }); continue
    }
    if (line.match(/^[-*+]\s+/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*+]\s+/)) { items.push(lines[i].replace(/^[-*+]\s+/, '')); i++ }
      blocks.push({ t:'ul', items }); continue
    }
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++ }
      blocks.push({ t:'ol', items }); continue
    }
    if (line.includes('|') && i+1 < lines.length && lines[i+1].match(/^\|?[-:| ]+\|/)) {
      const parseRow = (r: string) => r.split('|').map(c=>c.trim()).filter((_,ci,a) => ci>0 || a.length>1).filter(c=>c!=='')
      const head = parseRow(line); i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) { rows.push(parseRow(lines[i])); i++ }
      blocks.push({ t:'table', head, rows }); continue
    }
    const pl: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|[-*_]{3,}$)/)) {
      pl.push(lines[i]); i++
    }
    if (pl.length) blocks.push({ t:'p', text: pl.join(' ') })
  }
  return blocks
}

export function renderInline(text: string, key?: string | number): React.ReactNode {
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

export function MarkdownPreview({ content }: { content: string }) {
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
