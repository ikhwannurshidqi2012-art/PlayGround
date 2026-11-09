(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const TILE = 32, WORLD_W = 80, WORLD_H = 30;
  const SAVE_KEY = 'sproutbound-save-v1';
  const blockDefs = {
    1:{name:'Grass',emoji:'🟩',color:'#83b967',hardness:1},
    2:{name:'Soft soil',emoji:'🟫',color:'#aa7955',hardness:1},
    3:{name:'Pebble stone',emoji:'🪨',color:'#8b9b9b',hardness:2},
    4:{name:'Sunwood',emoji:'🪵',color:'#bd8751',hardness:1},
    5:{name:'Leafy',emoji:'🍃',color:'#5d9c67',hardness:1},
    6:{name:'Daisy',emoji:'🌼',color:'#f8d870',hardness:1},
    7:{name:'Seed',emoji:'🌰',color:'#986b49',hardness:0}
  };
  let world, plants, inventory, selected = 0, player, cameraX = 0, cameraY = 0;
  let canvasW = 800, canvasH = 500, dpr = 1, last = performance.now(), saveTimer, toastTimer, particles = [], clouds = [];
  let keys = {}, touch = {left:false,right:false}, plantedCount = 0, questDone = false, soundOn = false;

  function blankWorld(){
    const arr = Array.from({length:WORLD_H},()=>Array(WORLD_W).fill(0));
    for(let x=0;x<WORLD_W;x++){
      const surface = Math.round(19 + Math.sin(x*.17)*1.15 + Math.sin(x*.047)*1.5 + (Math.random()-.5)*.8);
      for(let y=surface;y<WORLD_H;y++) arr[y][x] = y===surface ? 1 : y<surface+5 ? 2 : (Math.random()<.12 ? 3 : (y>surface+11 && Math.random()<.18 ? 3:2));
      // natural grass tufts and flower sprigs
      if(Math.random()<.24 && x>3 && x<WORLD_W-4) arr[surface-1][x]=6;
    }
    // little stone pockets
    for(let i=0;i<60;i++){let x=2+Math.random()*(WORLD_W-4)|0,y=22+Math.random()*7|0;if(arr[y]&&arr[y][x]===2)arr[y][x]=3;}
    // landmark trees
    for(const x of [10,23,39,57,70]) growTree(arr,x);
    return arr;
  }
  function growTree(arr,x){
    let ground=0;for(let y=0;y<WORLD_H;y++)if(arr[y][x]===1){ground=y;break;}
    for(let y=ground-1;y>ground-5;y--) if(y>=0) arr[y][x]=4;
    for(let yy=ground-8;yy<ground-3;yy++) for(let xx=x-2;xx<=x+2;xx++){
      if(yy>=0&&xx>=0&&xx<WORLD_W&&Math.abs(xx-x)+Math.abs(yy-(ground-6))<4&&arr[yy][xx]===0)arr[yy][xx]=5;
    }
    if(ground-7>=0&&arr[ground-7][x]===0)arr[ground-7][x]=5;
  }
  function freshGame(){
    world=blankWorld();plants={}; inventory=[{id:1,count:10},{id:2,count:12},{id:3,count:7},{id:4,count:8},{id:5,count:8},{id:7,count:5}];selected=0;
    let ground=0;for(let y=0;y<WORLD_H;y++)if(world[y][8]===1){ground=y;break;}
    player={x:8*TILE,y:(ground-2)*TILE,w:21,h:29,vx:0,vy:0,onGround:false,face:1,walk:0}; plantedCount=0;questDone=false;particles=[];save();
  }
  function load(){
    try{const data=JSON.parse(localStorage.getItem(SAVE_KEY));if(data&&data.world&&data.world.length===WORLD_H){world=data.world;plants=data.plants||{};inventory=data.inventory||[];selected=data.selected||0;player=data.player||{x:8*TILE,y:300,w:21,h:29,vx:0,vy:0,onGround:false,face:1,walk:0};plantedCount=data.plantedCount||0;questDone=data.questDone||false;return true;}}catch(e){}
    return false;
  }
  function save(){
    try{localStorage.setItem(SAVE_KEY,JSON.stringify({world,plants,inventory,selected,player,plantedCount,questDone}));document.getElementById('saveStatus').textContent='All changes saved';}catch(e){document.getElementById('saveStatus').textContent='Playing this session';}
  }
  function scheduleSave(){document.getElementById('saveStatus').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(save,500);}
  if(!load())freshGame();
  clouds=Array.from({length:8},(_,i)=>({x:i*210+Math.random()*100,y:25+Math.random()*125,s:.65+Math.random()*.8}));

  function resize(){
    const r=canvas.getBoundingClientRect();dpr=Math.min(window.devicePixelRatio||1,2);canvasW=r.width;canvasH=r.height;
    canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize',resize);resize();
  function solidAt(tx,ty){if(tx<0||tx>=WORLD_W||ty>=WORLD_H)return true;if(ty<0)return false;return world[ty][tx]!==0;}
  function intersectsSolid(x,y,w,h){const l=Math.floor(x/TILE),r=Math.floor((x+w-1)/TILE),t=Math.floor(y/TILE),b=Math.floor((y+h-1)/TILE);for(let yy=t;yy<=b;yy++)for(let xx=l;xx<=r;xx++)if(solidAt(xx,yy))return true;return false;}
  function movePlayer(dt){
    const left=keys.ArrowLeft||keys.KeyA||touch.left,right=keys.ArrowRight||keys.KeyD||touch.right;
    let dir=(right?1:0)-(left?1:0);player.vx=dir*205;if(dir){player.face=dir;player.walk+=dt*12;}
    player.vy=Math.min(player.vy+1500*dt,720);
    let nx=player.x+player.vx*dt;
    if(!intersectsSolid(nx,player.y,player.w,player.h))player.x=nx;else player.vx=0;
    let ny=player.y+player.vy*dt;
    if(!intersectsSolid(player.x,ny,player.w,player.h)){player.y=ny;player.onGround=false;}else{
      if(player.vy>0){player.y=Math.ceil((player.y+player.h)/TILE)*TILE-player.h;player.onGround=true;}else player.y=Math.ceil(player.y/TILE)*TILE;
      player.vy=0;
    }
    player.x=Math.max(TILE,Math.min(WORLD_W*TILE-player.w-TILE,player.x));
  }
  function jump(){if(player.onGround){player.vy=-525;player.onGround=false;}}
  function centerCam(){cameraX=player.x+player.w/2-canvasW/2;cameraY=player.y+player.h/2-canvasH*.56;cameraX=Math.max(0,Math.min(WORLD_W*TILE-canvasW,cameraX));cameraY=Math.max(-120,Math.min(WORLD_H*TILE-canvasH,cameraY));}
  function drawBackground(time){
    const sky=ctx.createLinearGradient(0,0,0,canvasH);sky.addColorStop(0,'#83cfe4');sky.addColorStop(.64,'#c4e9dc');sky.addColorStop(1,'#e7ebc7');ctx.fillStyle=sky;ctx.fillRect(0,0,canvasW,canvasH);
    // sun halo
    ctx.fillStyle='#fff4c573';ctx.beginPath();ctx.arc(canvasW*.78,canvasH*.2,57,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff1b7';ctx.beginPath();ctx.arc(canvasW*.78,canvasH*.2,32,0,Math.PI*2);ctx.fill();
    clouds.forEach(c=>{let x=(c.x-time*.008)%(canvasW+210);if(x< -100)x+=canvasW+210;drawCloud(x,c.y,c.s);});
    ctx.fillStyle='#95ceae';ctx.beginPath();ctx.moveTo(0,canvasH*.64);for(let x=0;x<=canvasW+20;x+=20)ctx.lineTo(x,canvasH*.61+Math.sin((x+cameraX*.12)*.005)*18+Math.sin(x*.012)*7);ctx.lineTo(canvasW,canvasH);ctx.lineTo(0,canvasH);ctx.fill();
    ctx.fillStyle='#a7d8aa';ctx.beginPath();ctx.moveTo(0,canvasH*.75);for(let x=0;x<=canvasW+20;x+=20)ctx.lineTo(x,canvasH*.73+Math.sin((x+cameraX*.22)*.007)*13);ctx.lineTo(canvasW,canvasH);ctx.lineTo(0,canvasH);ctx.fill();
  }
  function drawCloud(x,y,s){ctx.fillStyle='#f7ffefb0';ctx.beginPath();ctx.ellipse(x,y,34*s,11*s,0,0,Math.PI*2);ctx.ellipse(x-17*s,y-7*s,17*s,13*s,0,0,Math.PI*2);ctx.ellipse(x+3*s,y-12*s,22*s,17*s,0,0,Math.PI*2);ctx.ellipse(x+22*s,y-4*s,17*s,11*s,0,0,Math.PI*2);ctx.fill();}
  function drawTile(id,x,y,tx,ty){
    const px=x*TILE-cameraX,py=y*TILE-cameraY;
    if(id===1){ctx.fillStyle='#8c654d';ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle='#80b965';ctx.fillRect(px,py,TILE,8);ctx.fillStyle='#a2d17a';ctx.fillRect(px,py,TILE,3);ctx.fillStyle='#6b9f59';ctx.fillRect(px,py+7,TILE,2);}
    else if(id===2){ctx.fillStyle='#a97853';ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle='#bd906a';ctx.fillRect(px+3,py+7,5,3);ctx.fillRect(px+20,py+18,7,3);ctx.fillStyle='#90664b';ctx.fillRect(px+12,py+25,4,3);}
    else if(id===3){ctx.fillStyle='#829493';ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle='#a9b5aa';ctx.fillRect(px+4,py+5,9,4);ctx.fillRect(px+19,py+18,8,4);ctx.fillStyle='#687c7d';ctx.fillRect(px+5,py+21,6,3);ctx.fillRect(px+22,py+8,4,3);}
    else if(id===4){ctx.fillStyle='#986744';ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle='#c48d56';ctx.fillRect(px+7,py,4,TILE);ctx.fillStyle='#7d553e';ctx.fillRect(px+22,py,3,TILE);}
    else if(id===5){ctx.fillStyle='#5e9d66';ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle='#78b779';ctx.fillRect(px+4,py+3,11,8);ctx.fillRect(px+18,py+17,10,9);ctx.fillStyle='#4b875b';ctx.fillRect(px+16,py+4,8,7);}
    else if(id===6){ctx.fillStyle='#80b965';ctx.fillRect(px,py,TILE,8);ctx.fillStyle='#f6d76f';ctx.fillRect(px+14,py-5,4,5);ctx.fillStyle='#5d9d66';ctx.fillRect(px+15,py-10,2,7);ctx.fillStyle='#fff2ca';ctx.fillRect(px+12,py-16,6,6);ctx.fillRect(px+8,py-12,5,6);ctx.fillRect(px+17,py-12,5,6);ctx.fillStyle='#e7b952';ctx.fillRect(px+13,py-12,5,5);}
    // subtle block seams
    if(id!==6){ctx.strokeStyle='#344f4320';ctx.lineWidth=1;ctx.strokeRect(px+.5,py+.5,TILE-1,TILE-1);}
  }
  function drawPlant(key,p,time){const [tx,ty]=key.split(',').map(Number),px=tx*TILE-cameraX,py=ty*TILE-cameraY;const age=(Date.now()-p.time);const stage=Math.min(3,Math.floor(age/18000));const stem=8+stage*5;ctx.fillStyle='#4b915d';ctx.fillRect(px+15,py-stem,3,stem);ctx.fillStyle='#73b56e';if(stage>0){ctx.fillRect(px+8,py-stem+5,8,4);ctx.fillRect(px+17,py-stem+10,7,4);}if(stage>=2){ctx.fillStyle='#fff2c6';ctx.fillRect(px+11,py-stem-7,10,9);ctx.fillStyle=stage>=3?'#e7a743':'#f2d66b';ctx.fillRect(px+14,py-stem-4,5,5);}if(stage>=3){ctx.fillStyle='#edbd62';ctx.beginPath();ctx.arc(px+22,py-stem+9,3,0,Math.PI*2);ctx.fill();}p.stage=stage;}
  function drawPlayer(){
    const x=Math.round(player.x-cameraX),y=Math.round(player.y-cameraY),walk=Math.sin(player.walk)*2.5;
    // shadow
    ctx.fillStyle='#416c5640';ctx.beginPath();ctx.ellipse(x+player.w/2,y+player.h+2,14,4,0,0,Math.PI*2);ctx.fill();
    ctx.save();if(player.face<0){ctx.translate(x+player.w,0);ctx.scale(-1,1);ctx.translate(-x,0);}
    // legs
    ctx.fillStyle='#597b69';ctx.fillRect(x+4,y+20+Math.max(0,walk),6,9-Math.max(0,walk));ctx.fillRect(x+12,y+20+Math.max(0,-walk),6,9-Math.max(0,-walk));ctx.fillStyle='#e4a96b';ctx.fillRect(x+3,y+27,8,3);ctx.fillRect(x+11,y+27,8,3);
    // body
    ctx.fillStyle='#f4bf79';ctx.fillRect(x+3,y+10,16,12);ctx.fillStyle='#edaa68';ctx.fillRect(x+4,y+18,14,4);ctx.fillStyle='#fff4dd';ctx.fillRect(x+4,y+12,14,6);
    // head and hair cap
    ctx.fillStyle='#f4c38b';ctx.fillRect(x+4,y+1,14,12);ctx.fillStyle='#764d3d';ctx.fillRect(x+3,y,15,5);ctx.fillRect(x+2,y+3,4,6);ctx.fillRect(x+14,y+3,4,3);
    ctx.fillStyle='#3e514d';ctx.fillRect(x+7,y+6,2,2);ctx.fillRect(x+14,y+6,2,2);ctx.fillStyle='#dc8f6c';ctx.fillRect(x+10,y+9,3,1);
    ctx.fillStyle='#8ab977';ctx.fillRect(x+3,y+12,16,3);ctx.fillStyle='#a5d084';ctx.fillRect(x+3,y+12,16,1);
    ctx.restore();
  }
  function drawParticles(dt){particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=250*dt;p.life-=dt;ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x-cameraX,p.y-cameraY,4,4);});ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);}
  function render(now){const dt=Math.min(.035,(now-last)/1000);last=now;movePlayer(dt);centerCam();drawBackground(now);
    const sx=Math.max(0,Math.floor(cameraX/TILE)-1),ex=Math.min(WORLD_W,Math.ceil((cameraX+canvasW)/TILE)+1),sy=Math.max(0,Math.floor(cameraY/TILE)-1),ey=Math.min(WORLD_H,Math.ceil((cameraY+canvasH)/TILE)+1);
    for(let y=sy;y<ey;y++)for(let x=sx;x<ex;x++){const id=world[y][x];if(id)drawTile(id,x,y,x,y);}
    for(const [k,p] of Object.entries(plants))drawPlant(k,p,now);
    // soft little glints and drifting seeds
    ctx.fillStyle='#fff8c788';for(let i=0;i<5;i++){const xx=((i*197+now*.018)%(canvasW+30));const yy=canvasH*.72+Math.sin(now*.001+i*2)*16;if(i%2===0)ctx.fillRect(xx,yy,2,2);}
    drawPlayer();drawParticles(dt);requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
  function updateSlots(){const el=document.getElementById('slots');el.innerHTML='';inventory.forEach((item,i)=>{const d=blockDefs[item.id];const b=document.createElement('button');b.className='slot'+(i===selected?' selected':'');b.title=`${d.name} — ${item.count}`;b.setAttribute('aria-label',`${d.name}, ${item.count}`);b.innerHTML=`<span class="slot-key">${i+1}</span><span class="item-emoji">${d.emoji}</span><span class="item-count">${item.count}</span>`;b.onclick=()=>selectSlot(i);el.appendChild(b);});}
  function selectSlot(i){selected=(i+inventory.length)%inventory.length;updateSlots();scheduleSave();}
  function notify(message){const t=document.getElementById('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1900);}
  function setQuest(){const q=document.getElementById('questText'),p=document.getElementById('questProgress');if(questDone){q.textContent='A little garden is growing!';p.textContent='✓';}else{q.textContent='Plant your first seed';p.textContent=`${Math.min(plantedCount,1)}/1`;}}
  function itemAt(i){return inventory.find(x=>x.id===i);}
  function addItem(id,n=1){let e=itemAt(id);if(e)e.count+=n;else{inventory.push({id,count:n});}updateSlots();}
  function tileFromPointer(e){const r=canvas.getBoundingClientRect();return {x:Math.floor((e.clientX-r.left+cameraX)/TILE),y:Math.floor((e.clientY-r.top+cameraY)/TILE)};}
  function withinReach(tx,ty){const px=(player.x+player.w/2)/TILE,py=(player.y+player.h/2)/TILE;return Math.hypot(tx+.5-px,ty+.5-py)<5.2;}
  function breakBlock(tx,ty){if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H||!withinReach(tx,ty))return;let id=world[ty][tx];if(!id)return;world[ty][tx]=0;
    if(id===6)addItem(7,1);else if(id===1||id===2||id===3||id===4||id===5)addItem(id,1);
    for(let i=0;i<6;i++)particles.push({x:tx*TILE+Math.random()*TILE,y:ty*TILE+Math.random()*TILE,vx:(Math.random()-.5)*95,vy:-40-Math.random()*100,life:.45,max:.45,color:blockDefs[id]?.color||'#94bc75'});
    scheduleSave();
  }
  function placeBlock(tx,ty){if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H||!withinReach(tx,ty)||world[ty][tx])return;
    const item=inventory[selected];if(!item||item.count<=0){notify('That pocket is empty — dig a little more!');return;}
    const id=item.id;
    if(id===7){if(ty+1>=WORLD_H||![1,2].includes(world[ty+1][tx])){notify('Seeds need soft soil or grass beneath them.');return;}const key=`${tx},${ty}`;plants[key]={time:Date.now(),stage:0};plantedCount++;questDone=true;document.getElementById('questText').textContent='A little garden is growing!';document.getElementById('questProgress').textContent='✓';notify('Seed planted! Come back and see it grow 🌱');}
    else{world[ty][tx]=id;}
    item.count--;updateSlots();scheduleSave();
  }
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){canvas.setPointerCapture(e.pointerId);if(e.button===2)return;}const t=tileFromPointer(e);if(e.button===2||e.shiftKey||(e.pointerType==='touch'&&world[t.y]?.[t.x]===0&&inventory[selected]?.count>0)){placeBlock(t.x,t.y);}else{let plantKey=Object.keys(plants).find(k=>{const [x,y]=k.split(',').map(Number);return x===t.x&&y===t.y;});if(plantKey){const p=plants[plantKey];if(p.stage>=3){delete plants[plantKey];addItem(7,2);addItem(6,1);notify('Harvested! A daisy and two seeds 🌼');scheduleSave();}else notify('Growing nicely… give it a little time!');}else breakBlock(t.x,t.y);}});
  canvas.addEventListener('pointerup',e=>{if(e.pointerType==='touch'&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
  window.addEventListener('keydown',e=>{if(['Space','ArrowLeft','ArrowRight','ArrowUp'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW')jump();if(/^Digit[1-6]$/.test(e.code))selectSlot(Number(e.code.slice(5))-1);});
  window.addEventListener('keyup',e=>{keys[e.code]=false;});window.addEventListener('blur',()=>keys={});
  document.querySelectorAll('.touch-controls button').forEach(b=>{const c=b.dataset.control;const down=e=>{e.preventDefault();if(c==='jump')jump();else touch[c]=true;};const up=e=>{e.preventDefault();if(c!=='jump')touch[c]=false;};b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);b.addEventListener('pointercancel',up);});
  document.getElementById('plantBtn').onclick=()=>{const seedIndex=inventory.findIndex(x=>x.id===7);if(seedIndex<0){notify('No seeds in your pockets. Dig daisies to find some!');return;}selectSlot(seedIndex);notify('Seed selected! Right-click soil to plant.');};
  const help=document.getElementById('helpDialog');document.getElementById('helpBtn').onclick=()=>help.showModal();document.getElementById('closeHelp').onclick=()=>help.close();document.getElementById('gotIt').onclick=()=>help.close();
  document.getElementById('soundBtn').onclick=e=>{soundOn=!soundOn;e.currentTarget.textContent=soundOn?'♪':'♫';notify(soundOn?'Birdsong turned on (coming soon)':'Sound turned off');};
  document.getElementById('resetBtn').onclick=()=>{if(confirm('Start a fresh island? Your current island will be replaced.')){localStorage.removeItem(SAVE_KEY);freshGame();updateSlots();setQuest();notify('A fresh little island awaits!');}};
  updateSlots();setQuest();
})();
