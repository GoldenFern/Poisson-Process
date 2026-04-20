#include "case_models.hpp"
#include "poisson_simulator.hpp"

#include <cstdio>
#include <ctime>
#include <string>

#include "httplib.h"
#include <nlohmann/json.hpp>

using nlohmann::json;

namespace {
#ifdef _MSC_FULL_VER
constexpr long long kCompilerVersion = _MSC_FULL_VER;
#else
constexpr long long kCompilerVersion = 0;
#endif
}

namespace {
void apply_cors_headers(httplib::Response& res) {
  res.set_header("Access-Control-Allow-Origin", "*");
  res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

void send_json(httplib::Response& res, const json& payload, int status = 200) {
  res.status = status;
  apply_cors_headers(res);
  res.set_content(payload.dump(2), "application/json; charset=utf-8");
}

json to_json_single_path(const SinglePath& path) {
  json points = json::array();
  for (const auto& p : path.step_points) {
    points.push_back({{"t", p.first}, {"n", p.second}});
  }
  json arrivals = json::array();
  for (double t : path.arrival_times) {
    arrivals.push_back(t);
  }
  return {{"arrival_times", arrivals}, {"step_points", points}};
}

json to_json_histogram(const std::vector<HistogramBin>& bins) {
  json out = json::array();
  for (const auto& bin : bins) {
    out.push_back({{"k", bin.k}, {"empirical_prob", bin.empirical_prob}, {"theoretical_prob", bin.theoretical_prob}});
  }
  return out;
}
}  // namespace

int main() {
  httplib::Server server;
  const auto presets = default_case_presets();

  server.Options(R"(.*)", [](const httplib::Request&, httplib::Response& res) { apply_cors_headers(res); });

  server.Get("/api/health", [&](const httplib::Request&, httplib::Response& res) {
    json case_ids = json::array();
    for (const auto& c : presets) {
      case_ids.push_back(c.id);
    }
    send_json(res,
              {{"success", true},
               {"data",
                {{"service", "poisson-process-api"},
                 {"status", "ok"},
                 {"compiler", kCompilerVersion},
                 {"build_timestamp", std::string(__DATE__) + " " + std::string(__TIME__)},
                 {"available_cases", case_ids}}},
               {"error", nullptr}});
  });

  server.Get("/api/cases", [&](const httplib::Request&, httplib::Response& res) {
    json cases = json::array();
    for (const auto& c : presets) {
      cases.push_back({{"id", c.id},
                       {"display_name", c.display_name},
                       {"description", c.description},
                       {"defaults", {{"lambda", c.default_lambda}, {"T", c.default_horizon_t}, {"dt", c.default_dt}}}});
    }
    send_json(res, {{"success", true}, {"data", {{"cases", cases}}}, {"error", nullptr}});
  });

  server.Post("/api/simulate/poisson", [&](const httplib::Request& req, httplib::Response& res) {
    try {
      const json body = json::parse(req.body);
      const SimulationRequest sim_req{
          body.at("lambda").get<double>(),
          body.at("T").get<double>(),
          body.value("dt", 0.01),
          body.value("seed", 2026),
          body.value("trials", 2000),
      };

      const auto sim = run_simulation(sim_req);

      json inter_arrivals = json::array();
      for (double d : sim.inter_arrivals) {
        inter_arrivals.push_back(d);
      }

      json expected = json::array();
      for (const auto& p : sim.expected_path) {
        expected.push_back({{"t", p.first}, {"expected_n", p.second}});
      }

      send_json(res,
                {{"success", true},
                 {"data",
                  {{"parameters",
                    {{"lambda", sim_req.lambda},
                     {"T", sim_req.horizon_t},
                     {"dt", sim_req.dt},
                     {"seed", sim_req.seed},
                     {"trials", sim_req.trials}}},
                   {"single_path", to_json_single_path(sim.single_path)},
                   {"histogram", to_json_histogram(sim.histogram)},
                   {"inter_arrivals", inter_arrivals},
                   {"expected_path", expected},
                   {"summary",
                    {{"empirical_mean_count", sim.empirical_mean_count},
                     {"empirical_variance_count", sim.empirical_variance_count},
                     {"theoretical_mean_count", sim.theoretical_mean_count},
                     {"theoretical_variance_count", sim.theoretical_variance_count}}}}},
                 {"error", nullptr}});
    } catch (const std::exception& ex) {
      send_json(res, {{"success", false}, {"data", nullptr}, {"error", ex.what()}}, 400);
    }
  });

  constexpr int port = 8080;
  std::printf("Poisson API is listening on http://localhost:%d\n", port);
  server.listen("0.0.0.0", port);
  return 0;
}
