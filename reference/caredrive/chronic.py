"""만성 채널: 일별 기록 -> 28일 창 -> 고정 기준선 -> 단계 판정. 상수는 기획서 v2의 시작값(임상 근거 아님)."""
from collections import deque
from dataclasses import dataclass, field

WINDOW = 28
MIN_BASE_TRIPS = 20
DROP = 0.30
SUSTAIN_DAYS = 56
SUSTAIN_MIN = 49  # 56일 중 이 일수 이상 '2지표 하락'이면 지속으로 본다 (연속 56일은 잡음 하루에 끊겨 급감 탐지 70%대)
COOLDOWN_DAYS = 84
MIN_NIGHT_BASE = 0.05
NIGHT_PSEUDO_TRIPS = 5  # 야간 비율을 기준선 쪽으로 5트립만큼 당긴다: 트립이 적을 때의 출렁임 완화(지표 1개 감소 시 알림 30%->22%, 급감 탐지 92%->90%)
NIGHT_OFF_MEAN = 0.70  # 야간 지표를 못 쓸 때: 남은 2지표의 기준선 대비 비율 평균이 이 값 이하 (둘 다 0.9 이하)
MIN_INCLUDED = 14


@dataclass
class Day:
    day: int
    trips: int = 0
    drive_min: float = 0.0
    night_min: float = 0.0
    dists_km: list = field(default_factory=list)  # 트립별 집 기준 정차 지점 거리
    excluded: bool = False  # 자녀가 여행·입원 등으로 태그한 날


def indicators(window):
    """28일 창 -> 지표 3개. 제외일은 빼고 트립 수는 28일 기준으로 환산. 포함일이 14일 미만이면 None."""
    d = [x for x in window if not x.excluded]
    if len(d) < MIN_INCLUDED:
        return None
    drive = sum(x.drive_min for x in d)
    dists = [v for x in d for v in x.dists_km]
    return {
        "trips": sum(x.trips for x in d) * WINDOW / len(d),
        "night": sum(x.night_min for x in d) / drive if drive else None,
        "radius": sum(dists) / len(dists) if dists else None,
    }


class Detector:
    def __init__(self):
        self.reset()

    def reset(self):
        """자녀의 검진 완료·이사·차량 교체 입력 시 기준선 재학습."""
        self.days, self.base, self.hist = [], None, deque(maxlen=SUSTAIN_DAYS)
        self.cooldown_until, self.last = -1, "학습"

    def update(self, d):
        """하루 기록을 넣고 단계를 돌려준다: 학습/정상/기록/관찰알림."""
        self.days.append(d)
        self.days = self.days[-WINDOW:]
        cur = indicators(self.days)
        if d.excluded or cur is None:  # 누적 동결
            return self.last
        if self.base is None:
            full = len(self.days) == WINDOW
            if full and cur["trips"] >= MIN_BASE_TRIPS and None not in cur.values():
                self.base = cur  # 이후 고정
            return self.last
        self.last = self._judge(cur, d.day)
        return self.last

    def _judge(self, cur, day):
        b = self.base
        if b["night"] < MIN_NIGHT_BASE:
            # 야간 비율이 기준선에서 너무 작아 비교가 무의미하면 남은 2지표만 남는다. 그때도 '2개 모두 -30%'를 요구하면
            # 3개 중 2개일 때보다 훨씬 엄격해져 급감 탐지가 56~66%로 떨어져서, 2지표의 평균으로 판정한다(시뮬레이션으로 정한 값).
            r = [0.0 if cur[k] is None else cur[k] / b[k] for k in ("trips", "radius")]
            any_drop = sum(r) / 2 <= NIGHT_OFF_MEAN
            sustained = any_drop and max(r) <= 0.9
        else:
            cur = self._shrink_night(cur)
            n = sum(1 for k, bv in b.items() if cur[k] is None or cur[k] <= (1 - DROP) * bv)
            any_drop, sustained = n > 0, n >= 2
        self.hist.append(sustained)
        if len(self.hist) == SUSTAIN_DAYS and sum(self.hist) >= SUSTAIN_MIN and day >= self.cooldown_until:
            self.cooldown_until = day + COOLDOWN_DAYS
            return "관찰알림"
        return "기록" if any_drop else "정상"

    def _shrink_night(self, cur):
        """트립이 적으면 야간 비율이 크게 출렁여서, 의사 표본만큼 기준선 값 쪽으로 당겨 추정한다."""
        if cur["night"] is None:
            return cur
        win = [x for x in self.days if not x.excluded]
        drive = sum(x.drive_min for x in win)
        pseudo = NIGHT_PSEUDO_TRIPS * drive / max(1, sum(x.trips for x in win))
        night = sum(x.night_min for x in win)
        return dict(cur, night=(night + pseudo * self.base["night"]) / (drive + pseudo))
