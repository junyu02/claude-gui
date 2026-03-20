import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execSync, type ChildProcess } from 'node:child_process'

// Resolve claude binary path at startup
let CLAUDE_BIN = 'claude'
try {
  CLAUDE_BIN = execSync('which claude', { encoding: 'utf-8' }).trim()
} catch { /* fallback to 'claude' */ }

function tildePath(p: string) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

const MIME: Record<string, string> = {
  pdf:  'application/pdf',
  png:  'image/png',  jpg:  'image/jpeg', jpeg: 'image/jpeg',
  gif:  'image/gif',  svg:  'image/svg+xml', webp: 'image/webp',
  mp4:  'video/mp4',  mp3:  'audio/mpeg',
  txt:  'text/plain', html: 'text/html',
}

// Track active Claude processes per project
const activeProcs = new Map<string, ChildProcess>()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-file-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? ''

          // ── POST /api/chat → SSE stream from Claude Code CLI ──
          if (url.startsWith('/api/chat/abort') && req.method === 'POST') {
            let body = ''
            req.on('data', (c: Buffer) => body += c)
            req.on('end', () => {
              try {
                const { projectPath } = JSON.parse(body)
                const key = tildePath(projectPath)
                const proc = activeProcs.get(key)
                if (proc) { proc.kill('SIGTERM'); activeProcs.delete(key) }
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true }))
              } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })) }
            })
            return
          }

          if (url.startsWith('/api/chat') && req.method === 'POST') {
            let body = ''
            req.on('data', (c: Buffer) => body += c)
            req.on('end', () => {
              try {
                const { message, projectPath, sessionId, model } = JSON.parse(body)
                const cwd = tildePath(projectPath)

                // Kill any existing process for this project
                const existing = activeProcs.get(cwd)
                if (existing) { existing.kill('SIGTERM'); activeProcs.delete(cwd) }

                const args = [
                  '-p',
                  '--output-format', 'stream-json',
                  '--verbose',
                  '--dangerously-skip-permissions',
                  '--include-partial-messages',
                ]
                if (sessionId) args.push('--resume', sessionId)
                if (model) args.push('--model', model)
                args.push(message)

                const proc = spawn(CLAUDE_BIN, args, {
                  cwd,
                  env: { ...process.env, FORCE_COLOR: '0' },
                  stdio: ['pipe', 'pipe', 'pipe'],
                })
                proc.stdin!.end()
                activeProcs.set(cwd, proc)

                res.setHeader('Content-Type', 'text/event-stream')
                res.setHeader('Cache-Control', 'no-cache')
                res.setHeader('Connection', 'keep-alive')
                res.setHeader('X-Accel-Buffering', 'no')

                let buffer = ''
                proc.stdout!.on('data', (chunk: Buffer) => {
                  buffer += chunk.toString()
                  const lines = buffer.split('\n')
                  buffer = lines.pop() ?? ''
                  for (const line of lines) {
                    if (line.trim()) {
                      res.write(`data: ${line}\n\n`)
                    }
                  }
                })

                proc.stderr!.on('data', (chunk: Buffer) => {
                  const msg = chunk.toString().trim()
                  if (msg) res.write(`data: ${JSON.stringify({ type: 'stderr', text: msg })}\n\n`)
                })

                proc.on('close', (code) => {
                  if (buffer.trim()) res.write(`data: ${buffer}\n\n`)
                  res.write(`data: ${JSON.stringify({ type: 'done', code })}\n\n`)
                  res.end()
                  activeProcs.delete(cwd)
                })

                proc.on('error', (err) => {
                  res.write(`data: ${JSON.stringify({ type: 'error', text: String(err) })}\n\n`)
                  res.end()
                  activeProcs.delete(cwd)
                })

                // Client disconnect → kill process
                res.on('close', () => {
                  if (!proc.killed) proc.kill('SIGTERM')
                  activeProcs.delete(cwd)
                })
              } catch (e) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: String(e) }))
              }
            })
            return
          }

          // ── /api/file  → JSON { content, mtime } ──
          if (url.startsWith('/api/file')) {
            const qs       = new URL(url, 'http://x').searchParams
            const filePath = qs.get('path')
            res.setHeader('Content-Type', 'application/json')
            if (!filePath) { res.statusCode = 400; res.end(JSON.stringify({ error: 'path required' })); return }
            const abs = tildePath(filePath)
            try {
              const stat = fs.statSync(abs)
              if (!stat.isFile())        { res.statusCode = 400; res.end(JSON.stringify({ error: 'not a file' })); return }
              if (stat.size > 1024*1024) { res.end(JSON.stringify({ error: 'file too large', size: stat.size })); return }
              const content = fs.readFileSync(abs, 'utf-8')
              res.end(JSON.stringify({ content, mtime: stat.mtimeMs }))
            } catch (e) { res.statusCode = 404; res.end(JSON.stringify({ error: String(e) })) }
            return
          }

          // ── /api/raw  → raw bytes (for PDF / images) ──
          if (url.startsWith('/api/raw')) {
            const qs       = new URL(url, 'http://x').searchParams
            const filePath = qs.get('path')
            if (!filePath) { res.statusCode = 400; res.end('path required'); return }
            const abs = tildePath(filePath)
            const ext = abs.split('.').pop()?.toLowerCase() ?? ''
            try {
              const data = fs.readFileSync(abs)
              res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
              res.setHeader('Content-Length', data.length)
              res.end(data)
            } catch { res.statusCode = 404; res.end('not found') }
            return
          }

          // ── /api/find-dir  → find a folder by name in common locations ──
          if (url.startsWith('/api/find-dir')) {
            const qs   = new URL(url, 'http://x').searchParams
            const name = qs.get('name')
            res.setHeader('Content-Type', 'application/json')
            if (!name) { res.statusCode = 400; res.end(JSON.stringify({ error: 'name required' })); return }
            const home = os.homedir()
            const candidates = [
              path.join(home, name),
              path.join(home, 'Projects', name),
              path.join(home, 'projects', name),
              path.join(home, 'Desktop', name),
              path.join(home, 'Documents', name),
              path.join(home, 'Downloads', name),
              path.join(home, 'Code', name),
              path.join(home, 'code', name),
              path.join(home, 'dev', name),
              path.join(home, 'Dev', name),
              path.join(home, 'workspace', name),
              path.join(home, 'Workspace', name),
              path.join(home, 'src', name),
            ]
            const found = candidates.filter(c => { try { return fs.statSync(c).isDirectory() } catch { return false } })
            res.end(JSON.stringify({ matches: found.map(f => f.replace(home, '~')) }))
            return
          }

          // ── /api/dir  → recursive directory listing as FileNode tree ──
          if (url.startsWith('/api/dir')) {
            const qs       = new URL(url, 'http://x').searchParams
            const dirPath  = qs.get('path')
            const depthMax = Number(qs.get('depth') ?? 3)
            res.setHeader('Content-Type', 'application/json')
            if (!dirPath) { res.statusCode = 400; res.end(JSON.stringify({ error: 'path required' })); return }
            const abs = tildePath(dirPath)
            try {
              const stat = fs.statSync(abs)
              if (!stat.isDirectory()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'not a directory' })); return }
              const SKIP = new Set(['.git','node_modules','.next','dist','build','.cache','__pycache__','.DS_Store'])
              function scan(dir: string, depth: number): any[] {
                if (depth > depthMax) return []
                const entries = fs.readdirSync(dir, { withFileTypes: true })
                  .filter(e => !SKIP.has(e.name) && !e.name.startsWith('.'))
                  .sort((a, b) => {
                    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
                    return a.name.localeCompare(b.name)
                  })
                return entries.map(e => {
                  if (e.isDirectory()) {
                    return { name: e.name, type: 'folder', children: scan(path.join(dir, e.name), depth + 1) }
                  }
                  const ext = e.name.split('.').pop()?.toLowerCase()
                  return { name: e.name, type: 'file', ext }
                })
              }
              const name = path.basename(abs)
              res.end(JSON.stringify({ name, path: dirPath, files: scan(abs, 0) }))
            } catch (e) { res.statusCode = 404; res.end(JSON.stringify({ error: String(e) })) }
            return
          }

          // ── /api/exists  → check if path exists ──
          if (url.startsWith('/api/exists')) {
            const qs = new URL(url, 'http://x').searchParams
            const p  = qs.get('path')
            res.setHeader('Content-Type', 'application/json')
            if (!p) { res.statusCode = 400; res.end(JSON.stringify({ error: 'path required' })); return }
            const abs = tildePath(p)
            try {
              const stat = fs.statSync(abs)
              res.end(JSON.stringify({ exists: true, isDir: stat.isDirectory(), isFile: stat.isFile() }))
            } catch { res.end(JSON.stringify({ exists: false, isDir: false, isFile: false })) }
            return
          }

          // ── /api/read-json  → read & parse a JSON file ──
          if (url.startsWith('/api/read-json')) {
            const qs = new URL(url, 'http://x').searchParams
            const p  = qs.get('path')
            res.setHeader('Content-Type', 'application/json')
            if (!p) { res.statusCode = 400; res.end(JSON.stringify({ error: 'path required' })); return }
            const abs = tildePath(p)
            try {
              const data = JSON.parse(fs.readFileSync(abs, 'utf-8'))
              res.end(JSON.stringify(data))
            } catch (e) { res.statusCode = 404; res.end(JSON.stringify({ error: String(e) })) }
            return
          }

          // ── /api/read-lines  → read file as lines array ──
          if (url.startsWith('/api/read-lines')) {
            const qs = new URL(url, 'http://x').searchParams
            const p  = qs.get('path')
            res.setHeader('Content-Type', 'application/json')
            if (!p) { res.statusCode = 400; res.end(JSON.stringify({ error: 'path required' })); return }
            const abs = tildePath(p)
            try {
              const lines = fs.readFileSync(abs, 'utf-8').split('\n').filter(Boolean)
              res.end(JSON.stringify({ lines }))
            } catch { res.end(JSON.stringify({ lines: [] })) }
            return
          }

          // ── POST /api/write-json  → write JSON to file (mkdir -p) ──
          if (url.startsWith('/api/write-json') && req.method === 'POST') {
            let body = ''
            req.on('data', (c: Buffer) => body += c)
            req.on('end', () => {
              try {
                const { path: p, data } = JSON.parse(body)
                const abs = tildePath(p)
                fs.mkdirSync(path.dirname(abs), { recursive: true })
                fs.writeFileSync(abs, JSON.stringify(data, null, 2))
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true }))
              } catch (e) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: String(e) })) }
            })
            return
          }

          // ── POST /api/append  → append line to file (for JSONL) ──
          if (url.startsWith('/api/append') && req.method === 'POST') {
            let body = ''
            req.on('data', (c: Buffer) => body += c)
            req.on('end', () => {
              try {
                const { path: p, line } = JSON.parse(body)
                const abs = tildePath(p)
                fs.mkdirSync(path.dirname(abs), { recursive: true })
                fs.appendFileSync(abs, line + '\n')
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true }))
              } catch (e) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: String(e) })) }
            })
            return
          }

          next()
        })
      },
    },
  ],
  server: { port: 3000 },
})
