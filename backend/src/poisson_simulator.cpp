#include "poisson_simulator.hpp"

#include "case_models.hpp"

#include <algorithm>
#include <cmath>
#include <functional>
#include <iomanip>
#include <limits>
#include <numeric>
#include <sstream>
#include <stdexcept>

namespace {
constexpr int kMaxTrials = 20000;
constexpr double kMinDt = 1e-5;
constexpr int kSpatialGridSide = 4;
constexpr int kHistogramBinCount = 18;
constexpr double kCompoundJumpShape = 2.5;
constexpr double kCompoundJumpScale = 1.2;
constexpr double kMixedShape = 4.0;

struct RunningStats {
  double mean = 0.0;
  double variance = 0.0;
};

struct DensitySampler {
  std::vector<double> xs;
  std::vector<double> cdf;

  double sample(std::mt19937& rng) const {
    if (xs.empty() || cdf.empty()) {
      return 0.0;
    }

    std::uniform_real_distribution<double> unif(0.0, 1.0);
    const double target = unif(rng);
    const auto it = std::lower_bound(cdf.begin(), cdf.end(), target);
    const size_t index = static_cast<size_t>(std::distance(cdf.begin(), it));
    if (index == 0) {
      return xs.front();
    }

    const double cdf_left = cdf[index - 1];
    const double cdf_right = cdf[std::min(index, cdf.size() - 1)];
    const double x_left = xs[index - 1];
    const double x_right = xs[std::min(index, xs.size() - 1)];
    if (cdf_right - cdf_left <= 1e-12) {
      return x_right;
    }
    const double weight = (target - cdf_left) / (cdf_right - cdf_left);
    return x_left + weight * (x_right - x_left);
  }
};

DensitySampler build_density_sampler(const std::vector<PlotPoint>& density_curve);

CasePreset find_case_preset(const std::string& case_id) {
  const auto presets = default_case_presets();
  const auto it = std::find_if(presets.begin(), presets.end(), [&](const CasePreset& preset) {
    return preset.id == case_id;
  });

  if (it == presets.end()) {
    throw std::invalid_argument("Unknown case id: " + case_id);
  }

  return *it;
}

void validate_request(const SimulationRequest& req, const CasePreset& preset) {
  if (req.lambda <= 0.0) {
    throw std::invalid_argument("lambda must be positive.");
  }
  if (req.horizon_t <= 0.0) {
    throw std::invalid_argument("T must be positive.");
  }
  if (req.trials <= 0 || req.trials > kMaxTrials) {
    throw std::invalid_argument("trials must be in [1, 20000].");
  }
  if (preset.uses_dt && (req.dt < kMinDt || req.dt > req.horizon_t)) {
    throw std::invalid_argument("dt must satisfy 1e-5 <= dt <= T.");
  }
  if (req.case_id == "spatial" && req.spatial_dimension != 2 && req.spatial_dimension != 3) {
    throw std::invalid_argument("spatial_dimension must be 2 or 3.");
  }
}

std::string format_decimal(double value, int precision = 3) {
  std::ostringstream oss;
  oss << std::fixed << std::setprecision(precision) << value;
  return oss.str();
}

RunningStats compute_stats(const std::vector<int>& samples) {
  RunningStats stats;
  if (samples.empty()) {
    return stats;
  }

  const double sum = std::accumulate(samples.begin(), samples.end(), 0.0);
  stats.mean = sum / static_cast<double>(samples.size());

  double sq_sum = 0.0;
  for (int sample : samples) {
    const double delta = static_cast<double>(sample) - stats.mean;
    sq_sum += delta * delta;
  }
  stats.variance = sq_sum / static_cast<double>(samples.size());
  return stats;
}

RunningStats compute_stats(const std::vector<double>& samples) {
  RunningStats stats;
  if (samples.empty()) {
    return stats;
  }

  const double sum = std::accumulate(samples.begin(), samples.end(), 0.0);
  stats.mean = sum / static_cast<double>(samples.size());

  double sq_sum = 0.0;
  for (double sample : samples) {
    const double delta = sample - stats.mean;
    sq_sum += delta * delta;
  }
  stats.variance = sq_sum / static_cast<double>(samples.size());
  return stats;
}

double poisson_pmf(int k, double mu) {
  if (k < 0) {
    return 0.0;
  }
  if (mu <= 0.0) {
    return k == 0 ? 1.0 : 0.0;
  }
  return std::exp(-mu + static_cast<double>(k) * std::log(mu) - std::lgamma(static_cast<double>(k) + 1.0));
}

double negative_binomial_pmf(int k, double shape, double scale_horizon) {
  if (k < 0 || shape <= 0.0 || scale_horizon < 0.0) {
    return 0.0;
  }
  const double p = 1.0 / (1.0 + scale_horizon);
  const double log_coeff =
      std::lgamma(static_cast<double>(k) + shape) - std::lgamma(shape) - std::lgamma(static_cast<double>(k) + 1.0);
  return std::exp(log_coeff + shape * std::log(p) + static_cast<double>(k) * std::log1p(-p));
}

double exponential_density(double x, double lambda) {
  if (x < 0.0 || lambda <= 0.0) {
    return 0.0;
  }
  return lambda * std::exp(-lambda * x);
}

double gamma_density(double x, double shape, double scale) {
  if (x < 0.0 || shape <= 0.0 || scale <= 0.0) {
    return 0.0;
  }
  if (x == 0.0 && shape < 1.0) {
    return std::numeric_limits<double>::infinity();
  }
  const double numerator = std::pow(x, shape - 1.0) * std::exp(-x / scale);
  const double denominator = std::tgamma(shape) * std::pow(scale, shape);
  return numerator / denominator;
}

double nhpp_weight(double normalized_t) {
  if (normalized_t < 0.25) {
    return 0.5;
  }
  if (normalized_t < 0.5) {
    return 1.6;
  }
  if (normalized_t < 0.75) {
    return 1.2;
  }
  return 0.7;
}

double nhpp_cumulative_weight(double normalized_t) {
  const double u = std::clamp(normalized_t, 0.0, 1.0);
  if (u <= 0.25) {
    return 0.5 * u;
  }
  if (u <= 0.5) {
    return 0.125 + 1.6 * (u - 0.25);
  }
  if (u <= 0.75) {
    return 0.125 + 0.4 + 1.2 * (u - 0.5);
  }
  return 0.125 + 0.4 + 0.3 + 0.7 * (u - 0.75);
}

double nhpp_intensity(double lambda, double t, double horizon_t) {
  return lambda * nhpp_weight(t / horizon_t);
}

double nhpp_compensator(double lambda, double t, double horizon_t) {
  return lambda * horizon_t * nhpp_cumulative_weight(t / horizon_t);
}

std::vector<double> simulate_hpp_arrivals(double lambda, double horizon_t, std::mt19937& rng) {
  std::vector<double> arrivals;
  std::exponential_distribution<double> exp_dist(lambda);

  double now = 0.0;
  while (true) {
    now += exp_dist(rng);
    if (now > horizon_t) {
      break;
    }
    arrivals.push_back(now);
  }

  return arrivals;
}

std::vector<double> simulate_nhpp_arrivals(double lambda, double horizon_t, std::mt19937& rng) {
  std::vector<double> arrivals;
  const double dominating_rate = 1.6 * lambda;
  std::exponential_distribution<double> exp_dist(dominating_rate);
  std::uniform_real_distribution<double> unif(0.0, 1.0);

  double now = 0.0;
  while (true) {
    now += exp_dist(rng);
    if (now > horizon_t) {
      break;
    }
    const double accept_prob = nhpp_intensity(lambda, now, horizon_t) / dominating_rate;
    if (unif(rng) <= accept_prob) {
      arrivals.push_back(now);
    }
  }

  return arrivals;
}

std::vector<double> simulate_nhpp_arrivals(const std::function<double(double)>& intensity,
                                           double dominating_rate,
                                           double horizon_t,
                                           std::mt19937& rng) {
  std::vector<double> arrivals;
  if (dominating_rate <= 0.0) {
    return arrivals;
  }

  std::exponential_distribution<double> exp_dist(dominating_rate);
  std::uniform_real_distribution<double> unif(0.0, 1.0);

  double now = 0.0;
  while (true) {
    now += exp_dist(rng);
    if (now > horizon_t) {
      break;
    }
    const double local_rate = std::max(0.0, intensity(now));
    if (local_rate <= 0.0) {
      continue;
    }
    if (unif(rng) <= local_rate / dominating_rate) {
      arrivals.push_back(now);
    }
  }

  return arrivals;
}

std::vector<double> build_inter_arrivals(const std::vector<double>& event_times) {
  std::vector<double> inter_arrivals;
  inter_arrivals.reserve(event_times.size());

  double previous = 0.0;
  for (double t : event_times) {
    inter_arrivals.push_back(t - previous);
    previous = t;
  }
  return inter_arrivals;
}

std::vector<PlotPoint> build_step_path(const std::vector<double>& event_times,
                                       const std::vector<double>& event_marks,
                                       double horizon_t) {
  std::vector<PlotPoint> path;
  path.push_back({0.0, 0.0});

  double cumulative = 0.0;
  for (size_t index = 0; index < event_times.size(); ++index) {
    const double t = event_times[index];
    path.push_back({t, cumulative});
    cumulative += event_marks[index];
    path.push_back({t, cumulative});
  }

  path.push_back({horizon_t, cumulative});
  return path;
}

std::vector<PlotPoint> build_curve(double horizon_t, double dt, const std::function<double(double)>& evaluator) {
  const double safe_dt = std::max(dt, horizon_t / 80.0);

  std::vector<PlotPoint> curve;
  for (double t = 0.0; t < horizon_t; t += safe_dt) {
    curve.push_back({t, evaluator(t)});
  }
  curve.push_back({horizon_t, evaluator(horizon_t)});
  return curve;
}

std::vector<PlotPoint> build_density_curve(double max_x,
                                           int samples,
                                           const std::function<double(double)>& evaluator) {
  std::vector<PlotPoint> curve;
  const int point_count = std::max(samples, 40);
  const double x_cap = std::max(max_x, 1e-6);

  curve.reserve(static_cast<size_t>(point_count + 1));
  for (int i = 0; i <= point_count; ++i) {
    const double x = x_cap * static_cast<double>(i) / static_cast<double>(point_count);
    curve.push_back({x, evaluator(x)});
  }
  return curve;
}

std::vector<PlotPoint> build_discrete_curve(int max_k, const std::function<double(int)>& pmf) {
  std::vector<PlotPoint> curve;
  curve.reserve(static_cast<size_t>(max_k + 1));
  for (int k = 0; k <= max_k; ++k) {
    curve.push_back({static_cast<double>(k), pmf(k)});
  }
  return curve;
}

double max_curve_y(const std::vector<PlotPoint>& curve) {
  double maximum = 0.0;
  for (const auto& point : curve) {
    maximum = std::max(maximum, point.y);
  }
  return maximum;
}

double min_curve_y(const std::vector<PlotPoint>& curve) {
  if (curve.empty()) {
    return 0.0;
  }
  double minimum = curve.front().y;
  for (const auto& point : curve) {
    minimum = std::min(minimum, point.y);
  }
  return minimum;
}

std::vector<PlotPoint> sanitize_curve_profile(const std::vector<PlotPoint>& raw_points,
                                              double x_min,
                                              double x_max,
                                              bool clamp_y_nonnegative = true) {
  std::vector<PlotPoint> points = raw_points;
  if (points.empty()) {
    return {};
  }

  std::sort(points.begin(), points.end(), [](const PlotPoint& lhs, const PlotPoint& rhs) { return lhs.x < rhs.x; });

  std::vector<PlotPoint> filtered;
  filtered.reserve(points.size());
  for (const auto& point : points) {
    const double clamped_x = std::clamp(point.x, x_min, x_max);
    const double clamped_y = clamp_y_nonnegative ? std::max(0.0, point.y) : point.y;
    if (!filtered.empty() && std::abs(filtered.back().x - clamped_x) < 1e-9) {
      filtered.back().y = clamped_y;
      continue;
    }
    filtered.push_back({clamped_x, clamped_y});
  }

  if (filtered.empty()) {
    return {};
  }

  if (filtered.front().x > x_min + 1e-9) {
    filtered.insert(filtered.begin(), {x_min, filtered.front().y});
  } else {
    filtered.front().x = x_min;
  }

  if (filtered.back().x < x_max - 1e-9) {
    filtered.push_back({x_max, filtered.back().y});
  } else {
    filtered.back().x = x_max;
  }

  if (filtered.size() == 1) {
    filtered.push_back({x_max, filtered.front().y});
  }

  return filtered;
}

double evaluate_curve_linear(const std::vector<PlotPoint>& curve, double x) {
  if (curve.empty()) {
    return 0.0;
  }
  if (x <= curve.front().x) {
    return curve.front().y;
  }
  if (x >= curve.back().x) {
    return curve.back().y;
  }

  for (size_t index = 1; index < curve.size(); ++index) {
    const PlotPoint& left = curve[index - 1];
    const PlotPoint& right = curve[index];
    if (x <= right.x) {
      const double span = right.x - left.x;
      if (span <= 1e-12) {
        return right.y;
      }
      const double weight = (x - left.x) / span;
      return left.y + weight * (right.y - left.y);
    }
  }

  return curve.back().y;
}

double integrate_curve(const std::vector<PlotPoint>& curve, double upper_x = std::numeric_limits<double>::infinity()) {
  if (curve.size() < 2) {
    return 0.0;
  }

  const double capped_upper = std::min(upper_x, curve.back().x);
  if (capped_upper <= curve.front().x) {
    return 0.0;
  }

  double area = 0.0;
  for (size_t index = 1; index < curve.size(); ++index) {
    const PlotPoint& left = curve[index - 1];
    const PlotPoint& right = curve[index];
    if (left.x >= capped_upper) {
      break;
    }

    const double segment_left = left.x;
    const double segment_right = std::min(right.x, capped_upper);
    if (segment_right <= segment_left) {
      continue;
    }

    const double y_left = left.y;
    const double y_right = evaluate_curve_linear(curve, segment_right);
    area += 0.5 * (y_left + y_right) * (segment_right - segment_left);
  }

  return area;
}

std::vector<PlotPoint> normalize_density_curve(const std::vector<PlotPoint>& raw_curve) {
  if (raw_curve.empty()) {
    return {};
  }

  const double total_mass = integrate_curve(raw_curve);
  if (total_mass <= 1e-12) {
    throw std::invalid_argument("Custom density curve must have positive total area.");
  }

  std::vector<PlotPoint> normalized = raw_curve;
  for (auto& point : normalized) {
    point.y /= total_mass;
  }
  return normalized;
}

double integrate_curve_moment(const std::vector<PlotPoint>& curve, int power) {
  if (curve.size() < 2) {
    return 0.0;
  }

  double moment = 0.0;
  for (size_t index = 1; index < curve.size(); ++index) {
    const PlotPoint& left = curve[index - 1];
    const PlotPoint& right = curve[index];
    const double width = right.x - left.x;
    if (width <= 0.0) {
      continue;
    }

    const int subdivisions = 8;
    const double step = width / static_cast<double>(subdivisions);
    for (int part = 0; part < subdivisions; ++part) {
      const double x0 = left.x + part * step;
      const double x1 = x0 + step;
      const double y0 = evaluate_curve_linear(curve, x0);
      const double y1 = evaluate_curve_linear(curve, x1);
      moment += 0.5 * (std::pow(x0, power) * y0 + std::pow(x1, power) * y1) * step;
    }
  }

  return moment;
}

std::vector<double> sample_from_density_curve(const std::vector<PlotPoint>& density_curve,
                                              int sample_count,
                                              std::mt19937& rng) {
  std::vector<double> samples;
  if (density_curve.size() < 2 || sample_count <= 0) {
    return samples;
  }

  const DensitySampler sampler = build_density_sampler(density_curve);
  samples.reserve(static_cast<size_t>(sample_count));
  for (int sample_index = 0; sample_index < sample_count; ++sample_index) {
    samples.push_back(sampler.sample(rng));
  }

  return samples;
}

DensitySampler build_density_sampler(const std::vector<PlotPoint>& density_curve) {
  DensitySampler sampler;
  if (density_curve.size() < 2) {
    return sampler;
  }

  const int resolution = 400;
  const double x_min = density_curve.front().x;
  const double x_max = density_curve.back().x;
  const double step = (x_max - x_min) / static_cast<double>(resolution);

  sampler.xs.assign(static_cast<size_t>(resolution + 1), 0.0);
  sampler.cdf.assign(static_cast<size_t>(resolution + 1), 0.0);
  sampler.xs[0] = x_min;

  for (int index = 1; index <= resolution; ++index) {
    sampler.xs[static_cast<size_t>(index)] = x_min + step * static_cast<double>(index);
    const double y0 = evaluate_curve_linear(density_curve, sampler.xs[static_cast<size_t>(index - 1)]);
    const double y1 = evaluate_curve_linear(density_curve, sampler.xs[static_cast<size_t>(index)]);
    sampler.cdf[static_cast<size_t>(index)] = sampler.cdf[static_cast<size_t>(index - 1)] + 0.5 * (y0 + y1) * step;
  }

  const double total_mass = sampler.cdf.back();
  if (total_mass <= 1e-12) {
    throw std::invalid_argument("Custom density curve must have positive total area.");
  }
  for (double& value : sampler.cdf) {
    value /= total_mass;
  }

  return sampler;
}

std::vector<HistogramBin> build_discrete_histogram(const std::vector<int>& samples,
                                                   const RunningStats& stats,
                                                   const std::function<double(int)>& pmf) {
  std::vector<HistogramBin> histogram;
  if (samples.empty()) {
    return histogram;
  }

  const int max_sample = *std::max_element(samples.begin(), samples.end());
  const int max_k =
      std::max(max_sample, static_cast<int>(std::ceil(stats.mean + 6.0 * std::sqrt(std::max(stats.variance, 1.0))))) + 2;

  std::vector<int> counts(static_cast<size_t>(max_k + 1), 0);
  for (int sample : samples) {
    if (sample <= max_k) {
      counts[static_cast<size_t>(sample)] += 1;
    }
  }

  histogram.reserve(static_cast<size_t>(max_k + 1));
  for (int k = 0; k <= max_k; ++k) {
    histogram.push_back(
        {static_cast<double>(k), std::to_string(k), static_cast<double>(counts[static_cast<size_t>(k)]) / samples.size(), pmf(k)});
  }

  return histogram;
}

std::vector<HistogramBin> build_continuous_histogram(const std::vector<double>& samples,
                                                     int bin_count,
                                                     const std::function<double(double)>& density) {
  std::vector<HistogramBin> histogram;
  if (samples.empty()) {
    return histogram;
  }

  const auto [min_it, max_it] = std::minmax_element(samples.begin(), samples.end());
  const double min_x = std::min(0.0, *min_it);
  double max_x = *max_it;
  if (max_x <= min_x) {
    max_x = min_x + 1.0;
  }

  const int bins = std::max(bin_count, 10);
  const double bin_width = (max_x - min_x) / static_cast<double>(bins);
  std::vector<int> counts(static_cast<size_t>(bins), 0);

  for (double sample : samples) {
    const double normalized = (sample - min_x) / bin_width;
    const int index = std::clamp(static_cast<int>(std::floor(normalized)), 0, bins - 1);
    counts[static_cast<size_t>(index)] += 1;
  }

  histogram.reserve(static_cast<size_t>(bins));
  for (int index = 0; index < bins; ++index) {
    const double center = min_x + (static_cast<double>(index) + 0.5) * bin_width;
    const double empirical_density =
        static_cast<double>(counts[static_cast<size_t>(index)]) / (static_cast<double>(samples.size()) * bin_width);
    const double theoretical_density = density ? density(center) : -1.0;
    histogram.push_back({center, format_decimal(center, center < 10.0 ? 2 : 1), empirical_density, theoretical_density});
  }

  return histogram;
}

std::vector<SpatialPoint> simulate_spatial_points(double lambda, double measure, int dimension, std::mt19937& rng) {
  const double side = dimension == 3 ? std::cbrt(measure) : std::sqrt(measure);
  std::uniform_real_distribution<double> unif(0.0, side);

  std::vector<SpatialPoint> points;
  const int total_points = sample_poisson_knuth(lambda * measure, rng);
  points.reserve(static_cast<size_t>(total_points));

  for (int index = 0; index < total_points; ++index) {
    points.push_back({unif(rng), unif(rng), dimension == 3 ? unif(rng) : 0.0});
  }

  return points;
}

std::vector<int> simulate_spatial_cell_counts(double lambda, double measure, int dimension, int trials, std::mt19937& rng) {
  std::vector<int> occupancies;
  int total_cells = 1;
  for (int axis = 0; axis < dimension; ++axis) {
    total_cells *= kSpatialGridSide;
  }
  occupancies.reserve(static_cast<size_t>(trials * total_cells));
  const double cell_mean = lambda * measure / static_cast<double>(total_cells);

  for (int trial = 0; trial < trials; ++trial) {
    for (int cell = 0; cell < total_cells; ++cell) {
      occupancies.push_back(sample_poisson_knuth(cell_mean, rng));
    }
  }

  return occupancies;
}

SimulationResult simulate_homogeneous_case(const SimulationRequest& req, const CasePreset& preset, std::mt19937& rng) {
  SimulationResult result;
  result.case_id = preset.id;
  result.family = preset.family;
  result.primary_mode = "step";
  result.histogram_mode = "discrete_pmf";
  result.diagnostic_mode = "continuous_density";

  result.event_times = simulate_hpp_arrivals(req.lambda, req.horizon_t, rng);
  result.event_marks.assign(result.event_times.size(), 1.0);
  result.primary_path = build_step_path(result.event_times, result.event_marks, req.horizon_t);
  result.benchmark_path = build_curve(req.horizon_t, req.dt, [&](double t) { return req.lambda * t; });

  const auto inter_arrivals = build_inter_arrivals(result.event_times);
  result.diagnostic_samples = inter_arrivals;

  const double mu = req.lambda * req.horizon_t;
  result.trial_counts.reserve(static_cast<size_t>(req.trials));
  for (int trial = 0; trial < req.trials; ++trial) {
    result.trial_counts.push_back(sample_poisson_knuth(mu, rng));
  }

  const auto count_stats = compute_stats(result.trial_counts);
  result.histogram = build_discrete_histogram(result.trial_counts, count_stats, [&](int k) { return poisson_pmf(k, mu); });

  const double diagnostic_x_max =
      std::max(6.0 / req.lambda, inter_arrivals.empty() ? 0.0 : *std::max_element(inter_arrivals.begin(), inter_arrivals.end()) * 1.15);
  result.diagnostic_curve = build_density_curve(diagnostic_x_max, 80, [&](double x) { return exponential_density(x, req.lambda); });

  const double zero_empirical =
      static_cast<double>(std::count(result.trial_counts.begin(), result.trial_counts.end(), 0)) / result.trial_counts.size();
  const auto gap_stats = compute_stats(inter_arrivals);

  result.summary_metrics = {
      {"Mean of N(T)", count_stats.mean, mu},
      {"Variance of N(T)", count_stats.variance, mu},
      {"P(N(T)=0)", zero_empirical, std::exp(-mu)},
      {"Mean inter-arrival", gap_stats.mean, 1.0 / req.lambda},
  };

  result.insights = {
      "Stationary and independent increments imply that the entire path is encoded by one scalar intensity lambda.",
      "The path benchmark is linear because the compensator satisfies E[N(t)] = lambda t.",
      "Inter-arrival times are memoryless, which is why the waiting-time histogram lines up with an exponential density.",
  };

  return result;
}

SimulationResult simulate_nonhomogeneous_case(const SimulationRequest& req, const CasePreset& preset, std::mt19937& rng) {
  SimulationResult result;
  result.case_id = preset.id;
  result.family = preset.family;
  result.primary_mode = "step";
  result.histogram_mode = "discrete_pmf";
  result.diagnostic_mode = "line";

  const bool use_custom_profile = !req.custom_profile.empty();
  std::vector<PlotPoint> weight_curve;
  double mu = 0.0;
  double peak_intensity = 0.0;
  double floor_intensity = 0.0;

  if (use_custom_profile) {
    weight_curve = sanitize_curve_profile(req.custom_profile, 0.0, req.horizon_t);
    peak_intensity = req.lambda * max_curve_y(weight_curve);
    floor_intensity = req.lambda * min_curve_y(weight_curve);
    mu = req.lambda * integrate_curve(weight_curve);
    result.event_times = simulate_nhpp_arrivals(
        [&](double t) { return req.lambda * evaluate_curve_linear(weight_curve, t); }, peak_intensity, req.horizon_t, rng);
    result.benchmark_path = build_curve(req.horizon_t, req.dt, [&](double t) {
      return req.lambda * integrate_curve(weight_curve, t);
    });
    result.diagnostic_curve = build_curve(req.horizon_t, req.dt, [&](double t) {
      return req.lambda * evaluate_curve_linear(weight_curve, t);
    });
  } else {
    result.event_times = simulate_nhpp_arrivals(req.lambda, req.horizon_t, rng);
    result.benchmark_path = build_curve(req.horizon_t, req.dt, [&](double t) { return nhpp_compensator(req.lambda, t, req.horizon_t); });
    result.diagnostic_curve = build_curve(req.horizon_t, req.dt, [&](double t) { return nhpp_intensity(req.lambda, t, req.horizon_t); });
    peak_intensity = 1.6 * req.lambda;
    floor_intensity = 0.5 * req.lambda;
    mu = nhpp_compensator(req.lambda, req.horizon_t, req.horizon_t);
  }

  result.event_marks.assign(result.event_times.size(), 1.0);
  result.primary_path = build_step_path(result.event_times, result.event_marks, req.horizon_t);

  result.trial_counts.reserve(static_cast<size_t>(req.trials));
  for (int trial = 0; trial < req.trials; ++trial) {
    result.trial_counts.push_back(sample_poisson_knuth(mu, rng));
  }

  const auto count_stats = compute_stats(result.trial_counts);
  result.histogram = build_discrete_histogram(result.trial_counts, count_stats, [&](int k) { return poisson_pmf(k, mu); });

  result.summary_metrics = {
      {"Mean of N(T)", count_stats.mean, mu},
      {"Variance of N(T)", count_stats.variance, mu},
      {"Peak intensity", peak_intensity, peak_intensity},
      {"Low-intensity floor", floor_intensity, floor_intensity},
  };

  result.extras["peak_intensity"] = peak_intensity;
  result.extras["floor_intensity"] = floor_intensity;
  result.extras["custom_profile"] = use_custom_profile ? 1.0 : 0.0;

  result.insights = {
      "Counts on the full horizon remain Poisson because the compensator M(T) replaces lambda T.",
      "The path is no longer pinned to a straight reference line in calendar time; it tracks the integrated intensity M(t).",
      "Burst and lull regimes break stationarity even though disjoint increments remain independent.",
  };

  return result;
}

SimulationResult simulate_compound_case(const SimulationRequest& req, const CasePreset& preset, std::mt19937& rng) {
  SimulationResult result;
  result.case_id = preset.id;
  result.family = preset.family;
  result.primary_mode = "step";
  result.histogram_mode = "continuous_density";
  result.diagnostic_mode = "continuous_density";
  const bool use_custom_profile = !req.custom_profile.empty();
  std::vector<PlotPoint> density_curve;
  std::function<double()> sample_mark;
  std::function<double(double)> evaluate_density;
  double jump_mean = 0.0;
  double jump_second_moment = 0.0;
  DensitySampler custom_sampler;

  if (use_custom_profile) {
    double max_x = 0.0;
    for (const auto& point : req.custom_profile) {
      max_x = std::max(max_x, point.x);
    }
    density_curve =
        normalize_density_curve(sanitize_curve_profile(req.custom_profile, 0.0, std::max(max_x, 1.0)));
    custom_sampler = build_density_sampler(density_curve);
    sample_mark = [&]() {
      return custom_sampler.sample(rng);
    };
    evaluate_density = [&](double x) { return evaluate_curve_linear(density_curve, x); };
    jump_mean = integrate_curve_moment(density_curve, 1);
    jump_second_moment = integrate_curve_moment(density_curve, 2);
  } else {
    std::gamma_distribution<double> mark_dist(kCompoundJumpShape, kCompoundJumpScale);
    sample_mark = [&]() { return mark_dist(rng); };
    evaluate_density = [&](double x) { return gamma_density(x, kCompoundJumpShape, kCompoundJumpScale); };
    jump_mean = kCompoundJumpShape * kCompoundJumpScale;
    jump_second_moment =
        kCompoundJumpShape * (kCompoundJumpShape + 1.0) * kCompoundJumpScale * kCompoundJumpScale;
  }

  result.event_times = simulate_hpp_arrivals(req.lambda, req.horizon_t, rng);
  result.event_marks.reserve(result.event_times.size());
  for (size_t index = 0; index < result.event_times.size(); ++index) {
    result.event_marks.push_back(sample_mark());
  }

  result.primary_path = build_step_path(result.event_times, result.event_marks, req.horizon_t);
  result.benchmark_path = build_curve(req.horizon_t, req.dt, [&](double t) { return req.lambda * jump_mean * t; });

  std::vector<double> aggregate_totals;
  aggregate_totals.reserve(static_cast<size_t>(req.trials));
  result.trial_counts.reserve(static_cast<size_t>(req.trials));
  for (int trial = 0; trial < req.trials; ++trial) {
    const int count = sample_poisson_knuth(req.lambda * req.horizon_t, rng);
    result.trial_counts.push_back(count);

    double total = 0.0;
    for (int event = 0; event < count; ++event) {
      total += sample_mark();
    }
    aggregate_totals.push_back(total);
  }

  const auto aggregate_stats = compute_stats(aggregate_totals);
  result.histogram = build_continuous_histogram(aggregate_totals, kHistogramBinCount, {});

  result.diagnostic_samples.reserve(240);
  for (int sample = 0; sample < 240; ++sample) {
    result.diagnostic_samples.push_back(sample_mark());
  }

  const double diagnostic_x_max =
      std::max(10.0, *std::max_element(result.diagnostic_samples.begin(), result.diagnostic_samples.end()) * 1.1);
  result.diagnostic_curve =
      build_density_curve(diagnostic_x_max, 80, [&](double x) { return evaluate_density(x); });

  result.summary_metrics = {
      {"Mean of S(T)", aggregate_stats.mean, req.lambda * req.horizon_t * jump_mean},
      {"Variance of S(T)", aggregate_stats.variance, req.lambda * req.horizon_t * jump_second_moment},
      {"Mean jump size", compute_stats(result.diagnostic_samples).mean, jump_mean},
      {"Mean event count", compute_stats(result.trial_counts).mean, req.lambda * req.horizon_t},
  };

  result.insights = {
      "A compound Poisson process separates arrival uncertainty from mark uncertainty.",
      "The aggregate mean grows like lambda E[J] t, while the variance depends on the second mark moment E[J^2].",
      "Even with Poisson counts, the accumulated-loss histogram is continuous because each jump size is random.",
  };

  result.extras["custom_profile"] = use_custom_profile ? 1.0 : 0.0;

  return result;
}

SimulationResult simulate_mixed_case(const SimulationRequest& req, const CasePreset& preset, std::mt19937& rng) {
  SimulationResult result;
  result.case_id = preset.id;
  result.family = preset.family;
  result.primary_mode = "step";
  result.histogram_mode = "discrete_pmf";
  result.diagnostic_mode = "line";
  const bool use_custom_profile = !req.custom_profile.empty();
  const double mixing_scale = req.lambda / kMixedShape;
  std::gamma_distribution<double> rate_dist(kMixedShape, mixing_scale);

  std::vector<PlotPoint> mixing_curve;
  std::function<double()> sample_rate;
  std::function<double(double)> evaluate_density;
  double latent_mean = 0.0;
  double latent_second_moment = 0.0;
  DensitySampler custom_sampler;

  if (use_custom_profile) {
    double max_x = 0.0;
    for (const auto& point : req.custom_profile) {
      max_x = std::max(max_x, point.x);
    }
    mixing_curve = normalize_density_curve(sanitize_curve_profile(req.custom_profile, 0.0, std::max(max_x, 1.0)));
    custom_sampler = build_density_sampler(mixing_curve);
    sample_rate = [&]() { return custom_sampler.sample(rng); };
    evaluate_density = [&](double x) { return evaluate_curve_linear(mixing_curve, x); };
    latent_mean = integrate_curve_moment(mixing_curve, 1);
    latent_second_moment = integrate_curve_moment(mixing_curve, 2);
  } else {
    sample_rate = [&]() { return rate_dist(rng); };
    evaluate_density = [&](double x) { return gamma_density(x, kMixedShape, mixing_scale); };
    latent_mean = req.lambda;
    latent_second_moment = req.lambda * req.lambda * (1.0 + 1.0 / kMixedShape);
  }

  const double sampled_lambda = sample_rate();
  result.extras["sampled_lambda"] = sampled_lambda;
  result.extras["mean_lambda"] = latent_mean;
  result.event_times = simulate_hpp_arrivals(sampled_lambda, req.horizon_t, rng);
  result.event_marks.assign(result.event_times.size(), 1.0);
  result.primary_path = build_step_path(result.event_times, result.event_marks, req.horizon_t);
  result.benchmark_path = build_curve(req.horizon_t, req.dt, [&](double t) { return sampled_lambda * t; });

  result.trial_counts.reserve(static_cast<size_t>(req.trials));
  for (int trial = 0; trial < req.trials; ++trial) {
    const double latent_lambda = sample_rate();
    result.trial_counts.push_back(sample_poisson_knuth(latent_lambda * req.horizon_t, rng));
  }

  const auto count_stats = compute_stats(result.trial_counts);
  if (use_custom_profile) {
    result.histogram = build_discrete_histogram(result.trial_counts, count_stats, [&](int) { return -1.0; });
  } else {
    const double scale_horizon = mixing_scale * req.horizon_t;
    result.histogram = build_discrete_histogram(result.trial_counts, count_stats, [&](int k) {
      return negative_binomial_pmf(k, kMixedShape, scale_horizon);
    });
  }

  const double latent_variance = std::max(0.0, latent_second_moment - latent_mean * latent_mean);
  const double lambda_sd = std::sqrt(std::max(latent_variance, 1e-9));
  const double diagnostic_x_max = std::max(sampled_lambda, latent_mean + 4.0 * lambda_sd);
  result.diagnostic_curve = build_density_curve(diagnostic_x_max, 80, [&](double x) { return evaluate_density(x); });
  const double sampled_density = evaluate_density(sampled_lambda);
  result.diagnostic_markers = {{sampled_lambda, 0.0}, {sampled_lambda, sampled_density}};

  const double theoretical_mean = latent_mean * req.horizon_t;
  const double theoretical_variance = latent_mean * req.horizon_t + latent_variance * req.horizon_t * req.horizon_t;

  result.summary_metrics = {
      {"Mean of N(T)", count_stats.mean, theoretical_mean},
      {"Variance of N(T)", count_stats.variance, theoretical_variance},
      {"Sampled latent rate", sampled_lambda, latent_mean},
      {"Overdispersion index", count_stats.variance / std::max(count_stats.mean, 1e-9),
       theoretical_variance / std::max(theoretical_mean, 1e-9)},
  };

  result.insights = {
      "Conditionally on Lambda, the path is an ordinary homogeneous Poisson process.",
      "After integrating out Lambda, the count law becomes negative binomial rather than Poisson.",
      "Variance exceeds the mean because latent heterogeneity adds a second source of randomness.",
  };

  result.extras["custom_profile"] = use_custom_profile ? 1.0 : 0.0;

  return result;
}

SimulationResult simulate_spatial_case(const SimulationRequest& req, const CasePreset& preset, std::mt19937& rng) {
  SimulationResult result;
  result.case_id = preset.id;
  result.family = preset.family;
  result.primary_mode = "scatter";
  result.histogram_mode = "discrete_pmf";
  result.diagnostic_mode = "discrete_pmf";
  const int spatial_dimension = req.spatial_dimension == 3 ? 3 : 2;
  const int total_cells = spatial_dimension == 3 ? kSpatialGridSide * kSpatialGridSide * kSpatialGridSide
                                                 : kSpatialGridSide * kSpatialGridSide;

  result.spatial_points = simulate_spatial_points(req.lambda, req.horizon_t, spatial_dimension, rng);

  result.trial_counts.reserve(static_cast<size_t>(req.trials));
  for (int trial = 0; trial < req.trials; ++trial) {
    result.trial_counts.push_back(sample_poisson_knuth(req.lambda * req.horizon_t, rng));
  }

  const auto count_stats = compute_stats(result.trial_counts);
  const auto cell_counts = simulate_spatial_cell_counts(req.lambda, req.horizon_t, spatial_dimension, req.trials, rng);
  const auto cell_stats = compute_stats(cell_counts);
  const double cell_mean = req.lambda * req.horizon_t / static_cast<double>(total_cells);
  result.histogram = build_discrete_histogram(cell_counts, cell_stats, [&](int k) { return poisson_pmf(k, cell_mean); });

  result.diagnostic_samples.assign(result.trial_counts.begin(), result.trial_counts.end());
  const int max_total_count = std::max(
      *std::max_element(result.trial_counts.begin(), result.trial_counts.end()),
      static_cast<int>(std::ceil(count_stats.mean + 6.0 * std::sqrt(std::max(count_stats.variance, 1.0)))) + 2);
  result.diagnostic_curve =
      build_discrete_curve(max_total_count, [&](int k) { return poisson_pmf(k, req.lambda * req.horizon_t); });

  const double empirical_intensity = result.spatial_points.empty() ? 0.0 : result.spatial_points.size() / req.horizon_t;
  const double window_side = spatial_dimension == 3 ? std::cbrt(req.horizon_t) : std::sqrt(req.horizon_t);
  const std::string window_label = spatial_dimension == 3 ? "Mean of N(W)" : "Mean of N(A)";
  const std::string variance_label = spatial_dimension == 3 ? "Variance of N(W)" : "Variance of N(A)";
  result.summary_metrics = {
      {window_label, count_stats.mean, req.lambda * req.horizon_t},
      {variance_label, count_stats.variance, req.lambda * req.horizon_t},
      {"Observed intensity", empirical_intensity, req.lambda},
      {"Mean cell occupancy", cell_stats.mean, cell_mean},
  };

  result.extras["window_side"] = window_side;
  result.extras["cell_mean"] = cell_mean;
  result.extras["spatial_dimension"] = static_cast<double>(spatial_dimension);

  result.insights = {
      spatial_dimension == 3 ? "The spatial process is now defined on a volume, so expected counts scale like lambda |W|."
                             : "The planar process is governed by area, not clock time: E[N(A)] = lambda |A|.",
      "Counts in disjoint cells are independent, which is why cell occupancies inherit a Poisson law.",
      "A single realization looks irregular, but repeated windows recover the same first and second moments.",
  };

  return result;
}
}  // namespace

int sample_poisson_knuth(double mu, std::mt19937& rng) {
  if (mu <= 0.0) {
    return 0;
  }

  const double limit = std::exp(-mu);
  int k = 0;
  double product = 1.0;
  std::uniform_real_distribution<double> unif(0.0, 1.0);

  do {
    ++k;
    product *= unif(rng);
  } while (product > limit);

  return k - 1;
}

SimulationResult run_simulation(const SimulationRequest& req) {
  const CasePreset preset = find_case_preset(req.case_id);
  validate_request(req, preset);

  std::random_device rd;
  std::mt19937 rng(rd());

  if (preset.id == "homogeneous") {
    return simulate_homogeneous_case(req, preset, rng);
  }
  if (preset.id == "nonhomogeneous") {
    return simulate_nonhomogeneous_case(req, preset, rng);
  }
  if (preset.id == "compound") {
    return simulate_compound_case(req, preset, rng);
  }
  if (preset.id == "mixed") {
    return simulate_mixed_case(req, preset, rng);
  }
  if (preset.id == "spatial") {
    return simulate_spatial_case(req, preset, rng);
  }

  throw std::invalid_argument("Unsupported case id: " + req.case_id);
}
