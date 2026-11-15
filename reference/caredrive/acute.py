"""급성 채널: 이탈 후보 -> 정차 시 질문 -> 응답 처리 -> 길 잃음 후보 누적. 상수는 기획서 v2 시작값."""

OFFROUTE_M = 1000
OFFROUTE_MIN = 10
REROUTES = 3
ALERT_DAYS = 2
ALERT_WINDOW = 30


def is_deviation(offroute_m=0, offroute_min=0, reroutes=0):
    """평소 경로 이탈(약 1km·10분 이상) 또는 한 트립 재탐색 3회 이상."""
    return (offroute_m >= OFFROUTE_M and offroute_min >= OFFROUTE_MIN) or reroutes >= REROUTES


class Acute:
    def __init__(self):
        self.asked_days, self.asked_trips, self.lost_days = set(), set(), []

    def handle(self, day, trip, stopped, answer):
        """이탈 후보가 생겼을 때 호출. answer: accept / refuse / destination / none.
        반환: 'route_home'(집 안내 시작) / 'normal'(정상 이동) / 'logged'(무응답, 후보 1건 기록) / None(질문 안 함)."""
        if not stopped or day in self.asked_days or trip in self.asked_trips:  # 정차 중에만, 하루·트립당 1회
            return None
        self.asked_days.add(day)
        self.asked_trips.add(trip)
        if answer == "accept":
            self.lost_days.append(day)  # 도움을 받아들였다 = 길을 잃었다는 신호
            return "route_home"
        if answer in ("refuse", "destination"):
            return "normal"
        self.lost_days.append(day)
        return "logged"

    def alert(self, today):
        """30일 안에 서로 다른 날 후보가 2일 이상이면 자녀 알림에 반영."""
        recent = {d for d in self.lost_days if today - ALERT_WINDOW < d <= today}
        return len(recent) >= ALERT_DAYS
