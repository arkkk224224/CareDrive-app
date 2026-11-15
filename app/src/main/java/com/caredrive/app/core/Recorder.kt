package com.caredrive.app.core

import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sqrt

// 일별 기록: 차량 신호 샘플 -> 트립 -> 하루 요약(Day + 기록 전용 탐색 지표).
// 원시 샘플은 트립이 끝나면 버리고 트립 요약만 남긴다(기획서: 원시 로그는 일 단위 요약 후 폐기).

const val STOP_SPLIT_MS = 5 * 60_000L // 주차 브레이크(또는 P단) + 정지가 5분 이어지면 트립 분할
const val MOVING_KMH = 3.0
const val MAX_GAP_MS = 10_000L // 샘플이 끊긴 구간은 10초까지만 주행 시간으로 센다
const val HARD_BRAKE_MS2 = 3.0 // 급제동: 감속 3 m/s² 이상
const val SHARP_STEER_DEG_S = 90.0 // 급조향: 조향 각속도 90도/초 이상
const val HIGHWAY_KMH = 80.0 // 고속도로 주행 근사
const val TURN_DEG = 60.0 // 8초 사이 진행 방향이 60도 이상 바뀌면 회전
const val HOME_RADIUS_KM = 0.3 // 집 근처에서 끝난 트립은 이동 반경 계산에서 뺀다
const val DEST_CLUSTER_KM = 0.15 // 목적지 다양성: 반경 150m로 묶은 고유 정차 지점

/** 차량 신호 한 시점. SDK 연동 시 Vehicle(Brake·Light·Steeringwheel·TurnSignal·Safety), FusedLocation, AAOS 속도로 채운다. */
data class Sample(
    val tMs: Long,
    val speedKmh: Double,
    val parked: Boolean, // 주차 브레이크 체결 또는 P단
    val headlight: Boolean,
    val pos: LatLon,
    val steeringDegPerS: Double = 0.0,
    val turnSignal: Boolean = false,
    val safetyWarning: Boolean = false,
)

data class Trip(
    val startMs: Long,
    val endMs: Long,
    val driveMin: Double,
    val nightMin: Double,
    val end: LatLon,
    val distanceKm: Double,
    val hardBrakes: Int = 0,
    val sharpSteers: Int = 0,
    val safetyWarnings: Int = 0,
    val turns: Int = 0,
    val signaledTurns: Int = 0,
    val highwayMin: Double = 0.0,
    val meanSpeed: Double = 0.0,
    val p95Speed: Double = 0.0,
    val decelStd: Double = 0.0,
    val path: List<LatLon> = emptyList(), // 100m 간격 경유점(평소 경로 학습용, 저장할 때는 격자 칸으로 바꾼다)
) {
    /** 타인 운전 판별용 조작 특징(평균 속도, 상위 5% 속도, 감속 크기의 표준편차). */
    fun features() = doubleArrayOf(meanSpeed, p95Speed, decelStd)
}

class TripSegmenter {
    private var acc: Acc? = null
    private var prev: Sample? = null
    private var stopStart: Long? = null

    /** 샘플을 넣는다. 트립이 끝나면 그 트립을 돌려준다. */
    fun add(s: Sample): Trip? {
        val p = prev
        prev = s
        val a = acc
        if (a == null) {
            if (s.speedKmh >= MOVING_KMH) acc = Acc(s)
            return null
        }
        if (s.parked && s.speedKmh < 1.0) {
            val st = stopStart ?: s.tMs.also { stopStart = it }
            if (s.tMs - st >= STOP_SPLIT_MS) {
                acc = null; stopStart = null
                return a.finish(st)
            }
            return null // 정차 중에는 주행 시간에 넣지 않는다
        }
        stopStart = null
        if (p != null) a.step(p, s, min(s.tMs - p.tMs, MAX_GAP_MS))
        return null
    }

