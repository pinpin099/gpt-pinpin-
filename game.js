const state = {
  time: 60,
  honey: 0,
  bees: 1,
  crumbs: 0,
  ants: 1,
  running: true,
};

const ui = {
  time: document.getElementById("time"),
  honey: document.getElementById("honey"),
  bees: document.getElementById("bees"),
  crumbs: document.getElementById("crumbs"),
  ants: document.getElementById("ants"),
  eventLog: document.getElementById("event-log"),
  forageNectar: document.getElementById("forage-nectar"),
  hatchBee: document.getElementById("hatch-bee"),
  scoutCrumb: document.getElementById("scout-crumb"),
  hatchAnt: document.getElementById("hatch-ant"),
  restart: document.getElementById("restart"),
};

function logEvent(message) {
  ui.eventLog.textContent = message;
}

function render() {
  ui.time.textContent = state.time;
  ui.honey.textContent = state.honey;
  ui.bees.textContent = state.bees;
  ui.crumbs.textContent = state.crumbs;
  ui.ants.textContent = state.ants;

  ui.hatchBee.disabled = state.honey < 10 || !state.running;
  ui.hatchAnt.disabled = state.crumbs < 10 || !state.running;
  ui.forageNectar.disabled = !state.running;
  ui.scoutCrumb.disabled = !state.running;
}

function endGame() {
  state.running = false;
  ui.restart.hidden = false;

  if (state.honey > state.crumbs) {
    logEvent("🐝 The Beehive wins with richer stores of honey!");
  } else if (state.crumbs > state.honey) {
    logEvent("🐜 The Ant Farm wins with superior foraging!");
  } else {
    logEvent("🤝 Draw! Both colonies are evenly matched.");
  }

  render();
}

function tick() {
  if (!state.running) return;

  state.honey += state.bees;
  state.crumbs += state.ants;
  state.time -= 1;

  if (Math.random() < 0.3) {
    const events = [
      "A warm breeze helps pollen flow (+2 honey)!",
      "A picnic spill helps the ants (+2 crumbs)!",
      "Rain slows both colonies this turn.",
    ];
    const choice = events[Math.floor(Math.random() * events.length)];
    if (choice.includes("honey")) state.honey += 2;
    if (choice.includes("crumbs")) state.crumbs += 2;
    logEvent(choice);
  }

  if (state.time <= 0) {
    endGame();
    return;
  }

  render();
}

ui.forageNectar.addEventListener("click", () => {
  if (!state.running) return;
  state.honey += 1;
  logEvent("The bees return with a drop of nectar.");
  render();
});

ui.scoutCrumb.addEventListener("click", () => {
  if (!state.running) return;
  state.crumbs += 1;
  logEvent("An ant scout drags back a tasty crumb.");
  render();
});

ui.hatchBee.addEventListener("click", () => {
  if (state.honey < 10 || !state.running) return;
  state.honey -= 10;
  state.bees += 1;
  logEvent("A new worker bee joins the hive.");
  render();
});

ui.hatchAnt.addEventListener("click", () => {
  if (state.crumbs < 10 || !state.running) return;
  state.crumbs -= 10;
  state.ants += 1;
  logEvent("A new ant joins the foraging line.");
  render();
});

ui.restart.addEventListener("click", () => {
  window.location.reload();
});

setInterval(tick, 1000);
render();
