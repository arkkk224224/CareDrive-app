package com.caredrive.app.core

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max

// 급성 채널 이탈 감지: 지금 달리는 궤적을 평소 경로 집합(지난 28일)과 비교한다.
// 위치는 약 200m 격자 칸 순서로만 다룬다(정밀 궤적은 저장하지 않음).
// 이탈 후보 = ① 최근 15분 중 평소 경로에서 1km 이상 벗어난 시간이 누적 10분 이상(다른 평소 길을 잠깐 가로질러도 리셋되지 않게)
//          ② 한 트립 재탐색 3회 이상
//          ③ 접두 구간 정렬 이상도 0.4 이상 + 같은 구역을 맴돎(진행 방향 엔트로피 2비트 이상)이 3분 이상 유지(한 번 잘못 든 길은 제외)
//          ④ 평소 가장 먼 곳보다 2km 이상 더 멀리 감(다른 평소 길과 나란히 엉뚱한 방향으로 계속 가는 경우)

const val CELL_KM = 0.2
const val SW_ANOMALY = 0.4
const val ENTROPY_BITS = 2.0
const val ENTROPY_WINDOW_MS = 10 * 60_000L
const val OFF_WINDOW_MS = 15 * 60_000L
const val SW_HOLD_MS = 3 * 60_000L
const val BEYOND_USUAL_KM = 2.0
const val MIN_PREFIX_CELLS = 10 // 2km 이상 달린 뒤부터 정렬 이상도를 본다
const val USUAL_ROUTE_DAYS = 28
const val MIN_USUAL_ROUTES = 5

data class Cell(val x: Int, val y: Int)

class Grid(private val origin: LatLon) {
    fun cell(p: LatLon): Cell {
        val east = distKm(origin, LatLon(origin.lat, p.lon)) * (if (p.lon >= origin.lon) 1 else -1)
        val north = distKm(origin, LatLon(p.lat, origin.lon)) * (if (p.lat >= origin.lat) 1 else -1)
        return Cell(floor(east / CELL_KM).toInt(), floor(north / CELL_KM).toInt())
    }

    fun cells(points: List<LatLon>): List<Cell> = points.map(::cell).fold(mutableListOf()) { acc, c -> if (acc.lastOrNull() != c) acc += c; acc }
}

/** 접두 구간 정렬(Smith-Waterman): 미완성 궤적을 평소 경로의 어느 부분과든 맞춰 보고, 궤적 길이로 나눈 유사도(0~1)를 돌려준다. */
fun prefixSimilarity(prefix: List<Cell>, route: List<Cell>): Double {
    if (prefix.isEmpty() || route.isEmpty()) return 0.0
    var prev = IntArray(route.size + 1)
    var best = 0
    for (i in 1..prefix.size) {
        val cur = IntArray(route.size + 1)
        for (j in 1..route.size) {
            val near = max(abs(prefix[i - 1].x - route[j - 1].x), abs(prefix[i - 1].y - route[j - 1].y)) <= 1
            cur[j] = maxOf(0, prev[j - 1] + if (near) 2 else -1, prev[j] - 1, cur[j - 1] - 1)
            if (cur[j] > best) best = cur[j]
        }
        prev = cur
    }
    return best / (2.0 * prefix.size)
}

/** 진행 방향(8방위)의 섀넌 엔트로피(비트). 직진 0, 한 번 꺾으면 약 1, 맴돌면 2 이상. */
fun headingEntropy(points: List<LatLon>): Double {
    val bins = IntArray(8)
    var from: LatLon? = null
    for (p in points) {
        val f = from
        if (f == null) { from = p; continue }
        if (distKm(f, p) < 0.05) continue
        bins[((bearingDeg(f, p) + 22.5) % 360 / 45).toInt()]++
        from = p
    }
    val n = bins.sum().toDouble()
    if (n == 0.0) return 0.0
    return -bins.filter { it > 0 }.sumOf { (it / n) * ln(it / n) / ln(2.0) }
}

/** 지난 28일의 트립 궤적(격자 칸 순서). */
class UsualRoutes {
    private val routes = mutableListOf<Pair<Int, List<Cell>>>()

    fun add(day: Int, cells: List<Cell>) { if (cells.size >= 2) routes += day to cells }

