// 할수있어 잠금화면 알림 보내기
// cron-job.org가 10분마다(09, 19, … 59분) 이 작업을 실행시킴. 한 번 실행하면 다음 10분 구간을 맡음
//  - 매시 정각: 남은 할 일 요약 알림 (알림 시간대 안에서만)
//  - 시각 맞춤: 할 일에 정한 시각(예: 23:50)에 그 일을 한 번 더 알림 (시간대와 상관없이)
// 정해진 시각보다 일찍 시작했으면 그 시각까지 기다렸다가 보냄
// 비밀값: VAPID_PRIVATE_KEY(알림 서명 키), BACKUP_READ_TOKEN(비공개 백업 저장소 읽기 전용), PUSH_CODES(옛 방식, 선택)
const webpush = require('web-push');
const PUBLIC = 'BGxKcpJe7sxd7D26LaaiNWJqxqziBnxMb_9GyH5UHJlgHYFBX4-ukOOUQ3s08PWZVT2Ldz8UY85QHK9ISBQGgto';
const priv = process.env.VAPID_PRIVATE_KEY;
const manual = (process.env.PUSH_CODES || '').split(/\s+/).filter(Boolean);
const force = process.env.FORCE === '1';
const testAt = /^\d\d:\d\d$/.test(process.env.TEST_AT || '') ? process.env.TEST_AT : '';
if (!priv) { console.log('VAPID_PRIVATE_KEY가 아직 없어요. 건너뜁니다.'); process.exit(0); }
webpush.setVapidDetails('mailto:noreply@candoit.app', PUBLIC, priv);

const MIN = 60e3, BLOCK = 10 * MIN;
const parse = c => { try { const s = JSON.parse(Buffer.from(c.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return s && s.e ? s : null; } catch (e) { return null; } };

// 폰 앱이 비공개 백업 저장소 push/*.json 에 올려 둔 최신 알림 코드와 시각 계획을 읽음
async function autoDevices() {
  const tok = process.env.BACKUP_READ_TOKEN, repo = process.env.BACKUP_REPO || 'taichen2k/candoit-backup';
  if (!tok) return [];
  const h = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    const r = await fetch('https://api.github.com/repos/' + repo + '/contents/push', { headers: h });
    if (r.status === 404) return [];
    if (!r.ok) { console.log('자동 등록 목록을 읽지 못했어요 (' + r.status + ')'); return []; }
    const out = [];
    for (const f of (await r.json()).filter(x => /^[0-9a-f]{16}\.json$/.test(x.name))) {
      try { const j = await (await fetch(f.url, { headers: h })).json(); const b = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); if (b && typeof b.code === 'string') out.push(b); } catch (e) {}
    }
    return out;
  } catch (e) { console.log('자동 등록 목록을 읽지 못했어요'); return []; }
}

// 기기 시간대(분) 기준 날짜·시각 계산
const pad = n => String(n).padStart(2, '0');
const local = (t, tz) => new Date(t + tz * MIN);
const dateKey = (t, tz) => { const d = local(t, tz); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
const toEpoch = (dk, hm, tz) => Date.parse(dk + 'T' + hm + ':00Z') - tz * MIN;

// [from, to) 구간에 울려야 할 시각 목록
function alarmsIn(plan, from, to) {
  if (!plan || typeof plan !== 'object') return [];
  const tz = Number.isFinite(plan.tz) ? plan.tz : 540, out = new Set();
  const days = [...new Set([dateKey(from, tz), dateKey(to - 1, tz)])];
  for (const dk of days) {
    const skip = new Set(((plan.done || {})[dk]) || []);
    for (const a of plan.daily || []) {
      if (!/^\d\d:\d\d$/.test(a.hm) || (a.from && a.from > dk) || skip.has(a.hm)) continue;
      const t = toEpoch(dk, a.hm, tz); if (t >= from && t < to) out.add(t + '|' + a.hm);
    }
    for (const o of plan.once || []) {
      const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d)$/.exec(o); if (!m || m[1] !== dk || skip.has(m[2])) continue;
      const t = toEpoch(dk, m[2], tz); if (t >= from && t < to) out.add(t + '|' + m[2]);
    }
  }
  return [...out].map(x => { const [t, hm] = x.split('|'); return { t: +t, hm }; });
}

const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));

(async () => {
  // 기기 모으기: 같은 알림 주소는 한 번만, 자동 등록된 최신 것이 우선
  const auto = await autoDevices(), byE = new Map();
  for (const c of manual) { const s = parse(c); if (s) byE.set(s.e, { s, plan: null }); }
  for (const b of auto) { const s = parse(b.code); if (s) byE.set(s.e, { s, plan: b.alarms || null }); }
  if (!byE.size) { console.log('등록된 알림 기기가 없어요. 건너뜁니다.'); return; }

  const now = Date.now();
  // 이번 실행이 맡을 10분 구간 시작: 조금 늦게 시작해도(최대 5분) 그 구간을 맡음
  const B = force ? now : Math.ceil((now - 5 * MIN) / BLOCK) * BLOCK;
  const events = [];
  if (force || B % (60 * MIN) === 0) events.push({ t: B, kind: 'hour' });
  if (testAt) { events.length = 0; for (const e of byE.keys()) events.push({ t: now, kind: 'at', hm: testAt, e }); }
  if (!force && !testAt) for (const [e, d] of byE) for (const a of alarmsIn(d.plan, B, B + BLOCK)) events.push({ t: a.t, kind: 'at', hm: a.hm, e });
  events.sort((x, y) => x.t - y.t);

  let sent = 0, outside = 0, atSent = 0; const fails = [];
  const send = async (s, payload) => {
    try { await webpush.sendNotification({ endpoint: s.e, keys: s.k }, JSON.stringify(payload), { TTL: 1800, urgency: 'high' }); return true; }
    catch (e) {
      // 실행 기록은 공개라서 코드·주소·응답 내용은 남기지 않고 상태 번호만 적음
      fails.push(e.statusCode || '연결 오류');
      console.log('보내기 실패(' + (e.statusCode || '연결 오류') + '): ' + (e.statusCode === 404 || e.statusCode === 410 ? '이 기기의 알림 주소가 바뀌었어요. 폰에서 할수있어를 한 번 열면 다시 등록돼요.' : '잠시 뒤 다시 시도돼요.'));
      return false;
    }
  };
  let hourLabel = '';
  for (const ev of events) {
    await sleep(ev.t - Date.now());
    if (ev.kind === 'hour') {
      const hour = local(ev.t, 540).getUTCHours(); hourLabel = hour + '시';
      for (const { s } of byE.values()) {
        const a = s.a ?? 8, b = s.b ?? 22;
        if (!force && (hour < a || hour > b)) { outside++; continue; }
        if (await send(s, { h: hour })) sent++;
      }
    } else {
      const d = byE.get(ev.e);
      if (d && await send(d.s, { at: ev.hm })) atSent++;
      console.log(ev.hm + ' 시각 맞춤 알림');
    }
  }
  const kst = local(B, 540);
  const label = pad(kst.getUTCHours()) + ':' + pad(kst.getUTCMinutes()) + ' 구간';
  console.log('::notice title=알림 결과::' + label + ' · 자동 등록 ' + auto.length + '대' + (hourLabel ? ' · ' + hourLabel + ' 정각 ' + sent + '건' : '') + (atSent ? ' · 시각 맞춤 ' + atSent + '건' : '') + (outside ? ' · 시간대 밖 ' + outside + '대' : '') + (fails.length ? ' · 실패 ' + fails.join(',') : ''));
})();
