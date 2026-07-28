<template>
  <div>
    <PageHeader
      title="Settings"
      subtitle="Inspect and generate the configuration from your current setup"
      icon="settings"
    />

    <div v-if="settingsStore.isLoading" class="loading-state" role="status" aria-live="polite">
      <div class="spinner"></div>
      <span>Loading settings…</span>
    </div>

    <template v-else>
      <section class="settings-card" aria-labelledby="tools-title">
        <div class="settings-card-head">
          <span class="material-icons settings-card-icon" aria-hidden="true">fact_check</span>
          <h2 id="tools-title" class="settings-card-title">Configuration</h2>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Preview config files</div>
            <div class="setting-sub">
              Builds <code>pssid_config.json</code> and <code>hosts.ini</code> from the
              current database state and checks them against the same rules the daemon
              enforces, without writing anything to disk.
            </div>
          </div>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="settingsStore.previewLoading"
            :aria-busy="settingsStore.previewLoading"
            @click="previewConfig"
          >
            <span v-if="settingsStore.previewLoading" class="inline-spinner" aria-hidden="true"></span>
            <span v-else class="material-icons btn-icon" aria-hidden="true">visibility</span>
            {{ settingsStore.previewLoading ? 'Previewing...' : 'Preview' }}
          </button>
        </div>

        <!-- Only for the FIRST preview, when there is no panel yet: a refresh
             keeps the panel below on screen and shows its busy state there. -->
        <div
          v-if="settingsStore.previewLoading && !settingsStore.preview"
          class="loading-state"
          role="status"
          aria-live="polite"
        >
          <div class="spinner"></div>
          <span>Building preview…</span>
        </div>

        <p v-if="settingsStore.previewError" class="preview-error" role="alert">
          <span class="material-icons" aria-hidden="true">error</span>
          {{ settingsStore.previewError }}
        </p>

        <div v-if="settingsStore.preview" class="preview-result" aria-live="polite">
          <div class="preview-status valid">
            <span class="material-icons" aria-hidden="true">check_circle</span>
            <span>No validation problems found</span>
          </div>

          <div class="preview-toolbar">
            <div class="preview-tabs" role="tablist" aria-label="Preview file">
              <button
                type="button"
                role="tab"
                :aria-selected="previewTab === 'config'"
                :class="{ active: previewTab === 'config' }"
                @click="previewTab = 'config'"
              >
                pssid_config.json
              </button>
              <button
                type="button"
                role="tab"
                :aria-selected="previewTab === 'inventory'"
                :class="{ active: previewTab === 'inventory' }"
                @click="previewTab = 'inventory'"
              >
                hosts.ini
              </button>
            </div>
            <!-- Rebuilds this panel in place. The Preview button that opened it
                 is a scroll away once a real config is on screen, and the state
                 it was built from changes on every other page. Read-only, like
                 Preview, so it is not gated on write access. -->
            <button
              type="button"
              class="btn-refresh"
              :disabled="settingsStore.previewLoading"
              :aria-busy="settingsStore.previewLoading"
              @click="previewConfig"
            >
              <span v-if="settingsStore.previewLoading" class="inline-spinner" aria-hidden="true"></span>
              <span v-else class="material-icons" aria-hidden="true">refresh</span>
              {{ settingsStore.previewLoading ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>
          <div class="preview-pane">
            <pre class="preview-pre">{{ previewText }}</pre>
            <!-- The outgoing file stays visible under the scrim rather than
                 being replaced by a blank box, so the panel keeps its height
                 and the page does not jump while the rebuild is in flight. -->
            <!-- No role="status": .preview-result already carries aria-live,
                 and a nested live region announces this twice. -->
            <div v-if="settingsStore.previewLoading" class="preview-busy">
              <span class="inline-spinner" aria-hidden="true"></span>
              <span>Rebuilding…</span>
            </div>
          </div>
        </div>

        <div class="setting-divider" role="separator"></div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Generate config files</div>
            <div class="setting-sub">
              Validates the configuration, then writes <code>pssid_config.json</code>
              and <code>hosts.ini</code> to the controller (the server's output
              directory, <code>/var/lib/pssid/output</code> on a standard deploy).
              This generates the files only; delivering them to the probes is a
              separate step.
            </div>
          </div>
          <!-- Generate WRITES files on the controller, so it is gated on write
               access like every form on every other page. Preview above is a
               read, and stays available: inspecting the configuration is
               exactly what a read-only account is for. -->
          <button
            type="button"
            class="btn btn-primary"
            :disabled="settingsStore.generateLoading || isReadOnly"
            :aria-busy="settingsStore.generateLoading"
            :title="isReadOnly ? 'Generating writes files on the controller, which needs write access.' : ''"
            @click="generateConfig"
          >
            <span v-if="settingsStore.generateLoading" class="inline-spinner" aria-hidden="true"></span>
            <span v-else class="material-icons btn-icon" aria-hidden="true">description</span>
            {{ settingsStore.generateLoading ? 'Generating...' : 'Generate' }}
          </button>
        </div>

        <!-- Generate runs the provision script on the controller, which is the
             slowest thing this page does and produces nothing until it is over.
             The button's own spinner is easy to miss once it has been clicked
             and the pointer has moved away. -->
        <div
          v-if="settingsStore.generateLoading"
          class="loading-state"
          role="status"
          aria-live="polite"
        >
          <div class="spinner"></div>
          <span>Writing files to the controller…</span>
        </div>

        <p v-if="settingsStore.generateError" class="preview-error" role="alert">
          <span class="material-icons" aria-hidden="true">error</span>
          {{ settingsStore.generateError }}
        </p>

        <div v-if="settingsStore.generated" class="preview-status valid" role="status" aria-live="polite">
          <span class="material-icons" aria-hidden="true">check_circle</span>
          <span>Files written to the controller</span>
        </div>
      </section>
    </template>

  </div>
</template>

<script>
import PageHeader from '../components/PageHeader.vue'
import { useSettingsStore } from '../stores/settings.store'
import { useUserStore } from '../stores/user.store'
import { isFormDisabled } from '../utils/formControl.ts'

export default {
  name: 'Settings',
  components: { PageHeader },
  data() {
    return {
      settingsStore: useSettingsStore(),
      userStore: useUserStore(),
      previewTab: 'config',
    }
  },
  computed: {
    // The same verdict every other page's forms use, so this button and they
    // are never in disagreement about what the server would accept.
    isReadOnly() {
      return isFormDisabled();
    },
    previewText() {
      if (!this.settingsStore.preview) return '';
      return this.previewTab === 'config'
        ? this.settingsStore.preview.proposed.config
        : this.settingsStore.preview.proposed.inventory;
    },
  },
  async mounted() {
    // Always fetched: carries the server's effective auth posture as well as
    // the identity. See the note in schedules.vue.
    await this.userStore.fetchUser();
    await this.settingsStore.getSettings();
  },
  methods: {
    previewConfig() {
      this.settingsStore.previewConfig();
    },
    generateConfig() {
      this.settingsStore.generateConfig();
    },
  },
}
</script>

<style scoped>
.settings-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.25rem 1.35rem;
  margin-bottom: 1.25rem;
}
.settings-card-head {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding-bottom: 1rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}
.settings-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(var(--primary-rgb), .07);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.settings-card-title {
  font-size: 1rem !important;
  font-weight: 700 !important;
  color: var(--text) !important;
  margin: 0 0 0.15rem !important;
  text-transform: none !important;
  letter-spacing: 0 !important;
  border: none !important;
  padding: 0 !important;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.85rem 0 0.35rem;
}
.setting-divider {
  height: 1px;
  background: var(--border);
  margin: 1rem 0 0.25rem;
}
.setting-text {
  flex: 1;
  min-width: 0;
}
.setting-name {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text);
  margin-bottom: 0.2rem;
}
.setting-sub {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.5;
  max-width: 68ch;
}
.setting-sub code {
  background: rgba(var(--primary-rgb), .08);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--text);
}
.btn-icon {
  font-size: 1rem;
  vertical-align: -3px;
  margin-right: 0.35rem;
}
.preview-result {
  margin-top: 1rem;
}
.preview-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.preview-status .material-icons {
  font-size: 1.15rem;
  flex-shrink: 0;
}
.preview-status.valid {
  background: var(--ok-soft-bg);
  color: var(--ok-soft-fg);
  border: 1px solid var(--ok-soft-bd);
}
.preview-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--warn-soft-fg);
  background: var(--warn-soft-bg);
  border: 1px solid var(--warn-soft-bd);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.9rem;
  margin: 0.75rem 0 0;
  white-space: pre-line;
}
.preview-error .material-icons {
  font-size: 1.1rem;
  flex-shrink: 0;
}
/* Tabs and Refresh share a row, with the -1px that pulls the tab strip flush
   against the panel moved up here so it applies to the whole row. align-items:
   flex-end keeps Refresh sitting on the tabs' baseline rather than stretching. */
