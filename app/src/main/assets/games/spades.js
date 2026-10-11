// NextGen Cable Spades: you and Mitthu against Sheru and Gajju. Bidding with nil, bags, hints, daily goals,
// levels and monthly season badges (kept on the TV). The record sent to the app is the number of matches won.
(function(){
"use strict";
/* ---------- basics ---------- */
const SYM={s:'♠',h:'♥',d:'♦',c:'♣'}, SNAME={s:'spades',h:'hearts',d:'diamonds',c:'clubs'};
const RN=r=>r<=10?String(r):({11:'J',12:'Q',13:'K',14:'A'})[r];
const RFULL=r=>r<=10?String(r):({11:'jack',12:'queen',13:'king',14:'ace'})[r];
const cname=c=>RFULL(c.r)+' of '+SNAME[c.s];
const $=id=>document.getElementById(id);
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const rnd=n=>Math.floor(Math.random()*n);
const partnerOf=p=>(p+2)%4, teamOf=p=>p%2;
const DEFAULT_PROFILE={xp:0,wins:0,losses:0,matches:0,hands:0,nilsMade:0,season:{},goals:null,
  settings:{target:500,diff:'normal',speed:'normal',sound:true,four:true}};
let prof=Object.assign({},DEFAULT_PROFILE,store.get('spades.profile')||{});
prof.settings=Object.assign({},DEFAULT_PROFILE.settings,prof.settings||{});
const saveProf=()=>store.set('spades.profile',prof);

/* ---------- characters (original art) ---------- */
const E='<circle cx="CX" cy="CY" r="5" fill="#21160d"/><circle cx="CXg" cy="CYg" r="1.8" fill="#fff"/>';
const eye=(x,y)=>E.replace('CXg',x+1.6).replace('CYg',y-1.6).replace('CX',x).replace('CY',y);
const ART={
 you:`<ellipse cx="50" cy="57" rx="31" ry="34" fill="#ffb627" transform="rotate(-12 50 57)"/><ellipse cx="38" cy="40" rx="10" ry="6" fill="#ffd978" transform="rotate(-30 38 40)"/>
  <path d="M53 25q3-10 13-13" stroke="#6b4a1f" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M60 16q16-12 28 1q-15 9-28-1z" fill="#3fa34d"/>
  ${eye(40,57)}${eye(62,55)}<circle cx="33" cy="68" r="5" fill="#ff7b5a" opacity=".55"/><circle cx="69" cy="66" r="5" fill="#ff7b5a" opacity=".55"/>
  <path d="M43 70q9 9 18-1" stroke="#21160d" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
 parrot:`<path d="M44 26q0-16 12-18q-3 9 4 15z" fill="#1f7a45"/><circle cx="50" cy="55" r="32" fill="#3cb96b"/><ellipse cx="50" cy="44" rx="22" ry="12" fill="#5fd38a" opacity=".6"/>
  <circle cx="37" cy="48" r="9" fill="#fff"/><circle cx="63" cy="48" r="9" fill="#fff"/>${eye(38,49)}${eye(62,49)}
  <path d="M41 58q9-7 18 0q1 14-9 22q-10-8-9-22z" fill="#ff7a1a"/><path d="M44 66q6 4 12 0q-1 8-6 12q-5-5-6-12z" fill="#c4520c"/>
  <path d="M24 74q26 16 52 0" stroke="#e0303a" stroke-width="5" fill="none" stroke-linecap="round"/>`,
 tiger:`<circle cx="25" cy="30" r="12" fill="#f08a24"/><circle cx="25" cy="30" r="6" fill="#ffd9b0"/><circle cx="75" cy="30" r="12" fill="#f08a24"/><circle cx="75" cy="30" r="6" fill="#ffd9b0"/>
  <circle cx="50" cy="56" r="33" fill="#f08a24"/><ellipse cx="50" cy="71" rx="17" ry="12" fill="#fff3e0"/>
  <path d="M50 25v10M41 27l3 9M59 27l-3 9M18 52h10M19 61h9M82 52H72M81 61h-9" stroke="#21160d" stroke-width="4" stroke-linecap="round"/>
  <path d="M33 50l12 3M67 50l-12 3" stroke="#21160d" stroke-width="3" stroke-linecap="round"/>${eye(40,58)}${eye(60,58)}
  <path d="M45 65h10l-5 6z" fill="#c2185b"/><path d="M50 71q-4 6-9 3M50 71q4 6 9 3" stroke="#21160d" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
 elephant:`<ellipse cx="20" cy="54" rx="17" ry="24" fill="#8d99ae"/><ellipse cx="21" cy="54" rx="10" ry="15" fill="#f4a7b9"/><ellipse cx="80" cy="54" rx="17" ry="24" fill="#8d99ae"/><ellipse cx="79" cy="54" rx="10" ry="15" fill="#f4a7b9"/>
  <circle cx="50" cy="50" r="28" fill="#a8b2c4"/><path d="M42 60q-3 18 6 28q11 5 13-4q-6 0-8-4q-2-8 2-20z" fill="#a8b2c4"/>
  <path d="M38 22l12-9l12 9l-12 7z" fill="#e63946"/><circle cx="50" cy="21" r="3" fill="#f4c04e"/>${eye(40,47)}${eye(60,47)}
  <circle cx="34" cy="58" r="4" fill="#f4a7b9" opacity=".7"/><circle cx="66" cy="58" r="4" fill="#f4a7b9" opacity=".7"/>`,
 fox:`<path d="M20 14l20 24l-24 8z" fill="#e8590c"/><path d="M80 14L60 38l24 8z" fill="#e8590c"/><path d="M24 24l10 13l-12 4z" fill="#3b1d0a"/><path d="M76 24L66 37l12 4z" fill="#3b1d0a"/>
  <path d="M15 40q35-16 70 0q-6 36-35 50q-29-14-35-50z" fill="#f76707"/><path d="M22 50q16 8 28 34q-22-8-28-34zM78 50q-16 8-28 34q22-8 28-34z" fill="#fff4e6"/>
  <path d="M32 52q7-5 13 0M55 52q6-5 13 0" stroke="#21160d" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="50" cy="80" r="5" fill="#21160d"/>`,
 falcon:`<circle cx="50" cy="52" r="33" fill="#7b4a22"/><path d="M20 40q10-22 30-24q20 2 30 24q-14-8-30-8q-16 0-30 8z" fill="#5b3418"/><ellipse cx="50" cy="61" rx="21" ry="23" fill="#ecc89e"/>
  <circle cx="38" cy="50" r="8" fill="#f4c04e"/><circle cx="62" cy="50" r="8" fill="#f4c04e"/>${eye(38,51)}${eye(62,51)}
  <path d="M28 41l17 7M72 41l-17 7" stroke="#2b170a" stroke-width="5" stroke-linecap="round"/>
  <path d="M42 60q8-5 16 0q0 11-8 19q-2-9-8-19z" fill="#f4b400"/><path d="M50 79q-1-6-3-9" stroke="#8a5c0d" stroke-width="2"/>`
};
const avatar=k=>`<svg viewBox="0 0 100 100"><g transform="translate(5 7) scale(.9)">${ART[k]}</g><ellipse cx="38" cy="26" rx="24" ry="13" fill="#fff" opacity=".16"/></svg>`;
const CAST=[{name:'You',kind:'you'},{name:'Sheru',kind:'tiger'},{name:'Mitthu',kind:'parrot'},{name:'Gajju',kind:'elephant'}];
const SPECIAL={1:{name:'Chalak',kind:'fox'},3:{name:'Baaz',kind:'falcon'}};
const who=p=>(m&&m.special&&SPECIAL[p])||CAST[p];

/* ---------- tiers, levels, goals ---------- */
const TIERS=[{n:'Bronze',p:0,c:'#c07a3e',d:'#7a4419'},{n:'Silver',p:300,c:'#c9d2db',d:'#6b7885'},{n:'Gold',p:800,c:'#f4c04e',d:'#9a6b0f'},
  {n:'Platinum',p:1600,c:'#72d6c9',d:'#1f7a70'},{n:'Diamond',p:3000,c:'#8fb4ff',d:'#2f4fa8'},{n:'Champion',p:5000,c:'#d58cff',d:'#6d2a99'}];
const tierOf=pts=>{let t=0;TIERS.forEach((x,i)=>{if(pts>=x.p)t=i});return t};
const monthKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
const seasonPts=()=>prof.season[monthKey()]||0;
function shield(t,label,empty){
  const T=TIERS[t]||TIERS[0], c=empty?'#b9b2a4':T.c, d=empty?'#8c8578':T.d;
  return `<svg viewBox="0 0 90 100"><path d="M45 4l36 11v28c0 26-17 42-36 51C26 85 9 69 9 43V15z" fill="${d}"/><path d="M45 11l29 9v23c0 21-13 34-29 42C29 77 16 64 16 43V20z" fill="${c}"/>
  ${empty?'':`<path d="M45 26c-6 9-15 11-15 20c0 7 8 9 13 4c-1 5-3 8-6 10h16c-3-2-5-5-6-10c5 5 13 3 13-4c0-9-9-11-15-20z" fill="${d}"/>`}
  ${label?`<rect x="8" y="76" width="74" height="18" rx="5" fill="#a3324a"/><text x="45" y="90" text-anchor="middle" font-family="Outfit,sans-serif" font-weight="800" font-size="14" fill="#fff">${label}</text>`:''}</svg>`;
}
function levelInfo(xp){let l=1,need=100;while(xp>=need){xp-=need;l++;need=100+(l-1)*50}return{l,cur:xp,need}}
const GOAL_POOL=[{id:'win',t:'Win a match',n:1,xp:60},{id:'make',t:"Make your team's bid 3 times",n:3,xp:40},{id:'nil',t:'Make a nil bid (you or your partner)',n:1,xp:50},
  {id:'tricks',t:'Take 15 tricks yourself',n:15,xp:40},{id:'set',t:'Set the other team twice',n:2,xp:40},{id:'hands',t:'Play 6 hands',n:6,xp:30},{id:'aceS',t:'Win a trick with the ace of spades',n:1,xp:30},{id:'cut',t:'Trump 5 tricks with a spade',n:5,xp:35}];
function todayGoals(){
  const day=new Date().toDateString();
  if(!prof.goals||prof.goals.day!==day){
    let seed=[...day].reduce((a,ch)=>a*31+ch.charCodeAt(0)>>>0,7);const pool=GOAL_POOL.slice(),pick=[];
    while(pick.length<3){seed=(seed*1103515245+12345)>>>0;pick.push(pool.splice(seed%pool.length,1)[0])}
    prof.goals={day,list:pick.map(g=>({id:g.id,have:0,done:false}))};saveProf();
  }
  return prof.goals;
}
function goal(id,amt=1){
  const g=todayGoals();g.list.forEach(x=>{if(x.id!==id||x.done)return;const def=GOAL_POOL.find(d=>d.id===id);x.have=Math.min(def.n,x.have+amt);
    if(x.have>=def.n){x.done=true;addXP(def.xp);toast('Goal done: '+def.t+'  +'+def.xp+' XP');}});saveProf();renderSide();
}
function addXP(n){const before=levelInfo(prof.xp).l;prof.xp+=n;const after=levelInfo(prof.xp).l;if(after>before)setTimeout(()=>toast('Level up! You are now level '+after),900);}
function addSeason(n){const k=monthKey();prof.season[k]=Math.max(0,(prof.season[k]||0)+n);}

/* ---------- sound effects (no music) ---------- */
let ac=null;
function sfx(kind){
  if(!prof.settings.sound)return;
  try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
  const t=ac.currentTime;
  const tone=(f,dt,dur,type='triangle',vol=.12)=>{const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(vol,t+dt);g.gain.exponentialRampToValueAtTime(.001,t+dt+dur);o.connect(g).connect(ac.destination);o.start(t+dt);o.stop(t+dt+dur+.02)};
  if(kind==='card'){const b=ac.createBuffer(1,ac.sampleRate*.06,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);
    const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();f.type='bandpass';f.frequency.value=2400;g.gain.value=.5;s.buffer=b;s.connect(f).connect(g).connect(ac.destination);s.start(t);}
  if(kind==='win'){tone(660,0,.12);tone(880,.09,.18)}
  if(kind==='lose'){tone(330,0,.15,'sine',.08)}
  if(kind==='bid'){tone(520,0,.1,'sine',.09)}
  if(kind==='cheer'){[523,659,784,1046].forEach((f,i)=>tone(f,i*.1,.25))}
  if(kind==='set'){tone(392,0,.2,'sawtooth',.05);tone(294,.15,.3,'sawtooth',.05)}
}

/* ---------- game state ---------- */
let m=null;   // match
let h=null;   // current hand
let busy=false, timer=null;
const SPEED=()=>window.__fast?0.05:(prof.settings.speed==='fast'?.55:1);
function newDeck(){const d=[];'shdc'.split('').forEach(s=>{for(let r=2;r<=14;r++)d.push({s,r,id:s+r})});for(let i=d.length-1;i>0;i--){const j=rnd(i+1);[d[i],d[j]]=[d[j],d[i]]}return d}
const ORDER={s:0,h:1,c:2,d:3};
const sortHand=a=>a.sort((x,y)=>ORDER[x.s]-ORDER[y.s]||x.r-y.r);
function save(){store.set('spades.match',{m,h})}

function newMatch(){
  clearTimeout(timer);busy=false;prof.matches++;saveProf();
  m={no:prof.matches,special:prof.matches%4===0,scores:[0,0],bags:[0,0],dealer:rnd(4),handNo:0,target:prof.settings.target,over:false,
     diff:prof.matches%4===0?'hard':prof.settings.diff,lv:[0,0,0,0]};
  const myL=levelInfo(prof.xp).l;m.lv=[myL,Math.max(1,myL+rnd(5)-1+(m.special?4:0)),Math.max(1,myL+rnd(3)),Math.max(1,myL+rnd(5)-1+(m.special?4:0))];
  h=null;save();clearTrick();renderAll();showVS();
}
function dealHand(){
  m.handNo++;m.dealer=(m.dealer+1)%4;
  const d=newDeck();
  h={hands:[[],[],[],[]],bids:[null,null,null,null],tricks:[0,0,0,0],trick:[],played:[],broken:false,phase:'bid',turn:(m.dealer+1)%4,leader:(m.dealer+1)%4,last:null};
  d.forEach((c,i)=>h.hands[i%4].push(c));h.hands.forEach(sortHand);
  save();clearTrick();dealAnim();renderAll();sfx('card');
  // a computer player with a strong hand says so
  for(let p=1;p<4;p++)if(estimate(h.hands[p]).t>=5.5&&Math.random()<.6){say(p,['Strong cards!','Ooh, nice hand','Let\'s go!'][rnd(3)]);break}
  later(step,600);
}
function later(fn,ms){clearTimeout(timer);timer=setTimeout(fn,ms*SPEED())}

function step(){
  if(!h||m.over)return;
  renderAll();
  if(h.phase==='bid'){
    if(h.turn===0){if(window.__auto){later(()=>placeBid(0,suggestBid(0).bid),100)}else showBid()}
    else later(()=>placeBid(h.turn,suggestBid(h.turn).bid),700);
  }else if(h.phase==='play'){
    if(h.turn===0){if(window.__auto)later(()=>play(0,choose(0,'hard').c),100);else focusHand()}
    else later(()=>play(h.turn,choose(h.turn,m.diff).c),720);
  }
}

/* ---------- bidding ---------- */
function bySuit(hand){const o={s:[],h:[],d:[],c:[]};hand.forEach(c=>o[c.s].push(c));Object.values(o).forEach(a=>a.sort((x,y)=>y.r-x.r));return o}
function estimate(hand){
  const S=bySuit(hand);let t=0;const why=[];
  for(const s of 'hdc'){const a=S[s],n=a.length,has=r=>a.some(c=>c.r===r);
    if(has(14)){const v=n>=7?.6:1;t+=v;why.push('A'+SYM[s])}
    if(has(13)){const v=n>=2?(has(14)?.9:.7):.2;if(n<=6){t+=v;if(v>.5)why.push('K'+SYM[s])}}
    if(has(12)&&n>=3&&n<=5&&(has(14)||has(13))){t+=.4}
  }
  const sp=S.s,ns=sp.length;let spT=0;
  sp.forEach((c,i)=>{ if(c.r===14)spT+=1; else if(c.r===13)spT+=ns>=2?1:.6; else if(c.r===12)spT+=ns>=3?.9:.4; else if(c.r===11)spT+=ns>=4?.6:.2;});
  spT+=Math.max(0,ns-4)*.9; t+=spT; if(ns)why.push(ns+' spade'+(ns>1?'s':''));
  let spare=Math.max(0,ns-Math.round(spT));
  for(const s of 'hdc'){const n=S[s].length;if(n===0&&spare>=1){const v=Math.min(2,spare)*.8;t+=v;spare-=2;why.push('no '+SNAME[s])}else if(n===1&&spare>=1){t+=.5;spare-=1}}
  return{t,why};
}
function canNil(hand){
  const S=bySuit(hand);if(S.s.length>3||S.s.some(c=>c.r>=11))return false;
  if(hand.some(c=>c.r===14))return false;
  for(const s of 'hdc'){const a=S[s],low=a.filter(c=>c.r<=7).length;if(a.some(c=>c.r>=12)&&low<2)return false}
  return estimate(hand).t<2;
}
function suggestBid(p){
  const hand=h.hands[p],e=estimate(hand),part=h.bids[partnerOf(p)];
  if(part!==0&&canNil(hand)&&(part===null||part>=3))return{bid:0,why:'Your cards are low with no high spades. Try nil: win no tricks for 100 points.'};
  let b=Math.round(e.t+(m.diff==='easy'&&p!==0?(Math.random()-.5)*1.4:0));
  b=Math.max(1,Math.min(13,b));
  if(part!==null&&part+b>13)b=Math.max(1,13-part);
  if(part===0)b=Math.min(13,b+1);
  return{bid:b,why:`You hold about ${e.t.toFixed(1)} sure tricks${e.why.length?' ('+e.why.join(', ')+')':''}.${part===0?' Your partner bid nil, so take one more to cover them.':''}`};
}
function placeBid(p,b){
  h.bids[p]=b;sfx('bid');say(p,b===0?'Nil!':'Bid '+b);
  h.turn=(p+1)%4;
  if(h.bids.every(x=>x!==null)){h.phase='play';h.turn=h.leader=(m.dealer+1)%4;
    if(teamBid(0)+teamBid(1)>=13&&Math.random()<.7)say(2,'Big round!');}
  save();renderAll();later(step,h.phase==='play'?900:500);
}
const teamBid=t=>[t,t+2].reduce((a,p)=>a+(h.bids[p]>0?h.bids[p]:0),0);
const teamWon=t=>[t,t+2].reduce((a,p)=>a+(h.bids[p]>0||h.bids[p]===null?h.tricks[p]:0),0);
const teamNeed=t=>teamBid(t)-teamWon(t);

/* ---------- play ---------- */
function legal(p){
  const hand=h.hands[p];
  if(!h.trick.length){if(!h.broken){const non=hand.filter(c=>c.s!=='s');if(non.length)return non}return hand}
  const L=h.trick[0].c.s,f=hand.filter(c=>c.s===L);return f.length?f:hand;
}
const beats=(a,b)=>a.s===b.s?a.r>b.r:a.s==='s';
function winning(tr){let w=tr[0];for(const x of tr)if(beats(x.c,w.c))w=x;return w}
function isTop(c,p){for(let r=c.r+1;r<=14;r++){const id=c.s+r;if(!h.played.includes(id)&&!h.hands[p].some(x=>x.id===id))return false}return true}
const lo=a=>a.slice().sort((x,y)=>(x.s==='s')-(y.s==='s')||x.r-y.r)[0];
const hi=a=>a.slice().sort((x,y)=>(y.s==='s')-(x.s==='s')||y.r-x.r)[0];
const byR=(a,dir=1)=>a.slice().sort((x,y)=>dir*(x.r-y.r));
function discard(lg,p,dumpHigh){
  const non=lg.filter(c=>c.s!=='s');if(!non.length)return byR(lg)[0];
  if(dumpHigh)return byR(non,-1)[0];
  const cnt={};h.hands[p].forEach(c=>cnt[c.s]=(cnt[c.s]||0)+1);
  return non.slice().sort((a,b)=>cnt[a.s]-cnt[b.s]||a.r-b.r)[0];
}
function choose(p,diff){
  const lg=legal(p);
  if(lg.length===1)return{c:lg[0],why:'This is the only card you can play.'};
  if(diff==='easy'&&Math.random()<.28)return{c:lg[rnd(lg.length)],why:''};
  if(diff==='normal'&&Math.random()<.05)return{c:lg[rnd(lg.length)],why:''};
  const part=partnerOf(p),team=teamOf(p),need=teamNeed(team);
  const opps=[(p+1)%4,(p+3)%4],oppNil=opps.filter(q=>h.bids[q]===0&&h.tricks[q]===0);
  const partNil=h.bids[part]===0&&h.tricks[part]===0;
  const leading=!h.trick.length;
  // nil bidder
  if(h.bids[p]===0&&h.tricks[p]===0){
    if(leading){const pool=lg.filter(c=>c.s!=='s');return{c:byR(pool.length?pool:lg)[0],why:'You bid nil, so lead your lowest card.'}}
    const cur=winning(h.trick).c,losers=lg.filter(c=>!beats(c,cur));
    if(losers.length)return{c:hi(losers),why:'You bid nil: get rid of your highest card that still loses this trick.'};
    return h.trick.length===3?{c:hi(lg),why:'You must win this one. Use your highest card.'}:{c:lo(lg),why:'Play low and hope someone plays higher.'};
  }
  if(leading){
    const tops=lg.filter(c=>isTop(c,p)),nsTops=tops.filter(c=>c.s!=='s'),spTops=tops.filter(c=>c.s==='s');
    if(partNil){const t=nsTops[0]||spTops[0];if(t)return{c:t,why:'Your partner bid nil. Lead a sure winner so they can play under it.'};
      const pool=lg.filter(c=>c.s!=='s');return{c:hi(pool.length?pool:lg),why:'Lead high to help your nil partner.'}}
    if(oppNil.length){const pool=lg.filter(c=>c.s!=='s');return{c:byR(pool.length?pool:lg)[0],why:'An opponent bid nil. Lead low to make them win a trick.'}}
    if(need>0){
      if(nsTops.length)return{c:byR(nsTops,-1)[0],why:`Your ${cname(byR(nsTops,-1)[0])} is the highest left in that suit. Cash it.`};
      const ns=h.hands[p].filter(c=>c.s==='s').length;
      if(spTops.length&&ns>=3)return{c:byR(spTops,-1)[0],why:'Lead your top spade to pull out their spades.'};
    }
    const pool=lg.filter(c=>c.s!=='s'),use=pool.length?pool:lg,cnt={};use.forEach(c=>cnt[c.s]=(cnt[c.s]||0)+1);
    const c=use.slice().sort((a,b)=>cnt[b.s]-cnt[a.s]||a.r-b.r)[0];
    return{c,why:need<=0?'Your team already has its bid. Lead low to avoid bags.':'Lead low from your longest suit and save your winners.'};
  }
  const L=h.trick[0].c.s,curE=winning(h.trick),cur=curE.c,pos=h.trick.length,last=pos===3;
  const following=lg[0].s===L&&h.hands[p].some(c=>c.s===L);
  const winners=lg.filter(c=>beats(c,cur)),losers=lg.filter(c=>!beats(c,cur));
  if(oppNil.includes(curE.p)&&losers.length)return{c:hi(losers),why:'Their nil bidder is winning. Stay under them.'};
  if(partNil){
    if(curE.p===part||!h.trick.some(x=>x.p===part)){
      if(winners.length)return{c:last?byR(winners)[0]:hi(winners),why:'Cover your nil partner: win this trick for them.'};
    }else if(curE.p!==part){return{c:following?byR(lg)[0]:discard(lg,p),why:'Your nil partner is safe on this trick. Play low.'}}
  }
  if(curE.p===part){
    const safe=last||isTop(cur,p)||(cur.s==='s'&&L!=='s'&&pos===2);
    if(safe||!winners.length)return{c:following?byR(lg)[0]:discard(lg,p),why:'Your partner is winning this trick. Play low.'};
  }
  if(need<=0&&!oppNil.length){
    if(losers.length)return{c:following?hi(losers):discard(losers,p,true),why:'Your team already made its bid. Duck this trick to avoid bags.'};
    return{c:lo(lg),why:'You have to win this one. Use your smallest card.'};
  }
  if(winners.length){
    if(following){
      if(last)return{c:byR(winners)[0],why:'You play last: win with the smallest card that is enough.'};
      const topW=winners.filter(c=>isTop(c,p));
      if(topW.length)return{c:byR(topW)[0],why:'Your card is the highest one left in this suit. Take the trick.'};
      if(pos===1)return{c:byR(lg)[0],why:'You play second: keep your high cards and play low.'};
      return{c:byR(winners,-1)[0],why:'Third to play: go high to beat the last player.'};
    }
    return{c:byR(winners)[0],why:`You have no ${SNAME[L]}. Trump it with a small spade.`};
  }
  return{c:following?byR(lg)[0]:discard(lg,p),why:"You can't win this trick, so throw your lowest card."};
}

function play(p,c){
  if(!h||h.phase!=='play'||h.turn!==p||busy)return;
  if(!legal(p).some(x=>x.id===c.id))return;
  h.hands[p]=h.hands[p].filter(x=>x.id!==c.id);h.played.push(c.id);
  if(c.s==='s')h.broken=true;
  h.trick.push({p,c});flyIn(p,c);sfx('card');
  h.turn=(p+1)%4;save();renderAll();
  if(h.trick.length===4){busy=true;later(finishTrick,950)}else later(step,250);
}
function finishTrick(){
  const tr=h.trick,w=winning(tr);h.tricks[w.p]++;h.last=tr.map(x=>x.c.id);
  if(w.p===0){goal('tricks');if(w.c.id==='s14')goal('aceS');if(w.c.s==='s'&&tr[0].c.s!=='s')goal('cut')}
  if(w.c.s==='s'&&tr[0].c.s!=='s'&&w.p!==0&&Math.random()<.35)say(w.p,['Cut!','Trumped!','Mine!'][rnd(3)]);
  else if(w.p===0&&Math.random()<.22)say(2,['Shabash!','Well played!','Nice one!'][rnd(3)]);
  if(h.bids[w.p]===0&&h.tricks[w.p]===1)say(teamOf(w.p)===0?1:2,'Nil broken!');
  teamOf(w.p)===0?sfx('win'):sfx('lose');
  collect(w.p);h.trick=[];h.turn=h.leader=w.p;busy=false;save();
  if(!h.hands[0].length)later(endHand,700);else later(step,450);
}

/* ---------- scoring ---------- */
function scoreTeam(t){
  const lines=[];let pts=0,bags=0;const bid=teamBid(t),won=teamWon(t),nils=[t,t+2].filter(p=>h.bids[p]===0);
  if(bid>0){if(won>=bid){pts+=10*bid+(won-bid);bags+=won-bid;lines.push(`Made bid ${bid} with ${won}: +${10*bid}`+(won>bid?`, ${won-bid} bag${won-bid>1?'s':''} +${won-bid}`:''));}
    else{pts-=10*bid;lines.push(`Missed bid ${bid} (took ${won}): −${10*bid}`)}}
  nils.forEach(p=>{if(h.tricks[p]===0){pts+=100;lines.push(`${who(p).name}'s nil made: +100`)}else{pts-=100;bags+=h.tricks[p];lines.push(`${who(p).name}'s nil broken: −100`)}});
  let nb=m.bags[t]+bags,pen=0;while(nb>=10){nb-=10;pen+=100}
  if(pen){pts-=pen;lines.push(`10 bags reached: −${pen}`)}
  return{bid,won,pts,bags,newBags:nb,lines,made:bid>0&&won>=bid,set:bid>0&&won<bid,nilMade:nils.filter(p=>h.tricks[p]===0).length};
}
function endHand(){
  const r=[scoreTeam(0),scoreTeam(1)];
  r.forEach((x,t)=>{m.scores[t]+=x.pts;m.bags[t]=x.newBags});
  h.phase='done';prof.hands++;goal('hands');
  if(r[0].made)goal('make');if(r[1].set)goal('set');if(r[0].nilMade)goal('nil',r[0].nilMade);
  let sp=(r[0].made?10:0)+(r[1].set?10:0)+r[0].nilMade*25;addSeason(sp);addXP(r[0].made?8:3);
  if(r[0].nilMade){prof.nilsMade+=r[0].nilMade}
  saveProf();
  const [a,b]=m.scores,T=m.target;let winner=null;
  if((a>=T||b>=T)&&a!==b)winner=a>b?0:1;
  if(a<=-200)winner=1;if(b<=-200)winner=0;
  if(winner!==null)m.over=true;
  save();renderAll();
  r[0].made&&!r[1].made?sfx('cheer'):r[0].set?sfx('set'):sfx('win');
  showSummary(r,winner);
}
function endMatch(winner){
  const won=winner===0,tierBefore=tierOf(seasonPts()),lvlBefore=levelInfo(prof.xp).l;
  let xp=won?(m.special?120:80):25,pts=won?(m.special?150:100):25;
  if(won){prof.wins++;goal('win')}else prof.losses++;
  addXP(xp);addSeason(pts);saveProf();store.del('spades.match');
  record(prof.wins);const tierAfter=tierOf(seasonPts()),L=levelInfo(prof.xp);
  return{won,xp,pts,promoted:tierAfter>tierBefore?TIERS[tierAfter].n:null,levelUp:L.l>lvlBefore?L.l:null};
}

/* ---------- rendering ---------- */
const SEATPOS=[{x:900,y:470},{x:262,y:268},{x:640,y:76},{x:1018,y:268}];
const AVC=[{x:900,y:497},{x:262,y:303},{x:640,y:111},{x:1018,y:303}];
const SLOT=[{x:640,y:418},{x:530,y:332},{x:640,y:262},{x:750,y:332}];
const FROM=[{x:640,y:640},{x:262,y:303},{x:640,y:111},{x:1018,y:303}];
const SUITPATH={
  s:'M50 4C36 28 6 40 6 63c0 16 17 25 32 16 3-2 5-4 7-7-1 12-5 19-13 24h36c-8-5-12-12-13-24 2 3 4 5 7 7 15 9 32 0 32-16C94 40 64 28 50 4z',
  h:'M50 93C20 70 4 52 4 31 4 16 15 5 29 5c10 0 17 6 21 14 4-8 11-14 21-14 14 0 25 11 25 26 0 21-16 39-46 62z',
  d:'M50 2c9 16 23 32 40 48-17 16-31 32-40 48C41 82 27 66 10 50 27 34 41 18 50 2z',
  c:'M50 6a21 21 0 0 0-17 33 21 21 0 1 0 12 32c-1 11-5 18-13 23h36c-8-5-12-12-13-23a21 21 0 1 0 12-32A21 21 0 0 0 50 6z'};
const SUITHEX=s=>prof.settings.four?{s:'#171b26',h:'#d61f3c',d:'#1d5fd6',c:'#0f8a45'}[s]:(s==='h'||s==='d'?'#d61f3c':'#171b26');
const suitSVG=(s,col,extra='')=>`<svg viewBox="0 0 100 100" ${extra}><path d="${SUITPATH[s]}" fill="${col}"/></svg>`;
const PIPS={2:[[.5,0],[.5,1]],3:[[.5,0],[.5,.5],[.5,1]],4:[[0,0],[1,0],[0,1],[1,1]],5:[[0,0],[1,0],[.5,.5],[0,1],[1,1]],
  6:[[0,0],[1,0],[0,.5],[1,.5],[0,1],[1,1]],7:[[0,0],[1,0],[.5,.25],[0,.5],[1,.5],[0,1],[1,1]],
  8:[[0,0],[1,0],[.5,.25],[0,.5],[1,.5],[.5,.75],[0,1],[1,1]],9:[[0,0],[1,0],[0,1/3],[1,1/3],[.5,.5],[0,2/3],[1,2/3],[0,1],[1,1]],
  10:[[0,0],[1,0],[.5,1/6],[0,1/3],[1,1/3],[0,2/3],[1,2/3],[.5,5/6],[0,1],[1,1]]};
function court(c,col){
  const skin='#f3cba5',gold='#e3ad3c',goldD='#9a6a14',dark='#2a1a10';
  let f=`<rect x="3" y="3" width="54" height="47" fill="${col}" opacity=".07"/>`;
  if(c.r===12)f+=`<path d="M20 25Q19 11 30 11T40 25q2 10-3 12l-1-12q-6-7-12 0l-1 12q-5-2-3-12z" fill="#3b2414"/>`;
  f+=`<path d="M5 50C7 41 13 36 22 34h16c9 2 15 7 17 16z" fill="${col}"/>
    <path d="M22 34l8 16 8-16" fill="none" stroke="${gold}" stroke-width="1.6"/><path d="M11 44h38" stroke="${gold}" stroke-width="1" stroke-dasharray="1.5 2.2" opacity=".9"/>
    <path d="M22 34q8 6 16 0" fill="#fff" stroke="${gold}" stroke-width="1"/><rect x="27" y="29" width="6" height="6" fill="${skin}"/>
    <ellipse cx="30" cy="23" rx="7.5" ry="8.5" fill="${skin}"/><circle cx="27.3" cy="22" r=".95" fill="${dark}"/><circle cx="32.7" cy="22" r=".95" fill="${dark}"/>
    <path d="M28 27q2 1.4 4 0" stroke="#a0402c" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
  if(c.r===13)f+=`<path d="M22.5 24q.5 10 7.5 11 7-1 7.5-11-2.5 6-7.5 6t-7.5-6z" fill="#6b4a2a"/><path d="M26 26.5q4-2 8 0" stroke="#6b4a2a" stroke-width="1.6" fill="none"/>
    <path d="M21 15l1-8 4 4 4-6 4 6 4-4 1 8z" fill="${gold}" stroke="${goldD}" stroke-width=".6"/><circle cx="30" cy="9" r="1.3" fill="#d61f3c"/><circle cx="24" cy="12.5" r="1" fill="#1d5fd6"/><circle cx="36" cy="12.5" r="1" fill="#1d5fd6"/>
    <rect x="50" y="6" width="2.4" height="30" rx="1" fill="#dfe6ee" stroke="#8792a0" stroke-width=".4"/><rect x="46.5" y="34" width="9.4" height="2.4" rx="1" fill="${gold}"/><rect x="50.2" y="36" width="2" height="6" fill="${goldD}"/>`;
  if(c.r===12)f+=`<path d="M23 14l3-5 4 3 4-3 3 5z" fill="${gold}" stroke="${goldD}" stroke-width=".5"/><circle cx="30" cy="11" r="1.1" fill="#d61f3c"/>
    <path d="M12 46q1-8 1-14" stroke="#2f7d32" stroke-width="1.2" fill="none"/><g fill="${col}"><circle cx="13" cy="29" r="2.6"/><circle cx="9.8" cy="31.5" r="2.6"/><circle cx="16.2" cy="31.5" r="2.6"/><circle cx="11" cy="35" r="2.6"/><circle cx="15" cy="35" r="2.6"/></g><circle cx="13" cy="32.5" r="1.8" fill="${gold}"/>`;
  if(c.r===11)f+=`<path d="M22 22q0-9 8-9t8 9q-2-5-8-5t-8 5z" fill="${dark}"/><path d="M20 16q10-13 20 0z" fill="${col}"/><path d="M20 16h20" stroke="${gold}" stroke-width="1.6"/>
    <path d="M38 13q9-10 14-6-6 2-12 8z" fill="#fff" stroke="${gold}" stroke-width=".6"/>
    <rect x="9" y="12" width="2" height="34" rx="1" fill="${goldD}"/><path d="M10 5l3 6h-6z" fill="#dfe6ee" stroke="#8792a0" stroke-width=".4"/>`;
  f+=`<g transform="translate(5 5) scale(.1)"><path d="${SUITPATH[c.s]}" fill="${col}"/></g>`;
  return `<svg viewBox="0 0 60 100"><rect x=".8" y=".8" width="58.4" height="98.4" rx="3" fill="#fffdf8" stroke="${col}" stroke-width="1.6"/>
    <g>${f}</g><g transform="rotate(180 30 50)">${f}</g><path d="M3 50h54" stroke="${col}" stroke-width=".7" opacity=".6"/>
    <rect x="3" y="3" width="54" height="94" rx="2" fill="none" stroke="${gold}" stroke-width=".7" opacity=".8"/></svg>`;
}
function cardHTML(c,extra=''){
  const col=SUITHEX(c.s),idx=`${RN(c.r)}${suitSVG(c.s,col)}`;
  let mid;
  if(c.r===14){const big=c.s==='s'?74:50;
    mid=`<div class="acepip">${c.s==='s'?`<svg viewBox="0 0 100 100" width="${big}" height="${big}"><circle cx="50" cy="50" r="47" fill="none" stroke="#c99a2e" stroke-width="2.5"/><circle cx="50" cy="50" r="42" fill="none" stroke="#c99a2e" stroke-width="1" stroke-dasharray="2 3"/><g transform="translate(18 16) scale(.64)"><path d="${SUITPATH.s}" fill="${col}"/></g><text x="50" y="92" text-anchor="middle" font-family="Outfit,sans-serif" font-weight="700" font-size="7.5" letter-spacing="1.5" fill="#9a6a14">CABLE TV</text></svg>`:suitSVG(c.s,col,`width="${big}" height="${big}"`)}</div>`;}
  else if(c.r>=11)mid=`<div class="court">${court(c,col)}</div>`;
  else mid=`<div class="pips">${PIPS[c.r].map(([x,y])=>suitSVG(c.s,col,`class="${y>.5?'f':''}" style="left:${x*100}%;top:${y*100}%"`)).join('')}</div>`;
  return `<div class="card ${extra}" data-id="${c.id}" style="--c:${col}"><div class="idx">${idx}</div>${mid}<div class="idx b">${idx}</div></div>`;
}
/* textures drawn once: felt grain, wood grain and the card back */
(function textures(){
  const st=$('stage').style;
  try{const n=document.createElement('canvas');n.width=n.height=180;const g=n.getContext('2d'),d=g.createImageData(180,180);
    for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255|0;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=Math.random()*22|0}
    g.putImageData(d,0,0);st.setProperty('--noise',`url(${n.toDataURL()})`);
    const w=document.createElement('canvas');w.width=1280;w.height=720;const x=w.getContext('2d');
    const bg=x.createLinearGradient(0,0,0,720);bg.addColorStop(0,'#4a2a14');bg.addColorStop(.5,'#3a200f');bg.addColorStop(1,'#2a170a');x.fillStyle=bg;x.fillRect(0,0,1280,720);
    for(let i=0;i<260;i++){const y0=Math.random()*720,a=Math.random()*.09+.02,amp=Math.random()*14+3,fr=Math.random()*.01+.002,ph=Math.random()*6;
      x.strokeStyle=Math.random()<.5?`rgba(0,0,0,${a})`:`rgba(255,200,140,${a*.6})`;x.lineWidth=Math.random()*2.2+.4;x.beginPath();
      for(let X=0;X<=1280;X+=16){const Y=y0+Math.sin(X*fr+ph)*amp+Math.sin(X*fr*3.1)*amp*.25;X?x.lineTo(X,Y):x.moveTo(X,Y)}x.stroke()}
    for(let i=0;i<5;i++){x.fillStyle='rgba(20,10,4,.25)';x.beginPath();x.ellipse(Math.random()*1280,Math.random()*720,18+Math.random()*20,6+Math.random()*5,0,0,7);x.fill()}
    st.setProperty('--woodtex',`url(${w.toDataURL('image/jpeg',.85)})`);
  }catch(e){}
  const back=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 150"><defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#132a52"/><path d="M0 5h10M5 0v10" stroke="#c99a2e" stroke-width=".5" opacity=".5"/><circle cx="5" cy="5" r="1.4" fill="#e3ad3c" opacity=".75"/></pattern><radialGradient id="r" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="104" height="150" rx="9" fill="#fbf8f1"/><rect x="5" y="5" width="94" height="140" rx="6" fill="url(#p)"/><rect x="5" y="5" width="94" height="140" rx="6" fill="url(#r)"/>
    <rect x="5" y="5" width="94" height="140" rx="6" fill="none" stroke="#e3ad3c" stroke-width="1.4"/><rect x="9.5" y="9.5" width="85" height="131" rx="4" fill="none" stroke="#e3ad3c" stroke-width=".6" opacity=".7"/>
    <circle cx="52" cy="75" r="23" fill="#0c1c3a" stroke="#e3ad3c" stroke-width="1.6"/><circle cx="52" cy="75" r="19" fill="none" stroke="#e3ad3c" stroke-width=".6" stroke-dasharray="1.5 2"/>
    <g transform="translate(38 61) scale(.28)"><path d="${SUITPATH.s}" fill="#e3ad3c"/></g></svg>`;
  st.setProperty('--back',`url("data:image/svg+xml,${encodeURIComponent(back)}")`);
})();
function renderSeats(){
  let s='';
  for(let p=0;p<4;p++){
    const P=SEATPOS[p],w=who(p),bid=h?h.bids[p]:null,tk=h?h.tricks[p]:0,n=h?h.hands[p].length:0;
    const turn=h&&(h.phase==='bid'||h.phase==='play')&&h.turn===p&&!busy;
    const bidTxt=bid===null?'–':bid===0?'Nil':bid,made=bid>0&&tk>=bid;
    const k=Math.min(n,7),fan=Array.from({length:k},(_,i)=>`<i style="transform:rotate(${(i-(k-1)/2)*9}deg)"></i>`).join('');
    s+=`<div class="seat team${teamOf(p)} ${turn?'turn':''}" style="left:${P.x}px;top:${p===0?430:P.y-40}px">
      ${p===0?'':`<div class="fan">${fan}</div>`}
      <div class="av"><div class="ring"></div><div class="face">${avatar(w.kind)}</div></div>
      <div class="plate"><span>${p===0?'You':w.name}</span><span class="bw ${made?'made':''}"><b>${tk}</b> / ${bidTxt}</span></div></div>`;
  }
  $('seats').innerHTML=s;
}
function renderBoxes(){
  [[0,'tUs','dUs','boxUs'],[1,'tThem','dThem','boxThem']].forEach(([t,a,d,b])=>{
    if(!h){$(a).innerHTML='–';$(d).innerHTML='';return}
    if(h.phase==='bid'){$(a).innerHTML='Bidding';$(d).innerHTML='';$(b).classList.remove('made');return}
    const won=teamWon(t),bid=teamBid(t),nil=[t,t+2].some(p=>h.bids[p]===0);
    $(a).innerHTML=`${won} / ${bid}${nil?'<small>+ nil</small>':''}`;
    $(d).innerHTML=Array.from({length:Math.max(bid,won)},(_,i)=>`<i class="${i<won?(i>=bid?'over':'on'):''}"></i>`).join('');
    $(b).classList.toggle('made',bid>0&&won>=bid);
  });
}
let dealing=false;
function renderHand(){
  const el=$('hand'),hand=h?h.hands[0]:[];const focusId=document.activeElement&&document.activeElement.dataset?document.activeElement.dataset.id:null;
  const my=h&&h.phase==='play'&&h.turn===0&&!busy;const ok=my?new Set(legal(0).map(c=>c.id)):null;
  const n=hand.length,W=104,avail=860,stepX=n>1?Math.min(66,(avail-W)/(n-1)):0,start=640-(W+stepX*(n-1))/2;
  el.className=my?'myturn':'';
  el.innerHTML=hand.map((c,i)=>{const mid=(n-1)/2,rot=(i-mid)*1.6,y=566+Math.pow(i-mid,2)*0.9;
    return cardHTML(c,'f '+(dealing?'dealt ':'')+(my?(ok.has(c.id)?'ok':'dim'):'')).replace('style="','tabindex="0" style="animation-delay:'+(i*55)+'ms;--rot:'+rot+'deg;left:'+(start+i*stepX)+'px;top:'+y+'px;z-index:'+(i+1)+';transform:rotate('+rot+'deg);')}).join('');
  dealing=false;
  el.querySelectorAll('.card').forEach(d=>d.addEventListener('click',()=>{const c=hand.find(x=>x.id===d.dataset.id);if(c&&my)tryPlay(c)}));
  if(focusId){const f=el.querySelector(`[data-id="${focusId}"]`);if(f)f.focus({preventScroll:true})}
}
function dealAnim(){
  if(window.__fast)return;
  const box=$('deal');box.innerHTML='';dealing=true;
  for(let i=0;i<39;i++){const p=1+(i%3),d=document.createElement('div');d.className='mini';d.style.left='614px';d.style.top='262px';d.style.transform='rotate(0deg)';box.appendChild(d);
    setTimeout(()=>{d.style.left=(FROM[p].x-26)+'px';d.style.top=(FROM[p].y-60)+'px';d.style.transform=`rotate(${(Math.random()-.5)*30}deg) scale(.5)`;d.style.opacity='0'},40+i*18);}
  setTimeout(()=>box.innerHTML='',1400);
}
function tryPlay(c){
  if(!legal(0).some(x=>x.id===c.id)){
    const L=h.trick.length?h.trick[0].c.s:null;
    toast(L&&h.hands[0].some(x=>x.s===L)?`You must follow ${SNAME[L]}.`:'Spades are not broken yet. Lead another suit.');return}
  play(0,c);
}
function renderSide(){
  const L=levelInfo(prof.xp);$('lvlTxt').textContent='Level '+L.l;$('lvlBar').style.width=(L.cur/L.need*100)+'%';
  if(m){$('scUs').textContent=m.scores[0];$('scThem').textContent=m.scores[1];$('bgUs').textContent='Bags '+m.bags[0]+' / 10';$('bgThem').textContent='Bags '+m.bags[1]+' / 10';
    $('meta').innerHTML=`Play to ${m.target} · Hand ${Math.max(1,m.handNo)}${m.special?'<br><b>Special match</b>':''}`;}
  const pts=seasonPts(),t=tierOf(pts),next=TIERS[t+1];
  $('tierLine').innerHTML=shield(t)+`<span>${TIERS[t].n}<br><small style="font:500 12px var(--body);color:var(--muted)">${new Date().toLocaleString('en',{month:'long'})} season</small></span>`;
  $('tierBar').style.width=next?((pts-TIERS[t].p)/(next.p-TIERS[t].p)*100)+'%':'100%';
  $('tierMeta').textContent=next?`${pts} / ${next.p} to ${next.n}`:`${pts} points, top tier`;
  const g=todayGoals(),open=g.list.filter(x=>!x.done).length;$('goalDot').hidden=!open;$('goalDot').textContent=open;
}
function renderAll(){renderSeats();renderBoxes();renderHand();renderSide();
  $('bHint').disabled=!(h&&h.turn===0&&(h.phase==='play'||h.phase==='bid'));}

/* trick animation */
function place(el,x,y,sc,rot){el.style.left=(x-52)+'px';el.style.top=(y-75)+'px';el.style.transform=`scale(${sc}) rotate(${rot}deg)`}
function flyIn(p,c){
  const box=document.createElement('div');box.innerHTML=cardHTML(c,'tcard');const el=box.firstElementChild;el.dataset.p=p;
  let F=FROM[p];if(p===0){const hc=$('hand').querySelector(`[data-id="${c.id}"]`);if(hc)F={x:parseFloat(hc.style.left)+52,y:parseFloat(hc.style.top)+75}}
  place(el,F.x,F.y,p===0?1:.5,0);$('trick').appendChild(el);el.getBoundingClientRect();
  const rot=(Math.random()-.5)*10;place(el,SLOT[p].x,SLOT[p].y,1,rot);
}
function collect(w){
  const els=[...$('trick').children],win=els.find(e=>+e.dataset.p===w);if(win){win.classList.add('won');win.style.zIndex=9}
  setTimeout(()=>{els.forEach(el=>{place(el,AVC[w].x,AVC[w].y,.35,0);el.style.opacity='0'});setTimeout(()=>els.forEach(e=>e.remove()),420)},window.__fast?0:330);
}
function clearTrick(){$('trick').innerHTML=''}
function drawTrickStatic(){clearTrick();if(!h)return;h.trick.forEach(x=>{const box=document.createElement('div');box.innerHTML=cardHTML(x.c,'tcard');const el=box.firstElementChild;el.dataset.p=x.p;place(el,SLOT[x.p].x,SLOT[x.p].y,1,0);$('trick').appendChild(el)})}

/* confetti for a match win */
function confetti(){
  if(window.__fast||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const cv=$('fx'),g=cv.getContext('2d'),cols=['#e8b84a','#ffe08a','#3b82f6','#e5485e','#4ade80','#ffffff'];
  const P=Array.from({length:180},()=>({x:640+(Math.random()-.5)*300,y:300,vx:(Math.random()-.5)*16,vy:-Math.random()*16-4,r:Math.random()*6+3,a:Math.random()*6,va:(Math.random()-.5)*.3,c:cols[rnd(cols.length)]}));
  let t=0;(function fr(){g.clearRect(0,0,1280,720);t++;
    P.forEach(p=>{p.vy+=.35;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.a+=p.va;g.save();g.translate(p.x,p.y);g.rotate(p.a);g.fillStyle=p.c;g.globalAlpha=Math.max(0,1-t/170);g.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);g.restore()});
    if(t<170)requestAnimationFrame(fr);else g.clearRect(0,0,1280,720)})();
}

/* bubbles + toast */
function say(p,text){
  const b=document.createElement('div');b.className='bubble';b.textContent=text;
  const pos=[{x:900,y:400},{x:262,y:196},{x:760,y:96},{x:1018,y:196}][p];b.style.left=pos.x+'px';b.style.top=pos.y+'px';
  $('bubbles').appendChild(b);requestAnimationFrame(()=>b.classList.add('on'));
  setTimeout(()=>{b.classList.remove('on');setTimeout(()=>b.remove(),300)},1600*Math.max(SPEED(),.5));
}
let tt;function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('on'),2600)}

