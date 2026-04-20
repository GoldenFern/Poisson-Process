#pragma once

#include <random>
#include <utility>
#include <vector>

struct SimulationRequest {
  double lambda;
  double horizon_t;
  double dt;
  int trials;
};

struct SinglePath {
  std::vector<double> arrival_times;
  std::vector<std::pair<double, int>> step_points;
};

struct HistogramBin {
  int k;
  double empirical_prob;
  double theoretical_prob;
};

struct SimulationResult {
  SinglePath single_path;
  std::vector<double> inter_arrivals;
  std::vector<int> trial_counts;
  std::vector<HistogramBin> histogram;
  std::vector<std::pair<double, double>> expected_path;
  double empirical_mean_count;
  double empirical_variance_count;
  double theoretical_mean_count;
  double theoretical_variance_count;
};

SinglePath simulate_single_path_exponential(double lambda, double horizon_t, std::mt19937& rng);

int sample_poisson_knuth(double mu, std::mt19937& rng);

SimulationResult run_simulation(const SimulationRequest& req);
