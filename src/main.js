import './style.css';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

/* ---------- constants ---------- */
const STAGES=[['lead','New lead'],['testing','Testing'],['quoted','Quote sent'],['booked','Install booked'],['installed','Installed · retest due'],['complete','Complete'],['lost','Lost']];
const STAGE_LABEL=Object.fromEntries(STAGES);
const KINDS={
  estimate:{label:'Estimate visit',short:'Estimate',hrs:1},
  test_place:{label:'Radon test placement',short:'Test drop',hrs:0.5},
  test_pickup:{label:'Radon test pickup',short:'Test pickup',hrs:0.5},
  install:{label:'Mitigation install',short:'Install',hrs:5},
  post_test:{label:'Post-mitigation test',short:'Post-test',hrs:0.5},
  service:{label:'Service call',short:'Service',hrs:1.5}
};
const APPT_STATUS=[['scheduled','Scheduled'],['confirmed','Confirmed'],['en_route','On the way'],['arrived','On site'],['done','Done'],['cancelled','Cancelled']];
const FOUNDATIONS=['Basement','Crawlspace','Slab on grade','Basement + crawlspace','Slab + crawlspace'];
const SOURCES=['Referral','Google','Realtor','Home inspector','Repeat customer','Facebook','Yard sign','Other'];
const REASONS=['Real estate transaction','Health concern','High test result','New construction','Routine check'];
const CHECKLIST=['Suction pit dug and sealed','Sump pit covered and sealed','Cracks and joints sealed','Fan mounted outside living space','Manometer installed and zeroed','System label and warranty sticker applied','Homeowner walkthrough done','Post-mitigation test placed'];
const CREW_COLORS=['c1','c2','c3','c4','c5','c6'];
const DEFAULT_TEMPLATES=[
  {id:'reminder',name:'Appointment reminder',text:'Hi {first}, this is {company}. Reminder: your {visit} is {date} at {time}. Reply C to confirm or call {phone} to reschedule.'},
  {id:'on_way',name:'Crew on the way',text:'Hi {first}, {crew} from {company} is on the way to {address} and should arrive in about 30 minutes.'},
  {id:'test_result',name:'Test result',text:'Hi {first}, your radon test came back at {level} pCi/L. The EPA recommends fixing a home at or above 4.0 pCi/L. Would you like us to send a quote?'},
  {id:'quote',name:'Quote ready',text:'Hi {first}, your quote {doc} for {amount} is ready. Reply YES to approve and we will get your install on the calendar.'},
  {id:'invoice',name:'Invoice sent',text:'Hi {first}, invoice {doc} for {amount} is ready. Thank you for choosing {company}.'},
  {id:'post_result',name:'Post-mitigation result',text:'Good news {first}: your post-mitigation test came back at {post} pCi/L, down from {level} pCi/L. Your system is working.'},
  {id:'review',name:'Ask for a review',text:'Hi {first}, thanks again for trusting {company}. If you have a minute, a short review helps a small business like ours a lot.'}
];
const DEFAULT_PRICEBOOK=[
  {id:'p1',name:'Short-term radon test (charcoal, 2 canisters)',price:150},
  {id:'p2',name:'Continuous radon monitor test, 48 hr',price:175},
  {id:'p3',name:'Sub-slab depressurization system, 1 suction point',price:1450},
  {id:'p4',name:'Additional suction point',price:350},
  {id:'p5',name:'Crawlspace membrane, per sq ft',price:2.25},
  {id:'p6',name:'Sealed sump pit cover',price:185},
  {id:'p7',name:'Crack and joint sealing',price:250},
  {id:'p8',name:'High-suction fan upgrade',price:175},
  {id:'p9',name:'Post-mitigation test (included)',price:0},
  {id:'p10',name:'Annual system check',price:95}
];
const NAV=[
  ['dash','Today','<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'],
  ['schedule','Schedule','<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ['jobs','Jobs','<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>'],
  ['clients','Clients','<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>'],
  ['inbox','Messages','<path d="M4 5h16v11H9l-5 4z"/>'],
  ['billing','Billing','<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'],
  ['crew','Crew app','<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>'],
  ['settings','Settings','<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>']
];

/* ---------- utils ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const sid=()=>Math.random().toString(36).slice(2,10);
const money=n=>'$'+(+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const money0=n=>'$'+Math.round(+n||0).toLocaleString('en-US');
const sum=a=>a.reduce((x,y)=>x+(+y||0),0);
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseYmd(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1)}
const todayStr=()=>ymd(new Date());
function addDays(s,n){const d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d)}
function daysBetween(a,b){return Math.round((parseYmd(b)-parseYmd(a))/864e5)}
function mondayOf(s){const d=parseYmd(s);const k=(d.getDay()+6)%7;d.setDate(d.getDate()-k);return ymd(d)}
function fmtD(s,o={weekday:'short',month:'short',day:'numeric'}){return s?parseYmd(s).toLocaleDateString('en-US',o):''}
function fmtT(t){if(!t)return'';let [h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+String(m).padStart(2,'0')+' '+ap}
function relDay(s){const n=daysBetween(todayStr(),s);if(n===0)return'Today';if(n===1)return'Tomorrow';if(n===-1)return'Yesterday';return fmtD(s)}
function toMin(t){const [h,m]=(t||'0:0').split(':').map(Number);return h*60+m}
function nowIso(){return new Date().toISOString()}
function ago(iso){if(!iso)return'';const m=(Date.now()-new Date(iso))/6e4;if(m<1)return'now';if(m<60)return Math.round(m)+'m';if(m<1440)return Math.round(m/60)+'h';const d=Math.round(m/1440);return d<7?d+'d':new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function lvlClass(v){v=+v;if(!(v>=0)||v==='')return'';return v>=4?'bad':v>=2?'warn':'good'}
function lvlPill(v){if(v===''||v==null||isNaN(+v))return'<span class="pill">No result</span>';return`<span class="pill ${lvlClass(v)}"><span class="lvl">${(+v).toFixed(1)}</span> pCi/L</span>`}
function first(n){return String(n||'').trim().split(/\s+/)[0]||'there'}
function last(n){const p=String(n||'').trim().split(/\s+/);return p.length>1?p[p.length-1]:p[0]}

/* ---------- getters ---------- */
const all=c=>Object.values(S[c]);
const cfg=()=>{const o={company:'Your Radon Co.',phone:'',email:'',area:'',cert:'',taxRate:0,templates:DEFAULT_TEMPLATES,pricebook:DEFAULT_PRICEBOOK,quoteDays:30,invoiceDays:15};const m=S.config.main||{};for(const k in m)if(m[k]!=null)o[k]=m[k];return o};
const client=id=>S.clients[id];
const job=id=>S.jobs[id];
const crew=id=>S.crews[id];
const crews=()=>all('crews').filter(c=>c.active!==false).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
const jobClient=j=>j&&client(j.clientId);
const apptClient=a=>a&&(client(a.clientId)||jobClient(job(a.jobId)));
const apptsOn=d=>all('appts').filter(a=>a.date===d&&a.status!=='cancelled');
const jobAppts=jid=>all('appts').filter(a=>a.jobId===jid).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
const jobDocs=jid=>all('billing').filter(b=>b.jobId===jid);
const clientJobs=cid=>all('jobs').filter(j=>j.clientId===cid).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
function docTotals(b){const sub=sum((b.lines||[]).map(l=>(+l.qty||0)*(+l.price||0)));const disc=+b.discount||0;const tax=Math.max(0,sub-disc)*(+b.taxRate||0)/100;return{sub,disc,tax,total:Math.max(0,sub-disc)+tax}}
function nextAppt(cid){const t=todayStr();return all('appts').filter(a=>apptClient(a)?.id===cid&&a.date>=t&&a.status!=='cancelled'&&a.status!=='done').sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start))[0]}
function jobValue(j){const d=jobDocs(j.id);const inv=d.filter(x=>x.kind==='invoice');const src=inv.length?inv:d.filter(x=>x.kind==='quote'&&x.status!=='declined');return sum(src.map(x=>docTotals(x).total))}
function invoiceStatus(b){if(b.kind!=='invoice')return b.status||'draft';if(b.status==='paid'||b.status==='void'||b.status==='draft')return b.status;if(b.due&&b.due<todayStr())return'overdue';return'unpaid'}
const STATUS_PILL={draft:'',sent:'acc',accepted:'good',declined:'bad',expired:'warn',unpaid:'warn',overdue:'bad',paid:'good',void:''};
/* ---------- state ---------- */
const S={clients:{},jobs:{},appts:{},messages:{},threads:{},billing:{},crews:{},photos:{},profiles:{},config:{},
  mode:'loading',live:false,canWrite:false,user:null,profile:null,
  route:'dash',weekStart:null,q:'',inboxSel:null,inboxQ:'',billTab:'invoice',jobQ:'',crewId:null,crewDate:null,crewOpen:null,drawer:null,
  photoUrls:{},auth:{mode:'signin',msg:'',err:''}};

/* ---------- data layer (Supabase) ---------- */
const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const TABLE={clients:'clients',jobs:'jobs',appts:'appointments',billing:'billing_docs',crews:'crews',messages:'messages',photos:'photos',profiles:'profiles'};
const KEY_OF=Object.fromEntries(Object.entries(TABLE).map(([k,v])=>[v,k]));
const COLUMNS={
  clients:['id','name','phone','email','address','city','zip','county','foundation','source','smsOk'],
  jobs:['id','clientId','stage','reason','preLevel','postLevel','testMethod','closingDate','agent','sqft','sump','accessNotes','fan','points','manometer','discharge','installDate','warranty','checklist','notes'],
  appts:['id','jobId','clientId','crewId','kind','date','start','hours','status','notes','reminded','result','manometer','crewNotes','enRouteAt','arrivedAt','completedAt'],
  billing:['id','kind','number','jobId','clientId','quoteId','issued','due','status','lines','discount','taxRate','notes','method','sentAt','acceptedAt','paidAt'],
  crews:['id','name','lead','members','phone','color','active'],
  messages:['id','clientId','direction','channel','body','status','readAt','createdBy'],
  photos:['id','jobId','appointmentId','path','caption','uploadedBy'],
  profiles:['id','fullName','role','crewId'],
  config:['company','phone','email','area','cert','taxRate','quoteDays','invoiceDays','templates','pricebook']
};
const NUMERIC=new Set(['preLevel','postLevel','sqft','points','warranty','hours','result','discount','taxRate','quoteDays','invoiceDays']);
const INTEGER=new Set(['sqft','points','warranty','quoteDays','invoiceDays']);
const snake=k=>k.replace(/[A-Z]/g,m=>'_'+m.toLowerCase());
const camel=k=>k.replace(/_([a-z])/g,(m,c)=>c.toUpperCase());
function fromRow(row){const o={};for(const k in row)o[camel(k)]=row[k];if(typeof o.start==='string')o.start=o.start.slice(0,5);return o}
function toRow(col,obj){const out={};for(const k of COLUMNS[col]){if(!(k in obj))continue;let v=obj[k];
  if(v===''||v===undefined)v=null;
  if(v!==null&&NUMERIC.has(k)){v=Number(v);if(isNaN(v))v=null;else if(INTEGER.has(k))v=Math.round(v)}
  out[snake(k)]=v}return out}
function dbError(e,fallback){
  console.warn(e);
  const code=e&&e.code;
  if(code==='23505')return toast('That number is already used. Pick another and save again.');
  if(code==='42501'||/row-level security/i.test(e?.message||''))return toast('You don\'t have permission to make that change.');
  if(/JWT|session/i.test(e?.message||''))return toast('Your sign-in expired. Reload the page and sign in again.');
  toast(fallback||'Could not save that change. Check your connection and try again.');
}
async function put(col,id,data){
  if(!S.canWrite){toast('Only office staff can change this.');return}
  const prev=S[col][id];S[col][id]={...prev,...data,id};schedule();
  const {error}=await sb.from(TABLE[col]).upsert(toRow(col,{...data,id}));
  if(error){if(prev)S[col][id]=prev;else delete S[col][id];schedule();dbError(error);throw error}
}
async function patch(col,id,p){
  if(!S.canWrite){toast('Only office staff can change this.');return}
  const prev=S[col][id];S[col][id]={...prev,...p,id};schedule();
  const {error}=await sb.from(TABLE[col]).update(toRow(col,p)).eq('id',id);
  if(error){S[col][id]=prev;schedule();dbError(error);throw error}
}
async function remove(col,id){
  if(!S.canWrite)return;
  const prev=S[col][id];delete S[col][id];schedule();
  const {error}=await sb.from(TABLE[col]).delete().eq('id',id);
  if(error){S[col][id]=prev;schedule();dbError(error,'Could not delete that. Try again.');throw error}
}
async function saveConfig(p){
  const prev=S.config.main;S.config.main={...prev,...p};schedule();
  const {error}=await sb.from('settings').update(toRow('config',p)).eq('id',1);
  if(error){S.config.main=prev;schedule();dbError(error);throw error}
}
async function loadAll(){
  const qs=Object.entries(TABLE).map(([k,t])=>{let q=sb.from(t).select('*');if(k==='messages')q=q.order('created_at',{ascending:false}).limit(5000);else q=q.limit(10000);return q.then(r=>[k,r])});
  qs.push(sb.from('settings').select('*').eq('id',1).maybeSingle().then(r=>['config',r]));
  const res=await Promise.all(qs);
  for(const [k,r] of res){
    if(r.error){console.warn(k,r.error);continue}
    if(k==='config'){S.config={main:r.data?fromRow(r.data):{}};continue}
    const o={};(r.data||[]).forEach(row=>{const x=fromRow(row);o[x.id]=x});S[k]=o;
  }
}
let channel=null;
function subscribe(){
  if(channel)sb.removeChannel(channel);
  channel=sb.channel('radon-live').on('postgres_changes',{event:'*',schema:'public'},p=>{
    if(p.table==='settings'){if(p.new&&p.new.id===1)S.config.main=fromRow(p.new);schedule();return}
    const k=KEY_OF[p.table];if(!k)return;
    if(p.eventType==='DELETE'){const id=p.old&&p.old.id;if(id)delete S[k][id]}
    else{const x=fromRow(p.new);S[k][x.id]=x;
      if(k==='profiles'&&x.id===S.user?.id&&(x.role!==S.profile?.role||x.crewId!==S.profile?.crewId)){S.profile=x;applyRole();loadAll().then(schedule)}}
    schedule();
  }).subscribe(st=>{S.live=st==='SUBSCRIBED';schedule()});
}
/* threads are derived from messages */
function buildThreads(){
  const t={};
  Object.values(S.messages).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).forEach(m=>{
    const th=t[m.clientId]||(t[m.clientId]={id:m.clientId,clientId:m.clientId,messages:[],unread:0,lastAt:''});
    th.messages.push({id:m.id,dir:m.direction,channel:m.channel,text:m.body,at:m.createdAt,status:m.status});
    if(m.direction==='in'&&!m.readAt)th.unread++;
    th.lastAt=m.createdAt;
  });
  S.threads=t;
}
async function addMessage(cid,msg){
  if(!S.canWrite)return;
  const id=uid(),now=nowIso();
  const row={id,clientId:cid,direction:msg.dir,channel:msg.channel||'sms',body:msg.text,status:msg.dir==='in'?'received':'recorded',readAt:msg.dir==='out'||S.inboxSel===cid?now:null,createdBy:S.user.id};
  S.messages[id]={...row,createdAt:now};schedule();
  const {error}=await sb.from('messages').insert(toRow('messages',row));
  if(error){delete S.messages[id];schedule();dbError(error,'Could not record that message.')}
}
async function markRead(cid){
  const ids=Object.values(S.messages).filter(m=>m.clientId===cid&&m.direction==='in'&&!m.readAt).map(m=>m.id);
  if(!ids.length||!S.canWrite)return;const now=nowIso();ids.forEach(i=>S.messages[i].readAt=now);schedule();
  const {error}=await sb.from('messages').update({read_at:now}).in('id',ids);if(error)console.warn(error);
}
async function sendTemplate(cid,tplId,extra={},channel='sms'){
  const tp=(cfg().templates||DEFAULT_TEMPLATES).find(x=>x.id===tplId)||DEFAULT_TEMPLATES.find(x=>x.id===tplId);if(!tp)return;
  await addMessage(cid,{dir:'out',channel,text:fillTpl(tp.text,tplCtx(cid,extra))});
}
function tplText(cid,tplId,extra={}){const tp=(cfg().templates||DEFAULT_TEMPLATES).find(x=>x.id===tplId)||DEFAULT_TEMPLATES.find(x=>x.id===tplId);return tp?fillTpl(tp.text,tplCtx(cid,extra)):''}