/* ---------- bid panel ---------- */
let bidSel=null;
function showBid(){
  bidSel=null;const sug=suggestBid(0);
  $('bidInfo').innerHTML=[2,1,3].map(p=>`<span>${who(p).name}${p===2?' (partner)':''}: <b>${h.bids[p]===null?'…':h.bids[p]===0?'Nil':h.bids[p]}</b></span>`).join('');
  $('bidGrid').innerHTML=Array.from({length:14},(_,i)=>`<button class="btn f ${i===0?'nil':''}" data-b="${i}">${i===0?'Nil':i}</button>`).join('');
  $('bidGrid').querySelectorAll('button').forEach(b=>b.onclick=()=>{bidSel=+b.dataset.b;updBid()});
  $('bidHintMsg').hidden=true;$('bidPanel').hidden=false;updBid();
  $('bidGrid').children[Math.min(3,13)].focus({preventScroll:true});
  $('bidHint').onclick=()=>{$('bidHintMsg').hidden=false;$('bidHintMsg').textContent=`Suggested: ${sug.bid===0?'Nil':sug.bid}. ${sug.why}`;
    [...$('bidGrid').children].forEach(b=>b.classList.toggle('sug',+b.dataset.b===sug.bid));$('bidGrid').children[sug.bid].focus({preventScroll:true})};
}
function updBid(){
  [...$('bidGrid').children].forEach(b=>b.classList.toggle('sel',+b.dataset.b===bidSel));
  const pb=h.bids[2],mine=bidSel||0,tot=(pb>0?pb:0)+mine;
  $('bidTotal').innerHTML=`Your team bid: <b>${pb===null&&bidSel===null?'–':tot}</b>${pb===null?' <small>(partner not yet)</small>':''}`;
  const go=$('bidGo');go.disabled=bidSel===null;go.textContent=bidSel===null?'Choose a bid':bidSel===0?'Bid Nil':'Bid '+bidSel;
}
$('bidGo').onclick=()=>{if(bidSel===null)return;$('bidPanel').hidden=true;placeBid(0,bidSel)};
$('bidGrid').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.b!==undefined){e.preventDefault();e.stopPropagation();bidSel=+e.target.dataset.b;updBid();$('bidGo').focus({preventScroll:true})}});

