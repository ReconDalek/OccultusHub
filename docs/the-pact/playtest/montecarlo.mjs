// The Pact — full 18-night Monte Carlo.
// Score = Dominion * loyaltyMod * cashMod
//   loyaltyMod = clamp(0.3 + T/25, 0.3, 2.0);  cashMod = clamp(0.75 + g/4000, 0.75, 1.5)
// Offerings not scored. Cap 90; overfill => -80 D / -3 T.
// Nights 13-18: one d6 per cabal per night -> band 0(1-2)/1(3-4)/2(5-6) applied to the chosen option.
// Triples are [worst, mid, best] from the player's POV. Scalars are fixed.
const START = { g: 1000, o: 0, d: 0, t: 0 };
const O_CAP = 90, OVF = { d:-80, t:-3 };

const N = {
  1:{A:{d:15,o:2},B:{d:45},C:{t:3},D:{g:-350,o:10}},
  2:{A:{g:-300,d:55},B:{o:-3,d:22,t:1},C:{t:-1,d:60},D:{g:-150,d:5}},
  3:{A:{d:-35,g:550},B:{g:-300,d:25,t:3},C:{o:6},D:{d:50,delayed:{on:6,eff:{g:450}}}},
  4:{A:{g:-450,d:15},B:{d:-12,o:1},C:{t:-2,d:75},D:{d:-10,t:4}},
  5:{A:{g:-600,o:22},B:{g:-250,o:8,t:2},C:{o:-9,g:650},D:{g:-350,d:45,o:2}},
  6:{A:{g:-150,d:40,dPerT:6},B:{g:-250,d:45},C:{g:600,d:-45},D:{o:-11,d:70}},
  7:{A:{g:-500,d:12},B:{t:-5,d:30},C:{t:-2,d:75},D:{g:-300,t:-1}},
  8:{A:{o:-18,d:125},B:{o:-6,d:45},C:{g:-450,d:55},D:{o:-2,d:15,t:1}},
  9:{A:{o:-6,t:5},B:{d:-15,t:3},C:{g:-200,delayed:{on:11,eff:{d:60,t:3}}},D:{d:115,t:-3}},
  10:{A:{g:-450,d:80},B:{d:20,dPerT:6,t:-1},C:{g:-200,d:-20,o:-3},D:{d:100,delayed:{on:12,eff:{t:-4}}}},
  11:{A:{t:-4,d:95},B:{g:-450,d:22,t:1},C:{t:-3,d:-10},D:{g:-120,d:8,t:2}},
  12:{A:{g:-550,t:-3,d:140},B:{g:-250,d:55},C:{g:-450,o:18},D:{g:750,d:10,t:2}},
  // ---- dice nights: costs swing modestly, rewards swing wide ----
  13:{A:{g:[-400,-200,100],d:[-30,80,200],o:[0,4,10]},B:{g:[-250,-180,-110],d:[30,65,120]},
      C:{g:[-120,-70,-30],d:[12,28,50],t:[0,1,2]},D:{g:[-20,30,100],d:[2,10,22]}},
  14:{A:{g:[-350,-250,-150],t:[-4,-2,0],d:[30,120,260]},B:{g:[-350,-260,-170],d:[5,22,45]},
      C:{g:[-100,-60,-20],d:[10,22,40],dPerT:[3,5,7]},D:{g:[-120,-60,0],delayed:{on:17,eff:{d:[40,110,230]}}}},
  15:{A:{o:[-26,-20,-14],d:[50,120,240],g:[0,250,800]},B:{o:[-11,-8,-5],d:[35,75,140]},
      C:{g:[-350,-250,-150],t:[-3,-2,-1],d:[55,120,230]},D:{o:[-4,-3,-2],d:[8,18,35]}},
  16:{A:{g:[-450,-300,-150],t:[-5,-2,2],d:[-20,130,320]},B:{g:[-250,-170,-90],d:[30,75,140],t:[-1,0,1]},
      C:{t:[-5,-3,-1],d:[30,75,150]},D:{g:[-120,-60,-10],d:[-10,5,18]}},
  17:{A:{g:[-420,-320,-220],d:[45,95,175]},B:{g:[-300,-120,120],d:[-70,35,180],t:[-3,-1,0]},
      C:{o:[-20,-15,-10],d:[40,90,180]},D:{g:[-220,-150,-80],d:[18,55,110]}},
  18:{A:{g:[-350,-80,500],d:[-40,150,430],t:[-4,0,4]},B:{g:[-200,-60,150],d:[65,160,320]},
      C:{g:[-150,-90,-30],d:[25,55,100],dPerT:[5,8,12]},D:{g:[120,320,700],d:[15,40,90]}},
};
const V = (x,b)=> Array.isArray(x)? x[b] : (x||0);
function affordable(s,eff,b){ const g=V(eff.g,b), o=V(eff.o,b), t=V(eff.t,b);
  return g+s.g>=0 && (o<0?-o:0)<=s.o && (t<0?-t:0)<=s.t; }
