/* Progress math of the gym log: what counts as getting stronger. Pure functions — no page, no storage —
   so they can be tested with `node --test`. app.js takes everything from window.GymProgress.

   A set is {w, r} (weight, reps or seconds) plus `load` = what is really moved (bodyweight + extra for
   bodyweight moves, when the body weight is known). An exercise e gives the unit and the rep range (lo–hi).

   Rules (sources in docs/analysis-2026-11.md):
   - A workout is judged by its best set, so a tired last set does not spoil it; with the best set no
     better, more done in total still counts.
   - Clear cases need no formula: not less weight and not fewer reps, and more of one, is better (+1 rep
     counts — that is how double progression moves).
   - Weaker only beyond day-to-day noise: strength varies ~4% between days (1RM test-retest CV 4.2%,
     Grgic 2020), so a set must be >4% weaker. −1 rep on the same weight (≈3%) is "the same", −2 is weaker.
   - Trade-offs (more weight, fewer reps) fold weight and reps into one number, weight × (1 + reps/30)
     (Epley; one rep ≈ 3% of the weight), only while both sets are ≤ 12 reps — above that rep↔weight
     formulas break down, so such trade-offs are "can't tell". The number is never shown.
   - Bodyweight moves add the logged body weight to the extra weight (the same body weight for both sides,
     so losing weight never looks like getting weaker); holds and cardio compare time.
   - People, not machines: a drop with an obvious reason is not "просело" — the exercise was done in a
     superset one time and on its own the other time (pre-fatigue, shorter rest), or it comes after a
     break of more than two weeks. Drop sets (x.dr) never count: they come after the last working set
     and are done to failure, so the working sets are compared as they are. */
