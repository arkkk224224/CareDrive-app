"""합성 주행 데이터 시뮬레이션. 성능 입증이 아니라 '규칙이 의도대로 동작하고 오경보가 통제되는지' 확인용 (기획서 G절).
실행: py -m caredrive.sim"""
import math
import random

from .chronic import Day, Detector

DAYS = 365
SICK_RATE, WEEK_SD, OTHER = 1.5, 0.3, 0.0  # 연 쉬는 구간 횟수, 현실 모드 주별 편차, 타인 운전 날 비율
ONSET = 140  # 감소 시작일 (기준선은 약 30일째 완성)
LAM, NIGHT_P, DUR, DIST = 0.9, 0.12, 20.0, 8.0  # 하루 트립 수, 야간 트립 확률, 트립 분, 평균 거리 km


def poisson(rng, lam):
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def make_days(rng, mult, tagged=(), real=False):
    """mult(day) -> (트립, 야간, 거리) 배수. 주 단위 공통 요인으로 주별 편차를 만든다."""
    out, week, drift = [], 1.0, 1.0
    sick = set()
    if real:  # 감기·통증으로 7~21일 쉬는 구간 연 평균 1.5회 (자녀가 태그하지 않음)
        for _ in range(poisson(rng, SICK_RATE)):
            st = rng.randrange(DAYS)
            sick |= set(range(st, st + rng.randint(7, 21)))
    wsd = WEEK_SD if real else 0.15
    for day in range(DAYS):
        if day % 7 == 0:
            week = rng.lognormvariate(0, wsd)
        if real and day % 28 == 0:  # 한 달 단위 생활 범위 변동
            drift = rng.lognormvariate(0, 0.1)
        mt, mn, md = mult(day)
        other = rng.random() < OTHER  # 타인 운전 날: 야간 없음, 거리 2배
        if other:
            mn, md = 0, md * 2
        n = 0 if day in sick else poisson(rng, LAM * mt * week)
        d = Day(day, trips=n, excluded=day in tagged)
        for _ in range(n):
            dur = DUR * rng.lognormvariate(0, 0.4)
            d.drive_min += dur
            if rng.random() < min(1.0, NIGHT_P * mn):
                d.night_min += dur
            d.dists_km.append(DIST * md * drift * rng.lognormvariate(-0.18, 0.6))
        out.append(d)
    return out


def alerts(days, cls=Detector):
    det, hits = cls(), []
    for d in days:
        if det.update(d) == "관찰알림":
            hits.append(d.day)
    return hits


def flat(day):
    return 1, 1, 1


def gradual(rate):
    def f(day):
        m = max(0.4, 1 - rate * max(0, day - ONSET) / 7)
        return m, m, m
    return f


def abrupt(day):
    return (0.6,) * 3 if day >= ONSET else (1, 1, 1)


def trips_only(day):
    return (0.6, 1, 1) if day >= ONSET else (1, 1, 1)


def winter(day):  # 9월 1일 시작 가정, 12~2월 겨울
    return (0.8, 1, 0.9) if 90 <= day < 180 else (1, 1, 1)


def run(n=300):
    scen = [("정상", flat), ("겨울", winter), ("3%/주", gradual(0.03)), ("5%/주", gradual(0.05)), ("급감 -40%", abrupt)]
    for real in (False, True):
        print(f"{chr(10)}== {'현실 노이즈(휴식기·주별 편차↑·생활범위 변동)' if real else '깨끗한 데이터'} (n={n}) ==")
        row = []
        for name, mult in scen:
            res = [alerts(make_days(random.Random(s), mult, real=real)) for s in range(n)]
            if name in ("정상", "겨울"):
                row.append(f"{name} 오경보 연 {sum(map(len, res))/n:.2f}회")
            else:
                d = sorted((h[0] - ONSET) / 7 for r in res for h in [[x for x in r if x >= ONSET]] if h)
                row.append(f"{name} 탐지 {len(d)/n:.0%}/{d[len(d)//2] if d else 0:.0f}주")
        print("  " + " | ".join(row))


if __name__ == "__main__":
    run()
