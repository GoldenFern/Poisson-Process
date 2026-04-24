# API Documentation

Base URL:
- direct backend runs: `http://127.0.0.1:8080`
- `scripts/start.ps1`: a project-aware local port chosen at launch time

All responses use the envelope

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

## GET `/api/health`

Returns service metadata and the available process families.

### Example response

```json
{
  "success": true,
  "data": {
    "service": "poisson-process-api",
    "status": "ok",
    "compiler": 195035728,
    "build_timestamp": "Apr 24 2026 10:30:00",
    "available_cases": [
      "homogeneous",
      "nonhomogeneous",
      "compound",
      "mixed",
      "spatial"
    ]
  },
  "error": null
}
```

## GET `/api/cases`

Returns the process families shown in the frontend case selector.

### Example response

```json
{
  "success": true,
  "data": {
    "cases": [
      {
        "id": "homogeneous",
        "family": "homogeneous",
        "display_name": "Homogeneous Poisson Process",
        "description": "Classical counting process with constant intensity and exponential inter-arrival times.",
        "teaser": "The reference model: stationary, independent increments with linear compensator.",
        "uses_dt": true,
        "defaults": {
          "lambda": 12.0,
          "T": 1.0,
          "dt": 0.02
        }
      }
    ]
  },
  "error": null
}
```

## POST `/api/simulate/process`

Runs one of the process-family simulations and returns visualization-ready arrays.

### Request body

```json
{
  "case_id": "mixed",
  "lambda": 8.0,
  "T": 1.0,
  "dt": 0.02,
  "trials": 2000
}
```

### Supported `case_id` values

- `homogeneous`
- `nonhomogeneous`
- `compound`
- `mixed`
- `spatial`

### Parameter constraints

- `lambda > 0`
- `T > 0`
- `1 <= trials <= 20000`
- for time-based cases: `1e-5 <= dt <= T`

### Response fields

- `case_id`, `family`: identify the selected process family.
- `primary_mode`: `step` for temporal jump paths, `scatter` for spatial point patterns.
- `histogram_mode`: either `discrete_pmf` or `continuous_density`.
- `diagnostic_mode`: one of `continuous_density`, `discrete_pmf`, or `line`.
- `parameters`: normalized request parameters.
- `primary_path`: stepped temporal path points for count or aggregate processes.
- `benchmark_path`: reference curve such as `E[N(t)]`, `M(t)`, or `E[S(t)]`.
- `spatial_points`: planar point cloud used by the spatial process case.
- `event_times`, `event_marks`: arrival times and jump sizes for animated playback.
- `histogram`: visualization bins with `x`, `label`, `empirical_prob`, and `theoretical_prob`.
- `diagnostic_samples`, `diagnostic_curve`, `diagnostic_markers`: process-specific diagnostic data.
- `summary_metrics`: metric cards with empirical and theoretical values.
- `insights`: process-specific interpretation bullets.
- `extras`: auxiliary values such as a sampled latent rate or the spatial window side length.

### Error response

```json
{
  "success": false,
  "data": null,
  "error": "Unknown case id: foo"
}
```