.preview-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: -1px;
}
.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.3rem 0.7rem;
  margin-bottom: 0.3rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: color .15s, border-color .15s;
}
.btn-refresh:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
}
.btn-refresh:disabled {
  cursor: default;
  opacity: 0.65;
}
.btn-refresh .material-icons {
  font-size: 0.95rem;
}
.preview-tabs {
  display: flex;
  gap: 0.25rem;
}
.preview-tabs button {
  position: relative;
  background: transparent;
  /* A quiet theme-aware outline keeps both file sections defined against the
     card. The active tab draws its cyan top stroke over this border below. */
  border: 1px solid var(--border);
  border-top-width: 2px;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  padding: 0.35rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
}
/* The active tab takes the code panel's own colors (see .preview-pre below)
   rather than the card's, so the tab and the panel it labels read as one
   surface -- the conventional tabbed-panel look, and the reason the tab strip
   is pulled down a pixel to sit flush against it. These are the panel's fixed
   values, not theme tokens, because the panel is deliberately dark in every
   theme; matching it keeps the two in step.
   That match is also why background/text alone cannot mark which tab is
   selected in dark mode: the card's own --surface is already a near-black
   navy there, almost the same shade as this fixed panel color, so the
   "boxed tab popping off the card" cue that works in light mode nearly
   vanishes in dark mode. The accent top border is theme-independent (the
   edition accent color, not a neutral token) and stays visible regardless of
   how close --surface lands to the panel's fixed dark value.

   The accent is a shallow rounded outline instead of border-top-color. A
   separately colored top border gets split diagonally where it meets the dark
   side borders, stopping short of the rounded corners. This stroke follows the
   whole top curve, reaches each edge, and stops before it can outline the tab's
   straight sides. */
