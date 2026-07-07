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

    <!-- Configuration anatomy: the layout mirrors the pSSID config file
         diagram. Cards are placed on a grid and the arrows are drawn between
         their measured edges, so they follow the cards at any size. -->
    <h3 class="anatomy-title">Configuration file anatomy</h3>
    <div class="anatomy-wrap">
      <div class="anatomy" ref="diagram">
        <svg class="anatomy-arrows" aria-hidden="true">
          <defs>
            <marker id="anatomy-arrowhead" viewBox="0 0 8 8" refX="8" refY="4"
                    markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
            </marker>
          </defs>
          <line
            v-for="(l, i) in arrowLines"
            :key="i"
            :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
            stroke="currentColor" stroke-width="1.5"
            marker-end="url(#anatomy-arrowhead)"
          />
        </svg>

        <router-link to="/hosts" class="node" data-node="hosts" style="grid-area: hosts">
          <span class="material-icons node-icon">computer</span>
          <div>
            <div class="node-label">Hosts</div>
            <div class="node-sub">{{ count(hostStore.hosts) }}</div>
          </div>
        </router-link>

        <router-link to="/host_groups" class="node" data-node="groups" style="grid-area: groups">
          <span class="material-icons node-icon">lan</span>
          <div>
            <div class="node-label">Groups</div>
            <div class="node-sub">{{ count(groupStore.host_groups) }}</div>
          </div>
        </router-link>

        <router-link to="/batches" class="node hero" data-node="batches" style="grid-area: batches">
          <span class="material-icons node-icon">work_history</span>
          <div>
            <div class="node-label">Batches</div>
            <div class="node-sub">{{ count(batchStore.batches) }}</div>
          </div>
        </router-link>

        <router-link to="/ssid_profiles" class="node" data-node="ssid" style="grid-area: ssid">
          <span class="material-icons node-icon">wifi</span>
          <div>
            <div class="node-label">SSID Profiles</div>
            <div class="node-sub">{{ count(ssidStore.ssid_profiles) }}</div>
          </div>
        </router-link>

        <router-link to="/schedules" class="node" data-node="schedules" style="grid-area: schedules">
          <span class="material-icons node-icon">schedule</span>
          <div>
            <div class="node-label">Schedules</div>
            <div class="node-sub">{{ count(scheduleStore.schedules) }}</div>
          </div>
        </router-link>

        <router-link to="/jobs" class="node" data-node="jobs" style="grid-area: jobs">
          <span class="material-icons node-icon">folder_copy</span>
          <div>
            <div class="node-label">Jobs</div>
            <div class="node-sub">{{ count(jobStore.jobs) }}</div>
          </div>
        </router-link>

        <router-link to="/tests" class="node" data-node="tests" style="grid-area: tests">
          <span class="material-icons node-icon">science</span>
          <div>
            <div class="node-label">Tests</div>
            <div class="node-sub">{{ count(testStore.tests) }}</div>
          </div>
        </router-link>

        <div class="node static" data-node="templates" style="grid-area: templates">
          <span class="material-icons node-icon">description</span>
          <div>
            <div class="node-label">pScheduler test templates</div>
            <div class="node-sub">{{ count(testStore.listOfOptions) }} installed</div>
          </div>
        </div>
      </div>
    </div>
    <p class="anatomy-caption">
      Arrows show what feeds into what: templates define tests, tests combine
      into jobs, and jobs join SSID profiles and schedules in a batch. Batches
      are assigned to hosts, directly or through groups.
    </p>
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

// The relationships in the config file, as source -> target arrows.
const ARROWS = [
  { from: 'ssid',      to: 'batches' },
  { from: 'schedules', to: 'batches' },
  { from: 'jobs',      to: 'batches' },
  { from: 'tests',     to: 'jobs' },
  { from: 'templates', to: 'tests' },
  { from: 'batches',   to: 'hosts' },
  { from: 'batches',   to: 'groups' },
  { from: 'hosts',     to: 'groups' },
];

// Point on a card's border along the line from its centre towards (tx, ty),
// pushed out by a small gap so arrows don't touch the border.
function borderPoint(rect, tx, ty, gap = 4) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const sx = dx !== 0 ? (rect.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (rect.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy) + gap / len;
  return [cx + dx * s, cy + dy * s];
}

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
      arrowLines: [],
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
      this.testStore.getTestNames(),
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
      const lines = [];
      for (const { from, to } of ARROWS) {
        const a = rectOf(from);
        const b = rectOf(to);
        if (!a || !b) continue;
        const [x1, y1] = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
        const [x2, y2] = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
        lines.push({ x1, y1, x2, y2 });
      }
      this.arrowLines = lines;
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
}
.anatomy {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.1fr 1.1fr;
  grid-template-areas:
    "hosts    .         ssid"
    ".        batches   schedules"
    "groups   batches   jobs"
    ".        .         tests"
    ".        templates templates";
  gap: 1.5rem 4rem;
  align-items: center;
  min-width: 640px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.75rem;
}
.anatomy-arrows {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: var(--muted);
  pointer-events: none;
}
.anatomy-caption {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.5;
  margin: 0.75rem 0 2rem;
  max-width: 78ch;
}

.node {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.85rem;
  text-decoration: none;
  transition: border-color .12s, box-shadow .12s;
}
a.node:hover {
  border-color: rgba(var(--primary-rgb), .4);
  box-shadow: var(--shadow-sm);
}
.node.hero {
  border-width: 2px;
  border-color: rgba(var(--primary-rgb), .35);
  padding: 1rem 0.95rem;
}
.node.static {
  border-style: dashed;
  justify-self: center;
  min-width: 60%;
}
.node-icon { font-size: 1.3rem; color: var(--primary); flex-shrink: 0; }
.node.static .node-icon { color: var(--muted); }
.node-label { font-size: 0.86rem; font-weight: 600; color: var(--text); line-height: 1.25; }
.node-sub { font-size: 0.72rem; color: var(--muted); }

:root[data-theme="dark"] .node-icon { color: var(--accent); }
:root[data-theme="dark"] .node.static .node-icon { color: var(--muted); }
</style>
