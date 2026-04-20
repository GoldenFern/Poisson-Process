# Poisson Process Visualizer (Random Process Course)

This project is a local teaching app for visualizing the Poisson process:
- C++ backend (`cpp-httplib`) for simulation APIs.
- HTML/CSS/JS frontend for interactive charts.
- `docs/` for mathematical proofs and case analysis.

## 1. Environment checklist

Required:
- Git >= 2.30
- CMake >= 3.20
- C++17 compiler (MSVC / Clang / GCC)

Recommended on Windows:
- Visual Studio with C++ workload
- Use Developer PowerShell / Developer Command Prompt

Quick checks:

```powershell
git --version
cmake --version
cl
```

If `cl` / `cmake` is not recognized in a normal PowerShell, start from:
- `Developer PowerShell for VS`
or
- `x64 Native Tools Command Prompt for VS`

## 2. Project structure

```text
backend/        C++ API server and simulation core
frontend/       HTML/CSS/JS interactive UI
docs/           math proofs, case studies, API docs
```

## 3. Build and run (Windows + MSVC)

From a VS developer shell:

```powershell
cmake -S backend -B backend/build -G "NMake Makefiles"
cmake --build backend/build
backend/build/poisson_server.exe
```

Server default URL:
- `http://localhost:8080`

Open frontend:
- directly open `frontend/index.html`, or
- run `python -m http.server 5500` in project root and visit `http://localhost:5500/frontend/`

One-click startup (recommended):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

## 4. API overview

- `GET /api/health`
- `GET /api/cases`
- `POST /api/simulate/poisson`

See `docs/api.md` for details.

## 5. Git workflow

Branch model:
- `main`: stable snapshots
- `feature/*`: functional development
- `docs/*`: documentation improvements

Conventional commits:
- `feat:`
- `fix:`
- `docs:`

Milestones:
- `v0.1-env`
- `v0.2-backend-core`
- `v0.3-frontend-core`
- `v1.0-course-demo`

## 6. Learning goals

The app demonstrates:
- independent and stationary increments
- Poisson distribution of counts
- exponential inter-arrival times
- case-driven interpretation in transport, quant, server systems, and physical chemistry
