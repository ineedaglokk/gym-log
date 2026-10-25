(function(){
"use strict";

/* ================= data: library and program ================= */
const UNITS=["кг","кг в руке","свой вес + кг","секунды","минуты"];
const norm1=t=>String(t||"").toLowerCase().replace(/ё/g,"е");
/* catalog: exercise names and page links from fitpush.ru (their texts and videos stay on their site) */
const FPD=window.FP||{g:[],e:[],x:[]};
const GROUPS=["Ноги","Спина","Грудь","Плечи","Бицепс","Трицепс","Пресс","Икры","Комплексные","Кардио"];
const FP_URL=slug=>"https://fitpush.ru/exercises/"+slug+"/";
const hash36=t=>{let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
function fpDefaults(g,ei,name){
  const n=norm1(name),eq=FPD.e[ei]||"";
  if(g==="Кардио"||eq==="Кардио")return {sets:1,lo:10,hi:20,step:0,unit:"минуты"};
  if(/планка|удержание|холд|статическ/.test(n))return {sets:3,lo:20,hi:45,step:0,unit:"секунды"};
  const small=["Плечи","Бицепс","Трицепс","Пресс","Икры"].indexOf(g)>=0;
  const rep=g==="Икры"?[12,15]:(g==="Пресс"||g==="Бицепс"||g==="Трицепс"?[10,15]:(g==="Плечи"?[10,12]:[8,12]));
  const body=["Свой вес","Турник/брусья","TRX","Коврик"].indexOf(eq)>=0;
  const hand=eq==="Гантели"||eq==="Гиря";
  const step=body?2.5:(hand?(small?1:2):(eq==="Штанга"?(small?2.5:5):(g==="Ноги"?5:2.5)));
  return {sets:3,lo:rep[0],hi:rep[1],step:step,unit:body?"свой вес + кг":(hand?"кг в руке":"кг")};
}
const LIB=[],LIBMAP={},BYSLUG={};
(window.GYM_LIB||[]).forEach(x=>{LIBMAP[x.id]=x;x.img=x.id;if(x.fp)BYSLUG[x.fp]=x;});
FPD.x.forEach(r=>{
  const slug=r[0],name=r[1],g=FPD.g[r[2]];
  let x=BYSLUG[slug];
  if(x){LIBMAP["f"+hash36(slug)]=x;}
  else{x=Object.assign({id:"f"+hash36(slug)},fpDefaults(g,r[3],name));LIBMAP[x.id]=x;}
  x.fp=slug;x.name=name;x.group=g;x.equip=FPD.e[r[3]];x.ei=r[3];x.img=r[4]||x.img||null;LIB.push(x);
});
(window.GYM_LIB||[]).forEach(x=>{if(!x.fp){x.group=FPD.g[x.g]||"Пресс";x.equip=FPD.e[x.e]||x.equip;x.ei=x.e;LIB.push(x);}});
LIB.forEach(x=>{x.sk=norm1(x.name+" "+x.equip+" "+x.group);});
const DAY_S=["пн","вт","ср","чт","пт","сб","вс"];
const MAX_EX=20;

/* Vlad's starting program; ids are kept so old records still line up */
const DEFAULT_EX=[
  {id:"legpress",lib:"Leg_Press",name:"Жим ногами",sets:3,lo:10,hi:12,step:5,start:80,unit:"кг"},
  {id:"incline",lib:"Incline_Dumbbell_Press",name:"Жим гантелей на наклонной",sets:3,lo:8,hi:12,step:2,start:14,unit:"кг в руке"},
  {id:"rdl",lib:"Stiff-Legged_Dumbbell_Deadlift",name:"Румынская тяга с гантелями",sets:3,lo:10,hi:10,step:2,start:16,unit:"кг в руке"},
  {id:"latpull",lib:"Wide-Grip_Lat_Pulldown",name:"Тяга верхнего блока",sets:3,lo:10,hi:12,step:5,start:40,unit:"кг"},
  {id:"hipthrust",lib:"Barbell_Hip_Thrust",name:"Ягодичный мост со скамьи",sets:3,lo:10,hi:12,step:2,start:20,unit:"кг"},
  {id:"row",lib:"Seated_Cable_Rows",name:"Тяга нижнего блока",sets:3,lo:10,hi:12,step:5,start:35,unit:"кг"},
  {id:"lateral",lib:"Side_Lateral_Raise",name:"Махи гантелями в стороны",sets:3,lo:12,hi:15,step:1,start:5,unit:"кг в руке"},
  {id:"biceps",lib:"Machine_Preacher_Curls",name:"Бицепс на блоке",sets:3,lo:10,hi:12,step:2.5,start:15,unit:"кг"},
  {id:"triceps",lib:"Triceps_Pushdown_-_Rope_Attachment",name:"Трицепс на блоке",sets:3,lo:10,hi:12,step:2.5,start:20,unit:"кг"}
];
const DEFAULT_LIB={};DEFAULT_EX.forEach(e=>{DEFAULT_LIB[e.id]=e.lib;});
const MAX_W=7,MAX_TOTAL=40;
const defaultProg=()=>({workouts:[{id:"full",name:"Фулбоди",days:[0,2,4],ex:DEFAULT_EX.map(e=>Object.assign({},e))}],saved:false});
let PROG=defaultProg();
const allEx=()=>{const m={},out=[];PROG.workouts.forEach(w=>w.ex.forEach(e=>{if(!m[e.id]){m[e.id]=1;out.push(e);}}));return out;};
const totalEx=()=>PROG.workouts.reduce((n,w)=>n+w.ex.length,0);

const clampNum=(v,lo,hi,def)=>{v=Number(v);return isFinite(v)?Math.min(hi,Math.max(lo,v)):def;};
const safeId=t=>String(t||"").replace(/[^A-Za-z0-9_]/g,"").slice(0,32);
const rid=p=>p+Date.now().toString(36).slice(-4)+Math.random().toString(36).slice(2,5);
function cleanEx(e){
  const id=safeId(e.id)||rid("x");
  const lx=LIBMAP[e.lib];
  const lib=lx?lx.id:(DEFAULT_LIB[id]||null);
  const lo=Math.round(clampNum(e.lo,1,600,10)),hi=Math.max(lo,Math.round(clampNum(e.hi,1,600,12)));
  return {id:id,lib:lib,name:String(e.name||"").trim().slice(0,60)||"Упражнение",
    sets:Math.round(clampNum(e.sets,1,6,3)),lo:lo,hi:hi,step:clampNum(e.step,0,100,2.5),
    start:clampNum(e.start,0,1000,0),unit:UNITS.indexOf(e.unit)>=0?e.unit:"кг"};
}
/* compact form, used both for storage and for share codes */
function packProg(){
  return {v:2,w:PROG.workouts.map(w=>[w.id,w.name,w.days,w.ex.map(e=>[e.id,e.name,e.sets,e.lo,e.hi,e.step,e.start,UNITS.indexOf(e.unit),e.lib||0])])};
}
function unpackProg(o){
  if(!o)return null;
  const ex=b=>({id:b[0],name:b[1],sets:b[2],lo:b[3],hi:b[4],step:b[5],start:b[6],unit:UNITS[b[7]]||"кг",lib:b[8]||null});
  if(o.v===2&&Array.isArray(o.w))return {workouts:o.w.map(a=>({id:a[0],name:a[1],days:a[2],ex:(a[3]||[]).map(ex)}))};
  if(Array.isArray(o.e))return {workouts:[{id:"full",name:"Тренировка",days:o.d,ex:o.e.map(ex)}]};   /* first share-code format */
  return o;
}
function cleanProg(p){
  p=unpackProg(p);
  let ws=[];
  if(p&&Array.isArray(p.workouts))ws=p.workouts;
  else if(p&&Array.isArray(p.ex))ws=[{id:"full",name:"Фулбоди",days:p.days,ex:p.ex}];   /* single-workout programs saved earlier */
  const out={workouts:[],saved:true},wseen={},taken={};let total=0;
  ws.slice(0,MAX_W).forEach((w,wi)=>{
    if(!w)return;
    let wid=safeId(w.id)||("w"+wi);while(wseen[wid])wid+="2";wseen[wid]=1;
    const days=(Array.isArray(w.days)?w.days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<7&&!taken[d]&&(taken[d]=1)).sort();
    const exs=[],seen={};
    (Array.isArray(w.ex)?w.ex:[]).forEach(e=>{
      if(!e||exs.length>=MAX_EX||total>=MAX_TOTAL)return;
      const c=cleanEx(e);if(seen[c.id])return;seen[c.id]=1;exs.push(c);total++;
    });
    out.workouts.push({id:wid,name:String(w.name||"").trim().slice(0,30)||("Тренировка "+(wi+1)),days:days,ex:exs});
  });
  if(!out.workouts.length)out.workouts.push({id:"w1",name:"Тренировка А",days:[],ex:[]});
  return out;
}
/* same exercise in two workouts shares one id, so its history is shared too */
function fromLib(x,W){
  const other=allEx().find(e=>e.lib===x.id);
  let id=other?other.id:(safeId(x.id)||rid("x"));
  if(!other)while(allEx().some(e=>e.id===id))id+="2";
  return {id:id,lib:x.id,name:x.name,sets:x.sets||3,lo:x.lo||10,hi:Math.max(x.lo||10,x.hi||12),
    step:x.step!=null?x.step:2.5,start:other?other.start:0,unit:UNITS.indexOf(x.unit)>=0?x.unit:"кг"};
}
function setProg(p){PROG=p;S.pwi=0;S.logW=null;S.openEx={};}

/* ready-made splits for friends */
const T=(lib,o)=>Object.assign({lib:lib},o||{});
const TEMPLATES=[
  {key:"full",name:"Фулбоди, 3 дня",note:"Одна тренировка на всё тело: пн, ср, пт",
   make:()=>defaultProg().workouts},
  {key:"ul",name:"Верх / низ, 4 дня",note:"Верх: пн, чт · Низ: вт, пт",
   w:[["Верх",[0,3],["Barbell_Bench_Press_-_Medium_Grip","Wide-Grip_Lat_Pulldown","Dumbbell_Shoulder_Press","Seated_Cable_Rows","Side_Lateral_Raise","Dumbbell_Bicep_Curl","Triceps_Pushdown_-_Rope_Attachment"]],
      ["Низ",[1,4],["Barbell_Squat","Romanian_Deadlift","Leg_Press","Lying_Leg_Curls","Barbell_Hip_Thrust","Standing_Calf_Raises","Plank"]]]},
  {key:"ppl",name:"Толкай / тяни / ноги, 3 дня",note:"Толкай: пн · Тяни: ср · Ноги: пт",
   w:[["Толкай",[0],["Barbell_Bench_Press_-_Medium_Grip","Incline_Dumbbell_Press","Dumbbell_Shoulder_Press","Side_Lateral_Raise","Triceps_Pushdown_-_Rope_Attachment","EZ-Bar_Skullcrusher"]],
      ["Тяни",[2],["Pullups","Bent_Over_Barbell_Row","Close-Grip_Front_Lat_Pulldown","Face_Pull","Barbell_Curl","Hammer_Curls"]],
      ["Ноги",[4],["Barbell_Squat","Romanian_Deadlift","Leg_Press","Seated_Leg_Curl","Seated_Calf_Raise","Hanging_Leg_Raise"]]]}
];
function templateProg(t){
  if(t.make)return {workouts:t.make(),saved:true};
  const p={workouts:[],saved:true};
  t.w.forEach((a,i)=>{
    const W={id:"w"+(i+1),name:a[0],days:a[1].slice(),ex:[]};
    p.workouts.push(W);
    const prev=PROG;PROG=p;
    a[2].forEach(lid=>{const x=LIBMAP[lid];if(x&&!W.ex.some(e=>e.lib===lid))W.ex.push(fromLib(x,W));});
    PROG=prev;
  });
  return p;
}

/* ================= helpers ================= */
const MON=["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const MON_G=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const MON_IN=["январе","феврале","марте","апреле","мае","июне","июле","августе","сентябре","октябре","ноябре","декабре"];
const MON_S=["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
const WD=["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
const LS="tg-gym-log-v1",LSP="tg-gym-prog-v1",PKEY="program",KEY=d=>"w_"+d;

const $=s=>document.querySelector(s);
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=s=>{const a=s.split("-").map(Number);return new Date(a[0],a[1]-1,a[2]);};
const today=()=>iso(new Date());
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d);};
const short=s=>{const d=parse(s);return d.getDate()+" "+MON_S[d.getMonth()];};
const fmt=v=>v==null?"—":String(Math.round(v*100)/100).replace(".",",");
const numv=t=>{t=String(t==null?"":t).trim().replace(",",".");if(t==="")return null;const v=parseFloat(t);return isFinite(v)&&v>=0?Math.round(v*100)/100:null;};
const intv=t=>{t=String(t==null?"":t).trim();if(t==="")return null;const v=parseInt(t,10);return isFinite(v)&&v>=0&&v<1000?v:null;};
const plural=(n,a,b,c)=>{const m10=n%10,m100=n%100;return m10===1&&m100!==11?a:(m10>=2&&m10<=4&&(m100<10||m100>=20)?b:c);};
const workouts=n=>n+" "+plural(n,"тренировка","тренировки","тренировок");
const seq=n=>Array.from({length:n},(_,i)=>i);
const hasSets=x=>x&&Array.isArray(x.r)&&x.r.some(v=>v!=null);
const isWorkout=doc=>doc&&doc.ex&&Object.values(doc.ex).some(hasSets);
const isTime=e=>e.unit==="секунды"||e.unit==="минуты";
const tSuf=e=>e.unit==="минуты"?" мин":" с";
const isBody=e=>e.unit==="свой вес + кг";
const imgSrc=(id,k)=>"img/"+id+"_"+(k||0)+".jpg";

const S={docs:new Map(),mode:"pending",loaded:false,date:today(),view:"log",yearPane:"cal",
  year:new Date().getFullYear(),sel:null,metric:null,touched:false,timer:null,chain:Promise.resolve(),
  libGroup:"Все",libQuery:"",openEx:{},pwi:0,logW:null,curW:null};

/* ================= storage ================= */
const tg=window.Telegram&&window.Telegram.WebApp?window.Telegram.WebApp:null;
function lsRead(k){try{const t=localStorage.getItem(k);return t?JSON.parse(t):null;}catch(e){return null;}}
function lsWrite(k,obj){try{localStorage.setItem(k,JSON.stringify(obj));return true;}catch(e){return false;}}
function cs(method){
  const args=[].slice.call(arguments,1);
  return new Promise((res,rej)=>{
    try{tg.CloudStorage[method].apply(tg.CloudStorage,args.concat([(err,val)=>err?rej(err):res(val)]));}
    catch(e){rej(e);}
  });
}
function haptic(kind){try{if(!tg||!tg.HapticFeedback)return;if(kind==="tap")tg.HapticFeedback.selectionChanged();else tg.HapticFeedback.impactOccurred("light");}catch(e){}}

let statusT=null;
function setStatus(kind,text){
  const s=$("#saveStatus");s.className="status"+(kind?" "+kind:"");s.textContent=text;
  clearTimeout(statusT);if(kind==="ok"||(!kind&&/загружен|пусто/i.test(text)))statusT=setTimeout(()=>{s.textContent="";},1600);
}
let toastT=null;
function toast(t){const e=$("#toast");e.textContent=t;e.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{e.hidden=true;},1900);}

function persist(date,body){
  if(S.mode==="local"){
    if(body)S.docs.set(date,body);else S.docs.delete(date);
    const ok=lsWrite(LS,Object.fromEntries(S.docs));
    setStatus(ok?"ok":"err",ok?"Сохранено":"Не удалось сохранить в браузере");
    refreshOthers();return;
  }
  if(S.mode!=="cloud"){S.retry={date:date,body:body};setStatus("","Журнал загружается, сохраню через секунду…");return;}
  if(body)S.docs.set(date,body);else S.docs.delete(date);
  lsWrite(LS,Object.fromEntries(S.docs));
  refreshOthers();
  setStatus("","Сохраняю…");
  S.chain=S.chain.then(()=>body?cs("setItem",KEY(date),JSON.stringify(body)):cs("removeItem",KEY(date)))
    .then(()=>setStatus("ok","Сохранено в Telegram"))
    .catch(()=>setStatus("err","Не сохранилось — проверь интернет и измени любое поле ещё раз"));
}

/* ================= records ================= */
/* Old records kept one weight per exercise; newer ones keep a weight per set. */
function norm(x,n){
  if(!x)return null;
  const r=Array.isArray(x.r)?x.r:[];
  const len=Math.max(n||0,r.length,Array.isArray(x.w)?x.w.length:0,1);
  const w=Array.isArray(x.w)?x.w:seq(len).map(()=>x.w);
  return {w:seq(len).map(i=>w[i]==null?null:w[i]),r:seq(len).map(i=>r[i]==null?null:r[i])};
}
function prevEntry(id,date,n){
  let best=null;
  for(const [d,doc] of S.docs){
    if(d>=date)continue;
    const x=doc.ex&&doc.ex[id];
    if(hasSets(x)&&(!best||d>best.d))best=Object.assign({d:d},norm(x,n));
  }
  return best;
}
/* Each set progresses on its own: hit the top of the rep range last time, that set gets +step. */
function suggestSets(e,prev){
  if(!prev)return seq(e.sets).map(()=>({w:e.start,up:false}));
  const base=prev.w.find(v=>v!=null);
  let lastW=base!=null?base:e.start;
  return seq(e.sets).map(i=>{
    const w=prev.w[i]!=null?prev.w[i]:lastW;lastW=w;
    const up=!isTime(e)&&e.step>0&&prev.r[i]!=null&&prev.r[i]>=e.hi;
    return {w:up?Math.round((w+e.step)*100)/100:w,up:up};
  });
}
function topWeight(x){let m=null;x.r.forEach((r,i)=>{if(r!=null&&x.w[i]!=null&&(m==null||x.w[i]>m))m=x.w[i];});return m;}
function topReps(x){let m=null;x.r.forEach(r=>{if(r!=null&&(m==null||r>m))m=r;});return m;}
function volume(x){let s=0,any=false;x.r.forEach((r,i)=>{if(r!=null&&x.w[i]!=null){s+=r*x.w[i];any=true;}});return any?Math.round(s):null;}
function setsText(x,e){
  const u=e?e.unit:"кг";
  return x.r.map((r,i)=>{
    if(r==null)return null;
    if(u==="секунды")return r+" с";
    if(u==="минуты")return r+" мин";
    const w=x.w[i];
    if(u==="свой вес + кг")return w?("+"+fmt(w)+"×"+r):String(r);
    return (w==null?"—":fmt(w))+"×"+r;
  }).filter(Boolean).join(" · ");
}
const targetText=e=>e.sets+" × "+(e.lo===e.hi?e.hi:e.lo+"–"+e.hi)+(isTime(e)?tSuf(e):"")+" · "+e.unit;

/* ================= LOG ================= */
const wdOf=date=>(parse(date).getDay()+6)%7;
const plannedFor=date=>PROG.workouts.filter(w=>w.days.indexOf(wdOf(date))>=0);
function logWorkout(){
  const byId=id=>PROG.workouts.find(w=>w.id===id);
  const doc=S.docs.get(S.date);
  if(S.logW&&byId(S.logW))return byId(S.logW);
  if(doc&&doc.wk&&byId(doc.wk))return byId(doc.wk);
  if(doc&&doc.ex&&!doc.wk){
    /* records from before splits: the workout that holds most of the logged exercises */
    let best=null,score=0;
    PROG.workouts.forEach(w=>{const n=w.ex.filter(e=>doc.ex[e.id]).length;if(n>score){score=n;best=w;}});
    if(best)return best;
  }
  return plannedFor(S.date)[0]||PROG.workouts[0];
}
function renderWkRow(W){
  const box=$("#wkChips");box.textContent="";
  box.hidden=PROG.workouts.length<2;
  if(box.hidden)return;
  const planned=plannedFor(S.date);
  PROG.workouts.forEach(w=>{
    const b=el("button",null,w.name);b.type="button";
    b.setAttribute("aria-pressed",String(w===W));
    if(planned.indexOf(w)>=0)b.title="По плану на этот день";
    b.addEventListener("click",()=>{if(w===W)return;flush();S.logW=w.id;haptic("tap");renderLog();});
    box.append(b);
  });
}
function renderLog(){
  S.touched=false;
  const W=logWorkout(),EX=W.ex;S.curW=W;
  const d=parse(S.date),t=today();
  $("#dateTitle").textContent=d.getDate()+" "+MON_G[d.getMonth()];
  const rel=S.date===t?"Сегодня":(S.date===addDays(t,-1)?"Вчера":"");
  $("#dateEyebrow").textContent=(rel?rel+" · ":"")+WD[d.getDay()];
  $("#dateInput").value=S.date;$("#dateInput").max=t;
  $("#nextDay").disabled=S.date>=t;
  $("#toToday").hidden=S.date===t;

  const doc=S.docs.get(S.date)||null;
  $("#bwInput").value=doc&&doc.bw!=null?fmt(doc.bw):"";
  $("#delBtn").hidden=!doc;$("#delConfirm").hidden=true;

  renderWkRow(W);
  const list=$("#exList");list.textContent="";
  if(!EX.length){list.append(el("li","empty","В тренировке «"+W.name+"» пока нет упражнений. Собери её во вкладке «Программа»."));return;}
  EX.forEach((e,i)=>{
    const prev=prevEntry(e.id,S.date,e.sets);
    const sg=suggestSets(e,prev);
    const cur=doc&&doc.ex&&doc.ex[e.id]?norm(doc.ex[e.id],e.sets):null;
    const li=el("li","ex");li.dataset.id=e.id;

    const head=el("div","exhead");
    head.append(el("h3",null,e.name));
    if(e.lib&&LIBMAP[e.lib]){const ib=el("button","ibtn","i");ib.type="button";ib.setAttribute("aria-label","Техника: "+e.name);ib.addEventListener("click",()=>openTech(e.lib));head.append(ib);}
    li.append(head);
    const goal=(e.lo===e.hi?e.hi:e.lo+"–"+e.hi)+(isTime(e)?tSuf(e):"");
    li.append(el("p","meta",prev?"прошлый раз "+setsText(prev,e):"цель "+goal+(isTime(e)?"":" повт.")));

    const grid=el("div","sets");grid.style.gridTemplateColumns="auto repeat("+e.sets+",minmax(0,1fr))";
    grid.append(el("span","lab",isTime(e)?(e.unit==="минуты"?"мин":"сек"):"повт."));
    for(let k=0;k<e.sets;k++){
      const r=el("input","num");r.id="r-"+e.id+"-"+k;r.inputMode="numeric";r.autocomplete="off";
      r.placeholder=String(e.hi);r.setAttribute("aria-label",e.name+": "+(isTime(e)?e.unit:"повторы")+", подход "+(k+1));
      const v=cur?cur.r[k]:null;r.value=v==null?"":String(v);
      r.classList.toggle("hit",v!=null&&v>=e.hi);
      r.addEventListener("input",()=>{const x=intv(r.value);const was=r.classList.contains("hit");r.classList.toggle("hit",x!=null&&x>=e.hi);if(!was&&x!=null&&x>=e.hi)haptic("hit");});
      grid.append(r);
    }
    if(!isTime(e)){
      grid.append(el("span","lab",isBody(e)?"+кг":"кг"));
      const wins=[];
      for(let k=0;k<e.sets;k++){
        const w=el("input","num wt");w.id="w-"+e.id+"-"+k;w.inputMode="decimal";w.autocomplete="off";
        w.setAttribute("aria-label",e.name+": вес, подход "+(k+1));
        const saved=cur?cur.w[k]:null;
        w.value=fmt(saved!=null?saved:sg[k].w);
        if(saved!=null||cur)w.dataset.edited="1";else if(sg[k].up)w.classList.add("bump");
        w.addEventListener("input",()=>{
          w.dataset.edited="1";w.classList.remove("bump");
          for(let j=k+1;j<e.sets;j++){if(!wins[j].dataset.edited){wins[j].value=w.value;wins[j].classList.remove("bump");}}
        });
        wins.push(w);grid.append(w);
      }
    }
    li.append(grid);list.append(li);
  });
}
function collect(){
  const W=S.curW||logWorkout(),EX=W.ex;
  const ex={};let any=false;
  EX.forEach(e=>{
    const r=seq(e.sets).map(k=>{const n=$("#r-"+e.id+"-"+k);return n?intv(n.value):null;});
    const w=seq(e.sets).map(k=>{const n=$("#w-"+e.id+"-"+k);return n?numv(n.value):null;});
    if(r.some(v=>v!=null)){ex[e.id]={w:w,r:r};any=true;}
  });
  const old=S.docs.get(S.date);
  if(old&&old.ex)Object.keys(old.ex).forEach(id=>{if(!EX.some(e=>e.id===id)&&hasSets(old.ex[id])){ex[id]=old.ex[id];any=true;}});
  const bw=numv($("#bwInput").value);
  if(!any&&bw==null)return null;
  const body={date:S.date,wk:W.id,ex:ex};if(bw!=null)body.bw=bw;
  return body;
}
function flush(){
  if(!S.timer)return;
  clearTimeout(S.timer);S.timer=null;
  const body=collect();
  if(!body&&!S.docs.has(S.date)){setStatus("","");return;}
  persist(S.date,body);
}
function onEdit(){S.touched=true;setStatus("","Изменения…");clearTimeout(S.timer);S.timer=setTimeout(flush,900);}
$("#exList").addEventListener("input",onEdit);
$("#bwInput").addEventListener("input",onEdit);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"){flush();flushProg();}});

function goDate(d){flush();S.date=d>today()?today():d;S.logW=null;renderLog();window.scrollTo({top:0});}
$("#prevDay").addEventListener("click",()=>goDate(addDays(S.date,-1)));
$("#nextDay").addEventListener("click",()=>goDate(addDays(S.date,1)));
$("#toToday").addEventListener("click",()=>goDate(today()));
$("#dateInput").addEventListener("change",ev=>{if(ev.target.value)goDate(ev.target.value);});
$("#delBtn").addEventListener("click",()=>{$("#delBtn").hidden=true;$("#delConfirm").hidden=false;});
$("#delNo").addEventListener("click",()=>{$("#delConfirm").hidden=true;$("#delBtn").hidden=false;});
$("#delYes").addEventListener("click",()=>{clearTimeout(S.timer);S.timer=null;persist(S.date,null);renderLog();toast("Запись удалена");});

/* ================= PROGRAM (constructor) ================= */
let progTimer=null;
const PW=()=>{if(!(S.pwi>=0&&S.pwi<PROG.workouts.length))S.pwi=0;return PROG.workouts[S.pwi];};
const workoutsWord=n=>n+" "+plural(n,"тренировка","тренировки","тренировок");
const exWord=n=>n+" "+plural(n,"упражнение","упражнения","упражнений");
function setProgStatus(k,t){if(k==="err")toast(t);}
function flushProg(){
  if(!progTimer)return;
  clearTimeout(progTimer);progTimer=null;
  const txt=JSON.stringify(packProg());
  try{localStorage.setItem(LSP,txt);}catch(e){}
  if(txt.length>4000){setProgStatus("err","Программа слишком большая для облака Telegram — убери пару упражнений");return;}
  if(S.mode==="cloud"){
    cs("setItem",PKEY,txt).then(()=>setProgStatus("ok","Программа сохранена в Telegram"))
      .catch(()=>setProgStatus("err","Не сохранилось — проверь интернет и поменяй что-нибудь ещё раз"));
  }else setProgStatus("ok","Программа сохранена");
}
function saveProg(){
  PROG.saved=true;S.progChanged=true;
  setProgStatus("","Изменения…");
  clearTimeout(progTimer);progTimer=setTimeout(flushProg,700);
}
function renderWkTabs(){
  const c=$("#wkTabs");c.textContent="";
  PROG.workouts.forEach((w,i)=>{
    const b=el("button",null,w.name);b.type="button";b.setAttribute("aria-pressed",String(i===S.pwi));
    b.addEventListener("click",()=>{if(i===S.pwi)return;S.pwi=i;haptic("tap");renderProgEditor();});
    c.append(b);
  });
  if(PROG.workouts.length<MAX_W){
    const add=el("button","addw","+ Тренировка");add.type="button";
    add.addEventListener("click",()=>{
      const n=PROG.workouts.length,letters="АБВГДЕЖ";
      let name="Тренировка "+letters[n];
      PROG.workouts.push({id:rid("w"),name:name,days:[],ex:[]});
      S.pwi=n;haptic("tap");renderProgEditor();saveProg();
      const ni=$("#wkName");ni.focus();try{ni.select();}catch(e){}
    });
    c.append(add);
  }
}
function renderDays(){
  const W=PW(),row=$("#daysRow");row.textContent="";
  DAY_S.forEach((d,i)=>{
    const own=W.days.indexOf(i)>=0;
    const other=PROG.workouts.find(o=>o!==W&&o.days.indexOf(i)>=0);
    const b=el("button",other&&!own?"other":null,d);b.type="button";b.setAttribute("aria-pressed",String(own));
    b.setAttribute("aria-label",d+(own?", эта тренировка":other?", сейчас «"+other.name+"»":", отдых"));
    b.addEventListener("click",()=>{
      if(own)W.days.splice(W.days.indexOf(i),1);
      else{
        PROG.workouts.forEach(o=>{const k=o.days.indexOf(i);if(k>=0)o.days.splice(k,1);});
        W.days.push(i);W.days.sort();
        if(other)toast(d.toUpperCase()+" теперь «"+W.name+"», а не «"+other.name+"»");
      }
      haptic("tap");renderDays();saveProg();
    });
    row.append(b);
  });
}
function pfield(label,ctrl){const f=el("label","pf");f.append(el("span",null,label),ctrl);return f;}
function pnum(val,mode,onset,label){
  const i=el("input");i.inputMode=mode;i.autocomplete="off";i.value=fmt(val);if(label)i.setAttribute("aria-label",label);
  i.addEventListener("change",()=>{onset(numv(i.value));renderProgEditor();saveProg();});
  return i;
}
function thumb(e){
  const x=e.lib&&LIBMAP[e.lib];
  if(x&&x.img){const im=el("img","pc-thumb");im.src=imgSrc(x.img,0);im.alt="";im.loading="lazy";return im;}
  if(x)return tile(x,"pc-thumb");
  return el("span","pc-thumb blank",(e.name||"?").slice(0,1).toUpperCase());
}
function renderProgEditor(){
  const W=PW(),EX=W.ex;
  renderWkTabs();
  if(document.activeElement!==$("#wkName"))$("#wkName").value=W.name;
  $("#wkDel").hidden=PROG.workouts.length<2;$("#wkDelConfirm").hidden=true;
  renderDays();
  const list=$("#peList");list.textContent="";
  if(!EX.length)list.append(el("div","empty","В «"+W.name+"» пока нет упражнений. Нажми кнопку ниже и выбери их в библиотеке."));
  EX.forEach((e,i)=>{
    const card=el("div","pc");
    const key=W.id+"/"+e.id,open=!!S.openEx[key];
    const row=el("button","pc-open");row.type="button";row.setAttribute("aria-expanded",String(open));
    const main=el("div","pc-main");
    main.append(el("h3",null,e.name),el("p","target",e.sets+" × "+(e.lo===e.hi?e.hi:e.lo+"–"+e.hi)+(isTime(e)?tSuf(e):"")));
    row.append(thumb(e),main,el("span","chev",open?"⌃":"⌄"));
    row.addEventListener("click",()=>{S.openEx[key]=!open;renderProgEditor();});
    card.append(row);
    if(open){
      const name=el("input","pe-name");name.value=e.name;name.maxLength=60;name.setAttribute("aria-label","Название");
      name.addEventListener("input",()=>{e.name=name.value.slice(0,60);saveProg();});
      name.addEventListener("change",()=>{if(!name.value.trim())e.name="Упражнение";renderProgEditor();});
      card.append(name);
      const f=el("div","pe-fields");
      f.append(pfield("Подходы",pnum(e.sets,"numeric",v=>{e.sets=Math.round(clampNum(v,1,6,3));})));
      const pair=el("div","pair");
      const lo=pnum(e.lo,"numeric",v=>{e.lo=Math.round(clampNum(v,1,600,e.lo));if(e.hi<e.lo)e.hi=e.lo;},"От");
      const hi=pnum(e.hi,"numeric",v=>{e.hi=Math.max(e.lo,Math.round(clampNum(v,1,600,e.hi)));},"До");
      pair.append(lo,el("b",null,"–"),hi);
      const pl=el("div","pf");pl.append(el("span",null,isTime(e)?(e.unit==="минуты"?"Минуты":"Секунды"):"Повторы"),pair);f.append(pl);
      const sel=el("select");UNITS.forEach(u=>{const o=el("option",null,u);o.value=u;sel.append(o);});
      sel.value=e.unit;sel.addEventListener("change",()=>{e.unit=sel.value;renderProgEditor();saveProg();});
      f.append(pfield("Тип",sel));
      if(!isTime(e)){
        f.append(pfield("Шаг, кг",pnum(e.step,"decimal",v=>{e.step=clampNum(v,0,100,e.step);})));
        f.append(pfield(isBody(e)?"Старт, доп. кг":"Старт, кг",pnum(e.start,"decimal",v=>{e.start=clampNum(v,0,1000,e.start);})));
      }
      card.append(f);
      const tools=el("div","pc-tools");
      const mv=(d,txt,lab)=>{const b=el("button","mini",txt);b.type="button";b.setAttribute("aria-label",lab);const j=i+d;b.disabled=j<0||j>=EX.length;
        b.addEventListener("click",()=>{const t=EX[i];EX[i]=EX[j];EX[j]=t;haptic("tap");renderProgEditor();saveProg();});return b;};
      const del=el("button","btn","Убрать");del.type="button";
      del.addEventListener("click",()=>{EX.splice(i,1);delete S.openEx[key];haptic("tap");renderProgEditor();saveProg();toast("Упражнение убрано, записи по нему остались");});
      if(e.lib&&LIBMAP[e.lib]){const tb=el("button","btn","Техника ↗");tb.type="button";tb.addEventListener("click",()=>openTech(e.lib));tools.append(tb);}
      tools.append(mv(-1,"↑","Выше"),mv(1,"↓","Ниже"),el("span","grow"),del);
      card.append(tools);
    }
    list.append(card);
  });
  const full=EX.length>=MAX_EX||totalEx()>=MAX_TOTAL;
  $("#peAdd").textContent=full?"Достигнут лимит упражнений":"+ Добавить упражнение";
  $("#peAdd").disabled=full;
  renderTemplates();
}
$("#peAdd").addEventListener("click",()=>openLib());
$("#wkName").addEventListener("input",ev=>{PW().name=ev.target.value.slice(0,30);renderWkTabs();saveProg();});
$("#wkName").addEventListener("change",ev=>{if(!ev.target.value.trim()){PW().name="Тренировка";ev.target.value=PW().name;renderWkTabs();saveProg();}});
$("#wkDel").addEventListener("click",()=>{$("#wkDelMsg").textContent="Удалить «"+PW().name+"»? Записи тренировок останутся.";$("#wkDel").hidden=true;$("#wkDelConfirm").hidden=false;});
$("#wkDelNo").addEventListener("click",()=>{$("#wkDelConfirm").hidden=true;$("#wkDel").hidden=false;});
$("#wkDelYes").addEventListener("click",()=>{
  if(PROG.workouts.length<2)return;
  const name=PW().name;PROG.workouts.splice(S.pwi,1);S.pwi=0;S.logW=null;
  renderProgEditor();saveProg();toast("«"+name+"» удалена");
});

/* ready-made splits */
let pendingTpl=null;
function renderTemplates(){
  const box=$("#tplList");if(box.childElementCount)return;
  TEMPLATES.forEach(t=>{
    const b=el("button","tpl");b.type="button";
    b.append(el("b",null,t.name),el("small",null,t.note));
    b.addEventListener("click",()=>{pendingTpl=t;$("#tplMsg").textContent="Заменить программу на «"+t.name+"»? Записи тренировок останутся.";$("#tplConfirm").hidden=false;});
    box.append(b);
  });
}
$("#tplNo").addEventListener("click",()=>{pendingTpl=null;$("#tplConfirm").hidden=true;});
$("#tplYes").addEventListener("click",()=>{
  if(!pendingTpl)return;
  setProg(templateProg(pendingTpl));
  const n=pendingTpl.name;pendingTpl=null;$("#tplConfirm").hidden=true;
  renderProgEditor();saveProg();toast("Схема «"+n+"» загружена — поправь под себя");
  window.scrollTo({top:0});
});

let resetArm=null;
$("#peReset").addEventListener("click",ev=>{
  const b=ev.currentTarget;
  if(!resetArm){b.textContent="Точно вернуть? Нажми ещё раз";resetArm=setTimeout(()=>{resetArm=null;b.textContent="Вернуть стандартную программу";},3500);return;}
  clearTimeout(resetArm);resetArm=null;b.textContent="Вернуть стандартную программу";
  setProg(defaultProg());renderProgEditor();saveProg();toast("Стандартная программа вернулась");
});

/* share a program as a code */
const b64e=t=>btoa(unescape(encodeURIComponent(t))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const b64d=t=>{t=t.replace(/-/g,"+").replace(/_/g,"/");while(t.length%4)t+="=";return decodeURIComponent(escape(atob(t)));};
const progCode=()=>"GYM2:"+b64e(JSON.stringify(packProg()));
function parseCode(t){
  const m=String(t||"").match(/GYM[12]:([A-Za-z0-9_-]+)/);if(!m)return null;
  try{const p=cleanProg(JSON.parse(b64d(m[1])));return p.workouts.some(w=>w.ex.length)?p:null;}catch(e){return null;}
}
function showCode(){const ta=$("#shareOut");ta.value=progCode();ta.hidden=false;return ta;}
$("#shareCopy").addEventListener("click",()=>{
  const ta=showCode();
  const sel=()=>{ta.focus();ta.select();toast("Выдели код и скопируй");};
  try{navigator.clipboard.writeText(ta.value).then(()=>toast("Код скопирован"),sel);}catch(e){sel();}
});
$("#shareSend").addEventListener("click",()=>{
  const code=showCode().value;
  const text="Моя программа тренировок. Открой журнал → «Программа» → «Загрузить программу друга» и вставь этот код.";
  const url="https://t.me/share/url?url="+encodeURIComponent(code)+"&text="+encodeURIComponent(text);
  try{if(tg&&tg.openTelegramLink){tg.openTelegramLink(url);return;}}catch(e){}
  toast("Открой журнал в Telegram или скопируй код");
});
let pendingProg=null;
$("#importBtn").addEventListener("click",()=>{
  const p=parseCode($("#importIn").value);
  if(!p){toast("Код не распознан — скопируй его целиком");return;}
  pendingProg=p;
  const nEx=p.workouts.reduce((n,w)=>n+w.ex.length,0);
  $("#importMsg").textContent="В программе "+workoutsWord(p.workouts.length)+" и "+exWord(nEx)+". Заменить твою? Записи тренировок останутся.";
  $("#importConfirm").hidden=false;
});
$("#importNo").addEventListener("click",()=>{pendingProg=null;$("#importConfirm").hidden=true;});
$("#importYes").addEventListener("click",()=>{
  if(!pendingProg)return;
  setProg(pendingProg);pendingProg=null;
  $("#importConfirm").hidden=true;$("#importIn").value="";
  renderProgEditor();saveProg();toast("Программа загружена");
});

/* ================= sheets: library + exercise card ================= */
const stack=[];
function openSheet(id){
  const s=document.getElementById(id);
  if(stack.indexOf(id)<0)stack.push(id);
  s.hidden=false;document.body.style.overflow="hidden";
  try{if(tg&&tg.BackButton){tg.BackButton.show();}}catch(e){}
}
function closeSheet(){
  const id=stack.pop();if(!id)return;
  document.getElementById(id).hidden=true;
  if(id==="infoSheet")$("#infoBody").textContent="";
  if(!stack.length){document.body.style.overflow="";try{if(tg&&tg.BackButton)tg.BackButton.hide();}catch(e){}}
}
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",closeSheet));
document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&stack.length)closeSheet();});
try{if(tg&&tg.BackButton)tg.BackButton.onClick(closeSheet);}catch(e){}

const inProg=libId=>PW().ex.some(e=>e.lib===libId);
function addFromLib(x){
  const W=PW();
  if(W.ex.length>=MAX_EX||totalEx()>=MAX_TOTAL){toast("Достигнут лимит упражнений в программе");return false;}
  if(inProg(x.id))return false;
  W.ex.push(fromLib(x,W));haptic("hit");saveProg();renderProgEditor();
  toast("«"+x.name+"» добавлено в «"+W.name+"»");return true;
}
function renderLibChips(){
  const c=$("#libChips");c.textContent="";
  ["Все"].concat(GROUPS).forEach(g=>{
    const b=el("button",null,g);b.type="button";
    b.setAttribute("aria-pressed",String(S.libGroup===g));
    b.addEventListener("click",()=>{S.libGroup=g;haptic("tap");renderLibChips();renderLibList();});
    c.append(b);
  });
}
/* picture for a card: muscle group sets the colour, equipment sets the icon */
const SVGNS="http://www.w3.org/2000/svg";
function tile(x,cls){
  const t=el("span","tile "+(cls||"")+" g"+Math.max(0,GROUPS.indexOf(x.group)));
  const sv=document.createElementNS(SVGNS,"svg");sv.setAttribute("viewBox","0 0 48 48");sv.setAttribute("aria-hidden","true");
  const u=document.createElementNS(SVGNS,"use");u.setAttribute("href","#eq"+(x.ei!=null&&x.ei>=0?x.ei:2));sv.append(u);
  t.append(sv);return t;
}
function openFp(x){
  const u=FP_URL(x.fp);
  try{if(tg&&tg.openLink){tg.openLink(u);return;}}catch(e){}
  window.open(u,"_blank","noopener");
}
function openTech(libId){openInfo(libId);}
function pic(x){
  if(!x.img)return tile(x);
  const w=el("span","lc-img");const im=el("img");im.src=imgSrc(x.img,0);im.alt="";im.loading="lazy";im.decoding="async";
  im.addEventListener("error",()=>{w.replaceWith(tile(x));},{once:true});
  w.append(im);return w;
}
function libCard(x){
  const c=el("div","lc g"+Math.max(0,GROUPS.indexOf(x.group)));
  const op=el("button","lc-open");op.type="button";
  op.setAttribute("aria-label","Открыть: "+x.name);
  if(x.img)c.classList.add("has-img");
  op.append(pic(x),el("span","lc-name",x.name),el("span","lc-eq",x.equip||""));
  op.addEventListener("click",()=>openTech(x.id));
  const on=inProg(x.id);
  const add=el("button","lc-add"+(on?" done":""),on?"✓":"+");add.type="button";
  add.setAttribute("aria-label",on?"Уже в программе":"Добавить в программу: "+x.name);
  add.addEventListener("click",()=>{if(addFromLib(x)){add.className="lc-add done";add.textContent="✓";add.setAttribute("aria-label","Уже в программе");}});
  c.append(op,add);return c;
}
function renderLibList(){
  const box=$("#libList");box.textContent="";
  const words=norm1(S.libQuery).trim().split(/\s+/).filter(Boolean);
  const hits=LIB.filter(x=>(S.libGroup==="Все"||x.group===S.libGroup)&&words.every(w=>x.sk.indexOf(w)>=0));
  if(!hits.length){box.append(el("p","target","Ничего не нашлось. Можно добавить своё упражнение ниже."));return;}
  GROUPS.forEach(g=>{
    const hs=hits.filter(x=>x.group===g);if(!hs.length)return;
    if(S.libGroup==="Все"||words.length)box.append(el("h4","libgroup",g+" · "+hs.length));
    const grid=el("div","libgrid");hs.forEach(x=>grid.append(libCard(x)));box.append(grid);
  });
}
function openLib(){
  S.libQuery="";$("#libSearch").value="";
  $("#libTitle").textContent="Библиотека → «"+PW().name+"»";
  renderLibChips();renderLibList();openSheet("libSheet");
  $("#libSheet .body").scrollTop=0;
}
$("#libSearch").addEventListener("input",ev=>{S.libQuery=ev.target.value;renderLibList();});
$("#customAdd").addEventListener("click",()=>{
  const n=$("#customName").value.trim();
  if(!n){$("#customName").focus();return;}
  const W=PW();
  if(W.ex.length>=MAX_EX||totalEx()>=MAX_TOTAL){toast("Достигнут лимит упражнений в программе");return;}
  const id=rid("x");
  W.ex.push({id:id,lib:null,name:n.slice(0,60),sets:3,lo:10,hi:12,step:2.5,start:0,unit:"кг"});
  S.openEx[W.id+"/"+id]=true;$("#customName").value="";
  saveProg();renderProgEditor();closeSheet();toast("Добавлено — настрой подходы и вес");
});

/* exercise window inside the app: photos, short facts, own notes where we have them, link to the FitPush page */
function openInfo(libId){
  const x=LIBMAP[libId];if(!x)return;
  const b=$("#infoBody");b.textContent="";
  $("#infoBarTitle").textContent=x.group||"Техника";
  if(x.img){
    const ph=el("div","photos");
    [0,1].forEach(k=>{const f=el("figure");const im=el("img");im.src=imgSrc(x.img,k);im.alt=x.name+(k?": конец движения":": начало движения");im.decoding="async";
      im.addEventListener("error",()=>{f.remove();},{once:true});
      f.append(im,el("figcaption",null,k?"Конец":"Начало"));ph.append(f);});
    b.append(ph);
  }
  const h=el("h2",null,x.name);h.id="infoTitle";b.append(h);
  const facts=el("div","facts");
  [x.equip,x.level,x.sets+" × "+(x.lo===x.hi?x.hi:x.lo+"–"+x.hi)+(isTime(x)?tSuf(x):"")].filter(Boolean).forEach(t=>facts.append(el("span","fact",t)));
  b.append(facts);
  if(x.fp){
    const fp=el("button","btn wide primary","Техника и видео на FitPush ↗");fp.type="button";
    fp.addEventListener("click",()=>openFp(x));b.append(fp);
  }
  if(!inProg(x.id)){
    const add=el("button","btn wide"+(x.fp?"":" primary"),"+ Добавить в «"+PW().name+"»");add.type="button";
    add.addEventListener("click",()=>{if(addFromLib(x)){add.disabled=true;add.textContent="✓ Добавлено";if(stack.indexOf("libSheet")>=0)renderLibList();}});
    b.append(add);
  }
  if(x.muscles){b.append(el("h4",null,"Мышцы"),el("p",null,x.muscles));}
  if(x.how&&x.how.length){b.append(el("h4",null,"Как делать"));const ol=el("ol");x.how.forEach(t=>ol.append(el("li",null,t)));b.append(ol);}
  if(x.mistakes&&x.mistakes.length){b.append(el("h4",null,"Частые ошибки"));const ul=el("ul");x.mistakes.forEach(t=>ul.append(el("li",null,t)));b.append(ul);}
  if(x.tip)b.append(el("div","tipbox",x.tip));
  b.append(el("p","credit",(x.img?"Фото: Free Exercise DB, общественное достояние. ":"")+(x.fp?"Техника и видео — на fitpush.ru.":"")));
  openSheet("infoSheet");
  $("#infoSheet .body").scrollTop=0;
}

/* ================= YEAR: calendar + progress ================= */
function renderStats(){
  const now=new Date(),ym=now.getFullYear()+"-"+pad(now.getMonth()+1);
  const ws=[...S.docs.entries()].filter(([,doc])=>isWorkout(doc)).map(([d])=>d).sort();
  $("#stMonth").textContent=ws.filter(d=>d.startsWith(ym)).length;
  $("#stMonthK").textContent="в "+MON_IN[now.getMonth()];
  $("#stTotal").textContent=ws.length;
  $("#stLast").textContent=ws.length?short(ws[ws.length-1]):"—";
}
function renderYear(){
  renderStats();
  document.querySelectorAll("#yearSeg button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.y===S.yearPane)));
  $("#calPane").hidden=S.yearPane!=="cal";$("#progPane").hidden=S.yearPane!=="prog";
  const y=S.year,t=today(),now=new Date();
  $("#yearTitle").textContent=y;
  $("#nextYear").disabled=y>=now.getFullYear();
  const done=new Set([...S.docs.entries()].filter(([,doc])=>isWorkout(doc)).map(([d])=>d));
  $("#yearCount").textContent=workouts([...done].filter(d=>d.startsWith(y+"-")).length)+" за год";
  if(S.yearPane==="prog"){renderProgress();return;}
  const planDays=new Set();PROG.workouts.forEach(w=>w.days.forEach(d=>planDays.add(d)));
  const host=$("#months");host.textContent="";
  for(let m=0;m<12;m++){
    const box=el("div","month"+(y===now.getFullYear()&&m===now.getMonth()?" cur":""));
    const prefix=y+"-"+pad(m+1)+"-";
    const cnt=[...done].filter(d=>d.startsWith(prefix)).length;
    const hd=el("div","mhead");const ct=el("span","mcount");
    if(cnt){ct.append(el("b",null,String(cnt))," трен.");}else ct.textContent="—";
    hd.append(el("span","mname",MON[m]),ct);box.append(hd);
    const grid=el("div","days");
    DAY_S.forEach((w,i)=>grid.append(el("span","wd"+(planDays.has(i)?" plan":""),w)));
    const firstDow=(new Date(y,m,1).getDay()+6)%7;
    for(let k=0;k<firstDow;k++)grid.append(el("span"));
    const dim=new Date(y,m+1,0).getDate();
    for(let d=1;d<=dim;d++){
      const ds=prefix+pad(d);
      const b=el("button","day",String(d));b.type="button";
      if(done.has(ds))b.classList.add("done");
      if(ds===t)b.classList.add("today");
      if(ds>t){b.classList.add("future");b.disabled=true;}
      b.setAttribute("aria-label",d+" "+MON_G[m]+(done.has(ds)?", была тренировка":""));
      b.addEventListener("click",()=>{flush();S.date=ds;S.logW=null;setView("log");renderLog();window.scrollTo({top:0});});
      grid.append(b);
    }
    box.append(grid);host.append(box);
  }
}
document.querySelectorAll("#yearSeg button").forEach(b=>b.addEventListener("click",()=>{S.yearPane=b.dataset.y;haptic("tap");renderYear();}));
$("#prevYear").addEventListener("click",()=>{S.year--;renderYear();});
$("#nextYear").addEventListener("click",()=>{S.year++;renderYear();});

/* progress */
function metricsFor(e){
  if(!e)return [["bw","Вес тела"]];
  if(isTime(e))return [["reps","Лучшее время"]];
  if(isBody(e))return [["reps","Макс. повторы"],["top","Доп. вес"]];
  return [["top","Макс. вес"],["vol","Объём"]];
}
function progressItems(){
  /* exercises in the program first, then anything else that has history */
  const AE=allEx();
  const items=AE.map(e=>({id:e.id,e:e}));
  const extra={};
  for(const [,doc] of S.docs){if(doc.ex)Object.keys(doc.ex).forEach(id=>{if(!AE.some(e=>e.id===id))extra[id]=1;});}
  Object.keys(extra).forEach(id=>{const d=DEFAULT_EX.find(e=>e.id===id);items.push({id:id,e:d||{id:id,name:"Старое упражнение",unit:"кг",sets:3,lo:10,hi:12}});});
  items.push({id:"bw",e:null});
  return items;
}
function renderProgress(){
  const items=progressItems();
  if(!S.sel||!items.some(it=>it.id===S.sel))S.sel=items[0].id;
  const it=items.find(x=>x.id===S.sel),e=it.e;
  const mets=metricsFor(e);
  if(!mets.some(m=>m[0]===S.metric))S.metric=mets[0][0];

  const p=$("#picker");p.textContent="";
  items.forEach(o=>{
    const b=el("button",null,o.e?o.e.name:"Вес тела");b.type="button";b.setAttribute("aria-pressed",String(S.sel===o.id));
    b.addEventListener("click",()=>{S.sel=o.id;renderProgress();});p.append(b);
  });

  const pts=[];
  [...S.docs.keys()].sort().forEach(d=>{
    const doc=S.docs.get(d);
    if(!e){if(doc.bw!=null)pts.push({d:d,v:doc.bw});return;}
    const raw=doc.ex&&doc.ex[e.id];if(!hasSets(raw))return;
    const x=norm(raw);
    const v=S.metric==="vol"?volume(x):(S.metric==="reps"?topReps(x):topWeight(x));
    if(v!=null)pts.push({d:d,v:v,x:x});
  });
  const unit=!e?"кг":(S.metric==="reps"?(isTime(e)?"с":"повт."):"кг");

  const body=$("#progBody");body.textContent="";
  if(!pts.length){
    body.append(el("div","empty",!e?"Пока нет записей веса тела. Вписывай вес утром на вкладке «Тренировка».":"По упражнению «"+e.name+"» ещё нет записей. Заполни его на вкладке «Тренировка» — здесь появится график."));
    return;
  }
  const card=el("div","card");
  if(mets.length>1){
    const seg=el("div","seg");
    mets.forEach(([k,t])=>{const b=el("button",null,t);b.type="button";b.setAttribute("aria-pressed",String(S.metric===k));b.addEventListener("click",()=>{S.metric=k;renderProgress();});seg.append(b);});
    card.append(seg);
  }
  const first=pts[0].v,lastv=pts[pts.length-1].v,diff=Math.round((lastv-first)*100)/100;
  const g=el("div","gain");
  if(pts.length>1){g.append(fmt(first)+" → "+fmt(lastv)+" "+unit+" ");const sp=el("span",diff>0&&e?"plus":"","("+(diff>0?"+":"")+fmt(diff)+")");g.append(sp);}
  else g.textContent=fmt(lastv)+" "+unit;
  const sub=!e?"Вес тела по дням":({top:isBody(e)?"Самый большой доп. вес за тренировку":"Самый тяжёлый подход за тренировку",vol:"Объём: вес × повторы, сумма за все подходы",reps:isTime(e)?"Самый долгий подход за тренировку":"Больше всего повторов в подходе"})[S.metric];
  const ch=el("div","chart");
  card.append(g,ch);body.append(card);
  drawChart(ch,pts);

  const tw=el("div","card tablewrap");const tb=el("table");
  const hr=el("tr");(!e?["Дата","Вес тела"]:["Дата","Подходы"].concat(isTime(e)||isBody(e)?[]:["Объём"])).forEach(t=>hr.append(el("th",null,t)));
  const thead=el("thead");thead.append(hr);tb.append(thead);
  const tbody=el("tbody");
  pts.slice().reverse().forEach(pt=>{
    const tr=el("tr");tr.append(el("td",null,short(pt.d)+" "+parse(pt.d).getFullYear()));
    if(!e)tr.append(el("td","w",fmt(pt.v)+" кг"));
    else{
      tr.append(el("td","w",setsText(pt.x,e)));
      if(!isTime(e)&&!isBody(e)){const vol=volume(pt.x);tr.append(el("td",null,vol==null?"—":fmt(vol)+" кг"));}
    }
    tbody.append(tr);
  });
  tb.append(tbody);tw.append(tb);body.append(tw);
}
function niceTicks(lo,hi,n){
  const raw=(hi-lo)/n,mag=Math.pow(10,Math.floor(Math.log10(raw)));
  const st=[1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=raw)||10*mag;
  const a=Math.floor(lo/st)*st,b=Math.ceil(hi/st)*st,out=[];
  for(let v=a;v<=b+1e-9;v+=st)out.push(Math.round(v*1000)/1000);
  return out;
}
function drawChart(host,pts){
  const W=Math.max(260,Math.floor(host.clientWidth||300)),H=210,L=44,R=20,T=24,B=28;
  const xs=pts.map(p=>parse(p.d).getTime()),vs=pts.map(p=>p.v);
  let x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);if(x0===x1){x0-=3*864e5;x1+=3*864e5;}
  let lo=Math.min.apply(null,vs),hi=Math.max.apply(null,vs);if(lo===hi){lo-=2;hi+=2;}
  const ticks=niceTicks(lo,hi,4);lo=ticks[0];hi=ticks[ticks.length-1];
  const X=t=>L+(t-x0)/(x1-x0)*(W-L-R),Y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
  const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
  svg.setAttribute("width",W);svg.setAttribute("height",H);svg.setAttribute("viewBox","0 0 "+W+" "+H);
  svg.setAttribute("role","img");svg.setAttribute("aria-label","График: от "+fmt(pts[0].v)+" до "+fmt(pts[pts.length-1].v));
  const mk=(tag,attrs,cls)=>{const n=document.createElementNS(ns,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);if(cls)n.setAttribute("class",cls);svg.append(n);return n;};
  ticks.forEach(v=>{mk("line",{x1:L,x2:W-R,y1:Y(v),y2:Y(v)},"grid");mk("text",{x:L-8,y:Y(v)+4,"text-anchor":"end"},"axis").textContent=fmt(v);});
  const P=pts.map((p,i)=>[X(xs[i]),Y(p.v)]);
  if(P.length>1){
    mk("path",{d:"M"+P[0][0]+","+Y(lo)+" L"+P.map(q=>q[0]+","+q[1]).join(" L")+" L"+P[P.length-1][0]+","+Y(lo)+" Z"},"area");
    mk("path",{d:"M"+P.map(q=>q[0]+","+q[1]).join(" L")},"lineP");
  }
  P.forEach((q,i)=>{if(i<P.length-1&&P.length<=40)mk("circle",{cx:q[0],cy:q[1],r:3.5},"pt");});
  const lp=P[P.length-1];mk("circle",{cx:lp[0],cy:lp[1],r:5.5},"ptLast");
  let ly=lp[1]-11;if(ly<T-6)ly=lp[1]+20;
  const anchor=lp[0]>W-R-24?"end":(lp[0]<L+24?"start":"middle");
  mk("text",{x:lp[0]+(anchor==="end"?4:0),y:ly,"text-anchor":anchor},"endLab").textContent=fmt(pts[pts.length-1].v);
  mk("text",{x:pts.length>1?L:X(xs[0]),y:H-8,"text-anchor":pts.length>1?"start":"middle"},"axis").textContent=short(pts[0].d);
  if(pts.length>1)mk("text",{x:W-R,y:H-8,"text-anchor":"end"},"axis").textContent=short(pts[pts.length-1].d);
  host.textContent="";host.append(svg);
}
let rzT=null;
window.addEventListener("resize",()=>{clearTimeout(rzT);rzT=setTimeout(()=>{if(S.view==="year"&&S.yearPane==="prog")renderProgress();},200);});

/* ================= views ================= */
function setView(v){
  if(v!=="log")flush();
  if(v!=="prog")flushProg();
  S.view=v;
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===v)));
  ["log","prog","year"].forEach(n=>{$("#v-"+n).hidden=n!==v;});
  if(v==="log"&&S.progChanged&&!S.touched&&!S.timer){S.progChanged=false;renderLog();}
  if(v==="prog")renderProgEditor();
  if(v==="year")renderYear();
}
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>{haptic("tap");setView(b.dataset.view);window.scrollTo({top:0});}));
function refreshOthers(){if(S.view==="year")renderYear();}
function onData(){
  if(S.retry){const r=S.retry;S.retry=null;persist(r.date,r.body);}
  if(!S.touched&&!S.timer)renderLog();
  refreshOthers();
  if(S.view==="prog")renderProgEditor();
}

