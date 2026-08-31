// The Pact — playtest v6. Start gold 1000.
// Score = Dominion * loyaltyMod * cashMod
//   loyaltyMod = clamp(0.3 + T/25, 0.3, 2.0)   -- followers scale your favour 0.3x..2.0x
//   cashMod    = clamp(0.75 + g/4000, 0.75, 1.5)
// Offerings NOT scored. Fuel + hard cap 90; overfill => -80 D / -3 T.
// Engine options: dPerT = Dominion gained per current Thrall (resolved at pick time, pre any T delta).
const START = { g: 1000, o: 0, d: 0, t: 0 };
const O_CAP = 90;
const OVERFILL = { d: -80, t: -3 };

const NIGHTS = {
  1: { A:{d:15,o:2}, B:{d:45}, C:{t:3}, D:{g:-350,o:10} },
  2: { A:{g:-300,d:55}, B:{o:-3,d:22,t:1}, C:{t:-1,d:60}, D:{g:-150,d:5} },
  3: { A:{d:-35,g:500}, B:{g:-300,d:25,t:3}, C:{o:6}, D:{d:50,delayed:{on:6,eff:{g:450}}} },
  4: { A:{g:-450,d:15}, B:{d:-12,o:1}, C:{t:-2,d:75}, D:{d:-10,t:4} },
  5: { A:{g:-600,o:22}, B:{g:-250,o:8,t:2}, C:{o:-9,g:600}, D:{g:-350,d:45,o:2} },
  6: { A:{g:-150,d:40,dPerT:6}, B:{g:-250,d:45}, C:{g:550,d:-45}, D:{o:-11,d:70} },
  7: { A:{g:-500,d:12}, B:{t:-5,d:30}, C:{t:-2,d:75}, D:{g:-300,t:-1} },
  8: { A:{o:-18,d:125}, B:{o:-6,d:45}, C:{g:-550,d:55}, D:{o:-2,d:15,t:1} },
  9: { A:{o:-6,t:5}, B:{d:-15,t:3}, C:{g:-200,delayed:{on:11,eff:{d:60,t:3}}}, D:{d:115,t:-3} },
  10:{ A:{g:-550,d:80}, B:{d:20,dPerT:6,t:-1}, C:{g:-200,d:-20,o:-3}, D:{d:100,delayed:{on:12,eff:{t:-4}}} },
  11:{ A:{t:-4,d:95}, B:{g:-450,d:22,t:1}, C:{t:-3,d:-10}, D:{g:-120,d:8,t:2} },
  12:{ A:{g:-550,t:-3,d:140}, B:{g:-250,d:55}, C:{g:-450,o:18}, D:{g:500,d:10,t:2} },
};

function affordable(s, eff){ const oC=eff.o<0?-eff.o:0,tC=eff.t<0?-eff.t:0;
  return (eff.g||0)+s.g>=0 && oC<=s.o && tC<=s.t; }
function applyEff(s, eff, log){ const oC=eff.o<0?-eff.o:0,tC=eff.t<0?-eff.t:0;
  if (oC>s.o||tC>s.t){ log.push('   FAIL'); if(eff.g<0)s.g+=eff.g; return; }
  s.g+=eff.g||0;
  let dd = (eff.d||0) + (eff.dPerT? eff.dPerT*s.t : 0);
  s.d=Math.max(0,s.d+dd); s.t=Math.max(0,s.t+(eff.t||0));
  let no=s.o+(eff.o||0);
  if(no>O_CAP){ log.push('   OVERFILL'); no=O_CAP; s.d=Math.max(0,s.d+OVERFILL.d); s.t=Math.max(0,s.t+OVERFILL.t); }
  s.o=Math.max(0,no); }
