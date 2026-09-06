(() => {
  'use strict';
  const M=LivingWorld,$=id=>document.getElementById(id),KEY='living-planet-v3';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const villageIcon='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1"><path d="M5 17 12 9l7 8M7 16v10h10V16M18 12l5-6 6 7M20 12v11h7V12M11 26v-6h3v6M22 23v-6h3v6M3 27h26"/><path d="m9 11 3-4 4 4M21 8l2-3 3 3"/></svg>';
  const weatherNames={clear:'Ясно',cloudy:'Облачно',rain:'Дождь'};
  const icons={settlement:'⌂',build:'⌂',trade:'⇄',knowledge:'✧',birth:'♧',death:'✢',family:'♡',weather:'☂',harvest:'❋',conflict:'⚑'};
  const titles={settlement:'Новая глава',build:'Поселение растёт',trade:'Дорога к соседям',knowledge:'Знание передаётся',birth:'Новая жизнь',death:'Память остаётся',family:'Вместе',weather:'Дыхание природы',harvest:'Плоды труда',conflict:'Непростой выбор'};
  let state=M.create(),clock=new M.Clock(state),region=0,selected=null,tab='settlements',lastFrame=performance.now(),lastUi=0,lastAuto=performance.now(),noticeTimer=null,storageFailed=false,wasHidden=false;
  state.rng=(Date.now()>>>0)||1;
  const renderer=new PlanetRenderer($('world'),state,hit=>{if(hit.type==='region')selectRegion(hit.id);else selectPerson(hit.id);});
  const dateOf=time=>new Date(time*1000);
  const dateLabel=time=>dateOf(time).toLocaleString('ru-RU',{timeZone:'UTC',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('toast').hidden=true;},4500);}
  function selectRegion(id){region=id;selected=null;renderer.region=id;renderer.selected=null;renderUi();}
  function selectPerson(id){const a=state.agents.find(a=>a.id===id);if(!a)return;region=a.region;selected=id;renderer.region=region;renderer.selected=id;tab='residents';
    if(renderer.mode==='region')renderer.center={x:a.x,y:a.y};renderUi();}
  function setMode(mode){renderer.setMode(mode);$('globe-mode').classList.toggle('active',mode==='globe');$('region-mode').classList.toggle('active',mode==='region');$('globe-mode').setAttribute('aria-pressed',mode==='globe');$('region-mode').setAttribute('aria-pressed',mode==='region');$('planet-caption').hidden=mode==='region';$('map-kicker').textContent=mode==='globe'?'ЖИВАЯ ПЛАНЕТА':'ЖИЗНЬ ПОСЕЛЕНИЯ';$('map-help').textContent=mode==='globe'?'Перетаскивайте, чтобы вращать планету':'Выберите жителя, чтобы узнать его историю';}
  function updateControls(){
    $('pause-symbol').textContent=clock.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',clock.paused?'Продолжить симуляцию':'Приостановить симуляцию');$('running-label').textContent=clock.paused?'Время остановлено':'Мир живёт';$('map-status').textContent=clock.paused?'Пауза':'Наблюдение';
    $('tick-label').textContent=clock.paused?'Можно изучать мир':clock.speed===1?'Одна секунда за секунду':'Ускоренное наблюдение';
    document.querySelectorAll('[data-speed]').forEach(b=>{const active=Number(b.dataset.speed)===clock.speed;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  }
  function togglePause(){clock.paused=!clock.paused;updateControls();}
  function renderPerson(a){
    const other=state.agents.find(b=>b.id===a.partner),needs=[['Здоровье',a.health],['Сытость',100-a.hunger],['Вода',100-a.thirst],['Энергия',a.energy]];
    const age=Math.floor(M.ageOf(state,a)),trait=a.traits.curiosity>.65?'Любознательный':a.traits.diligence>.65?'Трудолюбивый':a.traits.kindness>.65?'Заботливый':'Самостоятельный';
    const skillLabels={gathering:'Собирательство',building:'Строительство',farming:'Земледелие',hunting:'Охота'};
    const learned=Object.entries(a.learning).filter(([key,value])=>!a.knowledge[key]&&value>.02).sort((a,b)=>b[1]-a[1]);
    $('person-card').innerHTML=`<div class="eyebrow">ЛИЧНАЯ ИСТОРИЯ</div><h2>${escape(a.name)}</h2><div class="person-subtitle">${age} лет · ${escape(trait)} · ${a.alive?'житель':'в памяти семьи'}</div><p class="thought">«${escape(a.reason)}»</p>${needs.map(([name,value])=>`<div class="need"><span>${name}</span><div class="need-track"><i style="width:${value}%;${value<25?'background:#b9835d':''}"></i></div><span class="need-number">${Math.round(value)}%</span></div>`).join('')}<div class="skill-tags">${Object.keys(a.knowledge).map(k=>`<span>${escape(M.TECH[k]||k)}</span>`).join('')||'<span>Наблюдает и учится</span>'}</div><div class="person-subtitle">${other?'Партнёр: '+escape(other.name):'Пока без пары'} · детей: ${a.children.length}</div><div class="eyebrow" style="margin-top:18px">ПАМЯТЬ</div><ul class="memory-list">${a.memories.slice(0,3).map(m=>`<li>${escape(m.text)}</li>`).join('')||'<li>История этого жителя только начинается.</li>'}</ul>`;
    $('person-card').insertAdjacentHTML('beforeend',`<div class="eyebrow" style="margin-top:18px">НАВЫКИ И ОТКРЫТИЯ</div><div class="skill-tags">${Object.entries(a.skills).map(([key,value])=>`<span>${skillLabels[key]} ${Math.round(value)}%</span>`).join('')}</div>${learned.slice(0,2).map(([key,value])=>`<div class="person-subtitle" style="margin:6px 0">Изучает: ${M.TECH[key]} · ${Math.floor(value*100)}%</div>`).join('')}`);
  }
  function renderUi(){
    const date=dateOf(state.time),year=Math.floor(state.elapsed/M.YEAR)+1,month=date.getUTCMonth();
    $('season').textContent=`${['Зима','Весна','Лето','Осень'][Math.floor(((month+1)%12)/3)]} · год ${year}`;
    $('clock').textContent=dateLabel(state.time+Math.min(clock.pending,M.STEP));$('time-description').textContent=`Игровой календарь · ${clock.speed}×`;
    $('population').innerHTML=`${state.agents.filter(a=>a.alive).length} <small>жителей</small>`;
    $('knowledge-count').innerHTML=`${new Set(state.agents.filter(a=>a.alive).flatMap(a=>Object.keys(a.knowledge))).size} <small>технологии</small>`;
    $('animal-count').innerHTML=`${state.regions.reduce((n,r)=>n+r.animals.length,0)} <small>животных</small>`;
    $('settlement-list').innerHTML=state.tribes.map(t=>{const pop=M.residents(state,t.id),homes=state.regions[t.id].buildings.filter(b=>b.progress>=1).length;return `<button class="settlement-row ${region===t.id?'active':''}" data-region="${t.id}" aria-pressed="${region===t.id}"><span class="settlement-avatar">${villageIcon}</span><span class="row-text"><strong>${escape(t.name)}</strong><small>${pop.length} жителей <span>·</span> ${homes} дома</small></span><span class="row-arrow">↗</span></button>`;}).join('');
    $('settlement-list').hidden=tab!=='settlements';$('residents-section').hidden=tab!=='residents';$('tab-settlements').classList.toggle('active',tab==='settlements');$('tab-residents').classList.toggle('active',tab==='residents');
    const q=$('resident-search').value.toLocaleLowerCase('ru-RU'),residents=M.residents(state,region).filter(a=>a.name.toLocaleLowerCase('ru-RU').includes(q));
    $('resident-list').innerHTML=residents.map(a=>`<button class="resident-row ${selected===a.id?'active':''}" data-person="${a.id}"><span class="person-dot">${M.ageOf(state,a)<16?'♙':'♟'}</span><span><strong>${escape(a.name)}</strong><small>${a.path.length?'Идёт · ':''}${escape(M.ACTION[a.action])}</small></span><span>${Math.floor(M.ageOf(state,a))} л.</span></button>`).join('')||'<p class="empty-events">Никого не найдено.</p>';
    const t=state.tribes[region],r=state.regions[region],pop=M.residents(state,region).length;
    $('culture').textContent=t.culture.toLocaleUpperCase('ru-RU');$('settlement-name').textContent=t.name;$('settlement-goal').textContent=t.goal;
    $('food-stock').textContent=Math.floor(t.food);$('wood-stock').textContent=Math.floor(t.wood);$('stone-stock').textContent=Math.floor(t.stone);$('food-days').textContent=`на ${(t.food/Math.max(1,pop*2.4)).toFixed(1)} дня`;
    $('weather-icon').textContent=r.weather==='rain'?'☂':r.weather==='cloudy'?'☁':'☀';$('weather').textContent=`${weatherNames[r.weather]}, ${r.temperature>0?'+':''}${Math.round(r.temperature)}°`;
    const hour=M.localHour(state,region);$('local-time').textContent=`${Math.floor(hour).toString().padStart(2,'0')}:${Math.floor(hour%1*60).toString().padStart(2,'0')}`;
    const a=state.agents.find(a=>a.id===selected);$('settlement-detail').hidden=!!a;$('person-card').hidden=!a;if(a)renderPerson(a);
    const filter=$('event-filter').value,events=state.events.filter(e=>filter==='all'||filter==='local'&&e.region===region||filter==='important'&&!['weather','settlement'].includes(e.type));
    $('event-count').textContent=state.events.length.toString().padStart(2,'0');$('events').innerHTML=events.slice(0,3).map(e=>`<button class="event-card" data-event="${e.id}"><span class="event-icon">${icons[e.type]||'✧'}</span><span><small>${escape(dateLabel(e.time))}</small><h3>${titles[e.type]||'Событие'}</h3><p>${escape(e.text)}</p></span></button>`).join('')||'<p class="empty-events">Здесь появятся события по мере развития мира.</p>';
  }
  function storageKey(slot){return `${KEY}-${slot}`;}
  function writeSave(slot){
    const data=M.serialize({...state,clockRemainder:Math.min(clock.pending,M.STEP)}),key=storageKey(slot),previous=localStorage.getItem(key);
    if(previous){try{M.deserialize(previous);localStorage.setItem(key+'-backup',previous);}catch{/* Never replace a valid backup with damaged data. */}}
    localStorage.setItem(key,data);$('save-status').textContent='Сохранено · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});storageFailed=false;
  }
  function save(slot){try{writeSave(slot);toast('История мира сохранена.');if($('save-dialog').open)renderSlots();}catch(e){toast('Не удалось сохранить: '+e.message);}}
  function replaceState(next){
    const clean=M.validate(next);state=clean;clock=new M.Clock(state);clock.paused=true;region=0;selected=null;renderer.setState(state);renderer.focus(0);lastFrame=performance.now();lastAuto=lastFrame;updateControls();renderUi();
  }
  function load(slot){
    try{
      let raw=localStorage.getItem(storageKey(slot));if(!raw)throw Error('В этом слоте ещё нет сохранения.');
      let next,recovered=false;try{next=M.deserialize(raw);}catch(error){const backup=localStorage.getItem(storageKey(slot)+'-backup');if(!backup)throw error;next=M.deserialize(backup);recovered=true;}
      replaceState(next);$('save-dialog').close();toast(recovered?'Восстановлена резервная копия. Мир на паузе.':'Мир загружен и поставлен на паузу.');
    }catch(e){$('save-message').textContent=e.message;toast(e.message);}
  }
  function renderSlots(){
    $('save-slots').innerHTML=['1','2','3','auto'].map(slot=>{
      let info='Пустой слот',exists=false;try{const raw=localStorage.getItem(storageKey(slot));if(raw){exists=true;try{const s=M.deserialize(raw);info=dateLabel(s.time)+' · '+s.agents.filter(a=>a.alive).length+' жителей';}catch{info='Повреждено — доступна попытка восстановления';}}}catch{info='Хранилище недоступно';}
      return `<div class="save-slot"><span><strong>${slot==='auto'?'Автосохранение':'Мир '+slot}</strong><small>${escape(info)}</small></span><span>${slot!=='auto'?`<button data-save="${slot}">Сохранить</button>`:''}<button data-load="${slot}" ${exists?'':'disabled'}>Загрузить</button></span></div>`;
    }).join('');
  }
  $('pause').addEventListener('click',togglePause);
  document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>{clock.setSpeed(Number(b.dataset.speed));updateControls();renderUi();}));
  $('globe-mode').addEventListener('click',()=>setMode('globe'));$('region-mode').addEventListener('click',()=>setMode('region'));$('visit-region').addEventListener('click',()=>{setMode('region');renderer.focus(region);});
  $('zoom-in').addEventListener('click',()=>renderer.zoomBy(1.15));$('zoom-out').addEventListener('click',()=>renderer.zoomBy(1/1.15));$('focus').addEventListener('click',()=>renderer.focus(region));
  $('toggle-clouds').addEventListener('click',()=>{renderer.clouds=!renderer.clouds;renderer.dirty=true;$('toggle-clouds').setAttribute('aria-pressed',renderer.clouds);});
  $('settlement-list').addEventListener('click',e=>{const button=e.target.closest('[data-region]');if(button){selectRegion(Number(button.dataset.region));renderer.focus(region);}});
  $('resident-list').addEventListener('click',e=>{const button=e.target.closest('[data-person]');if(button)selectPerson(Number(button.dataset.person));});
  $('tab-settlements').addEventListener('click',()=>{tab='settlements';selected=null;renderer.selected=null;renderUi();});$('tab-residents').addEventListener('click',()=>{tab='residents';renderUi();});$('resident-search').addEventListener('input',renderUi);
  $('events').addEventListener('click',e=>{const b=e.target.closest('[data-event]');if(!b)return;const event=state.events.find(event=>event.id===Number(b.dataset.event));selectRegion(event.region);setMode('region');renderer.focus(region);if(event.agent)selectPerson(event.agent);$('world').focus({preventScroll:true});});$('event-filter').addEventListener('change',renderUi);
  $('nav-world').addEventListener('click',()=>{setMode('globe');document.querySelector('.overview-heading').scrollIntoView({behavior:'smooth'});});
  $('nav-people').addEventListener('click',()=>{tab='settlements';selected=null;renderUi();document.querySelector('.inspector').scrollIntoView({behavior:'smooth',block:'center'});});
  $('nav-history').addEventListener('click',()=>{$('chronicle').scrollIntoView({behavior:'smooth'});});
  $('save-quick').addEventListener('click',()=>save('1'));$('open-saves').addEventListener('click',()=>{renderSlots();$('save-message').textContent='';$('save-dialog').showModal();});
  $('save-slots').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.save)save(b.dataset.save);if(b?.dataset.load)load(b.dataset.load);});
  $('export-save').addEventListener('click',()=>{try{const data=M.serialize({...state,clockRemainder:Math.min(clock.pending,M.STEP)}),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='elion-world.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast(e.message);}});
  $('import-save').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>6000000)throw Error('Размер файла превышает 6 МБ.');const next=M.deserialize(await file.text());try{writeSave('auto');}catch{/* A restricted localStorage does not prevent loading a valid export. */}replaceState(next);$('save-dialog').close();toast('Импорт завершён. Мир на паузе.');}catch(error){toast(error.message);}e.target.value='';});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','BUTTON','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('save-dialog').open){e.preventDefault();togglePause();}});
  document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();wasHidden=document.hidden;if(document.hidden&&!clock.paused){try{writeSave('auto');}catch{/* Report storage failure on the next visible autosave. */}}});
  function frame(now){
    const elapsed=(now-lastFrame)/1000;lastFrame=now;
    if(!document.hidden&&!wasHidden)clock.advance(elapsed);
    wasHidden=document.hidden;
    renderer.fraction=Math.min(clock.pending,M.STEP);renderer.draw();if(now-lastUi>350){renderUi();lastUi=now;}
    if(!clock.paused&&now-lastAuto>30000){lastAuto=now;try{writeSave('auto');}catch(e){$('save-status').textContent='Автосохранение недоступно';if(!storageFailed){toast('Хранилище недоступно. Используйте экспорт JSON в окне сохранений.');storageFailed=true;}}}
    requestAnimationFrame(frame);
  }
  updateControls();renderUi();requestAnimationFrame(frame);
})();
