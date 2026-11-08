(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');
  const W = canvas.width, H = canvas.height, WORLD = 2600, FLOOR = 454;
  const $ = id => document.getElementById(id);
  const ui = {
    intro: $('introOverlay'), start: $('startButton'), health: $('healthBar'), healthText: $('healthText'),
    shards: $('shardCount'), potions: $('potionCount'), loc: $('locationName'), state: $('stateLabel'), coords: $('coordinates'),
    objective: $('objectiveText'), progress: $('progressText'), progressFill: $('progressFill'), route: $('routeStatus'),
    toast: $('toast'), bossBanner: $('bossBanner'), bossHealth: $('bossHealth'), bossFill: $('bossHealthFill'), bossText: $('bossHealthText'),
    end: $('endOverlay'), endTitle: $('endTitle'), endKicker: $('endKicker'), endText: $('endText'), restart: $('restartButton'),
    whisper: $('whisperText'), tip: $('tipText'), sound: $('soundButton'), soundIcon: $('soundIcon')
  };
  const keys = Object.create(null);
  const platforms = [{x:300,y:385,w:130},{x:535,y:335,w:115},{x:755,y:390,w:150},{x:1040,y:360,w:135},{x:1285,y:320,w:125},{x:1515,y:382,w:150},{x:1740,y:342,w:125},{x:2055,y:390,w:150},{x:2350,y:350,w:130}];
  const initialEnemies = [
    {x:445,y:FLOOR,w:24,h:30,hp:2,phase:0}, {x:900,y:FLOOR,w:24,h:30,hp:2,phase:1.5},
    {x:1185,y:FLOOR,w:24,h:30,hp:2,phase:2.5}, {x:1600,y:FLOOR,w:24,h:30,hp:2,phase:.7},
    {x:1810,y:FLOOR,w:24,h:30,hp:2,phase:3}
  ];
  const trees = [];
  for(let i=0;i<42;i++) trees.push({x:i*78-40+(i%3)*16,h:125+(i*37%100),w:19+(i*13%20),tone:i%3});
  let player, enemies, boss, shards, camera, active, ended, time, particles, projectiles, attackFlash, toastTimer, lastTime, soundOn, audio;
  let collected = new Set();
  const reset = () => {
    player={x:75,y:FLOOR,w:22,h:34,vx:0,vy:0,health:5,maxHealth:5,facing:1,grounded:true,invuln:0,attackCd:0,attackTime:0,potions:2,shards:0,walk:0};
    enemies=initialEnemies.map(e=>({...e,alive:true,hitFlash:0}));
    boss={x:2290,y:FLOOR,w:60,h:72,hp:8,maxHp:8,alive:true,phase:0,attackTimer:2,hitFlash:0,telegraph:0};
    camera=0;time=0;particles=[];projectiles=[];attackFlash=0;ended=false;collected=new Set();
    updateHud(); setObjective(); ui.bossHealth.classList.remove('show');ui.bossBanner.classList.remove('show');ui.end.classList.add('hidden');
  };
  reset(); active=false; soundOn=false; lastTime=performance.now();

  function updateHud(){
    ui.health.innerHTML='';
    for(let i=0;i<player.maxHealth;i++){const s=document.createElement('span');s.className='heart-segment'+(i<player.health?' full':'');ui.health.appendChild(s)}
    ui.healthText.textContent=`${player.health} / ${player.maxHealth}`;
    ui.shards.textContent=String(player.shards).padStart(2,'0');ui.potions.textContent=`× ${player.potions}`;
  }
  function setObjective(){
    const alive=enemies.filter(e=>e.alive).length;
    if(boss.alive){
      if(player.x<480){ui.objective.textContent='Follow the lanterns into the wood';ui.tip.innerHTML='<span class="tip-spark">✦</span> Stay light on your feet, wanderer.'}
      else if(player.x<1810){ui.objective.textContent=`Find the old road · ${alive} wisp${alive===1?'':'s'} remain`;ui.tip.innerHTML='<span class="tip-spark">✦</span> A clean strike will scatter the restless.'}
      else {ui.objective.textContent='The Hollow King stirs beyond the veil';ui.tip.innerHTML='<span class="tip-spark">✦</span> Keep moving when the ground begins to glow.'}
    }else{ui.objective.textContent='The old road is open. The wood falls quiet.'}
  }
  let toastId=0;
  function toast(message){ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toastId);toastId=setTimeout(()=>ui.toast.classList.remove('show'),1550)}
  function beep(freq=200,duration=.08,type='sine',volume=.035){if(!soundOn)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.value=volume;o.connect(g);g.connect(audio.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.stop(audio.currentTime+duration)}catch(_){}}
  function startGame(){if(ended)return;active=true;ui.intro.classList.add('hidden');toast('THE OLD ROAD REMEMBERS');beep(260,.16,'triangle')}
  ui.start.addEventListener('click',startGame);
  ui.restart.addEventListener('click',()=>{reset();active=true;ui.intro.classList.add('hidden');toast('THE ROAD CALLS AGAIN')});
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.soundIcon.textContent=soundOn?'♫':'♩';ui.sound.style.borderColor=soundOn?'#716044':'';if(soundOn)beep(390,.1,'sine')});

  function jump(){if(!active||ended)return;if(player.grounded){player.vy=-430;player.grounded=false;beep(240,.07,'triangle',.02)}}
  function attack(){if(!active||ended)return;if(player.attackCd>0)return;player.attackCd=.34;player.attackTime=.2;beep(210,.08,'sawtooth',.018);
    const hit=(target,isBoss=false)=>{const dx=target.x-player.x;const reach=isBoss?80:60;if(Math.abs(dx)<reach&&((dx>=0?1:-1)===player.facing||Math.abs(dx)<20)){
      target.hp--;target.hitFlash=.18;burst(target.x+(target.w||24)/2,target.y-(target.h||30)/2,isBoss?'#d18b80':'#c6a579',9);
      if(isBoss){boss.hp=Math.max(0,boss.hp);ui.bossFill.style.width=(boss.hp/boss.maxHp*100)+'%';ui.bossText.textContent=`${boss.hp} / ${boss.maxHp}`;if(boss.hp<=0)win()}
      else if(target.hp<=0){target.alive=false;player.shards++;updateHud();beep(540,.14,'sine',.025);toast('A GLOAM SHARD · +1')}
    }};
    enemies.forEach(e=>{if(e.alive)hit(e)});if(boss.alive&&player.x>1840)hit(boss,true);
  }
  function heal(){if(!active||ended)return;if(!player.potions){toast('NO TONICS LEFT');return}if(player.health>=player.maxHealth){toast('VITALITY IS ALREADY WHOLE');return}player.potions--;player.health=Math.min(player.maxHealth,player.health+2);updateHud();burst(player.x+10,player.y-18,'#9b7896',12);beep(440,.2,'sine',.03);toast('WITCH’S TONIC · +2 VITALITY')}
  function takeDamage(amount=1){if(player.invuln>0||ended)return;player.health=Math.max(0,player.health-amount);player.invuln=1.05;player.vy=-180;player.vx=-player.facing*95;updateHud();burst(player.x+10,player.y-16,'#c45f60',8);beep(100,.22,'square',.03);if(player.health<=0)finish(false)}
  function win(){boss.alive=false;ended=true;active=false;ui.bossHealth.classList.remove('show');ui.endTitle.textContent='A SOUL SET FREE';ui.endKicker.textContent='THE WOOD FALLS QUIET';ui.endText.textContent=`You gathered ${player.shards} Gloam Shards. The path beyond is yours now.`;ui.end.classList.remove('hidden');beep(520,.4,'triangle',.04);setTimeout(()=>beep(680,.55,'sine',.03),180)}
  function finish(victory){ended=true;active=false;ui.endTitle.textContent=victory?'A SOUL SET FREE':'THE DARK TAKES YOU';ui.endKicker.textContent=victory?'THE WOOD FALLS QUIET':'YOUR LIGHT HAS GONE OUT';ui.endText.textContent=victory?'The path beyond is yours now.':'The wood keeps what it is given. But the road remains.';ui.end.classList.remove('hidden')}
  function burst(x,y,color,count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*125;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-35,life:.25+Math.random()*.42,max:.65,color,size:2+Math.random()*3})}}
  function inputDown(key){if(key==='a'||key==='arrowleft')keys.left=true;if(key==='d'||key==='arrowright')keys.right=true;if(key===' '||key==='w'||key==='arrowup')jump();if(key==='j'||key==='k')attack();if(key==='e')heal()}
  function inputUp(key){if(key==='a'||key==='arrowleft')keys.left=false;if(key==='d'||key==='arrowright')keys.right=false}
  window.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if([' ','arrowleft','arrowright','arrowup'].includes(key))e.preventDefault();if(!active&&!ended&&(key==='enter'||key===' ')){startGame();return}inputDown(key)});
  window.addEventListener('keyup',e=>inputUp(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.left=keys.right=false});
  document.querySelectorAll('[data-control]').forEach(button=>{
    const ctrl=button.dataset.control;
    const down=e=>{e.preventDefault();if(ctrl==='left')keys.left=true;else if(ctrl==='right')keys.right=true;else if(ctrl==='jump')jump();else if(ctrl==='attack')attack();else if(ctrl==='heal')heal();button.setPointerCapture?.(e.pointerId)};
    const up=e=>{e.preventDefault();if(ctrl==='left')keys.left=false;if(ctrl==='right')keys.right=false};
    button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
  });

  function update(dt){time+=dt;if(!active||ended){return}
    player.attackCd=Math.max(0,player.attackCd-dt);player.attackTime=Math.max(0,player.attackTime-dt);player.invuln=Math.max(0,player.invuln-dt);
    const move=(keys.right?1:0)-(keys.left?1:0);player.vx=move*178;if(move)player.facing=move;player.walk+=Math.abs(player.vx)*dt*.075;
    player.x=Math.max(0,Math.min(WORLD-player.w,player.x+player.vx*dt));
    const oldY=player.y;player.vy=Math.min(620,player.vy+1050*dt);player.y+=player.vy*dt;player.grounded=false;
    if(player.y>=FLOOR){player.y=FLOOR;player.vy=0;player.grounded=true}
    if(player.vy>=0){for(const p of platforms){if(player.x+player.w>p.x&&player.x<p.x+p.w&&oldY<=p.y&&player.y>=p.y){player.y=p.y;player.vy=0;player.grounded=true;break}}}
    enemies.forEach(e=>{if(!e.alive)return;e.hitFlash=Math.max(0,e.hitFlash-dt);e.x+=Math.sin(time*1.7+e.phase)*17*dt;if(Math.abs(e.x-player.x)<28&&Math.abs(e.y-player.y)<45)takeDamage()});
    if(player.x>1860&&boss.alive){ui.bossHealth.classList.add('show');ui.bossBanner.classList.remove('show');boss.hitFlash=Math.max(0,boss.hitFlash-dt);boss.attackTimer-=dt;
      if(boss.attackTimer<=.75&&boss.attackTimer>0)boss.telegraph=.75-boss.attackTimer;
      if(boss.attackTimer<=0){boss.attackTimer=2.1+Math.random()*.5;boss.telegraph=0;projectiles.push({x:boss.x-12,y:FLOOR-43,vx:-235,life:5});burst(boss.x,FLOOR-44,'#be6964',7);beep(130,.18,'sawtooth',.025)}
      if(boss.attackTimer>0)boss.x=2280+Math.sin(time*.6)*20;
    }
    projectiles=projectiles.filter(p=>{p.x+=p.vx*dt;p.life-=dt;if(Math.abs(p.x-(player.x+11))<20&&Math.abs(p.y-(player.y-17))<24){takeDamage();return false}return p.life>0&&p.x>camera-50});
    particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;return p.life>0});
    const target=Math.max(0,Math.min(WORLD-W,camera+((player.x-camera)>W*.58?player.x-camera-W*.58:(player.x-camera)<W*.25?player.x-camera-W*.25:0)));
    camera+=(target-camera)*Math.min(1,dt*4.5);
    const progress=Math.min(100,Math.floor(player.x/(WORLD-220)*100));ui.progress.textContent=progress+'%';ui.progressFill.style.width=progress+'%';ui.coords.textContent=String(Math.floor(player.x/10)).padStart(3,'0')+' M';
    ui.loc.textContent=player.x>1880?'THE KING’S THRESHOLD':player.x>840?'THE WEEPING GROVE':'THE MOURNING PATH';ui.state.textContent=player.x>1860&&boss.alive?'BOSS ENCOUNTER':'EXPLORE';ui.route.textContent=player.x>1850?'THE THRONE IN SIGHT':player.x>500?'ROAD CHARTED':'ROAD UNCHARTED';
    if(player.x>1850&&boss.alive&&!ui.bossBanner.classList.contains('shown')){ui.bossBanner.classList.add('show','shown');setTimeout(()=>ui.bossBanner.classList.remove('show'),2000);toast('THE HOLLOW KING · STRIKE WHEN IT DRAWS NEAR');}
    if(player.x>1860&&boss.alive&&player.x>WORLD-80)player.x=WORLD-80;
    if(Math.floor(player.x/360)>Math.floor((player.x-player.vx*dt)/360))setObjective();
    if(Math.random()<dt*.8&&active){const wx=camera+Math.random()*W;particles.push({x:wx,y:130+Math.random()*260,vx:-4,vy:-5,life:1.5+Math.random()*2,max:3,color:'#9e8e89',size:1+Math.random()*2,mote:true})}
  }

  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
  function drawBackground(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#10131c');g.addColorStop(.52,'#20202a');g.addColorStop(1,'#30262a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // distant moon and drifting haze
    ctx.fillStyle='#bba98b';ctx.globalAlpha=.095;ctx.beginPath();ctx.arc(756-camera*.025,113,47,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    for(let i=0;i<5;i++){const x=((i*270-camera*.12+time*3)%(W+260)+W+260)%(W+260)-90;ctx.fillStyle=i%2?'#55505a':'#615661';ctx.globalAlpha=.105;ctx.fillRect(x,230+Math.sin(time*.3+i)*8,170,28);ctx.globalAlpha=1}
    // far tree line
    trees.forEach((t,i)=>{const x=t.x-camera*.28;if(x<-70||x>W+70)return;const base=405;ctx.fillStyle=['#20202a','#24212b','#1d2029'][t.tone];ctx.fillRect(x,base-t.h,t.w, t.h+27);ctx.fillRect(x-18,base-t.h+22,t.w+36,11);ctx.fillRect(x-10,base-t.h+46,t.w+20,10);ctx.fillStyle='#171923';ctx.fillRect(x+4,base-t.h+22,3,t.h);ctx.fillRect(x-25,base-4,t.w+54,9)});
    // foreground thorn silhouettes
    for(let i=0;i<18;i++){const x=i*93-(camera*.62%93);ctx.fillStyle='#191920';ctx.fillRect(x,365,4,91);ctx.beginPath();ctx.moveTo(x+2,365);ctx.lineTo(x-16,389);ctx.lineTo(x+3,382);ctx.lineTo(x+18,395);ctx.closePath();ctx.fill()}
    // ground
    rect(0,FLOOR,W,H-FLOOR,'#17171e');rect(0,FLOOR,W,6,'#5e4d4a');rect(0,FLOOR+6,W,2,'#9a7460');
    for(let x=-(camera%42);x<W;x+=42){rect(x,FLOOR+13,22,2,'#28232a');rect(x+15,FLOOR+31,13,2,'#242229');rect(x+4,FLOOR+53,7,2,'#30252a');}
    // little bones, roots and candles
    for(let x=90-Math.floor(camera/145)*145;x<W;x+=145){rect(x,FLOOR+13,2,12,'#423439');rect(x+7,FLOOR+18,2,8,'#423439');rect(x+3,FLOOR+20,5,2,'#423439');if(Math.floor((x+camera)/145)%3===0){rect(x+36,FLOOR-13,4,13,'#5a493f');rect(x+35,FLOOR-18,6,5,'#c29b67');ctx.globalAlpha=.45+Math.sin(time*4+x)*.2;rect(x+35,FLOOR-22,6,5,'#e3b976');ctx.globalAlpha=1}}
    // platform slabs
    platforms.forEach(p=>{const x=p.x-camera;if(x+p.w<0||x>W)return;rect(x,p.y,p.w,8,'#69605c');rect(x,p.y+8,p.w,8,'#29272e');rect(x+4,p.y+16,4,14,'#25232a');rect(x+p.w-9,p.y+16,5,19,'#211f26');rect(x+8,p.y-2,p.w-16,2,'#b49776');for(let k=0;k<p.w;k+=27)rect(x+k+7,p.y+10,6,2,'#464047')});
    // glimmers
    for(let i=0;i<9;i++){let x=(i*127-camera*.42+time*7)%(W+40);rect(x,235+(i*43%170)+Math.sin(time+i)*4,2,2,'#b3a091')}
  }
  function drawPlayer(){
    const x=Math.round(player.x-camera), y=Math.round(player.y-player.h), flip=player.facing<0;
    if(player.invuln>0&&Math.floor(time*18)%2===0)ctx.globalAlpha=.48;
    ctx.save();if(flip){ctx.translate(x*2+player.w,0);ctx.scale(-1,1)}else ctx.translate(x,0);
    // shadow
    ctx.globalAlpha*=.35;rect(1,player.y-2,22,4,'#08090d');ctx.globalAlpha=player.invuln>0&&Math.floor(time*18)%2===0?.48:1;
    // cloak and hood
    rect(7,y+3,10,5,'#c4a47b');rect(5,y+7,15,12,'#66504b');rect(4,y+11,16,14,'#39323a');rect(3,y+19,18,8,'#292832');rect(2,y+26,8,7,'#24232b');rect(14,y+26,7,7,'#24232b');
    // face and eye
    rect(8,y+7,8,6,'#d0b38b');rect(14,y+10,2,2,'#d96f64');rect(6,y+5,13,3,'#211e27');rect(4,y+20,3,7,'#bc9d75');
    // sword held out while swinging
    if(player.attackTime>0){rect(16,y+14,16,3,'#d7c9ae');rect(29,y+11,3,8,'#98816a');rect(19,y+10,12,1,'#f1dfbf')}
    else{rect(18,y+15,3,10,'#bfa17e');rect(20,y+18,9,2,'#c9c0ad');rect(26,y+16,2,7,'#e4dac7')}
    // cloak stitching
    rect(8,y+14,2,8,'#9c7565');rect(8,y+31,5,3,'#736454');rect(16,y+31,5,3,'#736454');
    ctx.restore();ctx.globalAlpha=1;
    if(player.attackTime>0){ctx.strokeStyle='rgba(232,205,158,.78)';ctx.lineWidth=2;ctx.beginPath();const ax=x+(player.facing>0?24:-5),ay=y+17;ctx.arc(ax,ay,31,player.facing>0?-1.15:.15,player.facing>0?1.15:2.95);ctx.stroke();ctx.strokeStyle='rgba(208,151,121,.32)';ctx.lineWidth=6;ctx.beginPath();ctx.arc(ax,ay,28,player.facing>0?-1.1:.1,player.facing>0?1.1:3.05);ctx.stroke()}
  }
  function drawWisp(e){const x=Math.round(e.x-camera), bob=Math.sin(time*3+e.phase)*4, y=Math.round(e.y-e.h-5+bob);ctx.save();ctx.globalAlpha=e.hitFlash>0?1:.86;ctx.fillStyle='#aaa0a0';ctx.beginPath();ctx.moveTo(x+4,y+9);ctx.lineTo(x+8,y);ctx.lineTo(x+18,y+2);ctx.lineTo(x+24,y+12);ctx.lineTo(x+22,y+25);ctx.lineTo(x+17,y+21);ctx.lineTo(x+11,y+28);ctx.lineTo(x+7,y+22);ctx.lineTo(x+1,y+26);ctx.lineTo(x,y+15);ctx.closePath();ctx.fill();rect(x+6,y+10,3,3,'#eeaa90');rect(x+16,y+10,3,3,'#eeaa90');ctx.globalAlpha=.24;ctx.fillStyle='#c78178';ctx.beginPath();ctx.ellipse(x+12,y+17,19,23,0,0,Math.PI*2);ctx.fill();ctx.restore()}
  function drawBoss(){if(!boss.alive)return;const x=Math.round(boss.x-camera), bob=Math.sin(time*2.2)*5,y=FLOOR-boss.h+bob;ctx.save();ctx.globalAlpha=boss.hitFlash>0?1:.96;
    if(boss.attackTimer<.72){ctx.globalAlpha=.25+Math.sin(time*24)*.22;ctx.fillStyle='#ca6265';ctx.beginPath();ctx.ellipse(x-35,FLOOR-3,48,7,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
    // immense ragged mantle
    ctx.fillStyle='#17141c';ctx.beginPath();ctx.moveTo(x+8,y+24);ctx.lineTo(x+12,y+12);ctx.lineTo(x+23,y+4);ctx.lineTo(x+36,y+8);ctx.lineTo(x+48,y+21);ctx.lineTo(x+59,y+72);ctx.lineTo(x+47,y+66);ctx.lineTo(x+41,y+75);ctx.lineTo(x+31,y+66);ctx.lineTo(x+22,y+75);ctx.lineTo(x+15,y+65);ctx.lineTo(x+2,y+72);ctx.closePath();ctx.fill();
    // antler crown
    ctx.fillStyle='#756454';ctx.fillRect(x+19,y+4,4,17);ctx.fillRect(x+13,y+1,3,10);ctx.fillRect(x+10,y-2,3,7);ctx.fillRect(x+39,y+4,4,16);ctx.fillRect(x+46,y,3,11);ctx.fillRect(x+49,y-3,3,8);
    // skull
    ctx.fillStyle='#baa991';ctx.fillRect(x+21,y+12,21,24);ctx.fillStyle='#706257';ctx.fillRect(x+24,y+29,15,5);ctx.fillStyle='#2a2025';ctx.fillRect(x+23,y+19,7,6);ctx.fillRect(x+34,y+19,7,6);ctx.fillStyle='#d76e67';ctx.fillRect(x+25,y+21,4,3);ctx.fillRect(x+36,y+21,4,3);ctx.fillStyle='#2e262b';ctx.fillRect(x+28,y+32,3,5);ctx.fillRect(x+35,y+32,3,5);
    // ribs and regal sigil
    ctx.fillStyle='#67554c';for(let i=0;i<4;i++)ctx.fillRect(x+20+i%2*4,y+41+i*5,21-i%2*3,2);ctx.fillStyle='#b58c69';ctx.fillRect(x+29,y+43,5,8);ctx.fillRect(x+31,y+41,2,12);ctx.restore()}
  function draw(){drawBackground();
    // entrance stone markers
    for(const wx of [35,1840,2552]){const x=wx-camera;if(x>-45&&x<W+45){rect(x,345,8,109,'#332e33');rect(x-9,340,26,8,'#68564b');rect(x-5,335,18,5,'#9b7d61');rect(x+2,356,2,65,'#524444')}}
    // glowing shard drops
    const shardSpots=[620,1035,1460,2000];shardSpots.forEach((wx,i)=>{if(collected.has(i))return;const x=wx-camera,y=FLOOR-25-Math.sin(time*2+i)*3;ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);rect(-5,-5,10,10,'#9b81a8');rect(-2,-7,4,14,'#c3a7cb');ctx.restore();ctx.globalAlpha=.22;ctx.fillStyle='#b896c8';ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;if(Math.abs(player.x-wx)<18&&player.grounded){collected.add(i);player.shards++;updateHud();burst(wx,y,'#b6a0c5',8);beep(460,.15,'sine',.025);toast('GLOAM SHARD FOUND')}});
    enemies.forEach(e=>{if(e.alive)drawWisp(e)});drawBoss();
    projectiles.forEach(p=>{const x=p.x-camera;ctx.globalAlpha=.8;ctx.fillStyle='#dc756e';ctx.beginPath();ctx.arc(x,p.y,7,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(x,p.y,15,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;rect(x-10,p.y-2,5,4,'#f3c1a0')});
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/(p.max||.65))*(p.mote?.3:1);rect(p.x-camera,p.y,p.size,p.size,p.color)});ctx.globalAlpha=1;
    drawPlayer();drawMini();
  }
  function drawMini(){const w=mini.width,h=mini.height;mctx.clearRect(0,0,w,h);mctx.fillStyle='#0d0e15';mctx.fillRect(0,0,w,h);mctx.fillStyle='#25232a';mctx.fillRect(8,51,w-16,3);mctx.fillStyle='#78624e';mctx.fillRect(8,48,w-16,2);for(let i=0;i<8;i++){const x=15+i*34;mctx.fillStyle='#282530';mctx.fillRect(x,25+(i*17%20),7,27)}mctx.fillStyle='#4b4143';mctx.fillRect(w-27,35,13,17);mctx.fillStyle='#a76c67';mctx.fillRect(w-22,30,3,5);const px=8+(player.x/WORLD)*(w-20);mctx.fillStyle='#d7bd93';mctx.fillRect(px,43,4,10);mctx.fillStyle='#a477a0';enemies.forEach(e=>{if(e.alive){const ex=8+(e.x/WORLD)*(w-20);mctx.fillRect(ex,46,3,4)}});if(boss.alive){mctx.fillStyle='#c45d62';mctx.fillRect(w-25,42,6,10)}}
  function frame(now){const dt=Math.min(.033,(now-lastTime)/1000);lastTime=now;update(dt);draw();requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
})();
