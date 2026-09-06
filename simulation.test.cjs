const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../simulation.js');

test('terrain and region navigation keep people and resources on reachable land',()=>{
  const s=M.create();assert.equal(s.agents.length,36);assert.equal(s.tribes.length,3);
  for(const r of s.regions){assert.ok(M.terrain(r.site.lon,r.site.lat,s.seed).land);for(const a of M.residents(s,r.id))assert.ok(M.walkable(r,a.x,a.y));
    for(const node of r.resources){assert.ok(M.walkable(r,node.x,node.y));const p=M.pathfind(r,r.center,node);assert.ok(p);for(const tile of p)assert.ok(M.walkable(r,tile.x,tile.y));}}
  assert.ok(s.routes.length>0,'Settlements have at least one overland connection');
});
test('fixed-step clock is frame-rate independent and pause freezes every world field',()=>{
  const a=new M.Clock(M.create()),b=new M.Clock(M.create());a.setSpeed(3600);b.setSpeed(3600);
  for(let i=0;i<600;i++)a.advance(1/60);for(let i=0;i<100;i++)b.advance(.1);
  assert.equal(a.state.elapsed,b.state.elapsed);assert.deepEqual(a.state,b.state);
  a.paused=true;const before=JSON.stringify(a.state),pending=a.pending;a.advance(120);assert.equal(JSON.stringify(a.state),before);assert.equal(a.pending,pending);
});
test('two gatherers cannot duplicate an exhausted resource',()=>{
  const s=M.create(),[a,b]=s.agents,r=s.regions[0],node=r.resources.find(n=>n.kind==='berry');node.amount=1;
  for(const actor of [a,b]){actor.action='forage';actor.x=node.x;actor.y=node.y;actor.target={...node};actor.path=[];actor.work=M.HOUR;actor.hunger=0;actor.thirst=0;actor.decisionAt=Infinity;}
  M.perform(s,a,30);M.perform(s,b,30);assert.equal(node.amount,0);assert.equal(a.carrying.amount,1);assert.equal(b.carrying,null);
});
test('save/load roundtrip preserves identity, random state and future evolution',()=>{
  const s=M.create();for(let n=0;n<240;n++)M.step(s,30);
  const loaded=M.deserialize(M.serialize(s));assert.deepEqual(loaded,s);
  for(let n=0;n<100;n++){M.step(s,30);M.step(loaded,30);}assert.deepEqual(loaded,s);
});

test('movement is continuous at 1× and 60×, follows corners, and never advances on pause',()=>{
  const s=M.create(),r=s.regions[0],a=s.agents[0];a.x=20.5;a.y=18.5;a.energy=100;a.path=[{x:21.5,y:18.5},{x:21.5,y:19.5},{x:21.5,y:20.5}];
  const before=JSON.stringify(a),first=M.visualPosition(a,1,r),second=M.visualPosition(a,2,r),accelerated=M.visualPosition(a,20,r);
  assert.ok(Math.abs(first.x-a.x-.05)<1e-9);assert.ok(Math.abs(second.x-first.x-.05)<1e-9);assert.ok(Math.abs(accelerated.x-21.5)<1e-9);
  const corner=M.visualPosition(a,30,r);assert.ok(Math.abs(corner.x-21.5)<1e-9);assert.ok(Math.abs(corner.y-19)<1e-9);assert.equal(JSON.stringify(a),before,'Visual preview must not change simulation');
  const clock=new M.Clock(s);clock.setSpeed(60);clock.advance(1/60);assert.ok(Math.abs(M.visualPosition(a,clock.pending,r).x-first.x)<1e-9);clock.paused=true;const pos=M.visualPosition(a,clock.pending,r);clock.advance(20);assert.deepEqual(M.visualPosition(a,clock.pending,r),pos);
});

test('personal experience changes skills and beliefs; children inherit aptitude, not learned technologies',()=>{
  const s=M.create(),a=s.agents[0],b=s.agents[1],prior=a.skills.gathering;
  for(let i=0;i<10;i++)M.learn(s,a,'forage',true,3);assert.ok(a.skills.gathering>prior);assert.ok(a.experience.forage.value>0);assert.ok(a.learning.preservation>0);
  M.learn(s,a,'hunt',false,0);assert.ok(a.experience.hunt.value<0);assert.match(a.memories[0].text,/Добыча ушла/);
  const child=M.createAgent(s,0,0,[a,b]);assert.deepEqual(child.knowledge,{});assert.equal(child.skills.gathering,0);assert.deepEqual(child.parents,[a.id,b.id]);
  for(const k of Object.keys(child.aptitudes)){const mean=(a.aptitudes[k]+b.aptitudes[k])/2;assert.ok(Math.abs(child.aptitudes[k]-mean)<=.075);}
});

test('continuous positions meet the next simulation tick without a jump',()=>{
  const s=M.create();
  for(let i=0;i<700;i++){
    const positions=new Map(s.agents.filter(a=>a.alive).map(a=>[a.id,M.visualPosition(a,30,s.regions[a.region])]));
    M.step(s,30);
    for(const a of s.agents.filter(a=>a.alive)){const p=positions.get(a.id);assert.ok(Math.hypot(p.x-a.x,p.y-a.y)<1e-8,`Position jumped for ${a.id} at tick ${i}`);}
  }
});
test('corruption and incompatible save versions are rejected without modifying the live world',()=>{
  const s=M.create(),before=JSON.stringify(s),raw=M.serialize(s);
  assert.throws(()=>M.deserialize(raw.replace('Вереск','Подмена')));assert.throws(()=>M.deserialize('{}'));
  const clone=JSON.parse(JSON.stringify(s));clone.agents[0].health=NaN;assert.throws(()=>M.serialize(clone));assert.equal(JSON.stringify(s),before);
});
test('three simulated weeks retain finite needs, conserved resources and reachable actors',()=>{
  const s=M.create();for(let n=0;n<21*M.DAY/30;n++)M.step(s,30);
  M.validate(s);assert.ok(s.agents.filter(a=>a.alive).length>=25,'Most settlers survive normal conditions');
  for(const a of s.agents.filter(a=>a.alive))assert.ok(M.walkable(s.regions[a.region],a.x,a.y));
  for(const r of s.regions)for(const node of r.resources)assert.ok(node.amount>=0&&node.amount<=node.capacity);
  assert.ok(s.regions.some(r=>r.buildings.length>3),'Demand triggers real construction');
  assert.ok(s.regions.some(r=>r.fields.some(f=>f.harvests>0)),'Farming produces a harvest over time');
});