(function(root){
"use strict";

const UP_NOISE=0.02,DOWN_NOISE=0.04,REP_CAP=12,REF_BW=70,BREAK_DAYS=14;
const dayGap=(a,b)=>Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/864e5);

const fmt=v=>v==null?"—":String(Math.round(v*100)/100).replace(".",",");
const signed=v=>(v>0?"+":v<0?"−":"")+fmt(Math.abs(Math.round(v*100)/100));
const isTime=e=>e.unit==="секунды"||e.unit==="минуты";
const isBody=e=>e.unit==="свой вес + кг";
const tUnit=e=>e.unit==="минуты"?" мин":" с";
const wtText=(e,v)=>(isBody(e)?"+":"")+fmt(v)+" кг";

const e1rm=(w,r)=>r>0?(r===1?w:w*(1+r/30)):0;
/* working sets with reps typed; x = {w:[…], r:[…]} */
function setsOf(e,x,bw){
  const out=[];
  if(!x||!Array.isArray(x.r))return out;
  x.r.forEach((r,i)=>{
    if(r==null||r<=0)return;
    const w=x.w?x.w[i]:null;
    if(isTime(e))out.push({i:i,r:r,w:null,load:null});
    else if(isBody(e))out.push({i:i,r:r,w:w||0,load:bw!=null?bw+(w||0):null});
    else if(w!=null)out.push({i:i,r:r,w:w,load:w});
  });
  return out;
}
/* warm-ups count only if one of them beats the working sets — then it was not really a warm-up.
   They never count as volume and never as "the first set" for the slow-start tip. */
const warmOf=(e,x,bw)=>x&&x.wu?setsOf(e,x.wu,bw).map(s=>Object.assign(s,{wu:true})):[];
const setScore=(e,s)=>isTime(e)?s.r:e1rm(s.load!=null?s.load:(s.w||0)+REF_BW,s.r);
function bestOf(e,ss){let b=null;ss.forEach(s=>{if(!b||setScore(e,s)>setScore(e,b)+1e-9)b=s;});return b;}
const bestAll=(e,x,bw)=>bestOf(e,setsOf(e,x,bw).concat(warmOf(e,x,bw)));
const workOf=(e,ss)=>ss.reduce((t,s)=>t+(isTime(e)?s.r:(s.load!=null?s.load:(s.w||0)+REF_BW)*s.r),0);

/* 1: b is stronger than a, -1: weaker, 0: the same (or impossible to tell) */
function cmpSets(e,a,b){
  if(isTime(e))return b.r>a.r?1:b.r<a.r*(1-DOWN_NOISE)?-1:0;
  if(b.w>=a.w&&b.r>=a.r)return b.w>a.w||b.r>a.r?1:0;
  if(b.w<=a.w&&b.r<=a.r)return setScore(e,b)/setScore(e,a)-1<-DOWN_NOISE?-1:0;
  if(a.load==null||b.load==null||a.r>REP_CAP||b.r>REP_CAP)return 0;
  const ch=e1rm(b.load,b.r)/e1rm(a.load,a.r)-1;
  return ch>UP_NOISE?1:ch<-DOWN_NOISE?-1:0;
}

function setText(e,s){
  const t=isTime(e)?s.r+tUnit(e):isBody(e)?(s.w?"+"+fmt(s.w)+" кг × "+s.r:s.r+" повт."):fmt(s.w)+" кг × "+s.r;
  return s.wu?t+" (разминка)":t;
}
function setChip(e,s){
  if(isTime(e))return s.r+tUnit(e);
  if(isBody(e))return s.w?"+"+fmt(s.w)+"×"+s.r:String(s.r);
  return fmt(s.w)+"×"+s.r;
}
function allSetsText(e,ss){
  const ws=ss.map(s=>s.w);
  const reps=ss.map(s=>s.r).join(", ");
  if(isTime(e))return reps+tUnit(e);
  if(ws.every(w=>w===ws[0]))return isBody(e)?(ws[0]?"+"+fmt(ws[0])+" кг: ":"")+reps+(ws[0]?"":" повт."):fmt(ws[0])+" кг: "+reps;
  return ss.map(s=>setChip(e,s)).join(", ");
}

/* compares two workouts of one exercise (a — earlier, b — later); null when there is nothing to compare.
   v: 1 better, -1 weaker, 0 the same. why: "best" — by the best set; "work" — best set the same, more done
   in total; "mixed" — best set weaker but more done in total, so not a drop; "ss" / "break" — weaker, but
   the conditions changed (superset on one side only — x.ss; ctx.gap days since a — a break), so not a drop.
   one: every working set of both workouts on one weight — then all the reps are shown, not just the best. */
function judge(e,xa,xb,bw,ctx){
  const A=setsOf(e,xa,bw),B=setsOf(e,xb,bw);
  if(!A.length||!B.length)return null;
  const a=bestOf(e,A.concat(warmOf(e,xa,bw))),b=bestOf(e,B.concat(warmOf(e,xb,bw)));
  let v=cmpSets(e,a,b),why="best";
  const wa=workOf(e,A),wb=workOf(e,B);
  if(v===0&&wb>wa*(1+UP_NOISE)){v=1;why="work";}
  else if(v<0&&wb>=wa){v=0;why="mixed";}
  if(v<0){
    if(!!xa.ss!==!!xb.ss){v=0;why="ss";}
    else if(ctx&&ctx.gap>BREAK_DAYS){v=0;why="break";}
  }
  const one=!isTime(e)&&!a.wu&&!b.wu&&A.concat(B).every(s=>s.w===a.w);
  const res={v:v,why:why,one:one,a:a,b:b,A:A,B:B};
  const all=one||why==="work";
  res.was=all?allSetsText(e,A):setText(e,a);
  res.now=all?allSetsText(e,B):setText(e,b);
  return res;
}
const repsOf=ss=>ss.reduce((t,s)=>t+s.r,0);
/* the badge: what changed — reps over all sets on one weight, or the best set in kilos and reps */
function deltaText(e,j){
  if(j.one){const d=repsOf(j.B)-repsOf(j.A);return d?signed(d)+" повт.":"=";}
  if(j.why==="work"){const p=Math.round((workOf(e,j.B)/workOf(e,j.A)-1)*100);return "объём "+(p>0?"+":"−")+Math.abs(p)+"%";}
  if(isTime(e))return signed(j.b.r-j.a.r)+tUnit(e).trim();
  const parts=[];
  if(j.b.w!==j.a.w)parts.push(signed(j.b.w-j.a.w)+" кг");
  if(j.b.r!==j.a.r)parts.push(signed(j.b.r-j.a.r)+" повт.");
  return parts.join(", ")||"=";
}

/* What the log may offer from a workout x of this exercise:
   - "up": every planned set at one weight and every one at the top of the range → «Прокачать» (+step);
   - "start": the weight was raised by hand during the workout and a heavier later set still made
     the range → «Все подходы по N кг».
   Nothing else; time-based exercises never get it. */
function levelUp(e,x){
  if(!x||isTime(e))return null;
  const ss=[];
  x.r.forEach((r,i)=>{if(r==null)return;const w=x.w[i]!=null?x.w[i]:(isBody(e)?0:null);if(w!=null)ss.push({w:w,r:r});});
  if(!ss.length)return null;
  const first=ss[0];
  let h=null;
  ss.slice(1).forEach(q=>{if(q.w>first.w&&q.r>=e.lo&&(!h||q.w>h.w))h=q;});
  if(h)return {kind:"start",from:first.w,to:h.w};
  if(e.step>0&&ss.length>=e.sets&&ss.every(q=>q.w===first.w&&q.r>=e.hi))return {kind:"up",from:first.w,to:Math.round((first.w+e.step)*100)/100};
  return null;
}
/* the heaviest working set actually done (reps typed); bodyweight moves count "no extra" as 0 */
function topSet(e,x){
  let t=null;if(!x||isTime(e))return null;
  x.r.forEach((r,i)=>{if(r==null||r<=0)return;let w=x.w[i];if(w==null){if(!isBody(e))return;w=0;}if(!t||w>t.w||(w===t.w&&r>t.r))t={w:w,r:r};});
  return t;
}
/* a later set clearly better than the first one: the start was too easy.
   Heavier later and still in the rep range → start the working sets there (same rule the log uses
   to raise the start weight). Same weight but 2+ more reps (or 15% more time) → there was reserve. */
function rampTip(e,x,bw){
  const ss=setsOf(e,x,bw);if(ss.length<2)return null;
  const first=ss[0],rest=ss.slice(1);
  const which=s=>s===ss[ss.length-1]?"Последний подход":(ss.indexOf(s)+1)+"-й подход";
  if(!isTime(e)){
    let h=null;
    rest.forEach(s=>{if(s.w>first.w&&s.r>=e.lo&&(!h||s.w>h.w||(s.w===h.w&&s.r>h.r)))h=s;});
    if(h)return which(h)+" ("+setText(e,h)+") тяжелее первого ("+setText(e,first)+"), и повторов хватило — "+
      "в следующий раз можно начать рабочие подходы сразу с "+wtText(e,h.w);
  }
  let m=null;
  rest.forEach(s=>{
    const more=isTime(e)?s.r>=first.r*1.15&&s.r-first.r>=5:s.w===first.w&&s.r-first.r>=2;
    if(more&&(!m||s.r>m.r))m=s;
  });
  if(m)return which(m)+" ("+setText(e,m)+") сильнее первого ("+setText(e,first)+") — в начале был запас. "+
    "В следующий раз выкладывайся с первого подхода"+(isTime(e)?"":" или добавь вес");
  return null;
}

/* One exercise over a period (a month). pts: its workouts in the period, oldest first, [{d, x}];
   base: its last workouts before the period (up to 2, recent enough), so the first workouts of a month
   are compared with the end of the previous one.
   start = the better of the base workouts (or the period's first workout when there is no base),
   end = the better of the period's last two — one weak day does not hide a month of growth.
   "down" only when both of the last two workouts are weaker than the start (two in a row), never from a
   single workout, and not after a break of more than BREAK_DAYS on the way. dip: the last workout clearly
   weaker than the one before (for no obvious reason, see judge) — a soft note, not a verdict. */
function periodTrend(e,pts,base,bw){
  const better=(p,q)=>{const j=judge(e,p.x,q.x,bw);return j&&j.v>0?q:p;};
  const pickBest=list=>list.reduce((p,q)=>better(p,q));
  let startPool,endPool;
  if(base&&base.length){startPool=base.slice(-2);endPool=pts.slice(-2);}
  else{if(pts.length<2)return null;startPool=[pts[0]];endPool=pts.slice(1).slice(-2);}
  if(!endPool.length)return null;
  const start=pickBest(startPool),end=pickBest(endPool);
  const j=judge(e,start.x,end.x,bw);
  if(!j)return null;
  const seq=(base||[]).concat(pts),last=seq[seq.length-1],prev=seq[seq.length-2];
  const i0=seq.indexOf(start),i1=seq.indexOf(end);
  const brk=seq.some((p,i)=>i>i0&&i<=i1&&dayGap(seq[i-1].d,p.d)>BREAK_DAYS);
  const kind=j.v>0?"up":(j.v<0&&endPool.length>=2&&!brk?"down":null);
  const jd=prev&&kind!=="down"?judge(e,prev.x,last.x,bw,{gap:dayGap(prev.d,last.d)}):null;
  return {kind:kind,j:j,start:start,end:end,last:last,dip:jd&&jd.v<0?{prev:prev,j:jd}:null};
}

const api={UP_NOISE,DOWN_NOISE,REP_CAP,BREAK_DAYS,dayGap,fmt,signed,isTime,isBody,wtText,e1rm,setsOf,setScore,bestOf,bestAll,workOf,
  cmpSets,setText,setChip,allSetsText,judge,deltaText,levelUp,topSet,rampTip,periodTrend};
root.GymProgress=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
