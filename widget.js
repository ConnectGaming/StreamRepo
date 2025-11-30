/* StreamElements Subathon Widget for Zoutt
 - Compatible with SE custom widget structure: widget.html, widget.css, widget.js, widget.json
 - Settings and fields are defined in widget.json
 - Handles events via SE API and updates timer with rules provided.
*/

const SE = window.StreamElements || {};
// default config; will be overridden by widget settings
let cfg = {
  startTime: 0, // epoch ms when timer started
  secondsLeft: 0,
  running: false,
  tiers: { tier1:5*60, tier2:10*60, tier3:30*60 }, // seconds
  donationPerDollar: 60, // 1 min per $1 -> 60 seconds
  bitsPerUnit: 100, // 1 min per 100 bits
  popupDuration: 3000,
  goals: { hoursGoal:24, subsGoal:100, donationsGoal:50, cheersGoal:1000 },
  locale: 'es-ES'
};

const state = {
  secondsLeft: 0,
  history: []
};

function formatHMS(s){
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return [h,m,sec].map(v=>String(v).padStart(2,'0')).join(':');
}

function updateTimerDisplay(){
  document.getElementById('timer').textContent = formatHMS(state.secondsLeft);
}

function tick(){
  if(state.secondsLeft>0){
    state.secondsLeft--;
    updateTimerDisplay();
  }
  requestAnimationFrame(()=>setTimeout(tick,1000));
}

// popup animation
function showAddPopup(text){
  const bubble = document.getElementById('addBubble');
  bubble.textContent = text;
  bubble.classList.remove('pop');
  void bubble.offsetWidth;
  bubble.classList.add('pop');
  setTimeout(()=>{ bubble.textContent='add +0m'; }, cfg.popupDuration);
}

// event text update
function showEventText(type, name, amount){
  const text = document.getElementById('eventText');
  const detail = document.getElementById('eventDetail');
  let title="";
  switch(type){
    case 'donation': title = 'NUEVA DONACIÓN'; break;
    case 'cheer': title = 'NUEVO CHEERLEADER'; break;
    case 'sub': title = 'NUEVO SUB'; break;
    case 'subgift': title = 'NUEVO SUB REGALADO'; break;
    default: title = 'To add more time';
  }
  text.innerHTML = `<strong style="color:var(--gold)">${title}</strong>`;
  detail.textContent = `${name} — ${amount}`;
}

// add seconds based on rule
function computeAddedSeconds(evt){
  if(evt.type==='donation'){
    const usd = Number(evt.amount) || 0;
    return Math.floor(usd * cfg.donationPerDollar);
  } else if(evt.type==='cheer'){
    const bits = Number(evt.amount) || 0;
    return Math.floor(bits / cfg.bitsPerUnit) * 60;
  } else if(evt.type==='sub'){
    const tier = evt.tier || 1;
    if(tier==1) return cfg.tiers.tier1;
    if(tier==2) return cfg.tiers.tier2;
    return cfg.tiers.tier3;
  } else if(evt.type==='subgift'){
    const tier = evt.tier || 1;
    return (tier==1?cfg.tiers.tier1: tier==2?cfg.tiers.tier2:cfg.tiers.tier3) * (evt.count || 1);
  }
  return 0;
}

function applyEvent(evt){
  const secs = computeAddedSeconds(evt);
  if(secs<=0) return;
  state.secondsLeft += secs;
  state.history.push({evt,secs,ts:Date.now()});
  updateTimerDisplay();
  showAddPopup(`add +${Math.floor(secs/60)}m`);
  showEventText(evt.type, evt.name, evt.amount || (evt.count?evt.count+' subs':'' ));
  // TODO: goal updates
}

//---------------------------------------------
// SIMULATOR MODE: listener for simulator.html
//---------------------------------------------
window.addEventListener("onWidgetEvent", (ev) => {
    if (!ev || !ev.detail) return;
    applyEvent(ev.detail);
});

// StreamElements event handler
function onWidgetLoad(obj){
  // merge settings
  if(obj && obj.fields){
    const f = obj.fields;
    cfg.popupDuration = (Number(f.popupDuration) || 3) * 1000;
    cfg.donationPerDollar = Number(f.donationPerDollar) || cfg.donationPerDollar;
    cfg.bitsPerUnit = Number(f.bitsPerUnit) || cfg.bitsPerUnit;
    cfg.tiers.tier1 = (Number(f.tier1Minutes) || 5) * 60;
    cfg.tiers.tier2 = (Number(f.tier2Minutes) || 10) * 60;
    cfg.tiers.tier3 = (Number(f.tier3Minutes) || 30) * 60;
    cfg.goals.hoursGoal = Number(f.hoursGoal) || cfg.goals.hoursGoal;
    cfg.goals.subsGoal = Number(f.subsGoal) || cfg.goals.subsGoal;
    cfg.goals.donationsGoal = Number(f.donationsGoal) || cfg.goals.donationsGoal;
    cfg.goals.cheersGoal = Number(f.cheersGoal) || cfg.goals.cheersGoal;
    if(obj.session && obj.session.timeLeft) {
      state.secondsLeft = Math.floor(Number(obj.session.timeLeft));
    }
  }

  // attach event listeners
  if(window.addEventListener) {
    window.addEventListener('onWidgetEvent', function (obj) {
      const ed = obj.detail;
      handleSEEvent(ed);
    });
  }

  // start ticking
  updateDateTime();
  updateTimerDisplay();
  tick();
}

function handleSEEvent(ed){
  if(!ed || !ed.type) return;
  // Map streamelements event types to our internal events
  if(ed.type==='donation-latest' || ed.type==='tip-latest' || ed.type==='tip'){
    // donation event
    const amt = ed.data && (ed.data.amount || ed.data.amountUSD || ed.data.donationAmount) || 0;
    const name = ed.data && (ed.data.name || ed.data.username) || 'anon';
    applyEvent({type:'donation', name, amount:amt});
  } else if(ed.type && ed.type.indexOf('cheer')!==-1 || ed.type==='cheerPurchase-latest'){
    const amt = ed.data && ed.data.amount || 0;
    const name = ed.data && ed.data.name || 'anon';
    applyEvent({type:'cheer', name, amount:amt});
  } else if(ed.type==='subscriber-latest' || ed.type==='subscription-latest'){
    const tier = ed.data && ed.data.subPlan && (ed.data.subPlan.includes('Prime')?1: ed.data.subPlan.includes('1000')?1: (ed.data.subPlan.includes('2000')?2:3)) || 1;
    const name = ed.data && (ed.data.name || ed.data.username) || 'anon';
    applyEvent({type:'sub', tier, name, amount: ''});
  } else if(ed.type==='subscription-gifted'){
    const tier = ed.data && ed.data.subPlan || 1;
    const count = ed.data && ed.data.giftCount || 1;
    const name = ed.data && ed.data.sender || ed.data.name || 'anon';
    // count-based: add per recipient
    applyEvent({type:'subgift', tier: (ed.data.subPlanLevel || 1), name, count});
  } else {
    // other events ignored
    // console.log('Unhandled event', ed.type, ed);
  }
}

function updateDateTime(){
  const el = document.getElementById('dateTime');
  const now = new Date();
  el.textContent = now.toLocaleString(cfg.locale);
  setTimeout(updateDateTime, 1000);
}

// Expose onWidgetLoad for StreamElements to call
window.onWidgetLoad = onWidgetLoad;

// For local testing (simulator) expose applyEvent
window._applyEvent = applyEvent;
