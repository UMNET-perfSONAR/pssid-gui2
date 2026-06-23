/**
 * Fleet Intelligence — client-side analytics over pSSID provisioning history.
 *
 * Pure functions, no framework and no network. Everything here is computed from
 * the provision_history records the GUI already loads, so it runs entirely
 * offline and costs nothing. The goal is to turn a flat event log into
 * forward-looking signal: which probes are drifting from their own baseline,
 * which are most likely to fail next, and where the fleet is trending.
 *
 * Record shape (from /api/provision-history):
 *   { target_name, timestamp, success, error?, trigger?, click_context? }
 */

export interface ProvisionEvent {
  target_name?: string;
  timestamp?: string | number | Date;
  success?: boolean;
  error?: string;
  trigger?: string;
  click_context?: string;
}

export interface HostRisk {
  name: string;
  /** 0–100 probability-style score that the next provision fails. */
  risk: number;
  /** 'critical' | 'elevated' | 'stable' */
  band: RiskBand;
  total: number;
  failures: number;
  /** failure rate over the host's full history, 0–1 */
  failureRate: number;
  /** consecutive failures ending at the most recent event */
  currentStreak: number;
  /** EWMA of the failure indicator (recent-weighted), 0–1 */
  ewma: number;
  /** rolling z-score of recent window vs. the host baseline */
  anomalyZ: number;
  /** true when the recent window deviates significantly from baseline */
  isAnomalous: boolean;
  lastTs: number;
  lastSuccess: boolean | null;
  topError: string | null;
}

export type RiskBand = 'critical' | 'elevated' | 'stable';

export interface FleetTrend {
  /** chronological buckets of success rate, oldest first */
  series: { t: number; rate: number; total: number }[];
  /** slope of success rate per day (negative = degrading) */
  slopePerDay: number;
  /** projected success rate one bucket ahead, 0–1 */
  forecast: number;
  /** 'improving' | 'declining' | 'flat' */
  direction: 'improving' | 'declining' | 'flat';
}

export interface Insight {
  severity: 'critical' | 'warning' | 'info' | 'good';
  icon: string;
  title: string;
  detail: string;
}

export interface FleetReport {
  hosts: HostRisk[];
  trend: FleetTrend;
  insights: Insight[];
  generatedAt: number;
}

// ── tunables ──────────────────────────────────────────────
const EWMA_ALPHA = 0.4;        // weight on the most recent event
const RECENT_WINDOW = 5;       // events in the "recent" window for anomaly test
const ANOMALY_Z = 2.0;         // z-score threshold to flag drift
const RECENCY_HALF_LIFE_DAYS = 7;

const toMs = (v: ProvisionEvent['timestamp']): number =>
  v ? new Date(v as any).getTime() || 0 : 0;

/** Group events by host, each sorted oldest → newest. */
export function groupByHost(events: ProvisionEvent[]): Map<string, ProvisionEvent[]> {
  const map = new Map<string, ProvisionEvent[]>();
  for (const e of events) {
    if (!e || !e.target_name) continue;
    const arr = map.get(e.target_name) || [];
    arr.push(e);
    map.set(e.target_name, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
  return map;
}

/**
 * EWMA of the failure indicator (1 = fail, 0 = success), oldest → newest.
 * Recent events dominate, so a host that just started failing rises quickly.
 */
export function ewmaFailure(events: ProvisionEvent[], alpha = EWMA_ALPHA): number {
  if (!events.length) return 0;
  let s = events[0].success ? 0 : 1;
  for (let i = 1; i < events.length; i++) {
    const x = events[i].success ? 0 : 1;
    s = alpha * x + (1 - alpha) * s;
  }
  return s;
}

/** Consecutive failures ending at the most recent event. */
export function currentFailStreak(events: ProvisionEvent[]): number {
  let n = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].success) break;
    n++;
  }
  return n;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function std(xs: number[], m = mean(xs)): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Rolling z-score: how far the recent window's failure rate sits from the
 * host's own historical per-event baseline. Detects a probe drifting away from
 * how it normally behaves, independent of the absolute rate.
 */
export function anomalyScore(events: ProvisionEvent[], window = RECENT_WINDOW): number {
  if (events.length < window + 2) return 0;
  const indicators = events.map(e => (e.success ? 0 : 1));
  const baseline = indicators.slice(0, -window);
  const recent = indicators.slice(-window);
  const bMean = mean(baseline);
  const bStd = std(baseline, bMean);
  if (bStd === 0) {
    // baseline was perfectly stable; any change in the recent window is notable
    return mean(recent) === bMean ? 0 : (mean(recent) > bMean ? ANOMALY_Z + 1 : -(ANOMALY_Z + 1));
  }
  return (mean(recent) - bMean) / bStd;
}

