/*
 StreamElements Subathon Widget - final build for Zoutt
 - Listens to SE events and applies time rules
 - Exposes onWidgetLoad for SE
 - Persists state in SE settings (if available) and localStorage
*/

const cfgDefaults = {
  mode: 'countdown',
  initialHours: 24,
  tier1Min: 5,
  tier2Min: 10,
  tier3Min: 30,
  donationPerDollarMin: 1,
  bitsPerUnit: 100,
  popupDuration: 3,
  goals: { hours:24, subs:100, donations:50, cheers:1000 },
  locale: 'es-ES'
};

let cfg = {...cfgDefaults};
let state = { secondsLeft: cfg.initialHours * 3600, history: [], counts: {subs:0, donations:0, cheers:0} };

// Helpers
function fmtHMS(s){ s = Math.max(0, Math.floor(s)); const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60; return [h,m,sec].map(v=>String(v).padStart(2,'0')).join(':'); }
function el(id){ return document.getElementById(id); }
function saveLocal(){ localStorage.setItem('subathon_cfg', JSON.stringify(cfg)); localStorage.setItem('subathon_state', JSON.stringify(state)); }
function loadLocal(){ try{ const c=JSON.parse(localStorage.getItem('subathon_cfg')); const s=JSON.parse(localStorage.getItem('subathon_state')); if(c) cfg=Object.assign(cfg,c); if(s) state=Object.assign(state,s); }catch(e){} }

// Popup
function showPopup(text){
  const b = el('addBubble');
  b.textContent = text;
  b.classList.remove('pop');
  void b.offsetWidth;
  b.classList.add('pop');
  b.style.opacity = '1';
  setTimeout(()=>{ b.style.opacity='0'; }, cfg.popupDuration*1000);
}

// Event UI
function showEventText(title, name, amount){
  el('eventText').innerHTML = `<strong style="color:var(--gold)">${title}</strong>`;
  el('eventDetail').textContent = `${name} — ${amount}`;
}

// Apply added seconds
function addSeconds(sec, source, meta){
  if(!sec || sec<=0) return;
  state.secondsLeft += sec;
  state.history.unshift({ts:Date.now(), sec, source, meta});
  if(state.history.length>30) state.history.pop();
  renderHistory();
  showPopup(`add +${Math.floor(sec/60)}m`);
  saveLocal();
  checkGoals();
}

// Compute seconds from event
function computeFromEvent(evt){
  if(!evt) return 0;
  if(evt.type==='donation' || evt.type==='tip'){
    const amt = Number(evt.amount) || 0;
    const sec = Math.floor(amt * cfg.donationPerDollarMin) * 60;
    return sec;
  }
  if(evt.type==='cheer' || evt.type==='bits'){
    const bits = Number(evt.amount) || 0;
    const units = Math.floor(bits / cfg.bitsPerUnit);
    return units * 60;
  }
  if(evt.type==='sub'){
    const tier = Number(evt.tier) || 1;
    if(tier===1) return cfg.tier1Min * 60;
    if(tier===2) return cfg.tier2Min * 60;
    return cfg.tier3Min * 60;
  }
  if(evt.type==='subgift'){
    const tier = Number(evt.tier) || 1;
    const count = Number(evt.count) || 1;
    const per = (tier===1?cfg.tier1Min: tier===2?cfg.tier2Min:cfg.tier3Min) * 60;
    return per * count;
  }
  return 0;
}

// Render
function renderTimer(){ el('timer').textContent = fmtHMS(state.secondsLeft); el('modeLabel').textContent = (cfg.mode==='countdown'?'Cuenta regresiva':'Acumulativo'); }
function renderHistory(){ const h = el('history'); h.innerHTML = state.history.slice(0,6).map(it=>{ const d=new Date(it.ts).toLocaleTimeString(cfg.locale); return `<div>${d} • +${Math.floor(it.sec/60)}m • ${it.source}</div>` }).join(''); }
function renderGoals(){ el('goalTime').textContent = fmtHMS(cfg.goals.hours*3600); el('goalSubs').textContent = cfg.goals.subs; el('goalDon').textContent = cfg.goals.donations; el('goalCheers').textContent = cfg.goals.cheers; }
function renderDateTime(){ el('dateTime').textContent = new Date().toLocaleString(cfg.locale); }

