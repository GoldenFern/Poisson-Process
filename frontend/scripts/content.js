export const CASE_CONTENT = {
  homogeneous: {
    badge: "Baseline",
    heading: "Homogeneous Poisson Process",
    note:
      "A constant intensity creates linear growth in the compensator and exponential waiting times between jumps.",
    labDescription:
      "Use this case as the reference model for stationary independent increments and the canonical Poisson count law.",
    primaryTitle: "Sample Path Vs Linear Compensator",
    distributionTitle: "Count Distribution on the Horizon",
    diagnosticTitle: "Inter-arrival Density",
    lambdaLabel: "Intensity lambda (events per unit time)",
    horizonLabel: "Horizon T",
    dtLabel: "Reference-grid dt",
    valueLabel: "events",
    sampleLabel: "Sample path N(t)",
    benchmarkLabel: "E[N(t)] = lambda t",
    primaryYAxis: "N(t)",
    distributionXLabel: "count k",
    distributionYLabel: "probability",
    diagnosticXLabel: "waiting time",
    diagnosticYLabel: "density",
    mathSnippet: `
      <p>The defining identities are \\(N(0)=0\\), independent stationary increments, and</p>
      <div class="formula-block">\\[
        N(t) \\sim \\operatorname{Poisson}(\\lambda t),
        \\qquad
        \\mathbb{P}(T_1 > t) = e^{-\\lambda t}.
      \\]</div>
    `,
  },
  nonhomogeneous: {
    badge: "Time-varying",
    heading: "Non-homogeneous Poisson Process",
    note:
      "The instantaneous intensity changes over the observation window, so the benchmark is the integrated intensity rather than a straight line.",
    labDescription:
      "This case highlights how a Poisson process can remain increment-independent while losing stationarity in calendar time.",
    primaryTitle: "Sample Path Vs Integrated Intensity",
    distributionTitle: "Terminal Count Law",
    diagnosticTitle: "Instantaneous Intensity lambda(t)",
    lambdaLabel: "Baseline intensity scale",
    horizonLabel: "Scheduling horizon T",
    dtLabel: "Compensator-grid dt",
    valueLabel: "events",
    sampleLabel: "Sample path N(t)",
    benchmarkLabel: "Compensator M(t)",
    primaryYAxis: "N(t)",
    distributionXLabel: "count k",
    distributionYLabel: "probability",
    diagnosticXLabel: "time t",
    diagnosticYLabel: "instantaneous intensity",
    mathSnippet: `
      <p>For a deterministic intensity profile \\(\\lambda(t)\\), the compensator is</p>
      <div class="formula-block">\\[
        M(t) = \\int_0^t \\lambda(s)\\,ds,
        \\qquad
        N(t) \\sim \\operatorname{Poisson}(M(t)).
      \\]</div>
    `,
  },
  compound: {
    badge: "Marked jumps",
    heading: "Compound Poisson Process",
    note:
      "Each arrival carries a positive random mark, so the observed signal is a jump-sum process rather than a pure event count.",
    labDescription:
      "This is the standard model for aggregate claims, burst sizes, packet payload totals, or cumulative loss processes.",
    primaryTitle: "Aggregate Jump Process S(t)",
    distributionTitle: "Distribution of Total Accumulated Signal",
    diagnosticTitle: "Jump-size Density",
    lambdaLabel: "Arrival intensity lambda",
    horizonLabel: "Aggregation horizon T",
    dtLabel: "Reference-grid dt",
    valueLabel: "total signal",
    sampleLabel: "Aggregate path S(t)",
    benchmarkLabel: "E[S(t)]",
    primaryYAxis: "S(t)",
    distributionXLabel: "total signal",
    distributionYLabel: "density",
    diagnosticXLabel: "jump size",
    diagnosticYLabel: "density",
    mathSnippet: `
      <p>The marked process is defined by</p>
      <div class="formula-block">\\[
        S(t) = \\sum_{i=1}^{N(t)} J_i,
        \\qquad
        \\mathbb{E}[S(t)] = \\lambda t\\,\\mathbb{E}[J],
        \\qquad
        \\operatorname{Var}(S(t)) = \\lambda t\\,\\mathbb{E}[J^2].
      \\]</div>
    `,
  },
  mixed: {
    badge: "Latent rate",
    heading: "Mixed Poisson Process",
    note:
      "A random latent intensity changes from realization to realization, producing count variance above the Poisson benchmark.",
    labDescription:
      "This case is useful whenever hidden environment states or subject heterogeneity create overdispersion.",
    primaryTitle: "Conditional Sample Path",
    distributionTitle: "Marginal Count Distribution",
    diagnosticTitle: "Mixing Density for the Latent Rate",
    lambdaLabel: "Mean latent intensity",
    horizonLabel: "Observation horizon T",
    dtLabel: "Reference-grid dt",
    valueLabel: "events",
    sampleLabel: "Conditional path N(t)",
    benchmarkLabel: "Conditional mean Lambda*t",
    primaryYAxis: "N(t)",
    distributionXLabel: "count k",
    distributionYLabel: "probability",
    diagnosticXLabel: "latent intensity",
    diagnosticYLabel: "density",
    mathSnippet: `
      <p>Conditionally on a latent rate \\(\\Lambda\\), the process is Poisson:</p>
      <div class="formula-block">\\[
        N(t)\\mid\\Lambda \\sim \\operatorname{Poisson}(\\Lambda t),
        \\qquad
        \\operatorname{Var}(N(T)) = \\mathbb{E}[\\Lambda]T + \\operatorname{Var}(\\Lambda)T^2.
      \\]</div>
    `,
  },
  spatial: {
    badge: "Planar field",
    heading: "Spatial Poisson Process",
    note:
      "The observation window is a region in the plane, so counts scale with area and disjoint cells inherit independent Poisson occupancies.",
    labDescription:
      "This is the planar counterpart of the temporal Poisson process and the starting point for stochastic geometry models.",
    primaryTitle: "Random Point Pattern on the Observation Window",
    distributionTitle: "Occupancy Law on Grid Cells",
    diagnosticTitle: "Total Count Distribution Across Windows",
    lambdaLabel: "Spatial intensity lambda (points per unit area)",
    horizonLabel: "Window area A",
    dtLabel: "Unused in this case",
    valueLabel: "points",
    sampleLabel: "Point pattern",
    benchmarkLabel: "",
    primaryYAxis: "window",
    distributionXLabel: "points per cell",
    distributionYLabel: "probability",
    diagnosticXLabel: "total count",
    diagnosticYLabel: "probability",
    mathSnippet: `
      <p>For any measurable region \\(B\\subseteq A\\), the count law is</p>
      <div class="formula-block">\\[
        N(B) \\sim \\operatorname{Poisson}(\\lambda |B|),
        \\qquad
        \\mathbb{E}[N(A)] = \\lambda |A|.
      \\]</div>
    `,
  },
};

