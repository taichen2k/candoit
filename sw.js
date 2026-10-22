/* 할수있어 서비스워커: 홈 화면 설치 + 잠금화면 알림 */
const CACHE='candoit-v37';
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
  // 앞으로 남은 시각 정한 일은 가까운 순서로 전부 보여줌
  const next=later.map(t=>'다음  '+t.time+'  '+t.title).join('\n');
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
// 정각 알림을 받은 시각을 남겨, 앱 설정에서 알림이 끊겼는지 알 수 있게 함
function markPush(){return new Promise(res=>{try{const r=indexedDB.open('candoit',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>{try{const tx=r.result.transaction('kv','readwrite');tx.objectStore('kv').put(Date.now(),'lastPush');tx.oncomplete=()=>res();tx.onerror=()=>res();}catch(e){res()}};r.onerror=()=>res();}catch(e){res()}});}
// 시각 맞춤 알림: 그 시각(HH:MM)에 할 일을 이 기기 기록에서 찾아 이름과 함께 알림
async function showAt(hm){
  const st=await readState(),k=keyOf(new Date());
  const ds=new Set((st&&st.days&&st.days[k]&&st.days[k].done)||[]);
  const all=Object.values((st&&st.tasks)||{}).filter(t=>t.time===hm&&(t.fixed?(!t.from||t.from<=k):t.date===k));
  const left=all.filter(t=>!ds.has(t.id));
  if(!left.length)return self.registration.showNotification('⏰ '+hm+' 할 일',{body:all.length?'이 시각 할 일은 이미 끝냈어요. 잘했어요!':'이 시각에 남은 할 일이 없어요.',badge:'badge-96.png',tag:'candoit-at-'+hm,silent:true,data:{url:'./'}});
  return self.registration.showNotification('⏰ '+hm+' '+left[0].title,{body:(left.length>1?left.map(t=>'· '+t.title).join('\n')+'\n':'')+'지금 할 시간이에요.',badge:'badge-96.png',tag:'candoit-at-'+hm,renotify:true,requireInteraction:true,data:{url:'./'}});
}
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){}
  if(d.at&&/^\d\d:\d\d$/.test(d.at)){e.waitUntil(Promise.all([showAt(d.at).catch(fallback),markPush()]));return;}
  e.waitUntil(Promise.all([show(d.h!=null?pad(d.h)+':00':null).catch(fallback),markPush()]));});
// 브라우저가 알림 주소를 바꾸면(pushsubscriptionchange) 새 주소로 다시 구독하고 서버 백업 저장소에 바로 다시 등록
const VAPID='BGxKcpJe7sxd7D26LaaiNWJqxqziBnxMb_9GyH5UHJlgHYFBX4-ukOOUQ3s08PWZVT2Ldz8UY85QHK9ISBQGgto';
const kb=s=>{const b=atob((s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0));};
const b64uS=str=>{const b=new TextEncoder().encode(str);let x='';b.forEach(c=>x+=String.fromCharCode(c));return btoa(x).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const b64S=str=>{const b=new TextEncoder().encode(str);let x='';b.forEach(c=>x+=String.fromCharCode(c));return btoa(x);};
function kvGetSW(k){return new Promise(res=>{try{const r=indexedDB.open('candoit',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>{try{const g=r.result.transaction('kv').objectStore('kv').get(k);g.onsuccess=()=>res(g.result||null);g.onerror=()=>res(null);}catch(e){res(null)}};r.onerror=()=>res(null);}catch(e){res(null)}});}
async function reRegister(newSub){
  const sub=newSub||await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:kb(VAPID)});
  const pf=await kvGetSW('pushfile');if(!pf||!pf.token||!pf.repo||!pf.body)return;
  const j=sub.toJSON(),code=b64uS(JSON.stringify({e:j.endpoint,k:j.keys,a:pf.body.a,b:pf.body.b}));
  const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(j.endpoint)))).slice(0,8).map(x=>x.toString(16).padStart(2,'0')).join('');
  const url='https://api.github.com/repos/'+pf.repo+'/contents/push/'+id+'.json',h={Authorization:'Bearer '+pf.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  let sha=null;try{const r=await fetch(url,{headers:h});if(r.ok)sha=(await r.json()).sha;}catch(e){}
  const body=Object.assign({},pf.body,{code,updated:new Date().toISOString(),by:'sw'});
  await fetch(url,{method:'PUT',headers:h,body:JSON.stringify(Object.assign({message:'알림 주소 자동 갱신 '+id,content:b64S(JSON.stringify(body))},sha?{sha}:{}))});
}
self.addEventListener('pushsubscriptionchange',e=>{e.waitUntil(reRegister(e.newSubscription).catch(()=>{}));});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='test')e.waitUntil(show().catch(fallback));});
self.addEventListener('notificationclick',e=>{e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus();}return self.clients.openWindow('./');}));});
