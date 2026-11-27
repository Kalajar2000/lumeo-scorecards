/* Lumeo scorecards, the daily view. Reads daily.json (Meta per ad per day, refreshed every morning by Make), data.json
   (ClickUp tasks and weekly Meta, the fallback before daily data starts) and picks.json (manual attribution).
   One rule set, any window: a day, a Mon-Sun week, a calendar month, a custom date range, or Lifetime. */
(async function(){
const TOP_N = {day:9, week:9, month:9, range:9, life:10};   // ads analysed per window: top N by spend
const TRACK_FROM = 1000;      // DCT # from which an ad with no ClickUp task is flagged as unmatched. Attribution uses the ClickUp task for any DCT that has one.
const EARLY_SHARE = 0.03;     // too early: first spend in the last 7 days of the window and under 3% of the window's spend
const PEOPLE = [
  {id:'Hamid',name:'hamid',ini:'HA',role:'ED',roleName:'Editor',img:'avatars/hamid.webp'},
  {id:'Daly',name:'dalydee',ini:'DA',role:'ED',roleName:'Editor',img:'avatars/daly.webp'},
  {id:'techkidd',name:'techkidd',ini:'TK',role:'ED',roleName:'Editor',img:'avatars/techkidd.webp'},
  {id:'Eren',name:'eren',ini:'ER',role:'ED',roleName:'Editor',img:'avatars/eren.webp'},
  {id:'Joe',name:'joe',ini:'JE',role:'ED',roleName:'Editor (agency)',onlyIfAds:true,img:''},
  {id:'Victor',name:'victor',ini:'VI',role:'CS',roleName:'Creative strategist',img:'avatars/victor.webp'},
  {id:'Joel',name:'joel',ini:'JO',role:'CS',roleName:'Creative strategist',img:''},
  {id:'Richard',name:'richard',ini:'RI',role:'CS',roleName:'Creative strategist',img:''},
  {id:'Alex',name:'alex',ini:'AL',role:'CS',roleName:'Creative strategist (natives)',img:''}
];

const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money = v => v>=1000 ? '$'+(v/1000).toFixed(v>=10000?0:1)+'K' : '$'+Math.round(v);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const personId = s => { if(!s) return null; const p=PEOPLE.find(x=>x.id.toLowerCase()===String(s).toLowerCase()); return p?p.id:String(s); };

let D, PICKS={}, LINKS={}, MEDIA={}, DAILY=null;
try{
  const bust='?t='+Date.now();
  D = await (await fetch('data.json'+bust)).json();
  // Read picks straight from the repo so a pick saved a minute ago shows before Pages redeploys. Falls back to the Pages copy.
  try{ const r=await fetch('https://api.github.com/repos/Kalajar2000/lumeo-scorecards/contents/picks.json?ref=main',{headers:{Accept:'application/vnd.github.raw+json'},cache:'no-store'}); if(!r.ok) throw 0; PICKS=await r.json(); }
  catch(e){ try{ PICKS = await (await fetch('picks.json'+bust)).json(); }catch(e2){} }
  try{ LINKS = await (await fetch('links.json'+bust)).json(); }catch(e){}
  try{ MEDIA = await (await fetch('media.json'+bust)).json(); }catch(e){}
  try{ DAILY = await (await fetch('daily.json'+bust)).json(); if(!DAILY||!DAILY.days) DAILY=null; }catch(e){}
}catch(e){ $('#title').textContent='Scorecards'; $('#updated').textContent='Could not load data.json yet.'; return; }

/* picks.json holds who made ads that have no ClickUp credit. The dropdowns on the page save into it for everyone
   through the Make webhook "Lumeo: Scorecard save CS/Editor pick", which commits picks.json to the repo. */
const PICK_HOOK='https://hook.us2.make.com/0gz3b5w3gedfdh2ubx3ijd1v16r70j2m';
const CS_OPTS=['Victor','Joel','Richard','Alex'], ED_OPTS=['Hamid','Daly','techkidd','Eren','Joe'];
const real = v => v && !/^(other|creator)$/i.test(String(v)) ? v : null;   // "Other" means nobody picked yet
const pickFor=name=>PICKS[name]||null;
/* Thumbnail and preview link per ad. media.json is rebuilt every day by the Make scenario "Lumeo: Scorecard ad previews". */
const mediaFor=name=>{ const m=MEDIA[name]||{}; return {preview:m.preview||LINKS[name]||'', thumb:m.thumb||m.thumb_src||'', video:m.video_src||'', embed:m.embed||''}; };
const toast=m=>{const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('on'),2200);};

const S = D.settings||{};
/* IDGAF verdicts (Joel's doc). Same rules and numbers as the ads site (lumeo-ads-lab-log tools/ads/build.py verdict()),
   so the scorecard, ClickUp and the MER label an ad the same way. The ad gets its concept's verdict. */
const KPI_ROAS = 1.1, SHARE_LINE = 0.10;
const IDG = {BAR:1.1, SHARE:0.10, GROWTH:0.10, MIN_WEEK:500, MIN_TEST:100, KPI_MIN_PUR:3};
const ALLW = [...new Set((D.ad_weekly||[]).map(r=>r.week))].sort();
const isoWeek = d => { const t=new Date(d+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7)); const y=new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil(((t-y)/864e5+1)/7); };
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtD = d => new Date(d+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
const fmtDay = d => new Date(d+'T00:00:00Z').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const addD = (d,n) => { const t=new Date(d+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10); };
const span = (a,b) => Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/864e5)+1;
const monOf = d => addD(d,-((new Date(d+'T00:00:00Z').getUTCDay()+6)%7));
const MON_OF = w => addD(w,3).slice(0,7);   // weekly data only: a week belongs to the month its Thursday falls in
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v||'') && !isNaN(new Date(v+'T00:00:00Z'));
/* Daily Meta numbers. The last day is usually today, pulled early in the morning, so it is marked "so far". */
const DAYS = DAILY ? Object.keys(DAILY.days).sort() : [];
const D0 = DAYS[0]||null, THRU = DAYS[DAYS.length-1]||null;
const GEN_DAY = DAILY ? new Date(new Date(DAILY.generated_at).getTime()-5*3600e3).toISOString().slice(0,10) : null;   // Make runs on Bogota time
const TODAY_PART = !!THRU && THRU>=GEN_DAY;
const LAST_FULL = TODAY_PART && DAYS.length>1 ? DAYS[DAYS.length-2] : THRU;
const LAST = THRU ? monOf(THRU) : (D.last_week || ALLW[ALLW.length-1]);
const END = THRU || (ALLW.length ? addD(ALLW[ALLW.length-1],6) : null);   // last date with numbers
const DATA_START = [D0, ALLW[0]].filter(Boolean).sort()[0];
const DAILY_OK = f => !!D0 && (f>=D0 || !ALLW.some(x=>x<D0));   // daily data covers windows starting on f
const PARTIAL = new Set((D.weeks||[]).filter(w=>w.partial_through).map(w=>w.week));
const ALLWK = [...new Set([...ALLW, ...DAYS.map(monOf)])].sort();
const ALLM = [...new Set([...ALLW.map(MON_OF), ...DAYS.map(d=>d.slice(0,7))])].sort();
const soFar = to => (THRU ? to>=THRU && TODAY_PART : false) || (!THRU && PARTIAL.has(monOf(to)));
const weekPart = w => THRU ? addD(w,6)>THRU || (addD(w,6)===THRU && TODAY_PART) : PARTIAL.has(w);
const monthEnd = m => addD(m+'-01', new Date(Date.UTC(+m.slice(0,4), +m.slice(5,7), 0)).getUTCDate()-1);
const monthLabel = m => MONTHS[+m.slice(5)-1]+(m.slice(0,4)!==String(new Date().getFullYear())?' '+m.slice(0,4):'');
/* Window keys: "d:2026-11-26", "w:2026-11-23" (Monday), "m:2026-11", "r:2026-11-01_2026-11-15", "life". Built from the data, so new days show up on their own. */
const WINC = {};
function winFor(key){
  if(WINC[key]) return WINC[key];
  let w;
  if(key==='life') w={kind:'life',from:DATA_START,to:END,label:'Lifetime',tag:'GOAT',special:'Best overall',pack:'LIFETIME'};
  else if(key.startsWith('d:')){ const d=key.slice(2); w={kind:'day',from:d,to:d,label:fmtDay(d),tag:'POTD',special:'Player of the Day',pack:fmtD(d).toUpperCase()}; }
  else if(key.startsWith('m:')){ const m=key.slice(2), f=m+'-01';
    // calendar month from daily data; before daily data starts, the weeks whose Thursday falls in the month
    const wk=ALLW.filter(x=>MON_OF(x)===m), useDaily=DAILY_OK(f);
    w={kind:'month',from:useDaily||!wk.length?f:wk[0],to:useDaily||!wk.length?monthEnd(m):addD(wk[wk.length-1],6),label:monthLabel(m),tag:'POTM',special:'Player of the Month',pack:MONTHS[+m.slice(5)-1].toUpperCase()}; }
  else if(key.startsWith('r:')){ const [a,b]=key.slice(2).split('_'); w={kind:'range',from:a,to:b,label:a===b?fmtDay(a):`${fmtD(a)} to ${fmtD(b)}`,tag:'POTR',special:'Player of the Range',pack:'RANGE'}; }
  else { const d=key.slice(2), n=isoWeek(d); w={kind:'week',from:d,to:addD(d,6),label:'Week '+n,tag:'POTW',special:'Player of the Week',pack:'WEEK '+n}; }
  w.days=w.from&&w.to?span(w.from,w.to):0;
  return WINC[key]=w;
}
const WIN = new Proxy({}, {get:(_,k)=>winFor(k)});
const validKey = k => k==='life' || (/^d:/.test(k)&&DAYS.includes(k.slice(2))) || (/^w:/.test(k)&&ALLWK.includes(k.slice(2))) || (/^m:/.test(k)&&ALLM.includes(k.slice(2)))
  || (/^r:/.test(k) && (([a,b])=>isDate(a)&&isDate(b)&&a<=b)(k.slice(2).split('_')));
