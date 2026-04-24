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
const PROFILE_SAMPLE_COUNT = 160;

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
  spatialDimensionRow: document.getElementById("spatialDimensionRow"),
  spatialDimension: document.getElementById("spatialDimension"),
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
  profileCard: document.getElementById("profileCard"),
  profileTitle: document.getElementById("profileTitle"),
  profileHint: document.getElementById("profileHint"),
  profileMode: document.getElementById("profileMode"),
  profileRangeRow: document.getElementById("profileRangeRow"),
  profileRangeLabel: document.getElementById("profileRangeLabel"),
  profileXMax: document.getElementById("profileXMax"),
  profileFormulaRow: document.getElementById("profileFormulaRow"),
  profileFormula: document.getElementById("profileFormula"),
  profileResetButton: document.getElementById("profileResetButton"),
  profileClearButton: document.getElementById("profileClearButton"),
  profileCanvas: document.getElementById("profileCanvas"),
  profileHelp: document.getElementById("profileHelp"),
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
let profileIsDrawing = false;
let lastDrawIndex = null;
let profileMessage = "";

const profileState = {
  nonhomogeneous: {
    mode: "preset",
    formula: "0.6 + 1.2 * exp(-((t - 0.45*T)/(0.14*T))^2)",
    drawSamples: null,
    xMax: 1,
  },
  compound: {
    mode: "preset",
    formula: "x^1.5 * exp(-x / 1.2)",
    drawSamples: null,
    xMax: 12,
  },
  mixed: {
    mode: "preset",
    formula: "exp(-((x - lambda)^2) / (2 * (0.35 * lambda)^2))",
    drawSamples: null,
    xMax: 24,
  },
  spatial: {
    dimension: 2,
  },
};

function resolveCaseContent(caseId) {
  return CASE_CONTENT[caseId] || CASE_CONTENT.homogeneous;
}

function getProfileConfig(caseId) {
  return profileState[caseId] || null;
}

function supportsCustomProfile(caseId) {
  return Boolean(resolveCaseContent(caseId).supportsCustomProfile);
}

function supportsSpatialDimension(caseId) {
  return Boolean(resolveCaseContent(caseId).supportsSpatialDimension);
}

function gammaDensity(x, shape, scale) {
  if (x < 0 || shape <= 0 || scale <= 0) {
    return 0;
  }
  const gamma = (() => {
    if (shape === 2.5) {
      return 1.329340388179137;
    }
    if (shape === 4) {
      return 6;
    }
    return 1;
  })();
  return (Math.pow(x, shape - 1) * Math.exp(-x / scale)) / (gamma * Math.pow(scale, shape));
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

function buildProfileDomain(caseId) {
  const content = resolveCaseContent(caseId);
  const config = getProfileConfig(caseId);

  if (caseId === "nonhomogeneous") {
    const horizon = Math.max(Number(ui.horizonInput.value) || activeCase?.defaults?.T || 1, 0.01);
    return {
      xMin: 0,
      xMax: horizon,
      xLabel: content.profileXLabel,
      yLabel: content.profileYLabel,
      yMax: content.drawYMax || 2.5,
    };
  }

  const fallbackXMax = content.defaultProfileXMax || 10;
  const configuredXMax = Number(config?.xMax) || fallbackXMax;
  return {
    xMin: 0,
    xMax: Math.max(configuredXMax, 0.1),
    xLabel: content.profileXLabel,
    yLabel: content.profileYLabel,
    yMax: content.drawYMax || 1,
  };
}

function getPresetProfilePoints(caseId) {
  const domain = buildProfileDomain(caseId);
  const lambda = Math.max(Number(ui.lambdaInput.value) || activeCase?.defaults?.lambda || 1, 0.01);
  const sampleCount = PROFILE_SAMPLE_COUNT;

  if (caseId === "nonhomogeneous") {
    return Array.from({ length: sampleCount }, (_, index) => {
      const x = domain.xMin + (domain.xMax - domain.xMin) * index / (sampleCount - 1);
      const u = domain.xMax > 0 ? x / domain.xMax : 0;
      let y = 0.7;
      if (u < 0.25) {
        y = 0.5;
      } else if (u < 0.5) {
        y = 1.6;
      } else if (u < 0.75) {
        y = 1.2;
      }
      return { x, y };
    });
  }

  if (caseId === "compound") {
    return Array.from({ length: sampleCount }, (_, index) => {
      const x = domain.xMin + (domain.xMax - domain.xMin) * index / (sampleCount - 1);
      return { x, y: gammaDensity(x, 2.5, 1.2) };
    });
  }

  if (caseId === "mixed") {
    return Array.from({ length: sampleCount }, (_, index) => {
      const x = domain.xMin + (domain.xMax - domain.xMin) * index / (sampleCount - 1);
      return { x, y: gammaDensity(x, 4, lambda / 4) };
    });
  }

  return [];
}

function compileProfileFormula(caseId, expression) {
  const source = (expression || "").trim().replace(/\^/g, "**");
  if (!source) {
    return null;
  }

  const compiled = new Function(
    "u",
    "t",
    "x",
    "T",
    "lambda",
    `
      "use strict";
      const { abs, acos, asin, atan, ceil, cos, exp, floor, log, max, min, pow, sin, sqrt, tan } = Math;
      const pi = Math.PI;
      return (${source});
    `
  );

  return (vars) => {
    const value = compiled(vars.u, vars.t, vars.x, vars.T, vars.lambda);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, value);
  };
}

