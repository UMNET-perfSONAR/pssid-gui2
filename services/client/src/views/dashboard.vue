<template>
  <div>
    <PageHeader
      title="Overview"
      subtitle="Configuration summary and system status"
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
    </div>

    <!-- Stat cards -->
    <div class="stat-grid">
      <router-link v-for="s in stats" :key="s.to" :to="s.to" class="stat-card">
        <span class="material-icons stat-icon">{{ s.icon }}</span>
        <div class="stat-count">{{ s.count }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </router-link>
    </div>
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
        { label: 'Jobs',          icon: 'work',         to: '/jobs',          count: len(this.jobStore.jobs) },
        { label: 'Batches',       icon: 'inventory_2',  to: '/batches',       count: len(this.batchStore.batches) },
      ];
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
</style>
