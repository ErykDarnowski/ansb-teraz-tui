import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeState, fmtDuration, splitTitle, todayIndex } from '../src/schedule.js'

const day = [
  { start: '9:40', end: '11:10', len: '01:30', string: 'A - LAB (E1)', professor: 'X' },
  { start: '11:10', end: '11:20', len: '00:10', string: 'PRZERWA' },
  { start: '11:20', end: '12:05', len: '00:45', string: 'B - ĆW-P (E2)', professor: 'Y' },
]
const at = (hm) => new Date(`2026-11-29 ${hm}`)

test('before first block', () => {
  const s = computeState(day, at('09:00'))
  assert.equal(s.phase, 'before')
  assert.equal(fmtDuration(s.blockLeft), '00:40:00')
  assert.equal(s.next, day[0])
})

test('during a break', () => {
  const s = computeState(day, at('11:15'))
  assert.equal(s.phase, 'during')
  assert.equal(s.currentIdx, 1)
  assert.equal(s.passed, 1)
  assert.equal(fmtDuration(s.dayLeft), '00:50:00')
})

test('last block has no next', () => {
  const s = computeState(day, at('12:00'))
  assert.equal(s.currentIdx, 2)
  assert.equal(s.next, null)
})

test('after classes', () => {
  const s = computeState(day, at('13:00'))
  assert.equal(s.phase, 'after')
  assert.equal(s.passed, 3)
  assert.equal(fmtDuration(s.dayLeft), '11:00:00')
})

test('helpers', () => {
  assert.deepEqual(splitTitle('Systemy ekspertowe - LAB (E111)'), { title: 'Systemy ekspertowe', kind: 'LAB (E111)' })
  assert.equal(todayIndex(at('10:00')), 1) // Sunday
  assert.equal(todayIndex(new Date('2026-11-24 10:00')), 0) // weekday -> Saturday
  assert.equal(fmtDuration(null), '__:__:__')
})
