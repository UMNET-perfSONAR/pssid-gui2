<template>
  <div>
    <PageHeader
      title="Fleet Intelligence"
      subtitle="Predictive failure-risk, anomaly detection, and trend forecasting, computed locally from provisioning history"
      icon="insights"
    />

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div><span>Analyzing fleet…</span>
    </div>

    <div v-else-if="report.hosts.length === 0" class="list-empty-state">
      <span class="material-icons list-empty-icon">insights</span>
      <p style="font-weight:600; margin-bottom:.35rem;">Not enough data to analyze yet</p>
      <p style="font-size:.8rem; color:var(--muted); max-width:380px; margin:0 auto;">
        Run provisioning a few times, once events accumulate, this page predicts
        which probes are likely to fail and flags anomalies automatically.
      </p>
    </div>

    <template v-else>
      <!-- Insights feed -->
      <section class="fi-insights">
        <div v-for="(ins, i) in report.insights" :key="i" class="fi-insight" :class="ins.severity">
          <span class="material-icons">{{ ins.icon }}</span>
          <div>
            <div class="fi-insight-title">{{ ins.title }}</div>
            <div class="fi-insight-detail">{{ ins.detail }}</div>
          </div>
        </div>
      </section>

      <div class="fi-grid">
        <!-- Trend forecast -->
        <section class="fi-card">
          <h4>Fleet success-rate trend</h4>
          <div class="fi-trend-head">
            <span class="fi-trend-now">{{ latestRatePct }}%</span>
            <span class="fi-trend-dir" :class="report.trend.direction">
              <span class="material-icons">{{ trendIcon }}</span>
              {{ report.trend.direction }}
            </span>
          </div>
          <svg class="fi-spark" viewBox="0 0 320 90" preserveAspectRatio="none" v-if="sparkPath">
            <polyline :points="sparkArea" :fill="sparkFill" stroke="none" />
            <polyline :points="sparkPath" fill="none" :stroke="sparkColor" stroke-width="2" />
            <!-- forecast point -->
            <circle :cx="forecastPt.x" :cy="forecastPt.y" r="3.5" :fill="sparkColor" />
            <line :x1="lastPt.x" :y1="lastPt.y" :x2="forecastPt.x" :y2="forecastPt.y"
              :stroke="sparkColor" stroke-width="1.5" stroke-dasharray="3 3" />
          </svg>
          <div class="fi-trend-foot">
            <span>Forecast next period:
              <strong :style="{ color: sparkColor }">{{ Math.round(report.trend.forecast * 100) }}%</strong>
            </span>
            <span class="fi-sub">{{ report.trend.series.length }} day buckets</span>
          </div>
        </section>

        <!-- Risk distribution -->
        <section class="fi-card">
          <h4>Risk distribution</h4>
          <div class="fi-dist">
            <div class="fi-dist-row">
              <span class="fi-dot critical"></span> Critical
              <span class="fi-dist-bar"><i :style="{ width: pct(bands.critical) }" class="critical"></i></span>
              <strong>{{ bands.critical }}</strong>
            </div>
            <div class="fi-dist-row">
              <span class="fi-dot elevated"></span> Elevated
              <span class="fi-dist-bar"><i :style="{ width: pct(bands.elevated) }" class="elevated"></i></span>
              <strong>{{ bands.elevated }}</strong>
            </div>
            <div class="fi-dist-row">
              <span class="fi-dot stable"></span> Stable
              <span class="fi-dist-bar"><i :style="{ width: pct(bands.stable) }" class="stable"></i></span>
              <strong>{{ bands.stable }}</strong>
            </div>
          </div>
          <div class="fi-anom" v-if="anomalyCount">
            <span class="material-icons">warning_amber</span>
            {{ anomalyCount }} probe{{ anomalyCount > 1 ? 's' : '' }} drifting from baseline
          </div>
        </section>
      </div>

      <!-- Risk-ranked hosts -->
      <section class="fi-card">
        <h4>Probes ranked by predicted failure risk</h4>
        <div class="table-responsive">
          <table class="table table-sm table-hover">
            <thead>
              <tr>
                <th>Probe</th>
                <th>Failure risk</th>
                <th>Signal</th>
                <th>History</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in report.hosts" :key="h.name">
                <td>
                  <router-link to="/hosts" class="fi-host">{{ h.name }}</router-link>
                </td>
                <td>
                  <div class="fi-risk">
                    <div class="fi-risk-bar">
                      <div class="fi-risk-fill" :class="h.band" :style="{ width: h.risk + '%' }"></div>
                    </div>
                    <span class="fi-risk-num" :class="h.band">{{ h.risk }}</span>
                  </div>
                </td>
                <td>
                  <span v-if="h.currentStreak >= 2" class="fi-tag bad" :title="'Consecutive failures'">
                    {{ h.currentStreak }}× streak
                  </span>
                  <span v-if="h.isAnomalous && h.anomalyZ > 0" class="fi-tag warn" title="Deviating from baseline">
                    {{ h.anomalyZ.toFixed(1) }}σ drift
                  </span>
                  <span v-if="h.currentStreak < 2 && !(h.isAnomalous && h.anomalyZ > 0)" class="fi-sub">-</span>
                </td>
                <td class="fi-sub" style="white-space:nowrap;">
                  {{ h.failures }}/{{ h.total }} failed
                </td>
                <td>
                  <code v-if="h.topError" class="fi-err" :title="h.topError">{{ h.topError }}</code>
                  <span v-else class="fi-sub">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p class="fi-method">
        <span class="material-icons">functions</span>
        Risk blends an <strong>EWMA</strong> of recent failures, current failure streak,
        a <strong>rolling z-score</strong> against each probe's own baseline (anomaly drift),
        and recency. Trend is a least-squares fit over daily success rate with a one-period
        linear forecast. All computed in your browser from provisioning history, no external
        calls, no data leaves the GUI.
      </p>
    </template>
  </div>
