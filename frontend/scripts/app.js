import {
  createArrivalChart,
  createHistogramChart,
  createPathChart,
  finishPathPlayback,
  startPathPlayback,
  updateArrivalChart,
  updateHistogramChart,
  updatePathPlayback,
} from "./charts.js";
import { emitSceneEvent, getSceneProfile, resetScene, updateSceneProgress } from "./scenes.js";

const API_BASE = "http://localhost:8080";

const ui = {
  caseSelect: document.getElementById("caseSelect"),
  lambdaInput: document.getElementById("lambdaInput"),
  tInput: document.getElementById("tInput"),
  dtInput: document.getElementById("dtInput"),
  trialsInput: document.getElementById("trialsInput"),
  playbackSpeed: document.getElementById("playbackSpeed"),
  simulateButton: document.getElementById("simulateButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  caseDescription: document.getElementById("caseDescription"),
  healthBlock: document.getElementById("healthBlock"),
  empMean: document.getElementById("empMean"),
  theoMean: document.getElementById("theoMean"),
  empVar: document.getElementById("empVar"),
  theoVar: document.getElementById("theoVar"),
  sceneTitle: document.getElementById("sceneTitle"),
  sceneSubtitle: document.getElementById("sceneSubtitle"),
  sceneStage: document.getElementById("sceneStage"),
  playbackStatus: document.getElementById("playbackStatus"),
  timeReadout: document.getElementById("timeReadout"),
  countReadout: document.getElementById("countReadout"),
};

const charts = {
  path: createPathChart(document.getElementById("pathChart")),
  hist: createHistogramChart(document.getElementById("histChart")),
  arrival: createArrivalChart(document.getElementById("arrivalChart")),
};

const playbackState = {
  status: "idle",
  payload: null,
  frameId: null,
  playheadMs: 0,
  lastFrameAt: null,
  chartLastPaintAt: 0,
  processedArrivals: 0,
  currentCount: 0,
  committedStepPoints: [{ t: 0, n: 0 }],
  durationMs: Number(ui.playbackSpeed.value) || 8000,
  fetchController: null,
};

let cases = [];
let activeCase = null;

function renderSummary(summary) {
  ui.empMean.textContent = summary.empirical_mean_count.toFixed(4);
  ui.theoMean.textContent = summary.theoretical_mean_count.toFixed(4);
  ui.empVar.textContent = summary.empirical_variance_count.toFixed(4);
  ui.theoVar.textContent = summary.theoretical_variance_count.toFixed(4);
}

function getRequestPayload() {
  return {
    lambda: Number(ui.lambdaInput.value),
    T: Number(ui.tInput.value),
    dt: Number(ui.dtInput.value),
    trials: Number(ui.trialsInput.value),
  };
}

function getTimePrecision(horizonT) {
  if (horizonT < 0.2) {
    return 4;
  }
  if (horizonT < 1) {
    return 3;
  }
  if (horizonT < 10) {
    return 2;
  }
  return 1;
}

function formatTime(currentT, horizonT) {
  const precision = getTimePrecision(horizonT);
  const unit = getSceneProfile(activeCase?.id || "transport").timeUnit;
  return `t = ${currentT.toFixed(precision)} / ${horizonT.toFixed(precision)} ${unit}`;
}

function formatCount(count) {
  const profile = getSceneProfile(activeCase?.id || "transport");
  const noun = count === 1 ? profile.nounSingular : profile.nounPlural;
  return `${count} ${noun}`;
}

function setPlaybackStatus(label, mode) {
  ui.playbackStatus.textContent = label;
  ui.playbackStatus.dataset.mode = mode;
}

function syncButtons() {
  const isLoading = playbackState.status === "loading";
  ui.simulateButton.disabled = isLoading;
  ui.simulateButton.textContent = playbackState.status === "finished" ? "Play Another Path" : isLoading ? "Generating..." : "Play New Path";
  ui.pauseButton.disabled = !(playbackState.status === "playing" || playbackState.status === "paused");
  ui.pauseButton.textContent = playbackState.status === "paused" ? "Resume" : "Pause";
}

function updatePlaybackReadouts(currentT, horizonT, count) {
  ui.timeReadout.textContent = formatTime(currentT, horizonT);
  ui.countReadout.textContent = formatCount(count);
}

function renderSceneHeader() {
  if (!activeCase) {
    return;
  }
  const profile = getSceneProfile(activeCase.id);
  ui.sceneTitle.textContent = activeCase.display_name;
  ui.sceneSubtitle.textContent = profile.subtitle;
}

function resetPlaybackPresentation() {
  const horizonT = Number(ui.tInput.value) || 1;
  renderSceneHeader();
  resetScene(ui.sceneStage, activeCase?.id || "transport");
  startPathPlayback(charts.path, [], horizonT);
  updatePlaybackReadouts(0, horizonT, 0);
  updateSceneProgress(ui.sceneStage, 0);
  if (playbackState.status !== "loading") {
    setPlaybackStatus("Ready", "idle");
  }
  syncButtons();
}

function abortPendingRequest() {
  if (playbackState.fetchController) {
    playbackState.fetchController.abort();
    playbackState.fetchController = null;
  }
}

function stopPlayback() {
  if (playbackState.frameId) {
    cancelAnimationFrame(playbackState.frameId);
    playbackState.frameId = null;
  }

  playbackState.status = "idle";
  playbackState.payload = null;
  playbackState.playheadMs = 0;
  playbackState.lastFrameAt = null;
  playbackState.chartLastPaintAt = 0;
  playbackState.processedArrivals = 0;
  playbackState.currentCount = 0;
  playbackState.committedStepPoints = [{ t: 0, n: 0 }];
}

function applyCaseDefaults(selected) {
  stopPlayback();
  abortPendingRequest();

  activeCase = selected;
  ui.lambdaInput.value = selected.defaults.lambda;
  ui.tInput.value = selected.defaults.T;
  ui.dtInput.value = selected.defaults.dt;
  ui.caseDescription.textContent = selected.description;
  ui.caseSelect.value = selected.id;
  resetPlaybackPresentation();
}

async function fetchCases() {
  const res = await fetch(`${API_BASE}/api/cases`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to load case presets.");
  }
  cases = data.data.cases;

  ui.caseSelect.innerHTML = "";
  cases.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.display_name;
    ui.caseSelect.appendChild(option);
  });

  if (cases.length > 0) {
    applyCaseDefaults(cases[0]);
  }
}

