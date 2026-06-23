<template>
  <div>
    <PageHeader
      title="Overview"
      subtitle="Configuration summary, system status, and recent activity"
      icon="dashboard"
    />

    <!-- Status strip -->
    <div class="status-strip">
      <div class="status-pill" :class="healthOk ? 'ok' : 'bad'">
        <span class="material-icons">{{ healthOk ? 'check_circle' : 'error' }}</span>
        <div>
          <div class="status-label">System</div>
          <div class="status-value">{{ healthOk ? 'Healthy' : 'Unavailable' }}</div>
        </div>
      </div>
      <div class="status-pill" :class="settingsStore.autoProvision ? 'on' : 'off'">
        <span class="material-icons">{{ settingsStore.autoProvision ? 'bolt' : 'pause_circle' }}</span>
        <div>
          <div class="status-label">Auto-provision</div>
          <div class="status-value">{{ settingsStore.autoProvision ? 'On' : 'Off' }}</div>
        </div>
      </div>
      <div class="status-pill neutral">
        <span class="material-icons">history</span>
        <div>
          <div class="status-label">Last provision</div>
          <div class="status-value">{{ lastProvisionLabel }}</div>
        </div>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="stat-grid">
      <router-link v-for="s in stats" :key="s.to" :to="s.to" class="stat-card">
        <span class="material-icons stat-icon">{{ s.icon }}</span>
        <div class="stat-count">{{ s.count }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </router-link>
    </div>

    <!-- Fleet health teaser -->
    <router-link to="/fleet-health" class="terrain-teaser">
      <span class="material-icons">monitor_heart</span>
      <div class="teaser-text">
        <div class="teaser-title">Fleet Health</div>
        <div class="teaser-sub">Every probe ranked worst-first, see at a glance which hosts need attention.</div>
      </div>
      <span class="material-icons teaser-arrow">arrow_forward</span>
    </router-link>

    <!-- Recent activity -->
    <section class="recent">
      <div class="recent-head">
        <h3>Recent provisioning</h3>
        <router-link to="/history" class="recent-link">View all →</router-link>
      </div>
      <div v-if="historyStore.isLoading" class="loading-state">
        <div class="spinner"></div><span>Loading…</span>
      </div>
      <div v-else-if="recent.length === 0" class="recent-empty">
        No provisioning events yet.
      </div>
      <table v-else class="table table-sm table-hover">
        <thead>
          <tr><th>Time</th><th>Target</th><th>Trigger</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in recent" :key="i">
            <td style="white-space:nowrap; font-size:0.82rem;">{{ formatTime(row.timestamp) }}</td>
            <td><code style="background:none; color:inherit; font-size:0.82rem;">{{ row.target_name }}</code></td>
            <td style="font-size:0.82rem;">{{ triggerLabel(row) }}</td>
            <td>
              <span v-if="row.success" class="badge badge-success">Success</span>
              <span v-else class="badge badge-danger" :title="row.error">Failed</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script>
import PageHeader from '../components/PageHeader.vue'
import config from '../shared/config'
import { useHostStore } from '../stores/host_store'
import { useGroupStore } from '../stores/groups_stores'
import { useScheduleStore } from '../stores/schedule_store'
import { useSsidStore } from '../stores/ssid_profiles_stores'
import { useTestStore } from '../stores/test_store'
import { useJobStore } from '../stores/job_store'
import { useBatchStore } from '../stores/batches.store'
import { useProvisionHistoryStore } from '../stores/provision_history.store'
import { useSettingsStore } from '../stores/settings.store'

export default {
  name: 'Dashboard',
  components: { PageHeader },
  data() {
    return {
      hostStore: useHostStore(),
      groupStore: useGroupStore(),
      scheduleStore: useScheduleStore(),
      ssidStore: useSsidStore(),
      testStore: useTestStore(),
      jobStore: useJobStore(),
      batchStore: useBatchStore(),
      historyStore: useProvisionHistoryStore(),
      settingsStore: useSettingsStore(),
      healthOk: false,
    }
  },
  computed: {
    stats() {
      const len = (a) => (Array.isArray(a) ? a.length : 0);
      return [
        { label: 'Hosts',         icon: 'computer',     to: '/hosts',         count: len(this.hostStore.hosts) },
        { label: 'Groups',        icon: 'lan',          to: '/host_groups',   count: len(this.groupStore.host_groups) },
        { label: 'Schedules',     icon: 'schedule',     to: '/schedules',     count: len(this.scheduleStore.schedules) },
        { label: 'SSID Profiles', icon: 'wifi',         to: '/ssid_profiles', count: len(this.ssidStore.ssid_profiles) },
        { label: 'Tests',         icon: 'science',      to: '/tests',         count: len(this.testStore.tests) },
        { label: 'Jobs',          icon: 'work_history', to: '/jobs',          count: len(this.jobStore.jobs) },
        { label: 'Batches',       icon: 'layers',       to: '/batches',       count: len(this.batchStore.batches) },
      ];
    },
    recent() {
      return Array.isArray(this.historyStore.history) ? this.historyStore.history.slice(0, 5) : [];
    },
    lastProvisionLabel() {
      const last = this.recent[0];
      return last ? this.formatTime(last.timestamp) : '-';
    }
  },
  async mounted() {
    // Load everything in parallel; failures in any one store don't block the rest.
    await Promise.allSettled([
      this.hostStore.getHosts(),
      this.groupStore.getGroups(),
      this.scheduleStore.getSchedules(),
      this.ssidStore.getSsidProfiles(),
      this.testStore.getTests(),
      this.jobStore.getJobs(),
      this.batchStore.getBatches(),
      this.historyStore.getHistory(),
      this.settingsStore.getSettings(),
      this.checkHealth(),
    ]);
  },
  methods: {
    async checkHealth() {
      try {
        const res = await fetch('/api/health', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.healthOk = res.ok && data.status === 'ok';
      } catch {
        this.healthOk = false;
      }
    },
    formatTime(ts) {
      if (!ts) return '-';
      return new Date(ts).toLocaleString();
    },
    triggerLabel(row) {
      const t = row.trigger || (row.click_context === 'auto' ? 'auto' : 'manual');
      return t === 'auto' ? 'Auto' : 'Manual';
    }
  }
}
</script>

<style scoped>
.status-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.status-pill {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
  box-shadow: var(--shadow-sm);
}
.status-pill .material-icons { font-size: 1.6rem; }
.status-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; }
.status-value { font-size: 1rem; font-weight: 600; color: var(--text); }
.status-pill.ok      { border-left-color: #16a34a; } .status-pill.ok .material-icons { color: #16a34a; }
.status-pill.bad     { border-left-color: #dc2626; } .status-pill.bad .material-icons { color: #dc2626; }
.status-pill.on      { border-left-color: var(--accent); } .status-pill.on .material-icons { color: var(--accent); }
.status-pill.off     { border-left-color: #94a3b8; } .status-pill.off .material-icons { color: #94a3b8; }
.status-pill.neutral { border-left-color: var(--primary); } .status-pill.neutral .material-icons { color: var(--primary); }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.25rem;
  text-decoration: none;
  transition: transform .12s, box-shadow .12s, border-color .12s;
  display: block;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: rgba(var(--primary-rgb), .35);
}
.stat-icon { font-size: 1.5rem; color: var(--primary); }
.stat-count { font-size: 1.9rem; font-weight: 700; color: var(--text); line-height: 1.1; margin-top: 0.35rem; }
.stat-label { font-size: 0.82rem; color: var(--muted); font-weight: 600; }

.terrain-teaser {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: linear-gradient(135deg, rgba(var(--primary-rgb), .10), rgba(var(--accent-rgb), .08));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  text-decoration: none;
  transition: transform .12s, box-shadow .12s, border-color .12s;
}
.terrain-teaser:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: rgba(var(--primary-rgb), .4);
}
.terrain-teaser > .material-icons { font-size: 2rem; color: var(--primary); }
.teaser-text { flex: 1; }
.teaser-title { font-weight: 700; color: var(--text); font-size: 1rem; }
.teaser-sub { font-size: .82rem; color: var(--muted); }
.teaser-arrow { color: var(--primary); }

.recent {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.25rem 1.35rem;
}
.recent-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
.recent-head h3 {
  font-size: 0.72rem !important; font-weight: 700 !important; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--muted) !important; margin: 0 !important;
}
.recent-link { font-size: 0.8rem; color: var(--primary); text-decoration: none; font-weight: 600; }
.recent-empty { color: var(--muted); font-size: 0.85rem; padding: 0.5rem 0; }
</style>
