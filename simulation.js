/* A deterministic, offline simulation. Distances inside a region use 20 m tiles;
 * time, work and travel use seconds. Rendering never advances this state. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LivingWorld = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const HOUR = 3600, DAY = 86400, YEAR = DAY * 365, STEP = 30;
  const WIDTH = 44, HEIGHT = 34, VERSION = 3;
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const TECH = { farming: 'Земледелие', hunting: 'Охотничьи орудия', masonry: 'Каменное дело', preservation: 'Сушка и хранение', carpentry: 'Плотницкое дело', irrigation: 'Орошение' };
  const ACTION = { eat: 'Ест у очага', drink: 'Набирает воду', sleep: 'Спит', forage: 'Собирает ягоды', wood: 'Заготавливает дерево', stone: 'Добывает камень', build: 'Строит дом', farm: 'Ухаживает за полем', hunt: 'Выслеживает дичь', teach: 'Учится у соседа', social: 'Общается', explore: 'Исследует окрестности', care: 'Отдыхает с семьёй' };
  const NAMES = ['Ада', 'Мир', 'Лея', 'Кай', 'Нора', 'Ян', 'Ива', 'Тим', 'Мая', 'Сол', 'Вера', 'Рин', 'Тея', 'Дан', 'Лада', 'Акс', 'Зоя', 'Лин', 'Яра', 'Ник', 'Эли', 'Ори', 'Фея', 'Рома', 'Ася', 'Лев', 'Нина', 'Тир', 'Эва', 'Сева', 'Альма', 'Рэй', 'Луна', 'Илья', 'Мира', 'Оле'];

  function random(s) {
    let n = s.rng >>> 0;
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    s.rng = n >>> 0;
    return s.rng / 4294967296;
  }
  function hash(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
    const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  const MASSES = [[-.42,.40,.38,.50],[-.22,-.04,.27,.42],[-.40,-.45,.22,.25],[.67,.20,.34,.41],[.92,-.18,.30,.40],[1.65,.63,.35,.28],[2.30,-.25,.46,.42],[-2.5,.12,.45,.47],[-1.6,-.67,.25,.15]];
  function terrain(lon, lat, seed = 7319) {
    const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
    const n = noise(lon * 9 + 36, lat * 12 + 23, seed);
    const fine = noise(lon * 29 + 103, lat * 31 + 47, seed + 3);
    let mass = -10;
    for (const [cx,cy,rx,ry] of MASSES) mass = Math.max(mass, 1 - Math.hypot(wrap(lon-cx)/rx,(lat-cy)/ry));
    const elevation = mass + (n - .5) * .52 + (fine - .5) * .17;
    const land = elevation > .045 || Math.abs(lat) > 1.42;
    const moisture = noise(lon*6+50,lat*9+21,seed+80);
    const ridge = Math.pow(1 - Math.abs(noise(lon*19+90,lat*18+40,seed+12)*2-1), 10) * elevation;
    let biome = 'ocean';
    if (land) {
      if (Math.abs(lat) > 1.06 || ridge > .55) biome = 'snow';
      else if (ridge > .29) biome = 'mountain';
      else if (elevation < .09) biome = 'beach';
      else if (Math.abs(lat) < .54 && moisture < .42) biome = 'desert';
      else if (moisture > .56) biome = Math.abs(lat) < .3 ? 'jungle' : 'forest';
      else biome = 'grass';
    }
    return { land, elevation, moisture, ridge, biome, detail: fine };
  }
  function worldPath(a,b,seed) {
    const w=180,h=90, toCell=p=>({x:Math.floor((p.lon+Math.PI)/(2*Math.PI)*w)%w,y:clamp(Math.floor((Math.PI/2-p.lat)/Math.PI*h),0,h-1)});
    const from=toCell(a),to=toCell(b),start=from.y*w+from.x,end=to.y*w+to.x;
    const q=[start],prev=new Int32Array(w*h).fill(-1);prev[start]=start;
    for(let k=0;k<q.length;k++){
      const cur=q[k];if(cur===end)break;const x=cur%w,y=Math.floor(cur/w);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=(x+dx+w)%w,ny=y+dy;if(ny<0||ny>=h)continue;
        const id=ny*w+nx;if(prev[id]>=0)continue;
        const t=terrain((nx+.5)/w*2*Math.PI-Math.PI,Math.PI/2-(ny+.5)/h*Math.PI,seed);
        if(!t.land||t.biome==='snow')continue;prev[id]=cur;q.push(id);
      }
    }
    if(prev[end]<0)return null;
    const path=[];let at=end;while(at!==start){path.push({lon:(at%w+.5)/w*2*Math.PI-Math.PI,lat:Math.PI/2-(Math.floor(at/w)+.5)/h*Math.PI});at=prev[at];}
    path.push(a);return path.reverse();
  }
  function findSite(lon,lat,seed) {
    for(let radius=0;radius<.3;radius+=.015)for(let angle=0;angle<6.3;angle+=.7){
      const p={lon:lon+Math.cos(angle)*radius,lat:lat+Math.sin(angle)*radius};
      const t=terrain(p.lon,p.lat,seed);if(t.land&&['grass','forest','jungle'].includes(t.biome))return p;
    }
    return {lon:-.42,lat:.4};
  }
  function makeRegion(s, id, site) {
    const tiles=[];
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const river=30+Math.sin(y*.25+id)*2, ford=Math.abs(y-17)<2;
      let type=Math.abs(x-river)<1.35&&!ford?'water':'grass';
      const n=noise(x*.13+id*20,y*.15,s.seed);
      if(type!=='water'&&n>.66)type='forest';
      if(type!=='water'&&y<7&&n<.48)type='rock';
      if(type!=='water'&&x>35&&y>22)type='sand';
      const moisture=type==='water'?1:clamp(1-Math.abs(x-river)/28,.2,.9);
      tiles.push({type,moisture});
    }
    const center={x:20.5,y:18.5};
    for(let y=15;y<=21;y++)for(let x=16;x<=24;x++)tiles[y*WIDTH+x].type='grass';
    const r={id,site,tiles,center,weather:'clear',weatherUntil:s.time+HOUR*8,temperature:20,water:100,resources:[],animals:[],fields:[],buildings:[],paths:[]};
    for(let i=0;i<130;i++){
      const x=2+Math.floor(random(s)*(WIDTH-4)),y=2+Math.floor(random(s)*(HEIGHT-4));
      if(!walkable(r,x,y)||distance({x,y},center)<5)continue;
      const kind=i%6===0?'stone':i%3===0?'berry':'tree';
      r.resources.push({id:`r${id}-${i}`,x:x+.5,y:y+.5,kind,amount:kind==='tree'?10:kind==='berry'?8:40,capacity:kind==='tree'?10:kind==='berry'?8:40});
    }
    for(let i=0;i<13;i++){
      const p=freePoint(s,r);r.animals.push({id:`animal-${id}-${i}`,x:p.x,y:p.y,kind:i%5===0?'fox':i%3===0?'deer':'rabbit',energy:70,age:random(s)*YEAR*3,path:[],moveAt:0});
    }
    // Existing homes are explicit starting assets; all subsequent houses cost materials and work.
    for(let i=0;i<3;i++)r.buildings.push({id:`house-${id}-${i}`,x:18+(i%2)*4,y:16+Math.floor(i/2)*5,type:'hut',progress:1,work:0,health:100});
    r.fields.push({id:`field-${id}`,x:23,y:22,progress:id===0?.55:.1,tended:0,area:2,harvests:0});
    return r;
  }
  function walkable(r,x,y) {
    x=Math.floor(x);y=Math.floor(y);
    return x>=0&&y>=0&&x<WIDTH&&y<HEIGHT&&r.tiles[y*WIDTH+x].type!=='water';
  }
  function freePoint(s,r) {
    for(let n=0;n<100;n++){const x=2+random(s)*(WIDTH-4),y=2+random(s)*(HEIGHT-4);if(walkable(r,x,y))return {x:Math.floor(x)+.5,y:Math.floor(y)+.5};}
    return {...r.center};
  }
  function pathfind(r,from,to) {
    const ax=Math.floor(from.x),ay=Math.floor(from.y),bx=Math.floor(to.x),by=Math.floor(to.y);
    if(!walkable(r,ax,ay)||!walkable(r,bx,by))return null;
    const start=ay*WIDTH+ax,end=by*WIDTH+bx,prev=new Int32Array(WIDTH*HEIGHT).fill(-1),q=[start];prev[start]=start;
    for(let k=0;k<q.length;k++){
      const id=q[k];if(id===end)break;const x=id%WIDTH,y=Math.floor(id/WIDTH);
      for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
        const nx=x+dx,ny=y+dy,nid=ny*WIDTH+nx;if(!walkable(r,nx,ny)||prev[nid]>=0)continue;
        prev[nid]=id;q.push(nid);
      }
    }
    if(prev[end]<0)return null;
    const path=[];let at=end;while(at!==start){path.push({x:at%WIDTH+.5,y:Math.floor(at/WIDTH)+.5});at=prev[at];}
    return path.reverse();
  }
  function addEvent(s,type,text,region,agent=null){s.events.unshift({id:s.nextEvent++,time:s.time,type,text,region,agent});s.events=s.events.slice(0,150);}
  function memory(s,a,text){a.memories.unshift({time:s.time,text});a.memories=a.memories.slice(0,12);}
  function createAgent(s,region,index,parents=null) {
    const age=parents?0:(index%6===5?9+random(s)*6:20+random(s)*23);
    const person={id:s.nextId++,name:NAMES[(s.nextId-2)%NAMES.length],sex:parents?(random(s)<.5?'f':'m'):index%2===0?'f':'m',region,
      x:19.5+(index%4)*.65,y:17.5+Math.floor(index/4)*.75,born:s.time-age*YEAR,alive:true,health:100,hunger:12+random(s)*18,thirst:8+random(s)*18,energy:70+random(s)*25,social:40+random(s)*30,
      traits:{curiosity:random(s),kindness:random(s),diligence:random(s),aggression:random(s)*.55},skills:{gathering:parents?0:10+random(s)*20,building:parents?0:5+random(s)*12,farming:parents?0:5+random(s)*12,hunting:parents?0:5+random(s)*12},
      aptitudes:{gathering:.7+random(s)*.6,building:.7+random(s)*.6,farming:.7+random(s)*.6,hunting:.7+random(s)*.6},experience:{},knownResources:[],knowledge:{},learning:{},relations:{},memories:[],partner:null,parents:parents?parents.map(p=>p.id):[],children:[],pregnantUntil:null,lastBirth:0,
      action:'explore',reason:'Осматриваю место, где живёт моя семья.',target:null,path:[],work:0,decisionAt:0,carrying:null};
    if(!parents&&age>=16)person.knowledge[['farming','hunting','masonry'][region]]=1;
    if(parents){for(const key of Object.keys(person.traits))person.traits[key]=clamp((parents[0].traits[key]+parents[1].traits[key])/2+(random(s)-.5)*.2,0,1);
      for(const key of Object.keys(person.aptitudes))person.aptitudes[key]=clamp((parents[0].aptitudes[key]+parents[1].aptitudes[key])/2+(random(s)-.5)*.15,.5,1.5);}
    return person;
  }
  function create(seed=7319,startTime=Date.UTC(2026,2,1,10,0)/1000) {
    const s={version:VERSION,seed,rng:seed||1,time:startTime,started:startTime,elapsed:0,dayIndex:0,nextId:1,nextEvent:1,nextMission:1,births:0,deaths:0,regions:[],tribes:[],agents:[],events:[],missions:[],history:[],routes:[]};
    const sites=[findSite(-.49,.57,seed),findSite(-.27,.13,seed),findSite(-.43,-.34,seed)];
    const defs=[['Вереск','Люди долины','#e6b65c'],['Кедровый берег','Хранители леса','#7fb6a5'],['Каменный Брод','Мастера камня','#b699d3']];
    for(let i=0;i<3;i++){
      s.regions.push(makeRegion(s,i,sites[i]));
      s.tribes.push({id:i,name:defs[i][0],culture:defs[i][1],color:defs[i][2],food:90,wood:20,stone:6,trust:{},goal:'Обеспечить поселение едой и жильём',stress:0});
      for(let n=0;n<12;n++)s.agents.push(createAgent(s,i,n));
      for(const a of s.agents.filter(a=>a.region===i&&a.sex==='f'&&ageOf(s,a)>18)){
        const b=s.agents.find(b=>b.region===i&&b.sex==='m'&&ageOf(s,b)>18&&!b.partner);
        if(b){a.partner=b.id;b.partner=a.id;a.relations[b.id]=65;b.relations[a.id]=65;}
      }
      const families=s.agents.filter(a=>a.region===i&&a.sex==='f'&&a.partner);
      let familyIndex=0;
      for(const child of s.agents.filter(a=>a.region===i&&ageOf(s,a)<16)){
        const mother=families[familyIndex++%families.length],father=s.agents.find(a=>a.id===mother.partner);
        child.parents=[mother.id,father.id];for(const p of [mother,father]){p.children.push(child.id);p.born=Math.min(p.born,child.born-18*YEAR);child.relations[p.id]=75;p.relations[child.id]=80;}
      }
      addEvent(s,'settlement',`${defs[i][0]}: 12 жителей обустраивают новую жизнь.`,i);
    }
    for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
      const path=worldPath(sites[i],sites[j],seed);if(path)s.routes.push({from:i,to:j,path,duration:Math.max(DAY,(path.length-1)*20/35*DAY)});
    }
    for(const a of s.agents){a.walkSpeed=.05;perceive(s,a);choose(s,a);}
    return s;
  }
  const ageOf=(s,a)=>(s.time-a.born)/YEAR;
  const residents=(s,id)=>s.agents.filter(a=>a.alive&&a.region===id);
  function localHour(s,id){return ((s.time/HOUR+s.regions[id].site.lon/Math.PI*12)%24+24)%24;}
  function setAction(s,a,action,target,reason) {
    const r=s.regions[a.region],path=pathfind(r,a,target);
    if(!path)return false;
    a.action=action;a.target={...target};a.path=path;a.work=0;a.reason=reason;a.decisionAt=s.elapsed+HOUR/3;
    return true;
  }
  function perceive(s,a){for(const n of s.regions[a.region].resources)if(distance(a,n)<9&&!a.knownResources.includes(n.id))a.knownResources.push(n.id);}
  function closestResource(s,a,kind){return s.regions[a.region].resources.filter(n=>n.kind===kind&&n.amount>=1&&a.knownResources.includes(n.id)).sort((l,r)=>distance(a,l)-distance(a,r))[0];}
  function learn(s,a,action,success,reward){
    const e=a.experience[action]||(a.experience[action]={success:0,failure:0,value:0});
    if(success)e.success++;else e.failure++;
    e.value=e.value*.8+(success?reward:-4)*.2;
    const skill={forage:'gathering',wood:'building',stone:'building',build:'building',farm:'farming',hunt:'hunting'}[action];
    if(skill)a.skills[skill]=clamp(a.skills[skill]+(success?.6:.15)*a.aptitudes[skill]*(1-a.skills[skill]/110));
    const research={forage:'preservation',wood:'carpentry',stone:'masonry',build:'carpentry',farm:'irrigation',hunt:'hunting'}[action];
    if(success&&research&&!a.knowledge[research]){
      const increment=(.002+random(s)*.007)*(.7+a.traits.curiosity)*(skill?a.aptitudes[skill]:1);
      a.learning[research]=(a.learning[research]||0)+increment;
      if(a.learning[research]>=1){a.knowledge[research]=1;memory(s,a,`Из практики понял: ${TECH[research]}.`);addEvent(s,'knowledge',`${a.name} освоил «${TECH[research]}», пробуя и накапливая собственный опыт.`,a.region,a.id);}
    }
    if(!success)memory(s,a,action==='hunt'?'Добыча ушла. В следующий раз попробую действовать осторожнее.':'Здесь ресурс уже закончился. Нужно изменить план.');
  }
  function choose(s,a) {
    const r=s.regions[a.region],t=s.tribes[a.region],hour=localHour(s,a.region),night=hour<6||hour>=21;
    const atHome=r.center,age=ageOf(s,a),people=residents(s,a.region),options=[];
    const foodDays=t.food/Math.max(1,people.length*2.1);
    const add=(score,action,target,why)=>{if(target){const e=a.experience[action];options.push({score:score+(e?e.value*3:0),action,target,why:why+(e&&e.success>2?' Раньше этот способ помогал.':e&&e.failure>2?' Учту прошлые неудачи.':'')});}};
    if(a.thirst>80&&r.water>0){setAction(s,a,'drink',{x:27.5,y:17.5},'Сильная жажда. Прерву работу и пойду к воде.');return;}
    if(a.hunger>75&&t.food>=1){setAction(s,a,'eat',atHome,'Сначала нужно поесть: я слишком голоден для работы.');return;}
    if(t.food>=1)add(a.hunger*1.9,'eat',atHome,`Я голоден. В общем амбаре есть ${Math.floor(t.food)} порций еды.`);
    if(r.water>0)add(a.thirst*2,'drink',{x:27.5,y:17.5},'Хочу пить. Наберу пресную воду у брода.');
    add((100-a.energy)*1.6+(night?65:0),'sleep',atHome,night?'Стемнело. Пора отдохнуть в поселении.':'Я устал. Работа подождёт, пока я восстановлю силы.');
    if(age<6){add(125,'care',atHome,'Я ещё мал: остаюсь рядом с семьёй.');}
    else {
      const berry=closestResource(s,a,'berry');
      add(24+a.traits.diligence*16+Math.max(0,3-foodDays)*16+(t.food<1?a.hunger*.4:0),'forage',berry,'Проверю знакомые ягодники и соберу еду для всех.');
      const teacher=people.find(b=>b.id!==a.id&&distance(a,b)<10&&Object.keys(b.knowledge).some(k=>!a.knowledge[k]));
      if(teacher)add(22+a.traits.curiosity*30+(age<16?35:0),'teach',{x:teacher.x,y:teacher.y,id:teacher.id},'У соседа есть полезный навык. Понаблюдаю и попрошу показать ещё раз.');
      if(age>=16){
        const build=r.buildings.find(b=>b.progress<1);
        if(build)add(42+a.traits.diligence*23,'build',build,'Материалы уже доставлены. Помогу закончить общий дом.');
        const needSpace=people.length>r.buildings.filter(b=>b.progress>=1).length*4;
        add((t.wood<24?38:4)+(needSpace?20:0)+a.traits.diligence*12,'wood',closestResource(s,a,'tree'),'Нужны брёвна для домов и ремонта. Заготовлю их в лесу.');
        if(a.knowledge.masonry)add(t.stone<14?40:3,'stone',closestResource(s,a,'stone'),'Для прочного дома нужен камень. Отправлюсь к месторождению.');
        if(a.knowledge.farming)add(39+a.traits.diligence*16+(r.fields[0].progress>=1?40:0),'farm',r.fields[0],r.fields[0].progress>=1?'Урожай созрел. Пора собрать его в амбар.':'Поле требует ухода. Урожай поможет пережить недостаток ягод.');
        const prey=r.animals.filter(z=>z.kind!=='fox'&&distance(a,z)<12).sort((l,r)=>distance(a,l)-distance(a,r))[0];
        if(prey)add((a.knowledge.hunting?40:17)+Math.max(0,3-foodDays)*14+a.skills.hunting*.1,'hunt',{x:prey.x,y:prey.y,id:prey.id},'Вижу следы дичи. Попробую выследить её, чтобы накормить поселение.');
      }
      const friend=people.filter(b=>b.id!==a.id).sort((l,r)=>(a.relations[r.id]||0)-(a.relations[l.id]||0))[0];
      if(friend)add((100-a.social)*.7+a.traits.kindness*14,'social',{x:friend.x,y:friend.y,id:friend.id},'Мне не хватает общения. Проведу время с близкими.');
      add(12+a.traits.curiosity*20+(!berry&&foodDays<2?90:0),'explore',freePoint(s,r),'Хочу узнать окрестности и запомнить полезные места.');
    }
    options.sort((a,b)=>b.score-a.score);
    for(const option of options)if(setAction(s,a,option.action,option.target,option.why))return;
    setAction(s,a,'sleep',atHome,'Безопаснее пока остаться у дома.');
  }
  function moveAlong(a,dt,r) {
    // 1 tile = 20 m. Rough terrain, rain and fatigue reduce walking speed.
    let budget=dt*(a.walkSpeed||((a.energy<20?.025:.05)*(r.weather==='rain'?.75:1)));
    while(a.path.length&&budget>0){const p=a.path[0],d=distance(a,p);if(!walkable(r,p.x,p.y)){a.path=[];a.target=null;return;}
      if(d<=budget){a.x=p.x;a.y=p.y;a.path.shift();budget-=d;}else{a.x+=(p.x-a.x)/d*budget;a.y+=(p.y-a.y)/d*budget;budget=0;}}
  }
  // Presentation follows the planned polyline between simulation ticks. It does
  // not mutate world state, skip turns at a river, or depend on the frame rate.
  function visualPosition(a,seconds,r){
    let x=a.x,y=a.y,budget=seconds*(a.walkSpeed||((a.energy<20?.025:.05)*(r.weather==='rain'?.75:1)));
    for(const p of a.path){const d=Math.hypot(p.x-x,p.y-y);if(d<=budget){x=p.x;y=p.y;budget-=d;}else{if(d>0){x+=(p.x-x)/d*budget;y+=(p.y-y)/d*budget;}break;}}
    return {x,y};
  }
  function perform(s,a,dt) {
    const r=s.regions[a.region],t=s.tribes[a.region];
    if(a.carrying){
      moveAlong(a,dt,r);if(!a.path.length){t[a.carrying.kind]+=a.carrying.amount;memory(s,a,`Принёс в поселение: ${a.carrying.kind==='food'?'еда':'древесина'}, ${a.carrying.amount.toFixed(1)}.`);a.carrying=null;a.target=null;}return;
    }
    // The old plan consumes this interval first. New decisions apply to the
    // next interval, so the continuous preview cannot jump to another route.
    moveAlong(a,dt,r);
    if(a.target&&a.target.id&&['forage','wood','stone'].includes(a.action)){
      const resource=r.resources.find(n=>n.id===a.target.id);if(!resource||resource.amount<1){learn(s,a,a.action,false,0);a.target=null;}
    }
    if(a.path.length||!a.target)return;
    a.work+=dt;
    switch(a.action){
      case 'eat':
        if(a.work>=600){if(t.food>=1){t.food-=1;a.hunger=clamp(a.hunger-40);memory(s,a,'Поел у общего очага.');}a.target=null;}break;
      case 'drink':
        if(a.work>=180){if(r.water>0){r.water=Math.max(0,r.water-.04);a.thirst=clamp(a.thirst-65);}a.target=null;}break;
      case 'sleep':
        a.energy=clamp(a.energy+dt/HOUR*20);if(a.energy>=98){a.target=null;}break;
      case 'care':
        a.energy=clamp(a.energy+dt/HOUR*12);a.social=clamp(a.social+dt/HOUR*8);
        if(a.hunger>25&&t.food>=.02){const meal=Math.min(t.food,dt/HOUR*.15);t.food-=meal;a.hunger=clamp(a.hunger-meal*40);}
        a.thirst=clamp(a.thirst-dt/HOUR*5);if(a.work>HOUR)a.target=null;break;
      case 'forage':case 'wood':case 'stone': {
        const required=a.action==='wood'?HOUR*1.4:a.action==='stone'?HOUR*1.2:HOUR*.7;
        if(a.work<required)break;
        const resource=r.resources.find(n=>n.id===a.target.id);
        if(resource&&resource.amount>=1){const amount=Math.min(resource.amount,a.action==='forage'?3+a.skills.gathering/25:3);resource.amount-=amount;
          const kind=a.action==='forage'?'food':a.action==='wood'?'wood':'stone';
          a.carrying={kind,amount};a.path=pathfind(r,a,r.center)||[];learn(s,a,a.action,true,amount);}
        a.work=0;a.target=null;break;
      }
      case 'build': {
        const b=r.buildings.find(b=>b.id===a.target.id);
        if(b&&b.progress<1){b.work+=dt*(1+a.skills.building/100)*(r.weather==='rain'?.65:1)*(a.knowledge.carpentry?1.3:1);b.progress=Math.min(1,b.work/(HOUR*36));a.skills.building=clamp(a.skills.building+dt/HOUR*.3*a.aptitudes.building);
          if(b.progress>=1){addEvent(s,'build',`${t.name}: завершён ${b.type==='stone'?'каменный дом':'деревянный дом'}.`,a.region,a.id);memory(s,a,'Помог построить дом для соседей.');}}
        if(!b||b.progress>=1||a.work>HOUR*3){if(b)learn(s,a,'build',true,3);a.target=null;}break;
      }
      case 'farm': {
        const f=r.fields.find(f=>f.id===a.target.id);if(f){f.tended=clamp(f.tended+dt/HOUR*20);a.skills.farming=clamp(a.skills.farming+dt/HOUR*.2);
          if(f.progress>=1&&a.work>=HOUR){t.food+=40;f.progress=0;f.harvests++;learn(s,a,'farm',true,5);addEvent(s,'harvest',`${t.name}: собран урожай — 40 порций зерна.`,a.region,a.id);a.target=null;}}
        if(a.work>=HOUR*2){learn(s,a,'farm',true,2);a.target=null;}break;
      }
      case 'hunt': {
        if(a.work<HOUR)break;
        const prey=r.animals.find(z=>z.id===a.target.id),success=!!prey&&random(s)<(.15+(a.knowledge.hunting?.25:0)+a.skills.hunting*.003);
        if(success){r.animals=r.animals.filter(z=>z.id!==prey.id);const amount=prey.kind==='deer'?14:5;a.carrying={kind:'food',amount};a.path=pathfind(r,a,r.center)||[];learn(s,a,'hunt',true,amount/2);memory(s,a,'Охота удалась. Несу добычу домой.');}
        else learn(s,a,'hunt',false,0);a.target=null;a.work=0;break;
      }
      case 'teach':case 'social': {
        const b=s.agents.find(b=>b.id===a.target.id&&b.alive);
        if(!b||distance(a,b)>3){a.target=null;break;}
        a.social=clamp(a.social+dt/HOUR*30);b.social=clamp(b.social+dt/HOUR*15);
        a.relations[b.id]=clamp((a.relations[b.id]||0)+dt/HOUR*4,-100,100);
        if(a.action==='teach'){
          const tech=Object.keys(b.knowledge).find(k=>!a.knowledge[k]);
          if(tech){a.learning[tech]=(a.learning[tech]||0)+dt/(HOUR*18)*(1+a.traits.curiosity*.3);
            if(a.learning[tech]>=1){a.knowledge[tech]=1;memory(s,a,`${b.name} научил меня: ${TECH[tech]}.`);addEvent(s,'knowledge',`${a.name} освоил навык «${TECH[tech]}» с помощью ${b.name}.`,a.region,a.id);}}
        }
        if(a.work>=HOUR/2)a.target=null;break;
      }
      default:if(a.work>600){memory(s,a,'Нашёл безопасный маршрут рядом с поселением.');a.target=null;}
    }
  }
  function ecology(s,r,dt) {
    const hour=localHour(s,r.id),daylight=hour>6&&hour<20,season=Math.sin((s.time-s.started)/YEAR*2*Math.PI);
    r.temperature=21-Math.abs(r.site.lat)*12+season*8+(daylight?3:-5)+(r.weather==='rain'?-3:0);
    if(s.time>=r.weatherUntil){r.weather=random(s)<.26?'rain':random(s)<.35?'cloudy':'clear';r.weatherUntil=s.time+(5+random(s)*15)*HOUR;
      if(r.weather==='rain')addEvent(s,'weather',`${s.tribes[r.id].name}: дождь пополняет реку и увлажняет землю.`,r.id);}
    r.water=clamp(r.water+dt/DAY*(r.weather==='rain'?40:2));
    for(const node of r.resources){if(node.kind==='stone')continue;
      const growth=node.kind==='tree'?.06:2.1;
      node.amount=Math.min(node.capacity,node.amount+dt/DAY*growth*(daylight?1.2:.4)*(r.weather==='rain'?1.4:1));}
    const irrigation=residents(s,r.id).some(a=>a.knowledge.irrigation);
    for(const f of r.fields){f.tended=Math.max(0,f.tended-dt/HOUR*1.5);if(r.temperature>5)f.progress=Math.min(1,f.progress+dt/(DAY*8)*(.4+f.tended/100)*(r.weather==='rain'?1.25:1)*(irrigation?1.3:1));}
    for(const z of r.animals){z.age+=dt;z.energy=clamp(z.energy-dt/HOUR*.8);
      if(s.elapsed>=z.moveAt){const human=residents(s,r.id).find(a=>distance(a,z)<3);let target=freePoint(s,r);
        if(!human){const food=r.resources.find(n=>n.kind==='berry'&&n.amount>1&&distance(n,z)<6);if(food)target=food;}
        z.path=pathfind(r,z,target)||[];z.moveAt=s.elapsed+(human?120:900);}
      moveAlong(z,dt*.7,r);
      const berry=r.resources.find(n=>n.kind==='berry'&&n.amount>.02&&distance(n,z)<1);
      if(berry){const amount=Math.min(berry.amount,dt/HOUR*.15);berry.amount-=amount;z.energy=clamp(z.energy+amount*90);}
      if(z.kind==='fox'&&z.energy<65){const prey=r.animals.find(p=>p.kind==='rabbit'&&p.energy>0&&distance(p,z)<1);if(prey){prey.energy=0;z.energy=100;}}
    }
    r.animals=r.animals.filter(z=>z.energy>0&&z.age<YEAR*12);
  }
  function society(s){
    for(const t of s.tribes){
      const r=s.regions[t.id],people=residents(s,t.id),capacity=r.buildings.filter(b=>b.progress>=1).length*4;
      const foodDays=t.food/Math.max(1,people.length*2.4);t.stress=clamp((3-foodDays)*20);
      t.goal=foodDays<2?'Пополнить запасы еды':capacity<people.length+2?'Построить жильё для будущих семей':'Развивать ремёсла и обмениваться знаниями';
      t.food=Math.max(0,t.food*(people.some(a=>a.knowledge.preservation)?.998:.985));
      if(capacity<people.length+2&&!r.buildings.some(b=>b.progress<1)&&t.wood>=16){
        const masonry=people.some(a=>a.knowledge.masonry)&&t.stone>=8;t.wood-=16;if(masonry)t.stone-=8;
        const i=r.buildings.length,p={x:15+(i%4)*3,y:14+Math.floor(i/4)*4};
        if(walkable(r,p.x,p.y))r.buildings.push({id:`house-${t.id}-${i}`,x:p.x,y:p.y,type:masonry?'stone':'hut',progress:0,work:0,health:100});
        addEvent(s,'build',`${t.name}: выделены материалы для нового дома.`,t.id);
      }
      if(t.stress>35){
        const a=people.find(a=>ageOf(s,a)>18&&a.traits.aggression>.3),b=people.find(b=>a&&b.id!==a.id&&ageOf(s,b)>18);
        if(a&&b&&random(s)<t.stress/140){a.relations[b.id]=clamp((a.relations[b.id]||0)-12,-100,100);memory(s,a,`Поссорился с ${b.name} из-за недостатка еды.`);addEvent(s,'conflict',`${a.name} и ${b.name} спорят о распределении скудных запасов.`,t.id,a.id);}
      }
      for(const a of people){
        if(a.pregnantUntil&&s.time>=a.pregnantUntil){
          const father=s.agents.find(p=>p.id===a.partner);if(father&&s.agents.length<300){const child=createAgent(s,a.region,0,[a,father]);s.agents.push(child);a.children.push(child.id);father.children.push(child.id);a.lastBirth=s.time;s.births++;addEvent(s,'birth',`В семье ${a.name} и ${father.name} родился ребёнок — ${child.name}.`,a.region,child.id);}a.pregnantUntil=null;
        }
        const partner=people.find(b=>b.id===a.partner);
        if(a.sex==='f'&&ageOf(s,a)>20&&ageOf(s,a)<42&&!a.pregnantUntil&&partner&&partner.sex==='m'&&s.time-a.lastBirth>YEAR*1.5&&foodDays>3&&a.health>80&&capacity>people.length&&random(s)<.008)a.pregnantUntil=s.time+DAY*270;
        if(!a.partner&&ageOf(s,a)>18){const other=people.find(b=>b.id!==a.id&&!b.partner&&ageOf(s,b)>18&&(a.relations[b.id]||0)>60&&!a.parents.includes(b.id)&&!b.parents.includes(a.id)&&!a.parents.some(id=>b.parents.includes(id)));
          if(other){a.partner=other.id;other.partner=a.id;addEvent(s,'family',`${a.name} и ${other.name} решили жить вместе.`,a.region,a.id);}}
      }
      if(r.animals.length<20){const adult=r.animals.find(z=>z.energy>65&&z.kind!=='fox');if(adult&&random(s)<.16)r.animals.push({...adult,id:`animal-${t.id}-${s.dayIndex}`,age:0,energy:70,path:[]});}
    }
    for(const route of s.routes){
      if(s.missions.some(m=>m.from===route.from&&m.to===route.to))continue;
      const a=s.tribes[route.from],b=s.tribes[route.to];
      // A journey exists because stocks differ; goods are reserved at departure.
      let from=a,to=b;if(b.food>a.food){from=b;to=a;}
      if(from.food>25&&to.wood>6&&from.food-to.food>10){
        from.food-=8;to.wood-=4;
        s.missions.push({id:s.nextMission++,from:route.from,to:route.to,seller:from.id,buyer:to.id,started:s.time,arrival:s.time+route.duration,food:8,wood:4});
        addEvent(s,'trade',`Караван: ${from.name} обменивает зерно на древесину поселения ${to.name}.`,from.id);
      }
    }
    s.history.push({time:s.time,population:s.agents.filter(a=>a.alive).length,food:s.tribes.reduce((n,t)=>n+t.food,0)});s.history=s.history.slice(-90);
  }
  function step(s,dt){
    s.elapsed+=dt;s.time+=dt;
    for(const a of s.agents){if(!a.alive)continue;const age=ageOf(s,a),hours=dt/HOUR;
      a.hunger=clamp(a.hunger+hours*(age<6?2:3.4));a.thirst=clamp(a.thirst+hours*5);a.social=clamp(a.social-hours*2);
      if(a.action!=='sleep'&&a.action!=='care')a.energy=clamp(a.energy-hours*(a.path.length?6:4));
      a.health=clamp(a.health+hours*(a.hunger>=98||a.thirst>=98?-3:a.hunger<60&&a.thirst<60?.5:0));
      if(a.health<=0||age>90){a.alive=false;a.path=[];a.target=null;s.deaths++;memory(s,a,'Жизнь завершилась.');addEvent(s,'death',`${a.name} умер${a.sex==='f'?'ла':''}. Семья хранит память о нём.`,a.region,a.id);continue;}
      if(s.elapsed%300===a.id%10*30)perceive(s,a);perform(s,a,dt);
      if(!a.carrying&&(!a.target||(a.hunger>80&&a.action!=='eat'&&a.action!=='forage')||(a.thirst>85&&a.action!=='drink')||(s.elapsed>=a.decisionAt&&a.work===0)))choose(s,a);
    }
    for(const r of s.regions)ecology(s,r,dt);
    for(const a of s.agents)if(a.alive)a.walkSpeed=(ageOf(s,a)<6?.02:.05)*(a.energy<20?.5:1)*(s.regions[a.region].weather==='rain'?.75:1);
    for(const m of s.missions.filter(m=>m.arrival<=s.time)){
      s.tribes[m.buyer].food+=m.food;s.tribes[m.seller].wood+=m.wood;
      for(const [from,to] of [[m.from,m.to],[m.to,m.from]]){
        s.tribes[from].trust[to]=(s.tribes[from].trust[to]||0)+5;
        const teacher=residents(s,from).find(a=>Object.keys(a.knowledge).length),student=residents(s,to).find(a=>teacher&&Object.keys(teacher.knowledge).some(k=>!a.knowledge[k]));
        if(student){const tech=Object.keys(teacher.knowledge).find(k=>!student.knowledge[k]);student.learning[tech]=(student.learning[tech]||0)+.25;if(student.learning[tech]>=1){student.knowledge[tech]=1;addEvent(s,'knowledge',`${student.name} освоил «${TECH[tech]}» после встреч с торговцами.`,to,student.id);}}
      }
      addEvent(s,'trade','Караван прибыл: товары доставлены, соседи обменялись опытом.',m.buyer);
    }
    s.missions=s.missions.filter(m=>m.arrival>s.time);
    const day=Math.floor(s.elapsed/DAY);if(day>s.dayIndex){s.dayIndex=day;society(s);}
  }
  class Clock {
    constructor(state){this.state=state;this.speed=1;this.paused=false;this.pending=state.clockRemainder||0;}
    advance(realSeconds){
      if(this.paused)return 0;
      this.pending+=Math.max(0,realSeconds)*this.speed;
      let steps=0;while(this.pending>=STEP&&steps<240){step(this.state,STEP);this.pending-=STEP;steps++;}return steps;
    }
    setSpeed(speed){if(![1,60,360,3600].includes(speed))throw Error('Недопустимая скорость');this.speed=speed;}
  }
  function checksum(text){let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return(n>>>0).toString(16);}
  function validate(s){
    const fail=()=>{throw Error('Сохранение содержит несовместимое или повреждённое состояние.');};
    const number=(v,lo=-Infinity,hi=Infinity)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
    if(!s||s.version!==VERSION||!number(s.seed,0,4294967295)||!number(s.rng,0,4294967295)||!number(s.time)||!number(s.elapsed,0)||!number(s.started)||!Number.isInteger(s.nextId)||!Number.isInteger(s.nextEvent)||!Array.isArray(s.agents)||s.agents.length>300||!Array.isArray(s.regions)||s.regions.length!==3||!Array.isArray(s.tribes)||s.tribes.length!==3||!Array.isArray(s.events)||s.events.length>150||!Array.isArray(s.routes)||!Array.isArray(s.missions)||!Array.isArray(s.history))fail();
    const ids=new Set();
    if(s.clockRemainder!==undefined&&!number(s.clockRemainder,0,STEP))fail();
    for(const a of s.agents){if(!Number.isInteger(a.id)||ids.has(a.id)||!s.regions[a.region]||typeof a.name!=='string'||a.name.length>80||!number(a.x,0,WIDTH-1e-6)||!number(a.y,0,HEIGHT-1e-6)||!number(a.born)||typeof a.alive!=='boolean')fail();ids.add(a.id);
      for(const k of ['health','hunger','thirst','energy','social'])if(!number(a[k],0,100))fail();
      for(const k of ['knowledge','learning','traits','skills','relations','aptitudes','experience'])if(!a[k]||typeof a[k]!=='object'||Array.isArray(a[k]))fail();
      for(const k of ['memories','parents','children','path','knownResources'])if(!Array.isArray(a[k]))fail();
      for(const [k,v] of Object.entries(a.knowledge))if(!TECH[k]||v!==1)fail();
      for(const [k,v] of Object.entries(a.learning))if(!TECH[k]||!number(v,0,2))fail();
      for(const k of ['gathering','building','farming','hunting'])if(!number(a.skills[k],0,100)||!number(a.aptitudes[k],.5,1.5))fail();
      for(const k of ['curiosity','diligence','kindness','aggression'])if(!number(a.traits[k],0,1))fail();
      if(a.walkSpeed!==undefined&&!number(a.walkSpeed,.005,.06))fail();
      if(!ACTION[a.action]||!number(a.work,0)||!number(a.decisionAt,0)||typeof a.reason!=='string')fail();
      for(const p of a.path)if(!number(p.x,0,WIDTH)||!number(p.y,0,HEIGHT))fail();
      if(a.target&&(!number(a.target.x,0,WIDTH)||!number(a.target.y,0,HEIGHT)))fail();
      if(a.carrying&&(!['food','wood','stone'].includes(a.carrying.kind)||!number(a.carrying.amount,0,50)))fail();
    }
    if(s.nextId<=Math.max(0,...ids))fail();
    for(const a of s.agents){if(a.partner!==null&&!ids.has(a.partner))fail();if(![...a.parents,...a.children].every(id=>ids.has(id)))fail();}
    for(const r of s.regions){if(!Array.isArray(r.tiles)||r.tiles.length!==WIDTH*HEIGHT||!r.tiles.every(t=>['water','grass','forest','rock','sand'].includes(t.type))||!Array.isArray(r.resources)||!Array.isArray(r.fields)||!Array.isArray(r.buildings)||!Array.isArray(r.animals)||!number(r.site.lon,-Math.PI,Math.PI)||!number(r.site.lat,-Math.PI/2,Math.PI/2)||!number(r.weatherUntil))fail();
      for(const n of r.resources)if(!['berry','tree','stone'].includes(n.kind)||!number(n.amount,0,n.capacity)||!walkable(r,n.x,n.y))fail();
      for(const b of r.buildings)if(!number(b.progress,0,1)||!walkable(r,b.x,b.y))fail();
    }
    for(const t of s.tribes)for(const k of ['food','wood','stone'])if(!number(t[k],0))fail();
    return s;
  }
  function serialize(s){validate(s);const payload=JSON.stringify(s);return JSON.stringify({format:'living-planet',version:VERSION,checksum:checksum(payload),payload});}
  function deserialize(raw){
    if(typeof raw!=='string'||raw.length>6000000)throw Error('Сохранение слишком большое.');
    const envelope=JSON.parse(raw);
    if(envelope.format!=='living-planet'||envelope.version!==VERSION||typeof envelope.payload!=='string'||checksum(envelope.payload)!==envelope.checksum)throw Error('Файл повреждён или создан другой версией игры.');
    return validate(JSON.parse(envelope.payload));
  }
  return {HOUR,DAY,YEAR,STEP,WIDTH,HEIGHT,VERSION,TECH,ACTION,NAMES,create,step,Clock,serialize,deserialize,validate,pathfind,walkable,terrain,noise,hash,ageOf,residents,localHour,choose,perform,worldPath,visualPosition,learn,createAgent};
});
