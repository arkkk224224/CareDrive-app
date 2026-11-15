'use client'
import { chipOf, compare, diff, fmt, jo, LEARN_DAYS, LEARN_TRIPS, md, type Evaluated, type Key } from '@/lib/judge'
import { Btn, Chip, Link as A, Note, Screen, StateChip } from '../ui'
import type { Alert, Ctx } from './types'

export const KIND: Record<string, [string, string]> = {
  chronic: ['관찰 알림', 'C-031'], wander: ['길 헤맴 알림', 'C-052'], weekly: ['주간 요약', 'C-030'], monthly: ['월간 리포트', 'C-030-M'],
  baseline: ['평소 운전 완성', ''], rebaseline: ['새 기준', 'C-020'], linked: ['연결', ''],
}
export const ROWS: [Key, string][] = [['trips', '외출 횟수'], ['night', '밤 운전'], ['radius', '다니는 거리']]
/** "주 4번 (평소 6번)" 같은 지표 한 줄. */
export function metricText(k: Key, ev: Evaluated, wide = false) {
  const b = ev.base!, n = ev.now
  if (k === 'trips') return wide ? `이번 주 ${fmt.trips(n)} · 평소 주 ${fmt.trips(b)}` : `주 ${fmt.trips(n)} (평소 ${fmt.trips(b)})`
  if (k === 'night') return wide ? `10번 중 ${fmt.night(n)} · 평소 10번 중 ${fmt.night(b)}` : `10번 중 ${fmt.night(n)} (평소 ${fmt.night(b)})`
  return wide ? `평균 ${fmt.radius(n)} · 평소 ${fmt.radius(b)}` : `${fmt.radius(n)} (평소 ${fmt.radius(b)})`
}

export function Switcher({ accepted, cur, setSel }: Pick<Ctx, 'accepted' | 'cur' | 'setSel'>) {
  return (
    <div className="-mx-5 flex shrink-0 gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
      {accepted.map(l => (
        <button key={l.id} onClick={() => setSel(l.id)} aria-pressed={l.id === cur?.id} className={`h-8 shrink-0 rounded-2xl px-3.5 text-[13px] ${l.id === cur?.id ? 'bg-[#333] font-bold text-white' : 'bg-[#eee] font-medium text-[#333]'}`}>{l.nickname} · {l.vehicle.model}</button>
      ))}
    </div>
  )
}

export function MetricCard({ c, to, title }: { c: Ctx; to?: (k: Key) => void; title?: string }) {
  const { ev, cur, nav } = c
  if (!ev || !cur) return null
  const cmp = ev.base ? compare(ev.now, ev.base) : null
  return (
    <section className="flex flex-col rounded-[14px] border border-[#ddd] px-4 pt-4 pb-2">
      <div className="flex items-center"><h3 className="flex-1 text-[15px] font-bold">{title ?? `${cur.nickname}의 운전`}</h3>{ev.base && <span className="text-[11px] text-[#888]">{jo(ev.base.short, '과', '와').replace(ev.base.short, ev.base.short + '(평소)')} 비교</span>}</div>
      {ROWS.map(([k, label], i) => {
        const Row = cmp && to ? 'button' : 'div'
        return (
          <Row key={k} onClick={cmp && to ? () => to(k) : undefined} className={`flex min-h-11 items-center gap-2.5 py-3 text-left ${i ? 'border-t border-[#e6e6e6]' : ''}`}>
            <span className="flex flex-1 flex-col gap-0.5"><span className="text-[14px] font-medium text-[#222]">{label}</span><span className="text-[12px] text-[#777]">{cmp ? metricText(k, ev) : '배우는 중'}</span></span>
            {cmp ? <StateChip label={chipOf(cmp.ratio[k])} /> : <Chip>준비 중</Chip>}
            <span className="text-[18px] text-[#aaa]">›</span>
          </Row>
        )
      })}
      {cmp && <button onClick={() => nav.reset('C-030')} className="py-2.5 text-[13px] font-medium underline">리포트 전체 보기 ›</button>}
    </section>
  )
}

