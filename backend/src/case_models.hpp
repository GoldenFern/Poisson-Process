#pragma once

#include <string>
#include <vector>

struct CasePreset {
  std::string id;
  std::string family;
  std::string display_name;
  std::string description;
  std::string teaser;
  double default_lambda;
  double default_horizon_t;
  double default_dt;
  bool uses_dt;
};

inline std::vector<CasePreset> default_case_presets() {
  return {
      {"homogeneous", "homogeneous", "Homogeneous Poisson Process",
       "Classical counting process with constant intensity and exponential inter-arrival times.",
       "The reference model: stationary, independent increments with linear compensator.", 12.0, 1.0, 0.02, true},
      {"nonhomogeneous", "nonhomogeneous", "Non-homogeneous Poisson Process",
       "Time-varying intensity model with bursty and quiet subintervals over the same observation window.",
       "The compensator remains linear in expectation only after integrating the local intensity curve.", 12.0, 1.0,
       0.02, true},
      {"compound", "compound", "Compound Poisson Process",
       "Jump process in which each arrival carries a random positive mark, such as claim severity or packet size.",
       "Counts remain Poisson, but the accumulated signal gains an additional layer of mark variability.", 4.5, 2.0,
       0.02, true},
      {"mixed", "mixed", "Mixed Poisson Process",
       "Poisson arrivals driven by a random latent intensity, producing overdispersed count distributions.",
       "Conditionally Poisson, marginally overdispersed: a natural bridge to negative-binomial counts.", 8.0, 1.0,
       0.02, true},
      {"spatial", "spatial", "Spatial Poisson Process",
       "Random point pattern on a planar observation window with independent counts over disjoint regions.",
       "A two-dimensional analogue where intensity scales with area rather than elapsed time.", 36.0, 1.0, 0.05,
       false},
  };
}
