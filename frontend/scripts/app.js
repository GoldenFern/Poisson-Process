import { CASE_CONTENT, buildBackgroundHtml } from "./content.js";
import {
  createDiagnosticChart,
  createDistributionChart,
  createPrimaryChart,
  renderDiagnosticChart,
  renderDistributionChart,
  renderSpatialPrimary,
  renderTemporalPrimary,
} from "./charts.js";

const DEFAULT_API_BASE = "http://127.0.0.1:8080";
const STARTUP_RETRY_INTERVAL_MS = 750;
const STARTUP_MAX_ATTEMPTS = 20;

function resolveApiBase() {
  const params = new URLSearchParams(window.location.search);
  const apiBase = params.get("apiBase") || DEFAULT_API_BASE;
  return apiBase.replace(/\/+$/, "");
}

const API_BASE = resolveApiBase();

const ui = {
  labTab: document.getElementById("labTab"),
  backgroundTab: document.getElementById("backgroundTab"),
  labView: document.getElementById("labView"),
  backgroundView: document.getElementById("backgroundView"),
  caseSelect: document.getElementById("caseSelect"),
  activeCaseLabel: document.getElementById("activeCaseLabel"),
  activeCaseTitle: document.getElementById("activeCaseTitle"),
  activeCaseDescription: document.getElementById("activeCaseDescription"),
  lambdaLabel: document.getElementById("lambdaLabel"),
  horizonLabel: document.getElementById("horizonLabel"),
  dtRow: document.getElementById("dtRow"),
  dtLabel: document.getElementById("dtLabel"),
  lambdaInput: document.getElementById("lambdaInput"),
  horizonInput: document.getElementById("tInput"),
  dtInput: document.getElementById("dtInput"),
  trialsInput: document.getElementById("trialsInput"),
  playbackSpeed: document.getElementById("playbackSpeed"),
  simulateButton: document.getElementById("simulateButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  healthBlock: document.getElementById("healthBlock"),
  statusPill: document.getElementById("statusPill"),
  progressReadout: document.getElementById("progressReadout"),
  valueReadout: document.getElementById("valueReadout"),
  primaryTitle: document.getElementById("primaryTitle"),
  distributionTitle: document.getElementById("distributionTitle"),
  diagnosticTitle: document.getElementById("diagnosticTitle"),
  summaryCards: document.getElementById("summaryCards"),
  insightList: document.getElementById("insightList"),
  mathSnippet: document.getElementById("mathSnippet"),
  backgroundContent: document.getElementById("backgroundContent"),
};

const charts = {
  primary: createPrimaryChart(document.getElementById("primaryChart")),
  distribution: createDistributionChart(document.getElementById("distributionChart")),
  diagnostic: createDiagnosticChart(document.getElementById("diagnosticChart")),
};

const playbackState = {
  status: "idle",
  payload: null,
  frameId: null,
  playheadMs: 0,
  lastFrameAt: null,
  chartLastPaintAt: 0,
  processedEvents: 0,
  currentValue: 0,
  committedPoints: [{ x: 0, y: 0 }],
  revealedPoints: 0,
  durationMs: 9000,
  fetchController: null,
};

let cases = [];
let activeCase = null;

function resolveCaseContent(caseId) {
  return CASE_CONTENT[caseId] || CASE_CONTENT.homogeneous;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseApiResponse(response, defaultMessage) {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const preview = rawText.trim().replace(/\s+/g, " ").slice(0, 140);
    throw new Error(
      `${defaultMessage} Expected JSON from ${response.url}, got ${response.status} ${response.statusText}${preview ? `: ${preview}` : ""}`
    );
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`${defaultMessage} Invalid JSON returned by ${response.url}.`);
  }

  if (!response.ok) {
    throw new Error(data.error || `${defaultMessage} HTTP ${response.status}.`);
  }
  if (!data.success) {
    throw new Error(data.error || defaultMessage);
  }
  return data;
}

function formatNumber(value) {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return value.toFixed(1);
  }
  if (absValue >= 100) {
    return value.toFixed(2);
  }
  if (absValue >= 10) {
    return value.toFixed(3);
  }
  return value.toFixed(4);
}

function formatProcessValue(caseId, value) {
  if (caseId === "compound") {
    return formatNumber(value);
  }
  if (caseId === "spatial") {
    return String(Math.round(value));
  }
  if (Math.abs(value - Math.round(value)) < 1e-9) {
    return String(Math.round(value));
  }
  return formatNumber(value);
}

