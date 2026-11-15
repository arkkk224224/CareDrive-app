// 판정 로직(순수 함수). 차량이 올린 하루 요약만 보고 기준선·알림을 처음부터 다시 계산한다.
// 규칙은 기획서 10장과 app/src/main/java/com/caredrive/app/core/Chronic.kt · Acute.kt 와 같다.

export type Day = { day: string; trips: number; night: number; radius: number } // radius: 그날 집-정차지 평균 km
export type Excl = { start: string; end: string }
export type Relearn = { from: string; reason: string }
export type Wander = { day: string; response: string }
export type Metrics = { trips: number; night: number; radius: number } // 주당 횟수, 야간 비율(0~1), 평균 km
export type Baseline = Metrics & { from: string; to: string; effective: string; label: string; short: string }
export type AlertOut = { kind: string; day: string; title: string; body: string; parent: string }
export type Input = {
  nick: string; accepted: string; today: string
  days: Day[]; excl: Excl[]; wanders: Wander[]; relearns: Relearn[]
}

export const LEARN_DAYS = 28, LEARN_TRIPS = 20, DROP = 0.7, WINDOW = 56, HOLD = 49, COOLDOWN = 84
export const MIN_NIGHT_BASE = 0.05, WANDER_WINDOW = 30, WANDER_DAYS = 2

const D = (s: string) => new Date(s + 'T00:00:00Z')
export const addDays = (s: string, n: number) => new Date(D(s).getTime() + n * 864e5).toISOString().slice(0, 10)
export const diff = (a: string, b: string) => Math.round((D(a).getTime() - D(b).getTime()) / 864e5)
export const dow = (s: string) => D(s).getUTCDay()
export const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`
export const WD = ['일', '월', '화', '수', '목', '금', '토']
export const mdw = (s: string) => `${md(s)} (${WD[dow(s)]})`
export const kdate = (s: string) => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`

const batchim = (w: string) => (w.charCodeAt(w.length - 1) - 0xac00) % 28 > 0
/** 받침에 따라 조사를 고른다: jo('엄마','이','가') -> '엄마가' */
export const jo = (w: string, a: string, b: string) => w + (batchim(w.replace(/[^가-힣]/g, '') || '가') ? a : b)
const NAMES = { trips: '외출', night: '밤 운전', radius: '다니는 거리' } as const
export type Key = keyof typeof NAMES
/** ["외출","밤 운전"] -> "외출과 밤 운전이" */
export function joinKo(keys: Key[], subject = true) {
  const w = keys.map(k => NAMES[k])
  const s = w.map((x, i) => (i < w.length - 1 ? x + (batchim(x) ? '과' : '와') : x)).join(' ')
  return subject ? s + (batchim(s) ? '이' : '가') : s
}

export function aggregate(span: string[], byDay: Map<string, Day>): Metrics {
  let trips = 0, night = 0, km = 0
  for (const d of span) { const r = byDay.get(d); if (r) { trips += r.trips; night += r.night; km += r.radius * r.trips } }
  return { trips: span.length ? trips / (span.length / 7) : 0, night: trips ? night / trips : 0, radius: trips ? km / trips : 0 }
}

/** 기준선 대비 -30% 이하인 지표와, 그날이 '줄어든 날'인지. */
export function compare(m: Metrics, b: Metrics) {
  const r = { trips: m.trips / b.trips, night: b.night >= MIN_NIGHT_BASE ? m.night / b.night : null, radius: m.radius / b.radius }
  const declined = (['trips', 'night', 'radius'] as Key[]).filter(k => r[k] !== null && (r[k] as number) <= DROP)
  // 야간 운전을 거의 안 하는 운전자는 남은 2지표 평균으로 본다.
  const low = r.night !== null ? declined.length >= 2 : (r.trips + r.radius) / 2 <= DROP && r.trips <= 0.9 && r.radius <= 0.9
  return { ratio: r, declined, low }
}

export const chipOf = (ratio: number | null) => (ratio === null ? '비슷해요' : ratio <= DROP ? '줄었어요' : ratio >= 1.3 ? '늘었어요' : '비슷해요')
export const fmt = {
  trips: (m: Metrics) => `${Math.round(m.trips)}번`,
  night: (m: Metrics) => `${Math.round(m.night * 10)}번`,
  radius: (m: Metrics) => `${m.radius.toFixed(1)}km`,
}

