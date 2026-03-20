// ── Thin wrappers over Vite server API endpoints ──

export async function checkExists(p: string): Promise<{ exists: boolean; isDir: boolean; isFile: boolean }> {
  const res = await fetch(`/api/exists?path=${encodeURIComponent(p)}`)
  return res.json()
}

export async function readJson<T>(p: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/read-json?path=${encodeURIComponent(p)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.error) return null
    return data as T
  } catch { return null }
}

export async function writeJson(p: string, data: unknown): Promise<void> {
  await fetch('/api/write-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: p, data }),
  })
}

export async function appendLine(p: string, line: string): Promise<void> {
  await fetch('/api/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: p, line }),
  })
}

export async function readLines(p: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/read-lines?path=${encodeURIComponent(p)}`)
    const data = await res.json()
    return data.lines ?? []
  } catch { return [] }
}

export async function readFileContent(p: string): Promise<{ content: string; mtime: number } | null> {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(p)}`)
    const data = await res.json()
    if (data.error) return null
    return data
  } catch { return null }
}

export async function readDir(p: string, depth = 3): Promise<{ name: string; path: string; files: any[] } | null> {
  try {
    const res = await fetch(`/api/dir?path=${encodeURIComponent(p)}&depth=${depth}`)
    const data = await res.json()
    if (data.error) return null
    return data
  } catch { return null }
}

// ── Claude Code CLI streaming ──

export interface ChatStreamEvent {
  type: 'assistant' | 'result' | 'system' | 'done' | 'error' | 'stderr' | 'rate_limit_event' | 'stream_event'
  subtype?: string
  message?: {
    content: { type: string; text?: string; name?: string; input?: any; id?: string }[]
    model?: string
    stop_reason?: string | null
  }
  result?: string
  session_id?: string
  total_cost_usd?: number
  duration_ms?: number
  num_turns?: number
  usage?: any
  event?: { type: string; index?: number; delta?: { type: string; text?: string }; content_block?: any }
  code?: number
  text?: string
  [key: string]: any
}

export async function* streamChat(
  message: string,
  projectPath: string,
  sessionId?: string,
  model?: string,
  signal?: AbortSignal,
  mode?: 'trust' | 'plan' | 'normal',
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, projectPath, sessionId, model, mode }),
    signal,
  })

  if (!res.ok) {
    yield { type: 'error', text: `HTTP ${res.status}: ${await res.text()}` }
    return
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6))
          } catch { /* skip malformed */ }
        }
      }
    }
  }
}

export async function abortChat(projectPath: string): Promise<void> {
  await fetch('/api/chat/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  })
}
