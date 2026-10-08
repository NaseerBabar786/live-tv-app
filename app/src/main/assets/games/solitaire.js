// Cable TV Solitaire (1.10.26): Klondike on a card table. Arrows + OK on the TV remote, tap or drag with touch/mouse.
(()=>{
const $=s=>document.querySelector(s);
const app=$('#app'), board=$('#board'), cursorEl=$('#cursor');
const RANKS=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const suit=id=>Math.floor(id/13), rank=id=>id%13+1, isRed=id=>{const s=suit(id);return s===1||s===2};
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

let prefs=Object.assign({draw:1,table:'green',back:'blue',sound:true},store.get('cts.prefs',{}));
let stats=Object.assign({played:0,won:0,best:0,fastest:0},store.get('cts.stats',{}));
let S=null, undo=[], els={}, slots={}, L={}, loc={}, held=null, hintIdx=0, timerId=null, kb={row:1,col:0,depth:-1,btn:2};

/* ---------- sound (tiny synthesized clicks, no music) ---------- */
let ac=null;
function blip(kind){
  if(!prefs.sound) return;
  try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)(); }catch(e){return}
  const t=ac.currentTime, o=ac.createOscillator(), g=ac.createGain();
  const m={place:[520,.05,'triangle',.18],flip:[760,.04,'sine',.12],bad:[150,.14,'square',.08],draw:[420,.035,'triangle',.12],win:[660,.5,'triangle',.18]}[kind]||[500,.05,'sine',.1];
  o.type=m[2]; o.frequency.setValueAtTime(m[0],t);
  if(kind==='win'){[660,880,990,1320].forEach((f,i)=>o.frequency.setValueAtTime(f,t+i*.11))}
  if(kind==='place') o.frequency.exponentialRampToValueAtTime(260,t+m[1]);
  g.gain.setValueAtTime(m[3],t); g.gain.exponentialRampToValueAtTime(.001,t+m[1]+.04);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t+m[1]+.05);
}

/* ---------- felt grain ---------- */
(function(){const c=$('#noise'),n=160;c.width=c.height=n;c.style.width='100%';c.style.height='100%';
  const x=c.getContext('2d'),d=x.createImageData(n,n);for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}
  x.putImageData(d,0,0);const u=c.toDataURL();c.remove();const div=document.createElement('div');div.id='noise';div.style.backgroundImage=`url(${u})`;app.prepend(div)})();