const DEFAULT = {day:'d:'+LAST_FULL, week:'w:'+LAST, month:'m:'+(THRU?THRU.slice(0,7):LAST?MON_OF(LAST):''), range:'r:'+(END?addD(END,-6):'')+'_'+END, life:'life'};
let period=DEFAULT.week, filter='all';
const K = () => winFor(period).kind;
const SHORT = () => WIN[period].days<=7 && K()!=='life';   // day or week sized window

/* ---------- ads by window ---------- */
const tasksByDct = {}, dctCount = {}; (D.tasks||[]).forEach(t=>{ if(!t.dct) return; dctCount[t.dct]=(dctCount[t.dct]||0)+1; if(!tasksByDct[t.dct]) tasksByDct[t.dct]=t; });
const firstSeen = {}, seen=(n,d)=>{ if(!firstSeen[n]||d<firstSeen[n]) firstSeen[n]=d; };
(D.ad_weekly||[]).forEach(r=>seen(r.ad,r.week));
DAYS.forEach(d=>DAILY.days[d].forEach(r=>seen(DAILY.ads[r[0]],d)));
const dctOf = {}; (D.ad_weekly||[]).forEach(r=>{ if(r.dct) dctOf[r.ad]=r.dct; });
const parseDct = n => { const m=String(n).match(/DCT\s*#?\s*(\d{1,4})/i)||String(n).match(/(?:^|\D)(\d{1,3})(?:\D|$)/); return m?Number(m[1]):''; };
/* Concept key: same grouping as build.py concept_key(). */
function conceptKey(name){
  const n=String(name||'').trim(); let m;
  if(/^(.*?)_Lumeo®.*trybe/.test(n)||n.includes('trybe=')) return 'Creator: '+n.split(/_Lumeo/)[0].trim();
  const pad=v=>String(+v).padStart(3,'0');
  if((m=n.match(/^SAN_W\d+_DCT(\d+)/))) return 'SAN-'+pad(m[1]);
  if((m=n.match(/^W\d+_DCT(\d+)/))) return '#'+(+m[1]);
  if((m=n.match(/CS-victor\s*\[DCT#?(\d+)/i))) return 'VS-'+pad(m[1]);
  if((m=n.match(/^Alex_DCT#?(\d+)/i))) return 'ALEX-'+pad(m[1]);
  if((m=n.match(/^BFCM#?(\d+)/i))) return 'BFCM-'+pad(m[1]);
  if((m=n.match(/^TEMPLATE#\s*(\((\d+)\))?/i))) return 'TEMPLATE#'+(m[2]?' ('+m[2]+')':'');
  if((m=n.match(/^JKX\s*(\d+)/i))) return 'JKX-'+(+m[1]);
  if(/^SANTI?V?\d/i.test(n)) return 'SANTI';
  if((m=n.match(/DCT\s*#?\s*(\d{1,4})/i))) return '#'+(+m[1]);
  if((m=n.match(/^(?:ad|lumeos?#?|batch#?)\s*(\d{1,4})/i))) return '#'+(+m[1]);
  if((m=n.match(/^(\d{1,4})(?!\d)/))) return '#'+(+m[1]);
  let b=n.replace(/\s*-\s*Copy.*$/,'').replace(/\s*\(\d+\)$/,'').replace(/[\s_-]*(v|h)\d+\w*$/i,'').trim();
  return b||n;
}
/* Monday-week spend and revenue for every concept and for the whole account, using everything up to date `to`.
   Daily data where it exists, weekly rows before it. n = days of the week that have passed, so a week in progress
   is compared on spend per day. */
const SER = {};
function seriesTo(to){
  if(SER[to]) return SER[to];
  const pool={}, con={}, add=(o,wk,s,r,n)=>{ const x=o[wk]||(o[wk]={s:0,r:0,n}); x.s+=s; x.r+=r; };
  const nOf=wk=>span(wk,[addD(wk,6),to,THRU||to].sort()[0]);
  (D.weeks||[]).forEach(x=>{ if(D0&&addD(x.week,6)>=D0) return; if(x.week>to) return; add(pool,x.week,x.spend,x.revenue,7); });
  (D.ad_weekly||[]).forEach(r=>{ if(D0&&addD(r.week,6)>=D0) return; if(r.week>to) return; const k=conceptKey(r.ad); add(con[k]||(con[k]={}),r.week,r.spend,r.revenue,7); });
  DAYS.forEach(d=>{ if(d>to) return; const wk=monOf(d), n=nOf(wk);
    DAILY.days[d].forEach(r=>{ const k=conceptKey(DAILY.ads[r[0]]); add(pool,wk,r[1],r[2],n); add(con[k]||(con[k]={}),wk,r[1],r[2],n); }); });
  return SER[to]={pool,con};
}
/* build.py verdict(), for the weeks that overlap the window. Share = concept spend / account spend that week.
   Ref budget = account spend the week before the concept launched. Breakthrough = a week at 10%+ share and 1.1+ ROAS
   where the account spends 10%+ more than the ref week and the concept spends more than in its launch week.
   Spend winner = 10%+ share without that. KPI winner = under the line at 1.1+ ROAS with 3+ purchases. Loser = the rest. */
function idgaf(key, w, tot){
  const info={peak:0, bt:null, shareWeeks:0};
  if(tot.s < IDG.MIN_TEST) return ['Too early',info];
  const {pool,con}=seriesTo(w.to), cw=con[key]||{}, wks=Object.keys(cw).sort();
  if(!wks.length) return ['Loser',info];
  const lw=wks[0], l=cw[lw], lRate=l.s/l.n, prev=pool[addD(lw,-7)], hasPrev=!!prev&&prev.s>0;
  const ref = hasPrev ? prev.s/prev.n : (pool[lw]?pool[lw].s/pool[lw].n:0);
  const a=monOf(w.from), b=monOf(w.to);
  wks.forEach(wk=>{
    if(wk<a||wk>b) return;
    const c=cw[wk], p=pool[wk]; if(!p||p.s<=0||c.s<IDG.MIN_WEEK*c.n/7) return;
    const sh=c.s/p.s; if(sh>info.peak) info.peak=sh;
    if(sh<IDG.SHARE) return;
    info.shareWeeks++;
    const ok = hasPrev ? (wk===lw || c.s/c.n>lRate) : (wk>lw && c.s/c.n>lRate);
    if(ok && c.r/c.s>=IDG.BAR && ref>0 && p.s/p.n>=ref*(1+IDG.GROWTH) && !info.bt) info.bt=wk;
  });
  if(info.bt) return ['Breakthrough',info];
  if(info.shareWeeks) return ['Spend Winner',info];
  if(tot.s && tot.r/tot.s>=IDG.BAR && tot.p>=IDG.KPI_MIN_PUR) return ['KPI Winner',info];
  return ['Loser',info];
}
/* Meta rows for a window: daily.json when it covers the window, otherwise the weekly rows in data.json. */
function rowsFor(w){
  if(DAILY_OK(w.from)){ const out=[];
    DAYS.forEach(d=>{ if(d<w.from||d>w.to) return; DAILY.days[d].forEach(r=>{ const ad=DAILY.ads[r[0]]; out.push({ad,dct:dctOf[ad]||parseDct(ad),spend:r[1],revenue:r[2],purchases:r[3],imp:r[4],v3:r[5],tp:r[6]}); }); });
    return {rows:out,src:'daily'}; }
  return {rows:(D.ad_weekly||[]).filter(r=>r.week>=w.from&&r.week<=w.to),src:'weekly'};
}
const cache = {};
function adsFor(p){
  if(cache[p]) return cache[p];
  const w=WIN[p], {rows,src}=rowsFor(w), m={};
  rows.forEach(r=>{
    const a=m[r.ad]||(m[r.ad]={name:r.ad,dct:r.dct,s:0,rev:0,p:0,imp:0,v3:0,tp:0});
    a.s+=r.spend; a.rev+=r.revenue; a.p+=r.purchases; a.imp+=r.imp; a.v3+=r.v3; a.tp+=r.tp; });
  const early=addD(w.to,-6);
  const list=Object.values(m).map(a=>({...a, r:a.s?a.rev/a.s:0, h:a.imp?100*a.v3/a.imp:0, hd:a.v3?100*a.tp/a.v3:0, video:a.v3>0}));
  const tot=list.reduce((t,a)=>t+a.s,0), bar=KPI_ROAS, CT={};
  list.forEach(a=>{ a.concept=conceptKey(a.name); const c=CT[a.concept]||(CT[a.concept]={s:0,r:0,p:0}); c.s+=a.s; c.r+=a.rev; c.p+=a.p; });
  const CV={}; Object.keys(CT).forEach(k=>CV[k]=idgaf(k,w,CT[k]));
  list.forEach(a=>{
    const fresh = firstSeen[a.name]>=early && firstSeen[a.name]>DATA_START;
    const [v,info]=CV[a.concept];
    a.v = v==='Loser' && fresh && a.s < EARLY_SHARE*tot ? 'Too early' : v;
    a.vinfo = info;
    a.share = tot ? a.s/tot : 0;
    a.prof = a.r>=bar;
    // Any ad whose DCT has a ClickUp task takes CS / Editor from that task. Picks fill whatever the task leaves empty.
    const t0 = a.dct ? tasksByDct[a.dct] : null;
    const pk = pickFor(a.name);
    const tcs = t0 ? personId(t0.cs) : null, ted = t0 ? personId(t0.editor) : null;
    // A DCT number shared by two or more ClickUp tasks is ambiguous, so it is skipped.
    const t = t0 && (dctCount[a.dct]||0) < 2 && (a.dct>=TRACK_FROM || tcs || ted) ? t0 : null;
    a.task=t||null;
    a.cs = real(t && tcs) || (pk ? real(personId(pk.cs)) : null);
    a.ed = real(t && ted) || (pk ? real(personId(pk.ed)) : null);
    a.csFrom = real(t && tcs) ? 'ClickUp' : a.cs ? 'pick' : null;
    a.edFrom = real(t && ted) ? 'ClickUp' : a.ed ? 'pick' : null;
    a.src = t ? 'ClickUp' : pk ? 'Saved pick' : null;
    a.unmatched = a.dct>=TRACK_FROM && !t;
  });
  list.sort((x,y)=>y.s-x.s);
  const all=list.slice(0,TOP_N[w.kind]||9);   // only the top N ads by spend are analysed and shown
  return cache[p]={list:all,full:list,tot,bar,src};
}
const W = () => adsFor(period);
const VCLS = {'Breakthrough':'bt','Spend Winner':'spend','KPI Winner':'kpi','Loser':'lose','Too early':'early'};
const isFlag = a => ['Breakthrough','Spend Winner','KPI Winner'].includes(a.v);
const attributedAd = a => !!(a.cs||a.ed);


function renderWinners(){
  const {list,full,tot,bar}=W(), N=TOP_N[K()]||9;
  const done=list.filter(a=>a.cs&&a.ed).length;
  $('#pickCount').textContent=`${done} of ${list.length} ads fully credited`;
  $('#pickBar').style.width=list.length?(100*done/list.length)+'%':'0';
  $('#flowPicks').textContent=`${done} of ${list.length} top ads credited`;
  const n=v=>list.filter(a=>a.v===v).length;
  $('#winTitle').textContent=`Top ${N} ads by spend`;
  $('#winSub').textContent=`${WIN[period].label}: ${money(tot)} spent across ${full.length} ads. Showing the top ${list.length} by spend. IDGAF rules: KPI ${bar.toFixed(1)} ROAS, share line 10% of weekly account spend`+
    `. In the top ${list.length}: ${n('Breakthrough')} Breakthrough, ${n('Spend Winner')} Spend Winner, ${n('KPI Winner')} KPI Winner, ${n('Too early')} too early.`;
  const sel=(a,role,opts,cur)=>`<label class="pk"><span>${role}</span><select data-ad="${esc(a.name)}" data-role="${role}"><option value="">Pick…</option>${opts.map(o=>`<option${o===cur?' selected':''}>${o}</option>`).join('')}</select></label>`;
  $('#wgrid').innerHTML = list.length ? list.map((a,i)=>{
    const type=`<span class="pill ${VCLS[a.v]}">${a.v}</span>`+(a.v!=='Too early'?`<span class="pill ${a.prof?'prof':'unprof'}">${a.prof?'Profitable':'Unprofitable'}</span>`:'');
    const fixed = a.csFrom==='ClickUp' && a.edFrom==='ClickUp';
    const csPart = a.csFrom==='ClickUp' ? `<span>CS ${esc(a.cs)}</span>` : sel(a,'CS',CS_OPTS,a.cs);
    const edPart = a.edFrom==='ClickUp' ? `<span>ED ${esc(a.ed)}</span>` : sel(a,'ED',ED_OPTS,a.ed);
    const who = `<div class="owner picker">${csPart}${edPart}</div>`+
      (a.task ? `<div class="who">From ClickUp: <a href="${esc(a.task.url)}" target="_blank" rel="noopener">${esc(a.task.name)}</a>${fixed?'':'. Pick whoever ClickUp is missing.'}</div>`
      : `<div class="who">${a.unmatched?`DCT ${a.dct} has no ClickUp task. `:a.dct?`No ClickUp task for DCT # ${a.dct}. `:'No DCT number in the ad name. '}${a.cs&&a.ed?'Credit saved for everyone.':'Pick who made it. It saves for everyone.'}</div>`);
    const h=a.h>1?`<span>${a.h.toFixed(0)}%<em>hook</em></span>`:'';
    const md=mediaFor(a.name), href=md.preview;
    const playable=md.video||md.embed||md.thumb;
    const th=`<${playable?`button type="button" data-play="${esc(a.name)}" title="${md.video||md.embed?'Play the ad':'View the ad'}"`:href?`a href="${esc(href)}" target="_blank" rel="noopener" title="Open the ad preview"`:'div'} class="th${md.thumb?'':' blank'}"${md.thumb?` style="background-image:url('${esc(md.thumb)}')"`:''}>${md.thumb?'':`<b>${a.dct?'DCT '+a.dct:esc(a.name.slice(0,12))}</b>`}${a.video||md.video||md.embed?'<i class="play">▶</i>':''}<span>#${i+1}</span></${playable?'button':href?'a':'div'}>`;
    return `<div class="ad ${a.cs&&a.ed?'ok':''}">${th}<div class="body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${type}<span class="pill">${a.video?'Video':'Static'}</span></div>
      <div class="nm">${href?`<a href="${esc(href)}" target="_blank" rel="noopener">${esc(a.name)}</a>`:esc(a.name)}</div>
      <div class="mx"><span>${a.r.toFixed(2)}<em>ROAS</em></span><span>${money(a.s)}<em>spend</em></span><span>${a.p}<em>purch</em></span>${h}</div>
      ${who}</div></div>`; }).join('') : '<p class="note">Nothing here for this period.</p>';
}
/* Plays the ad on the page: the video when Meta gave one, otherwise the full-size image. */
const player=$('#player'), pbox=$('#pbox');
function closePlayer(){ pbox.innerHTML=''; player.hidden=true; document.body.style.overflow=''; }
$('#wgrid').addEventListener('click',e=>{
  const b=e.target.closest('[data-play]'); if(!b) return;
  const name=b.dataset.play, md=mediaFor(name);
  pbox.innerHTML=(md.video?`<video src="${esc(md.video)}" ${md.thumb?`poster="${esc(md.thumb)}"`:''} controls autoplay playsinline></video>`:md.embed?`<iframe src="${esc(md.embed)}" title="Ad preview" scrolling="no" allow="autoplay; encrypted-media"></iframe>`:`<img src="${esc(md.thumb)}" alt="">`)+
    `<div class="pcap"><b>${esc(name)}</b>${md.preview?` · <a href="${esc(md.preview)}" target="_blank" rel="noopener">Open in Meta</a>`:''}</div>`;
  const v=pbox.querySelector('video'); if(v) v.addEventListener('error',()=>{ if(md.preview) pbox.querySelector('.pcap').insertAdjacentHTML('beforeend',' · This video link expired. It refreshes daily at 6:00.'); });
  player.hidden=false; document.body.style.overflow='hidden';
});
$('#pclose').addEventListener('click',closePlayer);
player.addEventListener('click',e=>{ if(e.target===player) closePlayer(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!player.hidden) closePlayer(); });
$('#wgrid').addEventListener('change',async e=>{
  const el=e.target; if(!el.matches('select[data-ad]')) return;
  const name=el.dataset.ad, prev=Object.assign({},PICKS[name]||{});
  const cur=Object.assign({},prev); if(el.dataset.role==='CS') cur.cs=el.value||undefined; else cur.ed=el.value||undefined;
  ['cs','ed'].forEach(k=>{ if(!real(cur[k])) delete cur[k]; });
  PICKS[name]=cur; Object.keys(cache).forEach(k=>delete cache[k]); Object.keys(TEAMC).forEach(k=>delete TEAMC[k]); renderAll();
  toast(`Saving ${name}…`);
  try{
    const r=await fetch(PICK_HOOK+'?'+new URLSearchParams({ad:name,cs:cur.cs||'',ed:cur.ed||''}));
    const j=await r.json().catch(()=>({ok:r.ok}));
    if(!r.ok||j.ok===false) throw new Error(j.error||r.status);
    toast(`Saved for everyone: ${name} · CS ${cur.cs||'–'} · ED ${cur.ed||'–'}`);
  }catch(err){
    PICKS[name]=prev; Object.keys(cache).forEach(k=>delete cache[k]); Object.keys(TEAMC).forEach(k=>delete TEAMC[k]); renderAll();
    toast(`Could not save ${name}. Try again.`);
  }
});

/* ---------- production (ClickUp tasks) ---------- */
const ts = v => v ? new Date(isNaN(+v)?v:+v) : null;
function windowRange(){ const w=WIN[period]; if(!w.from) return [0,0];
  const a=new Date(w.from+'T00:00:00Z'), b=new Date(addD(w.to,1)+'T00:00:00Z');
  return K()==='life'?[new Date(0),b]:[a,b]; }
function prod(){
  const [a,b]=windowRange(), inW=d=>d&&d>=a&&d<b, E={}, C={};
  (D.tasks||[]).forEach(t=>{
    const cs=personId(t.cs), ed=personId(t.editor), fin=ts(t.final)||ts(t.launched), st=ts(t.started)||ts(t.created);
    if(cs){ const c=C[cs]||(C[cs]={briefs:0,shipped:0,open:0,tl:[]}); if(inW(ts(t.created))) c.briefs++; const la=ts(t.launched), cr=ts(t.created);
      if(inW(la)){ c.shipped++; if(cr&&la>cr) c.tl.push((la-cr)/864e5); } if(!t.launched) c.open++; }
    if(ed){ const e=E[ed]||(E[ed]={delivered:0,days:[],rv:[],open:0}); const fd=ts(t.first_draft);
      if(inW(fin)){ e.delivered++; if(st) e.days.push((fin-st)/864e5); if(fd&&fin>=fd) e.rv.push((fin-fd)/864e5); } if(!fin) e.open++; }
  });
  const avg=l=>l.length?l.reduce((x,y)=>x+y,0)/l.length:null;
  Object.values(E).forEach(e=>{ e.fin=avg(e.days); e.rev=avg(e.rv); });
  Object.values(C).forEach(c=>{ c.ttl=avg(c.tl); });
  return {E,C};
}
function renderProd(){
  const {E,C}=prod();
  $('#prodNote').textContent=`From the Creative Forge list in ClickUp (${(D.tasks||[]).length} tasks). Delivered = Final date in the window. Shipped = Launched date in the window.`;
  $('#edT').innerHTML='<tr><th>Editor</th><th class="n">Delivered</th><th class="n">Days to final</th><th class="n">Open</th></tr>'+
    PEOPLE.filter(p=>p.role==='ED').map(p=>{const v=E[p.id]||{};return `<tr><td>${p.id}</td><td class="n"><b>${v.delivered||0}</b></td><td class="n">${v.fin!=null?v.fin.toFixed(1):'–'}</td><td class="n">${v.open||0}</td></tr>`}).join('');
  $('#csT').innerHTML='<tr><th>Strategist</th><th class="n">Briefs</th><th class="n">Shipped</th><th class="n">Open</th></tr>'+
    PEOPLE.filter(p=>p.role==='CS').map(p=>{const v=C[p.id]||{};return `<tr><td>${p.id}</td><td class="n"><b>${v.briefs||0}</b></td><td class="n">${v.shipped||0}</td><td class="n">${v.open||0}</td></tr>`}).join('');
}

/* ---------- cards ---------- */
const attributed = (id,role) => W().list.filter(a=>(role==='CS'?a.cs:a.ed)===id);
const wavg=(l,f,w)=>{let s=0,t=0;l.forEach(a=>{const v=f(a),x=w(a);if(v!=null){s+=v*x;t+=x;}});return t?s/t:null;};
/* Card stats show real numbers. Each front stat also gets a 60-95 score against the best person in the same role in this
   window (best = 95, zero = 60; briefs and deliveries count against a best of at least 3), so ratings stay fair while most ads are still uncredited. A stat nobody in the role has
   scored yet (say, no breakthroughs this week) is shown but left out of the rating. ROAS is scored against the account's
   ROAS in the window (account level = 72). S entries: [label, score, description, side, shown value]. */
function rawFor(p){
  const mine=attributed(p.id,p.role), {tot}=W(), P=prod();
  const spend=mine.reduce((t,a)=>t+a.s,0), rev=mine.reduce((t,a)=>t+a.rev,0);
  const v=p.role==='ED'?P.E[p.id]:P.C[p.id];
  return {mine, spend, rev, prodN: v?(p.role==='ED'?v.delivered:v.briefs):null,
    share: tot?100*spend/tot:0, roas: spend?rev/spend:null,
    nBT: mine.filter(a=>a.v==='Breakthrough').length, nSW: mine.filter(a=>a.v==='Spend Winner').length, nKPI: mine.filter(a=>a.v==='KPI Winner').length};
}
const TEAMC={};
function teamMax(role){
  const key=period+'|'+role; if(TEAMC[key]) return TEAMC[key];
  const rs=PEOPLE.filter(p=>p.role===role).map(rawFor), mx=f=>Math.max(0,...rs.map(f).filter(x=>x!=null));
  return TEAMC[key]={prodN:Math.max(3,mx(r=>r.prodN)),   // 1 brief out of a best of 1 should not read as a 95
     share:mx(r=>r.share), nBT:mx(r=>r.nBT), nSW:mx(r=>r.nSW), nKPI:mx(r=>r.nKPI)};
}
const rel=(v,max)=>max>0&&v!=null?Math.round(60+35*v/max):null;
function statsFor(p){
  const R=rawFor(p), {mine,spend}=R, {tot,list}=W(), P=prod(), M=teamMax(p.role);
  const acct=list.length?list.reduce((t,a)=>t+a.rev,0)/Math.max(1,list.reduce((t,a)=>t+a.s,0)):null;
  const vids=mine.filter(a=>a.video&&a.h>1);
  const hook=wavg(vids,a=>a.h,a=>a.s), hold=wavg(vids,a=>a.hd>0?a.hd:null,a=>a.s);
  const has=mine.length>0||list.some(attributedAd);
  const S=[];
  const noAttr=has?'no ads credited to them in the top '+list.length:'no ads credited yet';
  const pct=v=>v.toFixed(v>=10||v===0?0:1)+'%';
  const nobody=' (nobody on the team has one yet, so it does not count toward the rating)';
  if(p.role==='ED') S.push(['DLV', rel(R.prodN,M.prodN), R.prodN!=null?`${R.prodN} ads delivered (Final date in the window)`:'no ClickUp tasks yet','front', R.prodN!=null?String(R.prodN):null]);
  else S.push(['BRF', rel(R.prodN,M.prodN), R.prodN!=null?`${R.prodN} briefs created in ClickUp`:'no ClickUp tasks yet','front', R.prodN!=null?String(R.prodN):null]);
  S.push(['ADSP', has?rel(R.share,M.share):null, has?`${pct(R.share)} of all Meta spend · ${money(spend)} of ${money(tot)}`:noAttr,'front', has?pct(R.share):null]);
  S.push(['BRK', has?rel(R.nBT,M.nBT):null, has?`${R.nBT} breakthrough${R.nBT===1?'':'s'}: 10%+ of weekly spend at ${KPI_ROAS.toFixed(1)}+ ROAS while the account budget grew 10%+`+(M.nBT?'':nobody):noAttr,'front', has?String(R.nBT):null]);
  S.push(['SPND', has?rel(R.nSW,M.nSW):null, has?`${R.nSW} spend winner${R.nSW===1?'':'s'}: 10%+ of weekly spend, budget not growing on it`+(M.nSW?'':nobody):noAttr,'front', has?String(R.nSW):null]);
  S.push(['KPI', has?rel(R.nKPI,M.nKPI):null, has?`${R.nKPI} KPI winner${R.nKPI===1?'':'s'}: under the 10% line at ${KPI_ROAS.toFixed(1)}+ ROAS (3+ purchases)`+(M.nKPI?'':nobody):noAttr,'front', has?String(R.nKPI):null]);
  S.push(['ROAS', R.roas!=null&&acct?clamp(Math.round(72+60*(R.roas-acct)),50,95):null, R.roas!=null?`${R.roas.toFixed(2)} blended ROAS on ${money(spend)} (top ads overall: ${acct?acct.toFixed(2):'–'})`:noAttr,'front', R.roas!=null?R.roas.toFixed(2):null]);
  // back of the card: softer metrics
  S.push(['HOOK', hook!=null?clamp(Math.round(30+1.15*hook),35,99):null, hook!=null?'3s views / impressions on their videos':'no credited videos','back', hook!=null?hook.toFixed(0)+'%':null]);
  S.push(['HOLD', hold!=null?clamp(Math.round(40+2*hold),35,99):null, hold!=null?'thruplays / 3s views on their videos':'no credited videos','back', hold!=null?hold.toFixed(0)+'%':null]);
  if(p.role==='ED'){ const v=P.E[p.id]||{};
    S.push(['DAYS', v.fin!=null?clamp(Math.round(99-5*v.fin),40,95):null, v.fin!=null?'average days from start to Final':'no Final dates yet','back', v.fin!=null?v.fin.toFixed(1)+'d':null]);
    S.push(['REV', v.rev!=null?clamp(Math.round(95-6*v.rev),40,95):null, v.rev!=null?'average days from first draft to Final (revision time)':'no first draft dates yet','back', v.rev!=null?v.rev.toFixed(1)+'d':null]);
    S.push(['OPEN', null, 'tasks without a Final date','back', String(v.open||0)]);
  } else { const v=P.C[p.id]||{};
    S.push(['SHIP', v.briefs?clamp(Math.round(40+0.55*(100*v.shipped/v.briefs)),35,99):null, v.briefs?`${v.shipped} of ${v.briefs} briefs launched in the window`:'no briefs in the window','back', v.briefs?`${v.shipped}/${v.briefs}`:null]);
    S.push(['DAYS', v.ttl!=null?clamp(Math.round(99-3*v.ttl),40,95):null, v.ttl!=null?'average days from brief to launch':'no launches yet','back', v.ttl!=null?v.ttl.toFixed(1)+'d':null]);
    S.push(['OPEN', null, 'briefs not launched yet','back', String(v.open||0)]);
  }
  return {S,mine};
}
const baseOvr=p=>{const v=statsFor(p).S.filter(s=>s[3]==='front').map(s=>s[1]).filter(x=>x!=null);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):60;};
const visiblePeople=()=>PEOPLE.filter(p=>!p.onlyIfAds||attributed(p.id,p.role).length);
const special=()=>{const vp=visiblePeople();return vp.reduce((b,p)=>baseOvr(p)>baseOvr(b)?p:b,vp[0]);};
const boost=p=>(SHORT()&&p===special())?3:0;
const ovrOf=p=>Math.min(99,baseOvr(p)+boost(p));
const tierOf=p=>p===special()?'t-special':(ovrOf(p)>=80?'t-gold':ovrOf(p)>=70?'t-silver':'t-bronze');   // gold 80+, silver 70-79
const colorOf=v=>v>=80?'var(--good)':v>=68?'var(--mid)':'var(--low)';

function cardHTML(p){
  const o=ovrOf(p),t=tierOf(p),b=boost(p),st=statsFor(p).S,sp=t==='t-special';
  const stats=st.filter(s=>s[3]==='front').map(s=>s[4]==null?'<div class="na"><b>–</b><span>'+s[0]+'</span></div>':'<div><b>'+esc(s[4])+'</b><span>'+s[0]+'</span></div>').join('');
  const rows=st.map(s=>{const v=s[1];return '<div class="row"><span class="k">'+s[0]+'</span><div class="meta"><span>'+esc(s[2])+'</span><div class="track"><div class="fill" style="--w:'+(v??0)+'%;background:'+(v==null?'transparent':colorOf(v))+'"></div></div></div><span class="v">'+esc(s[4]??'–')+'</span></div>';}).join('');
  const foot=sp?(WIN[period].tag+' · '+WIN[period].label):('Lumeo · '+p.role);
  return '<button type="button" class="cardbtn '+t+'" aria-pressed="false" aria-label="'+esc(p.name)+', '+esc(p.roleName)+', rating '+o+'. Tap to flip.">'+
    '<div class="shadow"></div><div class="tiltbox"><div class="side front3d">'+
    '<div class="edge e4 shield"></div><div class="edge e3 shield"></div><div class="edge e2 shield"></div><div class="edge e1 shield"></div>'+
    '<div class="bgface shield">'+(sp?'<div class="anim"></div><div class="veil"></div><div class="lines"></div>':'')+'<div class="shine"></div></div>'+
    '<div class="lay l-av">'+(p.img?'<img src="'+esc(p.img)+'" alt="">':'<i>'+p.ini+'</i>')+'</div>'+
    '<div class="lay l-ovr"><b>'+o+'</b><span>'+p.role+'</span></div><div class="lay l-nm">'+esc(p.name)+'</div>'+
    '<div class="lay l-st">'+stats+'</div><div class="lay l-foot">'+esc(foot)+'</div>'+
    (sp?'<span class="badge">'+WIN[period].tag+'</span>':'')+'<div class="gloss shield"></div></div>'+
    '<div class="side back3d"><div class="edge e1 shield"></div><div class="bgface shield"></div>'+
    '<div class="bk'+(st.length>8?' dense':'')+'"><h4>'+esc(p.name)+'<small>'+esc(WIN[period].label)+' · '+esc(p.roleName)+'</small></h4>'+rows+
    '<div class="hint">'+(b?'Rating includes +3 for '+esc(WIN[period].special)+' · ':'')+'Tap to flip back</div></div></div></div></button>';
}
function bestWorst(p){
  const st=statsFor(p).S.filter(s=>s[1]!=null&&s[3]==='front'); if(!st.length) return '';
  const best=st.reduce((m,s)=>s[1]>m[1]?s:m),worst=st.reduce((m,s)=>s[1]<m[1]?s:m);
  return '<div class="panel"><div class="p-tag"><span>'+esc(WIN[period].label)+'</span></div><div class="bestworst"><span>Best <b>'+best[0]+' '+esc(best[4])+'</b></span><span>Work on <b>'+worst[0]+' '+esc(worst[4])+'</b></span></div></div>';
}
function adHTML(p){
  const mine=statsFor(p).mine; if(!mine.length) return '';
  const rank={'Breakthrough':4,'Spend Winner':3,'KPI Winner':2,'Loser':1,'Too early':0};
  const a=mine.slice().sort((x,y)=>(rank[y.v]-rank[x.v])||(y.rev-x.rev))[0];
  return '<div class="panel"><div class="p-tag"><span>Best ad · '+esc(WIN[period].label)+'</span></div>'+
    '<div class="adinfo"><span class="fmt">'+esc(a.name)+'</span><span class="why">'+esc(a.v+' at '+a.r.toFixed(2)+' ROAS on '+money(a.s))+'</span></div>'+
    '<div class="adstats"><span>'+a.r.toFixed(2)+'<em>ROAS</em></span><span>'+money(a.s)+'<em>spend</em></span>'+(a.h>1?'<span>'+a.h.toFixed(0)+'%<em>hook</em></span>':'<span>'+a.p+'<em>purch</em></span>')+'</div></div>';
}
function wire(root){
  root.querySelectorAll('.cardbtn').forEach(btn=>{
    const move=(x,y)=>{const r=btn.getBoundingClientRect(),px=clamp((x-r.left)/r.width,0,1),py=clamp((y-r.top)/r.height,0,1);
      btn.classList.add('moving');btn.style.setProperty('--ry',((px-.5)*34).toFixed(2)+'deg');btn.style.setProperty('--rx',((.5-py)*30).toFixed(2)+'deg');
      ['--mx','--gx'].forEach(k=>btn.style.setProperty(k,(px*100)+'%'));['--my','--gy'].forEach(k=>btn.style.setProperty(k,(py*100)+'%'));};
    const reset=()=>{btn.classList.remove('moving','touching');btn.style.setProperty('--ry','0deg');btn.style.setProperty('--rx','0deg');};
    btn.addEventListener('pointermove',e=>{if(e.pointerType==='touch')btn.classList.add('touching');move(e.clientX,e.clientY);});
    btn.addEventListener('pointerleave',reset);btn.addEventListener('pointercancel',reset);
    btn.addEventListener('click',()=>btn.setAttribute('aria-pressed',String(btn.getAttribute('aria-pressed')!=='true')));
  });
}
function renderCards(){
  $('#title').textContent=WIN[period].label+' scorecards';
  $('#specialLabel').textContent=WIN[period].tag+' = '+WIN[period].special+(SHORT()?', top rating gets +3':'');
  $('#packSub').textContent=WIN[period].pack+' PACK';
  const list=visiblePeople().slice().sort((a,b)=>ovrOf(b)-ovrOf(a)).filter(p=>filter==='all'||p.role===filter);
  $('#squad').innerHTML=list.map(p=>'<div class="slot">'+cardHTML(p)+'<span class="tap">Tap card for breakdown</span>'+bestWorst(p)+adHTML(p)+'</div>').join('');
  wire($('#squad'));
  const n=W().list.filter(attributedAd).length;
  const N=W().list.length;
  $('#footNote').textContent=(n?`Ratings use ${n} of the top ${N} ads (the ones with a CS or editor credited). `:`None of the top ${N} ads has a CS or editor credited yet, so ratings only use ClickUp production. `)+`Each stat is scored against the best person in the same role this window. Pick the CS / editor on uncredited ads above to fill the ratings in.`;
}
function renderAll(){
  const w=WIN[period], src=W().src;
  $('#periodNote').textContent=!w.from?'No Meta data yet':`Meta: ${w.from===w.to?fmtDay(w.from):fmtD(w.from)+' to '+fmtD(w.to)}${soFar(w.to)?' (so far)':''}`+(src==='weekly'?' · weekly numbers (before daily data starts)':'');
  $('#rulesLegend').innerHTML=`<b>Verdicts (IDGAF)</b> Checked by Monday week on the ad's concept, using all Meta spend in the account. `+
    `<b>Breakthrough</b> = a week at 10%+ of account spend and ${KPI_ROAS.toFixed(1)}+ ROAS while the account spends 10%+ more per day than the week before the concept launched (a week 1 winner can become one in week 2 or 3) · `+
    `<b>Spend Winner</b> = reached 10%+ of a week's spend, without the budget growing on it · <b>KPI Winner</b> = under the 10% line, ${KPI_ROAS.toFixed(1)}+ ROAS with 3+ purchases · `+
    `<b>Loser</b> = under the line and under ${KPI_ROAS.toFixed(1)} ROAS · <b>Too early</b> = under $100 spent, or new in the last 7 days with under 3% of spend. A week only counts if the concept spent $500+ in it.`;
  renderProd(); renderWinners(); renderCards();
}
const updAt=new Date(DAILY?DAILY.generated_at:D.generated_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
$('#updated').textContent=THRU ? `Data updated ${updAt}. Meta numbers through ${fmtDay(THRU)}${TODAY_PART?' (so far)':''}. Refreshes every morning.`
  : 'Data updated '+updAt+'. Daily numbers are not in yet, so this shows weekly numbers.';
document.querySelectorAll('[data-f]').forEach(t=>t.addEventListener('click',()=>{filter=t.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.setAttribute('aria-pressed',String(x===t)));renderCards();}));
const pickSel=$('#periodPick'), rangeBox=$('#rangeBox'), rFrom=$('#rFrom'), rTo=$('#rTo');
if(!DAYS.length) document.querySelector('.seg [data-p="day"]').hidden=true;
[rFrom,rTo].forEach(i=>{ i.min=DATA_START||''; i.max=END||''; });
const PRESETS=[['7','Last 7 days'],['14','Last 14 days'],['30','Last 30 days'],['tm','This month'],['lm','Last month']];
function presetKey(v){ if(!END) return null;
  if(v==='tm') return 'r:'+END.slice(0,8)+'01_'+END;
  if(v==='lm'){ const f=addD(END.slice(0,8)+'01',-1).slice(0,7); return 'r:'+f+'-01_'+monthEnd(f); }
  return 'r:'+addD(END,1-(+v))+'_'+END; }
function fillPick(){ const k=K();
  pickSel.hidden=(k==='life'); rangeBox.hidden=(k!=='range');
  if(k==='life') return;
  let opts;
  if(k==='day') opts=DAYS.slice().reverse().map(d=>[`d:${d}`,fmtDay(d)+(soFar(d)?' (so far)':'')]);
  else if(k==='week') opts=ALLWK.slice().reverse().map(w=>[`w:${w}`,`Week ${isoWeek(w)} · ${fmtD(w)} to ${fmtD(addD(w,6))}${weekPart(w)?' (so far)':''}`]);
  else if(k==='month') opts=ALLM.slice().reverse().map(m=>[`m:${m}`,monthLabel(m)+(THRU&&monthEnd(m)>=THRU?' (so far)':'')]);
  else { const cur=PRESETS.find(([v])=>presetKey(v)===period);
    opts=PRESETS.map(([v,l])=>[`p:${v}`,l]).concat([['p:custom','Custom dates']]);
    pickSel.innerHTML=opts.map(([v,l])=>`<option value="${v}"${(cur?'p:'+cur[0]:'p:custom')===v?' selected':''}>${esc(l)}</option>`).join('');
    const w=WIN[period]; rFrom.value=w.from; rTo.value=w.to; return; }
  pickSel.innerHTML=opts.map(([v,l])=>`<option value="${v}"${v===period?' selected':''}>${esc(l)}</option>`).join('');
}
const LBL={day:'Day',week:'Week',month:'Month',range:'Range',life:'Lifetime'};
function setPeriod(key){ period=key; const k=K();
  document.querySelectorAll('.seg button').forEach(x=>{ x.setAttribute('aria-pressed',String(x.dataset.p===k)); x.textContent=x.dataset.p===k&&k!=='range'?winFor(period).label:LBL[x.dataset.p]; });
  fillPick(); try{ const u=new URL(location.href); u.searchParams.set('p',period); history.replaceState(null,'',u); }catch(e){}
  renderAll(); }
document.querySelectorAll('.seg button').forEach(t=>t.addEventListener('click',()=>{ const k=t.dataset.p; setPeriod(K()===k?period:DEFAULT[k]); }));
pickSel.addEventListener('change',()=>{ const v=pickSel.value;
  if(!v.startsWith('p:')) return setPeriod(v);
  if(v==='p:custom'){ rFrom.focus(); return; }
  const key=presetKey(v.slice(2)); if(key) setPeriod(key); });
function applyRange(){ let a=rFrom.value, b=rTo.value; if(!isDate(a)||!isDate(b)) return toast('Pick both dates');
  if(a>b) [a,b]=[b,a]; setPeriod('r:'+a+'_'+b); }
$('#rApply').addEventListener('click',applyRange);
[rFrom,rTo].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter') applyRange(); }));
const fromUrl=new URLSearchParams(location.search).get('p')||'';
period = validKey(fromUrl) ? fromUrl : DEFAULT.week;
setPeriod(period);

/* ---------- pack opening ---------- */
const ov=$('#ov'),pack=$('#pack'),land=$('#land'),wRole=$('#wRole'),wOvr=$('#wOvr'),controls=$('#controls'),counter=$('#counter'),nextBtn=$('#nextBtn'),doneBtn=$('#doneBtn');
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let order=[],idx=0,timers=[];
const later=(fn,ms)=>timers.push(setTimeout(fn,reduce?Math.min(ms,80):ms));
const clearTimers=()=>{timers.forEach(clearTimeout);timers=[];};
function reveal(i){
  clearTimers(); const p=order[i],t=tierOf(p);
  counter.textContent='Card '+(i+1)+' of '+order.length;
  controls.hidden=true;land.classList.remove('show');land.innerHTML='';
  wRole.className='w-role';wOvr.className='w-ovr';ov.className='ov '+(t==='t-special'?'t-special':'');
  pack.style.display='';void pack.offsetWidth;
  later(()=>ov.classList.add('charging'),250);
  later(()=>ov.classList.add('burst'),1750);
  later(()=>{pack.style.display='none';wRole.textContent=t==='t-special'?WIN[period].special:p.roleName;void wRole.offsetWidth;wRole.classList.add('show');},2000);
  later(()=>{wOvr.textContent=ovrOf(p);wOvr.classList.add(t);void wOvr.offsetWidth;wOvr.classList.add('show');},2900);
  later(()=>{land.innerHTML=cardHTML(p)+adHTML(p);wire(land);void land.offsetWidth;land.classList.add('show');},3950);
  later(()=>{controls.hidden=false;nextBtn.hidden=(i===order.length-1);(i===order.length-1?doneBtn:nextBtn).focus();},5000);
}
function openPack(){order=visiblePeople().slice().sort((a,b)=>ovrOf(a)-ovrOf(b));idx=0;ov.hidden=false;document.body.style.overflow='hidden';reveal(0);}
function closePack(){clearTimers();ov.hidden=true;document.body.style.overflow='';$('#openBtn').focus();}
$('#openBtn').addEventListener('click',openPack);
nextBtn.addEventListener('click',()=>{idx=Math.min(idx+1,order.length-1);reveal(idx);});
doneBtn.addEventListener('click',closePack);
$('#skipBtn').addEventListener('click',closePack);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!ov.hidden)closePack();});
})();
