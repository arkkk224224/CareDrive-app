package com.caredrive.app.core

import java.io.File

// 차량 안 저장소: 하루 요약만 저장한다(원시 위치·센서 로그는 저장하지 않음).
// 보존 기간이 지난 요약은 지우고, 부모가 동의를 철회하면 전부 지운다(Pleos 심사 요건).
// 기준선은 고정값이라 오래된 요약을 지워도 유지되도록 따로 저장한다.

const val RETENTION_DAYS = 400 // 고정 기준선 + 1년 계절 비교에 필요한 기간

class DayStore(private val file: File) {
    private var days = sortedMapOf<Int, DaySummary>()
    var baseline: Pair<Ind, Int>? = null
        private set
    var filter: OtherDriverFilter? = null
        private set
    var home: LatLon? = null
        private set
    private val routes = mutableListOf<Pair<Int, List<Cell>>>() // 평소 경로(격자 칸 순서), 28일만 보관

    init { read() }

    fun load(): List<DaySummary> = days.values.toList()

    fun save(s: DaySummary) { days[s.day.day] = s; write() }

    /** 보존 기간이 지난 하루 요약을 지운다. */
    fun purge(today: Int, keepDays: Int = RETENTION_DAYS) {
        days.keys.filter { it <= today - keepDays }.forEach { days.remove(it) }
        routes.removeAll { today - it.first >= USUAL_ROUTE_DAYS }
        write()
    }

    fun saveRoute(day: Int, cells: List<Cell>) { if (cells.size >= 2) { routes += day to cells; write() } }

    /** 평소 경로 집합(최근 28일). */
    fun usualRoutes(today: Int) = UsualRoutes().also { u -> routes.forEach { (d, c) -> u.add(d, c) } }.recent(today)

    fun saveBaseline(ind: Ind, day: Int) { baseline = ind to day; write() }
    fun clearBaseline() { baseline = null; filter = null; write() }
    fun saveFilter(f: OtherDriverFilter) { filter = f; write() }
    fun saveHome(p: LatLon) { home = p; write() }

    /** 동의 철회: 저장된 모든 기록을 즉시 지운다. */
    fun deleteAll() {
        days.clear(); routes.clear(); baseline = null; filter = null; home = null
        file.delete()
    }

    private fun write() {
        val lines = mutableListOf<String>()
        baseline?.let { (b, d) -> lines += listOf("B", d, b.trips, b.night, b.radius).joinToString("\t") }
        filter?.let { f -> lines += "F\t" + (f.mean.toList() + f.inv.flatMap { it.toList() }).joinToString(",") }
        home?.let { lines += "H\t${it.lat}\t${it.lon}" }
        for ((d, c) in routes) lines += "R	$d	" + c.joinToString(";") { "${it.x}:${it.y}" }
        for (s in days.values) {
            val d = s.day
            val e = s.extras
            lines += listOf(
                "D", d.day, d.trips, d.driveMin, d.nightMin, if (d.excluded) 1 else 0,
                d.distsKm.joinToString(",").ifEmpty { "-" },
                e.distanceKm, e.destinations, e.hardBrakes, e.sharpSteers, e.safetyWarnings, e.turns, e.signaledTurns, e.highwayMin, e.otherDriverTrips,
            ).joinToString("\t")
        }
        file.parentFile?.mkdirs()
        file.writeText(lines.joinToString("\n"))
    }

    private fun read() {
        if (!file.exists()) return
        for (line in file.readLines()) {
            val c = line.split("\t")
            when (c[0]) {
                "B" -> baseline = Ind(c[2].toDouble(), c[3].toDoubleOrNull(), c[4].toDoubleOrNull()) to c[1].toInt()
                "F" -> {
                    val v = c[1].split(",").map { it.toDouble() }
                    filter = OtherDriverFilter(v.take(3).toDoubleArray(), Array(3) { i -> v.subList(3 + i * 3, 6 + i * 3).toDoubleArray() })
                }
                "R" -> routes += c[1].toInt() to c[2].split(";").map { val (x, y) = it.split(":"); Cell(x.toInt(), y.toInt()) }
                "H" -> home = LatLon(c[1].toDouble(), c[2].toDouble())
                "D" -> {
                    val dists = if (c[6] == "-") emptyList() else c[6].split(",").map { it.toDouble() }
                    val day = Day(c[1].toInt(), c[2].toInt(), c[3].toDouble(), c[4].toDouble(), dists, c[5] == "1")
                    days[day.day] = DaySummary(
                        day,
                        Extras(c[7].toDouble(), c[8].toInt(), c[9].toInt(), c[10].toInt(), c[11].toInt(), c[12].toInt(), c[13].toInt(), c[14].toDouble(), c[15].toInt()),
                    )
                }
            }
        }
    }
}