/* ---------- photos ---------- */
const jobPhotos=jid=>all('photos').filter(p=>p.jobId===jid).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
function photoBlock(jid,apptId){
  const ps=jobPhotos(jid);
  return`<div class="photos">${ps.map(p=>`<a href="${esc(S.photoUrls[p.path]||'#')}" target="_blank" rel="noopener" data-photo="${esc(p.path)}"><img alt="Job photo" src="${esc(S.photoUrls[p.path]||'')}" loading="lazy"></a>`).join('')}</div>
   <label class="btn sm upload" style="align-self:flex-start">Add photos<input type="file" accept="image/*" multiple data-upload-job="${jid}" data-upload-appt="${apptId||''}" aria-label="Add photos"></label>`;
}
async function hydratePhotos(){
  const imgs=[...document.querySelectorAll('[data-photo]')];const need=[...new Set(imgs.map(a=>a.dataset.photo).filter(p=>!S.photoUrls[p]))];
  if(need.length){const {data,error}=await sb.storage.from('job-photos').createSignedUrls(need,3600);
    if(!error)(data||[]).forEach(d=>{if(d.signedUrl)S.photoUrls[d.path]=d.signedUrl})}
  document.querySelectorAll('[data-photo]').forEach(a=>{const u=S.photoUrls[a.dataset.photo];if(u){a.href=u;const i=a.querySelector('img');if(i&&i.getAttribute('src')!==u)i.src=u}});
}
async function uploadPhotos(input){
  const jid=input.dataset.uploadJob,aid=input.dataset.uploadAppt||null;const files=[...input.files];if(!files.length)return;
  toast(`Uploading ${files.length} photo${files.length>1?'s':''}…`);let ok=0;
  for(const f of files){
    const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`${jid}/${uid()}.${ext}`;
    const up=await sb.storage.from('job-photos').upload(path,f,{contentType:f.type||'image/jpeg',upsert:false});
    if(up.error){dbError(up.error,'A photo did not upload. Try a smaller image.');continue}
    const row={id:uid(),jobId:jid,appointmentId:aid,path,uploadedBy:S.user.id};
    const ins=await sb.from('photos').insert(toRow('photos',row));
    if(ins.error){dbError(ins.error,'A photo uploaded but was not attached to the job.');continue}
    S.photos[row.id]={...row,createdAt:nowIso()};ok++;
  }
  input.value='';toast(`${ok} photo${ok===1?'':'s'} added`);
  if(S.drawer)drawDrawer();else render();
}

/* ---------- auth & roles ---------- */
const isStaff=()=>['owner','office'].includes(S.profile?.role);
const isOwner=()=>S.profile?.role==='owner';
const isCrew=()=>S.profile?.role==='crew';
function navItems(){return isCrew()?NAV.filter(n=>n[0]==='crew'):NAV}
function applyRole(){
  S.canWrite=isStaff();
  document.body.classList.toggle('crew-only',isCrew());
  if(isCrew()){S.route='crew';S.crewId=S.profile.crewId||null}
}
async function startSession(session){
  S.user=session.user;
  const {data,error}=await sb.from('profiles').select('*').eq('id',S.user.id).maybeSingle();
  if(error||!data){S.mode='pending';S.profile=null;renderRoot();return}
  S.profile=fromRow(data);
  if(S.profile.role==='pending'){S.mode='pending';renderRoot();return}
  applyRole();S.mode='loading';renderRoot();
  await loadAll();S.mode='app';subscribe();renderRoot();
}
async function signOut(){if(channel)sb.removeChannel(channel);channel=null;await sb.auth.signOut();location.hash='';location.reload()}
const MARK='<svg viewBox="0 0 32 32"><path d="M8 22V12l8-5 8 5v10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 22v-6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="13.5" r="1.6" fill="#fff"/></svg>';
function authView(){
  const a=S.auth,m=a.mode;
  if(S.mode==='pending')return`<div class="auth"><div class="auth-card"><div class="auth-mark">${MARK}</div><h1>Waiting for approval</h1>
    <p class="muted" style="margin:0">You're signed in as <b>${esc(S.user?.email||'')}</b>. The account owner needs to approve you and set your role in Settings, under Team. Ask them to do that, then check again.</p>
    <div class="row"><button class="btn primary" data-act="recheck">Check again</button><button class="btn" data-act="signOut">Sign out</button></div></div></div>`;
  const title={signin:'Sign in',signup:'Create your account',reset:'Reset your password',newpass:'Choose a new password'}[m];
  return`<div class="auth"><form class="auth-card" data-form="auth" data-mode="${m}"><div class="auth-mark">${MARK}</div><div><div class="eyebrow">Radon Crew Desk</div><h1>${title}</h1></div>
    ${m==='signup'?`<label class="f"><span>Your name</span><input type="text" name="name" id="au-name" autocomplete="name" required></label>`:''}
    ${m!=='newpass'?`<label class="f"><span>Email</span><input type="email" name="email" id="au-email" autocomplete="email" required></label>`:''}
    ${m!=='reset'?`<label class="f"><span>${m==='newpass'?'New password':'Password'}</span><input type="password" name="password" id="au-pass" autocomplete="${m==='signin'?'current-password':'new-password'}" minlength="8" required></label>`:''}
    ${a.err?`<div class="err" role="alert">${esc(a.err)}</div>`:''}${a.msg?`<div class="ok" role="status">${esc(a.msg)}</div>`:''}
    <button class="btn primary big">${{signin:'Sign in',signup:'Create account',reset:'Email me a reset link',newpass:'Save password'}[m]}</button>
    <div class="row" style="justify-content:space-between">
      ${m==='signin'?`<button type="button" class="linkbtn" data-act="authMode" data-m="signup">New here? Create an account</button><button type="button" class="linkbtn" data-act="authMode" data-m="reset">Forgot password</button>`:''}
      ${m==='signup'||m==='reset'?`<button type="button" class="linkbtn" data-act="authMode" data-m="signin">Back to sign in</button>`:''}
    </div>
    ${m==='signup'?`<p class="small muted" style="margin:0">The first account becomes the owner. Everyone after that waits for the owner to approve them.</p>`:''}
  </form></div>`;
}
function shellHtml(){return`<div class="shell"><aside class="rail"><div class="brand"><b id="brandName">Radon Crew Desk</b><span>OPERATIONS · MISSOURI</span></div><nav class="nav" id="nav"></nav><div class="rail-foot" id="railFoot"></div></aside><main><div class="view" id="view"></div></main></div>`}
function renderRoot(){
  const root=$('#root');
  if(S.mode==='auth'||S.mode==='pending'){root.innerHTML=authView();const f=root.querySelector('input');if(f)f.focus();return}
  if(!$('#view'))root.innerHTML=shellHtml();
  render();
}

/* ---------- render ---------- */
let rq=false;function schedule(){if(rq)return;rq=true;requestAnimationFrame(()=>{rq=false;if(S.mode==='app'||S.mode==='loading')render()})}
function render(){
  if(!$('#view'))return;
  buildThreads();
  const c=cfg();
  $('#brandName').textContent=c.company||'Radon Crew Desk';
  const unread=sum(all('threads').map(t=>+t.unread||0));
  $('#nav').innerHTML=navItems().map(([k,l,ic])=>`<a href="#${k}" data-act="go" data-r="${k}" class="${S.route===k?'on':''}"><svg viewBox="0 0 24 24">${ic}</svg><span>${l}</span>${k==='inbox'&&unread?`<span class="badge">${unread}</span>`:''}</a>`).join('');
  const nm=S.profile?.fullName||S.user?.email||'';
  $('#railFoot').innerHTML=`<span><span class="dot ${S.live?'':'off'}"></span>${S.live?'Live':'Connecting…'}</span><span>${esc(nm)} · ${esc(S.profile?.role||'')}</span><button class="linkbtn" data-act="signOut" style="text-align:left">Sign out</button>`;
  const v=$('#view');
  const keep={};v.querySelectorAll('[data-keep]').forEach(el=>{keep[el.id]=el.value});
  const ae=document.activeElement;const aeId=ae&&v.contains(ae)?ae.id:null;let sel=null;try{if(aeId&&ae.selectionStart!=null)sel=[ae.selectionStart,ae.selectionEnd]}catch(e){}
  const scrollers={};v.querySelectorAll('[data-scroll]').forEach(el=>scrollers[el.dataset.scroll]=el.scrollTop);
  let html;
  if(S.mode==='loading')html=`<div class="empty" style="margin-top:40px"><b>Opening the workspace</b>Loading clients, jobs and the schedule.</div>`;
  else html=({dash:vDash,schedule:vSchedule,jobs:vJobs,clients:vClients,inbox:vInbox,billing:vBilling,crew:vCrew,settings:vSettings}[S.route]||vDash)();
  v.innerHTML=html;
  for(const id in keep){const el=document.getElementById(id);if(el&&el.value!==keep[id])el.value=keep[id]}
  v.querySelectorAll('[data-scroll]').forEach(el=>{const k=el.dataset.scroll;if(k in scrollers)el.scrollTop=scrollers[k];else if(el.dataset.bottom!=null)el.scrollTop=el.scrollHeight});
  if(aeId){const el=document.getElementById(aeId);if(el){el.focus();if(sel)try{el.setSelectionRange(sel[0],sel[1])}catch(e){}}}
  if(v.querySelector('[data-photo]'))hydratePhotos();
}