const Head = ({ chip, title, sub, children }: { chip: string; title: string; sub?: string; children?: React.ReactNode }) => (
  <section className="flex flex-col items-start gap-2 rounded-[14px] bg-[#f4f4f4] p-4"><Chip dark>{chip}</Chip><h2 className="text-[17px] font-bold">{title}</h2>{sub && <p className="text-[13px] leading-normal text-[#555]">{sub}</p>}{children}</section>
)
const Gauge = ({ label, text, v }: { label: string; text: string; v: number }) => (
  <div className="flex w-full flex-col gap-1.5"><div className="flex justify-between text-[12px]"><span className="text-[#777]">{label}</span><span className="font-bold">{text}</span></div><div className="h-1.5 rounded bg-[#ddd]"><div className="h-full rounded bg-[#333]" style={{ width: `${Math.min(v, 1) * 100}%` }} /></div></div>
)
export const openAlert = (c: Ctx, a: Alert) => { if (!a.read) c.act('child/alert/read', { id: a.id }); if (KIND[a.kind]?.[1]) c.nav.go(KIND[a.kind][1], { day: a.day }) }

function Home(c: Ctx) {
  const { nav, st, cur, ev, accepted } = c
  const live = (cur?.alerts ?? []).filter(a => !a.archived)
  const unread = live.filter(a => !a.read && (a.kind === 'chronic' || a.kind === 'wander'))
  const dot = accepted.some(l => l.alerts.some(a => !a.read && !a.archived))
  const bell = (
    <button aria-label="알림" onClick={() => nav.go('C-050')} className="relative flex size-11 items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/ic/bell-dot.svg" width={32} height={32} />
      {/* 안 읽은 알림이 없으면 벨 아이콘의 빨간 점을 가린다 */}
      {!dot && <span className="absolute top-[9px] right-[8px] size-[11px] rounded-full bg-white" />}
    </button>
  )
  if (!cur || !ev || !st)
    return (
      <Screen nav={nav} title="CareDrive" big tab="C-020" right={bell}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center"><p className="text-[17px] font-bold">연결된 차량이 없어요</p><p className="text-[13px] text-[#777]">새 차량을 연결하려면 초대를 해주세요</p></div>
        <Btn onClick={() => nav.go('C-010-1')}>초대하기</Btn>
        <p className="text-center text-[11px] text-[#888]">지금까지의 부모님 주행 기록은 삭제됐어요.</p>
      </Screen>
    )
  const nick = cur.nickname, L = ev.learning
  const excl = cur.excl.find(e => e.end >= st.today)
  const weekly = live.find(a => a.kind === 'weekly')
  const fresh = ev.baselines.length > 1 && ev.base && diff(st.today, ev.base.effective) < LEARN_DAYS ? ev.base : null
  const sorted = cur.alerts.filter(a => a.archived && (a.kind === 'chronic' || a.kind === 'wander'))
  return (
    <Screen nav={nav} title="CareDrive" big tab="C-020" right={bell}>
      <Switcher {...c} />
      {cur.paused ? (
        <>
          <Head chip="공유 멈춤" title="지금은 공유가 멈춰 있어요" sub="공유가 다시 켜질 때까지 요약과 알림을 보내드리지 않아요. 알림이 없다고 괜찮다는 뜻은 아니에요." />
          <Note title="지난 리포트는 계속 볼 수 있어요" sub="리포트 보기 ›" onClick={() => nav.reset('C-030')} />
        </>
      ) : (
        <>
          {L ? (
            <Head chip={ev.base ? '새 기준 배우는 중' : '평소 운전 배우는 중'} title={ev.base ? `${L.reason} 이후 평소 운전을 새로 배우고 있어요` : `${nick}의 평소 운전을 배우고 있어요`}>
              <Gauge label={ev.base ? `기간 (${md(L.from)}부터)` : '기간'} text={`${LEARN_DAYS}일 중 ${Math.min(L.days, LEARN_DAYS)}일째`} v={L.days / LEARN_DAYS} />
              <Gauge label="운전 기록" text={`${LEARN_TRIPS}번 중 ${Math.min(L.trips, LEARN_TRIPS)}번`} v={L.trips / LEARN_TRIPS} />
              <p className="text-[12px] leading-normal text-[#666]">{ev.base ? `다 배우면 그다음 날부터 새 기준과 비교해요. 그동안 리포트는 ${ev.base.label} 기준으로 계속 볼 수 있고, 알림은 보내지 않아요.` : '시동을 켜고 끌 때까지를 1번으로 세요. 두 가지를 다 채우면 매주 일요일 저녁에 요약을 보내드려요.'}</p>
            </Head>
          ) : fresh ? (
            <Head chip={`새 기준 · ${md(fresh.effective)}부터`} title={`이제 ${fresh.label}와 비교해요`} sub={`${md(fresh.from)} ~ ${md(fresh.to)} 운전을 ${nick}의 새 평소로 삼았어요.`}><A onClick={() => nav.go('C-033')}>비교 기준 보기 ›</A></Head>
          ) : unread.length ? (
            <section className="flex flex-col gap-2.5">
              <p className="text-[13px] font-bold text-[#777]">확인하지 않은 알림 {unread.length}</p>
              {unread.map(a => (
                <button key={a.id} onClick={() => openAlert(c, a)} className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-[#333] p-4 text-left">
                  <span className="flex w-full items-center"><Chip dark>{KIND[a.kind][0]} · {md(a.day)}</Chip><span className="flex-1" /><span className="size-2 rounded bg-[#e5484d]" /></span>
                  <span className="text-[16px] font-bold">{a.title}</span><span className="text-[13px] text-[#555]">{a.body}</span>
                  <span className="self-end text-[13px] font-medium underline">자세히 보기 ›</span>
                </button>
              ))}
            </section>
          ) : (
            <Head chip={weekly ? `주간 요약 · ${md(weekly.day)}` : '주간 요약'} title={weekly?.title ?? '이번 주도 평소와 비슷해요'} sub={ev.base && weekly?.title.includes('비슷') !== false ? `${nick}의 ${ev.base.label} 운전과 비슷하게 다니셨어요.` : undefined}><A onClick={() => nav.reset('C-030')}>리포트 보기 ›</A></Head>
          )}
          <MetricCard c={c} to={k => nav.go('C-031-R', { k })} />
          {L && ev.base && sorted.length > 0 ? (
            <Note title={`지난 알림 ${sorted.length}건`} sub="검진 완료로 정리됐어요. 리포트에서 다시 볼 수 있어요." onClick={() => nav.reset('C-030')} />
          ) : (
            <Note title="여행이나 입원 예정이 있나요?" sub={excl ? `${md(excl.start)} ~ ${md(excl.end)} ${excl.kind}${excl.start > st.today ? '이 예정돼 있어요' : ' 중이에요'}` : '미리 알려주시면 그 기간은 계산에서 빼요'} onClick={() => nav.go('C-060')} />
          )}
        </>
      )}
    </Screen>
  )
}

function Alerts(c: Ctx) {
  const { nav, st, cur } = c
  const list = (cur?.alerts ?? []).filter(a => st && diff(st.today, a.day) <= 90)
  const group = (title: string, items: Alert[]) => items.length > 0 && (
    <section className="flex flex-col">
      <p className="pb-1 text-[13px] font-bold text-[#777]">{title}</p>
      {items.map(a => {
        const Row = KIND[a.kind]?.[1] ? 'button' : 'div'
        return (
          <Row key={a.id} onClick={KIND[a.kind]?.[1] ? () => openAlert(c, a) : undefined} className="flex items-center gap-3 border-b border-[#eee] py-3.5 text-left">
            <span className="flex flex-1 flex-col items-start gap-1.5"><span className="flex items-center gap-2"><Chip dark={a.kind === 'chronic' || a.kind === 'wander'}>{KIND[a.kind]?.[0] ?? a.kind}</Chip>{!a.read && <span className="size-2 rounded bg-[#e5484d]" />}{a.archived && <span className="text-[11px] text-[#888]">지난 알림</span>}</span><span className="text-[14px] font-medium text-[#222]">{a.title}</span><span className="text-[12px] text-[#888]">{md(a.day)}</span></span>
            {KIND[a.kind]?.[1] && <span className="text-[18px] text-[#aaa]">›</span>}
          </Row>
        )
      })}
    </section>
  )
  return (
    <Screen nav={nav} back title="알림">
      {group('이번 주', list.filter(a => diff(st!.today, a.day) <= 7))}
      {group('이전', list.filter(a => diff(st!.today, a.day) > 7))}
      {!list.length && <p className="py-10 text-center text-[13px] text-[#888]">아직 받은 알림이 없어요.</p>}
      <p className="text-[11px] leading-normal text-[#888]">알림은 90일 동안 보관해요. 운전 기록은 리포트 탭의 날짜별 기록에서 볼 수 있어요.</p>
    </Screen>
  )
}

export const HOME: Record<string, (c: Ctx) => React.ReactNode> = { 'C-020': c => <Home {...c} />, 'C-050': c => <Alerts {...c} /> }
