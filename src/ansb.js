#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  BREAK, DAY_NAMES, computeState, fmtDuration, isBreak, isWeekend, splitTitle, todayIndex,
} from './schedule.js'

const VERSION = '0.1.0'
const DEFAULT_API = 'https://erykdarnowski.pl/ansb-api.php'
const OFFSET_SYNC_MS = 10 * 60 * 1000
const RETRY_MS = 60 * 1000

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values: opts } = parseArgs({
  options: {
    api: { type: 'string', default: process.env.ANSB_API || DEFAULT_API },
    at: { type: 'string' },
    line: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  },
})

if (opts.help) {
  console.log(`ansb ${VERSION} — weekend timetable in your terminal

Usage: ansb [options]

  --line        print a one-line status (for tmux/statuslines) and exit
  --at <date>   pretend it's <date>, e.g. --at "2025-11-08 13:00" (debug)
  --api <url>   API endpoint (default: $ANSB_API or ${DEFAULT_API})
  -v, --version
  -h, --help

Keys: ←/→ h/l tab  switch view    ↑/↓ j/k  switch day (timetable)
      t  time/length   r  refresh   i  info   ?  help   q  quit`)
  process.exit(0)
}
if (opts.version) {
  console.log(VERSION)
  process.exit(0)
}

// ─── Clock ────────────────────────────────────────────────────────────────────

let virtualBase = null
if (opts.at) {
  const d = new Date(opts.at)
  if (Number.isNaN(d.getTime())) {
    console.error(`Invalid --at date: ${opts.at}`)
    process.exit(1)
  }
  virtualBase = { at: d.getTime(), launched: Date.now() }
}

const S = {
  days: [[], []],
  apiVersion: '',
  offset: 0, // local - server, ms
  fetchedAt: null,
  fromCache: false,
  error: null,
  loading: true,
  view: 'now', // 'now' | 'table'
  day: 0,
  showLen: false,
  overlay: null, // null | 'help' | 'info'
  tick: 0,
}

const now = () =>
  virtualBase
    ? new Date(virtualBase.at + (Date.now() - virtualBase.launched))
    : new Date(Date.now() - S.offset)

// ─── Network + cache ──────────────────────────────────────────────────────────

const cacheFile = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
  'ansb-tui',
  'schedule.json',
)

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify({ days: S.days, apiVersion: S.apiVersion, fetchedAt: S.fetchedAt }))
  } catch {}
}

function loadCache() {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    S.days = c.days
    S.apiVersion = c.apiVersion
    S.fetchedAt = c.fetchedAt
    S.fromCache = true
    return true
  } catch {
    return false
  }
}

function applyOffset(res) {
  const server = new Date(res.headers.get('date'))
  if (!virtualBase && !Number.isNaN(server.getTime())) S.offset = Date.now() - server.getTime()
}