/* ---------- Today ---------- */
function attention(){
  const t=todayStr(),out=[];
  all('jobs').forEach(j=>{const c=jobClient(j);if(!c)return;const nm=c.name;
    if(j.closingDate&&!['installed','complete','lost'].includes(j.stage)){const d=daysBetween(t,j.closingDate);if(d>=0&&d<=10)out.push({sev:'bad',t:`${nm}: home closes ${d===0?'today':'in '+d+' day'+(d===1?'':'s')}`,s:`Stage: ${STAGE_LABEL[j.stage]}. Real estate deadline.`,act:'job',id:j.id})}
    if(j.stage==='lead'&&!jobAppts(j.id).length)out.push({sev:'warn',t:`New lead: ${nm}`,s:`${c.city||''}${j.reason?' · '+j.reason:''} · not scheduled yet`,act:'job',id:j.id});
    if(j.stage==='installed'&&!jobAppts(j.id).some(a=>a.kind==='post_test'))out.push({sev:'warn',t:`Schedule post-mitigation test: ${nm}`,s:`Installed ${j.installDate?fmtD(j.installDate):''}. Retest 24 hrs to 30 days after install.`,act:'newAppt',id:j.id,kind:'post_test'});
    if(j.stage==='testing'&&j.preLevel!=null&&j.preLevel!==''&&+j.preLevel>=4&&!jobDocs(j.id).some(d=>d.kind==='quote'))out.push({sev:'warn',t:`Send a quote: ${nm}`,s:`Tested ${(+j.preLevel).toFixed(1)} pCi/L, above the 4.0 action level.`,act:'job',id:j.id});
    if(j.stage==='complete'&&j.postLevel!==''&&j.postLevel!=null&&+j.postLevel>=4)out.push({sev:'bad',t:`Post-test still high: ${nm}`,s:`${(+j.postLevel).toFixed(1)} pCi/L after install. Schedule a service call.`,act:'job',id:j.id});
  });
  all('billing').forEach(b=>{const c=client(b.clientId);const nm=c?c.name:'Client';
    if(b.kind==='quote'&&b.status==='sent'&&b.sentAt&&daysBetween(b.sentAt.slice(0,10),t)>=4)out.push({sev:'warn',t:`Follow up on quote ${b.number}: ${nm}`,s:`${money0(docTotals(b).total)} · sent ${daysBetween(b.sentAt.slice(0,10),t)} days ago`,act:'doc',id:b.id});
    if(invoiceStatus(b)==='overdue')out.push({sev:'bad',t:`Overdue invoice ${b.number}: ${nm}`,s:`${money(docTotals(b).total)} · due ${fmtD(b.due)}`,act:'doc',id:b.id});
  });
  const tom=addDays(t,1);const unrem=apptsOn(tom).filter(a=>!a.reminded);
  if(unrem.length)out.unshift({sev:'acc',t:`${unrem.length} reminder${unrem.length>1?'s':''} to send for tomorrow`,s:'Text each client their arrival window.',act:'sendReminders'});
  const unread=all('threads').filter(x=>+x.unread>0);
  unread.forEach(th=>{const c=client(th.clientId);if(c)out.unshift({sev:'acc',t:`New message from ${c.name}`,s:(th.messages||[]).slice(-1)[0]?.text||'',act:'thread',id:th.id})});
  const rank={bad:0,acc:1,warn:2};return out.sort((a,b)=>rank[a.sev]-rank[b.sev]);
}
function vDash(){
  const t=todayStr(),c=cfg();
  const today=apptsOn(t).sort((a,b)=>a.start.localeCompare(b.start));
  const open=all('jobs').filter(j=>!['complete','lost'].includes(j.stage));
  const quotes=all('billing').filter(b=>b.kind==='quote'&&b.status==='sent');
  const unpaid=all('billing').filter(b=>['unpaid','overdue'].includes(invoiceStatus(b)));
  const month=t.slice(0,7);
  const paidMonth=sum(all('billing').filter(b=>b.kind==='invoice'&&b.status==='paid'&&(b.paidAt||'').slice(0,7)===month).map(b=>docTotals(b).total));
  const att=attention();
  const results=all('jobs').filter(j=>j.preLevel!==''&&j.preLevel!=null&&j.postLevel!==''&&j.postLevel!=null);
  const avgPre=results.length?sum(results.map(j=>j.preLevel))/results.length:0,avgPost=results.length?sum(results.map(j=>j.postLevel))/results.length:0;
  const noSetup=!all('crews').length&&!all('clients').length;
  const hello=new Date().getHours()<12?'Good morning':new Date().getHours()<17?'Good afternoon':'Good evening';
  return`
  <div class="head"><div><div class="eyebrow">${esc(fmtD(t,{weekday:'long',month:'long',day:'numeric'}))}</div><h1>${hello}</h1><div class="sub">${today.length?`${today.length} visit${today.length>1?'s':''} on the board today across ${new Set(today.map(a=>a.crewId).filter(Boolean)).size||0} crew${new Set(today.map(a=>a.crewId).filter(Boolean)).size===1?'':'s'}.`:'Nothing on the board today.'}</div></div>
  <div class="row" data-write><button class="btn" data-act="newAppt">Schedule visit</button><button class="btn primary" data-act="newLead">New lead</button></div></div>
  ${noSetup?`<div class="panel"><h2>Set up ${esc(c.company)}</h2><div class="list">
     <div class="li" data-act="go" data-r="settings"><span class="pill acc">1</span><div class="li-main"><div class="li-t">Add your company details and crews</div><div class="li-s">Crews appear as rows on the schedule.</div></div></div>
     <div class="li" data-act="newLead"><span class="pill acc">2</span><div class="li-main"><div class="li-t">Add your first lead</div><div class="li-s">A homeowner, their address, and why they called.</div></div></div>
     <div class="li" data-act="go" data-r="schedule"><span class="pill acc">3</span><div class="li-main"><div class="li-t">Book a test or install</div><div class="li-s">Drag visits between days and crews.</div></div></div></div></div>`:''}
  <div class="kpis">
    <div class="kpi"><span class="l">Open jobs</span><span class="v">${open.length}</span><span class="small muted">${open.filter(j=>j.stage==='lead').length} new leads</span></div>
    <div class="kpi"><span class="l">Quotes waiting</span><span class="v">${money0(sum(quotes.map(b=>docTotals(b).total)))}</span><span class="small muted">${quotes.length} sent, not yet approved</span></div>
    <div class="kpi"><span class="l">Unpaid invoices</span><span class="v">${money0(sum(unpaid.map(b=>docTotals(b).total)))}</span><span class="small muted">${unpaid.filter(b=>invoiceStatus(b)==='overdue').length} overdue</span></div>
    <div class="kpi"><span class="l">Collected in ${esc(fmtD(t,{month:'long'}))}</span><span class="v">${money0(paidMonth)}</span><span class="small muted">from paid invoices</span></div>
  </div>
  <div class="cols">
    <div class="panel"><div class="ph"><h2>Today's visits</h2><button class="btn ghost sm" data-act="go" data-r="schedule">Full schedule</button></div>
      ${today.length?`<div class="list">${today.map(apptRow).join('')}</div>`:`<div class="empty"><b>No visits today</b>Book tests and installs from the schedule.</div>`}
    </div>
    <div class="panel"><div class="ph"><h2>Needs attention</h2><span class="pill">${att.length}</span></div>
      ${att.length?`<div class="list">${att.slice(0,9).map(a=>`<div class="li" data-act="${a.act}" data-id="${a.id||''}" ${a.kind?`data-kind="${a.kind}"`:''}><span class="stripe" style="background:var(--${a.sev==='acc'?'accent':a.sev})"></span><div class="li-main"><div class="li-t">${esc(a.t)}</div><div class="li-s">${esc(a.s)}</div></div></div>`).join('')}</div>`:`<div class="empty"><b>All caught up</b>Follow-ups, deadlines and overdue invoices show up here.</div>`}
    </div>
  </div>
  <div class="cols">
    <div class="panel"><h2>Pipeline</h2>${pipelineBar()}</div>
    <div class="panel"><h2>Mitigation results</h2>${results.length?`
      <div class="row" style="justify-content:space-between"><div><div class="eyebrow">Avg before</div><div class="lvl" style="font-size:1.4rem;color:var(--bad)">${avgPre.toFixed(1)}</div></div><div><div class="eyebrow">Avg after</div><div class="lvl" style="font-size:1.4rem;color:var(--good)">${avgPost.toFixed(1)}</div></div><div><div class="eyebrow">Reduction</div><div class="lvl" style="font-size:1.4rem">${avgPre?Math.round((1-avgPost/avgPre)*100):0}%</div></div></div>
      <div class="small muted" style="margin-top:8px">${results.length} homes with before and after readings, in pCi/L. EPA action level is 4.0.</div>`:`<div class="empty"><b>No before-and-after readings yet</b>Enter pre- and post-mitigation levels on a job to track results.</div>`}</div>
  </div>`;
}
function pipelineBar(){
  const counts=STAGES.filter(s=>s[0]!=='lost').map(([k,l])=>[k,l,all('jobs').filter(j=>j.stage===k).length]);
  const max=Math.max(1,...counts.map(c=>c[2]));
  return`<div class="list">${counts.map(([k,l,n])=>`<div class="li" data-act="go" data-r="jobs" style="cursor:pointer"><div style="width:150px;flex:none" class="small">${l}</div><div style="flex:1;height:10px;background:var(--surface-2);border-radius:5px;overflow:hidden"><div style="height:100%;width:${n/max*100}%;background:var(--accent);border-radius:5px"></div></div><span class="num small" style="width:28px;text-align:right">${n}</span></div>`).join('')}</div>`;
}
function apptRow(a){
  const c=apptClient(a),cr=crew(a.crewId),k=KINDS[a.kind]||{};
  return`<div class="li" data-act="appt" data-id="${a.id}"><span class="stripe k-${a.kind}" style="background:var(--k)"></span><span class="time">${fmtT(a.start)}</span><div class="li-main"><div class="li-t">${esc(c?c.name:'Unknown client')} · ${esc(k.label||a.kind)}</div><div class="li-s">${esc(c?[c.address,c.city].filter(Boolean).join(', '):'')}${cr?' · '+esc(cr.name):' · Unassigned'}</div></div>${statusPill(a.status)}</div>`;
}
function statusPill(s){const m={scheduled:'',confirmed:'acc',en_route:'warn',arrived:'warn',done:'good',cancelled:'bad'};return`<span class="pill ${m[s]||''}">${esc((APPT_STATUS.find(x=>x[0]===s)||[,'Scheduled'])[1])}</span>`}

/* ---------- Schedule ---------- */
function vSchedule(){
  const days=[...Array(6)].map((_,i)=>addDays(S.weekStart,i)),t=todayStr();
  const rows=[...crews().map(c=>({id:c.id,name:c.name,color:c.color,sub:c.lead?'Lead: '+c.lead:''})),{id:'',name:'Unassigned',sub:'Drag onto a crew'}];
  const clash=new Set();
  crews().forEach(c=>days.forEach(d=>{const l=all('appts').filter(a=>a.crewId===c.id&&a.date===d&&a.status!=='cancelled');l.forEach(a=>l.forEach(b=>{if(a!==b&&toMin(a.start)<toMin(b.start)+(+b.hours||1)*60&&toMin(b.start)<toMin(a.start)+(+a.hours||1)*60){clash.add(a.id)}}))}));
  const queue=waitingQueue();
  const end=addDays(S.weekStart,5);
  return`<div class="head"><div><div class="eyebrow">Week of ${esc(fmtD(S.weekStart,{month:'long',day:'numeric'}))}</div><h1>Schedule</h1><div class="sub">Drag a visit to move it to another day or crew. Red cards overlap another visit for the same crew.</div></div>
  <div class="row"><div class="seg"><button data-act="wk" data-n="-7" aria-label="Previous week">‹ Prev</button><button data-act="wk" data-n="0">This week</button><button data-act="wk" data-n="7" aria-label="Next week">Next ›</button></div><button class="btn primary" data-act="newAppt" data-write>Schedule visit</button></div></div>
  <div class="legend">${Object.entries(KINDS).filter(([k])=>k!=='test_pickup').map(([k,v])=>`<span class="k-${k}"><i></i>${k==='test_place'?'Radon test drop/pickup':v.label}</span>`).join('')}</div>
  <div class="wk-wrap"><table class="wk"><thead><tr><th class="crew">Crew</th>${days.map(d=>`<th class="${d===t?'today':''}">${fmtD(d,{weekday:'short'})}<span class="d">${fmtD(d,{month:'short',day:'numeric'})}</span></th>`).join('')}</tr></thead><tbody>
  ${rows.map(r=>`<tr><td class="crewcell"><b>${r.id?`<span class="dot" style="background:var(--${r.color||'c1'});margin:0"></span>`:''}${esc(r.name)}</b><span class="small muted">${esc(r.sub)}</span></td>
   ${days.map(d=>{const l=all('appts').filter(a=>(a.crewId||'')===r.id&&a.date===d&&a.status!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start));
     return`<td class="cell ${d===t?'today':''}" data-drop="cell" data-date="${d}" data-crew="${r.id}">${l.map(a=>{const c=apptClient(a);return`<div class="ap k-${a.kind} ${a.status==='done'?'done':''} ${clash.has(a.id)?'clash':''}" draggable="true" data-drag="appt" data-id="${a.id}" data-act="appt" title="${esc((KINDS[a.kind]||{}).label)} · ${esc(c?c.name:'')}"><span class="t">${fmtT(a.start)}</span> ${esc((KINDS[a.kind]||{}).short||'')}<span class="n">${esc(c?c.name:'Unknown')}</span></div>`}).join('')}<button class="add" data-act="newAppt" data-date="${d}" data-crew="${r.id}" aria-label="Add visit on ${fmtD(d)}" data-write>+</button></td>`}).join('')}</tr>`).join('')}
  </tbody></table></div>
  ${!crews().length?`<div class="empty"><b>No crews yet</b>Add crews in Settings so each one gets its own row. <button class="btn sm" data-act="go" data-r="settings" style="margin-left:6px">Add crews</button></div>`:''}
  <div class="cols"><div class="panel"><div class="ph"><h2>Waiting to be scheduled</h2><span class="pill">${queue.length}</span></div>
   ${queue.length?`<div class="list">${queue.map(q=>`<div class="li" style="cursor:default"><div class="li-main"><div class="li-t">${esc(q.name)}</div><div class="li-s">${esc(q.why)}</div></div><button class="btn sm" data-act="newAppt" data-id="${q.jobId}" data-kind="${q.kind}" data-write>Book ${esc(KINDS[q.kind].short.toLowerCase())}</button></div>`).join('')}</div>`:`<div class="empty"><b>Nothing waiting</b>Leads, approved quotes and retests that need a visit show up here.</div>`}</div>
   <div class="panel"><h2>Crew load this week</h2>${crews().length?`<div class="list">${crews().map(c=>{const hrs=sum(all('appts').filter(a=>a.crewId===c.id&&a.date>=S.weekStart&&a.date<=end&&a.status!=='cancelled').map(a=>+a.hours||0));return`<div class="li" style="cursor:default"><span class="dot" style="background:var(--${c.color||'c1'})"></span><div class="li-main"><div class="li-t">${esc(c.name)}</div></div><div style="width:40%;height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${Math.min(100,hrs/50*100)}%;background:var(--${hrs>45?'bad':c.color||'c1'})"></div></div><span class="num small" style="width:60px;text-align:right">${hrs.toFixed(1)} h</span></div>`}).join('')}</div><div class="small muted" style="margin-top:6px">Bar fills at 50 booked hours.</div>`:'<div class="empty">No crews yet.</div>'}</div></div>`;
}
function waitingQueue(){
  const q=[];
  all('jobs').forEach(j=>{const c=jobClient(j);if(!c)return;const ap=jobAppts(j.id).filter(a=>a.status!=='cancelled');const future=ap.filter(a=>a.status!=='done');
    if(future.length)return;
    if(j.stage==='lead')q.push({jobId:j.id,name:c.name,why:`New lead · ${c.city||''}${j.preLevel?` · reported ${j.preLevel} pCi/L`:''}`,kind:j.preLevel&&+j.preLevel>=4?'estimate':'test_place'});
    else if(j.stage==='testing'&&ap.some(a=>a.kind==='test_place'&&a.status==='done')&&!ap.some(a=>a.kind==='test_pickup'))q.push({jobId:j.id,name:c.name,why:'Test device placed · needs pickup',kind:'test_pickup'});
    else if(j.stage==='booked')q.push({jobId:j.id,name:c.name,why:'Quote approved · install not on the calendar',kind:'install'});
    else if(j.stage==='installed')q.push({jobId:j.id,name:c.name,why:'Installed · needs post-mitigation test',kind:'post_test'});
  });
  return q;
}

