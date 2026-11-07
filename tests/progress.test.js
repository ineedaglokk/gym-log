/* Run from the project root: node --test */
const test=require("node:test");
const assert=require("node:assert/strict");
const P=require("../progress.js");

const KG={unit:"кг",sets:3,lo:10,hi:12,step:5};
const DB={unit:"кг в руке",sets:3,lo:8,hi:12,step:2};
const HIGH={unit:"кг в руке",sets:3,lo:12,hi:20,step:1};
const set=(w,r)=>({w:w,r:r,load:w});
const x=(w,r)=>({w:Array.isArray(w)?w:r.map(()=>w),r:r});
const at=(d,w,r)=>({d:d,x:x(w,r)});

test("same weight: −1 rep is noise, −2 reps is weaker, +1 rep is better",()=>{
  assert.equal(P.cmpSets(KG,set(100,10),set(100,9)),0);
  assert.equal(P.cmpSets(KG,set(100,10),set(100,8)),-1);
  assert.equal(P.cmpSets(KG,set(100,12),set(100,10)),-1);
  assert.equal(P.cmpSets(KG,set(100,10),set(100,11)),1);
});

test("lighter by one small step with the same reps is within noise, by 5% is weaker",()=>{
  assert.equal(P.cmpSets(KG,set(100,10),set(97.5,10)),0);
  assert.equal(P.cmpSets(KG,set(100,10),set(95,10)),-1);
});

test("trade-offs use the formula only up to 12 reps",()=>{
  assert.equal(P.cmpSets(KG,set(100,12),set(110,11)),1);     /* +7% */
  assert.equal(P.cmpSets(KG,set(110,8),set(100,9)),-1);      /* −7% */
  assert.equal(P.cmpSets(HIGH,set(6,20),set(7,15)),0);       /* above 12 reps: can't tell */
  assert.equal(P.cmpSets(HIGH,set(7,15),set(6,20)),0);
});

test("judge: straight sets on one weight show all reps",()=>{
  const j=P.judge(DB,x(16,[11,10,9]),x(16,[12,12,11]),null);
  assert.equal(j.v,1);
  assert.equal(j.one,true);
  assert.equal(P.deltaText(DB,j),"+5 повт.");
  assert.equal(j.was,"16 кг: 11, 10, 9");
  assert.equal(j.now,"16 кг: 12, 12, 11");
});

test("judge: best set equal, more reps in later sets is progress",()=>{
  const j=P.judge(KG,x(45,[12,11,10]),x(45,[12,12,12]),null);
  assert.equal(j.v,1);
  assert.equal(P.deltaText(KG,j),"+3 повт.");
});

test("judge: best set lighter but more done in total is not a drop",()=>{
  const j=P.judge(KG,x([100,100,100],[12,8,8]),x([95,95,95],[12,12,12]),null);
  assert.equal(j.v,0);
  assert.equal(j.why,"mixed");
});

test("judge: one rep less on the best set is not a drop",()=>{
  const j=P.judge(KG,x(110,[12,11,10]),x(110,[11,11,10]),null);
  assert.equal(j.v,0);
});

test("month: one weak last day does not hide the month's gain",()=>{
  const base=[at("2026-10-29",95,[12,11,10])];
  const pts=[at("2026-11-02",100,[12,12,12]),at("2026-11-04",110,[12,11,10]),at("2026-11-06",110,[10,9,8])];
  const t=P.periodTrend(KG,pts,base,null);
  assert.equal(t.kind,"up");
  assert.equal(t.start.d,"2026-10-29");
  assert.equal(t.end.d,"2026-11-04");
  assert.ok(t.dip,"the weak last day is a soft note");
  assert.equal(P.deltaText(KG,t.j),"+15 кг");
});

test("month: a single weaker workout is never a drop, two in a row is",()=>{
  const base=[at("2026-10-29",100,[12,12,12])];
  assert.equal(P.periodTrend(KG,[at("2026-11-02",90,[10,10,10])],base,null).kind,null);
  const two=P.periodTrend(KG,[at("2026-11-02",90,[10,10,10]),at("2026-11-04",90,[10,9,9])],base,null);
  assert.equal(two.kind,"down");
});

test("month: without earlier workouts the first one of the month is the start",()=>{
  const t=P.periodTrend(KG,[at("2026-11-02",100,[10,10,10]),at("2026-11-04",100,[12,11,10])],[],null);
  assert.equal(t.kind,"up");
  assert.equal(t.start.d,"2026-11-02");
  assert.equal(P.periodTrend(KG,[at("2026-11-02",100,[10,10,10])],[],null),null);
});

test("bodyweight moves without a logged body weight: only clear cases",()=>{
  const BW={unit:"свой вес + кг",sets:3,lo:6,hi:10,step:2.5};
  const j=P.judge(BW,x([0,0,0],[8,8,7]),x([0,0,0],[9,8,8]),null);
  assert.equal(j.v,1);
  const t=P.judge(BW,x([0,0,0],[10,10,10]),x([5,5,5],[8,8,8]),null);   /* +5 kg, −2 reps: can't tell */
  assert.equal(t.v,0);
});

test("holds compare time with the same noise band",()=>{
  const PL={unit:"секунды",sets:3,lo:30,hi:60,step:0};
  assert.equal(P.cmpSets(PL,{r:60},{r:58}),0);
  assert.equal(P.cmpSets(PL,{r:60},{r:55}),-1);
  assert.equal(P.cmpSets(PL,{r:60},{r:62}),1);
});

test("levelUp: every set on one weight at the top of the range",()=>{
  assert.deepEqual(P.levelUp(KG,x(100,[12,12,12])),{kind:"up",from:100,to:105});
  assert.equal(P.levelUp(KG,x(100,[12,12,11])),null);
});
