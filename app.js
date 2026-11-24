/* Lumeo scorecards. Reads data.json (written every Monday by Make) and picks.json (manual attribution).
   One rule set, three windows: Week (last Mon-Sun), Month (calendar month of last week), Lifetime. */
(async function(){
const TRACK_FROM = 1000;      // DCT # from which attribution comes from the ClickUp task (CS / Editor fields)
const EARLY_SHARE = 0.03;     // too early: first seen in the window's last week and under 3% of the window's spend
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

let D, PICKS={};
try{
  const bust='?t='+Date.now();
  D = await (await fetch('data.json'+bust)).json();
  try{ PICKS = await (await fetch('picks.json'+bust)).json(); }catch(e){}
}catch(e){ $('#title').textContent='Scorecards'; $('#updated').textContent='Could not load data.json yet.'; return; }

/* picks made on this page live in this browser until they are exported into picks.json */
const LKEY='lumeo-picks-v1';
let LOCAL={}; try{ LOCAL=JSON.parse(localStorage.getItem(LKEY)||'{}')||{}; }catch(e){ LOCAL={}; }
const saveLocal=()=>{ try{ localStorage.setItem(LKEY,JSON.stringify(LOCAL)); }catch(e){} };
const pickFor=name=>LOCAL[name]||PICKS[name]||null;
const CS_OPTS=['Victor','Joel','Richard','Alex','Other','Creator'];
const ED_OPTS=['Hamid','Daly','techkidd','Eren','Joe','Other','Creator'];
const toast=m=>{const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('on'),2200);};

const S = D.settings||{};
const SPEND_LINE = S.spend_line||5000, KPI_MIN = S.kpi_min_purchases||3, FLOOR = S.profitable_roas||1.1;
const ALLW = [...new Set((D.ad_weekly||[]).map(r=>r.week))].sort();
const LAST = D.last_week || ALLW[ALLW.length-1];
const DATA_START = ALLW[0];
const isoWeek = d => { const t=new Date(d+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7)); const y=new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil(((t-y)/864e5+1)/7); };
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const lastMonth = LAST ? LAST.slice(0,7) : '';
const WIN = {
  week:{weeks:ALLW.filter(w=>w===LAST), label:'Week '+(LAST?isoWeek(LAST):''), tag:'POTW', special:'Player of the Week', pack:'WEEK '+(LAST?isoWeek(LAST):'')},
  month:{weeks:ALLW.filter(w=>w.slice(0,7)===lastMonth), label:LAST?MONTHS[+lastMonth.slice(5)-1]:'Month', tag:'POTM', special:'Player of the Month', pack:'MONTH'},
  life:{weeks:ALLW, label:'Lifetime', tag:'GOAT', special:'Best overall', pack:'LIFETIME'}
};
let period='week', filter='all', wfilter='win';

/* ---------- ads by window ---------- */
const tasksByDct = {}; (D.tasks||[]).forEach(t=>{ if(t.dct && !tasksByDct[t.dct]) tasksByDct[t.dct]=t; });
const firstSeen = {}; (D.ad_weekly||[]).forEach(r=>{ if(!firstSeen[r.ad]||r.week<firstSeen[r.ad]) firstSeen[r.ad]=r.week; });
const cache = {};
function adsFor(p){
  if(cache[p]) return cache[p];
  const set=new Set(WIN[p].weeks), m={};
  (D.ad_weekly||[]).forEach(r=>{ if(!set.has(r.week)) return;
    const a=m[r.ad]||(m[r.ad]={name:r.ad,dct:r.dct,s:0,rev:0,p:0,imp:0,v3:0,tp:0,lastS:0});
    a.s+=r.spend; a.rev+=r.revenue; a.p+=r.purchases; a.imp+=r.imp; a.v3+=r.v3; a.tp+=r.tp;
    if(r.week===LAST) a.lastS+=r.spend; });
  const list=Object.values(m).map(a=>({...a, r:a.s?a.rev/a.s:0, h:a.imp?100*a.v3/a.imp:0, hd:a.v3?100*a.tp/a.v3:0, video:a.v3>0}));
  const tot=list.reduce((t,a)=>t+a.s,0);
  const top=list.slice().sort((x,y)=>y.s-x.s).slice(0,20), ts=top.reduce((t,a)=>t+a.s,0);
  const raw=ts?top.reduce((t,a)=>t+a.rev,0)/ts:FLOOR;
  const bar=Math.max(raw,FLOOR);
  list.forEach(a=>{
    const fresh = firstSeen[a.name]===LAST && LAST!==DATA_START;
    a.v = fresh && a.s < EARLY_SHARE*tot ? 'Too early'
        : a.s>=SPEND_LINE ? (a.r>=bar?'Breakthrough':a.r>=1?'Spend Winner':'Loser')
        : (a.r>=bar && a.p>=KPI_MIN ? 'KPI Winner' : 'Loser');
    a.prof = a.r>=bar;
    const t = a.dct>=TRACK_FROM ? tasksByDct[a.dct] : null;
    const pk = pickFor(a.name);
    a.task=t||null;
    a.cs = t ? personId(t.cs) : pk ? personId(pk.cs) : null;
    a.ed = t ? personId(t.editor) : pk ? personId(pk.ed) : null;
    a.src = t ? 'ClickUp' : LOCAL[a.name] ? 'Picked here' : pk ? 'Manual pick' : null;
    a.unmatched = a.dct>=TRACK_FROM && !t;
  });
  list.sort((x,y)=>y.s-x.s);
  return cache[p]={list,tot,bar,raw};
}
const W = () => adsFor(period);
const VCLS = {'Breakthrough':'bt','Spend Winner':'spend','KPI Winner':'kpi','Loser':'lose','Too early':'early'};
const isFlag = a => ['Breakthrough','Spend Winner','KPI Winner'].includes(a.v);
const attributedAd = a => !!(a.cs||a.ed);

