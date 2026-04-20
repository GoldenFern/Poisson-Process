const BOOK_LEVELS = Array.from({ length: 6 }, (_, index) => `<span style="--level:${index}"></span>`).join("");
const RACK_LIGHTS = Array.from({ length: 6 }, () => `<span class="rack-light"></span>`).join("");
const DETECTOR_DOTS = Array.from(
  { length: 8 },
  (_, index) => `<span class="detector-dot detector-dot-${index}" data-detector-index="${index}"></span>`
).join("");

const SCENE_META = {
  transport: {
    subtitle: "Cars enter a signalized intersection one by one as the sampled path jumps upward.",
    timeUnit: "min",
    nounSingular: "car",
    nounPlural: "cars",
  },
  quant: {
    subtitle: "Buy and sell orders hit a matching engine with the irregular cadence of a Poisson sample path.",
    timeUnit: "s",
    nounSingular: "order",
    nounPlural: "orders",
  },
  server: {
    subtitle: "Requests stream through an API edge and light up the rack whenever a new arrival occurs.",
    timeUnit: "s",
    nounSingular: "request",
    nounPlural: "requests",
  },
  physchem: {
    subtitle: "Independent decay detections radiate outward from a source toward a detector ring.",
    timeUnit: "s",
    nounSingular: "decay",
    nounPlural: "decays",
  },
};

const TRANSPORT_LANES = ["32%", "48%", "64%"];
const TRANSPORT_COLORS = ["#f97316", "#38bdf8", "#facc15", "#22c55e"];
const ORDER_SLOTS = ["20%", "31%", "42%", "53%", "64%"];
const PACKET_LANES = ["24%", "38%", "52%", "66%"];
const DETECTOR_ANGLES = [-90, -42, 8, 48, 92, 138, 184, 230];

export function getSceneProfile(caseId) {
  return SCENE_META[caseId] || SCENE_META.transport;
}

export function resetScene(container, caseId) {
  container.className = `scenario-stage ${caseId}`;
  container.innerHTML = buildSceneMarkup(caseId);
  updateSceneProgress(container, 0);
}

export function updateSceneProgress(container, progress) {
  const progressBar = container.querySelector("[data-scene-progress]");
  if (progressBar) {
    progressBar.style.width = `${Math.max(0, Math.min(progress, 1)) * 100}%`;
  }
}

export function emitSceneEvent(container, caseId, eventInfo) {
  switch (caseId) {
    case "quant":
      emitQuantEvent(container, eventInfo);
      break;
    case "server":
      emitServerEvent(container, eventInfo);
      break;
    case "physchem":
      emitPhyschemEvent(container, eventInfo);
      break;
    case "transport":
    default:
      emitTransportEvent(container, eventInfo);
      break;
  }
}

function buildSceneMarkup(caseId) {
  switch (caseId) {
    case "quant":
      return `
        <div class="scene-shell quant-shell">
          <div class="scene-caption">
            <span class="scene-tag">Microstructure window</span>
            <strong>Orders flash in from both sides and collapse into the matching engine.</strong>
          </div>
          <div class="book-column bids">${BOOK_LEVELS}</div>
          <div class="matching-core" data-scene-pulse>Match</div>
          <div class="book-column asks">${BOOK_LEVELS}</div>
          <div class="scene-event-layer" data-scene-layer></div>
          <div class="scene-progress"><span data-scene-progress></span></div>
        </div>`;
    case "server":
      return `
        <div class="scene-shell server-shell">
          <div class="scene-caption">
            <span class="scene-tag">Gateway window</span>
            <strong>Packets ride across the edge network and pulse the rack on every arrival.</strong>
          </div>
          <div class="network-grid"></div>
          <div class="edge-router" data-scene-router>API Edge</div>
          <div class="server-rack">${RACK_LIGHTS}</div>
          <div class="scene-event-layer" data-scene-layer></div>
          <div class="scene-progress"><span data-scene-progress></span></div>
        </div>`;
    case "physchem":
      return `
        <div class="scene-shell physchem-shell">
          <div class="scene-caption">
            <span class="scene-tag">Detection window</span>
            <strong>Decay signals burst from the source and strike a detector ring in random directions.</strong>
          </div>
          <div class="detector-ring"></div>
          <div class="nucleus-core" data-scene-core></div>
          ${DETECTOR_DOTS}
          <div class="scene-event-layer" data-scene-layer></div>
          <div class="scene-progress"><span data-scene-progress></span></div>
        </div>`;
    case "transport":
    default:
      return `
        <div class="scene-shell transport-shell">
          <div class="scene-caption">
            <span class="scene-tag">Intersection window</span>
            <strong>Vehicles reach the stop line independently, lifting the counting process step by step.</strong>
          </div>
          <div class="transport-road">
            <div class="lane lane-a"></div>
            <div class="lane lane-b"></div>
            <div class="lane lane-c"></div>
            <div class="intersection-block" data-scene-pulse></div>
            <div class="traffic-signal">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <div class="scene-event-layer" data-scene-layer></div>
          <div class="scene-progress"><span data-scene-progress></span></div>
        </div>`;
  }
}