// Tick loop
let ticking = false;
function tick(){
  if(cfg.mode==='countdown' && state.secondsLeft>0) state.secondsLeft--; 
  if(cfg.mode==='accumulate') state.secondsLeft++;
  renderTimer();
  setTimeout(tick,1000);
}

// Goals check
function checkGoals(){
  // time goal (hours)
  if(state.secondsLeft >= cfg.goals.hours*3600){
    triggerGoal('Tiempo', `Se alcanzaron ${cfg.goals.hours} horas`);
    cfg.goals.hours = cfg.goals.hours + cfgDefaults.goals.hours; // next cycle
  }
  // subs goal
  if(state.counts.subs >= cfg.goals.subs){
    triggerGoal('Subs', `Se alcanzaron ${cfg.goals.subs} subs`);
    cfg.goals.subs += cfgDefaults.goals.subs;
  }
  // donations
  if(state.counts.donations >= cfg.goals.donations){
    triggerGoal('Donaciones', `Se alcanzaron $${cfg.goals.donations}`);
    cfg.goals.donations += cfgDefaults.goals.donations;
  }
  // cheers
  if(state.counts.cheers >= cfg.goals.cheers){
    triggerGoal('Cheers', `Se alcanzaron ${cfg.goals.cheers} bits`);
    cfg.goals.cheers += cfgDefaults.goals.cheers;
  }
  renderGoals();
}

// Trigger goal UI
function triggerGoal(type, text){
  showPopup(`${type} GOAL!`);
  el('eventText').innerHTML = `<strong style="color:var(--gold)">${type} GOAL</strong>`;
  el('eventDetail').textContent = text;
}

// StreamElements event mapping
function handleSEEvent(obj){
  if(!obj || !obj.type) return;
  const t = obj.type;
  if(t==='onEventReceived' && obj.detail){
    const ed = obj.detail;
    // map SE events
    if(ed.type==='tip-latest' || ed.type==='donation-latest' || ed.type==='tip'){
      const name = ed.data && (ed.data.name || ed.data.username) || 'Anon';
      const amount = ed.data && (ed.data.amount || ed.data.amountUSD) || ed.data && ed.data.amountUSD || 0;
      const secs = computeFromEvent({type:'donation', amount});
      if(secs>0){ addSeconds(secs,'Donación',{name,amount}); state.counts.donations += Number(amount); }
      showEventText('NUEVA DONACIÓN', name, `$${amount}`);
    } else if(ed.type==='cheer' || ed.type==='cheer-latest' || ed.type==='bits-donated'){
      const name = ed.data && (ed.data.name || ed.data.username) || 'Anon';
      const amount = ed.data && (ed.data.amount || ed.data.bits) || 0;
      const secs = computeFromEvent({type:'cheer', amount});
      if(secs>0){ addSeconds(secs,'Cheers',{name,amount}); state.counts.cheers += Number(amount); }
      showEventText('NUEVO CHEERLEADER', name, amount);
    } else if(ed.type==='subscriber-latest' || ed.type==='subscription-latest'){
      const name = ed.data && (ed.data.name || ed.data.username) || 'Anon';
      const tier = ed.data && (ed.data.tier || ed.data.plan || ed.data.subPlanLevel) || 1;
      const secs = computeFromEvent({type:'sub', tier});
      if(secs>0){ addSeconds(secs,'Sub',{name,tier}); state.counts.subs += 1; }
      showEventText('NUEVO SUB', name, `TIER ${tier}`);
    } else if(ed.type==='subscription-gifted' || ed.type==='community-sub-gift'){
      const sender = ed.data && (ed.data.sender || ed.data.name) || 'Anon';
      const count = ed.data && (ed.data.giftCount || ed.data.count) || ed.data && ed.data.recipients && ed.data.recipients.length || 1;
      const tier = ed.data && (ed.data.subPlanLevel || 1) || 1;
      const secs = computeFromEvent({type:'subgift', tier, count});
      if(secs>0){ addSeconds(secs,'Gifted',{sender,count,tier}); state.counts.subs += Number(count); }
      showEventText('NUEVO SUB REGALADO', sender, `${count} subs`);
    }
    saveLocal();
  }
}

