# 할수있어

매일 루틴과 오늘 할 일을 체크하고, 매시 정각에 남은 일을 알려주는 웹앱입니다.

- 앱 주소: https://taichen2k.github.io/candoit/
- 기록은 각 기기 안에만 저장됩니다. 기기를 바꿀 때는 설정 → 백업 · 복구를 쓰세요.
- 잠금화면 알림은 GitHub Actions(`매시 정각 알림`)가 매시 57분에 보냅니다.
  - 저장소 비밀값 `VAPID_PRIVATE_KEY`: 알림 서명 키
  - 저장소 비밀값 `PUSH_CODES`: 앱 설정에서 복사한 알림 코드 (기기마다 한 줄)

© 2026 티제이컴퍼니. All rights reserved.
