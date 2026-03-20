# Claude Code GUI

A local web interface that wraps the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), turning terminal interactions into a visual IDE experience.

> Not another AI chat UI — a **project-aware development environment** where each project has its own memory, context, and conversation history.

## Features

**Real Claude Code Integration**
- Streams responses from Claude Code CLI in real-time (character by character)
- Tool use visualization — see file reads, edits, and bash commands as they happen
- Session continuity via `--resume` — conversations persist across messages
- Stop button to abort long-running requests

**Three-Column Layout**
- **Sidebar** — Project list, file tree, auto-detected tech stack tags
- **Chat** — Streaming messages with markdown, code blocks, and inline diffs
- **Right Panel** — Dev server preview, file viewer, skill palette, GSD progress, MCP status

**Per-Project Persistence**
- Independent chat history per project (JSONL)
- Auto-generated context from `package.json`, `README.md`, `Cargo.toml`, `go.mod`, etc.
- Command tracking (recent + frequency)
- Stored in `.claude-gui/` within each project

**Developer Tools**
- Code viewer with line numbers and syntax highlighting
- Split / inline diff viewer
- Markdown preview (`Shift+Cmd+V`)
- Drag-and-drop files and folders from Finder
- Command palette — type `/` to search skills
- Freely reorderable and resizable columns

**Bilingual** — Full Chinese / English UI toggle

## Quick Start

```bash
# Prerequisites: Node.js 18+, Claude Code CLI installed
git clone https://github.com/junyu02/claude-gui.git
cd claude-gui
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), add a project, and start chatting.

## Tech Stack

| | |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Build | Vite 5 |
| Animation | GSAP 3 |
| Icons | Lucide React |
| Backend | Vite dev server middleware (Node.js) |
| CLI Bridge | `claude -p --output-format stream-json` via child process + SSE |

## How It Works

```
Browser (React) ──POST /api/chat──▸ Vite Server ──spawn──▸ Claude Code CLI
                ◂──SSE stream────                ◂──stdout──
```

The Vite dev server spawns `claude` as a child process with streaming JSON output, pipes `stdout` as Server-Sent Events to the browser, and the React frontend renders text deltas in real-time.

## Project Structure

```
src/
├── App.tsx        # Main app — all components and layout
├── api.ts         # API wrappers + streamChat() async generator
├── storage.ts     # Per-project persistence (history, context, prefs)
├── index.css      # Tailwind + animations
└── main.tsx       # Entry point
vite.config.ts     # File system API + Claude CLI SSE endpoint
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `/` | Open command palette |
| `Shift+Cmd+V` | Toggle markdown preview |
| `Escape` | Close palette |

## Roadmap

- [ ] Model selector (Opus / Sonnet / Haiku)
- [ ] Cost & token usage display
- [ ] Built-in terminal (xterm.js)
- [ ] Live MCP server status
- [ ] Git status panel
- [ ] Component refactor (split App.tsx)
- [ ] Electron / Tauri desktop app
- [ ] Plugin system

## License

MIT
