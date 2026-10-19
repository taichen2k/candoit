/* 할수있어 서비스워커: 홈 화면 설치 + 잠금화면 알림 */
const CACHE='candoit-v12';
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
    rem=Object.values(st.tasks||{}).filter(t=>(t.fixed?(!t.from||t.from<=k):t.date===k)&&!done.has(t.id))
      .sort((a,b)=>(a.time||'99')<(b.time||'99')?-1:1);}
  const head=hourLabel||pad(now.getHours())+':00';
  if(!st||!Object.keys(st.tasks||{}).length)return {title:head+' 할수있어',body:'오늘 할 일을 등록해 보세요.'};
  if(!rem.length)return {title:head+' 오늘 할 일 모두 끝!',body:'잘했어요. 내일도 이렇게만 가요.'};
  return {title:head+' 남은 할 일 '+rem.length+'개',body:rem.slice(0,5).map(t=>'· '+(t.time?t.time+' ':'')+t.title).join('\n')+(rem.length>5?'\n외 '+(rem.length-5)+'개':'')};
}
async function show(hourLabel){
  const s=await summary(hourLabel);
  return self.registration.showNotification(s.title,{body:s.body,icon:'icon-192.png',badge:'badge-96.png',tag:'candoit-hourly',renotify:true,data:{url:'./'}});
}
// 어떤 오류가 나도 알림은 반드시 띄운다
function fallback(){return self.registration.showNotification('할수있어',{body:'남은 할 일을 확인하세요.',icon:'icon-192.png',tag:'candoit-hourly'});}
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){}
  e.waitUntil(show(d.h!=null?pad(d.h)+':00':null).catch(fallback));});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='test')e.waitUntil(show().catch(fallback));});
self.addEventListener('notificationclick',e=>{e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus();}return self.clients.openWindow('./');}));});
