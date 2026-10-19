// 매시 정각 알림 보내기 (cron-job.org가 매시 00분에 이 작업을 직접 실행시킴)
// 비밀값: VAPID_PRIVATE_KEY(알림 서명 키), PUSH_CODES(폰에서 복사한 알림 코드, 기기마다 한 줄)
const webpush = require('web-push');
const PUBLIC = 'BGxKcpJe7sxd7D26LaaiNWJqxqziBnxMb_9GyH5UHJlgHYFBX4-ukOOUQ3s08PWZVT2Ldz8UY85QHK9ISBQGgto';
const priv = process.env.VAPID_PRIVATE_KEY;
const codes = (process.env.PUSH_CODES || '').split(/\s+/).filter(Boolean);
if (!priv) { console.log('VAPID_PRIVATE_KEY가 아직 없어요. 건너뜁니다.'); process.exit(0); }
if (!codes.length) { console.log('등록된 알림 코드가 없어요. 건너뜁니다.'); process.exit(0); }
webpush.setVapidDetails('mailto:noreply@candoit.app', PUBLIC, priv);

// 한국 시간 기준, 곧 다가올 정각
const force = process.env.FORCE === '1';
// 정각 직전·직후 어느 쪽에 실행돼도 가장 가까운 정각을 기준으로 삼는다
const kst = new Date(Date.now() + 9 * 3600e3 + 30 * 60e3);
// 시험 발송(직접 실행)은 지금 시각 기준으로 표시
const hour = force ? new Date(Date.now() + 9 * 3600e3).getUTCHours() : kst.getUTCHours();

(async () => {
  let sent = 0;
  for (const c of codes) {
    let s;
    try { s = JSON.parse(Buffer.from(c.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
    catch (e) { console.log('알림 코드 하나를 읽지 못했어요. 다시 복사해 붙여넣어 주세요.'); continue; }
    const a = s.a ?? 8, b = s.b ?? 22;
    if (!force && (hour < a || hour > b)) { console.log(hour + '시는 알림 시간대(' + a + '~' + b + '시)가 아니에요.'); continue; }
    try {
      await webpush.sendNotification({ endpoint: s.e, keys: s.k }, JSON.stringify({ h: hour }), { TTL: 1800, urgency: 'high' });
      sent++;
    } catch (e) {
      // 실행 기록은 공개라서 코드·주소·응답 내용은 남기지 않고 상태 번호만 적음
      console.log('보내기 실패(' + (e.statusCode || '연결 오류') + '): ' + (e.statusCode === 404 || e.statusCode === 410 ? '이 기기의 알림이 꺼졌어요. 폰에서 알림을 다시 켜고 새 코드를 등록하세요.' : '잠시 뒤 다시 시도돼요.'));
    }
  }
  console.log(hour + '시 알림 ' + sent + '건 보냄');
})();