async function fetchSchedule() {
  try {
    const res = await fetch(opts.api, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': `ansb-tui/${VERSION}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    applyOffset(res)
    const data = await res.json()
    if (!Array.isArray(data) || data.length < 2) throw new Error('unexpected API response')
    S.days = [data[0] || [], data[1] || []]
    S.apiVersion = res.headers.get('api-version') || ''
    S.fetchedAt = Date.now()
    S.fromCache = false
    S.error = null
    saveCache()
  } catch (e) {
    S.error = e.cause?.code || e.message
    if (!S.fetchedAt) loadCache()
  }
  S.loading = false
}

// HEAD doesn't bump the server's daily stats counter, so use it for clock sync.
async function syncOffset() {
  try {
    const res = await fetch(opts.api, { method: 'HEAD', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': `ansb-tui/${VERSION}` } })
    applyOffset(res)
  } catch {}
}

// ─── --line mode ──────────────────────────────────────────────────────────────

if (opts.line) {
  // Reuse today's cache to avoid hitting the API on every statusline refresh.
  const fresh = loadCache() && new Date(S.fetchedAt).toDateString() === new Date().toDateString()
  if (!fresh) await fetchSchedule()
  const t = now()
  const blocks = S.days[todayIndex(t)]
  if (!isWeekend(t) || !blocks.length) {
    console.log('brak zajęć')
  } else {
    const st = computeState(blocks, t)
    const name = (b) => (isBreak(b) ? BREAK : splitTitle(b.string).title)
    if (st.phase === 'before') console.log(`start za ${fmtDuration(st.blockLeft)} → ${name(st.next)}`)
    else if (st.phase === 'during') console.log(`${name(st.current)} · ${fmtDuration(st.blockLeft)}${st.next ? ` → ${name(st.next)}` : ''}`)
    else console.log('koniec zajęć')
  }
  process.exit(0)
}

// ─── Styling ──────────────────────────────────────────────────────────────────

const useColor = !process.env.NO_COLOR
const sgr = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return sgr(`38;2;${n >> 16};${(n >> 8) & 255};${n & 255}`)
}
const red = rgb('#FF0000')
const green = rgb('#ADFF2F')
const grey = rgb('#8298b7')
const bold = sgr('1')
const dim = sgr('2')
const italic = sgr('3')
const redBold = (s) => bold(red(s))
const greenItalic = (s) => italic(green(s))

const ANSI_RE = /\x1b\[[0-9;]*m/g
const vlen = (s) => [...s.replace(ANSI_RE, '')].length

// Fit plain text into `w` columns; scrolls (marquee) if too long, like the web app.
function fit(text, w) {
  const chars = [...text]
  if (w <= 0) return ''
  if (chars.length <= w) return text
  const loop = [...chars, ' ', ' ', ' ', '·', ' ', ' ', ' ']
  const pause = 3 // hold the start of the title for a few ticks before scrolling
  const off = Math.max(0, (S.tick % (loop.length + pause)) - pause)
  return [...loop, ...loop].slice(off, off + w).join('')
}

const truncate = (text, w) => {
  const chars = [...text]
  return chars.length <= w ? text : chars.slice(0, Math.max(0, w - 1)).join('') + '…'
}

// ─── Big digits ───────────────────────────────────────────────────────────────

const FONT = {
  0: ['┌─┐', '│ │', '└─┘'],
  1: ['  ╷', '  │', '  ╵'],
  2: ['╶─┐', '┌─┘', '└─╴'],
  3: ['╶─┐', ' ─┤', '╶─┘'],
  4: ['╷ ╷', '└─┤', '  ╵'],
  5: ['┌─╴', '└─┐', '╶─┘'],
  6: ['┌─╴', '├─┐', '└─┘'],
  7: ['╶─┐', '  │', '  ╵'],
  8: ['┌─┐', '├─┤', '└─┘'],
  9: ['┌─┐', '└─┤', '╶─┘'],
  ':': [' ', '•', ' '],
  _: ['   ', '╶─╴', '   '],
}
const BIG_WIDTH = 30

const bigText = (str) =>
  [0, 1, 2].map((row) => [...str].map((ch) => (FONT[ch] || FONT._)[row]).join(' '))

function progressBar(p, w) {
  if (p == null) return dim('─'.repeat(w))
  const barW = w - 5
  const filled = Math.round(p * barW)
  return red('━'.repeat(filled)) + dim('─'.repeat(barW - filled)) + dim(`${String(Math.floor(p * 100)).padStart(4)}%`)
}

// ─── Views ────────────────────────────────────────────────────────────────────

function describe(block, w, { withLen = false } = {}) {
  if (!block) return [greenItalic('KONIEC ZAJĘĆ')]
  if (isBreak(block)) return [greenItalic(withLen ? `${BREAK} [${block.len}]` : BREAK)]
  const { title, kind } = splitTitle(block.string)
  const sub = [block.professor, kind].filter(Boolean).join(' · ') + (withLen ? ` [${block.len}]` : '')
  return [redBold(fit(title, w)), dim(fit(sub, w))]
}

function nowView(w, h) {
  const t = now()
  const blocks = S.days[todayIndex(t)]

  if (!isWeekend(t) || !blocks.length) {
    return [
      bold(green(truncate('Dzisiaj nie masz zajęć.', w))),
      '',
      dim(truncate('(→ plan weekendowy)', w)),
    ]
  }

  const st = computeState(blocks, t)
  const cur = st.phase === 'during' ? describe(st.current, w)
    : st.phase === 'after' ? [greenItalic('KONIEC ZAJĘĆ')]
    : [greenItalic(BREAK)]
  const nxt = st.phase === 'after' ? [greenItalic(BREAK)] : describe(st.next, w, { withLen: true })
  const blockT = fmtDuration(st.blockLeft)
  const dayT = fmtDuration(st.dayLeft)
  const barW = Math.min(w, BIG_WIDTH)

  const big = [
    bold('TERAZ:'), ...cur, '',
    bold('Do końca:'), ...bigText(blockT), progressBar(st.blockProgress, barW), '',
    bold('Kolejne:'), ...nxt, '',
    bold('Do końca dnia:'), ...bigText(dayT), progressBar(st.dayProgress, barW),
  ]
  const compact = [
    bold('TERAZ:'), ...cur,
    `${bold('Do końca:')} ${blockT}`, progressBar(st.blockProgress, barW), '',
    bold('Kolejne:'), ...nxt, '',
    `${bold('Do końca dnia:')} ${dayT}`, progressBar(st.dayProgress, barW),
  ]
  const tiny = [cur[0], `${blockT}  ${dim('/')}  ${dayT}`, `${dim('→')} ${nxt[0]}`]

  if (w >= BIG_WIDTH && big.length <= h) return big
  if (compact.length <= h) return compact
  return tiny.slice(0, h)
}

function tableView(w, h) {
  const t = now()
  const blocks = S.days[S.day]
  const isToday = S.day === todayIndex(t) && isWeekend(t)
  const st = isToday ? computeState(blocks, t) : { currentIdx: -1, passed: 0 }

  const header = bold(`‹ ${DAY_NAMES[S.day]} ›`)
  if (!blocks.length) return [header, '', bold(green('Brak zajęć tego dnia.'))]

  const rowW = Math.min(w, 72)
  const timeW = S.showLen ? 5 : 11
  const rows = blocks.map((b, i) => {
    const passed = i < st.passed
    const current = i === st.currentIdx
    const marker = current ? '▶' : isBreak(b) ? ' ' : '•'
    const time = S.showLen ? b.len : `${b.start.padStart(5, '0')}–${b.end.padStart(5, '0')}`
    const avail = rowW - 2 - timeW - 1

    let body
    if (isBreak(b)) {
      body = `${BREAK} [${b.len}]`
      if (S.showLen) body = BREAK
      body = passed ? grey(body) : current ? bold(green(body)) : green(body)
    } else {
      const { title, kind } = splitTitle(b.string)
      const kindW = Math.min([...kind].length, Math.max(0, avail - 12))
      const titleW = avail - (kindW ? kindW + 1 : 0)
      const tt = fit(title, titleW)
      const kk = kindW ? ' ' + truncate(kind, kindW) : ''
      body = passed ? grey(tt + kk) : (current ? redBold(tt) : red(tt)) + dim(kk)
    }
    const timeS = passed ? grey(time) : current ? bold(time) : dim(time)
    const line = `${current ? bold(marker) : passed ? grey(marker) : marker} ${timeS} ${body}`
    return line + ' '.repeat(Math.max(0, rowW - vlen(line))) // pad so rows left-align when centered
  })

  // Scroll so the current block stays visible in short panes.
  const room = Math.max(1, h - 2)
  let start = 0
  if (rows.length > room) {
    const focus = Math.max(0, st.currentIdx)
    start = Math.min(Math.max(0, focus - Math.floor(room / 2)), rows.length - room)
  }
  return [header, '', ...rows.slice(start, start + room)]
}

function helpView() {
  return [
    bold('Skróty'), '',
    `${bold('←/→ h/l tab')}  przełącz widok`,
    `${bold('↑/↓ j/k    ')}  zmień dzień`,
    `${bold('t          ')}  godziny / długość`,
    `${bold('r          ')}  odśwież plan`,
    `${bold('i          ')}  wersja / info`,
    `${bold('q          ')}  wyjdź`,
  ]
}

function infoView() {
  const fetched = S.fetchedAt ? new Date(S.fetchedAt).toLocaleString('pl-PL') : '—'
  return [
    bold('Info'), '',
    `Front: ansb-tui ${VERSION}${virtualBase ? '-D' : ''}`,
    `Back:  ${S.apiVersion || '—'}`,
    `Plan:  ${fetched}${S.fromCache ? ' (cache)' : ''}`,
    `Offset zegara: ${S.offset} ms`,
    `API:   ${opts.api}`,
  ]
}

// Pad lines to a common width so a centered block stays left-aligned inside.
function leftAlign(lines) {
  const max = Math.max(...lines.map(vlen))
  return lines.map((l) => l + ' '.repeat(max - vlen(l)))
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const w = process.stdout.columns || 80
  const h = process.stdout.rows || 24
  const t = now()

  // Header / footer only when there's room for them.
  const clock = t.toLocaleTimeString('pl-PL')
  const status = S.loading ? dim('ładowanie…')
    : S.error ? red(S.fromCache ? `offline · cache` : `błąd: ${S.error}`)
    : ''
  const left = dim(`${t.toLocaleDateString('pl-PL', { weekday: 'long' })} ${clock}`)
  const header = vlen(left) + vlen(status) + 1 <= w ? left + ' '.repeat(w - vlen(left) - vlen(status)) + status : truncate(clock, w)
  const fullFooter = '←→ widok  ↑↓ dzień  t czas  r odśwież  ? pomoc  q wyjdź'
  const footer = dim(truncate(vlen(fullFooter) <= w ? fullFooter : '←→ widok  ↑↓ dzień  ? pomoc', w))
  const chrome = h >= 12

  const bodyH = chrome ? h - 2 : h
  const body = S.loading && !S.fetchedAt ? [dim('Ładowanie…')]
    : S.overlay === 'help' ? leftAlign(helpView())
    : S.overlay === 'info' ? leftAlign(infoView().map((l) => truncate(l, w)))
    : S.view === 'table' ? tableView(w, bodyH)
    : nowView(w, bodyH)

  const centered = body.slice(0, bodyH).map((l) => ' '.repeat(Math.max(0, Math.floor((w - vlen(l)) / 2))) + l)
  const top = Math.max(0, Math.floor((bodyH - centered.length) / 2))
  const lines = [
    ...(chrome ? [header] : []),
    ...Array(top).fill(''),
    ...centered,
  ]
  while (lines.length < h - (chrome ? 1 : 0)) lines.push('')
  if (chrome) lines.push(footer)

  process.stdout.write('\x1b[H' + lines.slice(0, h).map((l) => l + '\x1b[K').join('\r\n') + '\x1b[J')
}

// ─── Input ────────────────────────────────────────────────────────────────────

function toggleView() {
  S.view = S.view === 'now' ? 'table' : 'now'
  S.day = todayIndex(now())
}

function onKey(key) {
  if (key === '\x03' || key === 'q') return quit()

  if (S.overlay) {
    if (key === '\x1b' || key === '?' || key === 'i' || key === 'q') S.overlay = null
    return render()
  }

  switch (key) {
    case '\x1b[C': case '\x1b[D': case 'h': case 'l': case 'a': case 'd': case '\t': case ' ':
      toggleView(); break
    case '\x1b[A': case '\x1b[B': case 'j': case 'k': case 'w': case 's':
      if (S.view === 'table') S.day = (S.day + 1) % 2
      break
    case 't': S.showLen = !S.showLen; break
    case '?': S.overlay = 'help'; break
    case 'i': S.overlay = 'info'; break
    case 'r':
      S.loading = true
      render()
      fetchSchedule().then(render)
      return
  }
  render()
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('ansb needs an interactive terminal (try --line for a one-shot status).')
  process.exit(1)
}

let timer = null
let lastDate = now().toDateString()

function restoreTerminal() {
  process.stdout.write('\x1b[?25h\x1b[?1049l')
  try { process.stdin.setRawMode(false) } catch {}
}

function quit() {
  clearTimeout(timer)
  restoreTerminal()
  process.exit(0)
}

process.on('SIGTERM', quit)
process.on('SIGHUP', quit)
process.on('uncaughtException', (e) => {
  restoreTerminal()
  console.error(e)
  process.exit(1)
})

// Re-enter raw/alt screen after being suspended (e.g. ctrl-z then fg).
process.on('SIGCONT', () => {
  process.stdin.setRawMode(true)
  process.stdout.write('\x1b[?1049h\x1b[?25l')
  syncOffset().then(render)
  render()
})

process.stdout.write('\x1b[?1049h\x1b[?25l')
process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  // A chunk may contain several keypresses; split escape sequences from plain keys.
  for (const key of chunk.match(/\x1b\[[0-9;]*[A-Za-z]|\x1b|[\s\S]/g) || []) onKey(key)
})
process.stdout.on('resize', render)

// Tick on second boundaries so the countdown never skips/doubles a second.
function loop() {
  S.tick++
  const today = now().toDateString()
  if (today !== lastDate) {
    lastDate = today
    S.day = todayIndex(now())
    fetchSchedule().then(render)
  }
  render()
  timer = setTimeout(loop, 1000 - (now().getTime() % 1000) + 5)
}

render()
await fetchSchedule()
S.day = todayIndex(now())
loop()

setInterval(syncOffset, OFFSET_SYNC_MS).unref()
setInterval(() => { if (S.error) fetchSchedule().then(render) }, RETRY_MS).unref()