/* ---------- overlays ---------- */
function overlay(html,focusSel){const o=$('ovl');o.innerHTML=html;o.hidden=false;const f=o.querySelector(focusSel||'.btn');if(f)f.focus({preventScroll:true});return o}
function closeOv(){$('ovl').hidden=true;$('ovl').innerHTML='';focusHand()}
function showVS(){
  const pl=p=>`<div class="who team${teamOf(p)}"><div class="av"><div class="face">${avatar(who(p).kind)}</div></div>${p===0?'You':who(p).name}<span class="lv">Level ${m.lv[p]}</span></div>`;
  const o=overlay(`<div id="vs" class="box"><div class="title">${m.special?'Special Opponent<br>Match!':'Match '+m.no}</div>
    <div class="teams"><div class="box"><div class="lab">Us</div><div class="tm u">${pl(0)}${pl(2)}</div></div><div class="vsmark">VS</div>
    <div class="box"><div class="lab">Them</div><div class="tm t">${pl(1)}${pl(3)}</div></div></div>
    <div class="meta" style="margin-bottom:14px;text-align:center">${m.special?'Tougher opponents. Win for double season points.':'First team to '+m.target+' points wins.'}</div>
    <button class="btn gold f" id="vsGo" style="font-size:26px;padding:10px 40px">Deal the cards</button></div>`,'#vsGo');
  o.querySelector('#vsGo').onclick=()=>{closeOv();dealHand()};
  if(window.__auto)setTimeout(()=>o.querySelector('#vsGo')&&o.querySelector('#vsGo').click(),50);
}
function showSummary(r,winner){
  const row=(t,x)=>`<tr><td><b>${t?'Them':'Us'}</b></td><td>${x.bid}${[t,t+2].some(p=>h.bids[p]===0)?' + nil':''}</td><td>${x.won}</td><td>${x.pts>0?'+':''}${x.pts}</td><td>${x.newBags}</td><td><b>${m.scores[t]}</b></td></tr>`;
  const o=overlay(`<div class="sheet" style="width:620px"><h2>Hand ${m.handNo} results</h2><div class="in">
    <table class="sum"><tr><th>Team</th><th>Bid</th><th>Won</th><th>Points</th><th>Bags</th><th>Total</th></tr>${row(0,r[0])}${row(1,r[1])}</table>
    <div class="notes"><b>Us:</b> ${r[0].lines.join('. ')||'No bid'}<br><b>Them:</b> ${r[1].lines.join('. ')||'No bid'}</div>
    <div class="row"><button class="btn blue f" id="sumGo">${winner===null?'Next hand':'See the result'}</button></div></div></div>`,'#sumGo');
  o.querySelector('#sumGo').onclick=()=>{if(winner===null){closeOv();clearTrick();dealHand()}else showMatchEnd(winner)};
  if(window.__auto)setTimeout(()=>o.querySelector('#sumGo')&&o.querySelector('#sumGo').click(),30);
}
function showMatchEnd(winner){
  const res=endMatch(winner),L=levelInfo(prof.xp),pts=seasonPts(),t=tierOf(pts);
  window.__results=(window.__results||[]).concat([{won:res.won,scores:m.scores.slice(),hands:m.handNo}]);
  const o=overlay(`<div class="sheet" style="width:560px"><h2>${res.won?'You win the match!':'They win this time'}</h2><div class="in" style="text-align:center">
    <div class="big ${res.won?'win':'lose'}">${m.scores[0]} – ${m.scores[1]}</div>
    <div class="notes">+${res.xp} XP · +${res.pts} season points${res.levelUp?` · <b>Level ${res.levelUp}!</b>`:''}</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:6px 0 4px"><div style="width:70px">${shield(t)}</div><div style="text-align:left"><b style="font:800 24px var(--display)">${res.promoted?'Promoted to '+res.promoted+'!':TIERS[t].n+' tier'}</b><div class="notes" style="margin:0">${pts} season points · Level ${L.l}</div></div></div>
    <div class="notes">Record: ${prof.wins} wins, ${prof.losses} losses</div>
    <div class="row"><button class="btn gold f" id="againGo">Play again</button></div></div></div>`,'#againGo');
  if(res.promoted||res.won)sfx('cheer');if(res.won)confetti();
  o.querySelector('#againGo').onclick=()=>{closeOv();newMatch()};
  if(window.__auto)setTimeout(()=>o.querySelector('#againGo')&&o.querySelector('#againGo').click(),30);
}
function showGoals(){
  const g=todayGoals();
  overlay(`<div class="sheet"><h2>Today's goals</h2><div class="in"><div class="list">${g.list.map(x=>{const d=GOAL_POOL.find(q=>q.id===x.id);
    return `<div class="goal ${x.done?'done':''}"><div><b style="font:700 17px var(--display)">${x.done?'✓ ':''}${d.t}</b><div class="bar"><i style="width:${x.have/d.n*100}%"></i></div></div><em>${x.have}/${d.n}<br>+${d.xp} XP</em></div>`}).join('')}</div>
    <div class="notes">New goals every day.</div><div class="row"><button class="btn blue f" id="cl">Close</button></div></div></div>`).querySelector('#cl').onclick=closeOv;
}
function showTiers(){
  const pts=seasonPts(),t=tierOf(pts);
  overlay(`<div class="sheet"><h2>${new Date().toLocaleString('en',{month:'long'})} season tiers</h2><div class="in"><div class="tiers">${TIERS.slice().reverse().map((x,i)=>{const idx=TIERS.length-1-i;
    return `<div class="tier ${idx===t?'cur':''}">${shield(idx,'',idx>t)}<b>${x.n}</b><span>${x.p} pts${idx===t?' · you are here':''}</span></div>`}).join('')}</div>
    <div class="notes">You have ${pts} points this month. Win a match: +100 (special match +150). Make your bid: +10. Set them: +10. Make a nil: +25. Points start again each month and your best tier becomes that month's badge.<br>Record: ${prof.wins} wins, ${prof.losses} losses, ${prof.nilsMade} nils made.</div>
    <div class="row"><button class="btn blue f" id="cl">Close</button></div></div></div>`).querySelector('#cl').onclick=closeOv;
}
function showBadges(){
  const y=new Date().getFullYear(),now=monthKey();
  const cells=Array.from({length:12},(_,i)=>{const k=y+'-'+String(i+1).padStart(2,'0'),pts=prof.season[k];
    return `<div class="month ${k===now?'now':''}"><h4>${new Date(y,i,1).toLocaleString('en',{month:'long'})}</h4>${pts===undefined?shield(0,'',true):shield(tierOf(pts),String(pts))}</div>`}).join('');
  overlay(`<div class="sheet"><h2>Season badges ${y}</h2><div class="in"><div class="months">${cells}</div>
    <div class="row" style="margin-top:12px"><button class="btn blue f" id="cl">Close</button></div></div></div>`).querySelector('#cl').onclick=closeOv;
}
function showSettings(){
  const S=prof.settings;
  const seg=(key,opts)=>`<div class="seg" data-k="${key}">${opts.map(([v,l])=>`<button class="btn f ${S[key]===v?'sel':''}" data-v='${JSON.stringify(v)}'>${l}</button>`).join('')}</div>`;
  const o=overlay(`<div class="sheet"><h2>Settings</h2><div class="in">
    <div class="opt"><label>Play to</label>${seg('target',[[250,'250'],[500,'500']])}</div>
    <div class="opt"><label>Opponents</label>${seg('diff',[['easy','Easy'],['normal','Normal'],['hard','Hard']])}</div>
    <div class="opt"><label>Speed</label>${seg('speed',[['normal','Normal'],['fast','Fast']])}</div>
    <div class="opt"><label>Sound effects</label>${seg('sound',[[true,'On'],[false,'Off']])}</div>
    <div class="opt"><label>Card colours</label>${seg('four',[[true,'Four colours'],[false,'Red and black']])}</div>
    <div class="rules"><b>How to play.</b> You and Mitthu (top) are a team against Sheru and Gajju. Each player bids how many tricks they will win. You must follow the suit that was led; if you can't, you may play a spade, which beats every other suit. Spades can't be led until one has been played. Make your team's bid: 10 points per trick bid, plus 1 point (a bag) for each extra trick. Miss it: minus 10 per trick. Every 10 bags costs 100 points. Nil means you win no tricks: +100 if you do it, −100 if you don't. "Play to" and "Opponents" apply from the next match.</div>
    <div class="row" style="margin-top:12px"><button class="btn blue f" id="cl">Done</button></div></div></div>`);
  o.querySelectorAll('.seg').forEach(sg=>sg.querySelectorAll('.btn').forEach(b=>b.onclick=()=>{S[sg.dataset.k]=JSON.parse(b.dataset.v);saveProf();
    sg.querySelectorAll('.btn').forEach(x=>x.classList.toggle('sel',x===b));renderAll();drawTrickStatic()}));
  o.querySelector('#cl').onclick=closeOv;
}
function confirmNew(){
  const o=overlay(`<div class="sheet" style="width:460px"><h2>New match?</h2><div class="in" style="text-align:center"><div class="notes">The match you are playing now will end and count as a loss.</div>
    <div class="row"><button class="btn blue f" id="no">Keep playing</button><button class="btn f" id="yes">Start new match</button></div></div></div>`,'#no');
  o.querySelector('#no').onclick=closeOv;o.querySelector('#yes').onclick=()=>{if(m&&!m.over&&h){prof.losses++;saveProf()}clearTimeout(timer);closeOv();newMatch()};
}

