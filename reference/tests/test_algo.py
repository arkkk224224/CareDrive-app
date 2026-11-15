import unittest

from caredrive.acute import Acute, is_deviation
from caredrive.chronic import Day, Detector


def day(i, trips=1, night=0.2, km=8.0, **kw):
    """하루 기록: 트립당 20분, 야간 비율 night, 거리 km."""
    return Day(i, trips, 20.0 * trips, 20.0 * trips * night, [km] * trips, **kw)


def feed(det, start, n, **kw):
    return [det.update(day(i, **kw)) for i in range(start, start + n)]


class Chronic(unittest.TestCase):
    def test_baseline_waits_for_28_days_and_20_trips(self):
        det = Detector()
        feed(det, 0, 27)
        self.assertIsNone(det.base)
        feed(det, 27, 1)
        self.assertIsNotNone(det.base)
        slow = Detector()  # 28일이 지나도 트립이 20회 미만이면 완성 안 됨
        for i in range(40):
            slow.update(day(i, trips=1 if i % 3 == 0 else 0))
        self.assertIsNone(slow.base)

    def test_two_indicators_for_56_days_alert_once_then_cooldown(self):
        det = Detector()
        feed(det, 0, 28)
        base = dict(det.base)
        stages = feed(det, 28, 56 + 60, trips=0)  # 운전 중단: 3지표 모두 하락, 쿨다운(84일) 안쪽
        self.assertEqual(stages.count("관찰알림"), 1)
        self.assertEqual(det.base, base)  # 기준선 고정
        later = feed(det, 28 + 116, 60, trips=0)  # 쿨다운이 끝나도 계속 낮으면 다시 알림
        self.assertEqual(later.count("관찰알림"), 1)

    def test_driver_without_night_driving_still_gets_alert(self):
        det = Detector()
        feed(det, 0, 28, night=0.0)  # 야간 운전을 안 하는 사람: 기준선의 야간 비율 0
        stages = [det.update(day(i, trips=1 if i % 5 == 0 else 0, night=0.0, km=3.0)) for i in range(28, 28 + 120)]
        self.assertIn("관찰알림", stages)  # 횟수와 반경이 함께 크게 줄면 야간 지표 없이도 알린다

    def test_driver_without_night_driving_ignores_small_drop(self):
        det = Detector()
        feed(det, 0, 28, night=0.0)
        stages = [det.update(day(i, trips=1, night=0.0, km=6.0)) for i in range(28, 28 + 200)]  # 반경만 -25%
        self.assertNotIn("관찰알림", stages)

    def test_one_indicator_never_alerts(self):
        det = Detector()
        feed(det, 0, 28)
        stages = []
        for i in range(28, 200):  # 이틀에 한 번만 운전: 트립 수만 -50%, 나머지는 동일
            stages.append(det.update(day(i, trips=1 if i % 2 else 0)))
        self.assertNotIn("관찰알림", stages)

    def test_excluded_days_freeze_the_count(self):
        det = Detector()
        feed(det, 0, 28)
        feed(det, 28, 40, trips=0)
        before = list(det.hist)
        feed(det, 68, 30, trips=0, excluded=True)
        self.assertEqual(list(det.hist), before)

    def test_reset_relearns(self):
        det = Detector()
        feed(det, 0, 28)
        det.reset()
        self.assertIsNone(det.base)


class AcuteChannel(unittest.TestCase):
    def test_no_question_while_moving(self):
        self.assertIsNone(Acute().handle(1, "t1", stopped=False, answer="none"))

    def test_answers(self):
        a = Acute()
        self.assertEqual(a.handle(1, "t1", True, "accept"), "route_home")
        self.assertEqual(a.lost_days, [1])  # 수락은 후보로 기록
        self.assertEqual(a.handle(2, "t2", True, "destination"), "normal")
        self.assertEqual(a.handle(3, "t3", True, "refuse"), "normal")
        self.assertEqual(a.lost_days, [1])  # 목적지 발화·거절은 기록하지 않음

    def test_once_per_day_and_trip(self):
        a = Acute()
        self.assertEqual(a.handle(1, "t1", True, "none"), "logged")
        self.assertIsNone(a.handle(1, "t2", True, "none"))  # 같은 날
        self.assertIsNone(a.handle(2, "t1", True, "none"))  # 같은 트립

    def test_alert_needs_two_different_days_in_30(self):
        a = Acute()
        a.handle(1, "t1", True, "none")
        self.assertFalse(a.alert(1))
        a.handle(20, "t2", True, "none")
        self.assertTrue(a.alert(20))
        self.assertFalse(a.alert(35))  # 첫 후보가 30일 밖

    def test_deviation(self):
        self.assertTrue(is_deviation(offroute_m=1200, offroute_min=12))
        self.assertFalse(is_deviation(offroute_m=1200, offroute_min=3))
        self.assertTrue(is_deviation(reroutes=3))


if __name__ == "__main__":
    unittest.main()
