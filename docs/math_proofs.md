# 泊松过程数学证明与分析

本文给出课程展示所需的核心证明链条，记随机过程为 \(\{N(t), t \ge 0\}\)。

## 1. 定义与公理化条件

泊松过程（强度 \(\lambda > 0\)）满足：

1. \(N(0)=0\)；
2. 独立增量：任意不交区间上的增量独立；
3. 平稳增量：\(N(t+h)-N(t)\) 的分布只依赖于 \(h\)；
4. 小区间条件：
   - \(\mathbb{P}(N(h)=1)=\lambda h + o(h)\)
   - \(\mathbb{P}(N(h)\ge 2)=o(h)\)

这些条件唯一刻画了经典泊松过程。

## 2. \(P(N(t)=k)\) 的微分方程推导

记 \(p_k(t)=\mathbb{P}(N(t)=k)\)。考虑 \(t\to t+h\)：

- 对 \(k=0\)：
  \[
  p_0(t+h)=p_0(t)\big(1-\lambda h+o(h)\big)
  \]
  所以 \(p_0'(t)=-\lambda p_0(t)\)，且 \(p_0(0)=1\)，得
  \[
  p_0(t)=e^{-\lambda t}.
  \]

- 对 \(k\ge 1\)：
  \[
  p_k(t+h)=p_k(t)\big(1-\lambda h+o(h)\big)+p_{k-1}(t)\big(\lambda h+o(h)\big)+o(h),
  \]
  因而
  \[
  p_k'(t)=-\lambda p_k(t)+\lambda p_{k-1}(t),\quad p_k(0)=0.
  \]

由递推可得
\[
p_k(t)=e^{-\lambda t}\frac{(\lambda t)^k}{k!},\quad k=0,1,2,\dots
\]
即 \(N(t)\sim \text{Poisson}(\lambda t)\)。

## 3. 独立与平稳增量性质的分布表达

对任意 \(0\le s<t\)：
\[
N(t)-N(s)\sim\text{Poisson}\big(\lambda (t-s)\big).
\]

因此：
- 平稳增量：仅依赖长度 \(t-s\)；
- 独立增量：若区间不交，增量独立。

这为“分段计数可并行解释”提供理论基础。

## 4. 到达间隔服从指数分布

定义首达时间 \(T_1=\inf\{t>0:N(t)\ge 1\}\)。则
\[
\mathbb{P}(T_1>t)=\mathbb{P}(N(t)=0)=e^{-\lambda t},
\]
故
\[
T_1\sim \text{Exp}(\lambda).
\]

同理可得相邻间隔 \(X_i=T_i-T_{i-1}\) 相互独立且同分布 \(\text{Exp}(\lambda)\)。

这说明“指数间隔采样”与“泊松计数定义”是等价构造。

## 5. 无记忆性与条件解释

指数分布满足：
\[
\mathbb{P}(T_1>s+t\mid T_1>s)=\mathbb{P}(T_1>t).
\]

在系统解释上：过去等待时间不改变未来短时到达统计规律，这与泊松过程的“独立增量”一致。

## 6. 给定总数的条件分布

在条件 \(N(t)=n\) 下，\(n\) 个到达时刻的有序统计量与 \(n\) 个 i.i.d. \(U(0,t)\) 的次序统计量同分布。

直观上可理解为：固定总事件数后，事件在 \([0,t]\) 内“均匀散落”。

## 7. 矩性质与课堂检验指标

由 \(N(t)\sim\text{Poisson}(\lambda t)\) 得
\[
\mathbb{E}[N(t)] = \lambda t,\quad \mathrm{Var}(N(t))=\lambda t.
\]

课程可视化中的关键检验：
- 经验均值 \(\approx \lambda t\)；
- 经验方差 \(\approx \lambda t\)；
- 直方图与理论 PMF 拟合。

## 8. 适用边界与模型风险

泊松过程依赖：
- 事件“稀疏且近似独立”；
- 强度在观察窗内近似常数。

若出现明显聚簇、日内非平稳、互激励等现象，则可考虑：
- 非齐次泊松过程（\(\lambda(t)\)）；
- Hawkes 过程；
- 复合泊松或更新过程。