/* ---------- hint ---------- */
function hint(){
  if(!h||h.turn!==0)return;
  if(h.phase==='bid'){$('bidHint').click();return}
  if(h.phase!=='play'||busy)return;
  const r=choose(0,'hard');const el=$('hand').querySelector(`[data-id="${r.c.id}"]`);
  if(el){el.classList.add('hint');el.focus({preventScroll:true});setTimeout(()=>el.classList.remove('hint'),2600)}
  toast('Hint: '+cname(r.c)+'. '+r.why);
}

/* ---------- app bridge: the TV app keeps the record (wins) on its Games menu; Back leaves ---------- */
function record(v){try{window.CableGames&&window.CableGames.record('spades',v)}catch(e){}
  try{if(window.parent!==window)window.parent.postMessage({cableGame:'record',id:'spades',value:v},'*')}catch(e){}}
function exitGame(){try{if(window.CableGames){window.CableGames.exit();return}}catch(e){}
  try{if(window.parent!==window){window.parent.postMessage({cableGame:'exit'},'*');return}}catch(e){}history.length>1&&history.back()}
/* ---------- controls: mouse, keyboard and TV remote ---------- */
$('bHint').onclick=hint;$('bGoals').onclick=showGoals;$('bTiers').onclick=showTiers;$('bBadges').onclick=showBadges;$('bSettings').onclick=showSettings;
$('bNew').onclick=()=>m&&!m.over&&h?confirmNew():(closeOv(),newMatch());
function focusHand(){if(!$('ovl').hidden||!$('bidPanel').hidden)return;const my=h&&h.phase==='play'&&h.turn===0;
  const cards=[...$('hand').querySelectorAll('.card')];if(!cards.length)return;
  if(cards.includes(document.activeElement))return;const ok=cards.find(c=>c.classList.contains('ok'));(my&&ok?ok:cards[0]).focus({preventScroll:true})}
