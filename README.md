# Poisson Process Laboratory

This project is a local teaching app for exploring the Poisson process family:
- C++ backend (`cpp-httplib`) for simulation APIs.
- HTML/CSS/JS frontend for an interactive process lab plus a mathematical background page.
- `docs/` for API notes and supporting mathematical summaries.

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
- direct backend runs still default to `http://127.0.0.1:8080`
- `scripts/start.ps1` instead chooses project-aware high ports and only falls back if needed

Open frontend:
- directly open `frontend/index.html`, or
- run `python -m http.server 5500` in project root and visit `http://127.0.0.1:5500/frontend/`

One-click startup (recommended):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

Notes:
- `scripts/start.ps1` derives stable high ports from the project path, which avoids the common `8080/5500` collisions across multiple local teaching apps.
- If the derived ports are busy, the script automatically walks to the next nearby free ports.
- You can override the defaults manually with `.\scripts\start.ps1 -ApiPort 8081 -FrontendPort 5501`.

## 4. API overview

- `GET /api/health`
- `GET /api/cases`
- `POST /api/simulate/process`

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
- the homogeneous Poisson process
- non-homogeneous Poisson processes with time-varying intensity
- compound Poisson processes with random jump sizes
- mixed Poisson processes with latent-rate uncertainty
- spatial Poisson processes on planar windows
- a dedicated mathematical background page with rendered formulas