function emitTransportEvent(container, eventInfo) {
  const layer = getLayer(container);
  const car = document.createElement("div");
  car.className = "transport-car";
  car.style.setProperty("--lane", TRANSPORT_LANES[eventInfo.index % TRANSPORT_LANES.length]);
  car.style.setProperty("--car-body", TRANSPORT_COLORS[eventInfo.index % TRANSPORT_COLORS.length]);
  appendTransient(layer, car);
  pulse(container.querySelector("[data-scene-pulse]"), "is-hit");
}

function emitQuantEvent(container, eventInfo) {
  const layer = getLayer(container);
  const order = document.createElement("div");
  const isBuy = eventInfo.index % 2 === 0;
  order.className = `order-event ${isBuy ? "buy" : "sell"}`;
  order.style.setProperty("--slot", ORDER_SLOTS[eventInfo.index % ORDER_SLOTS.length]);
  order.textContent = isBuy ? "BUY" : "SELL";
  appendTransient(layer, order);
  pulse(container.querySelector("[data-scene-pulse]"), "is-live");
}

function emitServerEvent(container, eventInfo) {
  const layer = getLayer(container);
  const packet = document.createElement("div");
  packet.className = "packet-event";
  packet.style.setProperty("--lane", PACKET_LANES[eventInfo.index % PACKET_LANES.length]);
  appendTransient(layer, packet);
  pulse(container.querySelector("[data-scene-router]"), "is-hit");

  const lights = container.querySelectorAll(".rack-light");
  if (lights.length > 0) {
    pulse(lights[eventInfo.index % lights.length], "is-busy");
  }
}

function emitPhyschemEvent(container, eventInfo) {
  const layer = getLayer(container);
  const angle = DETECTOR_ANGLES[eventInfo.index % DETECTOR_ANGLES.length];

  const ray = document.createElement("div");
  ray.className = "decay-ray";
  ray.style.setProperty("--angle", `${angle}deg`);
  appendTransient(layer, ray);

  const blip = document.createElement("div");
  blip.className = "detector-blip";
  blip.style.setProperty("--angle", `${angle}deg`);
  appendTransient(layer, blip);

  pulse(container.querySelector("[data-scene-core]"), "is-decaying");
  pulse(container.querySelector(`[data-detector-index="${eventInfo.index % DETECTOR_ANGLES.length}"]`), "is-hit");
}

function getLayer(container) {
  return container.querySelector("[data-scene-layer]");
}

function appendTransient(layer, element) {
  if (!layer) {
    return;
  }

  layer.appendChild(element);
  element.addEventListener("animationend", () => element.remove(), { once: true });
}

function pulse(element, className) {
  if (!element) {
    return;
  }
  element.classList.remove(className);
  // Force a style recalculation so the keyframe can restart on repeated hits.
  void element.offsetWidth;
  element.classList.add(className);
}