function root(){if(!$('ovl').hidden)return $('ovl');if(!$('bidPanel').hidden)return $('bidPanel');return $('stage')}
function navigate(dir){
  const r=root(),items=[...r.querySelectorAll('.f')].filter(e=>!e.disabled&&e.offsetParent!==null&&(r!==$('stage')||(!$('ovl').contains(e)&&!$('bidPanel').contains(e))));
  const cur=document.activeElement;if(!items.includes(cur)){(items[0]||{focus(){}}).focus({preventScroll:true});return}
  const a=cur.getBoundingClientRect(),ac={x:a.left+a.width/2,y:a.top+a.height/2};
  let best=null,bs=1e9;
  items.forEach(e=>{if(e===cur)return;const b=e.getBoundingClientRect(),bc={x:b.left+b.width/2,y:b.top+b.height/2},dx=bc.x-ac.x,dy=bc.y-ac.y;
    const ok=dir==='left'?dx<-4:dir==='right'?dx>4:dir==='up'?dy<-4:dy>4;if(!ok)return;
    const main=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy),side=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx);
    const s=main+side*3;if(s<bs){bs=s;best=e}});
  // inside the hand, left/right walk card by card
  if(cur.closest('#hand')&&(dir==='left'||dir==='right')){const cs=[...$('hand').querySelectorAll('.card')],i=cs.indexOf(cur),n=cs[i+(dir==='left'?-1:1)];if(n){n.focus({preventScroll:true});return}}
  if(best)best.focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
  const k=e.keyCode===23?'Enter':e.key;
  const map={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
  if(map[k]){e.preventDefault();navigate(map[k]);return}
  if(k==='Enter'||k===' '){const a=document.activeElement;if(a&&a.closest&&a.closest('#hand')){e.preventDefault();const c=h&&h.hands[0].find(x=>x.id===a.dataset.id);if(c&&h.phase==='play'&&h.turn===0&&!busy)tryPlay(c);return}
    if(a&&a.classList&&a.classList.contains('btn')&&k===' '){e.preventDefault();a.click()}return}
  if(k==='h'||k==='H'){hint();return}
  if(k==='Escape'||k==='Backspace'||k==='GoBack'||k==='BrowserBack'||e.keyCode===27){e.preventDefault();if(!$('ovl').hidden&&$('ovl').querySelector('#cl'))closeOv();else exitGame()}
});

/* ---------- fit the 1280x720 stage to the window ---------- */
function fit(){const s=Math.min(innerWidth/1280,innerHeight/720);$('stage').style.transform=`scale(${s})`}
addEventListener('resize',fit);fit();

/* ---------- start: resume a saved match or show a new one ---------- */
const saved=store.get('spades.match');
if(saved&&saved.m&&!saved.m.over){m=saved.m;h=saved.h;busy=false;
  if(!h||h.phase==='done'){renderAll();dealHand()}
  else{renderAll();drawTrickStatic();if(h.trick.length===4){busy=true;later(finishTrick,600)}else later(step,500)}
  toast('Welcome back. Your match is where you left it.')}
else{newMatch()}
window.__game={get m(){return m},get h(){return h},choose,legal,estimate,scoreTeam};
})();
