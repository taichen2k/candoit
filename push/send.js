// 매시 정각 알림 보내기 (cron-job.org가 매시 00분에 이 작업을 직접 실행시킴)
// 비밀값: VAPID_PRIVATE_KEY(알림 서명 키), PUSH_CODES(폰에서 복사한 알림 코드, 기기마다 한 줄)
const webpush = require('web-push');
const PUBLIC = 'BGxKcpJe7sxd7D26LaaiNWJqxqziBnxMb_9GyH5UHJlgHYFBX4-ukOOUQ3s08PWZVT2Ldz8UY85QHK9ISBQGgto';
const priv = process.env.VAPID_PRIVATE_KEY;
const manual = (process.env.PUSH_CODES || '').split(/\s+/).filter(Boolean);
if (!priv) { console.log('VAPID_PRIVATE_KEY가 아직 없어요. 건너뜁니다.'); process.exit(0); }

// 자동 등록: 폰 앱이 비공개 백업 저장소의 push/*.json 에 올려 둔 최신 알림 코드를 읽음 (읽기 전용 토큰 BACKUP_READ_TOKEN)
async function autoCodes() {
  const tok = process.env.BACKUP_READ_TOKEN, repo = process.env.BACKUP_REPO || 'taichen2k/candoit-backup';
  if (!tok) return [];
  const h = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    const r = await fetch('https://api.github.com/repos/' + repo + '/contents/push', { headers: h });
    if (r.status === 404) return [];
    if (!r.ok) { console.log('자동 등록 목록을 읽지 못했어요 (' + r.status + ')'); return []; }
    const out = [];
    for (const f of (await r.json()).filter(x => /^[0-9a-f]{16}\.json$/.test(x.name))) {
      try { const j = await (await fetch(f.url, { headers: h })).json(); const b = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); if (b && typeof b.code === 'string') out.push(b.code); } catch (e) {}
    }
    return out;
  } catch (e) { console.log('자동 등록 목록을 읽지 못했어요'); return []; }
}
webpush.setVapidDetails('mailto:noreply@candoit.app', PUBLIC, priv);

// 한국 시간 기준, 곧 다가올 정각
const force = process.env.FORCE === '1';
// 정각 직전·직후 어느 쪽에 실행돼도 가장 가까운 정각을 기준으로 삼는다
const kst = new Date(Date.now() + 9 * 3600e3 + 30 * 60e3);
// 시험 발송(직접 실행)은 지금 시각 기준으로 표시
const hour = force ? new Date(Date.now() + 9 * 3600e3).getUTCHours() : kst.getUTCHours();

const parse = c => { try { const s = JSON.parse(Buffer.from(c.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return s && s.e ? s : null; } catch (e) { return null; } };
(async () => {
  let sent = 0, outside = 0; const fails = [];
  // 같은 기기(같은 알림 주소)는 한 번만: 자동 등록된 최신 코드가 직접 넣은 코드보다 우선
  const auto = await autoCodes(), byE = new Map();
  for (const c of manual) { const s = parse(c); if (s) byE.set(s.e, s); else console.log('알림 코드 하나를 읽지 못했어요. 다시 복사해 붙여넣어 주세요.'); }
  for (const c of auto) { const s = parse(c); if (s) byE.set(s.e, s); }
  if (auto.length) console.log('자동 등록된 기기 ' + auto.length + '대');
  if (!byE.size) { console.log('등록된 알림 코드가 없어요. 건너뜁니다.'); return; }
  for (const s of byE.values()) {
    const a = s.a ?? 8, b = s.b ?? 22;
    if (!force && (hour < a || hour > b)) { outside++; console.log(hour + '시는 알림 시간대(' + a + '~' + b + '시)가 아니에요.'); continue; }
    try {
      await webpush.sendNotification({ endpoint: s.e, keys: s.k }, JSON.stringify({ h: hour }), { TTL: 1800, urgency: 'high' });
      sent++;
    } catch (e) {
      fails.push(e.statusCode || '연결 오류');
      // 실행 기록은 공개라서 코드·주소·응답 내용은 남기지 않고 상태 번호만 적음
      console.log('보내기 실패(' + (e.statusCode || '연결 오류') + '): ' + (e.statusCode === 404 || e.statusCode === 410 ? '이 기기의 알림이 꺼졌어요. 폰에서 알림을 다시 켜고 새 코드를 등록하세요.' : '잠시 뒤 다시 시도돼요.'));
    }
  }
  console.log(hour + '시 알림 ' + sent + '건 보냄');
  // 결과 한 줄을 실행 요약(주석)으로도 남겨 밖에서 확인할 수 있게 함 (개수만, 코드·주소 없음)
  console.log('::notice title=알림 결과::' + hour + '시 · 자동 등록 ' + auto.length + '대 · 보냄 ' + sent + '건' + (outside ? ' · 시간대 밖 ' + outside + '대' : '') + (fails.length ? ' · 실패 ' + fails.join(',') : ''));
})();
