// 시연용 가상 계정과 목업 데이터. 와이어프레임의 11/15 시나리오(엄마·아반떼)에 맞춘다.
import { sql, sync } from './db'
import { addDays, diff, dow, evaluate, type Day } from './judge'

export const DEMO_TODAY = '2026-11-15'
export const DEMO_PHONES = ['010-1234-5678', '010-9876-5432']
export const DEMO_VINS = ['DEMO-AVANTE', 'DEMO-SANTAFE', 'DEMO-MORNING', 'DEMO-GRANDEUR']

/** 엄마: 8월은 주 6번(월~토), declineStart 부터 주 2번, 10월부터 주 4번. 밤 운전은 5번에 1번 → 16번에 1번. */
export function momDays(declineStart: string, sept = [1, 3]): Day[] {
  const out: Day[] = []
  let n = 0
  const fixed: Record<string, [number, number]> = { '2026-11-12': [2, 6.1], '2026-11-13': [1, 4.8], '2026-11-14': [1, 5.9] }
  for (let d = '2026-08-03'; d <= DEMO_TODAY; d = addDays(d, 1)) {
    const w = dow(d), late = d >= declineStart
    let trips = !late ? +(w !== 0) : d < '2026-10-01' ? +sept.includes(w) : +[1, 3, 5, 6].includes(w)
    let radius = late ? 5.8 : 6.2
    if (d >= '2026-10-17' && d <= '2026-10-19') trips = 0 // 여행(계산에서 뺀 기간)
    if (d >= '2026-11-09') [trips, radius] = fixed[d] ?? [0, 0]
    if (!trips) continue
    let night = 0
    if (late) night = +(w === 5 && Math.floor(diff(d, '2026-08-03') / 7) % 8 === 4) // 8주에 한 번
    else for (let i = 0; i < trips; i++) if (++n % 5 === 0) night++
    out.push({ day: d, trips, night, radius })
  }
  return out
}

const steady = (from: string, perWeek: number[], radius: number): Day[] => {
  const out: Day[] = []
  let n = 0
  for (let d = from; d <= DEMO_TODAY; d = addDays(d, 1)) if (perWeek.includes(dow(d))) out.push({ day: d, trips: 1, night: +(++n % 5 === 0), radius })
  return out
}

const WANDERS = [
  { day: '2026-11-03', at: '오후 6시쯤', minutes: 15, response: 'accept', timeline: [['오후 5:52', '평소 다니시던 길에서 벗어나셨어요.'], ['6:00~6:07', '같은 동네를 몇 번 도셨어요.'], ['6:08', '차를 세우셨어요.'], ['6:08', '차가 "어디 가시나요? 집으로 안내할까요?"라고 여쭤봤어요.'], ['6:08', '"집이요"라고 답하셔서 집 안내를 시작했어요.']] },
  { day: '2026-11-12', at: '오후 5시쯤', minutes: 20, response: 'none', timeline: [['오후 4:31', '평소 다니시던 길에서 벗어나셨어요.'], ['4:40~4:50', '내비가 길을 세 번 다시 찾았어요.'], ['4:51', '차를 세우셨어요.'], ['4:51', '차가 "어디 가시나요? 집으로 안내할까요?"라고 여쭤봤어요.'], ['4:51', '15초 동안 대답이 없으셔서 안내를 시작하지 않았어요.']] },
]

export async function seed() {
  // 가상 계정만 지우고 다시 만든다(다른 계정은 건드리지 않는다).
  await sql`delete from users where phone = any(${DEMO_PHONES})`
  await sql`delete from vehicles where vin = any(${DEMO_VINS})`
  await sql`insert into meta values ('today', ${DEMO_TODAY}) on conflict (key) do update set value = excluded.value`

  const [jisu] = await sql`insert into users(phone, name, relation) values ('010-1234-5678', '지수', '딸') returning id`
  await sql`insert into users(phone, name, relation) values ('010-9876-5432', '민준', '아들')`
  const cars = await sql`insert into vehicles(vin, model, plate) values ('DEMO-AVANTE', '아반떼', '34나 5678'), ('DEMO-SANTAFE', '싼타페', '56다 7890'), ('DEMO-MORNING', '모닝', '78라 1234'), ('DEMO-GRANDEUR', '그랜저', '12가 3456') returning id, vin`
  const car = (vin: string) => cars.find(c => c.vin === vin)!.id

  const excl = [{ start: '2026-10-17', end: '2026-10-19' }]
  const input = (days: Day[]) => ({ nick: '엄마', accepted: '2026-08-03', today: DEMO_TODAY, days, excl, wanders: WANDERS, relearns: [] })
  // 관찰 알림이 와이어프레임과 같은 11/14에 울리는 감소 시작일을 찾는다.
  let start = '2026-09-07'
  for (let d = '2026-08-31'; d <= '2026-09-25'; d = addDays(d, 1))
    if (evaluate(input(momDays(d))).alerts.some(a => a.kind === 'chronic' && a.day === '2026-11-14')) { start = d; break }

  const people: [string, string, string, Day[]][] = [
    ['엄마', 'DEMO-AVANTE', '2026-08-03', momDays(start)],
    ['아빠', 'DEMO-SANTAFE', '2026-06-01', steady('2026-06-01', [1, 2, 4, 5, 6], 8.4)],
    ['할머니', 'DEMO-MORNING', '2026-11-04', steady('2026-11-04', [1, 2, 3, 4, 5, 6], 2.3).slice(0, 9)],
  ]
  for (const [nick, vin, accepted, days] of people) {
    const [l] = await sql`insert into links(child_id, vehicle_id, nickname, status, invited_at, accepted_day) values (${jisu.id}, ${car(vin)}, ${nick}, 'accepted', ${addDays(accepted, -1) + 'T21:30:00+09:00'}, ${accepted}) returning id`
    await sql`insert into days select ${l.id}, x.day::date, x.trips, x.night, x.radius from json_to_recordset(${JSON.stringify(days)}::json) as x(day text, trips int, night int, radius numeric)`
    if (nick === '엄마') {
      await sql`insert into exclusions(link_id, kind, start_day, end_day) values (${l.id}, '여행', '2026-10-17', '2026-10-19'), (${l.id}, '여행', '2026-11-20', '2026-11-23')`
      await sql`insert into wanders(link_id, day, at_label, minutes, response, timeline) select ${l.id}, x.day::date, x.at, x.minutes, x.response, x.timeline from json_to_recordset(${JSON.stringify(WANDERS)}::json) as x(day text, at text, minutes int, response text, timeline jsonb)`
    }
    await sync(l.id, DEMO_TODAY)
    // 오늘(11/15) 기준 아직 열지 않은 알림은 엄마의 관찰 알림과 길 헤맴 알림 두 개뿐이다.
    await sql`update alerts set read = true where link_id = ${l.id} and not (kind in ('chronic', 'wander') and day >= '2026-11-01')`
  }
  return { declineStart: start }
}
