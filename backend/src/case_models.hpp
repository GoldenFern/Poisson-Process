#pragma once

#include <string>
#include <vector>

struct CasePreset {
  std::string id;
  std::string display_name;
  std::string description;
  double default_lambda;
  double default_horizon_t;
  double default_dt;
};

inline std::vector<CasePreset> default_case_presets() {
  return {
      {"transport", "Urban Traffic Arrivals",
       "Model vehicles reaching an intersection per minute.", 18.0, 1.0 / 3.0, 0.002},
      {"quant", "Order Flow in Market Microstructure",
       "Model order arrivals in a short intraday trading window.", 42.0, 0.25, 0.0015},
      {"server", "Server Request Arrivals", "Model incoming requests on a service endpoint.", 120.0, 0.1,
       0.0005},
      {"physchem", "Radiation/Particle Count",
       "Model detected decay events in a fixed observation interval.", 8.0, 2.0, 0.01},
  };
}
