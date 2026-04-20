const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { labels: { color: "#cbd5e1" } },
  },
  scales: {
    x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.15)" } },
    y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.15)" } },
  },
};

export function createPathChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        { label: "Sample path N(t)", data: [], borderColor: "#38bdf8", stepped: true, pointRadius: 0 },
        { label: "Expected E[N(t)]=lambda t", data: [], borderColor: "#818cf8", pointRadius: 0, borderDash: [6, 4] },
      ],
    },
    options: {
      ...commonOptions,
      scales: {
        x: {
          type: "linear",
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "t", color: "#94a3b8" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#94a3b8", precision: 0 },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "N(t)", color: "#94a3b8" },
        },
      },
    },
  });
}

export function createHistogramChart(canvas) {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "Empirical", data: [], backgroundColor: "rgba(56,189,248,0.5)", borderColor: "#38bdf8", borderWidth: 1 },
        { type: "line", label: "Theoretical PMF", data: [], borderColor: "#f472b6", pointRadius: 2 },
      ],
    },
    options: commonOptions,
  });
}

export function createArrivalChart(canvas) {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "Empirical density", data: [], backgroundColor: "rgba(129,140,248,0.55)" },
        { type: "line", label: "Exponential density", data: [], borderColor: "#34d399", pointRadius: 0, tension: 0.2 },
      ],
    },
    options: commonOptions,
  });
}

export function updatePathChart(chart, stepPoints, expectedPath) {
  const sortedStep = [...stepPoints].sort((a, b) => a.t - b.t);
  const sortedExpected = [...expectedPath].sort((a, b) => a.t - b.t);
  const xMax = sortedExpected.length > 0 ? sortedExpected[sortedExpected.length - 1].t : 1;
  const yMax = Math.max(
    sortedStep.length > 0 ? sortedStep[sortedStep.length - 1].n : 0,
    sortedExpected.length > 0 ? sortedExpected[sortedExpected.length - 1].expected_n : 0
  );

  chart.data.datasets[0].data = sortedStep.map((p) => ({ x: p.t, y: p.n }));
  chart.data.datasets[1].data = sortedExpected.map((p) => ({ x: p.t, y: p.expected_n }));
  chart.options.scales.x.min = 0;
  chart.options.scales.x.max = xMax;
  chart.options.scales.y.suggestedMax = Math.ceil(yMax + 1);
  chart.update();
}

export function updateHistogramChart(chart, bins) {
  chart.data.labels = bins.map((b) => String(b.k));
  chart.data.datasets[0].data = bins.map((b) => b.empirical_prob);
  chart.data.datasets[1].data = bins.map((b) => b.theoretical_prob);
  chart.update();
}

export function updateArrivalChart(chart, interArrivals, lambda) {
  const maxX = Math.max(...interArrivals, 1 / lambda * 6);
  const bins = 20;
  const binWidth = maxX / bins;
  const counts = new Array(bins).fill(0);

  interArrivals.forEach((x) => {
    const idx = Math.min(Math.floor(x / binWidth), bins - 1);
    counts[idx] += 1;
  });

  const density = counts.map((c) => c / (interArrivals.length * binWidth || 1));
  const xs = Array.from({ length: bins }, (_, i) => (i + 0.5) * binWidth);
  const expDensity = xs.map((x) => lambda * Math.exp(-lambda * x));

  chart.data.labels = xs.map((x) => x.toFixed(3));
  chart.data.datasets[0].data = density;
  chart.data.datasets[1].data = expDensity;
  chart.update();
}
