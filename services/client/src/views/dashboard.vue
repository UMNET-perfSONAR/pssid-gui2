<template>
  <div>
    <PageHeader
      title="Overview"
      subtitle="How your configuration fits together, from tests to probes"
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

    <!-- Configuration anatomy: each block is its own card, laid out left to
         right in the order the config is assembled. Connectors are measured
         between the cards and drawn with right-angle segments only (never
         diagonal), so the flow reads like an official wayfinding diagram. -->
    <h3 class="anatomy-title">Configuration file anatomy</h3>
    <div class="anatomy-wrap">
      <div class="anatomy" ref="diagram">
        <svg class="anatomy-arrows" aria-hidden="true">
          <defs>
            <marker id="anatomy-arrowhead" viewBox="0 0 8 8" refX="7" refY="4"
                    markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
            </marker>
          </defs>
          <polyline
            v-for="(pts, i) in arrowPaths"
            :key="i"
            :points="pts"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            marker-end="url(#anatomy-arrowhead)"
          />
        </svg>

        <router-link to="/tests" class="stage" data-node="tests" style="grid-area: tests">
          <span class="material-icons stage-icon">science</span>
          <span class="stage-count">{{ count(testStore.tests) }}</span>
          <span class="stage-label">Tests</span>
        </router-link>

        <!-- The three things that combine into a batch, grouped in one box. -->
        <div class="box sources" data-node="sources" style="grid-area: sources">
          <router-link to="/jobs" class="stage" data-node="jobs">
            <span class="material-icons stage-icon">folder_copy</span>
            <span class="stage-count">{{ count(jobStore.jobs) }}</span>
            <span class="stage-label">Jobs</span>
          </router-link>
          <router-link to="/schedules" class="stage" data-node="schedules">
            <span class="material-icons stage-icon">schedule</span>
            <span class="stage-count">{{ count(scheduleStore.schedules) }}</span>
            <span class="stage-label">Schedules</span>
          </router-link>
          <router-link to="/ssid_profiles" class="stage" data-node="ssid">
            <span class="material-icons stage-icon">wifi</span>
            <span class="stage-count">{{ count(ssidStore.ssid_profiles) }}</span>
            <span class="stage-label">SSID Profiles</span>
          </router-link>
        </div>

        <router-link to="/batches" class="stage hero" data-node="batches" style="grid-area: batches">
          <span class="material-icons stage-icon">work_history</span>
          <span class="stage-count">{{ count(batchStore.batches) }}</span>
          <span class="stage-label">Batches</span>
        </router-link>

        <router-link to="/hosts" class="stage" data-node="hosts" style="grid-area: hosts">
          <span class="material-icons stage-icon">computer</span>
          <span class="stage-count">{{ count(hostStore.hosts) }}</span>
          <span class="stage-label">Hosts</span>
        </router-link>

        <router-link to="/host_groups" class="stage" data-node="groups" style="grid-area: groups">
          <span class="material-icons stage-icon">lan</span>
          <span class="stage-count">{{ count(groupStore.host_groups) }}</span>
          <span class="stage-label">Groups</span>
        </router-link>
      </div>
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

// The config relationships, as source -> target. "sources" is the grouped box
// holding jobs, schedules, and SSID profiles, which together form a batch.
const ARROWS = [
  { from: 'tests',   to: 'jobs' },     // tests are combined into jobs
  { from: 'sources', to: 'batches' },  // jobs + schedules + SSID profiles make a batch
  { from: 'batches', to: 'hosts' },    // a batch deploys to hosts...
  { from: 'batches', to: 'groups' },   // ...and to groups of hosts
];

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
      arrowPaths: [],
      resizeObserver: null,
    }
  },
  async mounted() {
    window.addEventListener('resize', this.measureArrows);
    if (typeof ResizeObserver !== 'undefined' && this.$refs.diagram) {
      this.resizeObserver = new ResizeObserver(this.measureArrows);
      this.resizeObserver.observe(this.$refs.diagram);
    }
    // Re-measure once the web font is in, since it changes the card sizes.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(this.measureArrows);
    }

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
    this.$nextTick(this.measureArrows);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.measureArrows);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  },
  methods: {
    count(a) {
      return Array.isArray(a) ? a.length : 0;
    },
    measureArrows() {
      const root = this.$refs.diagram;
      if (!root) return;
      const origin = root.getBoundingClientRect();
      const rectOf = (name) => {
        const el = root.querySelector(`[data-node="${name}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
      };
      const paths = [];
      for (const { from, to } of ARROWS) {
        const a = rectOf(from);
        const b = rectOf(to);
        if (!a || !b) continue;
        paths.push(this.orthPoints(a, b));
      }
      this.arrowPaths = paths;
    },
    // Right-angle connector from the right edge of `a` to the left edge of `b`.
    // Straight when the two are level; otherwise a single vertical jog placed
    // in the gap between the columns, so no segment is ever diagonal.
    orthPoints(a, b) {
      const ax = a.x + a.w;          // source right edge
      const ay = a.y + a.h / 2;      // source middle
      const bxEdge = b.x;            // target left edge
      const bx = b.x - 4;            // stop a hair short so the arrowhead has a gap
      const by = b.y + b.h / 2;      // target middle
      if (Math.abs(ay - by) < 1.5) {
        return `${ax},${ay} ${bx},${by}`;
      }
      const midx = (ax + bxEdge) / 2;
      return `${ax},${ay} ${midx},${ay} ${midx},${by} ${bx},${by}`;
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

/* ── Anatomy diagram ──────────────────────────────────────────── */
.anatomy-title {
  font-size: 0.72rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted) !important;
  margin: 0 0 0.75rem !important;
}
.anatomy-wrap {
  overflow-x: auto;
  margin-bottom: 2rem;
}
/* No outer panel: the individual white cards stand on the page, connected by
   the measured arrows. Blocks span two rows so the flow is vertically centred
   and Hosts / Groups fan out from Batches. */
.anatomy {
  position: relative;
  display: grid;
  grid-template-columns: max-content max-content max-content max-content;
  grid-template-areas:
    "tests sources batches hosts"
    "tests sources batches groups";
  gap: 1.5rem 3.75rem;
  align-items: center;
  width: max-content;
  min-width: 720px;
  margin: 0 auto;
  padding: 0.5rem 0.25rem;
}
.anatomy-arrows {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: var(--muted);
  pointer-events: none;
}

/* Shared white-box family: same border, radius and shadow everywhere, so the
   blocks read as one system even though their sizes differ. */
.box,
.stage {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

/* A leaf card: icon, then count, then what is being counted. */
.stage {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 0.9rem;
  text-decoration: none;
  transition: border-color .12s, box-shadow .12s;
}
a.stage:hover {
  border-color: rgba(var(--primary-rgb), .45);
  box-shadow: var(--shadow);
}
.stage.hero {
  border-width: 2px;
  border-color: rgba(var(--primary-rgb), .35);
  padding: 0.95rem 1rem;
}
.stage-icon { font-size: 1.3rem; color: var(--primary); flex-shrink: 0; }
.stage-count { font-size: 1.15rem; font-weight: 700; color: var(--text); line-height: 1; }
.stage-label { font-size: 0.86rem; font-weight: 600; color: var(--text); line-height: 1.25; white-space: nowrap; }
.stage.hero .stage-count { font-size: 1.4rem; }

/* The grouped box: three inputs stacked, sitting slightly recessed inside the
   white frame so the grouping is unmistakable. */
.sources {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.7rem;
}
.sources .stage {
  background: var(--bg);
  box-shadow: none;
}

:root[data-theme="dark"] .stage-icon { color: var(--accent); }
</style>
