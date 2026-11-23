// Pure schedule logic, ported from the web app's useSchedule.js.

export const BREAK = 'PRZERWA'
export const DAY_NAMES = ['SOBOTA', 'NIEDZIELA']

export const isBreak = (block) => block?.string === BREAK

// "9:40" -> epoch ms on the same local date as `base`
export function parseTime(base, hm) {
  const [h, m] = hm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export function fmtDuration(ms) {
  if (ms == null || ms < 0) return '__:__:__'
  const s = Math.floor(ms / 1000)
  return [s / 3600, (s % 3600) / 60, s % 60]
    .map((n) => String(Math.floor(n)).padStart(2, '0'))
    .join(':')
}

// 0 = Saturday, 1 = Sunday; weekdays default to Saturday (same as the web app)
export const todayIndex = (now) => (now.getDay() === 0 ? 1 : 0)
export const isWeekend = (now) => now.getDay() === 0 || now.getDay() === 6

// "Systemy ekspertowe - LAB (E111)" -> { title: "Systemy ekspertowe", kind: "LAB (E111)" }
export function splitTitle(str) {
  const i = str.indexOf(' - ')
  return i < 0 ? { title: str, kind: '' } : { title: str.slice(0, i), kind: str.slice(i + 3) }
}

/**
 * Where we are in the day's `blocks` at time `now`.
 * phase: 'empty' | 'before' | 'during' | 'after'
 */
export function computeState(blocks, now) {
  const t = now.getTime()
  if (!blocks?.length) return { phase: 'empty', currentIdx: -1, passed: 0 }

  const times = blocks.map((b) => ({ start: parseTime(now, b.start), end: parseTime(now, b.end) }))
  const dayStart = times[0].start
  const dayEnd = times.at(-1).end
  const dayProgress = Math.min(1, Math.max(0, (t - dayStart) / (dayEnd - dayStart)))

  if (t < dayStart) {
    return {
      phase: 'before',
      currentIdx: -1,
      current: null,
      next: blocks[0],
      passed: 0,
      blockLeft: dayStart - t,
      dayLeft: dayEnd - t,
      blockProgress: null,
      dayProgress: 0,
    }
  }

  if (t <= dayEnd) {
    const i = times.findIndex((x) => t <= x.end)
    const { start, end } = times[i]
    return {
      phase: 'during',
      currentIdx: i,
      current: blocks[i],
      next: blocks[i + 1] ?? null,
      passed: i,
      blockLeft: end - t,
      dayLeft: dayEnd - t,
      blockProgress: (t - start) / (end - start),
      dayProgress,
    }
  }

  const midnight = new Date(now).setHours(24, 0, 0, 0)
  return {
    phase: 'after',
    currentIdx: -1,
    current: null,
    next: null,
    passed: blocks.length,
    blockLeft: null,
    dayLeft: midnight - t,
    blockProgress: null,
    dayProgress: 1,
  }
}
