#include "case_models.hpp"
#include "poisson_simulator.hpp"

#include <cstdlib>
#include <cstdio>
#include <ctime>
#include <exception>
#include <map>
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

constexpr int kDefaultPort = 8080;
constexpr int kMinPort = 1;
constexpr int kMaxPort = 65535;
}

namespace {
std::string read_env_var(const char* name) {
#ifdef _MSC_VER
  char* raw_value = nullptr;
  size_t raw_size = 0;
  if (_dupenv_s(&raw_value, &raw_size, name) != 0 || raw_value == nullptr) {
    return "";
  }

  std::string value(raw_value);
  std::free(raw_value);
  return value;
#else
  const char* raw_value = std::getenv(name);
  return raw_value ? raw_value : "";
#endif
}

int resolve_api_port() {
  const std::string raw_port = read_env_var("POISSON_API_PORT");
  if (raw_port.empty()) {
    return kDefaultPort;
  }

  char* end = nullptr;
  const long parsed = std::strtol(raw_port.c_str(), &end, 10);
  if (end == raw_port.c_str() || *end != '\0' || parsed < kMinPort || parsed > kMaxPort) {
    throw std::invalid_argument("POISSON_API_PORT must be an integer in [1, 65535].");
  }

  return static_cast<int>(parsed);
}

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

json to_json_points(const std::vector<PlotPoint>& points) {
  json out = json::array();
  for (const auto& point : points) {
    out.push_back({{"x", point.x}, {"y", point.y}});
  }
  return out;
}

json to_json_values(const std::vector<double>& values) {
  json out = json::array();
  for (double value : values) {
    out.push_back(value);
  }
  return out;
}

json to_json_histogram(const std::vector<HistogramBin>& bins) {
  json out = json::array();
  for (const auto& bin : bins) {
    out.push_back({{"x", bin.x},
                   {"label", bin.label},
                   {"empirical_prob", bin.empirical_prob},
                   {"theoretical_prob", bin.theoretical_prob}});
  }
  return out;
}

json to_json_summary_metrics(const std::vector<SummaryMetric>& metrics) {
  json out = json::array();
  for (const auto& metric : metrics) {
    out.push_back({{"label", metric.label},
                   {"empirical_value", metric.empirical_value},
                   {"theoretical_value", metric.theoretical_value}});
  }
  return out;
}

json to_json_extras(const std::map<std::string, double>& extras) {
  json out = json::object();
  for (const auto& [key, value] : extras) {
    out[key] = value;
  }
  return out;
}

SimulationRequest parse_simulation_request(const json& body) {
  return {
      body.at("case_id").get<std::string>(),
      body.at("lambda").get<double>(),
      body.at("T").get<double>(),
      body.value("dt", 0.01),
      body.value("trials", 2000),
  };
}

json to_json_simulation_result(const SimulationRequest& sim_req, const SimulationResult& sim) {
  return {
      {"case_id", sim.case_id},
      {"family", sim.family},
      {"primary_mode", sim.primary_mode},
      {"histogram_mode", sim.histogram_mode},
      {"diagnostic_mode", sim.diagnostic_mode},
      {"parameters",
       {{"lambda", sim_req.lambda}, {"T", sim_req.horizon_t}, {"dt", sim_req.dt}, {"trials", sim_req.trials}}},
      {"primary_path", to_json_points(sim.primary_path)},
      {"benchmark_path", to_json_points(sim.benchmark_path)},
      {"spatial_points", to_json_points(sim.spatial_points)},
      {"event_times", to_json_values(sim.event_times)},
      {"event_marks", to_json_values(sim.event_marks)},
      {"histogram", to_json_histogram(sim.histogram)},
      {"diagnostic_samples", to_json_values(sim.diagnostic_samples)},
      {"diagnostic_curve", to_json_points(sim.diagnostic_curve)},
      {"diagnostic_markers", to_json_points(sim.diagnostic_markers)},
      {"summary_metrics", to_json_summary_metrics(sim.summary_metrics)},
      {"insights", sim.insights},
      {"extras", to_json_extras(sim.extras)},
  };
}

void handle_simulation_request(const httplib::Request& req, httplib::Response& res) {
  const json body = json::parse(req.body);
  const SimulationRequest sim_req = parse_simulation_request(body);
  const SimulationResult sim = run_simulation(sim_req);
  send_json(res, {{"success", true}, {"data", to_json_simulation_result(sim_req, sim)}, {"error", nullptr}});
}
}  // namespace

int main() {
  try {
    httplib::Server server;
    const auto presets = default_case_presets();
    const int port = resolve_api_port();
    const std::string listen_host = "127.0.0.1";

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
                         {"family", c.family},
                         {"display_name", c.display_name},
                         {"description", c.description},
                         {"teaser", c.teaser},
                         {"uses_dt", c.uses_dt},
                         {"defaults", {{"lambda", c.default_lambda}, {"T", c.default_horizon_t}, {"dt", c.default_dt}}}});
      }
      send_json(res, {{"success", true}, {"data", {{"cases", cases}}}, {"error", nullptr}});
    });

    server.Post("/api/simulate/process", [&](const httplib::Request& req, httplib::Response& res) {
      try {
        handle_simulation_request(req, res);
      } catch (const std::exception& ex) {
        send_json(res, {{"success", false}, {"data", nullptr}, {"error", ex.what()}}, 400);
      }
    });

    server.Post("/api/simulate/poisson", [&](const httplib::Request& req, httplib::Response& res) {
      try {
        handle_simulation_request(req, res);
      } catch (const std::exception& ex) {
        send_json(res, {{"success", false}, {"data", nullptr}, {"error", ex.what()}}, 400);
      }
    });

    if (!server.bind_to_port(listen_host, port)) {
      std::fprintf(stderr,
                   "Failed to bind Poisson API to http://%s:%d. Set POISSON_API_PORT to a free port and retry.\n",
                   listen_host.c_str(),
                   port);
      return 1;
    }

    std::printf("Poisson API is listening on http://%s:%d\n", listen_host.c_str(), port);
    if (!server.listen_after_bind()) {
      std::fprintf(stderr, "Poisson API stopped unexpectedly while listening on http://%s:%d\n", listen_host.c_str(), port);
      return 1;
    }

    return 0;
  } catch (const std::exception& ex) {
    std::fprintf(stderr, "Fatal startup error: %s\n", ex.what());
    return 1;
  }
}
