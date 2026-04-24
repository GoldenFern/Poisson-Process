const palette = {
  sample: "#0f766e",
  benchmark: "#ea580c",
  empiricalFill: "rgba(15, 118, 110, 0.26)",
  empiricalStroke: "#0f766e",
  theoretical: "#c2410c",
  accent: "#0f172a",
  grid: "rgba(15, 23, 42, 0.12)",
  text: "#334155",
  point: "#1d4ed8",
  marker: "#be123c",
};

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: palette.text,
          boxWidth: 14,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            const raw = context.raw;
            if (raw && typeof raw === "object" && "x" in raw && "y" in raw) {
              return `${context.dataset.label}: (${raw.x.toFixed(3)}, ${raw.y.toFixed(3)})`;
            }
            if (typeof context.parsed?.y === "number") {
              return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
            }
            return `${context.dataset.label}: ${context.formattedValue}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: palette.text },
        grid: { color: palette.grid },
      },
      y: {
        ticks: { color: palette.text },
        grid: { color: palette.grid },
      },
    },
  };
}

function maxY(points) {
  if (!points || points.length === 0) {
    return 1;
  }
  return points.reduce((acc, point) => Math.max(acc, point.y), 0);
}

function interpolateCurve(curve, x) {
  if (!curve || curve.length === 0) {
    return null;
  }
  if (x <= curve[0].x) {
    return curve[0].y;
  }
  for (let index = 1; index < curve.length; index += 1) {
    const left = curve[index - 1];
    const right = curve[index];
    if (x <= right.x) {
      const span = right.x - left.x;
      if (span <= 1e-12) {
        return right.y;
      }
      const weight = (x - left.x) / span;
      return left.y + weight * (right.y - left.y);
    }
  }
  return curve[curve.length - 1].y;
}

function buildContinuousHistogram(samples, binCount = 18) {
  if (!samples || samples.length === 0) {
    return [];
  }

  const minValue = Math.min(0, ...samples);
  const maxValue = Math.max(...samples);
  const span = Math.max(maxValue - minValue, 1);
  const binWidth = span / binCount;
  const counts = new Array(binCount).fill(0);

  for (const sample of samples) {
    const rawIndex = Math.floor((sample - minValue) / binWidth);
    const index = Math.max(0, Math.min(binCount - 1, rawIndex));
    counts[index] += 1;
  }

  return counts.map((count, index) => {
    const center = minValue + (index + 0.5) * binWidth;
    return {
      x: center,
      label: center < 10 ? center.toFixed(2) : center.toFixed(1),
      empirical: count / (samples.length * binWidth),
    };
  });
}

function buildDiscreteHistogram(samples) {
  if (!samples || samples.length === 0) {
    return [];
  }

  const counts = new Map();
  for (const sample of samples) {
    const key = Math.round(sample);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const maxKey = Math.max(...counts.keys());
  const histogram = [];
  for (let key = 0; key <= maxKey; key += 1) {
    histogram.push({
      x: key,
      label: String(key),
      empirical: (counts.get(key) || 0) / samples.length,
    });
  }
  return histogram;
}

export function createPrimaryChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { datasets: [] },
    options: baseOptions(),
  });
}

export function createDistributionChart(canvas) {
  return new Chart(canvas, {
    type: "bar",
    data: { labels: [], datasets: [] },
    options: baseOptions(),
  });
}

export function createDiagnosticChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: baseOptions(),
  });
}

export function renderTemporalPrimary(chart, samplePoints, benchmarkPoints, config) {
  chart.config.type = "line";
  chart.data.datasets = [
    {
      type: "line",
      label: config.sampleLabel,
      data: samplePoints,
      borderColor: palette.sample,
      backgroundColor: "rgba(15, 118, 110, 0.08)",
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      stepped: true,
    },
    {
      type: "line",
      label: config.benchmarkLabel,
      data: benchmarkPoints,
      borderColor: palette.benchmark,
      borderDash: [8, 5],
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
    },
  ];

  const benchmarkMax = maxY(benchmarkPoints);
  const sampleMax = maxY(samplePoints);
  chart.options = {
    ...baseOptions(),
    scales: {
      x: {
        type: "linear",
        min: 0,
        max: config.horizon,
        ticks: { color: palette.text },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: config.xLabel || "t",
          color: palette.text,
        },
      },
      y: {
        min: 0,
        suggestedMax: Math.ceil(Math.max(benchmarkMax, sampleMax) + 1),
        ticks: { color: palette.text },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: config.yLabel,
          color: palette.text,
        },
      },
    },
  };
  chart.update("none");
}

export function renderSpatialPrimary(chart, points, sideLength, config) {
  chart.config.type = "scatter";
  chart.data.datasets = [
    {
      type: "scatter",
      label: config.sampleLabel,
      data: points,
      backgroundColor: "rgba(29, 78, 216, 0.85)",
      borderColor: "#eff6ff",
      borderWidth: 0.75,
      pointRadius: 4.2,
      pointHoverRadius: 5.2,
    },
  ];

  chart.options = {
    ...baseOptions(),
    scales: {
      x: {
        type: "linear",
        min: 0,
        max: sideLength,
        ticks: {
          color: palette.text,
          stepSize: sideLength / 4,
        },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: "x",
          color: palette.text,
        },
      },
      y: {
        type: "linear",
        min: 0,
        max: sideLength,
        ticks: {
          color: palette.text,
          stepSize: sideLength / 4,
        },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: "y",
          color: palette.text,
        },
      },
    },
  };
  chart.update("none");
}

export function renderDistributionChart(chart, histogram, config) {
  const hasTheoretical = histogram.some((bin) => bin.theoretical_prob >= 0);
  chart.config.type = "bar";
  chart.data.labels = histogram.map((bin) => bin.label);
  chart.data.datasets = [
    {
      type: "bar",
      label: config.empiricalLabel || "Empirical",
      data: histogram.map((bin) => bin.empirical_prob),
      backgroundColor: palette.empiricalFill,
      borderColor: palette.empiricalStroke,
      borderWidth: 1.2,
    },
  ];

  if (hasTheoretical) {
    chart.data.datasets.push({
      type: "line",
      label: config.theoreticalLabel || "Reference law",
      data: histogram.map((bin) => bin.theoretical_prob),
      borderColor: palette.theoretical,
      borderWidth: 2,
      pointRadius: 2.2,
      pointHoverRadius: 2.8,
      tension: 0.18,
    });
  }

  chart.options = {
    ...baseOptions(),
    scales: {
      x: {
        ticks: { color: palette.text },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: config.xLabel,
          color: palette.text,
        },
      },
      y: {
        beginAtZero: true,
        ticks: { color: palette.text },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: config.yLabel,
          color: palette.text,
        },
      },
    },
  };
  chart.update("none");
}

export function renderDiagnosticChart(chart, payload, config) {
  const mode = payload.mode || "line";

  if (mode === "continuous_density") {
    const bins = buildContinuousHistogram(payload.samples || []);
    chart.config.type = "bar";
    chart.data.labels = bins.map((bin) => bin.label);
    chart.data.datasets = [
      {
        type: "bar",
        label: config.empiricalLabel || "Empirical density",
        data: bins.map((bin) => bin.empirical),
        backgroundColor: "rgba(30, 64, 175, 0.22)",
        borderColor: "#1d4ed8",
        borderWidth: 1,
      },
    ];

    if (payload.curve && payload.curve.length > 0) {
      chart.data.datasets.push({
        type: "line",
        label: config.theoreticalLabel || "Reference density",
        data: bins.map((bin) => interpolateCurve(payload.curve, bin.x)),
        borderColor: palette.theoretical,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.18,
      });
    }

    chart.options = {
      ...baseOptions(),
      scales: {
        x: {
          ticks: { color: palette.text },
          grid: { color: palette.grid },
          title: {
            display: true,
            text: config.xLabel,
            color: palette.text,
          },
        },
        y: {
          beginAtZero: true,
          ticks: { color: palette.text },
          grid: { color: palette.grid },
          title: {
            display: true,
            text: config.yLabel,
            color: palette.text,
          },
        },
      },
    };
    chart.update("none");
    return;
  }

  if (mode === "discrete_pmf") {
    const bins = buildDiscreteHistogram(payload.samples || []);
    const curveLookup = new Map((payload.curve || []).map((point) => [Math.round(point.x), point.y]));
    chart.config.type = "bar";
    chart.data.labels = bins.map((bin) => bin.label);
    chart.data.datasets = [
      {
        type: "bar",
        label: config.empiricalLabel || "Empirical probabilities",
        data: bins.map((bin) => bin.empirical),
        backgroundColor: "rgba(20, 83, 45, 0.22)",
        borderColor: "#166534",
        borderWidth: 1,
      },
    ];
    if (curveLookup.size > 0) {
      chart.data.datasets.push({
        type: "line",
        label: config.theoreticalLabel || "Reference PMF",
        data: bins.map((bin) => curveLookup.get(Number(bin.label)) || 0),
        borderColor: palette.theoretical,
        borderWidth: 2,
        pointRadius: 2.2,
        tension: 0.12,
      });
    }
    chart.options = {
      ...baseOptions(),
      scales: {
        x: {
          ticks: { color: palette.text },
          grid: { color: palette.grid },
          title: {
            display: true,
            text: config.xLabel,
            color: palette.text,
          },
        },
        y: {
          beginAtZero: true,
          ticks: { color: palette.text },
          grid: { color: palette.grid },
          title: {
            display: true,
            text: config.yLabel,
            color: palette.text,
          },
        },
      },
    };
    chart.update("none");
    return;
  }

  const lineDatasets = [];
  if (payload.curve && payload.curve.length > 0) {
    lineDatasets.push({
      type: "line",
      label: config.curveLabel || "Reference curve",
      data: payload.curve,
      borderColor: palette.point,
      borderWidth: 2.2,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0.15,
    });
  }
  if (payload.markers && payload.markers.length > 0) {
    lineDatasets.push({
      type: "line",
      label: config.markerLabel || "Sampled path parameter",
      data: payload.markers,
      borderColor: palette.marker,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
      showLine: true,
    });
  }

  chart.config.type = "line";
  chart.data.labels = [];
  chart.data.datasets = lineDatasets;
  chart.options = {
    ...baseOptions(),
    scales: {
      x: {
        type: "linear",
        ticks: { color: palette.text },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: config.xLabel,
          color: palette.text,
        },
      },
      y: {
        beginAtZero: true,
        ticks: { color: palette.text },
        grid: { color: palette.grid },
        title: {
          display: true,
          text: config.yLabel,
          color: palette.text,
        },
      },
    },
  };
  chart.update("none");
}