</template>

<script>
import PageHeader from '../components/PageHeader.vue'
import { useProvisionHistoryStore } from '../stores/provision_history.store'
import { analyzeFleet } from '../fleet_intelligence'

export default {
  name: 'FleetIntelligence',
  components: { PageHeader },
  data() {
    return {
      store: useProvisionHistoryStore(),
      isLoading: true,
      report: { hosts: [], trend: { series: [], slopePerDay: 0, forecast: 1, direction: 'flat' }, insights: [] },
    }
  },
  computed: {
    isDark() {
      return document.documentElement.getAttribute('data-theme') === 'dark'
    },
    bands() {
      const b = { critical: 0, elevated: 0, stable: 0 }
      for (const h of this.report.hosts) b[h.band]++
      return b
    },
    anomalyCount() {
      return this.report.hosts.filter(h => h.isAnomalous && h.anomalyZ > 0).length
    },
    latestRatePct() {
      const s = this.report.trend.series
      return s.length ? Math.round(s[s.length - 1].rate * 100) : 100
    },
    trendIcon() {
      const d = this.report.trend.direction
      return d === 'improving' ? 'trending_up' : d === 'declining' ? 'trending_down' : 'trending_flat'
    },
    sparkColor() {
      const d = this.report.trend.direction
      return d === 'declining' ? '#dc2626' : d === 'improving' ? '#16a34a' : '#0ea5e9'
    },
    sparkFill() {
      const d = this.report.trend.direction
      return d === 'declining' ? 'rgba(220,38,38,.10)' : d === 'improving' ? 'rgba(22,163,74,.10)' : 'rgba(14,165,233,.10)'
    },
    // sparkline geometry, map series rate [0,1] into a 320×90 box
    sparkPts() {
      const s = this.report.trend.series
      if (s.length < 2) return []
      const W = 320, H = 90, pad = 6
      const n = s.length
      return s.map((p, i) => ({
        x: pad + (i / (n - 1)) * (W - pad * 2),
        y: H - pad - p.rate * (H - pad * 2),
      }))
    },
    sparkPath() {
      return this.sparkPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    },
    sparkArea() {
      const pts = this.sparkPts
      if (!pts.length) return ''
      const H = 90, pad = 6
      const first = pts[0], last = pts[pts.length - 1]
      return `${first.x},${H - pad} ${this.sparkPath} ${last.x},${H - pad}`
    },
    lastPt() {
      const pts = this.sparkPts
      return pts.length ? pts[pts.length - 1] : { x: 0, y: 0 }
    },
    forecastPt() {
      const H = 90, pad = 6, W = 320
      const last = this.lastPt
      return {
        x: Math.min(W - pad, last.x + (W - pad * 2) / Math.max(1, this.report.trend.series.length - 1)),
        y: H - pad - this.report.trend.forecast * (H - pad * 2),
      }
    },
  },
  async mounted() {
    await this.store.getHistory()
    const events = Array.isArray(this.store.history) ? this.store.history : []
    this.report = analyzeFleet(events)
    this.isLoading = false
  },
  methods: {
    pct(n) {
      const total = this.report.hosts.length || 1
      return Math.round((n / total) * 100) + '%'
    },
  },
}
</script>