async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to load health.");
  }
  const info = data.data;
  ui.healthBlock.innerHTML =
    `<strong>Backend:</strong> ${info.service} (${info.status})<br>` +
    `<strong>Build:</strong> ${info.build_timestamp}<br>` +
    `<strong>Cases:</strong> ${info.available_cases.join(", ")}`;
}

function beginPlayback(payload) {
  playbackState.payload = payload;
  playbackState.status = "playing";
  playbackState.playheadMs = 0;
  playbackState.lastFrameAt = null;
  playbackState.chartLastPaintAt = 0;
  playbackState.processedArrivals = 0;
  playbackState.currentCount = 0;
  playbackState.committedStepPoints = [{ t: 0, n: 0 }];
  playbackState.durationMs = Number(ui.playbackSpeed.value) || 8000;

  resetScene(ui.sceneStage, activeCase?.id || "transport");
  updatePlaybackReadouts(0, payload.parameters.T, 0);
  setPlaybackStatus("Playing", "playing");
  syncButtons();

  startPathPlayback(charts.path, payload.expected_path, payload.parameters.T);
  playbackState.frameId = requestAnimationFrame(stepPlayback);
}

function processArrivalsUpTo(currentT) {
  if (!playbackState.payload) {
    return;
  }

  const arrivals = playbackState.payload.single_path.arrival_times;
  while (
    playbackState.processedArrivals < arrivals.length &&
    arrivals[playbackState.processedArrivals] <= currentT + 1e-9
  ) {
    const arrivalTime = arrivals[playbackState.processedArrivals];
    const nextCount = playbackState.currentCount + 1;

    playbackState.committedStepPoints.push({ t: arrivalTime, n: nextCount - 1 }, { t: arrivalTime, n: nextCount });
    playbackState.currentCount = nextCount;

    emitSceneEvent(ui.sceneStage, activeCase?.id || "transport", {
      index: playbackState.processedArrivals,
      count: nextCount,
      arrivalTime,
    });

    playbackState.processedArrivals += 1;
  }
}

