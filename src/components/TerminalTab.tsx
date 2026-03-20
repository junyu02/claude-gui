import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as TerminalIcon, Trash2 } from 'lucide-react'
import { B } from '../types'

// Dynamically import xterm to avoid SSR issues
let TerminalClass: any = null
let FitAddonClass: any = null

interface TerminalTabProps {
  projectPath: string | null
  lang: 'zh' | 'en'
}

export function TerminalTab({ projectPath, lang }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const inputBufRef = useRef('')
  const [ready, setReady] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const cwd = projectPath ?? '~'

  // Write to terminal
  const write = useCallback((text: string) => {
    termRef.current?.write(text)
  }, [])

  const prompt = useCallback(() => {
    const short = cwd.replace(/^\/Users\/[^/]+/, '~')
    write(`\r\n\x1b[32m${short}\x1b[0m \x1b[35m$\x1b[0m `)
  }, [cwd, write])

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false

    ;(async () => {
      // Lazy load xterm
      const xtermMod   = await import('@xterm/xterm')
      const fitMod     = await import('@xterm/addon-fit')
      if (disposed) return

      TerminalClass  = xtermMod.Terminal
      FitAddonClass  = fitMod.FitAddon

      const term = new TerminalClass({
        theme: {
          background: '#0C0C0F',
          foreground: '#ECECF1',
          cursor: '#7C5CFC',
          selectionBackground: 'rgba(124,92,252,0.3)',
          black: '#1A1A1E', brightBlack: '#50505A',
          red: '#E06C75', brightRed: '#F87171',
          green: '#3ECF8E', brightGreen: '#98C379',
          yellow: '#E5C07B', brightYellow: '#E5C07B',
          blue: '#61AFEF', brightBlue: '#61AFEF',
          magenta: '#9B82FF', brightMagenta: '#C678DD',
          cyan: '#56B6C2', brightCyan: '#56B6C2',
          white: '#ECECF1', brightWhite: '#fff',
        },
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1.4,
        cursorBlink: true,
        allowTransparency: true,
        scrollback: 2000,
      })

      const fit = new FitAddonClass()
      term.loadAddon(fit)
      term.open(containerRef.current!)
      fit.fit()

      termRef.current = term
      fitRef.current  = fit
      setReady(true)

      // Welcome
      term.writeln('\x1b[35m╭─────────────────────────────╮\x1b[0m')
      term.writeln('\x1b[35m│\x1b[0m  Claude GUI Terminal  \x1b[35m│\x1b[0m')
      term.writeln('\x1b[35m╰─────────────────────────────╯\x1b[0m')

      // Prompt
      const short = cwd.replace(/^\/Users\/[^/]+/, '~')
      term.write(`\r\n\x1b[32m${short}\x1b[0m \x1b[35m$\x1b[0m `)

      // Key handler
      term.onKey(({ key, domEvent }: { key: string; domEvent: KeyboardEvent }) => {
        const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey

        if (domEvent.key === 'Enter') {
          const cmd = inputBufRef.current.trim()
          inputBufRef.current = ''
          term.write('\r\n')
          if (cmd) runCommand(cmd)
          else {
            const s2 = cwd.replace(/^\/Users\/[^/]+/, '~')
            term.write(`\x1b[32m${s2}\x1b[0m \x1b[35m$\x1b[0m `)
          }
        } else if (domEvent.key === 'Backspace') {
          if (inputBufRef.current.length > 0) {
            inputBufRef.current = inputBufRef.current.slice(0, -1)
            term.write('\b \b')
          }
        } else if (domEvent.ctrlKey && domEvent.key === 'c') {
          if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
          }
          inputBufRef.current = ''
          term.write('^C\r\n')
          const s3 = cwd.replace(/^\/Users\/[^/]+/, '~')
          term.write(`\x1b[32m${s3}\x1b[0m \x1b[35m$\x1b[0m `)
        } else if (domEvent.ctrlKey && domEvent.key === 'l') {
          term.clear()
          const s4 = cwd.replace(/^\/Users\/[^/]+/, '~')
          term.write(`\x1b[32m${s4}\x1b[0m \x1b[35m$\x1b[0m `)
        } else if (printable) {
          inputBufRef.current += key
          term.write(key)
        }
      })
    })()

    return () => {
      disposed = true
      termRef.current?.dispose()
      termRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit on resize
  useEffect(() => {
    if (!ready) return
    const ro = new ResizeObserver(() => fitRef.current?.fit())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [ready])

  // Run command via /api/shell
  const runCommand = useCallback(async (cmd: string) => {
    if (!cmd) return
    setStreaming(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, cwd }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        write(`\x1b[31mError: HTTP ${res.status}\x1b[0m`)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const ev = JSON.parse(line.slice(6))
                if (ev.type === 'stdout') {
                  // Convert \n to \r\n for terminal
                  write(ev.text.replace(/\n/g, '\r\n'))
                } else if (ev.type === 'stderr') {
                  write(`\x1b[33m${ev.text.replace(/\n/g, '\r\n')}\x1b[0m`)
                }
              } catch {}
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        write(`\r\n\x1b[31m${String(e)}\x1b[0m`)
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      const short = cwd.replace(/^\/Users\/[^/]+/, '~')
      write(`\r\n\x1b[32m${short}\x1b[0m \x1b[35m$\x1b[0m `)
    }
  }, [cwd, write])

  const clearTerminal = () => {
    termRef.current?.clear()
    const short = cwd.replace(/^\/Users\/[^/]+/, '~')
    write(`\x1b[32m${short}\x1b[0m \x1b[35m$\x1b[0m `)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#0C0C0F'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',borderBottom:`1px solid ${B}`,flexShrink:0}}>
        <TerminalIcon size={11} style={{color:'#50505A'}} />
        <span style={{fontSize:11,color:'#50505A',flex:1,fontFamily:'JetBrains Mono, monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {cwd.replace(/^\/Users\/[^/]+/, '~')}
        </span>
        {streaming && (
          <span style={{fontSize:9,color:'#E5C07B',fontFamily:'JetBrains Mono',animation:'pulse 1s infinite'}}>running…</span>
        )}
        <button
          onClick={clearTerminal}
          title={lang === 'zh' ? '清空' : 'Clear'}
          style={{padding:4,borderRadius:6,border:'none',background:'transparent',cursor:'pointer',color:'#3A3A42',display:'flex',alignItems:'center',transition:'color 0.15s'}}
          onMouseEnter={e=>e.currentTarget.style.color='#70737D'}
          onMouseLeave={e=>e.currentTarget.style.color='#3A3A42'}
        >
          <Trash2 size={11}/>
        </button>
      </div>
      {/* Terminal */}
      <div ref={containerRef} style={{flex:1,padding:'8px 4px',overflow:'hidden'}} />
    </div>
  )
}
