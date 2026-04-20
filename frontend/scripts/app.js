import {
  createArrivalChart,
  createHistogramChart,
  createPathChart,
  updateArrivalChart,
  updateHistogramChart,
  updatePathChart,
} from "./charts.js";

const API_BASE = "http://localhost:8080";

const ui = {
  caseSelect: document.getElementById("caseSelect"),
  lambdaInput: document.getElementById("lambdaInput"),
  tInput: document.getElementById("tInput"),
  dtInput: document.getElementById("dtInput"),
  trialsInput: document.getElementById("trialsInput"),
  simulateButton: document.getElementById("simulateButton"),
  resetButton: document.getElementById("resetButton"),
  caseDescription: document.getElementById("caseDescription"),
  healthBlock: document.getElementById("healthBlock"),
  empMean: document.getElementById("empMean"),
  theoMean: document.getElementById("theoMean"),
  empVar: document.getElementById("empVar"),
  theoVar: document.getElementById("theoVar"),
};

const charts = {
  path: createPathChart(document.getElementById("pathChart")),
  hist: createHistogramChart(document.getElementById("histChart")),
  arrival: createArrivalChart(document.getElementById("arrivalChart")),
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

function applyCaseDefaults(selected) {
  activeCase = selected;
  ui.lambdaInput.value = selected.defaults.lambda;
  ui.tInput.value = selected.defaults.T;
  ui.dtInput.value = selected.defaults.dt;
  ui.caseDescription.textContent = selected.description;
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

async function runSimulation() {
  ui.simulateButton.disabled = true;
  ui.simulateButton.textContent = "Running...";
  try {
    const res = await fetch(`${API_BASE}/api/simulate/poisson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequestPayload()),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Simulation failed.");
    }

    const payload = data.data;
    updatePathChart(charts.path, payload.single_path.step_points, payload.expected_path);
    updateHistogramChart(charts.hist, payload.histogram);
    updateArrivalChart(charts.arrival, payload.inter_arrivals, payload.parameters.lambda);
    renderSummary(payload.summary);
  } catch (err) {
    window.alert(err.message);
  } finally {
    ui.simulateButton.disabled = false;
    ui.simulateButton.textContent = "Run Simulation";
  }
}

function bindEvents() {
  ui.caseSelect.addEventListener("change", () => {
    const selected = cases.find((c) => c.id === ui.caseSelect.value);
    if (selected) {
      applyCaseDefaults(selected);
      runSimulation();
    }
  });

  ui.resetButton.addEventListener("click", () => {
    if (activeCase) {
      applyCaseDefaults(activeCase);
    }
  });

  ui.simulateButton.addEventListener("click", runSimulation);
}

async function bootstrap() {
  try {
    await fetchHealth();
    await fetchCases();
    bindEvents();
    await runSimulation();
  } catch (err) {
    ui.healthBlock.textContent = `Startup error: ${err.message}`;
  }
}

bootstrap();
