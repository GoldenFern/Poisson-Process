#pragma once

#include <map>
#include <random>
#include <string>
#include <vector>

struct SimulationRequest {
  std::string case_id;
  double lambda;
  double horizon_t;
  double dt;
  int trials;
};

struct PlotPoint {
  double x;
  double y;
};

struct HistogramBin {
  double x;
  std::string label;
  double empirical_prob;
  double theoretical_prob;
};

struct SummaryMetric {
  std::string label;
  double empirical_value;
  double theoretical_value;
};

struct SimulationResult {
  std::string case_id;
  std::string family;
  std::string primary_mode;
  std::string histogram_mode;
  std::string diagnostic_mode;
  std::vector<PlotPoint> primary_path;
  std::vector<PlotPoint> benchmark_path;
  std::vector<PlotPoint> spatial_points;
  std::vector<double> event_times;
  std::vector<double> event_marks;
  std::vector<int> trial_counts;
  std::vector<double> diagnostic_samples;
  std::vector<PlotPoint> diagnostic_curve;
  std::vector<PlotPoint> diagnostic_markers;
  std::vector<HistogramBin> histogram;
  std::vector<SummaryMetric> summary_metrics;
  std::vector<std::string> insights;
  std::map<std::string, double> extras;
};

int sample_poisson_knuth(double mu, std::mt19937& rng);

SimulationResult run_simulation(const SimulationRequest& req);
