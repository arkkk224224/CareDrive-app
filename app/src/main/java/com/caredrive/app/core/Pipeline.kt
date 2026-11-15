package com.caredrive.app.core

// 만성 채널 전체 흐름: 차량 신호 -> 트립 -> 하루 요약 저장 -> 판정.
// SDK 연동 시 onSample()에 Vehicle·FusedLocation·AAOS 값을, onVehicle()에 차량 ID를 넣는다.

class ChronicPipeline(private val store: DayStore, var bookmarkHome: LatLon? = null) {
    val detector = Detector()
    private val segmenter = TripSegmenter()
    private val todayTrips = mutableListOf<Trip>()
    private val learnTrips = mutableListOf<Trip>() // 타인 운전 필터 학습용(기준선 학습 기간에만, 메모리에만)
    private val homeLocator = HomeLocator()
    private var vehicleId: String? = null

    init { restore() }

    val home: LatLon? get() = bookmarkHome ?: store.home

    /** 차량 ID가 바뀌면(차량 교체) 기준선을 다시 학습한다. */
    fun onVehicle(id: String) {
        if (vehicleId != null && id != vehicleId) relearn()
        vehicleId = id
    }

    fun onSample(s: Sample) { segmenter.add(s)?.let { todayTrips += it } }

    /** 하루를 마감한다. excluded = 자녀가 여행·입원 등으로 태그한 날. */
    fun endDay(day: Int, excluded: Boolean = false): Stage {
        segmenter.flush()?.let { todayTrips += it }
        todayTrips.lastOrNull()?.let { homeLocator.addDayLastStop(it.end) }
        if (home == null) homeLocator.estimate()?.let { store.saveHome(it) }

        val f = store.filter
        home?.let { h -> val g = Grid(h); todayTrips.filterNot { f?.isOther(it) == true }.forEach { store.saveRoute(day, g.cells(it.path)) } }
        val summary = buildDay(day, todayTrips, home, excluded) { f?.isOther(it) == true }
        if (detector.base == null && !excluded) learnTrips += todayTrips
        todayTrips.clear()

        store.save(summary)
        store.purge(day)
        val stage = detector.update(summary.day)
        val b = detector.base
        if (b != null && store.baseline == null) {
            store.saveBaseline(b, detector.baseDay!!)
            OtherDriverFilter.fit(learnTrips)?.let { store.saveFilter(it) }
            learnTrips.clear()
        }
        return stage
    }

    /** 이번 트립의 이탈 감지기. 평소 경로가 5개 미만이면 판단하지 않는다(RouteMonitor 안에서 처리). */
    fun routeMonitor(today: Int): RouteMonitor? = home?.let { RouteMonitor(Grid(it), store.usualRoutes(today)) }

    /** 검진 완료·이사·차량 교체 입력 시 기준선 재학습. */
    fun relearn() {
        detector.reset()
        store.clearBaseline()
        learnTrips.clear()
    }

    /** 부모의 동의 철회: 저장된 기록을 모두 지우고 처음부터. */
    fun revokeConsent() {
        store.deleteAll()
        detector.reset()
        todayTrips.clear(); learnTrips.clear()
    }

    /** 앱을 다시 켰을 때 저장된 기준선과 요약으로 판정 상태를 복원한다(복원 중 단계 결과는 알림으로 보내지 않는다). */
    private fun restore() {
        val base = store.baseline
        if (base != null) detector.restoreBase(base.first, base.second)
        store.load().filter { base == null || it.day.day > base.second }.forEach { detector.update(it.day) }
    }
}