.preview-tabs button.active {
  color: #e2e8f0;
  background: #0f172a;
  border-color: var(--border);
}
.preview-tabs button.active::before {
  content: '';
  position: absolute;
  top: -2px;
  right: -1px;
  left: -1px;
  height: 8px;
  box-sizing: border-box;
  border: 2px solid var(--accent);
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
  pointer-events: none;
}
.preview-pane {
  position: relative;
}
/* Scrim over the outgoing file while a refresh is in flight. The panel is
   deliberately dark in every theme (see .preview-pre), so these are fixed
   light-on-dark values rather than theme tokens -- the same reasoning as the
   active tab above. */
.preview-busy {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  font-size: 0.85rem;
  border-radius: 0 6px 6px 6px;
}
/* One spinner for the buttons and the scrim both. It takes its color from the
   text beside it, so it stays visible on a filled primary button, a ghost
   button and the dark panel without a per-context override, and is sized in em
   so it tracks whatever label it sits next to. pssid-spin is the global
   keyframe from main.css, where the reduced-motion rule also applies. */
.inline-spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  opacity: 0.9;
  animation: pssid-spin 0.7s linear infinite;
  flex-shrink: 0;
}
/* .btn is inline-block, not flex, so the spinner needs the same nudge and gap
   .btn-icon uses to sit on the label's line. */
.btn .inline-spinner {
  vertical-align: -0.12em;
  margin-right: 0.35rem;
}
.preview-pre {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 0 6px 6px 6px;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  line-height: 1.5;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre;
}

:global(:root[data-theme="dark"]) .setting-sub code {
  background: #0e1626;
}

@media (max-width: 700px) {
  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
}
</style>