// SE storage (if available)
function saveToSEStorage(settings){
  try{
    if(window.StreamElements && window.StreamElements.Widget && StreamElements.Widget.onSave){
      // not using direct SE API here; settings come from widget.json via onWidgetLoad
    }
  }catch(e){}
}

// Settings panel handlers
function openSettings(){
  el('settingsPanel').classList.remove('hidden');
  el('settingsPanel').setAttribute('aria-hidden','false');
  // populate
  el('modeSelect').value = cfg.mode;
  el('hoursInput').value = cfg.initialHours;
  el('tier1Input').value = cfg.tier1Min;
  el('tier2Input').value = cfg.tier2Min;
  el('tier3Input').value = cfg.tier3Min;
  el('donationRate').value = cfg.donationPerDollarMin;
  el('bitsUnit').value = cfg.bitsPerUnit;
  el('popupDur').value = cfg.popupDuration;
}
function closeSettings(){ el('settingsPanel').classList.add('hidden'); el('settingsPanel').setAttribute('aria-hidden','true'); }
function saveSettingsLocal(){
  cfg.mode = el('modeSelect').value;
  cfg.initialHours = Number(el('hoursInput').value) || cfgDefaults.initialHours;
  cfg.tier1Min = Number(el('tier1Input').value) || cfgDefaults.tier1Min;
  cfg.tier2Min = Number(el('tier2Input').value) || cfgDefaults.tier2Min;
  cfg.tier3Min = Number(el('tier3Input').value) || cfgDefaults.tier3Min;
  cfg.donationPerDollarMin = Number(el('donationRate').value) || cfgDefaults.donationPerDollarMin;
  cfg.bitsPerUnit = Number(el('bitsUnit').value) || cfgDefaults.bitsPerUnit;
  cfg.popupDuration = Number(el('popupDur').value) || cfgDefaults.popupDuration;
  state.secondsLeft = cfg.initialHours * 3600;
  saveLocal();
  closeSettings();
  renderTimer();
  renderGoals();
}

// Hotkey
document.addEventListener('keydown', (e)=>{
  if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='s'){ 
    if(el('settingsPanel').classList.contains('hidden')) openSettings(); else closeSettings(); 
  }
});

// SE entrypoint
function onWidgetLoad(obj){
  // merge settings from SE editor if provided
  try{
    if(obj && obj.detail && obj.detail.fieldData){
      const f = obj.detail.fieldData;
      cfg.mode = f.mode || cfg.mode;
      cfg.initialHours = Number(f.initialHours) || cfg.initialHours;
      cfg.tier1Min = Number(f.tier1Min) || cfg.tier1Min;
      cfg.tier2Min = Number(f.tier2Min) || cfg.tier2Min;
      cfg.tier3Min = Number(f.tier3Min) || cfg.tier3Min;
      cfg.donationPerDollarMin = Number(f.donationPerDollarMin) || cfg.donationPerDollarMin;
      cfg.bitsPerUnit = Number(f.bitsPerUnit) || cfg.bitsPerUnit;
      cfg.popupDuration = Number(f.popupDuration) || cfg.popupDuration;
      cfg.goals = { hours: Number(f.goalHours)||cfg.goals.hours, subs: Number(f.goalSubs)||cfg.goals.subs, donations: Number(f.goalDonations)||cfg.goals.donations, cheers: Number(f.goalCheers)||cfg.goals.cheers };
    }
  }catch(e){}
  loadLocal();
  // ensure initial seconds value
  if(!state.secondsLeft || state.secondsLeft<=0) state.secondsLeft = cfg.initialHours * 3600;
  renderTimer();
  renderGoals();
  renderHistory();
  renderDateTime();
  setInterval(renderDateTime,1000);
  tick();
  // listen to SE events
  if(window.addEventListener){
    window.addEventListener('onWidgetEvent', function (obj) { handleSEEvent(obj.detail); });
  }
}

// Expose
window.onWidgetLoad = onWidgetLoad;
window.onWidgetEvent = function(ev){ handleSEEvent(ev); };

// init UI bindings
document.getElementById('saveSettings').addEventListener('click', saveSettingsLocal);
document.getElementById('closeSettings').addEventListener('click', closeSettings);

window.addEventListener('load', ()=>{
  try{ loadLocal(); renderTimer(); renderGoals(); renderHistory(); renderDateTime(); }catch(e){};
});
