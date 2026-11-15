import { randomBytes } from 'crypto'
import { getToday, loadLink, sql, sync } from '@/lib/db'
import { addDays, diff, dow } from '@/lib/judge'
import { seed } from '@/lib/seed'

// shortcut: 문자 발송 업체가 없어 인증번호는 고정값이다, 실제 출시 때 SMS 인증으로 교체.
const DEMO_OTP = '123456'
const CODE_MIN = 10, REQUEST_MIN = 5

class Bad extends Error { constructor(msg: string, public status = 400) { super(msg) } }
const need = (ok: unknown, msg: string, status = 400) => { if (!ok) throw new Bad(msg, status) }
const newCode = () => String(100000 + (randomBytes(4).readUInt32BE() % 900000))
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

async function session(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  need(token, '로그인이 필요해요', 401)
  const [s] = await sql`select user_id, vehicle_id from sessions where token = ${token}`
  need(s, '로그인이 필요해요', 401)
  return s as { user_id: string | null; vehicle_id: string | null }
}
async function login(col: 'user_id' | 'vehicle_id', id: string) {
  const token = randomBytes(24).toString('hex')
  if (col === 'user_id') await sql`insert into sessions(token, user_id) values (${token}, ${id})`
  else await sql`insert into sessions(token, vehicle_id) values (${token}, ${id})`
  return { token }
}
/** 5분 동안 수락이 없는 요청은 만료시킨다. */
const expire = () => sql`update links set status = 'expired' where status = 'pending' and invited_at < now() - make_interval(mins => ${REQUEST_MIN})`

async function childState(uid: string) {
  await expire()
  const [me] = await sql`select phone, name, relation, settings from users where id = ${uid}`
  // 안 읽은 알림이 있는 부모님을 앞에 둔다.
  const ids = await sql`select id from links l where child_id = ${uid} order by (select count(*) from alerts a where a.link_id = l.id and not a.read and not a.archived) desc, accepted_day nulls last, invited_at`
  return { today: await getToday(), me, links: await Promise.all(ids.map(r => loadLink(r.id))) }
}

async function vehicleState(vid: string) {
  await expire()
  const [vehicle] = await sql`select vin, model, plate, subscription, code, code_expires_at from vehicles where id = ${vid}`
  const links = await sql`
    select l.id, l.status, l.paused, l.nickname, u.name, u.relation, '010-••••-' || right(u.phone, 4) phone,
      coalesce((select json_agg(json_build_object('kind', kind, 'day', to_char(day, 'YYYY-MM-DD'), 'parent', parent) order by day desc) from alerts where link_id = l.id and not archived), '[]') shared,
      coalesce((select json_agg(json_build_object('day', to_char(day, 'YYYY-MM-DD'), 'response', response) order by day desc) from wanders where link_id = l.id), '[]') wanders
    from links l join users u on u.id = l.child_id where l.vehicle_id = ${vid} and l.status in ('pending', 'accepted') order by l.invited_at`
  return { today: await getToday(), vehicle, links }
}

/** 자녀가 자기 링크만 건드리게 한다. */
async function ownLink(uid: string, linkId: unknown) {
  const [l] = await sql`select id, status, to_char(accepted_day, 'YYYY-MM-DD') accepted from links where id = ${String(linkId)} and child_id = ${uid}`
  need(l, '연결을 찾을 수 없어요', 404)
  return l
}
const acceptedLinks = (vid: string) => sql`select id from links where vehicle_id = ${vid} and status = 'accepted'`