/* ---------- deal ---------- */
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function newState(seed){
  const r=rng(seed), deck=[...Array(52).keys()];
  for(let i=51;i>0;i--){const j=Math.floor(r()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
  const s={seed,draw:prefs.draw,stock:[],waste:[],found:[[],[],[],[]],tab:[[],[],[],[],[],[],[]],score:0,moves:0,time:0,started:false,won:false,counted:false};
  for(let c=0;c<7;c++)for(let k=0;k<=c;k++)s.tab[c].push({id:deck.pop(),up:k===c});
  while(deck.length)s.stock.push({id:deck.pop(),up:false});
  return s;
}
function startGame(seed,isReplay){
  if(S&&S.started&&!S.won&&!S.counted){stats.played++;store.set('cts.stats',stats)}
  S=newState(seed); undo=[]; held=null; hintIdx=0; clearFx(); buildCards(); dealAnim(); save(); updateHud();
  toast(isReplay?'Same deal, try again':`New game · Draw ${S.draw}`);
}

/* ---------- DOM ---------- */
const suitSvg=(s,cls)=>`<svg class="${cls}"><use href="#s${s}"/></svg>`;
function cardHtml(id){
  const s=suit(id),r=rank(id),col=isRed(id)?'red':'blk';
  let mid=suitSvg(s,'big');
  if(r>10) mid=`<div class="court"><svg class="crown"><use href="#crown"/></svg><i>${RANKS[r]}</i>${suitSvg(s,'')}</div>`;
  return `<div class="face ${col}"><div class="rk${r===10?' ten':''}">${RANKS[r]}</div>${suitSvg(s,'cs')}${mid}</div><div class="back"></div>`;
}
function buildCards(){
  Object.values(els).forEach(e=>e.remove()); els={};
  for(let id=0;id<52;id++){const e=document.createElement('div');e.className='card down';e.dataset.id=id;e.innerHTML=cardHtml(id);board.appendChild(e);els[id]=e}
}
function buildSlots(){
  const mk=(key,cls,html='')=>{const d=document.createElement('div');d.className='slot '+cls;d.innerHTML=html;d.dataset.slot=key;board.appendChild(d);slots[key]=d};
  for(let i=0;i<4;i++)mk('f'+i,'found',`<svg><use href="#s${i}"/></svg>`);
  mk('w','waste');
  mk('s','stock','<svg viewBox="0 0 24 24"><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5"/></svg>');
  for(let i=0;i<7;i++)mk('t'+i,'tab','K');
}

/* ---------- layout ---------- */
function measure(){
  const W=board.clientWidth,H=board.clientHeight;
  const cw=Math.max(34,Math.min(W/7.5,H/4.6,140)), ch=cw*1.4;
  const gap=Math.min((W-7*cw)/8,cw*.3), x0=(W-7*cw-6*gap)/2;
  const topY=Math.max(6,gap*.5), tabY=topY+ch+Math.max(10,cw*.2);
  L={W,H,cw,ch,gap,x0,topY,tabY,colX:i=>x0+i*(cw+gap)};
  board.style.setProperty('--cw',cw);
  Object.values(slots).forEach(d=>{d.style.width=cw+'px';d.style.height=ch+'px'});
  for(let i=0;i<4;i++)place(slots['f'+i],L.colX(i),topY);
  place(slots.w,L.colX(4),topY); place(slots.s,L.colX(6),topY);
  for(let i=0;i<7;i++)place(slots['t'+i],L.colX(i),tabY);
  Object.values(els).forEach(e=>{e.style.width=cw+'px';e.style.height=ch+'px';e.style.fontSize=cw+'px'});
}
const place=(el,x,y)=>{el.style.transform=`translate(${x}px,${y}px)`};
function colOffsets(col){
  const p=S.tab[col], nd=p.filter(c=>!c.up).length, nu=p.length-nd;
  let dn=L.ch*.11, up=L.ch*.26;
  const avail=L.H-6-L.tabY-L.ch, need=nd*dn+Math.max(0,nu-1)*up;
  if(need>avail&&need>0){const f=avail/need;dn*=Math.max(f,.45);up=Math.max(L.ch*.12,(avail-nd*dn)/Math.max(1,nu-1));up=Math.min(up,L.ch*.26)}
  return {dn,up};
}
function cardPos(p,i){ // returns {x,y,z}
  const {cw}=L;
  if(p.t==='stock')return{x:L.colX(6)+Math.floor(i/8)*1.2,y:L.topY-Math.floor(i/8)*1.2,z:10+i};
  if(p.t==='waste'){
    const n=S.waste.length; let x=L.colX(4);
    if(S.draw===3){const k=n-1-i; if(k<3)x+=(Math.min(3,n)-1-k)*cw*.3}
    return{x,y:L.topY,z:100+i};
  }
  if(p.t==='found')return{x:L.colX(p.i),y:L.topY,z:200+i};
  const o=colOffsets(p.i); let y=L.tabY;
  for(let k=0;k<i;k++)y+=S.tab[p.i][k].up?o.up:o.dn;
  return{x:L.colX(p.i),y,z:400+i};
}
const allPiles=()=>[{t:'stock'},{t:'waste'},...[0,1,2,3].map(i=>({t:'found',i})),...[0,1,2,3,4,5,6].map(i=>({t:'tab',i}))];
const pile=p=>p.t==='stock'?S.stock:p.t==='waste'?S.waste:p.t==='found'?S.found[p.i]:S.tab[p.i];
const samePile=(a,b)=>a&&b&&a.t===b.t&&a.i===b.i;

function render(instant){
  if(instant){board.classList.add('noanim')}
  measure();
  const newLoc={};
  allPiles().forEach(p=>pile(p).forEach((c,i)=>{
    const e=els[c.id], pos=cardPos(p,i), was=loc[c.id];
    newLoc[c.id]={p,i};
    const wasDown=e.classList.contains('down');
    e.classList.toggle('down',!c.up);
    e.classList.toggle('stk',p.t!=='tab'&&i<pile(p).length-1);
    if(wasDown&&c.up&&!instant){e.classList.remove('flip');void e.offsetWidth;e.classList.add('flip')}
    let y=pos.y; const isHeld=held&&samePile(held.p,p)&&i>=held.i;
    e.classList.toggle('held',!!isHeld); if(isHeld)y-=L.cw*.08;
    const moved=was&&(!samePile(was.p,p));
    e.style.zIndex=moved&&!instant?3000+i:pos.z;
    if(moved&&!instant)setTimeout(()=>{if(loc[c.id]&&samePile(loc[c.id].p,p))e.style.zIndex=cardPos(p,loc[c.id].i).z},230);
    if(!e.classList.contains('drag'))place(e,pos.x,y);
  }));
  loc=newLoc;
  slots.s.style.opacity=S.stock.length?0:1;
  if(instant){void board.offsetWidth;requestAnimationFrame(()=>board.classList.remove('noanim'))}
  drawCursor(); updateHud();
}

/* ---------- rules ---------- */
function canDrop(cards,dest){
  const first=cards[0].id, d=pile(dest), top=d[d.length-1];
  if(dest.t==='found'){ if(cards.length!==1)return false; return top?suit(top.id)===suit(first)&&rank(first)===rank(top.id)+1:rank(first)===1 }
  if(dest.t==='tab'){ return top?(top.up&&isRed(top.id)!==isRed(first)&&rank(first)===rank(top.id)-1):rank(first)===13 }
  return false;
}
function movable(p,i){
  const a=pile(p); if(!a[i]||!a[i].up)return false;
  if(p.t==='tab')return true;
  if(p.t==='waste'||p.t==='found')return i===a.length-1;
  return false;
}
function snapshot(){undo.push(JSON.stringify(S));if(undo.length>300)undo.shift()}
function begin(){if(!S.started){S.started=true}}
function moveCards(src,i,dest){
  const cards=pile(src).slice(i);
  if(!canDrop(cards,dest))return false;
  snapshot(); begin(); const before=S.score;
  pile(src).splice(i); pile(dest).push(...cards);
  if(dest.t==='found')S.score+=10;
  if(src.t==='waste'&&dest.t==='tab')S.score+=5;
  if(src.t==='found'&&dest.t==='tab')S.score=Math.max(0,S.score-15);
  if(src.t==='tab'){const s=pile(src),t=s[s.length-1];if(t&&!t.up){t.up=true;S.score+=5;setTimeout(()=>blip('flip'),120)}}
  S.moves++; held=null; hintIdx=0; blip('place'); afterMove();
  const gain=S.score-before; if(gain>0)popScore(gain,dest);
  if(dest.t==='found'){const e=els[cards[0].id];e.classList.remove('land');void e.offsetWidth;e.classList.add('land');sparkle(dest)}
  return true;
}
function draw(){
  if(!S.stock.length&&!S.waste.length)return;
  snapshot(); begin(); held=null; hintIdx=0;
  if(S.stock.length){
    const n=Math.min(S.draw,S.stock.length);
    for(let k=0;k<n;k++){const c=S.stock.pop();c.up=true;S.waste.push(c)}
    blip('draw');
  }else{
    while(S.waste.length){const c=S.waste.pop();c.up=false;S.stock.push(c)}
    if(S.draw===1)S.score=Math.max(0,S.score-100);
    blip('flip');
  }
  S.moves++; afterMove();
}
function afterMove(){render();save();checkWin()}
function smartMove(p,i){
  const cards=pile(p).slice(i);
  if(cards.length===1&&p.t!=='found')for(let f=0;f<4;f++)if(canDrop(cards,{t:'found',i:f}))return moveCards(p,i,{t:'found',i:f});
  const order=[...Array(7).keys()].sort((a,b)=>{const ea=!S.tab[a].length,eb=!S.tab[b].length;return ea-eb});
  for(const t of order){
    const d={t:'tab',i:t}; if(samePile(d,p))continue;
    if(!S.tab[t].length&&p.t==='tab'&&i===0)continue; // king already at the bottom
    if(canDrop(cards,d))return moveCards(p,i,d);
  }
  shake(cards); return false;
}
function shake(cards){blip('bad');cards.forEach(c=>{const e=els[c.id];e.classList.remove('shake');void e.offsetWidth;e.classList.add('shake')})}

/* ---------- hints ---------- */
function findMoves(){
  const out=[], tops=[];
  if(S.waste.length)tops.push({p:{t:'waste'},i:S.waste.length-1});
  S.tab.forEach((a,c)=>{if(a.length)tops.push({p:{t:'tab',i:c},i:a.length-1})});
  tops.forEach(m=>{for(let f=0;f<4;f++)if(canDrop([pile(m.p)[m.i]],{t:'found',i:f})){out.push({...m,to:{t:'found',i:f}});break}});
  S.tab.forEach((a,c)=>{
    const fi=a.findIndex(x=>x.up); if(fi<0)return;
    for(let t=0;t<7;t++){if(t===c)continue;
      if(!S.tab[t].length&&fi===0)continue;
      if(canDrop(a.slice(fi),{t:'tab',i:t})){out.push({p:{t:'tab',i:c},i:fi,to:{t:'tab',i:t}});break}}
  });
  if(S.waste.length){const w=S.waste.length-1;for(let t=0;t<7;t++)if(canDrop([S.waste[w]],{t:'tab',i:t})){out.push({p:{t:'waste'},i:w,to:{t:'tab',i:t}});break}}
  // a card in the middle of a column that frees the card under it for a foundation
  S.tab.forEach((a,c)=>{for(let k=a.findIndex(x=>x.up)+1;k>0&&k<a.length;k++){
    const under=a[k-1]; if(!S.found.some((f,fi)=>canDrop([under],{t:'found',i:fi})))continue;
    for(let t=0;t<7;t++)if(t!==c&&canDrop(a.slice(k),{t:'tab',i:t})){out.push({p:{t:'tab',i:c},i:k,to:{t:'tab',i:t}});break}}});
  if(S.stock.length||S.waste.length>(S.draw===1?0:0))out.push({draw:true});
  return out;
}
function hint(){
  clearHints();
  const ms=findMoves();
  if(!ms.length||(ms.length===1&&ms[0].draw&&!S.stock.length&&!usefulInWaste())){toast('No moves left. Try Undo or start a new game.');blip('bad');return}
  const m=ms[hintIdx%ms.length]; hintIdx++;
  if(m.draw){ (S.stock.length?els[S.stock[S.stock.length-1].id]:slots.s).classList.add('hint'); toast(S.stock.length?'Draw a card from the pile':'Turn the pile over'); }
  else{
    pile(m.p).slice(m.i).forEach(c=>els[c.id].classList.add('hint'));
    const d=pile(m.to), t=d[d.length-1];
    (t?els[t.id]:slots[(m.to.t==='found'?'f':'t')+m.to.i]).classList.add('hint');
  }
  setTimeout(clearHints,1800);
}
function usefulInWaste(){ // after a full pass, is any waste card playable anywhere?
  return S.waste.some(c=>S.tab.some((a,t)=>canDrop([c],{t:'tab',i:t}))||S.found.some((f,i)=>canDrop([c],{t:'found',i})));
}
function clearHints(){document.querySelectorAll('.hint').forEach(e=>e.classList.remove('hint'))}

/* ---------- auto finish + win ---------- */
let dealing=false;
function dealAnim(){
  dealing=true; setTimeout(()=>dealing=false,1500);
  board.classList.add('noanim'); measure();
  const sx=L.colX(6), sy=L.topY;
  Object.values(els).forEach(e=>{place(e,sx,sy);e.classList.add('down')});
  void board.offsetWidth; board.classList.remove('noanim');
  const order=[]; for(let r=0;r<7;r++)for(let c=r;c<7;c++)order.push(S.tab[c][r].id);
  loc={}; render(true);
  const final={}; order.forEach(id=>{final[id]=els[id].style.transform;place(els[id],sx,sy);els[id].classList.add('down')});
  board.classList.remove('noanim');
  order.forEach((id,k)=>setTimeout(()=>{const e=els[id];e.style.transform=final[id];
    const l=loc[id]; if(l&&pile(l.p)[l.i].up){setTimeout(()=>{e.classList.remove('down');e.classList.add('flip')},200)}
    if(k%3===0)blip('draw')},40+k*38));
}
function popScore(n,dest){
  const t=dest.t==='found'?{x:L.colX(dest.i),y:L.topY}:cardPos(dest,Math.max(0,pile(dest).length-1));
  const d=document.createElement('div');d.className='plus';d.textContent='+'+n;d.style.left=(t.x+L.cw/2)+'px';d.style.top=(t.y+L.ch*.25)+'px';
  board.appendChild(d);setTimeout(()=>d.remove(),950);
  const sc=$('#score');sc.classList.remove('pop');void sc.offsetWidth;sc.classList.add('pop');
}
function sparkle(dest){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const cx=L.colX(dest.i)+L.cw/2, cy=L.topY+L.ch/2;
  for(let k=0;k<12;k++){const s=document.createElement('div');s.className='spark';const a=k/12*Math.PI*2,r=L.cw*(.55+Math.random()*.35);
    s.style.left=cx+'px';s.style.top=cy+'px';s.style.setProperty('--dx',Math.cos(a)*r+'px');s.style.setProperty('--dy',Math.sin(a)*r+'px');
    if(k%3===0)s.style.background='#fff';board.appendChild(s);setTimeout(()=>s.remove(),650)}
}
const canAuto=()=>!S.won&&S.tab.every(a=>a.every(c=>c.up))&&(S.stock.length+S.waste.length+S.tab.reduce((n,a)=>n+a.length,0))>0;
let autoing=false;
function autoFinish(){
  if(!canAuto()||autoing)return; autoing=true; held=null;
  const step=()=>{
    if(S.won){autoing=false;return}
    let best=null;
    const cand=[];if(S.waste.length)cand.push({p:{t:'waste'},i:S.waste.length-1});
    S.tab.forEach((a,c)=>{if(a.length)cand.push({p:{t:'tab',i:c},i:a.length-1})});
    cand.forEach(m=>{const id=pile(m.p)[m.i].id;for(let f=0;f<4;f++)if(canDrop([{id}],{t:'found',i:f})&&(!best||rank(id)<best.r))best={...m,f,r:rank(id)}});
    if(best)moveCards(best.p,best.i,{t:'found',i:best.f}); else draw();
    setTimeout(step,95);
  };
  step();
}
function checkWin(){
  if(S.won||S.found.some(f=>f.length<13))return;
  S.won=true; S.counted=true; stopTimer();
  const bonus=S.time>=30?Math.round(700000/S.time):0;
  S.bonus=bonus; S.final=S.score+bonus;
  stats.played++; stats.won++; stats.best=Math.max(stats.best,S.final);
  stats.fastest=stats.fastest?Math.min(stats.fastest,S.time):S.time;
  store.set('cts.stats',stats); save(); blip('win'); report();
  setTimeout(()=>celebrate(showWin),350);
}
function fmt(t){return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}

/* bouncing-card celebration drawn on canvas */
const fx=$('#fx'); let fxRun=null;
function clearFx(){if(fxRun){cancelAnimationFrame(fxRun.raf);fxRun=null}const c=fx.getContext('2d');c.clearRect(0,0,fx.width,fx.height)}
const suitPaths=[0,1,2,3].map(i=>new Path2D(document.querySelector('#s'+i+' path').getAttribute('d')));
function drawCardCanvas(x,id,cx,cy,w){
  const h=w*1.4,r=w*.08;
  x.save();x.translate(cx,cy);
  x.fillStyle='#ffffff';x.strokeStyle='rgba(0,0,0,.18)';x.lineWidth=1;
  x.beginPath();x.roundRect?x.roundRect(0,0,w,h,r):x.rect(0,0,w,h);x.fill();x.stroke();
  const col=isRed(id)?'#e8364a':'#1b2236';x.fillStyle=col;
  x.font=`800 ${w*.34}px Outfit, system-ui, sans-serif`;x.textBaseline='top';x.fillText(RANKS[rank(id)],w*.06,w*.02);
  x.save();x.translate(w*.68,w*.06);x.scale(w*.0025,w*.0025);x.fill(suitPaths[suit(id)]);x.restore();
  x.save();x.translate(w*.21,h-w*.68);x.scale(w*.0058,w*.0058);x.fill(suitPaths[suit(id)]);x.restore();
  x.restore();
}
function celebrate(done){
  const dpr=Math.min(2,window.devicePixelRatio||1);fx.width=innerWidth*dpr;fx.height=innerHeight*dpr;fx.style.width=innerWidth+'px';fx.style.height=innerHeight+'px';
  const x=fx.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);
  const br=board.getBoundingClientRect(), w=L.cw, floor=innerHeight;
  const queue=[];for(let r=13;r>=1;r--)for(let f=0;f<4;f++){const id=S.found[f][r-1].id;queue.push({id,f})}
  let cur=null, finished=false;
  const finish=()=>{if(finished)return;finished=true;removeEventListener('pointerdown',finish);removeEventListener('keydown',finish);if(fxRun)cancelAnimationFrame(fxRun.raf);done()};
  addEventListener('pointerdown',finish);addEventListener('keydown',finish);
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){finish();return}
  fxRun={raf:0};
  const tick=()=>{
    if(!cur){const n=queue.shift();if(!n){setTimeout(finish,600);return}
      els[n.id].style.visibility='hidden';
      cur={id:n.id,x:br.left+L.colX(n.f),y:br.top+L.topY,vx:(Math.random()*4+2)*(Math.random()<.5?-1:1),vy:-Math.random()*6}}
    for(let s=0;s<2;s++){
      cur.vy+=.55;cur.x+=cur.vx;cur.y+=cur.vy;
      if(cur.y+w*1.4>floor){cur.y=floor-w*1.4;cur.vy*=-.78}
      drawCardCanvas(x,cur.id,cur.x,cur.y,w);
      if(cur.x<-w||cur.x>innerWidth){cur=null;break}
    }
    fxRun.raf=requestAnimationFrame(tick);
  };
  tick();
}