    /** 하루가 끝나거나 시동이 꺼졌을 때 진행 중인 트립을 마감한다. */
    fun flush(): Trip? {
        val a = acc ?: return null
        acc = null
        val end = stopStart ?: prev?.tMs ?: a.start
        stopStart = null
        return a.finish(end)
    }

    private class Acc(first: Sample) {
        val start = first.tMs
        var last = first.pos
        var bearingFrom = first.pos
        var driveMs = 0L
        var nightMs = 0L
        var highwayMs = 0L
        var dist = 0.0
        var hardBrakes = 0
        var sharpSteers = 0
        var warnings = 0
        var turns = 0
        var signaled = 0
        var lastBrake = Long.MIN_VALUE / 2
        var lastSteer = Long.MIN_VALUE / 2
        var lastTurn = Long.MIN_VALUE / 2
        var lastSignal = Long.MIN_VALUE / 2
        var prevWarning = first.safetyWarning
        val speeds = ArrayList<Double>()
        val decels = ArrayList<Double>()
        val headings = ArrayDeque<Pair<Long, Double>>()
        val path = mutableListOf(first.pos)

        fun step(p: Sample, s: Sample, dt: Long) {
            driveMs += dt
            if (s.headlight) nightMs += dt
            if (s.speedKmh >= HIGHWAY_KMH) highwayMs += dt
            if (s.speedKmh >= MOVING_KMH) speeds += s.speedKmh
            dist += distKm(last, s.pos)
            last = s.pos
            if (distKm(path.last(), s.pos) >= 0.1) path += s.pos

            if (dt > 0) {
                val accel = (s.speedKmh - p.speedKmh) / 3.6 / (dt / 1000.0)
                if (accel < 0) decels += -accel
                if (accel <= -HARD_BRAKE_MS2 && s.tMs - lastBrake > 3000) { hardBrakes++; lastBrake = s.tMs }
            }
            if (abs(s.steeringDegPerS) >= SHARP_STEER_DEG_S && s.tMs - lastSteer > 3000) { sharpSteers++; lastSteer = s.tMs }
            if (s.safetyWarning && !prevWarning) warnings++
            prevWarning = s.safetyWarning
            if (s.turnSignal) lastSignal = s.tMs

            if (distKm(bearingFrom, s.pos) >= 0.02) { // 20m 이상 움직였을 때만 방향을 잰다(GPS 흔들림 방지)
                headings.addLast(s.tMs to bearingDeg(bearingFrom, s.pos))
                bearingFrom = s.pos
                while (headings.size > 1 && s.tMs - headings.first().first > 8_000) headings.removeFirst()
                val change = angleDiff(headings.first().second, headings.last().second)
                if (change >= TURN_DEG && s.tMs - lastTurn > 15_000) {
                    turns++
                    if (s.tMs - lastSignal <= 8_000) signaled++
                    lastTurn = s.tMs
                }
            }
        }

        fun finish(endMs: Long): Trip {
            val sorted = speeds.sorted()
            val mean = decels.average().takeIf { !it.isNaN() } ?: 0.0
            val sd = if (decels.size > 1) sqrt(decels.sumOf { (it - mean) * (it - mean) } / (decels.size - 1)) else 0.0
            return Trip(
                startMs = start, endMs = endMs, driveMin = driveMs / 60_000.0, nightMin = nightMs / 60_000.0,
                end = last, distanceKm = dist, hardBrakes = hardBrakes, sharpSteers = sharpSteers,
                safetyWarnings = warnings, turns = turns, signaledTurns = signaled, highwayMin = highwayMs / 60_000.0,
                meanSpeed = if (sorted.isEmpty()) 0.0 else sorted.average(),
                p95Speed = if (sorted.isEmpty()) 0.0 else sorted[((sorted.size - 1) * 0.95).toInt()],
                decelStd = sd,
                path = path + last,
            )
        }
    }
}