function finishPlayback() {
  if (!playbackState.payload) {
    return;
  }

  if (playbackState.frameId) {
    cancelAnimationFrame(playbackState.frameId);
    playbackState.frameId = null;
  }

  const horizonT = playbackState.payload.parameters.T;
  const finalCount = playbackState.currentCount;

  playbackState.status = "finished";
  playbackState.lastFrameAt = null;
  playbackState.playheadMs = playbackState.durationMs;

  updateSceneProgress(ui.sceneStage, 1);
  updatePlaybackReadouts(horizonT, horizonT, finalCount);
  setPlaybackStatus("Path complete", "finished");
  finishPathPlayback(
    charts.path,
    playbackState.committedStepPoints,
    horizonT,
    finalCount,
    playbackState.payload.expected_path
  );
  syncButtons();
}

function stepPlayback(now) {
  if (playbackState.status !== "playing" || !playbackState.payload) {
    return;
  }

  if (playbackState.lastFrameAt === null) {
    playbackState.lastFrameAt = now;
  }

  const deltaMs = now - playbackState.lastFrameAt;
  playbackState.lastFrameAt = now;
  playbackState.playheadMs = Math.min(playbackState.playheadMs + deltaMs, playbackState.durationMs);

  const horizonT = playbackState.payload.parameters.T;
  const progress = playbackState.durationMs > 0 ? playbackState.playheadMs / playbackState.durationMs : 1;
  const currentT = horizonT * progress;

  processArrivalsUpTo(currentT);
  updateSceneProgress(ui.sceneStage, progress);
  updatePlaybackReadouts(currentT, horizonT, playbackState.currentCount);

  if (now - playbackState.chartLastPaintAt >= 33 || playbackState.playheadMs >= playbackState.durationMs) {
    updatePathPlayback(
      charts.path,
      playbackState.committedStepPoints,
      currentT,
      playbackState.currentCount,
      horizonT,
      playbackState.payload.expected_path
    );
    playbackState.chartLastPaintAt = now;
  }

  if (playbackState.playheadMs >= playbackState.durationMs) {
    finishPlayback();
    return;
  }

  playbackState.frameId = requestAnimationFrame(stepPlayback);
}

async function playFreshPath() {
  if (!activeCase) {
    return;
  }

  stopPlayback();
  abortPendingRequest();
  resetPlaybackPresentation();

  const controller = new AbortController();
  playbackState.fetchController = controller;
  playbackState.status = "loading";
  setPlaybackStatus("Generating new sample...", "loading");
  syncButtons();

  try {
    const res = await fetch(`${API_BASE}/api/simulate/poisson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequestPayload()),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Simulation failed.");
    }

    if (playbackState.fetchController !== controller) {
      return;
    }
    playbackState.fetchController = null;

    const payload = data.data;
    renderSummary(payload.summary);
    updateHistogramChart(charts.hist, payload.histogram);
    updateArrivalChart(charts.arrival, payload.inter_arrivals, payload.parameters.lambda);
    beginPlayback(payload);
  } catch (err) {
    if (err.name === "AbortError") {
      return;
    }

    playbackState.fetchController = null;
    playbackState.status = "idle";
    setPlaybackStatus("Error", "error");
    syncButtons();
    window.alert(err.message);
  }
}

function togglePause() {
  if (!playbackState.payload) {
    return;
  }

  if (playbackState.status === "playing") {
    if (playbackState.frameId) {
      cancelAnimationFrame(playbackState.frameId);
      playbackState.frameId = null;
    }
    playbackState.status = "paused";
    playbackState.lastFrameAt = null;
    setPlaybackStatus("Paused", "paused");
    syncButtons();
    return;
  }

  if (playbackState.status === "paused") {
    playbackState.status = "playing";
    playbackState.lastFrameAt = null;
    setPlaybackStatus("Playing", "playing");
    syncButtons();
    playbackState.frameId = requestAnimationFrame(stepPlayback);
  }
}

function bindEvents() {
  ui.caseSelect.addEventListener("change", () => {
    const selected = cases.find((c) => c.id === ui.caseSelect.value);
    if (selected) {
      applyCaseDefaults(selected);
      playFreshPath();
    }
  });

  ui.resetButton.addEventListener("click", () => {
    if (activeCase) {
      applyCaseDefaults(activeCase);
    }
  });

  ui.simulateButton.addEventListener("click", playFreshPath);
  ui.pauseButton.addEventListener("click", togglePause);
}

async function bootstrap() {
  try {
    await fetchHealth();
    await fetchCases();
    bindEvents();
    await playFreshPath();
  } catch (err) {
    ui.healthBlock.textContent = `Startup error: ${err.message}`;
    setPlaybackStatus("Startup error", "error");
  }
}

bootstrap();