/* ---------- timer + HUD ---------- */
function startTimer(){stopTimer();timerId=setInterval(()=>{if(S.started&&!S.won&&!document.hidden){S.time++;$('#time').textContent=fmt(S.time);if(S.time%5===0)save()}},1000)}
function stopTimer(){clearInterval(timerId)}
function updateHud(){
  $('#score').textContent=S.score;$('#time').textContent=fmt(S.time);$('#moves').textContent=S.moves;
  $('#undoBtn').disabled=!undo.length||S.won; $('#autoBtn').classList.toggle('ready',canAuto());
}
function save(){store.set('cts.game',S)}
let toastT;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1900)}

/* ---------- pointer: tap to move, drag to place ---------- */
let pd=null;
board.addEventListener('pointerdown',e=>{
  app.classList.remove('keys'); if(S.won||autoing)return;
  const cEl=e.target.closest('.card'), sEl=e.target.closest('.slot');
  if(cEl){const l=loc[cEl.dataset.id]; if(!l)return;
    if(l.p.t==='stock'){pd={stock:true};return}
    if(!movable(l.p,l.i)){return}
    const r=cEl.getBoundingClientRect();
    pd={p:l.p,i:l.i,x0:e.clientX,y0:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,drag:false};
    board.setPointerCapture(e.pointerId);
  }else if(sEl&&sEl.dataset.slot==='s'){pd={stock:true}}
});
board.addEventListener('pointermove',e=>{
  if(!pd||pd.stock)return;
  if(!pd.drag&&Math.hypot(e.clientX-pd.x0,e.clientY-pd.y0)>6){pd.drag=true;held=null;clearHints();
    pd.cards=pile(pd.p).slice(pd.i);pd.cards.forEach((c,k)=>{const el=els[c.id];el.classList.add('drag');el.style.zIndex=4000+k})}
  if(pd.drag){const br=board.getBoundingClientRect(),o=colOffsets(pd.p.t==='tab'?pd.p.i:0).up;
    pd.cards.forEach((c,k)=>place(els[c.id],e.clientX-br.left-pd.dx,e.clientY-br.top-pd.dy+k*(pd.p.t==='tab'?o:0)))}
});
board.addEventListener('pointerup',e=>{
  if(!pd)return; const d=pd; pd=null;
  if(d.stock){draw();return}
  if(!d.drag){smartMove(d.p,d.i);return}
  d.cards.forEach(c=>els[c.id].classList.remove('drag'));
  const br=board.getBoundingClientRect(), x=e.clientX-br.left-d.dx, y=e.clientY-br.top-d.dy;
  let best=null,bestA=0;
  const cand=[...[0,1,2,3].map(i=>({t:'found',i})),...[0,1,2,3,4,5,6].map(i=>({t:'tab',i}))];
  cand.forEach(p=>{if(samePile(p,d.p))return;
    const px=L.colX(p.i), py=p.t==='found'?L.topY:L.tabY, ph=p.t==='found'?L.ch:Math.max(L.ch,cardPos(p,Math.max(0,pile(p).length-1)).y-L.tabY+L.ch);
    const ox=Math.max(0,Math.min(x+L.cw,px+L.cw)-Math.max(x,px)), oy=Math.max(0,Math.min(y+L.ch,py+ph)-Math.max(y,py)), a=ox*oy;
    if(a>bestA&&canDrop(d.cards,p)){best=p;bestA=a}});
  if(!best||!moveCards(d.p,d.i,best)){render()}
});
board.addEventListener('pointercancel',()=>{if(pd&&pd.cards)pd.cards.forEach(c=>els[c.id].classList.remove('drag'));pd=null;render()});