/* ---------- Jobs board ---------- */
function vJobs(){
  const q=S.jobQ.toLowerCase();
  const list=all('jobs').filter(j=>{if(!q)return true;const c=jobClient(j);return[c?.name,c?.city,c?.address,c?.phone].join(' ').toLowerCase().includes(q)});
  const t=todayStr();
  return`<div class="head"><div><h1>Jobs</h1><div class="sub">Each job follows one home from first call to a passing post-mitigation test. Drag cards between stages.</div></div>
  <div class="row"><input type="search" id="jobQ" data-keep placeholder="Search name, city, phone" value="${esc(S.jobQ)}" style="width:240px" data-inp="jobQ"><button class="btn primary" data-act="newLead" data-write>New lead</button></div></div>
  <div class="board-wrap"><div class="board">${STAGES.map(([k,l])=>{const js=list.filter(j=>j.stage===k).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
   return`<div class="col" data-drop="stage" data-stage="${k}"><div class="col-h"><b>${l}</b><span>${js.length}${js.length?' · '+money0(sum(js.map(jobValue))):''}</span></div>
   ${js.map(j=>{const c=jobClient(j);const na=jobAppts(j.id).find(a=>a.date>=t&&a.status!=='done'&&a.status!=='cancelled');const urgent=j.closingDate&&daysBetween(t,j.closingDate)<=10&&daysBetween(t,j.closingDate)>=0&&!['installed','complete','lost'].includes(k);
     return`<div class="card ${urgent?'urgent':''}" draggable="true" data-drag="job" data-id="${j.id}" data-act="job"><div class="ct">${esc(c?c.name:'Unknown client')}</div><div class="small muted">${esc(c?[c.city,c.foundation].filter(Boolean).join(' · '):'')}</div>
       <div class="cm">${j.postLevel!==''&&j.postLevel!=null?lvlPill(j.postLevel):j.preLevel!==''&&j.preLevel!=null?lvlPill(j.preLevel):'<span class="pill">Not tested</span>'}${jobValue(j)?`<span class="num">${money0(jobValue(j))}</span>`:''}</div>
       ${na?`<div class="small"><span class="muted">Next:</span> ${esc(KINDS[na.kind]?.short)} ${esc(relDay(na.date))} ${fmtT(na.start)}</div>`:''}
       ${urgent?`<div class="small" style="color:var(--bad);font-weight:600">Closing ${esc(fmtD(j.closingDate))}</div>`:''}</div>`}).join('')||'<div class="small muted" style="padding:6px 2px">No jobs</div>'}</div>`}).join('')}</div></div>`;
}

/* ---------- Clients ---------- */
function vClients(){
  const q=S.q.toLowerCase();
  const list=all('clients').filter(c=>!q||[c.name,c.city,c.address,c.phone,c.email,c.county].join(' ').toLowerCase().includes(q)).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  return`<div class="head"><div><h1>Clients</h1><div class="sub">${all('clients').length} homeowners and properties.</div></div>
  <div class="row"><input type="search" id="clientQ" data-keep placeholder="Search name, city, phone, email" value="${esc(S.q)}" style="width:260px" data-inp="q"><button class="btn primary" data-act="newLead" data-write>New client</button></div></div>
  <div class="panel" style="padding:4px 8px">${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Property</th><th>Phone</th><th>Foundation</th><th>Latest reading</th><th>Open job</th></tr></thead><tbody>
  ${list.map(c=>{const js=clientJobs(c.id);const j=js[0];const lv=j?(j.postLevel!==''&&j.postLevel!=null?j.postLevel:j.preLevel):null;
    return`<tr class="click" data-act="client" data-id="${c.id}"><td><b>${esc(c.name)}</b><div class="small muted">${esc(c.email||'')}</div></td><td>${esc(c.address||'')}<div class="small muted">${esc([c.city,c.county?c.county+' Co.':''].filter(Boolean).join(' · '))}</div></td><td class="num small">${esc(c.phone||'')}</td><td class="small">${esc(c.foundation||'')}</td><td>${lv!==null&&lv!==''&&lv!==undefined?lvlPill(lv):'<span class="small muted">None</span>'}</td><td>${j?`<span class="pill ${j.stage==='complete'?'good':j.stage==='lost'?'':'acc'}">${esc(STAGE_LABEL[j.stage])}</span>`:''}</td></tr>`}).join('')}
  </tbody></table></div>`:`<div class="empty" style="margin:12px"><b>${q?'No matches':'No clients yet'}</b>${q?'Try a different search.':'Add a homeowner with New client.'}</div>`}</div>`;
}

/* ---------- Inbox ---------- */
function vInbox(){
  const q=S.inboxQ.toLowerCase();
  const threads=all('threads').filter(t=>client(t.clientId)).sort((a,b)=>(b.lastAt||'').localeCompare(a.lastAt||''));
  const extra=q?all('clients').filter(c=>!S.threads[c.id]&&(c.name||'').toLowerCase().includes(q)):[];
  const shown=threads.filter(t=>!q||(client(t.clientId).name||'').toLowerCase().includes(q));
  const sel=S.inboxSel&&client(S.inboxSel)?S.inboxSel:null;
  const tom=addDays(todayStr(),1);const unrem=apptsOn(tom).filter(a=>!a.reminded);
  return`<div class="head"><div><h1>Messages</h1><div class="sub">Every text and email to a client, in one place. Messages are recorded here; they go out for real once a texting service is connected.</div></div>
  ${unrem.length?`<button class="btn primary" data-act="sendReminders" data-write>Send ${unrem.length} reminder${unrem.length>1?'s':''} for tomorrow</button>`:''}</div>
  <div class="inbox ${sel?'has-sel':''}"><div class="threads"><div class="tsearch"><input type="search" id="inboxQ" data-keep data-inp="inboxQ" placeholder="Find a client to message" value="${esc(S.inboxQ)}"></div>
   <div class="tlist" data-scroll="tl">${shown.map(t=>{const c=client(t.clientId);const lm=(t.messages||[]).slice(-1)[0];return`<div class="th ${t.id===sel?'on':''} ${+t.unread?'unread':''}" data-act="thread" data-id="${t.id}"><div class="tt">${esc(c.name)}${+t.unread?` <span class="badge" style="color:#fff">${t.unread}</span>`:''}<span>${esc(ago(t.lastAt))}</span></div><div class="tp">${lm?(lm.dir==='out'?'You: ':'')+esc(lm.text):''}</div></div>`}).join('')}
   ${extra.map(c=>`<div class="th" data-act="thread" data-id="${c.id}"><div class="tt">${esc(c.name)}<span>new</span></div><div class="tp">Start a conversation</div></div>`).join('')}
   ${!shown.length&&!extra.length?`<div class="empty" style="margin:12px">${q?'No clients match.':'No conversations yet. Search for a client to start one.'}</div>`:''}</div></div>
   <div class="convo">${sel?convo(sel):`<div class="empty" style="margin:auto">Pick a conversation.</div>`}</div></div>`;
}
function convo(cid){
  const c=client(cid),t=S.threads[cid]||{messages:[]},tpls=cfg().templates||DEFAULT_TEMPLATES;
  return`<div class="convo-h"><div class="row"><button class="btn ghost sm" data-act="thread" data-id="" aria-label="Back to conversations">‹</button><div><b>${esc(c.name)}</b><div class="small muted num">${esc(c.phone||'No phone')} · ${esc(c.email||'No email')}</div></div></div><button class="btn sm" data-act="client" data-id="${cid}">Client record</button></div>
  <div class="msgs" data-scroll="m-${cid}" data-bottom>${(t.messages||[]).map(m=>`<div class="msg ${m.dir}">${esc(m.text)}<div class="msg-m">${m.dir==='out'?(m.channel==='email'?'Email':'Text')+' · recorded':'Client reply'} · ${esc(new Date(m.at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}${m.by?' · '+esc(m.by):''}</div></div>`).join('')||'<div class="small muted" style="margin:auto">No messages yet.</div>'}</div>
  <form class="compose" data-form="send" data-cid="${cid}" data-write><div class="row"><select id="tplSel" data-act-change="tpl" data-cid="${cid}" style="flex:1;min-width:160px"><option value="">Insert a template…</option>${tpls.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
   <select id="chanSel" name="channel" data-keep style="width:110px"><option value="sms">Text</option><option value="email">Email</option></select></div>
   <textarea id="compose-${cid}" name="text" data-keep placeholder="Write a message to ${esc(first(c.name))}" rows="3"></textarea>
   <div class="row" style="justify-content:space-between"><button type="button" class="btn sm" data-act="logReply" data-cid="${cid}">Log their reply</button><button class="btn primary">Send</button></div></form>`;
}
function tplCtx(cid,extra={}){
  const c=client(cid)||{},cf=cfg();const a=extra.appt||nextAppt(cid);const j=extra.job||clientJobs(cid)[0]||{};const d=extra.doc||all('billing').filter(b=>b.clientId===cid).sort((x,y)=>(y.issued||'').localeCompare(x.issued||''))[0];
  return{first:first(c.name),name:c.name||'',company:cf.company,phone:cf.phone||'our office',address:c.address||'your home',
    visit:a?(KINDS[a.kind]?.label||'visit').toLowerCase():'visit',date:a?fmtD(a.date,{weekday:'long',month:'long',day:'numeric'}):'[date]',time:a?fmtT(a.start):'[time]',crew:a&&crew(a.crewId)?crew(a.crewId).lead||crew(a.crewId).name:'Our crew',
    level:j.preLevel!=null&&j.preLevel!==''?(+j.preLevel).toFixed(1):'[level]',post:j.postLevel!=null&&j.postLevel!==''?(+j.postLevel).toFixed(1):'[result]',
    doc:d?d.number:'[number]',amount:d?money(docTotals(d).total):'[amount]'};
}
function fillTpl(text,ctx){return String(text).replace(/\{(\w+)\}/g,(m,k)=>k in ctx?ctx[k]:m)}

/* ---------- Billing ---------- */
function vBilling(){
  const k=S.billTab;
  const list=all('billing').filter(b=>b.kind===k).sort((a,b)=>(b.number||'').localeCompare(a.number||'',undefined,{numeric:true}));
  const unpaid=all('billing').filter(b=>['unpaid','overdue'].includes(invoiceStatus(b)));
  const quotesOpen=all('billing').filter(b=>b.kind==='quote'&&b.status==='sent');
  return`<div class="head"><div><h1>Billing</h1><div class="sub">${money(sum(unpaid.map(b=>docTotals(b).total)))} unpaid · ${money(sum(quotesOpen.map(b=>docTotals(b).total)))} in open quotes</div></div>
  <div class="row"><div class="seg"><button class="${k==='quote'?'on':''}" data-act="billTab" data-k="quote">Quotes</button><button class="${k==='invoice'?'on':''}" data-act="billTab" data-k="invoice">Invoices</button></div><button class="btn primary" data-act="newDoc" data-k="${k}" data-write>New ${k}</button></div></div>
  <div class="panel" style="padding:4px 8px">${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Number</th><th>Client</th><th>${k==='quote'?'Issued':'Issued'}</th><th>${k==='quote'?'Valid until':'Due'}</th><th class="r">Total</th><th>Status</th></tr></thead><tbody>
  ${list.map(b=>{const c=client(b.clientId);const st=invoiceStatus(b);return`<tr class="click" data-act="doc" data-id="${b.id}"><td class="num"><b>${esc(b.number)}</b></td><td>${esc(c?c.name:'')}<div class="small muted">${esc(c?.city||'')}</div></td><td class="small">${esc(fmtD(b.issued))}</td><td class="small">${esc(fmtD(b.due))}</td><td class="r num">${money(docTotals(b).total)}</td><td><span class="pill ${STATUS_PILL[st]||''}">${esc(st[0].toUpperCase()+st.slice(1))}</span></td></tr>`}).join('')}
  </tbody></table></div>`:`<div class="empty" style="margin:12px"><b>No ${k}s yet</b>Create one from a job or with New ${k}.</div>`}</div>`;
}
function nextNumber(kind){const pre=kind==='quote'?'Q-':'INV-';const n=Math.max(1000,...all('billing').filter(b=>b.kind===kind).map(b=>parseInt(String(b.number||'').replace(/\D/g,''))||0));return pre+(n+1)}

/* ---------- Crew phone view ---------- */
function vCrew(){
  const cs=crews();const crewUser=isCrew();
  if(crewUser)S.crewId=S.profile.crewId||null;else if(!S.crewId||!crew(S.crewId))S.crewId=cs[0]?.id||null;
  const d=S.crewDate;const list=apptsOn(d).filter(a=>a.crewId===S.crewId).sort((a,b)=>a.start.localeCompare(b.start));
  const cr=crew(S.crewId);
  const signout=`<button class="btn sm mobile-signout" data-act="signOut">Sign out</button>`;
  if(crewUser&&!cr)return`<div class="crewv"><div class="head"><div><div class="eyebrow">Crew app</div><h1>No crew assigned</h1></div>${signout}</div><div class="empty"><b>You're not on a crew yet</b>Ask the office to assign you to a crew in Settings, under Team. Your stops show up here once they do.</div></div>`;
  return`<div class="crewv"><div class="head"><div><div class="eyebrow">${crewUser?esc(cr.name):'Crew app'}</div><h1>${esc(relDay(d))}</h1><div class="sub">${esc(fmtD(d,{weekday:'long',month:'long',day:'numeric'}))} · ${list.length} stop${list.length===1?'':'s'}</div></div>${crewUser?signout:''}</div>
  ${cs.length||crewUser?`<div class="row">${crewUser?'':`<select id="crewSel" data-act-change="crewSel" style="flex:1" aria-label="Crew">${cs.map(c=>`<option value="${c.id}" ${c.id===S.crewId?'selected':''}>${esc(c.name)}${c.lead?' · '+esc(c.lead):''}</option>`).join('')}</select>`}
   <div class="seg"><button data-act="crewDay" data-n="-1" aria-label="Previous day">‹</button><button data-act="crewDay" data-n="0">Today</button><button data-act="crewDay" data-n="1" aria-label="Next day">›</button></div></div>
  ${list.map(a=>crewCard(a,cr)).join('')||`<div class="empty"><b>No stops</b>Nothing is booked for this crew on this day.</div>`}
  ${crewUser?'':`<div class="small muted">This is what crews see on their phones. Give each crew member a login and assign their crew in Settings, under Team.</div>`}`:`<div class="empty"><b>No crews yet</b>Add crews in Settings first.</div>`}</div>`;
}
function crewCard(a,cr){
  const c=apptClient(a)||{},j=job(a.jobId)||{},k=KINDS[a.kind]||{};
  const addr=[c.address,c.city,'MO',c.zip].filter(Boolean).join(', ');
  const open=S.crewOpen===a.id;
  const needsLevel=a.kind==='test_pickup'||a.kind==='post_test';
  return`<div class="job-c k-${a.kind}"><div class="top"><div class="when"><span>${fmtT(a.start)} · ${(+a.hours||0)} h</span>${statusPill(a.status)}</div>
   <div class="eyebrow" style="color:var(--k)">${esc(k.label)}</div><div class="who">${esc(c.name||'Unknown client')}</div>
   <div class="copyline"><span class="sel">${esc(addr)}</span><button class="btn sm" data-act="copy" data-v="${esc(addr)}">Copy</button><a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" rel="noopener">Directions</a></div>
   <div class="copyline"><span class="sel num">${esc(c.phone||'No phone on file')}</span>${c.phone?`<button class="btn sm" data-act="copy" data-v="${esc(c.phone)}">Copy</button>`:''}</div>
   <div class="small muted">${esc([c.foundation,j.sqft?j.sqft+' sq ft':'',j.sump==='yes'?'Has sump':''].filter(Boolean).join(' · '))}</div>
   ${j.preLevel!==''&&j.preLevel!=null?`<div class="small">Pre-mitigation: ${lvlPill(j.preLevel)}</div>`:''}
   ${a.notes?`<div class="small" style="background:var(--surface-2);padding:8px 10px;border-radius:6px">${esc(a.notes)}</div>`:''}
   ${j.accessNotes?`<div class="small" style="background:var(--warn-soft);padding:8px 10px;border-radius:6px"><b>Access:</b> ${esc(j.accessNotes)}</div>`:''}</div>
   ${a.status==='done'?`<div class="done-f"><div class="small"><b>Completed</b> ${a.completedAt?esc(new Date(a.completedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})):''}${a.result!=null&&a.result!==''?` · Result ${lvlPill(a.result)}`:''}${a.manometer?` · Manometer ${esc(a.manometer)}" WC`:''}</div>${a.crewNotes?`<div class="small muted">${esc(a.crewNotes)}</div>`:''}</div>`:`
   <div class="acts"><button class="btn big" data-act="crewStatus" data-id="${a.id}" data-s="en_route" ${a.status==='en_route'?'disabled':''}>On my way</button><button class="btn big" data-act="crewStatus" data-id="${a.id}" data-s="arrived" ${a.status==='arrived'?'disabled':''}>Arrived</button><button class="btn big primary" data-act="crewOpen" data-id="${a.id}">Finish</button></div>
   ${open?`<form class="done-f" data-form="crewDone" data-id="${a.id}">
     ${needsLevel?`<label class="f"><span>${a.kind==='post_test'?'Post-mitigation result':'Test result'} (pCi/L)</span><input type="number" step="0.1" min="0" name="result" id="cd-res-${a.id}" required inputmode="decimal"></label>`:''}
     ${a.kind==='install'?`<div class="grid2"><label class="f"><span>Manometer reading (in. WC)</span><input type="number" step="0.01" name="manometer" id="cd-man-${a.id}" inputmode="decimal"></label><label class="f"><span>Fan model</span><input type="text" name="fan" id="cd-fan-${a.id}" value="${esc(j.fan||'')}"></label><label class="f"><span>Suction points</span><input type="number" name="points" id="cd-pts-${a.id}" min="1" value="${esc(j.points||1)}"></label><label class="f"><span>Discharge location</span><input type="text" name="discharge" id="cd-dis-${a.id}" value="${esc(j.discharge||'')}" placeholder="Above roofline, side of garage"></label></div>
       <div>${CHECKLIST.map((x,i)=>`<label class="check"><input type="checkbox" name="ck${i}" id="cd-ck${i}-${a.id}" ${(j.checklist||{})[x]?'checked':''}>${esc(x)}</label>`).join('')}</div>`:''}
     <label class="f"><span>Notes for the office</span><textarea name="notes" id="cd-notes-${a.id}" rows="2" placeholder="Anything the office should know"></textarea></label>
     <div class="row" style="justify-content:space-between"><button type="button" class="btn" data-act="crewOpen" data-id="">Cancel</button><button class="btn primary big">Mark complete</button></div></form>`:''}`}
   <div class="done-f" style="gap:8px"><div class="eyebrow">Photos</div>${photoBlock(a.jobId,a.id)}</div>
  </div>`;
}

