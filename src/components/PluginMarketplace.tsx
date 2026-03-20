import React, { useEffect, useState } from 'react'
import { Download, Check, Trash2, ExternalLink, Search, Package } from 'lucide-react'
import { B, Lang, T } from '../types'
import { MARKETPLACE_PLUGINS, Plugin, CAT_LABEL, CAT_COLOR, PluginCategory,
  loadInstalledPlugins, installPlugin, uninstallPlugin } from '../plugins'

interface PluginMarketplaceProps {
  lang: Lang
  onPluginsChange?: (installedIds: string[]) => void
}

export function PluginMarketplace({ lang, onPluginsChange }: PluginMarketplaceProps) {
  const [installedIds, setInstalledIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<PluginCategory | 'all'>('all')
  const [installing, setInstalling] = useState<string | null>(null)
  const t = T[lang]

  useEffect(() => {
    loadInstalledPlugins().then(ids => {
      setInstalledIds(ids)
      onPluginsChange?.(ids)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInstall = async (plugin: Plugin) => {
    setInstalling(plugin.id)
    await installPlugin(plugin.id)
    const ids = [...installedIds, plugin.id]
    setInstalledIds(ids)
    onPluginsChange?.(ids)
    setInstalling(null)
  }

  const handleUninstall = async (plugin: Plugin) => {
    setInstalling(plugin.id)
    await uninstallPlugin(plugin.id)
    const ids = installedIds.filter(i => i !== plugin.id)
    setInstalledIds(ids)
    onPluginsChange?.(ids)
    setInstalling(null)
  }

  const cats: Array<{ id: PluginCategory | 'all'; label: string }> = [
    { id: 'all', label: lang === 'zh' ? '全部' : 'All' },
    { id: 'ui', label: 'UI' },
    { id: 'code', label: 'Code' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'ai', label: 'AI' },
    { id: 'mcp', label: 'MCP' },
  ]

  const filtered = MARKETPLACE_PLUGINS.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.tags.some(t => t.includes(q))
    const matchCat = catFilter === 'all' || p.category === catFilter
    return matchSearch && matchCat
  })

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {/* Header */}
      <div style={{padding:'12px 12px 8px',borderBottom:`1px solid ${B}`,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <Package size={13} style={{color:'#9B82FF'}}/>
          <span style={{fontSize:12,fontWeight:600,color:'#ECECF1'}}>{t.pluginMarketplace}</span>
          <span style={{marginLeft:'auto',fontSize:10,color:'#50505A',fontFamily:'JetBrains Mono'}}>
            {installedIds.length} {lang === 'zh' ? '已安装' : 'installed'}
          </span>
        </div>
        {/* Search */}
        <div style={{position:'relative',marginBottom:8}}>
          <Search size={11} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#50505A',pointerEvents:'none'}}/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={lang === 'zh' ? '搜索插件…' : 'Search plugins…'}
            style={{
              width:'100%', padding:'5px 10px 5px 28px',
              borderRadius:8, border:`1px solid ${B}`,
              background:'#0C0C0F', color:'#ECECF1',
              fontSize:11, fontFamily:'Inter, sans-serif', outline:'none',
              boxSizing:'border-box',
            }}
            onFocus={e => e.currentTarget.style.borderColor='rgba(124,92,252,0.4)'}
            onBlur={e => e.currentTarget.style.borderColor=B}
          />
        </div>
        {/* Category filter */}
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {cats.map(c => (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              style={{
                padding:'2px 8px', borderRadius:20, fontSize:10, cursor:'pointer',
                border:`1px solid ${catFilter === c.id ? 'rgba(124,92,252,0.4)' : B}`,
                background: catFilter === c.id ? 'rgba(124,92,252,0.12)' : 'transparent',
                color: catFilter === c.id ? '#9B82FF' : '#50505A',
                transition:'all 0.15s',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plugin list */}
      <div style={{flex:1,overflowY:'auto',padding:'8px'}}>
        {filtered.length === 0 && (
          <div style={{padding:24,textAlign:'center',color:'#50505A',fontSize:12}}>
            {lang === 'zh' ? '没有找到插件' : 'No plugins found'}
          </div>
        )}
        {filtered.map(plugin => {
          const isInstalled = installedIds.includes(plugin.id)
          const isLoading   = installing === plugin.id
          const catClr      = CAT_COLOR[plugin.category]
          return (
            <div
              key={plugin.id}
              style={{
                padding:'12px',marginBottom:6,borderRadius:12,
                background:'#1A1A1E',border:`1px solid ${B}`,
                transition:'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.12)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = B}
            >
              <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#ECECF1'}}>{plugin.name}</span>
                    <span style={{
                      fontSize:9,padding:'1px 6px',borderRadius:20,fontWeight:600,
                      background:catClr.bg,color:catClr.txt,border:`1px solid ${catClr.bdr}`,
                      textTransform:'uppercase',letterSpacing:'0.05em',
                    }}>
                      {CAT_LABEL[plugin.category]}
                    </span>
                    {plugin.homepage && (
                      <a href={plugin.homepage} target="_blank" rel="noreferrer"
                        style={{color:'#50505A',display:'flex',alignItems:'center'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#70737D'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#50505A'}>
                        <ExternalLink size={10}/>
                      </a>
                    )}
                  </div>
                  <p style={{fontSize:11,color:'#8B8B96',margin:0,lineHeight:1.4}}>
                    {lang === 'zh' ? plugin.description : plugin.descriptionEn}
                  </p>
                  {plugin.skillCmd && (
                    <span style={{fontSize:9,fontFamily:'JetBrains Mono',color:'#50505A',marginTop:4,display:'inline-block'}}>
                      cmd: {plugin.skillCmd}
                    </span>
                  )}
                  {plugin.mcpConfig && (
                    <span style={{fontSize:9,fontFamily:'JetBrains Mono',color:'#56B6C2',marginTop:4,display:'inline-block'}}>
                      mcp: {plugin.mcpConfig.name}
                    </span>
                  )}
                </div>
                <div style={{flexShrink:0}}>
                  {isInstalled ? (
                    <button
                      onClick={() => handleUninstall(plugin)}
                      disabled={isLoading}
                      style={{
                        display:'flex',alignItems:'center',gap:5,
                        padding:'5px 10px',borderRadius:8,fontSize:11,
                        border:'1px solid rgba(230,59,46,0.3)',
                        background:isLoading ? 'rgba(230,59,46,0.05)' : 'transparent',
                        color:isLoading ? '#50505A' : '#E63B2E',
                        cursor:isLoading ? 'default' : 'pointer',
                        transition:'all 0.15s',
                      }}
                    >
                      {isLoading ? <span style={{fontSize:9}}>…</span> : <Trash2 size={11}/>}
                      {t.pluginUninstall}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleInstall(plugin)}
                      disabled={isLoading}
                      style={{
                        display:'flex',alignItems:'center',gap:5,
                        padding:'5px 10px',borderRadius:8,fontSize:11,
                        border:'1px solid rgba(62,207,142,0.3)',
                        background:isLoading ? 'rgba(62,207,142,0.05)' : 'transparent',
                        color:isLoading ? '#50505A' : '#3ECF8E',
                        cursor:isLoading ? 'default' : 'pointer',
                        transition:'all 0.15s',
                      }}
                    >
                      {isLoading ? <span style={{fontSize:9}}>…</span> : <Download size={11}/>}
                      {t.pluginInstall}
                    </button>
                  )}
                </div>
              </div>
              {/* Tags */}
              <div style={{display:'flex',gap:4,marginTop:8,flexWrap:'wrap'}}>
                {plugin.tags.map(tag => (
                  <span key={tag} style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:'rgba(255,255,255,0.04)',color:'#50505A'}}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── InstalledPluginsBadge: shows count in tab ─────────────────────────
export function InstalledCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span style={{
      fontSize:9,padding:'1px 5px',borderRadius:10,
      background:'rgba(124,92,252,0.2)',color:'#9B82FF',
      fontFamily:'JetBrains Mono',fontWeight:600,
    }}>
      {count}
    </span>
  )
}