function sampleFormulaProfile(caseId, expression) {
  const domain = buildProfileDomain(caseId);
  const lambda = Math.max(Number(ui.lambdaInput.value) || activeCase?.defaults?.lambda || 1, 0.01);
  const evaluator = compileProfileFormula(caseId, expression);
  if (!evaluator) {
    return getPresetProfilePoints(caseId);
  }

  const sampleCount = PROFILE_SAMPLE_COUNT;
  return Array.from({ length: sampleCount }, (_, index) => {
    const x = domain.xMin + (domain.xMax - domain.xMin) * index / (sampleCount - 1);
    const t = x;
    const u = domain.xMax > 0 ? x / domain.xMax : 0;
    return {
      x,
      y: evaluator({ x, t, u, T: domain.xMax, lambda }),
    };
  });
}

function pointsToDrawSamples(points, caseId) {
  const domain = buildProfileDomain(caseId);
  const samples = new Array(PROFILE_SAMPLE_COUNT).fill(0);
  const safeMaxX = Math.max(domain.xMax - domain.xMin, 1e-9);

  for (let index = 0; index < PROFILE_SAMPLE_COUNT; index += 1) {
    const x = domain.xMin + safeMaxX * index / (PROFILE_SAMPLE_COUNT - 1);
    let y = 0;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const left = points[pointIndex - 1];
      const right = points[pointIndex];
      if (x <= right.x) {
        const span = Math.max(right.x - left.x, 1e-9);
        const weight = (x - left.x) / span;
        y = left.y + (right.y - left.y) * weight;
        break;
      }
      y = right.y;
    }
    samples[index] = Math.max(0, y);
  }

  return samples;
}

function drawSamplesToPoints(caseId) {
  const config = getProfileConfig(caseId);
  const domain = buildProfileDomain(caseId);
  const samples = config?.drawSamples;
  if (!samples || samples.length === 0) {
    return getPresetProfilePoints(caseId);
  }

  return samples.map((sample, index) => ({
    x: domain.xMin + (domain.xMax - domain.xMin) * index / (samples.length - 1),
    y: Math.max(0, sample),
  }));
}

function getActiveProfilePoints(caseId) {
  const config = getProfileConfig(caseId);
  if (!config || !supportsCustomProfile(caseId)) {
    return [];
  }

  try {
    if (config.mode === "formula") {
      profileMessage = "";
      return sampleFormulaProfile(caseId, config.formula);
    }
    if (config.mode === "draw") {
      profileMessage = "Drag on the canvas to sketch the profile. For density cases, the backend normalizes the area automatically.";
      return drawSamplesToPoints(caseId);
    }
    profileMessage = "";
    return getPresetProfilePoints(caseId);
  } catch (error) {
    profileMessage = `Formula error: ${error.message}`;
    return getPresetProfilePoints(caseId);
  }
}