/** 기록 전용 탐색 지표(알림 조건 아님). */
data class Extras(
    val distanceKm: Double = 0.0,
    val destinations: Int = 0,
    val hardBrakes: Int = 0,
    val sharpSteers: Int = 0,
    val safetyWarnings: Int = 0,
    val turns: Int = 0,
    val signaledTurns: Int = 0,
    val highwayMin: Double = 0.0,
    val otherDriverTrips: Int = 0, // 타인 운전으로 판별돼 집계에서 뺀 트립 수
)

data class DaySummary(val day: Day, val extras: Extras = Extras())

/** 하루의 트립들 -> 하루 요약. 타인 운전으로 판별된 트립은 판정 집계에서 뺀다. */
fun buildDay(day: Int, trips: List<Trip>, home: LatLon?, excluded: Boolean = false, isOther: (Trip) -> Boolean = { false }): DaySummary {
    val own = trips.filterNot(isOther)
    val dists = if (home == null) emptyList() else own.map { distKm(home, it.end) }.filter { it > HOME_RADIUS_KM }
    return DaySummary(
        Day(day, own.size, own.sumOf { it.driveMin }, own.sumOf { it.nightMin }, dists, excluded),
        Extras(
            distanceKm = own.sumOf { it.distanceKm },
            destinations = clusters(own.map { it.end }, DEST_CLUSTER_KM).size,
            hardBrakes = own.sumOf { it.hardBrakes },
            sharpSteers = own.sumOf { it.sharpSteers },
            safetyWarnings = own.sumOf { it.safetyWarnings },
            turns = own.sumOf { it.turns },
            signaledTurns = own.sumOf { it.signaledTurns },
            highwayMin = own.sumOf { it.highwayMin },
            otherDriverTrips = trips.size - own.size,
        ),
    )
}

/** 집 추정: NaviHelper 즐겨찾기 "집"이 없을 때, 하루의 마지막 정차 지점이 가장 많이 모이는 곳. */
class HomeLocator {
    private val lastStops = mutableListOf<LatLon>()

    fun addDayLastStop(p: LatLon) { lastStops += p }

    /** 7일 이상 모였고 그중 절반 이상이 한 곳에 모이면 그곳을 집으로 본다. */
    fun estimate(minDays: Int = 7): LatLon? {
        if (lastStops.size < minDays) return null
        val best = clusters(lastStops, DEST_CLUSTER_KM).maxBy { it.second }
        return if (best.second * 2 >= lastStops.size) best.first else null
    }
}

/** 최근 기록의 탐색 지표 요약(100km당 횟수, 비율). 기준선 대비 변화만 기록하고 알림에는 쓰지 않는다. */
fun exploratory(window: List<DaySummary>): Map<String, Double> {
    val km = window.sumOf { it.extras.distanceKm }.coerceAtLeast(1e-9)
    val drive = window.sumOf { it.day.driveMin }.coerceAtLeast(1e-9)
    val turns = window.sumOf { it.extras.turns }
    val daily = window.filter { !it.day.excluded }.map { it.extras.distanceKm }
    val mean = daily.average().takeIf { !it.isNaN() } ?: 0.0
    return mapOf(
        "급제동/100km" to window.sumOf { it.extras.hardBrakes } * 100 / km,
        "급조향/100km" to window.sumOf { it.extras.sharpSteers } * 100 / km,
        "안전경고/100km" to window.sumOf { it.extras.safetyWarnings } * 100 / km,
        "방향지시등 사용률" to if (turns == 0) 0.0 else window.sumOf { it.extras.signaledTurns }.toDouble() / turns,
        "고속도로 비율" to window.sumOf { it.extras.highwayMin } / drive,
        "일별 주행거리 표준편차(km)" to if (daily.size < 2) 0.0 else sqrt(daily.sumOf { (it - mean) * (it - mean) } / (daily.size - 1)),
        "하루 평균 목적지 수" to window.map { it.extras.destinations }.average().takeIf { !it.isNaN() }.let { it ?: 0.0 },
    )
}
