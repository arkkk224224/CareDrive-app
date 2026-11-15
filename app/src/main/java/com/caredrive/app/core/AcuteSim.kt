package com.caredrive.app.core

import java.util.Random
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

// 급성 채널 시뮬레이션: 집과 평소 목적지 4곳, 지난 28일 경로(하루 2번 왕복)를 만들고 장면별로 이탈 감지를 잰다.
// 도로는 격자형(먼저 북쪽 또는 동쪽으로 간 뒤 꺾음)으로 단순화했다. 성능 입증이 아니라 동작 확인용이다.

enum class AcuteScenario(val label: String, val lost: Boolean) {
    USUAL("평소 목적지 · 평소 경로", false),
    USUAL_ALT("평소 목적지 · 다른 길", false),
    NOVEL("처음 가는 목적지", false),
    WRONG_TURN("한 번 길 잘못 듦 (3분 뒤 복귀)", false),
    LOST_WANDER("길 잃고 맴돎", true),
    LOST_AWAY("길 잃고 엉뚱한 방향으로 직진", true),
}

data class AcuteRun(val flagged: Boolean, val minutesToFlag: Double?, val reason: String, val samples: List<Sample>, val deviationStartMs: Long)

class AcuteWorld(seed: Long) {
    private val rng = Random(seed * 6364136223846793005L + 1442695040888963407L)
    val home = LatLon(37.50, 127.00)
    val grid = Grid(home)
    private val dests = List(4) { randomPoint(2.0, 6.0) }
    private val northFirst = List(4) { rng.nextBoolean() }
    val usual = UsualRoutes()

    init {
        for (day in 0 until USUAL_ROUTE_DAYS) repeat(2) {
            val i = rng.nextInt(dests.size)
            val cells = grid.cells(densify(lPath(dests[i], northFirst[i])))
            usual.add(day, cells)
            usual.add(day, cells.reversed())
        }
    }

    private fun randomPoint(minKm: Double, maxKm: Double): Pair<Double, Double> {
        val r = minKm + rng.nextDouble() * (maxKm - minKm)
        val a = rng.nextDouble() * 2 * PI
        return r * cos(a) to r * sin(a)
    }

    private fun at(x: Double, y: Double) = offsetKm(home, x, y)

    private fun lPath(d: Pair<Double, Double>, north: Boolean) =
        if (north) listOf(home, at(0.0, d.second), at(d.first, d.second)) else listOf(home, at(d.first, 0.0), at(d.first, d.second))

    private fun densify(path: List<LatLon>): List<LatLon> = path.zipWithNext().flatMap { (a, b) ->
        val n = maxOf(1, (distKm(a, b) / 0.05).toInt())
        (0 until n).map { k -> LatLon(a.lat + (b.lat - a.lat) * k / n, a.lon + (b.lon - a.lon) * k / n) }
    } + path.last()

    fun run(sc: AcuteScenario, kmh: Double = 30.0): AcuteRun {
        val i = rng.nextInt(dests.size)
        val d = dests[i]
        val north = northFirst[i]
        val usualPath = lPath(d, north)
        val mid = LatLon((usualPath[0].lat + usualPath[1].lat) / 2, (usualPath[0].lon + usualPath[1].lon) / 2)
        val (x0, y0) = if (north) 0.0 to d.second / 2 else d.first / 2 to 0.0
        val legDirX = if (north) 0.0 else 1.0 // 첫 구간 방향에 수직으로 벗어난다
        val sideX = if (north) (if (rng.nextBoolean()) 1.0 else -1.0) else 0.0
        val sideY = if (north) 0.0 else (if (rng.nextBoolean()) 1.0 else -1.0)

        val (before, after) = when (sc) {
            AcuteScenario.USUAL -> usualPath to emptyList()
            AcuteScenario.USUAL_ALT -> lPath(d, !north) to emptyList()
            AcuteScenario.NOVEL -> { val p = randomPoint(3.0, 6.0); lPath(p, rng.nextBoolean()) to emptyList() }
            AcuteScenario.WRONG_TURN -> listOf(home, mid) to listOf(mid, at(x0 + sideX * 0.6, y0 + sideY * 0.6), mid, usualPath[1], usualPath[2])
            AcuteScenario.LOST_WANDER -> listOf(home, mid) to wander(x0 + sideX * 1.2, y0 + sideY * 1.2, mid)
            AcuteScenario.LOST_AWAY -> listOf(home, mid) to listOf(mid, at(x0 + sideX * 10, y0 + sideY * 10))
        }
        val first = driveSamples(0, before, kmh, parkMin = 0, gpsNoiseM = 8.0, rng = rng).dropLast(1)
        val devStart = first.lastOrNull()?.tMs?.plus(1000) ?: 0
        val second = if (after.isEmpty()) emptyList() else driveSamples(devStart, after, kmh, parkMin = 0, gpsNoiseM = 8.0, rng = rng).dropLast(1)
        val samples = first + second

        val mon = RouteMonitor(grid, usual.recent(USUAL_ROUTE_DAYS))
        var flaggedAt: Long? = null
        var reason = ""
        for (s in samples) {
            val st = mon.add(s)
            if (st.candidate && flaggedAt == null) { flaggedAt = s.tMs; reason = st.reason }
        }
        val start = if (after.isEmpty()) 0 else devStart
        return AcuteRun(flaggedAt != null, flaggedAt?.let { (it - start) / 60_000.0 }, reason, samples, start)
    }

    /** 1.2km 옆으로 빠진 뒤, 0.4~0.8km마다 아무 방향으로나 꺾으며 25분쯤 맴돈다(왔던 길로 바로 되돌아가지는 않음). */
    private fun wander(sx: Double, sy: Double, from: LatLon): List<LatLon> {
        val pts = mutableListOf(from, at(sx, sy))
        var x = sx
        var y = sy
        var dir = rng.nextInt(4)
        var km = 0.0
        while (km < 12.0) {
            dir = (dir + listOf(1, 3, 0)[rng.nextInt(3)]) % 4 // 좌·우·직진
            val len = 0.4 + rng.nextDouble() * 0.4
            when (dir) { 0 -> y += len; 1 -> x += len; 2 -> y -= len; else -> x -= len }
            if (hypot(x - sx, y - sy) > 3.0) { dir = (dir + 2) % 4 } // 너무 멀어지면 되돌아오는 쪽으로
            pts += at(x, y)
            km += len
        }
        return pts
    }
}

/** 장면별 n번 반복: (감지 비율, 감지까지 걸린 시간의 중앙값(분)). 평소 이동은 트립 시작부터, 길 잃음은 이탈 시작부터 잰다. */
fun evaluateAcute(sc: AcuteScenario, n: Int): Pair<Double, Double?> {
    val runs = (1..n).map { AcuteWorld(it.toLong()).run(sc) }
    val times = runs.mapNotNull { it.minutesToFlag }.sorted()
    return runs.count { it.flagged }.toDouble() / n to times.getOrNull(times.size / 2)
}
