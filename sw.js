/* 할수있어 서비스워커: 홈 화면 설치 + 잠금화면 알림 */
const CACHE='candoit-v25';
const SHELL=['./','./index.html','./manifest.webmanifest','./fonts/pretendard.woff2','./icon-192.png','./icon-512.png','./icon-180.png','./badge-96.png','./favicon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
// 항상 최신 파일을 먼저 받고, 인터넷이 안 될 때만 보관본 사용
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  if(new URL(req.url).origin!==self.location.origin)return;
  e.respondWith(fetch(req.url,{cache:'no-cache'}).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(req,c));}return res;})
    .catch(()=>caches.match(req,{ignoreSearch:true}).then(m=>m||caches.match('./'))));
});

const pad=n=>String(n).padStart(2,'0');
const keyOf=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
function readState(){return new Promise(res=>{try{const r=indexedDB.open('candoit',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>{try{const g=r.result.transaction('kv').objectStore('kv').get('state');g.onsuccess=()=>res(g.result||null);g.onerror=()=>res(null);}catch(e){res(null)}};
  r.onerror=()=>res(null);}catch(e){res(null)}});}
async function summary(hourLabel){
  const st=await readState();const now=new Date(),k=keyOf(now);
  let rem=[];
  if(st){const done=new Set((st.days&&st.days[k]&&st.days[k].done)||[]);
    const doneOn=d=>new Set((st.days&&st.days[d]&&st.days[d].done)||[]);
    rem=Object.values(st.tasks||{}).filter(t=>(t.fixed?(!t.from||t.from<=k):(t.date===k||(t.date<k&&!doneOn(t.date).has(t.id))))&&!done.has(t.id))
      .sort((a,b)=>(a.time||'99')<(b.time||'99')?-1:1);}
  const head=hourLabel||pad(now.getHours())+':00';
  const T='✅ 할 일 알림';
  if(!st||!Object.keys(st.tasks||{}).length)return {title:T,body:'오늘 할 일을 등록해 보세요.'};
  if(!rem.length)return {title:T,body:'오늘 할 일을 모두 끝냈어요. 잘했어요!'};
  // 놓친 일(시각 지남) → 지금 할 일(시각 없음) 순서, 시각이 아직 안 된 일은 빼고 다음 일정만 알려줌
  const hm=pad(now.getHours())+':'+pad(now.getMinutes());
  const missed=rem.filter(t=>t.time&&t.time<=hm),free=rem.filter(t=>!t.time),later=rem.filter(t=>t.time&&t.time>hm);
  // 시각은 폰이 알림 옆에 표시하므로 제목에서 빼고 한 줄로 짧게
  const list=missed.map(t=>'놓침  '+t.time+'  '+t.title).concat(free.map(t=>'할 일  '+t.title));
  const next=later.length?'다음  '+later[0].time+'  '+later[0].title:'';
  if(!list.length)return {title:T,body:'지금 할 일은 없어요.'+(next?'\n'+next:'')};
  const n=missed.length+free.length;
  const title=T,head2=(missed.length?'놓친 일 '+missed.length+'개 · ':'')+'할 일 '+n+'개 남았어요.';
  const body=head2+'\n'+list.slice(0,5).join('\n')+(list.length>5?'\n외 '+(list.length-5)+'개':'')+(next?'\n'+next:'');
  return {title,body};
}
async function show(hourLabel){
  const s=await summary(hourLabel);
  return self.registration.showNotification(s.title,{body:s.body,badge:'badge-96.png',tag:'candoit-hourly',renotify:true,data:{url:'./'}});
}
// 어떤 오류가 나도 알림은 반드시 띄운다
function fallback(){return self.registration.showNotification('✅ 할 일 알림',{body:'남은 할 일을 확인하세요.',tag:'candoit-hourly'});}
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){}
  e.waitUntil(show(d.h!=null?pad(d.h)+':00':null).catch(fallback));});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='test')e.waitUntil(show().catch(fallback));});
self.addEventListener('notificationclick',e=>{e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus();}return self.clients.openWindow('./');}));});