function renderWinners(){
  const {list,tot,bar,raw}=W(), shown=list.filter(a=>a.s>=1500||isFlag(a));
  const flagged=list.filter(isFlag);
  const lst = wfilter==='win'?flagged : wfilter==='todo'?flagged.filter(a=>!attributedAd(a)) : wfilter==='unm'?list.filter(a=>a.unmatched) : shown;
  const done=flagged.filter(attributedAd).length;
  $('#pickCount').textContent=`${done} of ${flagged.length} winners attributed`;
  $('#pickBar').style.width=flagged.length?(100*done/flagged.length)+'%':'0';
  $('#flowPicks').textContent=`${done} of ${flagged.length} winners attributed`;
  const n=v=>list.filter(a=>a.v===v).length;
  $('#winSub').textContent=`${WIN[period].label}: ${money(tot)} spent across ${list.length} ads with $100+ spend. ROAS bar ${bar.toFixed(2)}`+
    (raw<bar?` (top 20 ads blended ${raw.toFixed(2)}, so the ${FLOOR.toFixed(1)} floor applies)`:' (blended ROAS of the top 20 ads by spend)')+
    `. ${n('Breakthrough')} Breakthrough, ${n('Spend Winner')} Spend Winner, ${n('KPI Winner')} KPI Winner, ${n('Too early')} too early.`;
  $('#wgrid').innerHTML = lst.length ? lst.map(a=>{
    const type=`<span class="pill ${VCLS[a.v]}">${a.v}</span>`+(a.v!=='Too early'?`<span class="pill ${a.prof?'prof':'unprof'}">${a.prof?'Profitable':'Unprofitable'}</span>`:'');
    const sel=(role,opts,cur)=>`<label class="pk"><span>${role}</span><select data-ad="${esc(a.name)}" data-role="${role}"><option value="">Pick…</option>${opts.map(o=>`<option${o===cur?' selected':''}>${o}</option>`).join('')}</select></label>`;
    const who = a.unmatched ? `<div class="flag">DCT ${a.dct} spent money but no ClickUp task has DCT # ${a.dct}. Check the ad name or the task.</div>`
      : a.task ? `<div class="owner"><span>CS ${esc(a.cs||'–')}</span><span>ED ${esc(a.ed||'–')}</span></div><div class="who">From ClickUp: <a href="${esc(a.task.url)}" target="_blank" rel="noopener">${esc(a.task.name)}</a></div>`
      : `<div class="picker">${sel('CS',CS_OPTS,a.cs)}${sel('ED',ED_OPTS,a.ed)}</div><div class="who">${a.src==='Picked here'?'Picked on this page, not in picks.json yet':a.src==='Manual pick'?'Saved in picks.json':'Not attributed yet · choose who made it'}</div>`;
    const h=a.h>1?`<span>${a.h.toFixed(0)}%<em>hook</em></span>`:'';
    return `<div class="ad ${attributedAd(a)?'ok':''}"><div class="body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${type}<span class="pill">${a.video?'Video':'Static'}</span></div>
      <div class="nm">${esc(a.name)}</div>
      <div class="mx"><span>${a.r.toFixed(2)}<em>ROAS</em></span><span>${money(a.s)}<em>spend</em></span><span>${a.p}<em>purch</em></span>${h}</div>
      ${who}</div></div>`; }).join('') : '<p class="note">Nothing here for this period.</p>';
  const nLocal=Object.keys(LOCAL).length;
  $('#pickTools').hidden=!nLocal;
  $('#localCount').textContent=nLocal?`${nLocal} pick${nLocal>1?'s':''} made on this page`:'';
}
$('#wgrid').addEventListener('change',e=>{
  const el=e.target; if(!el.matches('select[data-ad]')) return;
  const name=el.dataset.ad, cur=Object.assign({}, pickFor(name)||{});
  if(el.dataset.role==='CS') cur.cs=el.value||undefined; else cur.ed=el.value||undefined;
  if(!cur.cs) delete cur.cs; if(!cur.ed) delete cur.ed;
  const saved=PICKS[name]||{};
  if(cur.cs===saved.cs && cur.ed===saved.ed) delete LOCAL[name]; else LOCAL[name]=cur;
  saveLocal(); Object.keys(cache).forEach(k=>delete cache[k]);
  renderAll(); toast(`${name}: CS ${cur.cs||'–'}, ED ${cur.ed||'–'}. Cards updated.`);
});
function mergedPicks(){
  const out=Object.assign({},PICKS);
  Object.entries(LOCAL).forEach(([k,v])=>{ if(v.cs||v.ed) out[k]=v; else delete out[k]; });
  return '{\n'+Object.keys(out).map(k=>'  '+JSON.stringify(k)+': '+JSON.stringify(out[k])).join(',\n')+'\n}\n';
}
$('#exportBtn').addEventListener('click',()=>{
  const blob=new Blob([mergedPicks()],{type:'application/json'}), u=URL.createObjectURL(blob), l=document.createElement('a');
  l.href=u; l.download='picks.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(()=>URL.revokeObjectURL(u),1000);
});
$('#copyBtn').addEventListener('click',async()=>{ try{ await navigator.clipboard.writeText(mergedPicks()); toast('picks.json copied. Paste it to Claude to save it for everyone.'); }catch(e){ toast('Copy failed. Use Download instead.'); } });
$('#clearBtn').addEventListener('click',()=>{ LOCAL={}; saveLocal(); Object.keys(cache).forEach(k=>delete cache[k]); renderAll(); toast('Picks made on this page cleared.'); });