export function evaluate(inp: Input) {
  const { nick, accepted, today } = inp
  const byDay = new Map(inp.days.map(d => [d.day, d]))
  const excluded = (d: string) => inp.excl.some(e => e.start <= d && d <= e.end)
  const alerts: AlertOut[] = [{ kind: 'linked', day: accepted, title: `${jo(nick, '과', '와')} 연결되었어요`, body: '', parent: `"${jo(nick, '과', '와')} 연결되었어요"` }]
  const baselines: Baseline[] = []
  const hist: string[] = [] // 계산에 쓰는 날(제외 기간을 뺀 날)
  let learnFrom = accepted, reason = '', learning = true, flags: boolean[] = [], lastChronic = ''

  for (let d = accepted; d <= today; d = addDays(d, 1)) {
    const base = baselines.filter(b => b.effective <= d).at(-1)
    if (d < today && base && !learning) {
      if (dow(d) === 0) {
        const c = compare(aggregate(hist.slice(-LEARN_DAYS), byDay), base)
        const title = c.declined.length ? `${joinKo(c.declined)} 평소보다 줄었어요. 조금 더 지켜볼게요.` : '이번 주도 평소와 비슷해요'
        alerts.push({ kind: 'weekly', day: d, title, body: '', parent: `"${title}"` })
      }
      if (d.endsWith('-01') && base.effective < d) {
        const title = `${+addDays(d, -1).slice(5, 7)}월 리포트가 도착했어요`
        alerts.push({ kind: 'monthly', day: d, title, body: '', parent: `"${title}"` })
      }
    }
    const rl = inp.relearns.find(r => r.from === d)
    if (rl) { learning = true; learnFrom = d; reason = rl.reason; flags = [] }
    if (excluded(d)) continue
    hist.push(d)
    if (learning) {
      const span = hist.filter(x => x >= learnFrom)
      const trips = span.reduce((s, x) => s + (byDay.get(x)?.trips ?? 0), 0)
      if (span.length >= LEARN_DAYS && trips >= LEARN_TRIPS) {
        const label = reason ? `${reason} 이후` : `${+learnFrom.slice(5, 7)}월`
        baselines.push({ ...aggregate(span, byDay), from: learnFrom, to: d, effective: addDays(d, 1), label, short: reason ? `${reason.replace('건강', '')} 후` : label })
        learning = false
        const title = reason ? '새 기준이 준비됐어요' : `${nick}의 평소 운전을 다 배웠어요`
        alerts.push({ kind: reason ? 'rebaseline' : 'baseline', day: d, title, body: reason ? `${reason} 이후 4주 동안의 운전을 다 배웠어요. 내일부터는 ${reason} 이후와 비교해요.` : '', parent: `"${title}"` })
      }
    } else if (base) {
      const c = compare(aggregate(hist.slice(-LEARN_DAYS), byDay), base)
      flags.push(c.low)
      if (flags.slice(-WINDOW).filter(Boolean).length >= HOLD && (!lastChronic || diff(d, lastChronic) >= COOLDOWN)) {
        lastChronic = d
        const keys = c.declined.length ? c.declined : (['trips', 'radius'] as Key[])
        alerts.push({
          kind: 'chronic', day: d, title: `${nick}의 ${joinKo(keys)} 줄었어요`, body: '이런 모습이 두 달 가까이 이어지고 있어요.',
          parent: `"최근 평소와 다른 운전 패턴(${joinKo(keys, false).replace(/[과와] /g, '·')} 감소)이 이어지고 있다고 알려드렸어요. 건강 점검 안내도 함께 전달됐어요"`,
        })
      }
    }
  }

  // 급성: 수락·무응답만 길 잃음 후보. 30일 안에 서로 다른 날 2건이면 알림 1회.
  const lost = [...new Set(inp.wanders.filter(w => w.response === 'accept' || w.response === 'none').map(w => w.day))].sort()
  let lastWander = ''
  for (const d of lost) {
    if (excluded(d)) continue
    const n = lost.filter(x => !excluded(x) && diff(d, x) >= 0 && diff(d, x) < WANDER_WINDOW).length
    if (n >= WANDER_DAYS && (!lastWander || diff(d, lastWander) >= WANDER_WINDOW)) {
      lastWander = d
      alerts.push({
        kind: 'wander', day: d, title: '평소 다니던 길에서 두 번 헤매셨어요', body: '30일 안에 서로 다른 날 두 번이에요.',
        parent: '"최근 30일 동안 평소 다니던 길에서 두 번 헤매셨다고 알려드렸어요. 건강 점검 안내도 함께 전달됐어요"',
      })
    }
  }

  const span = hist.filter(x => x >= learnFrom)
  return {
    alerts, baselines, hist, byDay,
    base: baselines.filter(b => b.effective <= today).at(-1) ?? null,
    learning: learning ? { from: learnFrom, reason, days: span.length, trips: span.reduce((s, x) => s + (byDay.get(x)?.trips ?? 0), 0) } : null,
    now: aggregate(hist.slice(-LEARN_DAYS), byDay),
  }
}
export type Evaluated = ReturnType<typeof evaluate>

/** "집으로 안내할까요?"에 대한 음성 응답 분류 (Acute.kt classify 와 같은 규칙). */
export function classify(text: string | null | undefined): 'accept' | 'refuse' | 'destination' | 'none' {
  const words = (text ?? '').split(/[\s,.!?]+/).filter(Boolean)
  if (!words.length) return 'none'
  if (words.some(w => w.startsWith('집')) || words.some(w => ['네', '예', '응', '그래', '좋아', '좋아요'].includes(w))) return 'accept'
  if (words.some(w => w.startsWith('아니') || w.startsWith('아뇨') || w.startsWith('괜찮'))) return 'refuse'
  return 'destination'
}
