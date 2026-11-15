import { neon } from '@neondatabase/serverless'
import { evaluate, type Input } from './judge'

export const sql = neon(process.env.DATABASE_URL!)

/** 시연용 날짜. meta.today 가 있으면 그 날, 없으면 한국 오늘. */
export async function getToday() {
  const r = await sql`select value from meta where key = 'today'`
  return (r[0]?.value as string) ?? new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10)
}

/** 링크 하나의 원자료(하루 요약·제외 기간·길 헤맴·알림). */
export async function loadLink(linkId: string) {
  const [l] = await sql`
    select l.id, l.nickname, l.status, l.paused, l.invited_at, to_char(l.accepted_day, 'YYYY-MM-DD') accepted, l.relearns, l.change,
      json_build_object('model', v.model, 'plate', v.plate, 'subscription', v.subscription) vehicle,
      coalesce((select json_agg(json_build_object('day', to_char(day, 'YYYY-MM-DD'), 'trips', trips, 'night', night, 'radius', radius::float) order by day) from days where link_id = l.id), '[]') days,
      coalesce((select json_agg(json_build_object('id', id, 'kind', kind, 'start', to_char(start_day, 'YYYY-MM-DD'), 'end', to_char(end_day, 'YYYY-MM-DD')) order by start_day) from exclusions where link_id = l.id), '[]') excl,
      coalesce((select json_agg(json_build_object('id', id, 'day', to_char(day, 'YYYY-MM-DD'), 'at', at_label, 'minutes', minutes, 'response', response, 'timeline', timeline) order by day) from wanders where link_id = l.id), '[]') wanders,
      coalesce((select json_agg(json_build_object('id', id, 'kind', kind, 'day', to_char(day, 'YYYY-MM-DD'), 'title', title, 'body', body, 'parent', parent, 'read', read, 'archived', archived) order by day desc) from alerts where link_id = l.id), '[]') alerts
    from links l join vehicles v on v.id = l.vehicle_id where l.id = ${linkId}`
  return l
}

/** 판정을 다시 돌려 알림 표를 맞춘다. 새 알림은 넣고, 조건에서 빠진 알림은 '지난 알림'으로 옮긴다. */
export async function sync(linkId: string, today?: string) {
  const l = await loadLink(linkId)
  if (!l || l.status !== 'accepted') return
  const input: Input = { nick: l.nickname, accepted: l.accepted, today: today ?? (await getToday()), days: l.days, excl: l.excl, wanders: l.wanders, relearns: l.relearns }
  const out = evaluate(input).alerts
  const have = new Set((l.alerts as { kind: string; day: string }[]).map(a => a.kind + a.day))
  const want = new Set(out.map(a => a.kind + a.day))
  const fresh = out.filter(a => !have.has(a.kind + a.day))
  // 공유를 멈춘 동안에는 새 알림을 보내지 않는다.
  if (fresh.length && !l.paused)
    await sql`insert into alerts(link_id, kind, day, title, body, parent)
      select ${linkId}, x.kind, x.day::date, x.title, x.body, x.parent from json_to_recordset(${JSON.stringify(fresh)}::json) as x(kind text, day text, title text, body text, parent text)
      on conflict do nothing`
  const gone = (l.alerts as { id: string; kind: string; day: string; archived: boolean }[]).filter(a => !want.has(a.kind + a.day) && !a.archived).map(a => a.id)
  if (gone.length) await sql`update alerts set archived = true where id = any(${gone}::uuid[])`
}