/* ---------- keyboard / TV remote ---------- */
const DOCK=['setBtn','replayBtn','newBtn','hintBtn','undoBtn'], HEAD=['statsBtn','autoBtn'];
function kbButtons(){
  document.querySelectorAll('.kfocus').forEach(e=>e.classList.remove('kfocus'));
  const on=app.classList.contains('keys')&&(kb.row===2||kb.row===-1);
  app.classList.toggle('dockrow',on);
  if(on)$('#'+(kb.row===2?DOCK[kb.btn]:HEAD[kb.btn])).classList.add('kfocus');
}
function kbTarget(){ // pile + index the cursor is on
  if(kb.row===0){const c=kb.col;return c<4?{p:{t:'found',i:c}}:c===6?{p:{t:'stock'}}:{p:{t:'waste'}}}
  const a=S.tab[kb.col], fi=a.findIndex(x=>x.up);
  let i=a.length-1; if(kb.depth>=0&&fi>=0)i=Math.max(fi,Math.min(a.length-1,kb.depth));
  return{p:{t:'tab',i:kb.col},i:a.length?i:-1};
}
function drawCursor(){
  kbButtons();
  if(!S||!L.cw||kb.row===2||kb.row===-1)return; const t=kbTarget(); let x,y,h=L.ch;
  if(kb.row===0){x=L.colX(kb.col===5?4:kb.col);y=L.topY;
    if(t.p.t==='waste'&&S.waste.length)x=cardPos(t.p,S.waste.length-1).x}
  else{x=L.colX(kb.col);
    if(t.i>=0){y=cardPos(t.p,t.i).y;h=cardPos(t.p,S.tab[kb.col].length-1).y-y+L.ch}else y=L.tabY}
  cursorEl.style.width=(L.cw+8)+'px';cursorEl.style.height=(h+8)+'px';cursorEl.style.transform=`translate(${x-4}px,${y-4}px)`;
}
function kbMove(dx,dy){
  if(kb.row===2||kb.row===-1){const n=kb.row===2?DOCK.length:HEAD.length;
    if(dx){kb.btn=(kb.btn+dx+n)%n}
    if(dy<0&&kb.row===2){kb.row=1;kb.col=Math.min(6,Math.round(kb.btn*1.5));kb.depth=-1}
    if(dy>0&&kb.row===-1){kb.row=0;kb.col=kb.btn?6:0}
    drawCursor();return}
  if(dy>0&&kb.row===1){const a=S.tab[kb.col],cur=kbTarget().i;if(cur<0||cur>=a.length-1){kb.row=2;kb.btn=2;drawCursor();return}}
  if(dy<0&&kb.row===0){kb.row=-1;kb.btn=kb.col>=4?1:0;drawCursor();return}
  if(dx){let c=kb.col+dx;if(kb.row===0&&c===5)c+=dx;kb.col=(c+7)%7;if(kb.row===0&&kb.col===5)kb.col=dx>0?6:4;kb.depth=-1}
  if(dy){
    if(kb.row===1){const a=S.tab[kb.col],fi=a.findIndex(x=>x.up),cur=kbTarget().i;
      if(dy<0){if(fi>=0&&cur>fi)kb.depth=cur-1;else{kb.row=0;if(kb.col===5)kb.col=4}}
      else if(cur>=0&&cur<a.length-1)kb.depth=cur+1;}
    else if(dy>0){kb.row=1;kb.depth=-1}
  }
  drawCursor();
}
function kbOk(){
  if(kb.row===2){$('#'+DOCK[kb.btn]).click();return}
  if(kb.row===-1){$('#'+HEAD[kb.btn]).click();return}
  if(S.won||autoing)return; const t=kbTarget();
  if(held){
    const dest=t.p;
    if(samePile(dest,held.p)){const h=held;held=null;smartMove(h.p,h.i);render();return}
    if(dest.t==='found'||dest.t==='tab'){const h=held;if(!moveCards(h.p,h.i,dest)){shake(pile(h.p).slice(h.i));held=null;render()}return}
    held=null;render();return;
  }
  if(t.p.t==='stock'){draw();return}
  const a=pile(t.p), i=t.p.t==='tab'?t.i:a.length-1;
  if(i<0||!movable(t.p,i)){blip('bad');return}
  held={p:t.p,i};render();
}
addEventListener('keydown',e=>{
  if(document.querySelector('.scrim'))return;
  const k=e.key; const nav={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];
  if(nav||k==='Enter'||k===' ')e.preventDefault();
  if(!app.classList.contains('keys')&&(nav||k==='Enter')){app.classList.add('keys');drawCursor();if(nav)return}
  if(nav)kbMove(...nav);
  else if(k==='Enter'||k===' ')kbOk();
  else if(k==='Escape'||k==='Backspace'||k==='GoBack'||k==='BrowserBack'){if(held){held=null;render()}else leave()}
  else if(k==='h'||k==='H')hint();
  else if(k==='u'||k==='U'||(k==='z'&&(e.ctrlKey||e.metaKey)))doUndo();
  else if(k==='n'||k==='N')askNew();
  else if(k==='a'||k==='A')autoFinish();
});