/* ---------- production (ClickUp tasks) ---------- */
const ts = v => v ? new Date(isNaN(+v)?v:+v) : null;
function windowRange(){ const w=WIN[period].weeks; if(!w.length) return [0,0];
  const a=new Date(w[0]+'T00:00:00Z'), b=new Date(w[w.length-1]+'T00:00:00Z'); b.setUTCDate(b.getUTCDate()+7);
  return period==='life'?[new Date(0),b]:[a,b]; }
function prod(){
  const [a,b]=windowRange(), inW=d=>d&&d>=a&&d<b, E={}, C={};
  (D.tasks||[]).forEach(t=>{
    const cs=personId(t.cs), ed=personId(t.editor), fin=ts(t.final)||ts(t.launched), st=ts(t.started)||ts(t.created);
    if(cs){ const c=C[cs]||(C[cs]={briefs:0,shipped:0,open:0}); if(inW(ts(t.created))) c.briefs++; if(inW(ts(t.launched))) c.shipped++; if(!t.launched) c.open++; }
    if(ed){ const e=E[ed]||(E[ed]={delivered:0,days:[],open:0}); if(inW(fin)){ e.delivered++; if(st) e.days.push((fin-st)/864e5); } if(!fin) e.open++; }
  });
  Object.values(E).forEach(e=>{ e.fin=e.days.length?e.days.reduce((x,y)=>x+y,0)/e.days.length:null; });
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
function statsFor(p){
  const wk=period==='week', mine=attributed(p.id,p.role), {tot,list}=W(), P=prod();
  const spend=mine.reduce((t,a)=>t+a.s,0);
  const judged=mine.filter(a=>a.v!=='Too early').length;
  const nBT=mine.filter(a=>a.v==='Breakthrough').length, nSW=mine.filter(a=>a.v==='Spend Winner').length, nKPI=mine.filter(a=>a.v==='KPI Winner').length;
  const hitPct=judged?100*(nBT+nSW)/judged:null, kpiPct=judged?100*nKPI/judged:null;
  const topR=k=>{const t=mine.slice(0,k),ss=t.reduce((q,a)=>q+a.s,0);return ss?t.reduce((q,a)=>q+a.rev,0)/ss:null;};
  const vids=mine.filter(a=>a.video&&a.h>1);
  const hook=wavg(vids,a=>a.h,a=>a.s), hold=wavg(vids,a=>a.hd>0?a.hd:null,a=>a.s);
  const roas=spend?mine.reduce((t,a)=>t+a.rev,0)/spend:null, share=tot?100*spend/tot:0;
  const has=mine.length>0||list.some(attributedAd);
  const S=[], sc=period==='life'?0.5:period==='month'?1:2;
  if(p.role==='ED'){ const v=P.E[p.id];
    S.push(['VOL', v?clamp(Math.round(50+3.5*sc*v.delivered),35,99):null, v?`${v.delivered} ads delivered`:'no ClickUp tasks yet']);
    S.push(['FIN', v&&v.fin!=null?clamp(Math.round(99-5*v.fin),40,95):null, v&&v.fin!=null?`${v.fin.toFixed(1)} days to final`:'no Final dates yet']);
  } else { const v=P.C[p.id];
    S.push(['BRF', v?clamp(Math.round(45+2.5*sc*v.briefs),35,99):null, v?`${v.briefs} briefs created`:'no ClickUp tasks yet']);
    S.push(['SHIP', v&&v.briefs?clamp(Math.round(40+0.55*(100*v.shipped/v.briefs)),35,99):null, v&&v.briefs?`${v.shipped} of ${v.briefs} shipped`:'no briefs yet']);
  }
  const noAttr=has?'no judged ads yet':'no attributed ads yet';
  S.push(['HIT', hitPct!=null?clamp(Math.round(45+1.4*hitPct),35,99):null, hitPct!=null?`${hitPct.toFixed(0)}% hit rate · ${nBT+nSW} of ${judged}`:noAttr]);
  S.push(['KPI', kpiPct!=null?clamp(Math.round(45+0.8*kpiPct),35,99):null, kpiPct!=null?`${kpiPct.toFixed(0)}% KPI hit rate · ${nKPI} of ${judged}`:noAttr]);
  S.push(['BRK', has?clamp(Math.round((wk?55:50)+(wk?20:period==='month'?12:6)*nBT),40,99):null, has?`${nBT} breakthrough${nBT===1?'':'s'}`:noAttr]);
  if(p.role==='ED'){
    S.push(['HOOK', hook!=null?clamp(Math.round(30+1.15*hook),35,99):null, hook!=null?`${hook.toFixed(0)}% hook rate (videos)`:'no attributed videos']);
    S.push(['HOLD', hold!=null?clamp(Math.round(40+2*hold),35,99):null, hold!=null?`${hold.toFixed(0)}% hold rate`:'no attributed videos','back']);
  } else {
    S.push(['ROAS', roas!=null?clamp(Math.round(50+125*(roas-0.8)),35,99):null, roas!=null?`${roas.toFixed(2)} blended ROAS on ${money(spend)}`:'no ads attributed yet']);
    [1,3,5].forEach(k=>{const r=topR(k); if(mine.length>=k||k===1) S.push(['TOP'+k, r!=null?clamp(Math.round(50+125*(r-0.8)),35,99):null, r!=null?`${r.toFixed(2)} ROAS · top ${k} ad${k>1?'s':''} by spend`:'no ads attributed yet','back']);});
    S.push(['HOOK', hook!=null?clamp(Math.round(30+1.15*hook),35,99):null, hook!=null?`${hook.toFixed(0)}% hook rate (videos)`:'no attributed videos','back']);
  }
  S.push(['SHR', has?clamp(Math.round(45+2*share),40,99):null, has?`${share.toFixed(1)}% of spend · ${money(spend)}`:noAttr,'back']);
  return {S,mine};
}
const baseOvr=p=>{const v=statsFor(p).S.filter(s=>s[3]!=='back').map(s=>s[1]).filter(x=>x!=null);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):0;};
const visiblePeople=()=>PEOPLE.filter(p=>!p.onlyIfAds||attributed(p.id,p.role).length);
const special=()=>{const vp=visiblePeople();return vp.reduce((b,p)=>baseOvr(p)>baseOvr(b)?p:b,vp[0]);};
const boost=p=>(period==='week'&&p===special())?3:0;
const ovrOf=p=>Math.min(99,baseOvr(p)+boost(p));
const tierOf=p=>p===special()?'t-special':(ovrOf(p)>=75?'t-gold':ovrOf(p)>=65?'t-silver':'t-bronze');
const colorOf=v=>v>=80?'var(--good)':v>=68?'var(--mid)':'var(--low)';