function queueMathTypeset(elements) {
  const nodes = elements.filter(Boolean);
  const tryTypeset = () => {
    if (!window.MathJax?.typesetPromise) {
      window.setTimeout(tryTypeset, 150);
      return;
    }
    window.MathJax.typesetPromise(nodes).catch(() => {});
  };
  tryTypeset();
}

function setView(mode) {
  const showLab = mode === "lab";
  ui.labTab.classList.toggle("is-active", showLab);
  ui.backgroundTab.classList.toggle("is-active", !showLab);
  ui.labView.classList.toggle("is-active", showLab);
  ui.backgroundView.classList.toggle("is-active", !showLab);

  if (!showLab) {
    queueMathTypeset([ui.backgroundContent]);
  }
}

function setStatus(label, mode) {
  ui.statusPill.textContent = label;
  ui.statusPill.dataset.mode = mode;
}

function syncButtons() {
  const isLoading = playbackState.status === "loading";
  ui.simulateButton.disabled = isLoading;
  ui.pauseButton.disabled = !(playbackState.status === "playing" || playbackState.status === "paused");
  ui.pauseButton.textContent = playbackState.status === "paused" ? "Resume" : "Pause";
  ui.simulateButton.textContent = playbackState.status === "finished" ? "Generate New Sample" : isLoading ? "Computing..." : "Generate Sample";
}

function clearChart(chart) {
  chart.data.labels = [];
  chart.data.datasets = [];
  chart.update("none");
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
  playbackState.processedEvents = 0;
  playbackState.currentValue = 0;
  playbackState.committedPoints = [{ x: 0, y: 0 }];
  playbackState.revealedPoints = 0;
}

function abortPendingRequest() {
  if (playbackState.fetchController) {
    playbackState.fetchController.abort();
    playbackState.fetchController = null;
  }
}

