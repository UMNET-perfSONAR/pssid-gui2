<template>
  <div>
    <PageHeader
      title="Fleet Health"
      subtitle="Every probe ranked worst-first, what needs attention, from real provisioning data"
      icon="monitor_heart"
    />

    <!-- Summary strip -->
    <div class="fh-strip">
      <div class="fh-stat">
        <span class="material-icons" style="color: var(--primary);">device_hub</span>
        <div>
          <div class="fh-label">Probes</div>
          <div class="fh-value">{{ probes.length }}</div>
        </div>
      </div>
      <div class="fh-stat">
        <span class="material-icons" style="color:#16a34a;">check_circle</span>
        <div>
          <div class="fh-label">Healthy</div>
          <div class="fh-value">{{ counts.healthy }}</div>
        </div>
      </div>
      <div class="fh-stat">
        <span class="material-icons" style="color:#d97706;">warning</span>
        <div>
          <div class="fh-label">Degraded</div>
          <div class="fh-value">{{ counts.degraded }}</div>
        </div>
      </div>
      <div class="fh-stat fh-stat-alert">
        <span class="material-icons" style="color:#dc2626;">error</span>
        <div>
          <div class="fh-label">Needs attention</div>
          <div class="fh-value">{{ counts.critical }}</div>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div><span>Loading fleet…</span>
    </div>

    <div v-else-if="probes.length === 0" class="list-empty-state">
      <span class="material-icons list-empty-icon">monitor_heart</span>
      <p style="font-weight:600; margin-bottom:.35rem;">No probes to rank yet</p>
      <p style="font-size:.8rem; color:var(--muted); max-width:360px; margin:0 auto;">
        Add hosts and run provisioning, each probe will appear here, ranked by health.
      </p>
    </div>

    <div v-else>
      <!-- filter row -->
      <div class="fh-controls">
        <div class="fh-filter">
          <button
            v-for="f in filters" :key="f.key"
            class="fh-chip" :class="{ active: filter === f.key }"
            @click="filter = f.key"
          >{{ f.label }} <span class="fh-chip-count">{{ f.count }}</span></button>
        </div>
        <input
          v-model.trim="search"
          class="form-control fh-search"
          type="text"
          placeholder="Filter by host name…"
        />
      </div>

      <div class="table-responsive">
        <table class="table table-sm table-hover fh-table">
          <thead>
            <tr>
              <th style="width:42px;"></th>
              <th>Host</th>
              <th class="fh-sortable" @click="setSort('health')">
                Health <span class="material-icons fh-sort-ic">{{ sortIc('health') }}</span>
              </th>
              <th class="fh-sortable" @click="setSort('successPct')">
                Success rate <span class="material-icons fh-sort-ic">{{ sortIc('successPct') }}</span>
              </th>
              <th>Last provision</th>
              <th class="fh-sortable" @click="setSort('lastTs')">
                Last seen <span class="material-icons fh-sort-ic">{{ sortIc('lastTs') }}</span>
              </th>
              <th>Config</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in visibleProbes" :key="p.name" :class="rowClass(p)">
              <td>
                <span class="fh-dot" :style="{ background: scoreColor(p.health) }"
                  :title="statusLabel(p.health)"></span>
              </td>
              <td>
                <router-link to="/hosts" class="fh-host">{{ p.name }}</router-link>
              </td>
              <td>
                <div class="fh-health">
                  <div class="fh-bar">
                    <div class="fh-bar-fill"
                      :style="{ width: p.health + '%', background: scoreColor(p.health) }"></div>
                  </div>
                  <span class="fh-health-num">{{ p.health }}</span>
                </div>
              </td>
              <td>
                <span v-if="p.total">{{ p.successPct }}%
                  <span class="fh-sub">({{ p.ok }}/{{ p.total }})</span>
                </span>
                <span v-else class="fh-sub">no events</span>
              </td>
              <td>
                <span v-if="p.lastStatus === 'success'" class="badge badge-success">Success</span>
                <span v-else-if="p.lastStatus === 'failed'" class="badge badge-danger"
                  :title="p.lastError">Failed</span>
                <span v-else class="fh-sub">-</span>
              </td>
              <td :class="{ 'fh-stale': p.stale }" style="white-space:nowrap;">
                {{ p.lastSeen }}
              </td>
              <td>
                <span class="fh-config" :title="p.configDetail">
                  <span class="material-icons" :style="{ color: p.hasBatches ? '#16a34a' : '#cbd5e1' }">layers</span>
                  <span class="material-icons" :style="{ color: p.hasData ? '#16a34a' : '#cbd5e1' }">data_object</span>
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-outline-primary fh-provision"
                  @click="provision(p)" :disabled="provisioning === p.name">
                  {{ provisioning === p.name ? '…' : 'Provision' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="fh-note">
        Health blends <strong>provisioning success rate</strong> (60%),
        <strong>recency</strong> of the last event (25%), and
        <strong>config completeness</strong> (15%), computed from the last 100 provisioning events.
        Probes with no events yet sit at a neutral baseline until their first run.
      </p>
    </div>
  </div>
</template>

<script>
import PageHeader from '../components/PageHeader.vue'
import { useHostStore } from '../stores/host_store'
import { useProvisionHistoryStore } from '../stores/provision_history.store'

const STALE_DAYS = 3

export default {
  name: 'FleetHealth',
  components: { PageHeader },
  data() {
    return {
      hostStore: useHostStore(),
      historyStore: useProvisionHistoryStore(),
      isLoading: true,
      filter: 'all',
      search: '',
      sortKey: 'health',
      sortDir: 1,           // 1 = ascending (worst first by default for health)
      provisioning: null,
    }
  },

  computed: {
    /** Per-host health derived entirely from store data (no mock values). */
    probes() {
      const hosts = Array.isArray(this.hostStore.hosts)
        ? this.hostStore.hosts.filter(h => h && h.name)
        : []
      const history = Array.isArray(this.historyStore.history) ? this.historyStore.history : []

      const byTarget = {}
      for (const ev of history) {
        if (!ev.target_name) continue
        ;(byTarget[ev.target_name] ||= []).push(ev)
      }

      const now = Date.now()
      return hosts.map(h => {
        const evs = (byTarget[h.name] || [])
          .slice()
          .sort((a, b) => this.ts(b.timestamp) - this.ts(a.timestamp))
        const total = evs.length
        const ok = evs.filter(e => e.success).length
        const successRate = total ? ok / total : null

        const lastTs = evs.length ? this.ts(evs[0].timestamp) : 0
        const ageDays = lastTs ? (now - lastTs) / 86400000 : null
        const recency = ageDays == null ? null : Math.exp(-ageDays / 7)

        const hasBatches = Array.isArray(h.batches) && h.batches.length > 0
        const hasData = h.data && Object.keys(h.data).length > 0
        const completeness = (hasBatches ? 0.6 : 0) + (hasData ? 0.4 : 0)

        const s = successRate == null ? 0.5 : successRate
        const r = recency == null ? 0.5 : recency
        const health = Math.max(0, Math.min(100,
          Math.round((0.60 * s + 0.25 * r + 0.15 * completeness) * 100)))

        const last = evs[0]
        return {
          name: h.name,
          health,
          successPct: total ? Math.round(successRate * 100) : 0,
          ok, total,
          lastTs,
          lastSeen: lastTs ? this.relTime(now - lastTs) : 'never',
          stale: lastTs ? (now - lastTs) / 86400000 > STALE_DAYS : false,
          lastStatus: last ? (last.success ? 'success' : 'failed') : 'none',
          lastError: last && !last.success ? (last.error || 'Provisioning failed') : '',
          hasBatches, hasData,
          configDetail: `${hasBatches ? 'Has batches' : 'No batches'} · ${hasData ? 'Has data' : 'No optional data'}`,
        }
      })
    },

    counts() {
      let healthy = 0, degraded = 0, critical = 0
      for (const p of this.probes) {
        if (p.health >= 75) healthy++
        else if (p.health >= 50) degraded++
        else critical++
      }
      return { healthy, degraded, critical }
    },

    filters() {
      return [
        { key: 'all',      label: 'All',             count: this.probes.length },
        { key: 'critical', label: 'Needs attention', count: this.counts.critical },
        { key: 'degraded', label: 'Degraded',        count: this.counts.degraded },
        { key: 'healthy',  label: 'Healthy',         count: this.counts.healthy },
      ]
    },

    visibleProbes() {
      let list = this.probes.slice()

      if (this.filter === 'healthy')  list = list.filter(p => p.health >= 75)
      if (this.filter === 'degraded') list = list.filter(p => p.health >= 50 && p.health < 75)
      if (this.filter === 'critical') list = list.filter(p => p.health < 50)

      if (this.search) {
        const q = this.search.toLowerCase()
        list = list.filter(p => p.name.toLowerCase().includes(q))
      }

      const k = this.sortKey, d = this.sortDir
      list.sort((a, b) => {
        const av = a[k], bv = b[k]
        if (av === bv) return a.name.localeCompare(b.name)
        return (av < bv ? -1 : 1) * d
      })
      return list
    },
  },

  async mounted() {
    await Promise.allSettled([
      this.hostStore.getHosts(),
      this.historyStore.getHistory(),
    ])
    this.isLoading = false
  },

  methods: {
    ts(v) { return v ? new Date(v).getTime() : 0 },

    setSort(key) {
      if (this.sortKey === key) { this.sortDir *= -1 }
      else { this.sortKey = key; this.sortDir = 1 }   // ascending = worst first
    },
    sortIc(key) {
      if (this.sortKey !== key) return 'unfold_more'
      return this.sortDir === 1 ? 'arrow_drop_up' : 'arrow_drop_down'
    },

    scoreColor(h) {
      if (h >= 75) return '#16a34a'
      if (h >= 50) return '#d97706'
      return '#dc2626'
    },
    statusLabel(h) {
      if (h >= 75) return 'Healthy'
      if (h >= 50) return 'Degraded'
      return 'Needs attention'
    },
    rowClass(p) { return p.health < 50 ? 'fh-row-critical' : '' },

    async provision(p) {
      this.provisioning = p.name
      try {
        // host_store.createConfig expects the host object; pass the matching host
        const host = (this.hostStore.hosts || []).find(h => h && h.name === p.name)
        await this.hostStore.createConfig(host || { name: p.name, batches: [], data: {} })
        await this.historyStore.getHistory()
      } finally {
        this.provisioning = null
      }
    },

    relTime(ms) {
      const s = ms / 1000
      if (s < 90) return 'just now'
      const m = s / 60
      if (m < 90) return `${Math.round(m)}m ago`
      const h = m / 60
      if (h < 36) return `${Math.round(h)}h ago`
      return `${Math.round(h / 24)}d ago`
    },
  },
}
</script>

<style scoped>
.fh-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.fh-stat {
  display: flex; align-items: center; gap: .75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .8rem 1rem;
  box-shadow: var(--shadow-sm);
}
.fh-stat .material-icons { font-size: 1.6rem; }
.fh-stat-alert { border-left: 4px solid #dc2626; }
.fh-label { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; }
.fh-value { font-size: 1.35rem; font-weight: 700; color: var(--text); line-height: 1.1; }

.fh-controls {
  display: flex; flex-wrap: wrap; gap: .75rem;
  align-items: center; justify-content: space-between;
  margin-bottom: .85rem;
}
.fh-filter { display: flex; flex-wrap: wrap; gap: .4rem; }
.fh-chip {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 20px;
  padding: .25rem .8rem;
  font-size: .8rem; font-weight: 600;
  cursor: pointer; transition: all .12s;
}
.fh-chip:hover { border-color: rgba(var(--primary-rgb), .5); }
.fh-chip.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.fh-chip-count {
  display: inline-block; margin-left: .3rem;
  font-size: .72rem; opacity: .75;
}
.fh-search { max-width: 240px; }

.fh-table th { font-size: .74rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
.fh-sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.fh-sort-ic { font-size: 1rem; vertical-align: middle; opacity: .6; }
.fh-table td { vertical-align: middle; font-size: .86rem; }
.fh-host { color: var(--primary); text-decoration: none; font-weight: 600; }
.fh-host:hover { text-decoration: underline; }
.fh-sub { color: var(--muted); font-size: .78rem; }
.fh-stale { color: #dc2626; font-weight: 600; }
.fh-row-critical { background: rgba(220, 38, 38, .05); }

.fh-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }

.fh-health { display: flex; align-items: center; gap: .5rem; }
.fh-bar { width: 70px; height: 7px; border-radius: 4px; background: var(--border); overflow: hidden; }
.fh-bar-fill { height: 100%; border-radius: 4px; transition: width .3s; }
.fh-health-num { font-weight: 700; font-size: .82rem; min-width: 22px; }

.fh-config { display: inline-flex; gap: .15rem; }
.fh-config .material-icons { font-size: 1.15rem; }
.fh-provision { white-space: nowrap; }

.fh-note { margin-top: 1rem; font-size: .8rem; color: var(--muted); }
</style>
