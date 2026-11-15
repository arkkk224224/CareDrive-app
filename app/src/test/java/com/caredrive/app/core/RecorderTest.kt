package com.caredrive.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Random

class RecorderTest {
    private val home = LatLon(37.50, 127.00)
    private val shop = offsetKm(home, 0.0, 3.0) // 북쪽 3km

    private fun trips(samples: List<Sample>): List<Trip> {
        val seg = TripSegmenter()
        val out = samples.mapNotNull { seg.add(it) }.toMutableList()
        seg.flush()?.let { out += it }
        return out
    }

    @Test fun oneTripIsMeasured() {
        val t = trips(driveSamples(0, listOf(home, shop), 30.0)).single()
        assertEquals(6.0, t.driveMin, 0.3) // 3km / 30km/h
        assertEquals(3.0, t.distanceKm, 0.05)
        assertTrue(distKm(t.end, shop) < 0.02)
        assertEquals(0.0, t.nightMin, 1e-9)
    }

    @Test fun headlightCountsAsNight() {
        val t = trips(driveSamples(0, listOf(home, shop), 30.0, headlight = true)).single()
        assertEquals(t.driveMin, t.nightMin, 1e-9)
    }

    @Test fun shortParkingDoesNotSplitButFiveMinutesDoes() {
        val first = driveSamples(0, listOf(home, shop), 30.0, parkMin = 3) // 3분 주차: 같은 트립
        val second = driveSamples(first.last().tMs + 1000, listOf(shop, home), 30.0, parkMin = 6) // 6분 주차: 분할
        val third = driveSamples(second.last().tMs + 1000, listOf(home, shop), 30.0, parkMin = 10)
        assertEquals(2, trips(first + second + third).size)
    }

    @Test fun trafficLightStopDoesNotSplit() {
        val go = driveSamples(0, listOf(home, shop), 30.0, parkMin = 0).dropLast(1)
        val wait = (1..300).map { Sample(go.last().tMs + it * 1000L, 0.0, parked = false, headlight = false, pos = shop) } // 5분 신호 대기(주차 아님)
        val back = driveSamples(wait.last().tMs + 1000, listOf(shop, home), 30.0)
        assertEquals(1, trips(go + wait + back).size)
    }

    @Test fun hardBrakeIsCounted() {
        val s = mutableListOf<Sample>()
        for (i in 0..20) s += Sample(i * 1000L, 50.0, false, false, offsetKm(home, 0.0, i * 0.014))
        for (i in 1..3) s += Sample((20 + i) * 1000L, 50.0 - i * 16.0, false, false, offsetKm(home, 0.0, 0.3)) // 초당 16km/h 감속 = 4.4m/s²
        assertEquals(1, trips(s).single().hardBrakes)
    }

    @Test fun turnsAndSignalsAreCounted() {
        val corner = offsetKm(home, 0.0, 1.0)
        val east = offsetKm(home, 1.0, 1.0)
        val t = trips(driveSamples(0, listOf(home, corner, east), 30.0, signalAtCorners = true)).single()
        assertEquals(1, t.turns)
        assertEquals(1, t.signaledTurns)
        val t2 = trips(driveSamples(0, listOf(home, corner, east), 30.0, signalAtCorners = false)).single()
        assertEquals(0, t2.signaledTurns)
    }

    @Test fun dayExcludesTripsEndingAtHomeFromRadius() {
        val ts = trips(driveSamples(0, listOf(home, shop), 30.0) + driveSamples(3_600_000, listOf(shop, home), 30.0))
        val d = buildDay(0, ts, home).day
        assertEquals(2, d.trips)
        assertEquals(1, d.distsKm.size)
        assertEquals(3.0, d.distsKm[0], 0.05)
    }

    @Test fun homeIsEstimatedFromLastStops() {
        val loc = HomeLocator()
        repeat(6) { loc.addDayLastStop(offsetKm(home, 0.01, 0.0)) }
        assertNull(loc.estimate())
        loc.addDayLastStop(shop)
        loc.addDayLastStop(home)
        val h = loc.estimate()
        assertNotNull(h)
        assertTrue(distKm(h!!, home) < DEST_CLUSTER_KM)
    }

