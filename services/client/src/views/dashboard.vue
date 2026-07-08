<template>
  <div>
    <PageHeader
      title="Overview"
      subtitle="How your configuration fits together, all the way to your probes"
      icon="dashboard"
    />

    <!-- Status strip: each pill explains itself on hover. When the system is
         unhealthy the explanation is shown persistently underneath instead, so
         a problem is never hidden behind a hover. -->
    <div class="status-strip">
      <div class="status-cell">
        <div class="status-pill has-hint" :class="healthOk ? 'ok' : 'bad'" tabindex="0">
          <span class="material-icons">{{ healthOk ? 'check_circle' : 'error' }}</span>
          <div>
            <div class="status-label">System</div>
            <div class="status-value">{{ healthOk ? 'Healthy' : 'Unavailable' }}</div>
          </div>
          <span v-if="healthOk" class="hint" role="tooltip">
            The app is connected to its server and database, so everything you save here is
            stored successfully.
          </span>
        </div>
        <p v-if="!healthOk" class="status-note">
          The app can't reach its server or database right now, so changes you make may not be
          saved. Make sure the containers are running, then reload the page.
        </p>
      </div>

      <div class="status-cell">
        <div class="status-pill has-hint" :class="settingsStore.autoProvision ? 'on' : 'off'" tabindex="0">
          <span class="material-icons">{{ settingsStore.autoProvision ? 'bolt' : 'pause_circle' }}</span>
          <div>
            <div class="status-label">Auto-provision</div>
            <div class="status-value">{{ settingsStore.autoProvision ? 'On' : 'Off' }}</div>
          </div>
          <span class="hint" role="tooltip">
            <template v-if="settingsStore.autoProvision">
              On: every change you make to the configuration is pushed to the probes
              automatically, so you don't need to configure them by hand.
            </template>
            <template v-else>
              Off: your changes are saved here but not pushed to the probes yet. Open a host
              and use Configure to send them when you're ready.
            </template>
          </span>
        </div>
      </div>
    </div>

    <!-- Configuration anatomy: each block is its own card, laid out left to
         right in the order the config is assembled. Each card names the block
         and the exact key it becomes in pssid_config.json. Connectors are
         measured between the cards and drawn with right-angle segments only
         (never diagonal), so the flow reads like an official wayfinding
         diagram. -->
    <h3 class="anatomy-title">Configuration file anatomy</h3>
    <div class="anatomy-wrap">
      <div class="anatomy" ref="diagram">
        <svg class="anatomy-arrows" aria-hidden="true">
          <defs>
            <marker id="anatomy-arrowhead" viewBox="0 0 8 8" refX="7" refY="4"
                    markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
            </marker>
          </defs>
          <polyline
            v-for="(pts, i) in arrowPaths"
            :key="i"
            :points="pts"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
            stroke-linejoin="round"
            marker-end="url(#anatomy-arrowhead)"
          />
        </svg>

        <router-link to="/tests" class="stage" data-node="tests" style="grid-area: tests">
          <span class="material-icons stage-icon">science</span>
          <span class="stage-text">
            <span class="stage-title">Tests</span>
            <span class="stage-type">tests</span>
          </span>
        </router-link>

        <!-- The three things that combine into a batch, grouped in one box. -->
        <div class="box sources" data-node="sources" style="grid-area: sources">
          <router-link to="/jobs" class="stage" data-node="jobs">
            <span class="material-icons stage-icon">folder_copy</span>
            <span class="stage-text">
              <span class="stage-title">Jobs</span>
              <span class="stage-type">jobs</span>
            </span>
          </router-link>
          <router-link to="/schedules" class="stage" data-node="schedules">
            <span class="material-icons stage-icon">schedule</span>
            <span class="stage-text">
              <span class="stage-title">Schedules</span>
              <span class="stage-type">schedules</span>
            </span>
          </router-link>
          <router-link to="/ssid_profiles" class="stage" data-node="ssid">
            <span class="material-icons stage-icon">wifi</span>
            <span class="stage-text">
              <span class="stage-title">SSID Profiles</span>
              <span class="stage-type">ssid_profiles</span>
            </span>
          </router-link>
        </div>

        <router-link to="/batches" class="stage hero" data-node="batches" style="grid-area: batches">
          <span class="material-icons stage-icon">work_history</span>
          <span class="stage-text">
            <span class="stage-title">Batches</span>
            <span class="stage-type">batches</span>
          </span>
        </router-link>

        <router-link to="/hosts" class="stage" data-node="hosts" style="grid-area: hosts">
          <span class="material-icons stage-icon">computer</span>
          <span class="stage-text">
            <span class="stage-title">Hosts</span>
            <span class="stage-type">hosts</span>
          </span>
        </router-link>

        <router-link to="/host_groups" class="stage" data-node="groups" style="grid-area: groups">
          <span class="material-icons stage-icon">lan</span>
          <span class="stage-text">
            <span class="stage-title">Groups</span>
            <span class="stage-type">host_groups</span>
          </span>
        </router-link>
      </div>
    </div>

    <!-- Needs attention: configuration gaps read straight from the loaded
         stores — a probe with nothing to run, a batch deployed nowhere, a
         half-wired group. Each row links to the page where it's fixed. Kept
         deliberately small; when nothing is wrong it collapses to one line. -->
    <h3 class="anatomy-title">
      Needs attention<span v-if="findings.length"> ({{ findings.length }})</span>
    </h3>
    <div class="attention">
      <router-link
        v-for="f in findings"
        :key="f.id"
        :to="f.to"
        class="attention-row warn"
      >
        <span class="material-icons attention-icon">warning</span>
        <span class="attention-text">{{ f.text }}</span>
        <span class="material-icons attention-go">chevron_right</span>
      </router-link>

      <div v-if="!findings.length" class="attention-row ok">
        <span class="material-icons attention-icon">check_circle</span>
        <span class="attention-text">
          Everything is wired up — every probe has batches to run, and every batch is deployed.
        </span>
      </div>
    </div>
  </div>