    fun recent(today: Int) = routes.filter { today - it.first < USUAL_ROUTE_DAYS }.map { it.second }

    fun purge(today: Int) { routes.removeAll { today - it.first >= USUAL_ROUTE_DAYS } }

    fun all() = routes.toList()
}

data class RouteStatus(
    val offRouteKm: Double,
    val offRouteMin: Double,
    val anomaly: Double,
    val entropyBits: Double,
    val reroutes: Int,
    val candidate: Boolean,
    val reason: String,
)

/** 한 트립 동안 샘플을 받아 이탈 후보인지 판단한다. 트립마다 새로 만든다. */
class RouteMonitor(private val grid: Grid, usual: List<List<Cell>>) {
    private val routes = usual
    private val usualCells = usual.flatten().toHashSet()
    private val maxUsualKm = usualCells.maxOfOrNull { hypot(it.x.toDouble(), it.y.toDouble()) * CELL_KM } ?: 0.0
    private val prefix = mutableListOf<Cell>()
    private val recent = ArrayDeque<Pair<Long, LatLon>>()
    private val offLog = ArrayDeque<Pair<Long, Boolean>>() // (시각, 1km 이상 벗어났는지)
    private var swSince: Long? = null
    private var lastOff = 0.0
    private var reroutes = 0
    private var anomaly = 0.0
    var status = RouteStatus(0.0, 0.0, 0.0, 0.0, 0, false, "")
        private set

    /** NaviHelper TBT 회전 안내와 실제 회전이 달라 재탐색이 일어났을 때 호출. */
    fun onReroute() { reroutes++ }

    fun add(s: Sample): RouteStatus {
        val c = grid.cell(s.pos)
        val newCell = prefix.lastOrNull() != c
        if (newCell) prefix += c
        recent.addLast(s.tMs to s.pos)
        while (s.tMs - recent.first().first > ENTROPY_WINDOW_MS) recent.removeFirst()

        if (newCell) lastOff = offRouteKm(c)
        val off = lastOff
        offLog.addLast(s.tMs to (off >= OFFROUTE_M / 1000.0))
        while (s.tMs - offLog.first().first > OFF_WINDOW_MS) offLog.removeFirst()
        val offMin = offLog.zipWithNext().sumOf { (a, b) -> if (a.second) minOf(b.first - a.first, MAX_GAP_MS) else 0L } / 60_000.0

        if (newCell && prefix.size >= MIN_PREFIX_CELLS && routes.size >= MIN_USUAL_ROUTES) {
            anomaly = 1 - routes.maxOf { prefixSimilarity(prefix.takeLast(150), it) }
        }
        val entropy = headingEntropy(recent.map { it.second })
        if (anomaly >= SW_ANOMALY && entropy >= ENTROPY_BITS) { if (swSince == null) swSince = s.tMs } else swSince = null
        val circling = swSince?.let { s.tMs - it >= SW_HOLD_MS } ?: false

        val reason = when {
            routes.size < MIN_USUAL_ROUTES -> ""
            isDeviation(offrouteM = (off * 1000).toInt(), offrouteMin = offMin.toInt()) -> "평소 경로에서 ${"%.1f".format(off)}km 벗어난 채 ${offMin.toInt()}분"
            reroutes >= REROUTES -> "경로 재탐색 ${reroutes}회"
            fromHome(c) >= maxUsualKm + BEYOND_USUAL_KM -> "평소 가장 먼 곳보다 ${"%.1f".format(fromHome(c) - maxUsualKm)}km 더 멀리 감"
            circling -> "평소 경로와 다른 길에서 맴돎(이상도 ${"%.2f".format(anomaly)})"
            else -> ""
        }
        status = RouteStatus(off, offMin, anomaly, entropy, reroutes, reason.isNotEmpty(), reason)
        return status
    }

    private fun fromHome(c: Cell) = hypot(c.x.toDouble(), c.y.toDouble()) * CELL_KM // 격자 원점 = 집

    private fun offRouteKm(c: Cell): Double {
        if (usualCells.isEmpty() || c in usualCells) return 0.0
        return usualCells.minOf { hypot((it.x - c.x).toDouble(), (it.y - c.y).toDouble()) } * CELL_KM
    }
}