<style scoped>
.fi-insights { display: grid; gap: .7rem; margin-bottom: 1.25rem; }
.fi-insight {
  display: flex; align-items: flex-start; gap: .8rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: .8rem 1rem;
}
.fi-insight .material-icons { font-size: 1.5rem; margin-top: .1rem; }
.fi-insight-title { font-weight: 700; color: var(--text); }
.fi-insight-detail { font-size: .85rem; color: var(--muted); margin-top: .1rem; }
.fi-insight.critical { border-left-color: #dc2626; } .fi-insight.critical .material-icons { color: #dc2626; }
.fi-insight.warning  { border-left-color: #d97706; } .fi-insight.warning .material-icons { color: #d97706; }
.fi-insight.good     { border-left-color: #16a34a; } .fi-insight.good .material-icons { color: #16a34a; }
.fi-insight.info     { border-left-color: var(--primary); } .fi-insight.info .material-icons { color: var(--primary); }

.fi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}
.fi-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
}
.fi-card h4 {
  font-size: .72rem !important; font-weight: 700 !important; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted) !important; margin: 0 0 .75rem !important;
}

.fi-trend-head { display: flex; align-items: baseline; justify-content: space-between; }
.fi-trend-now { font-size: 1.9rem; font-weight: 700; color: var(--text); }
.fi-trend-dir { display: inline-flex; align-items: center; gap: .2rem; font-size: .82rem; font-weight: 600; text-transform: capitalize; }
.fi-trend-dir .material-icons { font-size: 1.1rem; }
.fi-trend-dir.declining { color: #dc2626; }
.fi-trend-dir.improving { color: #16a34a; }
.fi-trend-dir.flat { color: var(--muted); }
.fi-spark { width: 100%; height: 90px; display: block; margin: .5rem 0; }
.fi-trend-foot { display: flex; justify-content: space-between; align-items: baseline; font-size: .85rem; color: var(--text); }

.fi-dist { display: grid; gap: .55rem; }
.fi-dist-row { display: grid; grid-template-columns: 14px 70px 1fr 28px; align-items: center; gap: .5rem; font-size: .85rem; color: var(--text); }
.fi-dot { width: 12px; height: 12px; border-radius: 50%; }
.fi-dot.critical, .fi-risk-fill.critical, .fi-dist-bar i.critical { background: #dc2626; }
.fi-dot.elevated, .fi-risk-fill.elevated, .fi-dist-bar i.elevated { background: #d97706; }
.fi-dot.stable,   .fi-risk-fill.stable,   .fi-dist-bar i.stable   { background: #16a34a; }
.fi-dist-bar { height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; }
.fi-dist-bar i { display: block; height: 100%; border-radius: 4px; }
.fi-anom { margin-top: .8rem; display: flex; align-items: center; gap: .4rem; font-size: .82rem; color: #d97706; font-weight: 600; }
.fi-anom .material-icons { font-size: 1.1rem; }

.fi-host { color: var(--primary); text-decoration: none; font-weight: 600; }
.fi-host:hover { text-decoration: underline; }
.fi-risk { display: flex; align-items: center; gap: .5rem; }
.fi-risk-bar { width: 90px; height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; }
.fi-risk-fill { height: 100%; border-radius: 4px; transition: width .3s; }
.fi-risk-num { font-weight: 700; min-width: 24px; }
.fi-risk-num.critical { color: #dc2626; }
.fi-risk-num.elevated { color: #d97706; }
.fi-risk-num.stable { color: #16a34a; }
.fi-tag { display: inline-block; font-size: .72rem; font-weight: 700; padding: .1rem .45rem; border-radius: 10px; margin-right: .3rem; }
.fi-tag.bad { background: rgba(220,38,38,.12); color: #dc2626; }
.fi-tag.warn { background: rgba(217,119,6,.12); color: #d97706; }
.fi-sub { color: var(--muted); font-size: .8rem; }
.fi-err { background: rgba(220,38,38,.08); color: #dc2626; font-size: .78rem; padding: .05rem .35rem; border-radius: 4px; max-width: 180px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }

.fi-method { display: flex; gap: .5rem; font-size: .8rem; color: var(--muted); margin-top: 1rem; }
.fi-method .material-icons { font-size: 1.1rem; flex-shrink: 0; }
</style>