    @Test fun storeRoundTripPurgeAndDelete() {
        val f = File.createTempFile("caredrive", ".tsv").apply { delete() }
        val st = DayStore(f)
        st.save(DaySummary(Day(1, 2, 12.0, 3.0, listOf(3.0, 4.5)), Extras(distanceKm = 12.0, destinations = 2, hardBrakes = 1)))
        st.save(DaySummary(Day(500, 1, 6.0, 0.0, emptyList(), excluded = true)))
        st.saveBaseline(Ind(30.0, 0.1, 4.0), 28)
        st.saveHome(home)
        val again = DayStore(f)
        assertEquals(st.load(), again.load())
        assertEquals(Ind(30.0, 0.1, 4.0) to 28, again.baseline)
        again.purge(today = 500)
        assertEquals(listOf(500), again.load().map { it.day.day }) // 400일 지난 기록은 지움
        assertNotNull(again.baseline) // 기준선은 유지
        again.deleteAll()
        assertFalse(f.exists())
        assertTrue(DayStore(f).load().isEmpty())
    }

    /** 집 <-> 가게를 하루 두 번 오가는 40일: 원시 샘플에서 기준선까지, 재시작 복원, 차량 교체, 동의 철회. */
    @Test fun pipelineEndToEnd() {
        val f = File.createTempFile("caredrive", ".tsv").apply { delete() }
        val p = ChronicPipeline(DayStore(f), bookmarkHome = home)
        p.onVehicle("car-1")
        for (day in 0 until 40) {
            val t0 = day * 86_400_000L + 9 * 3_600_000L
            (driveSamples(t0, listOf(home, shop), 30.0) + driveSamples(t0 + 3_600_000, listOf(shop, home), 30.0)).forEach(p::onSample)
            p.endDay(day)
        }
        val base = p.detector.base
        assertNotNull(base)
        assertEquals(56.0, base!!.trips, 0.01) // 하루 2트립 x 28일
        assertEquals(3.0, base.radius!!, 0.05)

        val restored = ChronicPipeline(DayStore(f), bookmarkHome = home) // 앱 재시작
        assertEquals(base, restored.detector.base)
        assertEquals(56, DayStore(f).usualRoutes(39).size) // 최근 28일 x 하루 2트립의 평소 경로가 격자 칸으로 저장됨
        val mon = restored.routeMonitor(40)!!
        val usual = driveSamples(0, listOf(home, shop), 30.0, parkMin = 0).map { mon.add(it) }
        assertFalse(usual.any { it.candidate }) // 평소 길은 후보가 아님

        restored.onVehicle("car-1")
        restored.onVehicle("car-2") // 차량 교체: 재학습
        assertNull(restored.detector.base)

        restored.revokeConsent()
        assertFalse(f.exists())
    }

    @Test fun otherDriverFilterSeparatesDifferentHabits() {
        val rng = Random(7)
        fun trip(ms: Double, p95: Double, dec: Double) =
            Trip(0, 0, 10.0, 0.0, home, 5.0, meanSpeed = ms + rng.nextGaussian() * 4, p95Speed = p95 + rng.nextGaussian() * 6, decelStd = dec + rng.nextGaussian() * 0.15)
        val own = List(60) { trip(32.0, 60.0, 0.8) }
        val filter = OtherDriverFilter.fit(own)!!
        val ownTest = List(500) { trip(32.0, 60.0, 0.8) }.count { filter.isOther(it) }
        val other = List(500) { trip(44.0, 78.0, 1.25) }.count { filter.isOther(it) } // 각 특징이 3 표준편차 다른 운전자
        assertTrue("본인 트립 오판이 많다: $ownTest/500", ownTest <= 25)
        assertTrue("타인 트립을 못 거른다: $other/500", other >= 400)
        assertNull(OtherDriverFilter.fit(own.take(10))) // 20트립 미만이면 학습 안 함
    }
}