async function handle(req: Request, path: string) {
  const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

  // ── 인증 ──
  if (path === 'auth/code') { need(/^010-\d{4}-\d{4}$/.test(b.phone), '휴대폰 번호를 확인해 주세요'); return { ok: true } }
  if (path === 'auth/verify') {
    need(/^010-\d{4}-\d{4}$/.test(b.phone), '휴대폰 번호를 확인해 주세요')
    need(b.code === DEMO_OTP, '인증번호가 맞지 않아요')
    const [u] = await sql`insert into users(phone) values (${b.phone}) on conflict (phone) do update set phone = excluded.phone returning id`
    return login('user_id', u.id)
  }
  // shortcut: 차대번호만으로 차량을 식별한다, Pleos 계정·차량 인증이 열리면 교체.
  if (path === 'vehicle/register') {
    need(typeof b.vin === 'string' && /^[A-Z0-9-]{6,20}$/.test(b.vin), '차량 정보를 확인해 주세요')
    const [v] = await sql`insert into vehicles(vin, model) values (${b.vin}, ${String(b.model || '내 차').slice(0, 20)}) on conflict (vin) do update set vin = excluded.vin returning id`
    return login('vehicle_id', v.id)
  }
  // 가상 계정과 목업 데이터를 처음 상태로 되돌린다(가상 계정만 지운다).
  if (path === 'demo/reset') return seed()

  const s = await session(req)

  // ── 자녀 앱 ──
  if (path.startsWith('child/')) {
    const uid = s.user_id
    need(uid, '자녀 계정으로 로그인해 주세요', 403)
    const p = path.slice(6)
    if (p === 'state') return childState(uid!)
    if (p === 'profile') { await sql`update users set name = ${String(b.name || '').slice(0, 10)}, relation = ${String(b.relation || '').slice(0, 6)} where id = ${uid}`; return {} }
    if (p === 'settings') { await sql`update users set settings = settings || ${JSON.stringify(b)}::jsonb where id = ${uid}`; return {} }
    if (p === 'logout') { await sql`delete from sessions where user_id = ${uid}`; return {} }
    if (p === 'delete-account') { await sql`delete from users where id = ${uid}`; return {} }
    if (p === 'invite') {
      const nick = String(b.nickname || '').trim().slice(0, 8)
      need(nick, '호칭을 입력해 주세요')
      const [u] = await sql`select phone, settings from users where id = ${uid}`
      const lock = u.settings.codeLock as string | undefined
      need(!lock || new Date(lock) < new Date(), '여러 번 틀려서 10분 뒤에 다시 입력할 수 있어요', 429)
      const [v] = await sql`select id, code_expires_at > now() alive from vehicles where code = ${String(b.code)}`
      if (!v) {
        const fails = (u.settings.codeFails ?? 0) + 1
        const patch = fails >= 5 ? { codeFails: 0, codeLock: new Date(Date.now() + 6e5).toISOString() } : { codeFails: fails }
        await sql`update users set settings = settings || ${JSON.stringify(patch)}::jsonb where id = ${uid}`
        throw new Bad('코드를 다시 확인해 주세요')
      }
      need(v.alive, '코드가 만료됐어요. 차량 화면의 새 코드를 입력해 주세요')
      const [blocked] = await sql`select 1 from blocks where vehicle_id = ${v.id} and phone = ${u.phone} and until > now()`
      const [dup] = await sql`select 1 from links where vehicle_id = ${v.id} and child_id = ${uid} and status in ('pending', 'accepted')`
      need(!dup, '이미 연결했거나 요청을 보낸 차량이에요')
      const [l] = await sql`insert into links(child_id, vehicle_id, nickname, status) values (${uid}, ${v.id}, ${nick}, ${blocked ? 'declined' : 'pending'}) returning id`
      await sql`update users set settings = settings || '{"codeFails":0}'::jsonb where id = ${uid}`
      return { linkId: l.id }
    }
    if (p === 'alert/read') { await sql`update alerts set read = true where id = ${String(b.id)} and link_id in (select id from links where child_id = ${uid})`; return {} }

    const l = await ownLink(uid!, b.linkId)
    if (p === 'link/cancel' || p === 'link/unlink') { await sql`delete from links where id = ${l.id}`; return {} }
    if (p === 'link/resend') { await sql`update links set status = 'pending', invited_at = now() where id = ${l.id} and status in ('pending', 'expired')`; return {} }
    if (p === 'link/nickname') { await sql`update links set nickname = ${String(b.nickname || '').trim().slice(0, 8) || '부모님'} where id = ${l.id}`; return {} }
    if (p === 'exclusion/add') {
      need(isDay(b.start) && isDay(b.end) && b.end >= b.start, '종료일이 시작일보다 빨라요')
      need(diff(b.end, b.start) < 30, '최대 30일까지 뺄 수 있어요')
      await sql`insert into exclusions(link_id, kind, start_day, end_day) values (${l.id}, ${String(b.kind || '기타').slice(0, 6)}, ${b.start}, ${b.end})`
    } else if (p === 'exclusion/delete') await sql`delete from exclusions where id = ${String(b.id)} and link_id = ${l.id}`
    else if (p === 'relearn') {
      // 검진 완료·생활 변화: 그날부터 평소 운전을 새로 배우고, 지금 알림은 정리한다.
      need(isDay(b.day) && b.day >= l.accepted && b.day <= (await getToday()), '날짜를 확인해 주세요')
      await sql`update links set relearns = relearns || ${JSON.stringify([{ from: b.day, reason: String(b.reason || '기타').slice(0, 8) }])}::jsonb where id = ${l.id}`
      await sql`update alerts set read = true, archived = true where link_id = ${l.id} and kind in ('chronic', 'wander')`
    } else if (p === 'vehicle-change') {
      await sql`update links set change = ${JSON.stringify({ model: String(b.model || '').slice(0, 20), plate: String(b.plate || '').slice(0, 12), code: 'CD-' + newCode().slice(0, 4), at: new Date().toISOString() })}::jsonb where id = ${l.id}`
      return {}
    } else if (p === 'vehicle-change/cancel') { await sql`update links set change = null where id = ${l.id}`; return {} }
    else if (p === 'vehicle-change/confirm') {
      // shortcut: 새 차량의 수락을 자녀 화면에서 대신 확정한다(와이어프레임 프로토타입 동작), 새 차량 앱이 생기면 V-001 수락으로 교체.
      await sql`update vehicles v set model = l.change->>'model', plate = l.change->>'plate' from links l where l.id = ${l.id} and v.id = l.vehicle_id and l.change is not null`
      await sql`update links set change = null where id = ${l.id}`
      return {}
    } else throw new Bad('없는 요청이에요', 404)
    await sync(l.id)
    return {}
  }

  // ── 차량 앱 ──
  if (path.startsWith('vehicle/')) {
    const vid = s.vehicle_id
    need(vid, '차량에서만 할 수 있어요', 403)
    const p = path.slice(8)
    const today = await getToday()
    if (p === 'state') return vehicleState(vid!)
    if (p === 'code') { await sql`update vehicles set code = ${newCode()}, code_expires_at = now() + make_interval(mins => ${CODE_MIN}) where id = ${vid}`; return {} }
    if (p === 'respond') {
      const [l] = await sql`select l.id, u.phone from links l join users u on u.id = l.child_id where l.id = ${String(b.linkId)} and l.vehicle_id = ${vid} and l.status = 'pending'`
      need(l, '요청이 만료됐어요', 410)
      if (b.action === 'accept') {
        await sql`update links set status = 'accepted', accepted_day = ${today} where id = ${l.id}`
        await sql`update vehicles set code = null where id = ${vid}`
        await sync(l.id)
      } else {
        await sql`update links set status = 'declined' where id = ${l.id}`
        if (b.action === 'block') {
          await sql`insert into blocks values (${vid}, ${l.phone}, now() + interval '24 hours') on conflict (vehicle_id, phone) do update set until = excluded.until`
          await sql`update vehicles set code = ${newCode()}, code_expires_at = now() + make_interval(mins => ${CODE_MIN}) where id = ${vid}`
        }
      }
      return {}
    }
    if (p === 'pause') { await sql`update links set paused = ${!!b.paused} where vehicle_id = ${vid} and status = 'accepted'`; return {} }
    // 연결 해제: 서버의 요약 데이터까지 즉시 삭제(링크에 딸린 기록이 함께 지워진다).
    if (p === 'disconnect') { await sql`delete from links where vehicle_id = ${vid}`; return {} }
    if (p === 'wipe') {
      const ls = await acceptedLinks(vid!)
      for (const l of ls) {
        await sql`delete from days where link_id = ${l.id}`
        await sql`delete from wanders where link_id = ${l.id}`
        await sql`delete from alerts where link_id = ${l.id}`
        await sql`delete from exclusions where link_id = ${l.id}`
        await sql`update links set accepted_day = ${today}, relearns = '[]' where id = ${l.id}`
        await sync(l.id)
      }
      return {}
    }
    // 시동을 끈 시점에 그날 요약을 올린다(원시 위치는 차량에서 폐기).
    if (p === 'trip') {
      const radius = Number(b.radius), night = b.night ? 1 : 0
      need(radius >= 0 && radius < 500, '주행 요약을 확인해 주세요')
      for (const l of await acceptedLinks(vid!)) {
        await sql`insert into days values (${l.id}, ${today}, 1, ${night}, ${radius})
          on conflict (link_id, day) do update set radius = (days.radius * days.trips + excluded.radius) / (days.trips + 1), trips = days.trips + 1, night = days.night + excluded.night`
        await sync(l.id)
      }
      return {}
    }
    if (p === 'wander') {
      need(['accept', 'none', 'refuse', 'destination'].includes(b.response), '응답을 확인해 주세요')
      for (const l of await acceptedLinks(vid!)) {
        const [asked] = await sql`select 1 from wanders where link_id = ${l.id} and day = ${today}`
        if (asked) continue // 질문은 하루 1회
        await sql`insert into wanders(link_id, day, at_label, minutes, response, timeline) values (${l.id}, ${today}, ${String(b.at || '').slice(0, 12)}, ${Number(b.minutes) || 0}, ${b.response}, ${JSON.stringify(b.timeline ?? [])}::jsonb)`
        await sync(l.id)
      }
      return {}
    }
    // ── 시연용 시간 압축 ──
    if (p === 'demo/next-day') {
      const next = addDays(today, 1)
      await sql`insert into meta values ('today', ${next}) on conflict (key) do update set value = excluded.value`
      for (const l of await sql`select id from links where status = 'accepted'`) await sync(l.id, next)
      return { today: next }
    }
    if (p === 'demo/chronic') {
      // 지난 28일은 평소(주 6번), 그 뒤 weeks 주 동안은 scenario 에 따라 주행 요약을 한꺼번에 넣는다. 날짜는 그만큼 앞으로 간다.
      const weeks = Math.min(Math.max(Number(b.weeks) || 12, 1), 30), drop = b.scenario === 'decline'
      let end = today
      for (const l of await acceptedLinks(vid!)) {
        const [{ last }] = await sql`select to_char(greatest(max(day), ${today}::date), 'YYYY-MM-DD') last from days where link_id = ${l.id}`
        const rows = []
        let n = 0
        for (let i = 1; i <= weeks * 7; i++) {
          const d = addDays(last ?? today, i), w = dow(d)
          if (!(drop ? [1, 4, 6] : [1, 2, 3, 4, 5, 6]).includes(w)) continue
          rows.push({ day: d, trips: 1, night: +(++n % (drop ? 12 : 5) === 0), radius: drop ? 3.9 : 6.2 })
        }
        end = addDays(last ?? today, weeks * 7)
        await sql`insert into days select ${l.id}, x.day::date, x.trips, x.night, x.radius from json_to_recordset(${JSON.stringify(rows)}::json) as x(day text, trips int, night int, radius numeric) on conflict do nothing`
      }
      await sql`insert into meta values ('today', ${end}) on conflict (key) do update set value = excluded.value`
      for (const l of await sql`select id from links where status = 'accepted'`) await sync(l.id, end)
      return { today: end }
    }
  }
  throw new Bad('없는 요청이에요', 404)
}

async function route(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    return Response.json(await handle(req, (await ctx.params).path.join('/')))
  } catch (e) {
    if (e instanceof Bad) return Response.json({ error: e.message }, { status: e.status })
    console.error(e)
    return Response.json({ error: '잠시 후 다시 시도해 주세요' }, { status: 500 })
  }
}
export { route as GET, route as POST }
