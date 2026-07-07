<template>
  <div>
    <PageHeader
      title="Overview"
      subtitle="How your configuration fits together, from test templates to probes"
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

    <!-- Configuration pipeline: mirrors the anatomy of the generated config
         file. Building blocks combine into batches; batches run on hosts,
         individually or through groups. -->
    <div class="pipeline">
      <section class="pipeline-stage">
        <h3 class="stage-title">Building blocks</h3>

        <div class="flow-card static">
          <span class="material-icons flow-icon">description</span>
          <div class="flow-text">
            <div class="flow-label">Test templates</div>
            <div class="flow-sub">{{ templateCount }} installed</div>
          </div>
        </div>
        <div class="flow-connector"><span class="material-icons">arrow_downward</span></div>

        <router-link to="/tests" class="flow-card">
          <span class="material-icons flow-icon">science</span>
          <div class="flow-text">
            <div class="flow-label">Tests</div>
            <div class="flow-sub">{{ count(testStore.tests) }} defined</div>
          </div>
        </router-link>
        <div class="flow-connector"><span class="material-icons">arrow_downward</span></div>

        <router-link to="/jobs" class="flow-card">
          <span class="material-icons flow-icon">folder_copy</span>
          <div class="flow-text">
            <div class="flow-label">Jobs</div>
            <div class="flow-sub">{{ count(jobStore.jobs) }} defined</div>
          </div>
        </router-link>

        <div class="stage-divider"></div>

        <router-link to="/ssid_profiles" class="flow-card">
          <span class="material-icons flow-icon">wifi</span>
          <div class="flow-text">
            <div class="flow-label">SSID Profiles</div>
            <div class="flow-sub">{{ count(ssidStore.ssid_profiles) }} defined</div>
          </div>
        </router-link>

        <router-link to="/schedules" class="flow-card">
          <span class="material-icons flow-icon">schedule</span>
          <div class="flow-text">
            <div class="flow-label">Schedules</div>
            <div class="flow-sub">{{ count(scheduleStore.schedules) }} defined</div>
          </div>
        </router-link>
      </section>

      <div class="stage-connector"><span class="material-icons">chevron_right</span></div>

      <section class="pipeline-stage center">
        <h3 class="stage-title">Assembled into</h3>
        <router-link to="/batches" class="flow-card hero">
          <span class="material-icons flow-icon">work_history</span>
          <div class="flow-text">
            <div class="flow-label">Batches</div>
            <div class="flow-sub">{{ count(batchStore.batches) }} defined</div>
          </div>
        </router-link>
        <p class="stage-note">
          A batch pairs jobs with SSID profiles and schedules, plus a priority
          and test interface. Batches are what run on the probes.
        </p>
      </section>

      <div class="stage-connector"><span class="material-icons">chevron_right</span></div>

      <section class="pipeline-stage">
        <h3 class="stage-title">Deployed to</h3>

        <router-link to="/hosts" class="flow-card">
          <span class="material-icons flow-icon">computer</span>
          <div class="flow-text">
            <div class="flow-label">Hosts</div>
            <div class="flow-sub">{{ count(hostStore.hosts) }} probes</div>
          </div>
        </router-link>
        <div class="flow-connector"><span class="material-icons">arrow_downward</span></div>

        <router-link to="/host_groups" class="flow-card">
          <span class="material-icons flow-icon">lan</span>
          <div class="flow-text">
            <div class="flow-label">Groups</div>
            <div class="flow-sub">{{ count(groupStore.host_groups) }} defined</div>
          </div>
        </router-link>
        <p class="stage-note">
          Batches are assigned to hosts directly or to whole groups; groups
          collect hosts by name or pattern.
        </p>
      </section>
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
    templateCount() {
      return this.count(this.testStore.listOfOptions);
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
      this.testStore.getTestNames(),
      this.jobStore.getJobs(),
      this.batchStore.getBatches(),
      this.settingsStore.getSettings(),
      this.checkHealth(),
    ]);
  },
  methods: {
    count(a) {
      return Array.isArray(a) ? a.length : 0;
    },
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

/* ── Pipeline ─────────────────────────────────────────────────── */
.pipeline {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  gap: 0.75rem;
  align-items: stretch;
  margin-bottom: 2rem;
}
.pipeline-stage {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
}
.pipeline-stage.center {
  justify-content: center;
}
.stage-title {
  font-size: 0.72rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted) !important;
  margin: 0 0 0.875rem !important;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}
.stage-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.stage-connector .material-icons { font-size: 1.6rem; }
.stage-divider {
  border-top: 1px dashed var(--border);
  margin: 0.9rem 0;
}
.stage-note {
  font-size: 0.76rem;
  color: var(--muted);
  line-height: 1.5;
  margin: 0.9rem 0 0;
}

.flow-card {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.85rem;
  text-decoration: none;
  transition: border-color .12s, box-shadow .12s;
}
.flow-card + .flow-card { margin-top: 0.6rem; }
a.flow-card:hover {
  border-color: rgba(var(--primary-rgb), .4);
  box-shadow: var(--shadow-sm);
}
.flow-card.static {
  border-style: dashed;
}
.flow-card.hero {
  padding: 1.05rem 0.95rem;
  border-width: 2px;
  border-color: rgba(var(--primary-rgb), .3);
}
.flow-icon { font-size: 1.35rem; color: var(--primary); flex-shrink: 0; }
.flow-card.static .flow-icon { color: var(--muted); }
.flow-text { min-width: 0; }
.flow-label { font-size: 0.88rem; font-weight: 600; color: var(--text); line-height: 1.25; }
.flow-sub { font-size: 0.74rem; color: var(--muted); }
.flow-connector {
  display: flex;
  justify-content: center;
  color: var(--muted);
  margin: 0.15rem 0;
}
.flow-connector .material-icons { font-size: 1.05rem; }

:root[data-theme="dark"] .flow-icon { color: var(--accent); }
:root[data-theme="dark"] .flow-card.static .flow-icon { color: var(--muted); }

/* Stack the pipeline vertically on narrow screens; the connectors point down. */
@media (max-width: 900px) {
  .pipeline {
    grid-template-columns: 1fr;
  }
  .stage-connector .material-icons {
    transform: rotate(90deg);
  }
}
</style>