/* ================= boot ================= */
function applyTheme(){
  if(!tg)return;
  const dark=tg.colorScheme==="dark",bg=dark?"#101215":"#F1F2F0";
  document.documentElement.setAttribute("data-theme",dark?"dark":"light");
  try{if(tg.isVersionAtLeast("6.1")){tg.setHeaderColor(bg);tg.setBackgroundColor(bg);}}catch(e){}
  try{if(tg.isVersionAtLeast("7.10"))tg.setBottomBarColor(bg);}catch(e){}
}
const h=(location.hash||"").slice(1);
renderLog();
setView(["log","prog","year"].indexOf(h)>=0?h:"log");

(async function(){
  if(tg){
    try{tg.ready();tg.expand();}catch(e){}
    try{if(tg.isVersionAtLeast("7.7"))tg.disableVerticalSwipes();}catch(e){}
    applyTheme();
    try{tg.onEvent("themeChanged",applyTheme);}catch(e){}
  }
  const cloudOK=!!(tg&&tg.initData&&tg.isVersionAtLeast&&tg.isVersionAtLeast("6.9")&&tg.CloudStorage);
  if(cloudOK){
    try{
      const allKeys=await cs("getKeys");
      const keys=allKeys.filter(k=>k.indexOf("w_")===0);
      if(allKeys.indexOf(PKEY)>=0){
        try{const pv=await cs("getItems",[PKEY]);if(pv&&pv[PKEY])setProg(cleanProg(JSON.parse(pv[PKEY])));}catch(e){}
      }
      const docs=new Map();
      for(let i=0;i<keys.length;i+=20){
        const part=keys.slice(i,i+20);
        const vals=await cs("getItems",part);
        part.forEach(k=>{try{const v=vals&&vals[k];if(v)docs.set(k.slice(2),JSON.parse(v));}catch(e){}});
      }
      S.docs=docs;S.mode="cloud";S.loaded=true;
      lsWrite(LS,Object.fromEntries(S.docs));
      setStatus("",S.docs.size?"Журнал загружен":"Пока пусто — заполни первую тренировку");
      onData();return;
    }catch(e){setStatus("err","Облако Telegram не ответило — пока сохраняю на телефоне");}
  }
  S.mode="local";
  const lp=lsRead(LSP);if(lp)setProg(cleanProg(lp));
  S.docs=new Map(Object.entries(lsRead(LS)||{}));
  S.loaded=true;
  if(!cloudOK){$("#storageNote").hidden=false;setStatus("",S.docs.size?"Журнал загружен":"Пока пусто — заполни первую тренировку");}
  onData();
})();
})();