/** Exponential recency weight in [0,1]; 1 = just now, decays with age. */
function recencyWeight(lastTs: number, now: number): number {
  if (!lastTs) return 0.5;
  const ageDays = (now - lastTs) / 86400000;
  return Math.exp(-(Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
}

function bandFor(risk: number): RiskBand {
  if (risk >= 66) return 'critical';
  if (risk >= 33) return 'elevated';
  return 'stable';
}

/**
 * Per-host failure-risk score (0–100). A blend of:
 *   - EWMA failure level (recent-weighted behaviour)        45%
 *   - current failure streak, saturating                    25%
 *   - positive anomaly drift (getting worse than baseline)  20%
 *   - low recency penalty (stale probe = uncertain)         10%
 */
export function scoreHost(name: string, events: ProvisionEvent[], now = Date.now()): HostRisk {
  const total = events.length;
  const failures = events.filter(e => !e.success).length;
  const failureRate = total ? failures / total : 0;
  const ewma = ewmaFailure(events);
  const streak = currentFailStreak(events);
  const z = anomalyScore(events);
  const last = events[total - 1];
  const lastTs = last ? toMs(last.timestamp) : 0;
  const rec = recencyWeight(lastTs, now);

  const streakTerm = 1 - Math.exp(-streak / 2);          // 0,1→.39,3→.78,…
  const driftTerm = Math.max(0, Math.min(1, z / (ANOMALY_Z * 2))); // only upward drift hurts
  const stalenessTerm = 1 - rec;                          // stale → uncertain → mild risk

  let risk =
    0.45 * ewma +
    0.25 * streakTerm +
    0.20 * driftTerm +
    0.10 * stalenessTerm;

  // a host with no events at all is unknown, not safe
  if (total === 0) risk = 0.4;

  const risk100 = Math.round(Math.max(0, Math.min(1, risk)) * 100);

  return {
    name,
    risk: risk100,
    band: bandFor(risk100),
    total,
    failures,
    failureRate,
    currentStreak: streak,
    ewma,
    anomalyZ: z,
    isAnomalous: Math.abs(z) >= ANOMALY_Z,
    lastTs,
    lastSuccess: last ? !!last.success : null,
    topError: mostCommonError(events),
  };
}

function mostCommonError(events: ProvisionEvent[]): string | null {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.success && e.error) counts.set(e.error, (counts.get(e.error) || 0) + 1);
  }
  let top: string | null = null;
  let max = 0;
  for (const [err, n] of counts) if (n > max) { max = n; top = err; }
  return top;
}

/**
 * Fleet-wide success-rate trend, bucketed by day, with a least-squares slope
 * and a one-bucket-ahead linear forecast.
 */
export function fleetTrend(events: ProvisionEvent[], bucketMs = 86400000): FleetTrend {
  const dated = events.filter(e => toMs(e.timestamp) > 0);
  if (dated.length === 0) {
    return { series: [], slopePerDay: 0, forecast: 1, direction: 'flat' };
  }
  const buckets = new Map<number, { ok: number; total: number }>();
  for (const e of dated) {
    const key = Math.floor(toMs(e.timestamp) / bucketMs);
    const b = buckets.get(key) || { ok: 0, total: 0 };
    b.total++;
    if (e.success) b.ok++;
    buckets.set(key, b);
  }
  const series = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, b]) => ({ t: key * bucketMs, rate: b.ok / b.total, total: b.total }));

  // least-squares slope of rate vs bucket index
  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map(s => s.rate);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  const forecast = Math.max(0, Math.min(1, (ys[n - 1] ?? 1) + slope));

  const direction = slope > 0.02 ? 'improving' : slope < -0.02 ? 'declining' : 'flat';
  return { series, slopePerDay: slope, forecast, direction };
}

/** Auto-generated, plain-language insights — the narrative layer, zero tokens. */
export function buildInsights(hosts: HostRisk[], trend: FleetTrend): Insight[] {
  const out: Insight[] = [];
  const critical = hosts.filter(h => h.band === 'critical');
  const anomalies = hosts.filter(h => h.isAnomalous && h.anomalyZ > 0);

  if (critical.length) {
    const names = critical.slice(0, 3).map(h => h.name).join(', ');
    out.push({
      severity: 'critical',
      icon: 'priority_high',
      title: `${critical.length} probe${critical.length > 1 ? 's' : ''} at high failure risk`,
      detail: `${names}${critical.length > 3 ? ` +${critical.length - 3} more` : ''} — predicted to fail the next provision. Investigate before the next run.`,
    });
  }

  for (const h of anomalies.slice(0, 2)) {
    out.push({
      severity: 'warning',
      icon: 'show_chart',
      title: `${h.name} is drifting from its baseline`,
      detail: `Recent provisions deviate ${h.anomalyZ.toFixed(1)}σ above this probe's normal failure rate${h.topError ? ` ("${h.topError}")` : ''}.`,
    });
  }

  if (trend.direction === 'declining') {
    const pct = Math.round(Math.abs(trend.slopePerDay) * 100);
    out.push({
      severity: 'warning',
      icon: 'trending_down',
      title: 'Fleet success rate is trending down',
      detail: `Down ~${pct}% per day; next-period forecast ${Math.round(trend.forecast * 100)}% success.`,
    });
  } else if (trend.direction === 'improving') {
    out.push({
      severity: 'good',
      icon: 'trending_up',
      title: 'Fleet success rate is recovering',
      detail: `Trending up; next-period forecast ${Math.round(trend.forecast * 100)}% success.`,
    });
  }

  if (out.length === 0) {
    out.push({
      severity: 'good',
      icon: 'verified',
      title: 'Fleet is stable',
      detail: 'No probes flagged for elevated failure risk and no baseline drift detected.',
    });
  }
  return out;
}

/** Top-level entry: turn raw events into a full report. */
export function analyzeFleet(events: ProvisionEvent[], now = Date.now()): FleetReport {
  const grouped = groupByHost(events);
  const hosts = [...grouped.entries()]
    .map(([name, evs]) => scoreHost(name, evs, now))
    .sort((a, b) => b.risk - a.risk);
  const trend = fleetTrend(events);
  const insights = buildInsights(hosts, trend);
  return { hosts, trend, insights, generatedAt: now };
}