function run(name, pick){ const s={...START},pending={},log=[]; let broke=0;
  for(let n=1;n<=12;n++){ if(pending[n]) for(const e of pending[n]) applyEff(s,e,log);
    const opt=pick(n,s), eff=NIGHTS[n][opt]; applyEff(s,eff,log);
    if(eff.delayed)(pending[eff.delayed.on]||=[]).push(eff.delayed.eff);
    log.push(`n${n} ${opt}: g${Math.round(s.g)} o${s.o} d${s.d} t${s.t}`);
    if(s.g<0){broke=n;break;} }
  const loy=Math.max(0.3,Math.min(2.0,0.3+s.t/25));
  const cash=Math.max(0.75,Math.min(1.5,0.75+s.g/4000));
  const score=broke?0:Math.round(s.d*loy*cash);
  return {name,broke,s,loy:+loy.toFixed(2),cash:+cash.toFixed(2),score,log}; }
const est = (e,s) => (e.d||0) + (e.dPerT?e.dPerT*s.t:0) + (e.delayed?.eff?.d||0);
const pickBy=(n,s,key)=>{ const o=NIGHTS[n]; let b=null,bv=-Infinity;
  for(const k of ['A','B','C','D']){ const e=o[k]; if(!affordable(s,e))continue;
    const v=key(e,s); if(v>bv){bv=v;b=k;} }
  if(b)return b; for(const k of ['A','B','C','D']) if((o[k].g||0)+s.g>=0) return k; return 'B'; };
const strategies={
  'spam-A':()=>'A','spam-B':()=>'B','spam-C':()=>'C','spam-D':()=>'D',
  'ABCD':(n)=>'ABCD'[(n-1)%4],'ACDC':(n)=>'ACDC'[(n-1)%4],'DCBA':(n)=>'DCBA'[(n-1)%4],
  'greedy-dominion':(n,s)=>pickBy(n,s,(e)=>est(e,s)),
  'follower-heavy':(n,s)=>pickBy(n,s,(e)=>((e.t||0)+(e.delayed?.eff?.t||0))*12 + est(e,s)*0.4),
  'hoard-gold':(n,s)=>pickBy(n,s,(e)=>(e.g||0)),
  'balanced':(n,s)=>{ const o=NIGHTS[n];
    const key=(e)=> est(e,s) + ((e.t||0)+(e.delayed?.eff?.t||0))*10 + (e.g||0)*0.02;
    const safe=k=> affordable(s,o[k]) && (o[k].g||0)+s.g>=90 && s.o+(o[k].o||0)<=O_CAP;
    let b=null,bv=-Infinity; for(const k of ['A','B','C','D']){ if(!safe(k))continue; const v=key(o[k]); if(v>bv){bv=v;b=k;} }
    return b || pickBy(n,s,(e)=>(e.g||0)); },
  'dom-lean':(n,s)=>{ const o=NIGHTS[n];
    const key=(e)=> est(e,s) + ((e.t||0)+(e.delayed?.eff?.t||0))*5;
    const safe=k=> affordable(s,o[k]) && (o[k].g||0)+s.g>=70;
    let b=null,bv=-Infinity; for(const k of ['A','B','C','D']){ if(!safe(k))continue; const v=key(o[k]); if(v>bv){bv=v;b=k;} }
    return b || pickBy(n,s,(e)=>(e.g||0)); },
};
const results=[]; for(const [name,fn] of Object.entries(strategies)) results.push(run(name,fn));
results.sort((a,b)=>b.score-a.score);
console.log('STRATEGY             BROKE   G     O    D     T   loy  cash    SCORE');
for(const r of results) console.log(
  r.name.padEnd(20),(r.broke?'n'+r.broke:' - ').padEnd(5),
  String(Math.round(r.s.g)).padStart(5),String(r.s.o).padStart(4),
  String(r.s.d).padStart(5),String(r.s.t).padStart(4),
  String(r.loy).padStart(5),String(r.cash).padStart(5),String(r.score).padStart(9));
for(const w of ['balanced','dom-lean','follower-heavy','greedy-dominion','hoard-gold']){
  const r=results.find(x=>x.name===w);
  console.log('\n=== '+w+' (score '+r.score+(r.broke?', BROKE n'+r.broke:'')+') ===\n'+r.log.join('\n')); }
