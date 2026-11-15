import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify, compare, evaluate, fmt, joinKo } from './judge'
import { momDays } from './seed'

const base = { nick: '엄마', accepted: '2026-08-03', today: '2026-11-15', excl: [{ start: '2026-10-17', end: '2026-10-19' }], relearns: [] }
const wanders = [{ day: '2026-11-03', response: 'accept' }, { day: '2026-11-12', response: 'none' }]

test('목업 시나리오: 8/30 기준선, 11/14 관찰 알림, 11/12 길 헤맴 알림', () => {
  let start = ''
  for (let d = 31; d <= 55 && !start; d++) {
    const s = d <= 31 ? '2026-08-31' : `2026-09-${String(d - 31).padStart(2, '0')}`
    if (evaluate({ ...base, days: momDays(s), wanders }).alerts.some(a => a.kind === 'chronic' && a.day === '2026-11-14')) start = s
  }
  assert.ok(start, '11/14에 울리는 감소 시작일이 있어야 한다')
  const e = evaluate({ ...base, days: momDays(start), wanders })
  assert.equal(e.baselines[0].to, '2026-08-30')
  assert.equal(e.alerts.filter(a => a.kind === 'chronic').length, 1)
  assert.deepEqual(e.alerts.filter(a => a.kind === 'wander').map(a => a.day), ['2026-11-12'])
  assert.equal(e.alerts.find(a => a.kind === 'chronic')!.title, '엄마의 외출과 밤 운전이 줄었어요')
  assert.equal(`${fmt.trips(e.now)} ${fmt.night(e.now)} ${fmt.trips(e.base!)} ${fmt.night(e.base!)}`, '4번 1번 6번 2번')
  assert.deepEqual(compare(e.now, e.base!).declined, ['trips', 'night'])
  console.log('감소 시작일', start, '요즘', e.now, '주간', e.alerts.filter(a => a.kind === 'weekly').map(a => a.day.slice(5) + ' ' + a.title))
})

test('단발성 감소·헤맴 1건은 알리지 않는다', () => {
  const e = evaluate({ ...base, days: momDays('2026-12-31'), wanders: wanders.slice(0, 1) })
  assert.deepEqual(e.alerts.filter(a => a.kind === 'chronic' || a.kind === 'wander'), [])
})

test('제외 기간을 넣으면 길 헤맴 알림이 빠진다, 검진 완료 뒤에는 새로 배운다', () => {
  const days = momDays('2026-09-07')
  const e = evaluate({ ...base, days, wanders, excl: [...base.excl, { start: '2026-11-03', end: '2026-11-03' }] })
  assert.equal(e.alerts.some(a => a.kind === 'wander'), false)
  const r = evaluate({ ...base, days, wanders, relearns: [{ from: '2026-11-10', reason: '건강검진' }] })
  assert.deepEqual(r.learning && [r.learning.from, r.learning.days], ['2026-11-10', 6])
  assert.equal(r.base!.label, '8월')
})

test('음성 응답 분류와 조사', () => {
  assert.deepEqual(['집이요', '응', '아니 괜찮아', '병원 가요', ''].map(classify), ['accept', 'accept', 'refuse', 'destination', 'none'])
  assert.equal(joinKo(['trips', 'radius']), '외출과 다니는 거리가')
})