function cardHTML(p){
  const o=ovrOf(p),t=tierOf(p),b=boost(p),st=statsFor(p).S,sp=t==='t-special';
  const stats=st.filter(s=>s[3]!=='back').map(s=>s[1]==null?'<div class="na"><b>–</b><span>'+s[0]+'</span></div>':'<div><b>'+Math.min(99,s[1]+b)+'</b><span>'+s[0]+'</span></div>').join('');
  const rows=st.map(s=>{const v=s[1]==null?null:Math.min(99,s[1]+b);return '<div class="row"><span class="k">'+s[0]+'</span><div class="meta"><span>'+esc(s[2])+'</span><div class="track"><div class="fill" style="--w:'+(v??0)+'%;background:'+(v==null?'transparent':colorOf(v))+'"></div></div></div><span class="v">'+(v??'–')+'</span></div>';}).join('');
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
    '<div class="hint">'+(b?'Includes +3 Player of the Week boost · ':'')+'Tap to flip back</div></div></div></div></button>';
}
function bestWorst(p){
  const st=statsFor(p).S.filter(s=>s[1]!=null&&s[3]!=='back'),b=boost(p); if(!st.length) return '';
  const best=st.reduce((m,s)=>s[1]>m[1]?s:m),worst=st.reduce((m,s)=>s[1]<m[1]?s:m);
  return '<div class="panel"><div class="p-tag"><span>'+esc(WIN[period].label)+'</span></div><div class="bestworst"><span>Best <b>'+best[0]+' '+Math.min(99,best[1]+b)+'</b></span><span>Work on <b>'+worst[0]+' '+Math.min(99,worst[1]+b)+'</b></span></div></div>';
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
  $('#specialLabel').textContent=WIN[period].tag+' = '+WIN[period].special+(period==='week'?', top rating gets +3':'');
  $('#packSub').textContent=WIN[period].pack+' PACK';
  const list=visiblePeople().slice().sort((a,b)=>ovrOf(b)-ovrOf(a)).filter(p=>filter==='all'||p.role===filter);
  $('#squad').innerHTML=list.map(p=>'<div class="slot">'+cardHTML(p)+'<span class="tap">Tap card for breakdown</span>'+bestWorst(p)+adHTML(p)+'</div>').join('');
  wire($('#squad'));
  const n=W().list.filter(attributedAd).length;
  $('#footNote').textContent=n?`Ratings use ${n} attributed ads in this window.`:'No ads attributed in this window yet, so ratings only use production stats.';
}
function renderAll(){
  const w=WIN[period].weeks;
  $('#periodNote').textContent=w.length?(period==='week'?`Meta: week of ${w[0]}`:`Meta: ${w.length} week${w.length>1?'s':''}, ${w[0]} to ${w[w.length-1]}`):'No Meta data yet';
  $('#rulesLegend').innerHTML=`<b>Verdicts</b> Breakthrough = $${SPEND_LINE/1000}K+ spend and ROAS at or above the bar · Spend Winner = $${SPEND_LINE/1000}K+ spend, ROAS 1.0 to the bar · KPI Winner = under $${SPEND_LINE/1000}K, ROAS at or above the bar, ${KPI_MIN}+ purchases · Too early = first seen in the last week and under 3% of the window's spend · Loser = the rest. Bar = blended ROAS of the top 20 ads in the window, never under ${FLOOR.toFixed(1)}`;
  renderProd(); renderWinners(); renderCards();
}
$('#updated').textContent='Data updated '+new Date(D.generated_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})+'. Updates every Monday.';
document.querySelectorAll('[data-f]').forEach(t=>t.addEventListener('click',()=>{filter=t.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.setAttribute('aria-pressed',String(x===t)));renderCards();}));
document.querySelectorAll('[data-w]').forEach(t=>t.addEventListener('click',()=>{wfilter=t.dataset.w;document.querySelectorAll('[data-w]').forEach(x=>x.setAttribute('aria-pressed',String(x===t)));renderWinners();}));
document.querySelectorAll('.seg button').forEach(t=>{t.textContent=WIN[t.dataset.p].label;t.addEventListener('click',()=>{period=t.dataset.p;document.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',String(x===t)));renderAll();});});
renderAll();

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
