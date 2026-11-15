# 제3자 구성요소 (출처와 라이선스)

공모전 약관 제7조 제7항에 따라, 이 저장소가 사용하는 오픈소스와 외부 자원의 출처와 라이선스를 밝힌다. 각 구성요소의 전체 라이선스 문구는 해당 프로젝트에서 확인할 수 있다. 이 저장소의 [LICENSE](LICENSE)는 아래 구성요소에 적용되지 않는다.

## 웹·서버 (`web/`)

| 구성요소 | 버전 | 라이선스 | 출처 |
| --- | --- | --- | --- |
| Next.js | 16.4.6 | MIT | https://github.com/vercel/next.js |
| React, React DOM | 19.3.0 | MIT | https://github.com/facebook/react |
| @neondatabase/serverless | 1.2.1 | MIT | https://github.com/neondatabase/serverless |
| Tailwind CSS, @tailwindcss/turbopack | 4.3.3 | MIT | https://github.com/tailwindlabs/tailwindcss |
| TypeScript | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| tsx (개발용, 테스트 실행) | 4.x | MIT | https://github.com/privatenumber/tsx |
| @types/node, @types/react, @types/react-dom (개발용) | - | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

그 밖의 간접 의존성은 `web/package-lock.json`에 있다.

## 글꼴

| 구성요소 | 라이선스 | 출처 |
| --- | --- | --- |
| Noto Sans KR | SIL Open Font License 1.1 | https://fonts.google.com/noto/specimen/Noto+Sans+KR (빌드 때 `next/font/google`로 내려받아 함께 제공) |

## Android (`app/`)

| 구성요소 | 라이선스 | 출처 |
| --- | --- | --- |
| AndroidX AppCompat, Core KTX | Apache-2.0 | https://developer.android.com/jetpack/androidx |
| JUnit 4 (테스트용) | EPL-1.0 | https://github.com/junit-team/junit4 |
| Kotlin, Android Gradle Plugin (빌드 도구) | Apache-2.0 | https://kotlinlang.org, https://developer.android.com/build |

Android 플랫폼의 TextToSpeech·SpeechRecognizer API를 호출하지만 그 구현은 포함하지 않는다.

## 이 저장소에 포함하지 않은 것

- Pleos Connect SDK(Vehicle, NaviHelper, TextToSpeech, SpeechToText, FusedLocation): 공개 개발 문서 범위에서 에뮬레이터 연동 시 사용할 계획이며, 이 저장소에는 SDK 코드가 없다.
- 비밀값(DB 접속 정보 등): 배포 환경변수로만 두고 저장소에 올리지 않는다.
- 선행연구 논문 원문: 기획서의 참고 문헌 목록에 서지 정보만 적었다.

## 자체 제작물

CareDrive 로고와 화면 디자인(와이어프레임), `reference/`의 Python 실험 코드(표준 라이브러리만 사용)는 출품 팀이 만들었다.