</template>

<script>
import PageHeader from '../components/PageHeader.vue'
import config from '../shared/config'
import { useSettingsStore } from '../stores/settings.store'
import { useHostStore } from '../stores/host_store'
import { useGroupStore } from '../stores/groups_stores'
import { useBatchStore } from '../stores/batches.store'

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

    // Load everything the attention panel inspects, in parallel; a failure in
    // any one store doesn't block the rest.
    await Promise.allSettled([
      this.hostStore.getHosts(),
      this.groupStore.getGroups(),
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
  computed: {
    // Configuration gaps derived entirely from the already-loaded stores, so
    // the dashboard can point at what's half-wired without any extra request.
    // Each finding links to the page where it's resolved.
    findings() {
      const hosts = this.realItems(this.hostStore.hosts);
      const groups = this.realItems(this.groupStore.host_groups);
      const batches = this.realItems(this.batchStore.batches);
      const out = [];

      // A probe runs a batch either directly (its own batches) or by sitting in
      // a group that carries batches. One with neither will do nothing.
      const groupsWithBatches = groups.filter(g => this.names(g.batches).length);
      const idleHosts = hosts
        .filter(h =>
          !this.names(h.batches).length &&
          !groupsWithBatches.some(g => this.names(g.hosts).includes(h.name))
        )
        .map(h => h.name);
      if (idleHosts.length) {
        out.push({
          id: 'idle-hosts',
          to: '/hosts',
          text: idleHosts.length === 1
            ? `Probe "${idleHosts[0]}" will run nothing: no batches assigned, and not in a group that has any.`
            : `${idleHosts.length} probes will run nothing (${this.formatNames(idleHosts)}): no batches, and not in a group that has any.`
        });
      }

      // A batch no host and no group references is defined but never sent out.
      const deployed = new Set();
      hosts.forEach(h => this.names(h.batches).forEach(n => deployed.add(n)));
      groups.forEach(g => this.names(g.batches).forEach(n => deployed.add(n)));
      const orphanBatches = batches.map(b => b.name).filter(n => n && !deployed.has(n));
      if (orphanBatches.length) {
        out.push({
          id: 'orphan-batches',
          to: '/batches',
          text: orphanBatches.length === 1
            ? `Batch "${orphanBatches[0]}" isn't deployed to any host or group.`
            : `${orphanBatches.length} batches aren't deployed anywhere (${this.formatNames(orphanBatches)}).`
        });
      }

      // A group with hosts but no batches gives those probes nothing extra.
      const emptyGroups = groups
        .filter(g => this.names(g.hosts).length && !this.names(g.batches).length)
        .map(g => g.name);
      if (emptyGroups.length) {
        out.push({
          id: 'groups-no-batches',
          to: '/host_groups',
          text: emptyGroups.length === 1
            ? `Group "${emptyGroups[0]}" has hosts but no batches — its probes gain nothing from it.`
            : `${emptyGroups.length} groups have hosts but no batches (${this.formatNames(emptyGroups)}).`
        });
      }

      // A group with batches but no hosts sends those batches nowhere.
      const hostlessGroups = groups
        .filter(g => this.names(g.batches).length && !this.names(g.hosts).length)
        .map(g => g.name);
      if (hostlessGroups.length) {
        out.push({
          id: 'groups-no-hosts',
          to: '/host_groups',
          text: hostlessGroups.length === 1
            ? `Group "${hostlessGroups[0]}" has batches but no hosts — those batches run nowhere.`
            : `${hostlessGroups.length} groups have batches but no hosts (${this.formatNames(hostlessGroups)}).`
        });
      }

      return out;
    }
  },
  methods: {
    // Records that have actually loaded: the stores seed themselves with an
    // empty placeholder object before their data arrives.
    realItems(arr) {
      return Array.isArray(arr) ? arr.filter(x => x && x.name) : [];
    },
    // Normalise a batches/hosts list (strings, or objects with a name) to names.
    names(arr) {
      if (!Array.isArray(arr)) return [];
      return arr
        .map(n => (typeof n === 'string' ? n : (n && n.name) || ''))
        .filter(Boolean);
    },
    // First few names, then a "+N more" tail, so a finding stays one line.
    formatNames(list, max = 3) {
      if (list.length <= max) return list.join(', ');
      return `${list.slice(0, max).join(', ')} +${list.length - max} more`;
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
.status-pill.ok      { border-left-color: var(--ok); }      .status-pill.ok .material-icons { color: var(--ok); }
.status-pill.bad     { border-left-color: var(--err); }     .status-pill.bad .material-icons { color: var(--err); }
.status-pill.on      { border-left-color: var(--accent); }  .status-pill.on .material-icons { color: var(--accent); }
.status-pill.off     { border-left-color: var(--neutral); } .status-pill.off .material-icons { color: var(--neutral); }

/* Each pill is its own cell so a persistent note can sit under it. */
.status-cell { display: flex; flex-direction: column; }

/* Hover / focus explanation bubble. */
.status-pill.has-hint { position: relative; cursor: help; }
.status-pill.has-hint:focus-visible { outline: 2px solid rgba(var(--primary-rgb), .5); outline-offset: 2px; }
.hint {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 20;
  width: max-content;
  max-width: 320px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  padding: 0.55rem 0.7rem;
  font-size: 0.76rem;
  font-weight: 500;
  line-height: 1.45;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity .12s ease, transform .12s ease, visibility .12s;
  pointer-events: none;
}
.status-pill.has-hint:hover .hint,
.status-pill.has-hint:focus-within .hint {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

/* Persistent explanation, shown only when the system is unhealthy. */
.status-note {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--err-note);
}

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
  gap: 1.8rem 4.5rem;
  align-items: center;
  width: max-content;
  min-width: 864px;
  margin: 0 auto;
  padding: 0.6rem 0.3rem;
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

/* A leaf card: icon, then the block's name, then the key it becomes in the
   config file. */
.stage {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1.1rem;
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
  padding: 1.15rem 1.25rem;
}
.stage-icon { font-size: 1.55rem; color: var(--primary); flex-shrink: 0; }
.stage-text { display: flex; flex-direction: column; gap: 0.12rem; }
.stage-title { font-size: 1.05rem; font-weight: 700; color: var(--text); line-height: 1.2; white-space: nowrap; }
.stage-type {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.2;
  white-space: nowrap;
}
.stage.hero .stage-title { font-size: 1.2rem; }

/* The grouped box: three inputs stacked, sitting slightly recessed inside the
   white frame so the grouping is unmistakable. */
.sources {
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  padding: 0.85rem;
}
.sources .stage {
  background: var(--bg);
  box-shadow: none;
}

:root[data-theme="dark"] .stage-icon { color: var(--accent); }

/* ── Needs attention ──────────────────────────────────────────────
   Same white-card family as the anatomy blocks, one row per gap, with a
   coloured left edge for severity. Amber for a gap, green for all-clear. */
.attention {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 2rem;
}
.attention-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 0.7rem 0.9rem;
  text-decoration: none;
  transition: border-color .12s, box-shadow .12s;
}
a.attention-row:hover {
  border-color: rgba(var(--primary-rgb), .45);
  box-shadow: var(--shadow);
}
.attention-icon { font-size: 1.2rem; flex-shrink: 0; }
.attention-text { font-size: 0.84rem; color: var(--text); line-height: 1.4; }
.attention-go { margin-left: auto; color: var(--muted); font-size: 1.2rem; flex-shrink: 0; }

.attention-row.warn { border-left-color: var(--warn); }
.attention-row.warn .attention-icon { color: var(--warn); }
.attention-row.ok { border-left-color: var(--ok); }
.attention-row.ok .attention-icon { color: var(--ok); }
</style>
