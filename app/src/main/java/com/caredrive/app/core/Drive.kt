package com.caredrive.app.core

import java.util.Random
import kotlin.math.ceil
import kotlin.math.min

// 합성 주행 신호: 경유지를 따라 1초 간격 샘플을 만든다. 파이프라인 테스트, 급성 채널 시뮬레이션, 시연 콘솔에서 쓴다.

/**
 * path를 따라 kmh로 달린 뒤 parkMin분 주차한다. signalAtCorners면 꺾이는 지점 6초 전부터 방향지시등을 켠다.
 * gpsNoiseM > 0이면 위치에 흔들림을 넣는다.
 */
fun driveSamples(
    t0: Long,
    path: List<LatLon>,
    kmh: Double,
    headlight: Boolean = false,
    parkMin: Int = 10,
    signalAtCorners: Boolean = false,
    gpsNoiseM: Double = 0.0,
    rng: Random = Random(0),
): List<Sample> {
    val out = ArrayList<Sample>()
    var t = t0
    val mps = kmh / 3.6
    fun noisy(p: LatLon) = if (gpsNoiseM <= 0) p else offsetKm(p, rng.nextGaussian() * gpsNoiseM / 1000, rng.nextGaussian() * gpsNoiseM / 1000)
    for (i in 0 until path.size - 1) {
        val a = path[i]
        val b = path[i + 1]
        val n = maxOf(1, ceil(distKm(a, b) * 1000 / mps).toInt())
        for (k in 0 until n) {
            val f = k.toDouble() / n
            val p = LatLon(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f)
            val ramp = if (i == 0) min(1.0, (k + 1) / 5.0) else 1.0 // 출발 5초 가속
            val corner = signalAtCorners && i + 1 < path.size - 1 && n - k <= 6
            out += Sample(t, kmh * ramp, parked = false, headlight = headlight, pos = noisy(p), turnSignal = corner)
            t += 1000
        }
    }
    val end = path.last()
    out += Sample(t, 0.0, parked = false, headlight = headlight, pos = end); t += 1000
    repeat(parkMin * 60) { out += Sample(t, 0.0, parked = true, headlight = false, pos = end); t += 1000 }
    return out
}