export function buildBackgroundHtml() {
  return `
    <section class="math-section">
      <div class="section-tag">Definition</div>
      <h2>1. Classical Poisson Process</h2>
      <p>
        A counting process \\(\\{N(t), t \\ge 0\\}\\) is a homogeneous Poisson process with intensity
        \\(\\lambda > 0\\) if \\(N(0)=0\\), the increments over disjoint intervals are independent, the
        increment law is stationary, and the short-time asymptotics satisfy
      </p>
      <div class="formula-block">\\[
        \\mathbb{P}(N(t+h)-N(t)=1)=\\lambda h+o(h),
        \\qquad
        \\mathbb{P}(N(t+h)-N(t)\\ge 2)=o(h).
      \\]</div>
      <p>
        These axioms imply the exact finite-horizon law
      </p>
      <div class="formula-block">\\[
        N(t) \\sim \\operatorname{Poisson}(\\lambda t),
        \\qquad
        \\mathbb{P}(N(t)=k)=e^{-\\lambda t}\\frac{(\\lambda t)^k}{k!}.
      \\]</div>
      <p>
        The compensator is linear, so the benchmark path is
        \\(\\mathbb{E}[N(t)] = \\lambda t\\), and the variance matches the mean:
        \\(\\operatorname{Var}(N(t)) = \\lambda t\\).
      </p>
    </section>

    <section class="math-section">
      <div class="section-tag">Waiting Times</div>
      <h2>2. Exponential Inter-arrivals and Memorylessness</h2>
      <p>
        Let \\(T_1\\) be the first arrival time. Since \\(\\{T_1 > t\\} = \\{N(t)=0\\}\\), we obtain
      </p>
      <div class="formula-block">\\[
        \\mathbb{P}(T_1 > t)=e^{-\\lambda t},
        \\qquad
        T_1 \\sim \\operatorname{Exp}(\\lambda).
      \\]</div>
      <p>
        The same argument shows that successive gaps are i.i.d. exponential:
      </p>
      <div class="formula-block">\\[
        X_i = T_i - T_{i-1} \\stackrel{\\text{i.i.d.}}{\\sim} \\operatorname{Exp}(\\lambda).
      \\]</div>
      <p>
        Hence the homogeneous Poisson process can be generated either from count increments or from a renewal
        sequence of exponential waiting times.
      </p>
    </section>

    <section class="math-section">
      <div class="section-tag">Variant</div>
      <h2>3. Non-homogeneous Poisson Process</h2>
      <p>
        If the local intensity is a deterministic function \\(\\lambda(t)\\), the process remains increment-independent
        but ceases to be stationary in calendar time. The key object is the compensator
      </p>
      <div class="formula-block">\\[
        M(t)=\\int_0^t \\lambda(s)\\,ds.
      \\]</div>
      <p>
        The finite-horizon law becomes
      </p>
      <div class="formula-block">\\[
        N(t) \\sim \\operatorname{Poisson}(M(t)),
        \\qquad
        \\mathbb{E}[N(t)] = \\operatorname{Var}(N(t)) = M(t).
      \\]</div>
      <p>
        In the lab view, the benchmark curve is therefore \\(M(t)\\), not a straight line.
      </p>
    </section>

    <section class="math-section">
      <div class="section-tag">Variant</div>
      <h2>4. Compound Poisson Process</h2>
      <p>
        Suppose each arrival carries an i.i.d. mark \\(J_i\\), independent of \\(N(t)\\). The aggregate signal is
      </p>
      <div class="formula-block">\\[
        S(t)=\\sum_{i=1}^{N(t)} J_i.
      \\]</div>
      <p>
        Conditional on \\(N(t)=n\\), the sum is a classical random sum. After averaging over the Poisson count,
        the first two moments are
      </p>
      <div class="formula-block">\\[
        \\mathbb{E}[S(t)] = \\lambda t\\,\\mathbb{E}[J],
        \\qquad
        \\operatorname{Var}(S(t)) = \\lambda t\\,\\mathbb{E}[J^2].
      \\]</div>
      <p>
        This model is appropriate whenever arrivals occur randomly but each event contributes a random payload,
        severity, or exposure.
      </p>
    </section>

    <section class="math-section">
      <div class="section-tag">Variant</div>
      <h2>5. Mixed Poisson Process</h2>
      <p>
        A mixed Poisson process introduces a random latent intensity \\(\\Lambda\\). Conditionally on \\(\\Lambda\\),
        the process is homogeneous Poisson:
      </p>
      <div class="formula-block">\\[
        N(t)\\mid\\Lambda \\sim \\operatorname{Poisson}(\\Lambda t).
      \\]</div>
      <p>
        If \\(\\Lambda\\sim\\operatorname{Gamma}(\\alpha,\\theta)\\) with shape \\(\\alpha\\) and scale \\(\\theta\\),
        then the horizon count has a negative-binomial law:
      </p>
      <div class="formula-block">\\[
        \\mathbb{P}(N(T)=n)
        =
        \\frac{\\Gamma(n+\\alpha)}{\\Gamma(\\alpha)\\,n!}
        \\left(\\frac{\\theta T}{1+\\theta T}\\right)^n
        \\left(\\frac{1}{1+\\theta T}\\right)^\\alpha.
      \\]</div>
      <p>
        The additional heterogeneity inflates variance:
      </p>
      <div class="formula-block">\\[
        \\operatorname{Var}(N(T))
        =
        \\mathbb{E}[\\Lambda]T + \\operatorname{Var}(\\Lambda)T^2
        >
        \\mathbb{E}[\\Lambda]T.
      \\]</div>
    </section>

    <section class="math-section">
      <div class="section-tag">Variant</div>
      <h2>6. Spatial Poisson Process</h2>
      <p>
        On a measurable planar region \\(A\\), a homogeneous spatial Poisson process with intensity \\(\\lambda\\)
        assigns to each measurable subset \\(B \\subseteq A\\) an independent Poisson count
      </p>
      <div class="formula-block">\\[
        N(B) \\sim \\operatorname{Poisson}(\\lambda |B|).
      \\]</div>
      <p>
        Therefore the expected total count and the cell occupancy law scale with area:
      </p>
      <div class="formula-block">\\[
        \\mathbb{E}[N(A)] = \\lambda |A|,
        \\qquad
        \\operatorname{Var}(N(A)) = \\lambda |A|.
      \\]</div>
      <p>
        This is the stochastic-geometry analogue of the temporal model, with area replacing elapsed time.
      </p>
    </section>

    <section class="math-section">
      <div class="section-tag">Structure</div>
      <h2>7. Why These Variants Matter</h2>
      <p>
        The five laboratory cases isolate distinct modeling assumptions:
      </p>
      <ul class="math-list">
        <li><strong>Homogeneous:</strong> constant intensity, stationary increments, exponential gaps.</li>
        <li><strong>Non-homogeneous:</strong> deterministic intensity profile \\(\\lambda(t)\\), non-stationary clock-time behavior.</li>
        <li><strong>Compound:</strong> random marks attached to Poisson arrivals, creating aggregate jump amplitudes.</li>
        <li><strong>Mixed:</strong> latent random intensity, producing overdispersion and negative-binomial horizon counts.</li>
        <li><strong>Spatial:</strong> independent Poisson counts across disjoint planar regions.</li>
      </ul>
      <p>
        Together they form a compact but mathematically coherent map of the most common Poisson-process generalizations used
        in applied probability, stochastic geometry, queueing, insurance, and event-driven systems.
      </p>
    </section>
  `;
}
