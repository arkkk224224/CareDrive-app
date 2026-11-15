package com.caredrive.app.core

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

data class LatLon(val lat: Double, val lon: Double)

/** 두 지점 사이 거리(km, haversine). */
fun distKm(a: LatLon, b: LatLon): Double {
    val dLat = Math.toRadians(b.lat - a.lat)
    val dLon = Math.toRadians(b.lon - a.lon)
    val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLon / 2).pow(2)
    return 2 * 6371.0 * asin(sqrt(h))
}

/** a에서 b로 가는 진행 방향(0~360도, 북=0). */
fun bearingDeg(a: LatLon, b: LatLon): Double {
    val la = Math.toRadians(a.lat)
    val lb = Math.toRadians(b.lat)
    val dLon = Math.toRadians(b.lon - a.lon)
    val y = sin(dLon) * cos(lb)
    val x = cos(la) * sin(lb) - sin(la) * cos(lb) * cos(dLon)
    return (Math.toDegrees(atan2(y, x)) + 360) % 360
}

/** 두 방향의 차이(0~180도). */
fun angleDiff(a: Double, b: Double): Double {
    var d = (b - a) % 360
    if (d > 180) d -= 360
    if (d < -180) d += 360
    return abs(d)
}

/** 기준점에서 동쪽 x km, 북쪽 y km 떨어진 지점(짧은 거리용 근사). */
fun offsetKm(origin: LatLon, xKm: Double, yKm: Double) =
    LatLon(origin.lat + yKm / 110.574, origin.lon + xKm / (111.320 * cos(Math.toRadians(origin.lat))))

/** 반경 안의 점을 하나로 묶는 단순 군집화(욕심쟁이 방식). 군집 중심 목록을 돌려준다. */
fun clusters(points: List<LatLon>, radiusKm: Double): List<Pair<LatLon, Int>> {
    val out = mutableListOf<Pair<LatLon, Int>>()
    for (p in points) {
        val i = out.indexOfFirst { distKm(it.first, p) <= radiusKm }
        if (i < 0) out += p to 1 else out[i] = out[i].first to out[i].second + 1
    }
    return out
}
