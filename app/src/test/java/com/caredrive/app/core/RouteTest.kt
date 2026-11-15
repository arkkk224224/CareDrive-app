package com.caredrive.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteTest {
    private val home = LatLon(37.50, 127.00)

    @Test fun prefixSimilarityMatchesSamePathAndRejectsOther() {
        val r = (0..20).map { Cell(0, it) }
        assertEquals(1.0, prefixSimilarity(r.take(10), r), 1e-9) // 아직 안 간 구간은 벌점 없음
        assertTrue(prefixSimilarity((0..20).map { Cell(it + 10, -5) }, r) < 0.1)
    }

    @Test fun headingEntropySeparatesStraightFromCircling() {
        val straight = (0..40).map { offsetKm(home, 0.0, it * 0.1) }
        val circle = (0..80).map { k -> offsetKm(home, 0.5 * kotlin.math.cos(k * 0.2), 0.5 * kotlin.math.sin(k * 0.2)) }
        assertTrue(headingEntropy(straight) < 0.5)
        assertTrue(headingEntropy(circle) > 2.5)
    }

    @Test fun noDecisionWithoutEnoughUsualRoutes() {
        val mon = RouteMonitor(Grid(home), emptyList())
        val far = driveSamples(0, listOf(home, offsetKm(home, 8.0, 0.0)), 40.0, parkMin = 0)
        assertFalse(far.map { mon.add(it) }.any { it.candidate })
    }

    @Test fun repeatedRerouteIsCandidate() {
        val grid = Grid(home)
        val r = grid.cells((0..30).map { offsetKm(home, 0.0, it * 0.1) })
        val mon = RouteMonitor(grid, List(5) { r })
        repeat(3) { mon.onReroute() }
        assertTrue(mon.add(Sample(0, 30.0, false, false, home)).candidate)
    }

    /** 장면별 감지율. 숫자는 출력하고, 회귀 방지용으로 느슨한 하한·상한만 건다. */
    @Test fun simulationByScenario() {
        val n = 100
        val res = AcuteScenario.entries.associateWith { evaluateAcute(it, n) }
        res.forEach { (sc, r) -> println("급성 ${sc.label}: 후보 ${(r.first * 100).toInt()}%, 중앙 ${r.second?.let { "%.1f분".format(it) } ?: "-"}") }
        assertTrue(res.getValue(AcuteScenario.USUAL).first <= 0.05)
        assertTrue(res.getValue(AcuteScenario.WRONG_TURN).first <= 0.10)
        assertTrue(res.getValue(AcuteScenario.LOST_AWAY).first >= 0.90)
        assertTrue(res.getValue(AcuteScenario.LOST_WANDER).first >= 0.70)
    }
}