/* ---------- buttons + panels ---------- */
function doUndo(){if(!undo.length||S.won||autoing)return;const t=S.time;S=JSON.parse(undo.pop());S.time=t;held=null;hintIdx=0;clearHints();blip('flip');render();save()}
function panel(html,onOpen){
  const o=$('#overlay');o.innerHTML=`<div class="scrim"><div class="panel" role="dialog">${html}</div></div>`;
  const sc=o.firstChild;sc.addEventListener('pointerdown',e=>{if(e.target===sc)closePanel()});
  const keyH=e=>{e.stopPropagation();if(e.key==='Escape'||e.key==='Backspace'||e.key==='GoBack'||e.key==='BrowserBack'){e.preventDefault();closePanel()}};
  sc.addEventListener('keydown',keyH);
  sc.addEventListener('keydown',e=>{const d={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[e.key];if(!d)return;e.preventDefault();
    const bs=[...sc.querySelectorAll('button')],i=bs.indexOf(document.activeElement);bs[(i+d+bs.length)%bs.length].focus()});onOpen&&onOpen(sc);const f=sc.querySelector('button');f&&f.focus();
}
function closePanel(){$('#overlay').innerHTML='';board.focus&&board.focus()}
function askNew(){
  if(!S.started||S.won){startGame(Date.now()%2147483647);return}
  panel(`<h2>Start a new game?</h2><p class="help" style="text-align:center">This game will count as lost.</p>
    <button class="cta" id="yes">New game</button><button class="cta ghost" id="no">Keep playing</button>`,sc=>{
    sc.querySelector('#yes').onclick=()=>{closePanel();startGame(Date.now()%2147483647)};sc.querySelector('#no').onclick=closePanel});
}
function showWin(){
  panel(`<h2 class="win">You won!</h2><div class="rows">
    <span>Score</span><span>${S.score}</span><span>Time bonus</span><span>${S.bonus}</span>
    <span class="total">Total</span><span class="total">${S.final}</span>
    <span>Time</span><span>${fmt(S.time)}</span><span>Moves</span><span>${S.moves}</span>
    <span>Best score</span><span>${stats.best}</span></div>
    <button class="cta" id="again">Play again</button>`,sc=>{sc.querySelector('#again').onclick=()=>{closePanel();startGame(Date.now()%2147483647)}});
}
function showStats(){
  const pct=stats.played?Math.round(stats.won*100/stats.played):0;
  panel(`<h2>Your records</h2><div class="rows">
    <span>Games played</span><span>${stats.played}</span><span>Games won</span><span>${stats.won}</span>
    <span>Win rate</span><span>${pct}%</span><span>Best score</span><span>${stats.best}</span>
    <span>Fastest win</span><span>${stats.fastest?fmt(stats.fastest):'-'}</span></div>
    <button class="cta" id="ok">Close</button>`,sc=>{sc.querySelector('#ok').onclick=closePanel});
}
function showSettings(){
  const seg=(key,opts)=>`<div class="seg" data-k="${key}">${opts.map(([v,l,sw])=>`<button data-v="${v}" class="${String(prefs[key])===String(v)?'on':''}">${sw?`<span class="sw" style="background:${sw}"></span>`:''}${l}</button>`).join('')}</div>`;
  panel(`<h2>Settings</h2>
    <h3>Cards to draw</h3>${seg('draw',[[1,'Draw 1'],[3,'Draw 3']])}
    <h3>Table colour</h3>${seg('table',[['green','Emerald','#11a36b'],['blue','Ocean','#2f7fe0'],['purple','Royal','#8b5cf6'],['wine','Ruby','#d1405a'],['slate','Night','#55657a']])}
    <h3>Card back</h3>${seg('back',[['blue','Blue','#3b82f6'],['purple','Purple','#a855f7'],['red','Red','#f43f5e'],['black','Black','#475569']])}
    <h3>Sound</h3>${seg('sound',[[true,'On'],[false,'Off']])}
    <h3>How to play</h3>
    <p class="help">Build four piles from Ace to King, one per suit. In the columns, stack cards down in alternating colours. Only a King can go in an empty column. Tap a card to send it to the best spot, or drag it.</p>
    <p class="help">On the TV remote: <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move, <kbd>OK</kbd> picks a card up, <kbd>OK</kbd> again drops it (OK twice on the same card sends it to the best spot), <kbd>Back</kbd> cancels. Keyboard: <kbd>H</kbd> hint, <kbd>U</kbd> undo, <kbd>N</kbd> new game.</p>
    <p class="help">Deal number ${S.seed}</p>
    <button class="cta" id="done">Done</button>`,sc=>{
      sc.querySelectorAll('.seg').forEach(g=>g.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
        const k=g.dataset.k;let v=b.dataset.v;if(k==='draw')v=+v;if(k==='sound')v=v==='true';
        prefs[k]=v;store.set('cts.prefs',prefs);g.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));applyPrefs();
        if(k==='draw'&&S.draw!==v){if(!S.started){startGame(S.seed)}else toast(`Draw ${v} starts with your next game`)}}));
      sc.querySelector('#done').onclick=closePanel});
}
function applyPrefs(){app.className=app.className.replace(/\b[tb]-\w+/g,'').trim()+` t-${prefs.table} b-${prefs.back}`+(app.classList.contains('keys')?' keys':'')}
$('#newBtn').onclick=askNew;
$('#replayBtn').onclick=()=>startGame(S.seed,true);
$('#hintBtn').onclick=hint;
$('#undoBtn').onclick=doUndo;
$('#setBtn').onclick=showSettings;
$('#statsBtn').onclick=showStats;
$('#autoBtn').onclick=()=>{if(canAuto())autoFinish();else toast('Turn over every card in the columns first')};
addEventListener('resize',()=>{if(!dealing)render(true)});

/* ---------- inside Cable TV: wins go to the Games menu, Back leaves ---------- */
const inApp=!!window.CableGames;
function report(){try{window.CableGames&&window.CableGames.record('solitaireplus',stats.won)}catch(e){}}
function leave(){try{if(window.CableGames){window.CableGames.exit();return}}catch(e){}}
if(inApp){app.classList.add('keys');$('#keysHelp').textContent='Remote: arrows move, OK picks up and puts down, OK twice sends a card home, Down to the buttons, Back leaves'}

/* ---------- boot ---------- */
buildSlots(); applyPrefs();
const saved=store.get('cts.game',null);
if(saved&&saved.tab&&!saved.won){S=saved;buildCards();render(true)}
else startGame(Date.now()%2147483647);
startTimer(); report();
if(document.fonts)document.fonts.ready.then(()=>{if(!dealing)render(true)});
})();