function renderSummaryMetrics(metrics) {
  ui.summaryCards.innerHTML = "";
  for (const metric of metrics) {
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <span class="metric-label">${metric.label}</span>
      <strong class="metric-empirical">${formatNumber(metric.empirical_value)}</strong>
      <span class="metric-theory">Theory: ${formatNumber(metric.theoretical_value)}</span>
    `;
    ui.summaryCards.appendChild(card);
  }
}

function renderInsights(insights, content) {
  ui.insightList.innerHTML = "";

  const leadItem = document.createElement("li");
  leadItem.innerHTML = `<strong>${content.heading}.</strong> ${content.labDescription}`;
  ui.insightList.appendChild(leadItem);

  for (const insight of insights) {
    const item = document.createElement("li");
    item.textContent = insight;
    ui.insightList.appendChild(item);
  }
}

function renderMathSnippet(content) {
  ui.mathSnippet.innerHTML = content.mathSnippet;
  queueMathTypeset([ui.mathSnippet]);
}

function updateReadouts(progressLabel, valueLabel) {
  ui.progressReadout.textContent = progressLabel;
  ui.valueReadout.textContent = valueLabel;
}

function updateLabCopy(casePreset) {
  const content = resolveCaseContent(casePreset.id);
  ui.activeCaseLabel.textContent = `${content.badge} Process`;
  ui.activeCaseTitle.textContent = casePreset.display_name;
  ui.activeCaseDescription.textContent = casePreset.description;
  ui.primaryTitle.textContent = content.primaryTitle;
  ui.distributionTitle.textContent = content.distributionTitle;
  ui.diagnosticTitle.textContent = content.diagnosticTitle;
  renderMathSnippet(content);
}

function updateControlLabels(casePreset) {
  const content = resolveCaseContent(casePreset.id);
  ui.lambdaLabel.textContent = content.lambdaLabel;
  ui.horizonLabel.textContent = content.horizonLabel;
  ui.dtLabel.textContent = content.dtLabel;
  ui.dtRow.hidden = !casePreset.uses_dt;
}

function populateCaseSelect() {
  ui.caseSelect.innerHTML = "";
  for (const casePreset of cases) {
    const content = resolveCaseContent(casePreset.id);
    const option = document.createElement("option");
    option.value = casePreset.id;
    option.textContent = `${casePreset.display_name} · ${content.badge}`;
    ui.caseSelect.appendChild(option);
  }
}

function resetPresentation() {
  if (!activeCase) {
    return;
  }

  const content = resolveCaseContent(activeCase.id);
  updateLabCopy(activeCase);
  renderSummaryMetrics([]);
  renderInsights([], content);
  clearChart(charts.primary);
  clearChart(charts.distribution);
  clearChart(charts.diagnostic);

  if (activeCase.id === "spatial") {
    updateReadouts("window ready", `0 ${content.valueLabel}`);
  } else {
    const horizon = Number(ui.horizonInput.value) || activeCase.defaults.T;
    updateReadouts(`t = 0.0000 / ${formatNumber(horizon)}`, `0 ${content.valueLabel}`);
  }
  setStatus("Ready", "idle");
  syncButtons();
}

function selectCase(caseId, options = {}) {
  const casePreset = cases.find((item) => item.id === caseId);
  if (!casePreset) {
    return;
  }

  const shouldSimulate = options.simulate !== false;
  stopPlayback();
  abortPendingRequest();

  activeCase = casePreset;
  ui.caseSelect.value = casePreset.id;
  ui.lambdaInput.value = casePreset.defaults.lambda;
  ui.horizonInput.value = casePreset.defaults.T;
  ui.dtInput.value = casePreset.defaults.dt;
  updateControlLabels(casePreset);
  resetPresentation();

  if (shouldSimulate) {
    playFreshSample();
  }
}

function getRequestPayload() {
  return {
    case_id: activeCase.id,
    lambda: Number(ui.lambdaInput.value),
    T: Number(ui.horizonInput.value),
    dt: Number(ui.dtInput.value),
    trials: Number(ui.trialsInput.value),
  };
}

async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  const data = await parseApiResponse(res, "Failed to load backend health.");
  const info = data.data;
  ui.healthBlock.innerHTML =
    `<strong>Backend</strong>: ${info.service} (${info.status})<br>` +
    `<strong>Endpoint</strong>: ${API_BASE}<br>` +
    `<strong>Build</strong>: ${info.build_timestamp}`;
}

async function waitForBackendReady() {
  let lastError = null;

  for (let attempt = 1; attempt <= STARTUP_MAX_ATTEMPTS; attempt += 1) {
    try {
      await fetchHealth();
      return;
    } catch (error) {
      lastError = error;
      ui.healthBlock.textContent = `Waiting for backend at ${API_BASE} (${attempt}/${STARTUP_MAX_ATTEMPTS})...`;
      if (attempt < STARTUP_MAX_ATTEMPTS) {
        await delay(STARTUP_RETRY_INTERVAL_MS);
      }
    }
  }

  throw lastError || new Error(`Backend at ${API_BASE} did not become ready.`);
}

async function fetchCases() {
  const res = await fetch(`${API_BASE}/api/cases`);
  const data = await parseApiResponse(res, "Failed to load process families.");
  cases = data.data.cases;
  populateCaseSelect();
}

function renderDistribution(payload) {
  const content = resolveCaseContent(activeCase.id);
  renderDistributionChart(charts.distribution, payload.histogram, {
    empiricalLabel: "Empirical",
    theoreticalLabel: "Reference law",
    xLabel: content.distributionXLabel,
    yLabel: content.distributionYLabel,
  });
}

function renderDiagnostic(payload) {
  const content = resolveCaseContent(activeCase.id);
  renderDiagnosticChart(
    charts.diagnostic,
    {
      mode: payload.diagnostic_mode,
      samples: payload.diagnostic_samples,
      curve: payload.diagnostic_curve,
      markers: payload.diagnostic_markers,
    },
    {
      empiricalLabel: payload.diagnostic_mode === "discrete_pmf" ? "Empirical probabilities" : "Empirical density",
      theoreticalLabel: "Reference law",
      curveLabel: activeCase.id === "nonhomogeneous" ? "Intensity lambda(t)" : "Reference density",
      markerLabel: "Sampled latent rate",
      xLabel: content.diagnosticXLabel,
      yLabel: content.diagnosticYLabel,
    }
  );
}

function beginTemporalPlayback(payload) {
  const content = resolveCaseContent(activeCase.id);
  const horizon = payload.parameters.T;

  playbackState.status = "playing";
  playbackState.playheadMs = 0;
  playbackState.lastFrameAt = null;
  playbackState.chartLastPaintAt = 0;
  playbackState.processedEvents = 0;
  playbackState.currentValue = 0;
  playbackState.committedPoints = [{ x: 0, y: 0 }];
  playbackState.durationMs = Number(ui.playbackSpeed.value) || 9000;

  renderTemporalPrimary(charts.primary, [{ x: 0, y: 0 }], payload.benchmark_path, {
    horizon,
    yLabel: content.primaryYAxis,
    sampleLabel: content.sampleLabel,
    benchmarkLabel: content.benchmarkLabel,
    xLabel: "t",
  });
  updateReadouts(`t = 0.0000 / ${formatNumber(horizon)}`, `0 ${content.valueLabel}`);
  setStatus("Animating", "playing");
  syncButtons();
  playbackState.frameId = requestAnimationFrame(stepPlayback);
}

function beginSpatialPlayback(payload) {
  const content = resolveCaseContent(activeCase.id);
  const sideLength = Math.sqrt(payload.parameters.T);

  playbackState.status = "playing";
  playbackState.playheadMs = 0;
  playbackState.lastFrameAt = null;
  playbackState.chartLastPaintAt = 0;
  playbackState.revealedPoints = 0;
  playbackState.durationMs = Number(ui.playbackSpeed.value) || 9000;

  renderSpatialPrimary(charts.primary, [], sideLength, {
    sampleLabel: content.sampleLabel,
  });
  updateReadouts(`revealed 0 / ${payload.spatial_points.length}`, `lambda = ${formatNumber(payload.parameters.lambda)}`);
  setStatus("Animating", "playing");
  syncButtons();
  playbackState.frameId = requestAnimationFrame(stepPlayback);
}

function beginPlayback(payload) {
  playbackState.payload = payload;
  renderDistribution(payload);
  renderDiagnostic(payload);

  if (payload.primary_mode === "scatter") {
    beginSpatialPlayback(payload);
    return;
  }

  beginTemporalPlayback(payload);
}

function finishPlayback() {
  if (!playbackState.payload) {
    return;
  }

  const payload = playbackState.payload;
  const content = resolveCaseContent(activeCase.id);

  if (playbackState.frameId) {
    cancelAnimationFrame(playbackState.frameId);
    playbackState.frameId = null;
  }

  playbackState.status = "finished";
  playbackState.lastFrameAt = null;
  playbackState.playheadMs = playbackState.durationMs;

  if (payload.primary_mode === "scatter") {
    renderSpatialPrimary(charts.primary, payload.spatial_points, Math.sqrt(payload.parameters.T), {
      sampleLabel: content.sampleLabel,
    });
    updateReadouts(
      `revealed ${payload.spatial_points.length} / ${payload.spatial_points.length}`,
      `${payload.spatial_points.length} ${content.valueLabel}`
    );
  } else {
    renderTemporalPrimary(charts.primary, payload.primary_path, payload.benchmark_path, {
      horizon: payload.parameters.T,
      yLabel: content.primaryYAxis,
      sampleLabel: content.sampleLabel,
      benchmarkLabel: content.benchmarkLabel,
      xLabel: "t",
    });
    const finalValue = payload.primary_path.length > 0 ? payload.primary_path[payload.primary_path.length - 1].y : 0;
    updateReadouts(
      `t = ${formatNumber(payload.parameters.T)} / ${formatNumber(payload.parameters.T)}`,
      `${formatProcessValue(activeCase.id, finalValue)} ${content.valueLabel}`
    );
  }

  setStatus("Complete", "finished");
  syncButtons();
}

function stepPlayback(now) {
  if (playbackState.status !== "playing" || !playbackState.payload) {
    return;
  }

  const payload = playbackState.payload;
  const content = resolveCaseContent(activeCase.id);

  if (playbackState.lastFrameAt === null) {
    playbackState.lastFrameAt = now;
  }

  const deltaMs = now - playbackState.lastFrameAt;
  playbackState.lastFrameAt = now;
  playbackState.playheadMs = Math.min(playbackState.playheadMs + deltaMs, playbackState.durationMs);
  const progress = playbackState.durationMs > 0 ? playbackState.playheadMs / playbackState.durationMs : 1;

  if (payload.primary_mode === "scatter") {
    const revealCount = Math.min(payload.spatial_points.length, Math.floor(progress * payload.spatial_points.length));
    if (revealCount !== playbackState.revealedPoints || now - playbackState.chartLastPaintAt >= 40) {
      renderSpatialPrimary(charts.primary, payload.spatial_points.slice(0, revealCount), Math.sqrt(payload.parameters.T), {
        sampleLabel: content.sampleLabel,
      });
      playbackState.revealedPoints = revealCount;
      playbackState.chartLastPaintAt = now;
    }
    updateReadouts(`revealed ${revealCount} / ${payload.spatial_points.length}`, `lambda = ${formatNumber(payload.parameters.lambda)}`);
  } else {
    const currentT = payload.parameters.T * progress;
    while (
      playbackState.processedEvents < payload.event_times.length &&
      payload.event_times[playbackState.processedEvents] <= currentT + 1e-9
    ) {
      const eventTime = payload.event_times[playbackState.processedEvents];
      const mark = payload.event_marks[playbackState.processedEvents];
      playbackState.committedPoints.push(
        { x: eventTime, y: playbackState.currentValue },
        { x: eventTime, y: playbackState.currentValue + mark }
      );
      playbackState.currentValue += mark;
      playbackState.processedEvents += 1;
    }

    if (now - playbackState.chartLastPaintAt >= 33 || playbackState.playheadMs >= playbackState.durationMs) {
      renderTemporalPrimary(
        charts.primary,
        [...playbackState.committedPoints, { x: Math.min(currentT, payload.parameters.T), y: playbackState.currentValue }],
        payload.benchmark_path,
        {
          horizon: payload.parameters.T,
          yLabel: content.primaryYAxis,
          sampleLabel: content.sampleLabel,
          benchmarkLabel: content.benchmarkLabel,
          xLabel: "t",
        }
      );
      playbackState.chartLastPaintAt = now;
    }

    updateReadouts(
      `t = ${formatNumber(currentT)} / ${formatNumber(payload.parameters.T)}`,
      `${formatProcessValue(activeCase.id, playbackState.currentValue)} ${content.valueLabel}`
    );
  }

  if (playbackState.playheadMs >= playbackState.durationMs) {
    finishPlayback();
    return;
  }

  playbackState.frameId = requestAnimationFrame(stepPlayback);
}

async function playFreshSample() {
  if (!activeCase) {
    return;
  }

  stopPlayback();
  abortPendingRequest();
  resetPresentation();

  const controller = new AbortController();
  playbackState.fetchController = controller;
  playbackState.status = "loading";
  setStatus("Generating", "loading");
  syncButtons();

  try {
    const res = await fetch(`${API_BASE}/api/simulate/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequestPayload()),
      signal: controller.signal,
    });
    const data = await parseApiResponse(res, "Simulation failed.");

    if (playbackState.fetchController !== controller) {
      return;
    }
    playbackState.fetchController = null;

    const payload = data.data;
    renderSummaryMetrics(payload.summary_metrics);
    renderInsights(payload.insights, resolveCaseContent(activeCase.id));
    beginPlayback(payload);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    playbackState.fetchController = null;
    playbackState.status = "idle";
    setStatus("Error", "error");
    syncButtons();
    window.alert(error.message);
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
    setStatus("Paused", "paused");
    syncButtons();
    return;
  }

  if (playbackState.status === "paused") {
    playbackState.status = "playing";
    playbackState.lastFrameAt = null;
    setStatus("Animating", "playing");
    syncButtons();
    playbackState.frameId = requestAnimationFrame(stepPlayback);
  }
}

function bindEvents() {
  ui.labTab.addEventListener("click", () => setView("lab"));
  ui.backgroundTab.addEventListener("click", () => setView("background"));
  ui.caseSelect.addEventListener("change", () => {
    if (ui.caseSelect.value) {
      selectCase(ui.caseSelect.value);
    }
  });
  ui.simulateButton.addEventListener("click", playFreshSample);
  ui.pauseButton.addEventListener("click", togglePause);
  ui.resetButton.addEventListener("click", () => {
    if (!activeCase) {
      return;
    }
    selectCase(activeCase.id);
  });
}

async function bootstrap() {
  try {
    ui.backgroundContent.innerHTML = buildBackgroundHtml();
    bindEvents();
    await waitForBackendReady();
    await fetchCases();
    if (cases.length > 0) {
      selectCase(cases[0].id);
    }
    queueMathTypeset([ui.backgroundContent]);
  } catch (error) {
    ui.healthBlock.textContent = `Startup error: ${error.message}`;
    setStatus("Startup error", "error");
  }
}

bootstrap();
