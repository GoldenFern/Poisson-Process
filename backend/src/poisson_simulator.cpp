#include "poisson_simulator.hpp"

#include <algorithm>
#include <cmath>
#include <map>
#include <numeric>
#include <stdexcept>

namespace {
constexpr int kMaxTrials = 20000;
constexpr double kMinDt = 1e-5;
}  // namespace

SinglePath simulate_single_path_exponential(double lambda, double horizon_t, std::mt19937& rng) {
  if (lambda <= 0.0 || horizon_t <= 0.0) {
    throw std::invalid_argument("lambda and T must be positive.");
  }

  std::exponential_distribution<double> exp_dist(lambda);

  SinglePath path;
  path.step_points.push_back({0.0, 0});

  double now = 0.0;
  int n = 0;
  while (true) {
    now += exp_dist(rng);
    if (now > horizon_t) {
      break;
    }
    ++n;
    path.arrival_times.push_back(now);
    path.step_points.push_back({now, n - 1});
    path.step_points.push_back({now, n});
  }

  path.step_points.push_back({horizon_t, n});
  return path;
}

int sample_poisson_knuth(double mu, std::mt19937& rng) {
  if (mu <= 0.0) {
    return 0;
  }

  const double l = std::exp(-mu);
  int k = 0;
  double p = 1.0;
  std::uniform_real_distribution<double> unif(0.0, 1.0);

  do {
    ++k;
    p *= unif(rng);
  } while (p > l);

  return k - 1;
}

SimulationResult run_simulation(const SimulationRequest& req) {
  if (req.lambda <= 0.0) {
    throw std::invalid_argument("lambda must be positive.");
  }
  if (req.horizon_t <= 0.0) {
    throw std::invalid_argument("T must be positive.");
  }
  if (req.dt < kMinDt || req.dt > req.horizon_t) {
    throw std::invalid_argument("dt must satisfy 1e-5 <= dt <= T.");
  }
  if (req.trials <= 0 || req.trials > kMaxTrials) {
    throw std::invalid_argument("trials must be in [1, 20000].");
  }

  std::mt19937 rng(static_cast<std::mt19937::result_type>(req.seed));
  SimulationResult result;

  result.single_path = simulate_single_path_exponential(req.lambda, req.horizon_t, rng);
  result.inter_arrivals.reserve(result.single_path.arrival_times.size());
  double prev = 0.0;
  for (double t : result.single_path.arrival_times) {
    result.inter_arrivals.push_back(t - prev);
    prev = t;
  }

  const double mu = req.lambda * req.horizon_t;
  result.trial_counts.reserve(req.trials);
  for (int i = 0; i < req.trials; ++i) {
    result.trial_counts.push_back(sample_poisson_knuth(mu, rng));
  }

  const double sum = std::accumulate(result.trial_counts.begin(), result.trial_counts.end(), 0.0);
  result.empirical_mean_count = sum / static_cast<double>(req.trials);

  double sq_sum = 0.0;
  for (int c : result.trial_counts) {
    const double d = static_cast<double>(c) - result.empirical_mean_count;
    sq_sum += d * d;
  }
  result.empirical_variance_count = sq_sum / static_cast<double>(req.trials);
  result.theoretical_mean_count = mu;
  result.theoretical_variance_count = mu;

  std::map<int, int> freq;
  int max_count = 0;
  for (int c : result.trial_counts) {
    ++freq[c];
    max_count = std::max(max_count, c);
  }

  const int k_max = std::max(max_count, static_cast<int>(std::ceil(mu + 4.0 * std::sqrt(mu))) + 2);
  result.histogram.reserve(static_cast<size_t>(k_max + 1));
  for (int k = 0; k <= k_max; ++k) {
    const int count = freq.count(k) ? freq[k] : 0;
    const double empirical = static_cast<double>(count) / static_cast<double>(req.trials);
    const double theoretical = std::exp(-mu) * std::pow(mu, k) / std::tgamma(static_cast<double>(k + 1));
    result.histogram.push_back({k, empirical, theoretical});
  }

  for (double t = 0.0; t <= req.horizon_t + 1e-12; t += req.dt) {
    result.expected_path.push_back({std::min(t, req.horizon_t), req.lambda * std::min(t, req.horizon_t)});
  }

  return result;
}
