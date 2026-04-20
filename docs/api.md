# API Documentation

Base URL: `http://localhost:8080`

All responses use:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

---

## GET `/api/health`

Service health and metadata.

### Example response

```json
{
  "success": true,
  "data": {
    "service": "poisson-process-api",
    "status": "ok",
    "compiler": 195035728,
    "build_timestamp": "Apr 20 2026 10:00:00",
    "available_cases": ["transport", "quant", "server", "physchem"]
  },
  "error": null
}
```

---

## GET `/api/cases`

Returns case presets for the frontend selector.

### Example response

```json
{
  "success": true,
  "data": {
    "cases": [
      {
        "id": "transport",
        "display_name": "Urban Traffic Arrivals",
        "description": "Model vehicles reaching an intersection per minute.",
        "defaults": { "lambda": 18.0, "T": 0.3333, "dt": 0.002 }
      }
    ]
  },
  "error": null
}
```

---

## POST `/api/simulate/poisson`

Runs Poisson process simulation and returns visualization-ready arrays.

### Request body

```json
{
  "lambda": 18.0,
  "T": 0.3333,
  "dt": 0.002,
  "seed": 2026,
  "trials": 2000
}
```

### Parameter constraints

- `lambda > 0`
- `T > 0`
- `1e-5 <= dt <= T`
- `1 <= trials <= 20000`

### Response fields (high level)

- `parameters`: normalized input params.
- `single_path`:
  - `arrival_times`: event timestamps.
  - `step_points`: points for stepped `N(t)` plotting.
- `histogram`: list of `{k, empirical_prob, theoretical_prob}`.
- `inter_arrivals`: waiting times from one path.
- `expected_path`: points for `E[N(t)]=lambda*t`.
- `summary`: empirical/theoretical mean and variance.

### Error response

When validation fails:

```json
{
  "success": false,
  "data": null,
  "error": "lambda must be positive."
}
```