function getRequestCustomProfile() {
  if (!activeCase || !supportsCustomProfile(activeCase.id)) {
    return [];
  }

  const config = getProfileConfig(activeCase.id);
  if (!config || config.mode === "preset") {
    return [];
  }

  return getActiveProfilePoints(activeCase.id).map((point) => ({ x: point.x, y: point.y }));
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

function getProfileCanvasContext() {
  const canvas = ui.profileCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(Math.floor(rect.width), 320);
  const height = Math.max(Math.floor(rect.height), 220);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function renderProfileCanvas() {
  if (!activeCase || !supportsCustomProfile(activeCase.id) || ui.profileCard.hidden) {
    return;
  }

  const content = resolveCaseContent(activeCase.id);
  const domain = buildProfileDomain(activeCase.id);
  const points = getActiveProfilePoints(activeCase.id);
  const { ctx, width, height } = getProfileCanvasContext();
  const padding = { left: 46, right: 18, top: 16, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const previewYMax = Math.max(domain.yMax, ...points.map((point) => point.y), 0.1) * 1.05;

  const mapX = (x) => padding.left + ((x - domain.xMin) / Math.max(domain.xMax - domain.xMin, 1e-9)) * plotWidth;
  const mapY = (y) => padding.top + (1 - y / previewYMax) * plotHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f9fbf9";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(19, 34, 56, 0.12)";
  ctx.lineWidth = 1;
  for (let gridIndex = 0; gridIndex <= 4; gridIndex += 1) {
    const y = padding.top + (plotHeight * gridIndex) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(19, 34, 56, 0.18)";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  if (points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(mapX(points[0].x), mapY(points[0].y));
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(mapX(points[index].x), mapY(points[index].y));
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = activeCase.id === "nonhomogeneous" ? "#0f766e" : activeCase.id === "compound" ? "#c2410c" : "#1d4ed8";
    ctx.stroke();
  }

  ctx.fillStyle = "#5b6b7e";
  ctx.font = "12px Trebuchet MS";
  ctx.fillText(domain.xLabel || "x", width - padding.right - 28, height - 10);
  ctx.save();
  ctx.translate(16, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(domain.yLabel || "y", 0, 0);
  ctx.restore();

  if (content.profileFormulaHelp || profileMessage) {
    ui.profileHelp.textContent = profileMessage || content.profileFormulaHelp;
  } else {
    ui.profileHelp.textContent = "";
  }
}

function updateProfileSampleAt(canvasX, canvasY) {
  if (!activeCase || !supportsCustomProfile(activeCase.id)) {
    return;
  }

  const config = getProfileConfig(activeCase.id);
  const domain = buildProfileDomain(activeCase.id);
  if (!config.drawSamples || config.drawSamples.length !== PROFILE_SAMPLE_COUNT) {
    config.drawSamples = pointsToDrawSamples(getPresetProfilePoints(activeCase.id), activeCase.id);
  }

  const rect = ui.profileCanvas.getBoundingClientRect();
  const padding = { left: 46, right: 18, top: 16, bottom: 34 };
  const plotWidth = rect.width - padding.left - padding.right;
  const plotHeight = rect.height - padding.top - padding.bottom;
  const normalizedX = Math.min(Math.max((canvasX - padding.left) / Math.max(plotWidth, 1), 0), 1);
  const normalizedY = Math.min(Math.max((canvasY - padding.top) / Math.max(plotHeight, 1), 0), 1);
  const sampleIndex = Math.round(normalizedX * (PROFILE_SAMPLE_COUNT - 1));
  const value = (1 - normalizedY) * domain.yMax;

  if (lastDrawIndex === null) {
    config.drawSamples[sampleIndex] = value;
    lastDrawIndex = sampleIndex;
    renderProfileCanvas();
    return;
  }

  const start = Math.min(lastDrawIndex, sampleIndex);
  const end = Math.max(lastDrawIndex, sampleIndex);
  for (let index = start; index <= end; index += 1) {
    const weight = end === start ? 0 : (index - start) / (end - start);
    const startValue = config.drawSamples[lastDrawIndex];
    config.drawSamples[index] = startValue + (value - startValue) * weight;
  }
  lastDrawIndex = sampleIndex;
  renderProfileCanvas();
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
  if (casePreset.id === "spatial" && (getProfileConfig(casePreset.id)?.dimension || 2) === 3) {
    ui.horizonLabel.textContent = "Window volume V";
  } else {
    ui.horizonLabel.textContent = content.horizonLabel;
  }
  ui.dtLabel.textContent = content.dtLabel;
  ui.dtRow.hidden = !casePreset.uses_dt;
  ui.spatialDimensionRow.hidden = !supportsSpatialDimension(casePreset.id);
  if (supportsSpatialDimension(casePreset.id)) {
    ui.spatialDimension.value = String(getProfileConfig(casePreset.id)?.dimension || 2);
  }
}

function syncProfileControls() {
  if (!activeCase) {
    ui.profileCard.hidden = true;
    return;
  }

  const content = resolveCaseContent(activeCase.id);
  const config = getProfileConfig(activeCase.id);
  const showProfile = supportsCustomProfile(activeCase.id);
  ui.profileCard.hidden = !showProfile;
  if (!showProfile || !config) {
    return;
  }

  ui.profileTitle.textContent = content.profileTitle || "Profile Editor";
  ui.profileHint.textContent = content.profileHint || "";
  ui.profileMode.value = config.mode;
  ui.profileFormula.value = config.formula || "";
  ui.profileFormula.placeholder = content.profileFormulaPlaceholder || "";
  ui.profileFormulaRow.hidden = config.mode !== "formula";
  ui.profileRangeRow.hidden = !(activeCase.id === "compound" || activeCase.id === "mixed");
  ui.profileRangeLabel.textContent = content.profileRangeLabel || "Profile x max";
  if (!Number.isFinite(config.xMax) || config.xMax <= 0) {
    config.xMax = content.defaultProfileXMax || 10;
  }
  ui.profileXMax.value = String(config.xMax);
  ui.profileClearButton.disabled = config.mode !== "draw";
  renderProfileCanvas();
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
  syncProfileControls();
  resetPresentation();

  if (shouldSimulate) {
    playFreshSample();
  }
}

function getRequestPayload() {
  const customProfile = getRequestCustomProfile();
  return {
    case_id: activeCase.id,
    lambda: Number(ui.lambdaInput.value),
    T: Number(ui.horizonInput.value),
    dt: Number(ui.dtInput.value),
    trials: Number(ui.trialsInput.value),
    custom_profile: customProfile,
    spatial_dimension: supportsSpatialDimension(activeCase.id)
      ? Number(ui.spatialDimension.value || getProfileConfig(activeCase.id)?.dimension || 2)
      : 2,
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

function resetActiveProfile() {
  if (!activeCase || !supportsCustomProfile(activeCase.id)) {
    return;
  }
  const content = resolveCaseContent(activeCase.id);
  const config = getProfileConfig(activeCase.id);
  config.mode = "preset";
  config.formula = content.profileFormulaPlaceholder || "";
  config.drawSamples = null;
  config.xMax = content.defaultProfileXMax || config.xMax || 10;
  profileMessage = "";
  syncProfileControls();
}

function clearActiveDrawing() {
  if (!activeCase || !supportsCustomProfile(activeCase.id)) {
    return;
  }
  const config = getProfileConfig(activeCase.id);
  config.drawSamples = new Array(PROFILE_SAMPLE_COUNT).fill(0);
  profileMessage = "Drawing cleared. Drag on the canvas to define a new curve.";
  renderProfileCanvas();
}

function updateActiveProfileFromCanvasEvent(event) {
  const rect = ui.profileCanvas.getBoundingClientRect();
  updateProfileSampleAt(event.clientX - rect.left, event.clientY - rect.top);
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
  const dimension = Number(payload.extras?.spatial_dimension || payload.parameters.spatial_dimension || 2);
  const sideLength = Number(payload.extras?.window_side || (dimension === 3 ? Math.cbrt(payload.parameters.T) : Math.sqrt(payload.parameters.T)));

  playbackState.status = "playing";
  playbackState.playheadMs = 0;
  playbackState.lastFrameAt = null;
  playbackState.chartLastPaintAt = 0;
  playbackState.revealedPoints = 0;
  playbackState.durationMs = Number(ui.playbackSpeed.value) || 9000;

  renderSpatialPrimary(charts.primary, [], sideLength, {
    sampleLabel: content.sampleLabel,
    dimension,
  });
  updateReadouts(
    `revealed 0 / ${payload.spatial_points.length}`,
    `${dimension}D · lambda = ${formatNumber(payload.parameters.lambda)}`
  );
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
    const dimension = Number(payload.extras?.spatial_dimension || payload.parameters.spatial_dimension || 2);
    const sideLength = Number(payload.extras?.window_side || (dimension === 3 ? Math.cbrt(payload.parameters.T) : Math.sqrt(payload.parameters.T)));
    renderSpatialPrimary(charts.primary, payload.spatial_points, sideLength, {
      sampleLabel: content.sampleLabel,
      dimension,
    });
    updateReadouts(
      `revealed ${payload.spatial_points.length} / ${payload.spatial_points.length}`,
      `${payload.spatial_points.length} ${content.valueLabel} in ${dimension}D`
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
    const dimension = Number(payload.extras?.spatial_dimension || payload.parameters.spatial_dimension || 2);
    const sideLength = Number(payload.extras?.window_side || (dimension === 3 ? Math.cbrt(payload.parameters.T) : Math.sqrt(payload.parameters.T)));
    if (revealCount !== playbackState.revealedPoints || now - playbackState.chartLastPaintAt >= 40) {
      renderSpatialPrimary(charts.primary, payload.spatial_points.slice(0, revealCount), sideLength, {
        sampleLabel: content.sampleLabel,
        dimension,
      });
      playbackState.revealedPoints = revealCount;
      playbackState.chartLastPaintAt = now;
    }
    updateReadouts(
      `revealed ${revealCount} / ${payload.spatial_points.length}`,
      `${dimension}D · lambda = ${formatNumber(payload.parameters.lambda)}`
    );
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

  const requestPayload = getRequestPayload();
  if (profileMessage.startsWith("Formula error")) {
    window.alert(profileMessage);
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
      body: JSON.stringify(requestPayload),
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
  ui.profileMode.addEventListener("change", () => {
    if (!activeCase || !supportsCustomProfile(activeCase.id)) {
      return;
    }
    const config = getProfileConfig(activeCase.id);
    config.mode = ui.profileMode.value;
    profileMessage = "";
    syncProfileControls();
  });
  ui.profileFormula.addEventListener("input", () => {
    if (!activeCase || !supportsCustomProfile(activeCase.id)) {
      return;
    }
    getProfileConfig(activeCase.id).formula = ui.profileFormula.value;
    renderProfileCanvas();
  });
  ui.profileXMax.addEventListener("input", () => {
    if (!activeCase || !supportsCustomProfile(activeCase.id)) {
      return;
    }
    const nextValue = Number(ui.profileXMax.value);
    if (Number.isFinite(nextValue) && nextValue > 0) {
      getProfileConfig(activeCase.id).xMax = nextValue;
      renderProfileCanvas();
    }
  });
  ui.profileResetButton.addEventListener("click", resetActiveProfile);
  ui.profileClearButton.addEventListener("click", clearActiveDrawing);
  ui.spatialDimension.addEventListener("change", () => {
    const config = getProfileConfig("spatial");
    if (config) {
      config.dimension = Number(ui.spatialDimension.value || 2);
    }
    if (activeCase) {
      updateControlLabels(activeCase);
    }
  });
  ui.lambdaInput.addEventListener("input", () => {
    if (activeCase && (supportsCustomProfile(activeCase.id) || activeCase.id === "mixed")) {
      renderProfileCanvas();
    }
  });
  ui.horizonInput.addEventListener("input", () => {
    if (activeCase && supportsCustomProfile(activeCase.id)) {
      renderProfileCanvas();
    }
  });
  ui.simulateButton.addEventListener("click", playFreshSample);
  ui.pauseButton.addEventListener("click", togglePause);
  ui.resetButton.addEventListener("click", () => {
    if (!activeCase) {
      return;
    }
    if (supportsCustomProfile(activeCase.id)) {
      resetActiveProfile();
    }
    selectCase(activeCase.id);
  });
  ui.profileCanvas.addEventListener("pointerdown", (event) => {
    if (!activeCase || !supportsCustomProfile(activeCase.id)) {
      return;
    }
    if (getProfileConfig(activeCase.id)?.mode !== "draw") {
      return;
    }
    profileIsDrawing = true;
    lastDrawIndex = null;
    ui.profileCanvas.setPointerCapture?.(event.pointerId);
    updateActiveProfileFromCanvasEvent(event);
  });
  ui.profileCanvas.addEventListener("pointermove", (event) => {
    if (!profileIsDrawing) {
      return;
    }
    updateActiveProfileFromCanvasEvent(event);
  });
  const stopDrawing = () => {
    profileIsDrawing = false;
    lastDrawIndex = null;
  };
  ui.profileCanvas.addEventListener("pointerup", stopDrawing);
  ui.profileCanvas.addEventListener("pointerleave", stopDrawing);
  window.addEventListener("resize", () => {
    if (activeCase && supportsCustomProfile(activeCase.id)) {
      renderProfileCanvas();
    }
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