function applyEff(s,eff,b){ const g=V(eff.g,b),o=V(eff.o,b),t=V(eff.t,b);
  const oC=o<0?-o:0,tC=t<0?-t:0;
  if(oC>s.o||tC>s.t){ if(g<0)s.g+=g; return {fail:true}; }
  s.g+=g;
  let dd=V(eff.d,b) + (eff.dPerT? V(eff.dPerT,b)*s.t : 0);
  s.d=Math.max(0,s.d+dd); s.t=Math.max(0,s.t+t);
  let no=s.o+o; let ovf=false;
  if(no>O_CAP){ ovf=true; no=O_CAP; s.d=Math.max(0,s.d+OVF.d); s.t=Math.max(0,s.t+OVF.t); }
  s.o=Math.max(0,no);
  return {ovf};
}
function run(pick, rng){
  const s={...START}, pending={}; let broke=0;
  for(let n=1;n<=18;n++){
    if(pending[n]) for(const p of pending[n]){ applyEff(p.s? p.s : {...s}, p.eff, p.band??1); }
    // resolve delayed properly against current s:
    if(pending[n]) {} // handled below
    const dice = n>=13;
    const band = dice ? [0,0,1,1,2,2][Math.floor(rng()*6)] : 1;
    const opt = pick(n,s,dice);
    const eff = N[n][opt];
    const r = applyEff(s,eff,band);
    if(eff.delayed){ (pending[eff.delayed.on] ||= []).push({eff:eff.delayed.eff, band}); }
    if(s.g<0){ broke=n; break; }
  }
  if(broke) return {broke,score:0,s};
  const loy=Math.max(0.3,Math.min(2,0.3+s.t/25));
  const cash=Math.max(0.75,Math.min(1.5,0.75+s.g/4000));
  return {broke:0, score:Math.round(s.d*loy*cash), s, loy:+loy.toFixed(2), cash:+cash.toFixed(2)};
}
// fix delayed handling: re-implement cleanly
function run2(pick, rng){
  const s={...START}; const pend={};
  let broke=0;
  for(let n=1;n<=18;n++){
    if(pend[n]) for(const e of pend[n]) applyEff(s,e.eff,e.band);
    if(s.g<0){ broke=n; break; }
    const dice=n>=13;
    const band = dice ? [0,0,1,1,2,2][Math.floor(rng()*6)] : 1;
    const opt = pick(n,s,dice);
    const eff = N[n][opt];
    applyEff(s,eff,band);
    if(eff.delayed) (pend[eff.delayed.on] ||= []).push({eff:eff.delayed.eff, band});
    if(s.g<0){ broke=n; break; }
  }
  if(broke) return {broke,score:0,s};
  const loy=Math.max(0.3,Math.min(2,0.3+s.t/25));
  const cash=Math.max(0.75,Math.min(1.5,0.75+s.g/4000));
  return {broke:0, score:Math.round(s.d*loy*cash), s};
}
// expected-value estimate for AI (uses mid band for triples)
const est=(e,s)=> V(e.d,1) + (e.dPerT?V(e.dPerT,1)*s.t:0) + (e.delayed? (Array.isArray(e.delayed.eff.d)?e.delayed.eff.d[1]:(e.delayed.eff.d||0)):0);
const estT=(e)=> V(e.t,1) + (e.delayed? (Array.isArray(e.delayed.eff.t)?e.delayed.eff.t[1]:(e.delayed.eff.t||0)):0);
function pickBy(n,s,key,buf=80){
  const o=N[n]; let b=null,bv=-Infinity;
  for(const k of ['A','B','C','D']){ const e=o[k];
    if(!affordable(s,e,0)) continue;            // must survive worst band
    if(V(e.g,0)+s.g < buf) continue;
    const v=key(e,s); if(v>bv){bv=v;b=k;}
  }
  if(b) return b;
  for(const k of ['A','B','C','D']) if(affordable(s,N[n][k],0)) return k;
  return 'D';
}
const STR={
  balanced:(n,s)=>pickBy(n,s,(e)=>est(e,s)+estT(e)*11),
  domLean:(n,s)=>pickBy(n,s,(e)=>est(e,s)+estT(e)*5),
  followerHeavy:(n,s)=>pickBy(n,s,(e)=>estT(e)*14+est(e,s)*0.5),
  greedyDom:(n,s)=>pickBy(n,s,(e)=>est(e,s),20),
  spamB:()=>'B', ABCD:(n)=>'ABCD'[(n-1)%4],
};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const TRIALS=8000;
console.log('STRATEGY        bankrupt%   p10    p50    p90    mean   (score = D * loyMod * cashMod)');
for(const [name,fn] of Object.entries(STR)){
  const scores=[]; let bk=0;
  for(let i=0;i<TRIALS;i++){ const r=run2(fn, mulberry32(i*2654435761)); if(r.broke)bk++; scores.push(r.score); }
  scores.sort((a,b)=>a-b);
  const p=q=>scores[Math.floor(q*TRIALS)];
  const mean=Math.round(scores.reduce((a,b)=>a+b,0)/TRIALS);
  console.log(name.padEnd(14), String((100*bk/TRIALS).toFixed(1)).padStart(7),
    String(p(0.1)).padStart(7),String(p(0.5)).padStart(7),String(p(0.9)).padStart(7),String(mean).padStart(7));
}
// one sample verbose run of balanced
const sample = (()=>{ const s={...START}; const pend={}; const rng=mulberry32(42); let broke=0; const log=[];
  for(let n=1;n<=18;n++){ if(pend[n]) for(const e of pend[n]){ applyEff(s,e.eff,e.band); log.push(`   [delayed n${n}]`);}
    if(s.g<0){broke=n;break;}
    const dice=n>=13; const band=dice?[0,0,1,1,2,2][Math.floor(rng()*6)]:1;
    const opt=STR.balanced(n,s,dice); applyEff(s,N[n][opt],band);
    if(N[n][opt].delayed)(pend[N[n][opt].delayed.on]||=[]).push({eff:N[n][opt].delayed.eff,band});
    log.push(`n${n} ${opt}${dice?' [band '+band+']':''}: g${Math.round(s.g)} o${s.o} d${s.d} t${s.t}`);
    if(s.g<0){broke=n;break;} }
  return {log,broke,s}; })();
console.log('\nsample balanced run:\n'+sample.log.join('\n'));