/* ---------- Settings ---------- */
function teamPanel(){
  const ps=all('profiles').sort((a,b)=>(a.role==='pending'?0:1)-(b.role==='pending'?0:1)||(a.fullName||a.email||'').localeCompare(b.fullName||b.email||''));
  const owner=isOwner();const pending=ps.filter(p=>p.role==='pending').length;
  const roles=[['owner','Owner'],['office','Office'],['crew','Crew'],['pending','Not approved']];
  return`<form class="panel" data-form="team"><div class="ph"><h2>Team</h2>${pending?`<span class="pill warn">${pending} waiting for approval</span>`:''}</div>
   <p class="small muted" style="margin:0 0 10px">To add someone, send them this site's link. They create an account, then show up here. Office can see and change everything. Crew only see their own crew's stops on their phone.${owner?'':' Only the owner can change roles.'}</p>
   <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th style="width:170px">Role</th><th style="width:170px">Crew</th></tr></thead><tbody>
   ${ps.map(p=>`<tr data-member="${p.id}"><td><b>${esc(p.fullName||'(no name)')}</b><div class="small muted">${esc(p.email||'')}${p.id===S.user?.id?' · you':''}</div></td>
     <td><select name="role" id="tm-r-${p.id}" aria-label="Role" ${!owner||p.id===S.user?.id?'disabled':''}>${roles.map(([k,l])=>`<option value="${k}" ${k===p.role?'selected':''}>${l}</option>`).join('')}</select></td>
     <td><select name="crew" id="tm-c-${p.id}" aria-label="Crew" ${!owner?'disabled':''}><option value="">None</option>${crews().map(c=>`<option value="${c.id}" ${c.id===p.crewId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></td></tr>`).join('')}
   </tbody></table></div>${owner?`<div class="row" style="margin-top:12px"><button class="btn primary">Save team</button></div>`:''}</form>`;
}
function vSettings(){
  const c=cfg();
  return`<div class="head"><div><h1>Settings</h1><div class="sub">Company details used in messages, quotes and invoices.</div></div></div>
  <form class="panel" data-form="company"><h2>Company</h2><div class="grid2">
   <label class="f"><span>Company name</span><input type="text" name="company" id="s-company" value="${esc(c.company)}" required></label>
   <label class="f"><span>Office phone</span><input type="tel" name="phone" id="s-phone" value="${esc(c.phone)}"></label>
   <label class="f"><span>Email</span><input type="email" name="email" id="s-email" value="${esc(c.email)}"></label>
   <label class="f"><span>Service area</span><input type="text" name="area" id="s-area" value="${esc(c.area)}" placeholder="St. Louis metro, St. Charles, Jefferson Co."></label>
   <label class="f"><span>Mitigation certification no. (NRPP or NRSB)</span><input type="text" name="cert" id="s-cert" value="${esc(c.cert)}"></label>
   <label class="f"><span>Sales tax rate on invoices (%)</span><input type="number" step="0.001" min="0" name="taxRate" id="s-tax" value="${esc(c.taxRate)}"></label>
   <label class="f"><span>Quotes valid for (days)</span><input type="number" min="1" name="quoteDays" id="s-qd" value="${esc(c.quoteDays)}"></label>
   <label class="f"><span>Invoice due in (days)</span><input type="number" min="0" name="invoiceDays" id="s-id" value="${esc(c.invoiceDays)}"></label>
  </div><div class="row" style="margin-top:12px" data-write><button class="btn primary">Save company</button></div></form>
  <div class="panel"><div class="ph"><h2>Crews</h2><button class="btn sm" data-act="crewEdit" data-id="" data-write>Add crew</button></div>
   ${all('crews').length?`<div class="list">${all('crews').sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(cr=>`<div class="li" data-act="crewEdit" data-id="${cr.id}"><span class="dot" style="background:var(--${cr.color||'c1'})"></span><div class="li-main"><div class="li-t">${esc(cr.name)}${cr.active===false?' <span class="pill">Inactive</span>':''}</div><div class="li-s">${esc([cr.lead?'Lead: '+cr.lead:'',(cr.members||'')].filter(Boolean).join(' · '))}</div></div><span class="num small muted">${esc(cr.phone||'')}</span></div>`).join('')}</div>`:`<div class="empty"><b>No crews yet</b>Add a crew for each truck you send out.</div>`}</div>
  <form class="panel" data-form="templates"><div class="ph"><h2>Message templates</h2><span class="small muted">Placeholders: {first} {company} {phone} {visit} {date} {time} {crew} {address} {level} {post} {doc} {amount}</span></div>
   <div style="display:flex;flex-direction:column;gap:12px">${(c.templates||DEFAULT_TEMPLATES).map((t,i)=>`<label class="f"><span>${esc(t.name)}</span><textarea name="t_${esc(t.id)}" id="s-t-${esc(t.id)}" rows="2">${esc(t.text)}</textarea></label>`).join('')}</div>
   <div class="row" style="margin-top:12px" data-write><button class="btn primary">Save templates</button></div></form>
  <form class="panel" data-form="pricebook"><div class="ph"><h2>Price book</h2><span class="small muted">Starter prices are examples. Set your own.</span></div>
   <div class="tbl-wrap"><table class="tbl lines"><thead><tr><th>Item</th><th class="r" style="width:120px">Price</th><th style="width:40px"></th></tr></thead><tbody id="pbBody">
   ${(c.pricebook||DEFAULT_PRICEBOOK).map(p=>pbRow(p)).join('')}</tbody></table></div>
   <div class="row" style="margin-top:12px;justify-content:space-between" data-write><button type="button" class="btn sm" data-act="pbAdd">Add item</button><button class="btn primary">Save price book</button></div></form>
  ${teamPanel()}
  ${all('clients').some(x=>x.isSample)||all('crews').some(x=>x.isSample)?`<div class="panel"><h2>Sample data</h2><p class="muted" style="margin:0 0 12px">The example clients, crews, jobs, invoices and messages were added so you can try things out. Remove them when you're ready to use real data. Anything you added yourself stays.</p><button class="btn danger" data-act="clearSample">Delete sample data</button></div>`:''}
  <div class="panel"><div class="who"><div><h2>Your account</h2><div class="small muted">${esc(S.user?.email||'')} · ${esc(S.profile?.role||'')}</div></div><button class="btn" data-act="signOut">Sign out</button></div></div>`;
}
function pbRow(p){return`<tr data-pb="${esc(p.id)}"><td><input type="text" name="pbn_${esc(p.id)}" id="pbn_${esc(p.id)}" value="${esc(p.name)}"></td><td><input type="number" step="0.01" name="pbp_${esc(p.id)}" id="pbp_${esc(p.id)}" value="${esc(p.price)}" style="text-align:right"></td><td><button type="button" class="btn ghost sm" data-act="pbDel" aria-label="Remove item">✕</button></td></tr>`}

/* ---------- drawers ---------- */
function openDrawer(spec){S.drawer=spec;drawDrawer()}
function closeDrawer(){S.drawer=null;$('#drawerRoot').innerHTML='';schedule()}
function drawDrawer(){
  const d=S.drawer;if(!d){$('#drawerRoot').innerHTML='';return}
  const html={appt:dAppt,job:dJob,client:dClient,doc:dDoc,lead:dLead,crew:dCrew}[d.type](d);
  $('#drawerRoot').innerHTML=`<div class="scrim" data-act="closeDrawer"></div><aside class="drawer" role="dialog" aria-modal="true">${html}</aside>`;
  const f=$('#drawerRoot').querySelector('input:not([type=hidden]),select');if(f&&d.focus!==false)setTimeout(()=>f.focus({preventScroll:true}),30);
  if(d.type==='doc')recalc();
}
const dh=(t,sub)=>`<div class="dr-h"><div><h2>${t}</h2>${sub?`<div class="small muted">${sub}</div>`:''}</div><button class="btn ghost" data-act="closeDrawer" aria-label="Close">✕</button></div>`;
function jobOptions(sel){return all('jobs').filter(j=>jobClient(j)).sort((a,b)=>jobClient(a).name.localeCompare(jobClient(b).name)).map(j=>{const c=jobClient(j);return`<option value="${j.id}" ${j.id===sel?'selected':''}>${esc(c.name)} · ${esc(c.city||'')} · ${esc(STAGE_LABEL[j.stage])}</option>`}).join('')}
function crewOptions(sel){return`<option value="">Unassigned</option>`+crews().map(c=>`<option value="${c.id}" ${c.id===sel?'selected':''}>${esc(c.name)}</option>`).join('')}

function dAppt(d){
  const a=d.id?S.appts[d.id]:{kind:d.kind||'test_place',date:d.date||todayStr(),start:'09:00',hours:KINDS[d.kind||'test_place'].hours||KINDS[d.kind||'test_place'].hrs,crewId:d.crew||'',jobId:d.jobId||'',status:'scheduled'};
  if(!a)return dh('Visit not found')+`<div class="dr-b"><div class="empty">This visit was deleted.</div></div>`;
  const c=apptClient(a);
  return dh(d.id?esc((KINDS[a.kind]||{}).label||'Visit'):'Schedule a visit',d.id&&c?esc(c.name)+' · '+esc(fmtD(a.date))+' '+fmtT(a.start):'')+`
  <form data-form="appt" data-id="${d.id||''}" style="display:contents"><div class="dr-b">
   ${all('jobs').length?'':'<div class="banner">Add a lead first. Every visit belongs to a job.</div>'}
   <div class="sec"><div class="grid2">
    <label class="f full"><span>Job</span><select name="jobId" id="a-job" required><option value="">Choose a client's job…</option>${jobOptions(a.jobId)}</select></label>
    <label class="f"><span>Visit type</span><select name="kind" id="a-kind" data-act-change="kindHrs">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${k===a.kind?'selected':''}>${v.label}</option>`).join('')}</select></label>
    <label class="f"><span>Crew</span><select name="crewId" id="a-crew">${crewOptions(a.crewId)}</select></label>
    <label class="f"><span>Date</span><input type="date" name="date" id="a-date" value="${esc(a.date)}" required></label>
    <div class="grid2"><label class="f"><span>Start</span><input type="time" name="start" id="a-start" value="${esc(a.start)}" step="900" required></label><label class="f"><span>Hours</span><input type="number" name="hours" id="a-hours" step="0.25" min="0.25" value="${esc(a.hours)}"></label></div>
    <label class="f"><span>Status</span><select name="status" id="a-status">${APPT_STATUS.map(([k,l])=>`<option value="${k}" ${k===a.status?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="f full"><span>Notes for the crew</span><textarea name="notes" id="a-notes" rows="3">${esc(a.notes||'')}</textarea></label>
   </div></div>
   ${d.id&&a.status==='done'?`<div class="sec"><h3>Crew report</h3><div class="small">${a.result!=null&&a.result!==''?'Result '+lvlPill(a.result):''} ${a.manometer?'Manometer '+esc(a.manometer)+'" WC':''}</div>${a.crewNotes?`<div class="small muted">${esc(a.crewNotes)}</div>`:''}</div>`:''}
   ${d.id?`<div class="sec"><div class="row" style="justify-content:space-between"><div class="small muted">${a.reminded?'Reminder sent':'No reminder sent yet'}</div><div class="row" data-write><button type="button" class="btn sm" data-act="remindOne" data-id="${d.id}">Text reminder</button>${a.jobId?`<button type="button" class="btn sm" data-act="job" data-id="${a.jobId}">Open job</button>`:''}</div></div></div>`:''}
  </div><div class="dr-f">${d.id?`<button type="button" class="btn danger" data-act="del" data-col="appts" data-id="${d.id}" data-write>Delete visit</button>`:'<span></span>'}<div class="row"><button type="button" class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-write>${d.id?'Save visit':'Book visit'}</button></div></div></form>`;
}

function dJob(d){
  const j=S.jobs[d.id];if(!j)return dh('Job not found')+`<div class="dr-b"><div class="empty">This job was deleted.</div></div>`;
  const c=jobClient(j)||{},ap=jobAppts(j.id),docs=jobDocs(j.id),ck=j.checklist||{};
  const gaugePos=v=>Math.min(100,(+v)/10*100);
  return dh(esc(c.name||'Job'),esc([c.address,c.city].filter(Boolean).join(', ')))+`
  <form data-form="job" data-id="${j.id}" style="display:contents"><div class="dr-b">
   <div class="sec"><div class="grid2">
    <label class="f"><span>Stage</span><select name="stage" id="j-stage">${STAGES.map(([k,l])=>`<option value="${k}" ${k===j.stage?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="f"><span>Why they called</span><select name="reason" id="j-reason"><option value=""></option>${REASONS.map(r=>`<option ${r===j.reason?'selected':''}>${r}</option>`).join('')}</select></label>
    <label class="f"><span>Home closing date</span><input type="date" name="closingDate" id="j-close" value="${esc(j.closingDate||'')}"></label>
    <label class="f"><span>Realtor or inspector</span><input type="text" name="agent" id="j-agent" value="${esc(j.agent||'')}"></label>
   </div><div class="copyline"><span class="sel num">${esc(c.phone||'')}</span><span class="muted">·</span><span class="sel">${esc(c.email||'')}</span><button type="button" class="btn sm" data-act="thread" data-id="${c.id}">Message</button><button type="button" class="btn sm" data-act="client" data-id="${c.id}">Client</button></div></div>
   <div class="sec"><h3>Radon readings</h3><div class="grid3">
    <label class="f"><span>Pre-mitigation (pCi/L)</span><input type="number" step="0.1" min="0" name="preLevel" id="j-pre" value="${esc(j.preLevel??'')}"></label>
    <label class="f"><span>Post-mitigation (pCi/L)</span><input type="number" step="0.1" min="0" name="postLevel" id="j-post" value="${esc(j.postLevel??'')}"></label>
    <label class="f"><span>Test method</span><select name="testMethod" id="j-tm">${['','Charcoal canister','Continuous monitor (CRM)','Alpha track (long-term)','Electret'].map(x=>`<option ${x===j.testMethod?'selected':''}>${x}</option>`).join('')}</select></label></div>
    <div><div class="gauge">${j.preLevel!==''&&j.preLevel!=null?`<span class="mk" style="left:${gaugePos(j.preLevel)}%;background:var(--bad)" title="Before"></span>`:''}${j.postLevel!==''&&j.postLevel!=null?`<span class="mk" style="left:${gaugePos(j.postLevel)}%;background:var(--good)" title="After"></span>`:''}<span class="ref"></span></div><div class="gauge-l"><span>0</span><span>2.0</span><span>4.0 action level</span><span>10+</span></div></div></div>
   <div class="sec"><h3>Property</h3><div class="grid3">
    <label class="f"><span>Foundation</span><select name="foundation" id="j-fnd">${['',...FOUNDATIONS].map(x=>`<option ${x===(c.foundation||'')?'selected':''}>${x}</option>`).join('')}</select></label>
    <label class="f"><span>Sq ft (footprint)</span><input type="number" name="sqft" id="j-sqft" value="${esc(j.sqft||'')}"></label>
    <label class="f"><span>Sump pit</span><select name="sump" id="j-sump">${['','yes','no'].map(x=>`<option value="${x}" ${x===(j.sump||'')?'selected':''}>${x?x[0].toUpperCase()+x.slice(1):''}</option>`).join('')}</select></label>
    <label class="f full"><span>Access notes (gate code, pets, where to park)</span><input type="text" name="accessNotes" id="j-acc" value="${esc(j.accessNotes||'')}"></label></div></div>
   <div class="sec"><h3>Mitigation system</h3><div class="grid2">
    <label class="f"><span>Fan model</span><input type="text" name="fan" id="j-fan" value="${esc(j.fan||'')}"></label>
    <label class="f"><span>Suction points</span><input type="number" min="0" name="points" id="j-pts" value="${esc(j.points||'')}"></label>
    <label class="f"><span>Manometer (in. WC)</span><input type="number" step="0.01" name="manometer" id="j-man" value="${esc(j.manometer||'')}"></label>
    <label class="f"><span>Discharge location</span><input type="text" name="discharge" id="j-dis" value="${esc(j.discharge||'')}"></label>
    <label class="f"><span>Install date</span><input type="date" name="installDate" id="j-inst" value="${esc(j.installDate||'')}"></label>
    <label class="f"><span>Warranty (years)</span><input type="number" min="0" name="warranty" id="j-war" value="${esc(j.warranty||'')}"></label></div>
    <div>${CHECKLIST.map((x,i)=>`<label class="check"><input type="checkbox" name="ck${i}" id="j-ck${i}" ${ck[x]?'checked':''}>${esc(x)}</label>`).join('')}</div></div>
   <div class="sec"><div class="ph"><h3>Visits</h3><button type="button" class="btn sm" data-act="newAppt" data-id="${j.id}" data-write>Add visit</button></div>
    ${ap.length?`<div class="list">${ap.map(apptRow).join('')}</div>`:'<div class="small muted">No visits yet.</div>'}</div>
   <div class="sec"><div class="ph"><h3>Quotes and invoices</h3><div class="row" data-write><button type="button" class="btn sm" data-act="newDoc" data-k="quote" data-job="${j.id}">New quote</button><button type="button" class="btn sm" data-act="newDoc" data-k="invoice" data-job="${j.id}">New invoice</button></div></div>
    ${docs.length?`<div class="list">${docs.map(b=>{const st=invoiceStatus(b);return`<div class="li" data-act="doc" data-id="${b.id}"><div class="li-main"><div class="li-t num">${esc(b.number)}</div><div class="li-s">${esc(fmtD(b.issued))}</div></div><span class="num">${money(docTotals(b).total)}</span><span class="pill ${STATUS_PILL[st]||''}">${esc(st)}</span></div>`}).join('')}</div>`:'<div class="small muted">Nothing billed yet.</div>'}</div>
   <div class="sec"><h3>Photos</h3>${photoBlock(j.id,'')}</div>
   <div class="sec"><label class="f"><span>Job notes</span><textarea name="notes" id="j-notes" rows="4">${esc(j.notes||'')}</textarea></label></div>
  </div><div class="dr-f"><button type="button" class="btn danger" data-act="del" data-col="jobs" data-id="${j.id}" data-write>Delete job</button><div class="row"><button type="button" class="btn" data-act="closeDrawer">Close</button><button class="btn primary" data-write>Save job</button></div></div></form>`;
}

function dClient(d){
  const c=S.clients[d.id];if(!c)return dh('Client not found')+`<div class="dr-b"><div class="empty">This client was deleted.</div></div>`;
  const js=clientJobs(c.id),th=S.threads[c.id];
  return dh(esc(c.name),esc(c.source?'Source: '+c.source:''))+`
  <form data-form="client" data-id="${c.id}" style="display:contents"><div class="dr-b">
   <div class="sec"><div class="grid2">${clientFields(c)}</div></div>
   <div class="sec"><div class="ph"><h3>Jobs</h3><button type="button" class="btn sm" data-act="newJob" data-id="${c.id}" data-write>New job at this address</button></div>
    ${js.length?`<div class="list">${js.map(j=>`<div class="li" data-act="job" data-id="${j.id}"><div class="li-main"><div class="li-t">${esc(STAGE_LABEL[j.stage])}</div><div class="li-s">Started ${esc(fmtD((j.createdAt||'').slice(0,10)))}${j.reason?' · '+esc(j.reason):''}</div></div>${j.postLevel!==''&&j.postLevel!=null?lvlPill(j.postLevel):j.preLevel!==''&&j.preLevel!=null?lvlPill(j.preLevel):''}</div>`).join('')}</div>`:'<div class="small muted">No jobs.</div>'}</div>
   <div class="sec"><div class="ph"><h3>Messages</h3><button type="button" class="btn sm" data-act="thread" data-id="${c.id}">Open conversation</button></div>
    ${th&&(th.messages||[]).length?(th.messages||[]).slice(-3).map(m=>`<div class="small"><b>${m.dir==='out'?'You':esc(first(c.name))}:</b> ${esc(m.text)}</div>`).join(''):'<div class="small muted">No messages yet.</div>'}</div>
  </div><div class="dr-f"><button type="button" class="btn danger" data-act="del" data-col="clients" data-id="${c.id}" data-write>Delete client</button><div class="row"><button type="button" class="btn" data-act="closeDrawer">Close</button><button class="btn primary" data-write>Save client</button></div></div></form>`;
}
function clientFields(c={}){return`
  <label class="f full"><span>Full name</span><input type="text" name="name" id="c-name" value="${esc(c.name||'')}" required></label>
  <label class="f"><span>Mobile phone</span><input type="tel" name="phone" id="c-phone" value="${esc(c.phone||'')}" placeholder="(314) 555-0100"></label>
  <label class="f"><span>Email</span><input type="email" name="email" id="c-email" value="${esc(c.email||'')}"></label>
  <label class="f full"><span>Street address</span><input type="text" name="address" id="c-addr" value="${esc(c.address||'')}"></label>
  <label class="f"><span>City</span><input type="text" name="city" id="c-city" value="${esc(c.city||'')}"></label>
  <div class="grid2"><label class="f"><span>ZIP</span><input type="text" name="zip" id="c-zip" value="${esc(c.zip||'')}" inputmode="numeric"></label><label class="f"><span>County</span><input type="text" name="county" id="c-county" value="${esc(c.county||'')}"></label></div>
  <label class="f"><span>Foundation</span><select name="foundation" id="c-fnd">${['',...FOUNDATIONS].map(x=>`<option ${x===(c.foundation||'')?'selected':''}>${x}</option>`).join('')}</select></label>
  <label class="f"><span>How they found you</span><select name="source" id="c-src">${['',...SOURCES].map(x=>`<option ${x===(c.source||'')?'selected':''}>${x}</option>`).join('')}</select></label>
  <label class="f full check"><input type="checkbox" name="smsOk" id="c-sms" ${c.smsOk!==false?'checked':''}> OK to text this number</label>`}

function dLead(d){
  const c=d.clientId?S.clients[d.clientId]:null;
  return dh(c?'New job for '+esc(c.name):'New lead','Creates the client and a job in New lead.')+`
  <form data-form="lead" data-cid="${c?c.id:''}" style="display:contents"><div class="dr-b">
   ${c?'':`<div class="sec"><h3>Homeowner</h3><div class="grid2">${clientFields({})}</div></div>`}
   <div class="sec"><h3>The job</h3><div class="grid2">
    <label class="f"><span>Why they called</span><select name="reason" id="l-reason">${REASONS.map(r=>`<option>${r}</option>`).join('')}</select></label>
    <label class="f"><span>Level they reported (pCi/L, optional)</span><input type="number" step="0.1" min="0" name="preLevel" id="l-pre"></label>
    <label class="f"><span>Home closing date (if selling or buying)</span><input type="date" name="closingDate" id="l-close"></label>
    <label class="f"><span>Realtor or inspector</span><input type="text" name="agent" id="l-agent"></label>
    <label class="f full"><span>Notes</span><textarea name="notes" id="l-notes" rows="3" placeholder="What they said on the phone"></textarea></label></div></div>
  </div><div class="dr-f"><span></span><div class="row"><button type="button" class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-write>Create ${c?'job':'lead'}</button></div></div></form>`;
}

function dCrew(d){
  const c=d.id?S.crews[d.id]:{name:'',color:CREW_COLORS[all('crews').length%6],active:true};
  return dh(d.id?'Edit crew':'Add crew')+`<form data-form="crew" data-id="${d.id||''}" style="display:contents"><div class="dr-b"><div class="sec"><div class="grid2">
   <label class="f"><span>Crew name</span><input type="text" name="name" id="cr-name" value="${esc(c.name)}" required placeholder="Truck 1"></label>
   <label class="f"><span>Crew lead</span><input type="text" name="lead" id="cr-lead" value="${esc(c.lead||'')}"></label>
   <label class="f full"><span>Members</span><input type="text" name="members" id="cr-mem" value="${esc(c.members||'')}" placeholder="Names, separated by commas"></label>
   <label class="f"><span>Lead's phone</span><input type="tel" name="phone" id="cr-phone" value="${esc(c.phone||'')}"></label>
   <label class="f"><span>Color on schedule</span><select name="color" id="cr-color">${CREW_COLORS.map((k,i)=>`<option value="${k}" ${k===c.color?'selected':''}>${['Blue','Green','Orange','Purple','Teal','Gold'][i]}</option>`).join('')}</select></label>
   <label class="f full check"><input type="checkbox" name="active" id="cr-active" ${c.active!==false?'checked':''}> Active (shows on the schedule)</label>
  </div></div></div><div class="dr-f">${d.id?`<button type="button" class="btn danger" data-act="del" data-col="crews" data-id="${d.id}" data-write>Delete crew</button>`:'<span></span>'}<div class="row"><button type="button" class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-write>Save crew</button></div></div></form>`;
}

function dDoc(d){
  const cf=cfg();let b;
  if(d.id){b=S.billing[d.id];if(!b)return dh('Not found')+`<div class="dr-b"><div class="empty">This document was deleted.</div></div>`}
  else{const j=d.job?job(d.job):null;const src=d.fromQuote?S.billing[d.fromQuote]:null;
    b={kind:d.k,number:nextNumber(d.k),jobId:j?.id||src?.jobId||'',clientId:j?.clientId||src?.clientId||'',issued:todayStr(),due:addDays(todayStr(),d.k==='quote'?+cf.quoteDays||30:+cf.invoiceDays||15),
      lines:src?JSON.parse(JSON.stringify(src.lines||[])):[],discount:src?.discount||0,taxRate:src?.taxRate??cf.taxRate??0,status:'draft',notes:src?.notes||'',quoteId:src?.id||''};}
  S.drawer.draft=b;
  const isQ=b.kind==='quote',st=invoiceStatus(b);
  return dh(`${isQ?'Quote':'Invoice'} <span class="num">${esc(b.number)}</span>`,`<span class="pill ${STATUS_PILL[st]||''}">${esc(st)}</span>${b.paidAt?' · paid '+esc(fmtD(b.paidAt.slice(0,10)))+(b.method?' by '+esc(b.method):''):''}`)+`
  <form data-form="doc" data-id="${d.id||''}" style="display:contents"><div class="dr-b">
   <div class="sec"><div class="grid2">
    <label class="f full"><span>Job</span><select name="jobId" id="b-job" required><option value="">Choose a job…</option>${jobOptions(b.jobId)}</select></label>
    <label class="f"><span>Issued</span><input type="date" name="issued" id="b-iss" value="${esc(b.issued)}"></label>
    <label class="f"><span>${isQ?'Valid until':'Due'}</span><input type="date" name="due" id="b-due" value="${esc(b.due)}"></label>
    <label class="f"><span>Status</span><select name="status" id="b-st">${(isQ?['draft','sent','accepted','declined','expired']:['draft','unpaid','paid','void']).map(x=>`<option value="${x}" ${x===(isQ?b.status:(['unpaid','overdue'].includes(st)?'unpaid':b.status))?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label>
    ${!isQ?`<label class="f"><span>Payment method</span><select name="method" id="b-meth">${['','Check','Card','Cash','ACH','Financing'].map(x=>`<option ${x===(b.method||'')?'selected':''}>${x}</option>`).join('')}</select></label>`:''}
   </div></div>
   <div class="sec"><h3>Line items</h3><div class="tbl-wrap"><table class="tbl lines" style="min-width:460px"><thead><tr><th>Description</th><th class="r" style="width:70px">Qty</th><th class="r" style="width:100px">Price</th><th class="r" style="width:90px">Amount</th><th style="width:34px"></th></tr></thead><tbody id="linesBody">
    ${(b.lines||[]).map((l,i)=>lineRow(l,i)).join('')}</tbody></table></div>
    <div class="row"><select id="pbPick" style="flex:1;min-width:200px"><option value="">Add from price book…</option>${(cf.pricebook||DEFAULT_PRICEBOOK).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${money(p.price)}</option>`).join('')}</select><button type="button" class="btn sm" data-act="lineAdd">Add item</button><button type="button" class="btn sm" data-act="lineAdd" data-blank="1">Custom line</button></div>
    <div class="grid2"><label class="f"><span>Discount ($)</span><input type="number" step="0.01" min="0" name="discount" id="b-disc" value="${esc(b.discount||0)}" data-recalc></label><label class="f"><span>Tax rate (%)</span><input type="number" step="0.001" min="0" name="taxRate" id="b-tax" value="${esc(b.taxRate||0)}" data-recalc></label></div>
    <div class="totals" id="totals"></div></div>
   <div class="sec"><label class="f"><span>Notes shown to the client</span><textarea name="notes" id="b-notes" rows="3" placeholder="${isQ?'Includes post-mitigation test and 5-year fan warranty.':'Thank you for your business.'}">${esc(b.notes||'')}</textarea></label></div>
  </div><div class="dr-f"><div class="row">${d.id?`<button type="button" class="btn danger" data-act="del" data-col="billing" data-id="${d.id}" data-write>Delete</button>`:''}</div>
   <div class="row" data-write>${d.id?`<button type="button" class="btn" data-act="docSend" data-id="${d.id}">Send to client</button>`:''}${d.id&&isQ&&b.status!=='accepted'?`<button type="button" class="btn" data-act="quoteAccept" data-id="${d.id}">Approve and invoice</button>`:''}${d.id&&!isQ&&st!=='paid'?`<button type="button" class="btn" data-act="markPaid" data-id="${d.id}">Mark paid</button>`:''}<button class="btn primary">Save</button></div></div></form>`;
}
function lineRow(l,i){return`<tr data-line="${i}"><td><input type="text" id="ld-${i}" value="${esc(l.desc)}" data-ln="desc" data-recalc></td><td><input type="number" step="0.01" id="lq-${i}" value="${esc(l.qty)}" data-ln="qty" data-recalc style="text-align:right"></td><td><input type="number" step="0.01" id="lp-${i}" value="${esc(l.price)}" data-ln="price" data-recalc style="text-align:right"></td><td class="r num" data-amt>${money((+l.qty||0)*(+l.price||0))}</td><td><button type="button" class="btn ghost sm" data-act="lineDel" data-i="${i}" aria-label="Remove line">✕</button></td></tr>`}
function readLines(){return[...document.querySelectorAll('#linesBody tr')].map(tr=>({desc:tr.querySelector('[data-ln=desc]').value,qty:+tr.querySelector('[data-ln=qty]').value||0,price:+tr.querySelector('[data-ln=price]').value||0}))}
function recalc(){
  const body=$('#linesBody');if(!body)return;
  const lines=readLines();body.querySelectorAll('tr').forEach((tr,i)=>tr.querySelector('[data-amt]').textContent=money(lines[i].qty*lines[i].price));
  const t=docTotals({lines,discount:$('#b-disc').value,taxRate:$('#b-tax').value});
  $('#totals').innerHTML=`<span class="muted">Subtotal</span><span class="num">${money(t.sub)}</span>${t.disc?`<span class="muted">Discount</span><span class="num">−${money(t.disc)}</span>`:''}${t.tax?`<span class="muted">Tax</span><span class="num">${money(t.tax)}</span>`:''}<span><b>Total</b></span><span class="gt">${money(t.total)}</span>`;
}

/* ---------- actions ---------- */
const fd=f=>Object.fromEntries(new FormData(f));
function go(r){if(isCrew()&&r!=='crew')r='crew';S.route=r;S.crewOpen=null;try{history.replaceState(null,'','#'+r)}catch(e){}render();window.scrollTo(0,0)}
const staffOnly=()=>{if(!S.canWrite){toast('Only office staff can do that.');return true}return false};
const ACT={
  go:(d,el,e)=>{e.preventDefault();closeDrawerSilently();go(d.r)},
  closeDrawer:()=>closeDrawer(),
  signOut:()=>signOut(),
  recheck:async()=>{const {data}=await sb.auth.getSession();if(data.session)startSession(data.session)},
  authMode:d=>{S.auth={mode:d.m,msg:'',err:''};renderRoot()},
  wk:d=>{S.weekStart=+d.n?addDays(S.weekStart,+d.n):mondayOf(todayStr());render()},
  appt:d=>{if(isCrew())return;openDrawer({type:'appt',id:d.id})},
  newAppt:d=>{if(staffOnly())return;openDrawer({type:'appt',jobId:d.id||'',kind:d.kind||(d.id?suggestKind(d.id):'test_place'),date:d.date||todayStr(),crew:d.crew||''})},
  job:d=>openDrawer({type:'job',id:d.id,focus:false}),
  client:d=>openDrawer({type:'client',id:d.id,focus:false}),
  doc:d=>openDrawer({type:'doc',id:d.id,focus:false}),
  newDoc:d=>{if(staffOnly())return;openDrawer({type:'doc',k:d.k,job:d.job||'',focus:false})},
  newLead:()=>{if(staffOnly())return;openDrawer({type:'lead'})},
  newJob:d=>{if(staffOnly())return;openDrawer({type:'lead',clientId:d.id})},
  crewEdit:d=>{if(staffOnly())return;openDrawer({type:'crew',id:d.id})},
  thread:d=>{closeDrawerSilently();S.route='inbox';S.inboxSel=d.id||null;if(d.id)markRead(d.id);try{history.replaceState(null,'','#inbox')}catch(e){}render()},
  billTab:d=>{S.billTab=d.k;render()},
  del:async(d,el)=>{if(!el.classList.contains('armed')){el.classList.add('armed');el.dataset.label=el.textContent;el.textContent='Tap again to delete';setTimeout(()=>{if(el.isConnected){el.classList.remove('armed');el.textContent=el.dataset.label}},4000);return}
    await remove(d.col,d.id);closeDrawer();toast('Deleted');
    if(d.col==='jobs'||d.col==='clients'){await loadAll();schedule()}},
  sendReminders:async()=>{if(staffOnly())return;const tom=addDays(todayStr(),1);const l=apptsOn(tom).filter(a=>!a.reminded);let n=0;
    for(const a of l){const c=apptClient(a);if(!c)continue;await sendTemplate(c.id,'reminder',{appt:a});await patch('appts',a.id,{reminded:true});n++}
    toast(`${n} reminder${n===1?'':'s'} recorded in Messages`)},
  remindOne:async d=>{const a=S.appts[d.id];const c=apptClient(a);if(!c)return;await sendTemplate(c.id,'reminder',{appt:a});await patch('appts',a.id,{reminded:true});toast('Reminder recorded in Messages');drawDrawer()},
  logReply:async d=>{const ta=document.getElementById('compose-'+d.cid);const text=ta.value.trim();if(!text)return toast('Type the client\'s reply first');ta.value='';await addMessage(d.cid,{dir:'in',channel:$('#chanSel').value,text})},
  copy:async(d,el)=>{try{await navigator.clipboard.writeText(d.v);toast('Copied')}catch(e){const s=el.previousElementSibling;if(s){const r=document.createRange();r.selectNodeContents(s);const sel=getSelection();sel.removeAllRanges();sel.addRange(r)}toast('Selected. Copy it from here.')}},
  crewDay:d=>{S.crewDate=+d.n?addDays(S.crewDate,+d.n):todayStr();S.crewOpen=null;render()},
  crewOpen:d=>{S.crewOpen=d.id||null;render()},
  crewStatus:async d=>{const a=S.appts[d.id];const c=apptClient(a);
    const msg=d.s==='en_route'&&c&&c.smsOk!==false&&c.phone?tplText(c.id,'on_way',{appt:a}):null;
    const prev={...a};S.appts[d.id]={...a,status:d.s};render();
    const {error}=await sb.rpc('set_visit_status',{p_appt:d.id,p_status:d.s,p_message:msg});
    if(error){S.appts[d.id]=prev;render();return dbError(error)}
    toast(msg?'Client texted that you are on the way':d.s==='arrived'?'Marked on site':'Updated')},
  quoteAccept:async d=>{const q=S.billing[d.id];await patch('billing',d.id,{status:'accepted',acceptedAt:nowIso()});
    if(q.jobId&&['lead','testing','quoted'].includes(job(q.jobId)?.stage))await patch('jobs',q.jobId,{stage:'booked'});
    openDrawer({type:'doc',k:'invoice',fromQuote:d.id,focus:false});toast('Quote approved. Review the invoice and save.')},
  markPaid:async d=>{const m=$('#b-meth')?.value||'';await patch('billing',d.id,{status:'paid',paidAt:nowIso(),method:m});drawDrawer();toast('Marked paid')},
  docSend:async d=>{const b=S.billing[d.id];if(!b.clientId)return toast('Pick a job first');
    await sendTemplate(b.clientId,b.kind==='quote'?'quote':'invoice',{doc:b},'email');
    const p={sentAt:nowIso()};if(b.kind==='quote'&&b.status==='draft')p.status='sent';if(b.kind==='invoice'&&b.status==='draft')p.status='unpaid';
    if(b.kind==='quote'&&b.jobId&&['lead','testing'].includes(job(b.jobId)?.stage))await patch('jobs',b.jobId,{stage:'quoted'});
    await patch('billing',d.id,p);drawDrawer();toast('Recorded in Messages as sent')},
  lineAdd:(d)=>{const body=$('#linesBody');const lines=readLines();
    if(d.blank)lines.push({desc:'',qty:1,price:0});else{const id=$('#pbPick').value;if(!id)return toast('Choose a price book item');const p=(cfg().pricebook||DEFAULT_PRICEBOOK).find(x=>x.id===id);lines.push({desc:p.name,qty:1,price:p.price});$('#pbPick').value=''}
    body.innerHTML=lines.map(lineRow).join('');recalc()},
  lineDel:d=>{const lines=readLines();lines.splice(+d.i,1);$('#linesBody').innerHTML=lines.map(lineRow).join('');recalc()},
  pbAdd:()=>{$('#pbBody').insertAdjacentHTML('beforeend',pbRow({id:'p'+sid(),name:'',price:0}))},
  pbDel:(d,el)=>el.closest('tr').remove(),
  clearSample:async(d,el)=>{if(staffOnly())return;
    if(!el.classList.contains('armed')){el.classList.add('armed');el.dataset.label=el.textContent;el.textContent='Tap again to delete all sample records';setTimeout(()=>{if(el.isConnected){el.classList.remove('armed');el.textContent=el.dataset.label}},5000);return}
    el.disabled=true;
    for(const t of ['messages','billing_docs','appointments','jobs','clients','crews']){const {error}=await sb.from(t).delete().eq('is_sample',true);if(error){dbError(error,'Could not remove all sample data.');break}}
    await loadAll();render();toast('Sample data removed')}
};
function closeDrawerSilently(){S.drawer=null;$('#drawerRoot').innerHTML=''}
function suggestKind(jid){const j=job(jid);if(!j)return'test_place';return{lead:j.preLevel&&+j.preLevel>=4?'estimate':'test_place',testing:'test_pickup',quoted:'estimate',booked:'install',installed:'post_test',complete:'service'}[j.stage]||'service'}

const FORM={
  auth:async(f)=>{const v=fd(f),m=f.dataset.mode;const btn=f.querySelector('button.primary');btn.disabled=true;S.auth.err='';S.auth.msg='';
    try{
      if(m==='signin'){const {error}=await sb.auth.signInWithPassword({email:v.email,password:v.password});if(error)throw error}
      if(m==='signup'){const {data,error}=await sb.auth.signUp({email:v.email,password:v.password,options:{data:{full_name:v.name},emailRedirectTo:location.origin}});if(error)throw error;
        if(!data.session){S.auth={mode:'signin',err:'',msg:'Check your email and click the confirmation link, then sign in here.'};renderRoot();return}}
      if(m==='reset'){const {error}=await sb.auth.resetPasswordForEmail(v.email,{redirectTo:location.origin});if(error)throw error;S.auth={mode:'signin',err:'',msg:'If that email has an account, a reset link is on its way.'};renderRoot();return}
      if(m==='newpass'){const {error}=await sb.auth.updateUser({password:v.password});if(error)throw error;S.auth={mode:'signin',err:'',msg:''};const {data}=await sb.auth.getSession();if(data.session)startSession(data.session);return}
    }catch(e){S.auth.err=e.message==='Invalid login credentials'?'That email and password don\'t match. Try again or reset your password.':(e.message||'Something went wrong. Try again.');renderRoot();const em=document.getElementById('au-email');if(em)em.value=v.email||''}
    finally{btn.disabled=false}},
  appt:async(f)=>{const v=fd(f);const j=job(v.jobId);if(!j)return toast('Choose a job');const id=f.dataset.id||uid();const cur=S.appts[id]||{};
    const moved=cur.date&&(cur.date!==v.date||cur.start!==v.start);
    await put('appts',id,{...cur,...v,clientId:j.clientId,hours:+v.hours||KINDS[v.kind].hrs,reminded:moved?false:!!cur.reminded});
    if(!f.dataset.id){const stg={test_place:'testing',install:'booked'}[v.kind];if(stg&&STAGES.findIndex(s=>s[0]===stg)>STAGES.findIndex(s=>s[0]===j.stage))await patch('jobs',j.id,{stage:stg})}
    closeDrawer();toast(f.dataset.id?'Visit saved':'Visit booked')},
  job:async(f)=>{const v=fd(f);const j=S.jobs[f.dataset.id];const checklist={};CHECKLIST.forEach((x,i)=>checklist[x]=!!v['ck'+i]);CHECKLIST.forEach((x,i)=>delete v['ck'+i]);
    const fnd=v.foundation;delete v.foundation;const c=jobClient(j);if(c&&fnd!==(c.foundation||''))await patch('clients',c.id,{foundation:fnd});
    await patch('jobs',j.id,{...v,checklist});toast('Job saved');drawDrawer()},
  client:async(f)=>{const v=fd(f);v.smsOk=!!v.smsOk;await patch('clients',f.dataset.id,v);toast('Client saved');drawDrawer()},
  lead:async(f)=>{const v=fd(f);let cid=f.dataset.cid;
    if(!cid){cid=uid();await put('clients',cid,{name:v.name,phone:v.phone,email:v.email,address:v.address,city:v.city,zip:v.zip,county:v.county,foundation:v.foundation,source:v.source,smsOk:!!v.smsOk,createdAt:nowIso()})}
    const jid=uid();await put('jobs',jid,{clientId:cid,stage:'lead',reason:v.reason,preLevel:v.preLevel,closingDate:v.closingDate,agent:v.agent,notes:v.notes,checklist:{},createdAt:nowIso()});
    openDrawer({type:'job',id:jid,focus:false});toast('Lead created')},
  crew:async(f)=>{const v=fd(f);v.active=!!v.active;const id=f.dataset.id||uid();await put('crews',id,{...(S.crews[id]||{}),...v});closeDrawer();toast('Crew saved')},
  company:async(f)=>{const v=fd(f);await saveConfig(v);toast('Company saved')},
  templates:async(f)=>{const v=fd(f);const t=(cfg().templates||DEFAULT_TEMPLATES).map(x=>({...x,text:v['t_'+x.id]??x.text}));await saveConfig({templates:t});toast('Templates saved')},
  pricebook:async(f)=>{const rows=[...f.querySelectorAll('tr[data-pb]')].map(tr=>({id:tr.dataset.pb,name:tr.querySelector('input[type=text]').value.trim(),price:+tr.querySelector('input[type=number]').value||0})).filter(p=>p.name);await saveConfig({pricebook:rows});toast('Price book saved')},
  send:async(f)=>{const cid=f.dataset.cid;const ta=document.getElementById('compose-'+cid);const text=ta.value.trim();if(!text)return;const c=client(cid);
    const ch=$('#chanSel').value;if(ch==='sms'&&!c.phone)return toast('This client has no phone number. Add one or send by email.');if(ch==='email'&&!c.email)return toast('This client has no email address.');
    ta.value='';await addMessage(cid,{dir:'out',channel:ch,text})},
  crewDone:async(f)=>{const v=fd(f);const a=S.appts[f.dataset.id];const j=job(a.jobId)||{};const c=apptClient(a);
    const result=v.result!==undefined&&v.result!==''?+v.result:null;
    const ck={};if(a.kind==='install')CHECKLIST.forEach((x,i)=>ck[x]=!!v['ck'+i]);
    let msg=null;
    if(c&&c.smsOk!==false&&c.phone){
      if(a.kind==='test_pickup'&&result!=null)msg=tplText(c.id,'test_result',{job:{...j,preLevel:result}});
      if(a.kind==='post_test'&&result!=null&&result<4)msg=tplText(c.id,'post_result',{job:{...j,postLevel:result}});
    }
    const btn=f.querySelector('button.primary');btn.disabled=true;
    const {error}=await sb.rpc('complete_visit',{p_appt:a.id,p_result:result,p_manometer:v.manometer||null,p_fan:v.fan||null,p_points:v.points?+v.points:null,p_discharge:v.discharge||null,p_checklist:a.kind==='install'?ck:null,p_notes:v.notes||null,p_message:msg});
    btn.disabled=false;
    if(error)return dbError(error,'Could not finish that visit. Check your signal and try again.');
    S.appts[a.id]={...a,status:'done',completedAt:nowIso(),result,manometer:v.manometer||a.manometer,crewNotes:v.notes||''};
    S.crewOpen=null;render();toast(msg?'Visit complete. Client texted the result.':'Visit complete. The office can see it now.')},
  doc:async(f)=>{const v=fd(f);const j=job(v.jobId);if(!j)return toast('Choose a job');const id=f.dataset.id||uid();const cur=S.billing[id]||S.drawer.draft||{};
    const lines=readLines().filter(l=>l.desc||l.price);
    const body={...cur,kind:cur.kind,number:cur.number,jobId:v.jobId,clientId:j.clientId,issued:v.issued,due:v.due,status:v.status,discount:+v.discount||0,taxRate:+v.taxRate||0,notes:v.notes,lines};
    if(v.method!==undefined)body.method=v.method;if(v.status==='paid'&&!cur.paidAt)body.paidAt=nowIso();
    await put('billing',id,body);if(!f.dataset.id)S.drawer={type:'doc',id,focus:false};drawDrawer();toast('Saved')},
  team:async(f)=>{const rows=[...f.querySelectorAll('[data-member]')];let n=0;
    for(const r of rows){const id=r.dataset.member;const role=r.querySelector('select[name=role]').value;const crewId=r.querySelector('select[name=crew]').value||null;const p=S.profiles[id];
      if(p&&(p.role!==role||(p.crewId||null)!==crewId)){const {error}=await sb.from('profiles').update({role,crew_id:crewId}).eq('id',id);if(error){dbError(error);return}S.profiles[id]={...p,role,crewId};n++}}
    render();toast(n?`Updated ${n} team member${n===1?'':'s'}`:'No changes to save')}
};

/* ---------- events ---------- */
const safe=p=>Promise.resolve(p).catch(e=>console.warn(e));
document.addEventListener('click',e=>{const a=e.target.closest('[data-act]');if(!a)return;if(a.tagName==='SELECT'||a.tagName==='LABEL')return;const fn=ACT[a.dataset.act];if(fn){if(a.tagName==='A'||a.tagName==='BUTTON')e.preventDefault();safe(fn(a.dataset,a,e))}});
document.addEventListener('submit',e=>{const f=e.target;if(!f.dataset.form)return;e.preventDefault();
  const open=['auth','crewDone'];if(!open.includes(f.dataset.form)&&!S.canWrite)return toast('Only office staff can change this.');
  const fn=FORM[f.dataset.form];if(fn)safe(fn(f))});
document.addEventListener('input',e=>{const el=e.target;if(el.dataset.inp){S[el.dataset.inp]=el.value;schedule()}if(el.hasAttribute('data-recalc'))recalc()});
document.addEventListener('change',e=>{const el=e.target;const k=el.dataset.actChange;
  if(el.dataset.uploadJob){safe(uploadPhotos(el));return}
  if(k==='tpl'&&el.value){const ta=document.getElementById('compose-'+el.dataset.cid);if(ta){ta.value=tplText(el.dataset.cid,el.value);ta.focus()}el.value=''}
  if(k==='crewSel'){S.crewId=el.value;try{localStorage.setItem('rcd.crew',el.value)}catch(e){}S.crewOpen=null;render()}
  if(k==='kindHrs'){const h=$('#a-hours');if(h)h.value=KINDS[el.value].hrs}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.drawer)closeDrawer()});
document.addEventListener('dragstart',e=>{const el=e.target.closest&&e.target.closest('[data-drag]');if(!el||!S.canWrite)return;e.dataTransfer.setData('text/plain',el.dataset.drag+':'+el.dataset.id);e.dataTransfer.effectAllowed='move';el.classList.add('dragging')});
document.addEventListener('dragend',()=>{document.querySelectorAll('.dragging,.over').forEach(x=>x.classList.remove('dragging','over'))});
document.addEventListener('dragover',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(!z)return;e.preventDefault();document.querySelectorAll('.over').forEach(x=>x!==z&&x.classList.remove('over'));z.classList.add('over')});
document.addEventListener('drop',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(!z)return;e.preventDefault();z.classList.remove('over');
  const [kind,id]=(e.dataTransfer.getData('text/plain')||'').split(':');if(!id)return;
  safe((async()=>{
    if(kind==='appt'&&z.dataset.drop==='cell'){const a=S.appts[id];if(!a||(a.date===z.dataset.date&&(a.crewId||'')===z.dataset.crew))return;await patch('appts',id,{date:z.dataset.date,crewId:z.dataset.crew||null,reminded:a.date===z.dataset.date?a.reminded:false});toast(`Moved to ${fmtD(z.dataset.date)}${z.dataset.crew?' · '+(crew(z.dataset.crew)?.name||''):' · Unassigned'}`)}
    if(kind==='job'&&z.dataset.drop==='stage'){const j=S.jobs[id];if(!j||j.stage===z.dataset.stage)return;await patch('jobs',id,{stage:z.dataset.stage});toast('Moved to '+STAGE_LABEL[z.dataset.stage])}
  })())});
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(NAV.some(n=>n[0]===h)&&h!==S.route&&S.mode==='app')go(h)});
let tt;function toast(m){$('#toastRoot').innerHTML=`<div class="toast" role="status">${esc(m)}</div>`;clearTimeout(tt);tt=setTimeout(()=>$('#toastRoot').innerHTML='',3200)}

/* ---------- boot ---------- */
async function boot(){
  S.weekStart=mondayOf(todayStr());S.crewDate=todayStr();
  try{S.crewId=localStorage.getItem('rcd.crew')}catch(e){}
  const h=(location.hash||'').slice(1);if(NAV.some(n=>n[0]===h))S.route=h;
  let started=false;
  sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==='PASSWORD_RECOVERY'){S.mode='auth';S.auth={mode:'newpass',msg:'',err:''};renderRoot();return}
    if(ev==='SIGNED_OUT'){S.mode='auth';renderRoot();return}
    if(session&&!started&&(ev==='SIGNED_IN'||ev==='INITIAL_SESSION')){started=true;setTimeout(()=>startSession(session),0)}
    if(!session&&ev==='INITIAL_SESSION'){S.mode='auth';renderRoot()}
  });
}
window.__rcd={S,render,renderRoot,applyRole,sb};
boot();
