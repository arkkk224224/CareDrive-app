package com.caredrive.app.core

import java.util.Random
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min

// 합성 주행 데이터. 성능 입증이 아니라 '규칙이 의도대로 동작하는지' 시연·확인용이다.
// 값은 reference/caredrive/sim.py와 같다(하루 0.9트립, 트립 20분, 평균 8km).
const val SIM_DAYS = 365
const val ONSET = 140 // 감소 시작일

enum class Scenario(val label: String, val mult: (Int) -> Triple<Double, Double, Double>) {
    NORMAL("정상 유지", { Triple(1.0, 1.0, 1.0) }),
    GRADUAL("완만한 감소 (주 5%)", { d ->
        val m = max(0.4, 1 - 0.05 * max(0, d - ONSET) / 7.0)
        Triple(m, m, m)
    }),
    ABRUPT("급감 후 유지 (-40%)", { d -> if (d >= ONSET) Triple(0.6, 0.6, 0.6) else Triple(1.0, 1.0, 1.0) }),
    TRIPS_ONLY("운전 횟수만 감소 (-40%)", { d -> if (d >= ONSET) Triple(0.6, 1.0, 1.0) else Triple(1.0, 1.0, 1.0) }),
}

private fun Random.poisson(lam: Double): Int {
    val l = exp(-lam)
    var k = 0
    var p = 1.0
    while (true) {
        p *= nextDouble()
        if (p <= l) return k
        k++
    }
}

private fun Random.lognormal(mu: Double, sigma: Double) = exp(mu + sigma * nextGaussian())

/** 현실 노이즈 포함: 주별 편차, 월별 생활범위 변동, 7~21일 쉬는 구간(자녀가 태그하지 않음). */
fun makeDays(seed: Long, scenario: Scenario): List<Day> = makeDays(seed, SIM_DAYS, scenario.mult)

fun makeDays(seed: Long, nDays: Int, mult: (Int) -> Triple<Double, Double, Double>): List<Day> {
    val rng = Random(seed * 6364136223846793005L + 1442695040888963407L) // 연속된 작은 시드는 첫 난수가 닮아 섞는다
    val sick = HashSet<Int>()
    repeat(rng.poisson(1.5)) {
        val st = rng.nextInt(nDays)
        val len = 7 + rng.nextInt(15)
        for (i in st until st + len) sick += i
    }
    var week = 1.0
    var drift = 1.0
    return (0 until nDays).map { day ->
        if (day % 7 == 0) week = rng.lognormal(0.0, 0.3)
        if (day % 28 == 0) drift = rng.lognormal(0.0, 0.1)
        val (mt, mn, md) = mult(day)
        val n = if (day in sick) 0 else rng.poisson(0.9 * mt * week)
        var drive = 0.0
        var night = 0.0
        val dists = ArrayList<Double>()
        repeat(n) {
            val dur = 20.0 * rng.lognormal(0.0, 0.4)
            drive += dur
            if (rng.nextDouble() < min(1.0, 0.12 * mn)) night += dur
            dists += 8.0 * md * drift * rng.lognormal(-0.18, 0.6)
        }
        Day(day, n, drive, night, dists)
    }
}

/** 차트용 결과: 기준선 대비 비율(1.0 = 기준선), 알림이 울린 날. */
class Trace(
    val tripsRatio: FloatArray,
    val nightRatio: FloatArray,
    val radiusRatio: FloatArray,
    val alertDays: List<Int>,
    val baseDay: Int?,
    val baseNight: Double?,
)

fun runScenario(seed: Long, scenario: Scenario): Trace {
    val det = Detector()
    val t = FloatArray(SIM_DAYS) { Float.NaN }
    val n = FloatArray(SIM_DAYS) { Float.NaN }
    val r = FloatArray(SIM_DAYS) { Float.NaN }
    val alerts = ArrayList<Int>()
    for (d in makeDays(seed, scenario)) {
        if (det.update(d) == Stage.ALERT) alerts += d.day
        val b = det.base
        val c = det.current
        if (b != null && c != null) {
            t[d.day] = (c.trips / b.trips).toFloat()
            n[d.day] = ((c.night ?: 0.0) / b.night!!).toFloat()
            r[d.day] = ((c.radius ?: 0.0) / b.radius!!).toFloat()
        }
    }
    return Trace(t, n, r, alerts, det.baseDay, det.base?.night)
}

/**
 * 타인 운전이 섞인 합성 데이터. 부모 트립은 시나리오대로 줄지만, 다른 가족(하루 평균 otherPerDay트립)은 평소대로 탄다.
 * 다른 가족은 야간 운전을 안 하고 더 멀리 가며, 조작 특징이 각 축에서 shiftSigma 표준편차만큼 다르다.
 * useFilter면 학습 기간(첫 28일)의 모든 트립(타인 포함)으로 필터를 맞춘 뒤 집계에서 뺀다.
 */
fun makeMixedDays(seed: Long, scenario: Scenario, otherPerDay: Double, shiftSigma: Double, useFilter: Boolean): List<Day> {
    val rng = Random(seed * 6364136223846793005L + 1442695040888963407L)
    val home = LatLon(37.5, 127.0)
    val sd = doubleArrayOf(4.0, 6.0, 0.15)
    val own = doubleArrayOf(32.0, 60.0, 0.8)
    fun trip(dist: Double, night: Boolean, shift: Double): Trip {
        val dur = 20.0 * rng.lognormal(0.0, 0.4)
        val f = DoubleArray(3) { own[it] + shift * sd[it] + rng.nextGaussian() * sd[it] }
        return Trip(0, 0, dur, if (night) dur else 0.0, offsetKm(home, dist, 0.0), dist, meanSpeed = f[0], p95Speed = f[1], decelStd = f[2])
    }
    var week = 1.0
    val perDay = (0 until SIM_DAYS).map { day ->
        if (day % 7 == 0) week = rng.lognormal(0.0, 0.3)
        val (mt, mn, md) = scenario.mult(day)
        val mine = List(rng.poisson(0.9 * mt * week)) { trip(8.0 * md * rng.lognormal(-0.18, 0.6), rng.nextDouble() < 0.12 * mn, 0.0) }
        val others = List(rng.poisson(otherPerDay * week)) { trip(16.0 * rng.lognormal(-0.18, 0.6), false, shiftSigma) }
        mine + others
    }
    val filter = if (useFilter) OtherDriverFilter.fit(perDay.take(WINDOW).flatten()) else null
    return perDay.mapIndexed { day, ts -> buildDay(day, ts, home) { filter?.isOther(it) == true }.day }
}

fun alertsOf(days: List<Day>, seasonal: Boolean = false): List<Int> {
    val det = Detector(seasonal)
    return days.filter { det.update(it) == Stage.ALERT }.map { it.day }
}
