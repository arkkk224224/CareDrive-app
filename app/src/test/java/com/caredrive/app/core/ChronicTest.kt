package com.caredrive.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** reference/tests/test_algo.py와 같은 케이스. */
class ChronicTest {
    private fun day(i: Int, trips: Int = 1, night: Double = 0.2, km: Double = 8.0, excluded: Boolean = false) =
        Day(i, trips, 20.0 * trips, 20.0 * trips * night, List(trips) { km }, excluded)

    private fun feed(det: Detector, start: Int, n: Int, trips: Int = 1, excluded: Boolean = false) =
        (start until start + n).map { det.update(day(it, trips = trips, excluded = excluded)) }

    @Test fun baselineWaits28DaysAnd20Trips() {
        val det = Detector()
        feed(det, 0, 27)
        assertNull(det.base)
        feed(det, 27, 1)
        assertNotNull(det.base)
        val slow = Detector() // 28일이 지나도 트립이 20회 미만이면 완성 안 됨
        for (i in 0 until 40) slow.update(day(i, trips = if (i % 3 == 0) 1 else 0))
        assertNull(slow.base)
    }

    @Test fun twoIndicatorsFor56DaysAlertOnceThenCooldown() {
        val det = Detector()
        feed(det, 0, 28)
        val base = det.base
        val stages = feed(det, 28, 56 + 60, trips = 0) // 운전 중단: 3지표 모두 하락, 쿨다운(84일) 안쪽
        assertEquals(1, stages.count { it == Stage.ALERT })
        assertEquals(base, det.base) // 기준선 고정
        val later = feed(det, 28 + 116, 60, trips = 0) // 쿨다운이 끝나도 계속 낮으면 다시 알림
        assertEquals(1, later.count { it == Stage.ALERT })
    }

    @Test fun driverWithoutNightDrivingStillGetsAlert() {
        val det = Detector()
        (0 until 28).forEach { det.update(day(it, night = 0.0)) } // 기준선의 야간 비율 0
        val stages = (28 until 28 + 120).map { det.update(day(it, trips = if (it % 5 == 0) 1 else 0, night = 0.0, km = 3.0)) }
        assertTrue(stages.contains(Stage.ALERT)) // 횟수와 반경이 함께 크게 줄면 야간 지표 없이도 알린다
    }

    @Test fun driverWithoutNightDrivingIgnoresSmallDrop() {
        val det = Detector()
        (0 until 28).forEach { det.update(day(it, night = 0.0)) }
        val stages = (28 until 28 + 200).map { det.update(day(it, trips = 1, night = 0.0, km = 6.0)) } // 반경만 -25%
        assertFalse(stages.contains(Stage.ALERT))
    }

    @Test fun oneIndicatorNeverAlerts() {
        val det = Detector()
        feed(det, 0, 28)
        val stages = (28 until 200).map { det.update(day(it, trips = if (it % 2 == 1) 1 else 0)) } // 트립 수만 -50%
        assertFalse(stages.contains(Stage.ALERT))
    }

    @Test fun excludedDaysFreeTheStage() {
        val det = Detector()
        feed(det, 0, 28)
        feed(det, 28, 40, trips = 0)
        val frozen = feed(det, 68, 30, trips = 0, excluded = true)
        assertTrue(frozen.all { it == frozen.first() }) // 제외일에는 단계가 바뀌지 않는다
    }

    @Test fun resetRelearns() {
        val det = Detector()
        feed(det, 0, 28)
        det.reset()
        assertNull(det.base)
    }

    @Test fun simulationStaysQuietWhenNormalAndAlertsOnAbruptDrop() {
        val normal = (1L..200L).sumOf { runScenario(it, Scenario.NORMAL).alertDays.size }
        val abrupt = (1L..200L).count { runScenario(it, Scenario.ABRUPT).alertDays.isNotEmpty() }
        println("시뮬레이션 200명: 정상 오경보 $normal 건, 급감 탐지 $abrupt/200")
        assertTrue("정상 오경보가 너무 많다: $normal", normal <= 28) // 200명 x 1년, 기대 약 14건(연 0.07회)
        assertTrue("급감 탐지가 너무 적다: $abrupt/200", abrupt >= 140) // 기대 약 160(81%)
    }
}
