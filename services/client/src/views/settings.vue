<template>
  <div>
    <PageHeader
      title="Settings"
      subtitle="Manage how configuration changes are generated and pushed to probes"
      icon="settings"
    />

    <div v-if="settingsStore.isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading settings...</span>
    </div>

    <template v-else>
      <p v-if="isDisabled" class="readonly-banner">
        <span class="material-icons">lock</span>
        You have read-only access. Sign in with a write-enabled account to change provisioning settings.
      </p>

      <section class="settings-card" aria-labelledby="automation-title">
        <div class="settings-card-head">
          <span class="material-icons settings-card-icon">bolt</span>
          <div>
            <h3 id="automation-title" class="settings-card-title">Configuration delivery</h3>
            <p class="settings-card-desc">
              Choose whether saved GUI changes deploy automatically or wait for an operator.
            </p>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Auto-provision on change</div>
            <div class="setting-sub">
              After successful edits to hosts, groups, schedules, SSID profiles, tests,
              jobs, or batches, the server can regenerate the daemon config and push it
              to the probes.
            </div>
          </div>
          <div class="setting-control">
            <span class="status-chip" :class="settingsStore.autoProvision ? 'on' : 'off'">
              {{ settingsStore.autoProvision ? 'On' : 'Off' }}
            </span>
            <label class="switch" :class="{ disabled: isDisabled || settingsStore.isSaving }" aria-label="Auto-provision on change">
              <input
                type="checkbox"
                :checked="settingsStore.autoProvision"
                :disabled="isDisabled || settingsStore.isSaving"
                @change="onToggle($event)"
              />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>
        </div>

        <div class="setting-callout" :class="{ muted: !settingsStore.autoProvision }">
          <span class="material-icons">{{ settingsStore.autoProvision ? 'info' : 'pause_circle' }}</span>
          <span v-if="settingsStore.autoProvision">
            Auto-provision is on. A burst of saved edits is bundled into one background provision run.
          </span>
          <span v-else>
            Auto-provision is off. Saved edits stay in the database until you provision from Hosts, Groups, or the tools below.
          </span>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="tools-title">
        <div class="settings-card-head">
          <span class="material-icons settings-card-icon">cloud_upload</span>
          <div>
            <h3 id="tools-title" class="settings-card-title">Provisioning tools</h3>
            <p class="settings-card-desc">
              Inspect or push the current generated configuration.
            </p>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Preview generated files</div>
            <div class="setting-sub">
              Builds <code>pssid_config.json</code> and <code>hosts.ini</code> from the
              current database state without writing files or running the provision script.
            </div>
          </div>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="settingsStore.previewLoading"
            @click="previewConfig"
          >
            <span class="material-icons btn-icon">visibility</span>
            {{ settingsStore.previewLoading ? 'Building...' : 'Preview' }}
          </button>
        </div>

        <div class="setting-row with-divider">
          <div class="setting-text">
            <div class="setting-name">Provision all probes now</div>
            <div class="setting-sub">
              Writes the generated config and inventory, then starts the provision script
              for all hosts.
            </div>
          </div>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="isDisabled || settingsStore.provisionLoading"
            @click="provisionNow"
          >
            <span class="material-icons btn-icon">play_arrow</span>
            {{ settingsStore.provisionLoading ? 'Starting...' : 'Provision now' }}
          </button>
        </div>

        <div v-if="settingsStore.preview" class="preview-result" aria-live="polite">
          <div class="preview-status" :class="settingsStore.preview.changed ? 'changed' : 'unchanged'">
            <span class="material-icons">{{ settingsStore.preview.changed ? 'sync_problem' : 'check_circle' }}</span>
            <span>{{ previewStatusText }}</span>
          </div>

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
          <pre class="preview-pre">{{ previewText }}</pre>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
import PageHeader from '../components/PageHeader.vue'
import { useSettingsStore } from '../stores/settings.store'
import { useUserStore } from '../stores/user.store'
import config from '../shared/config'
import { isFormDisabled } from '../utils/formControl.ts'

export default {
  name: 'Settings',
  components: { PageHeader },
  data() {
    return {
      settingsStore: useSettingsStore(),
      userStore: useUserStore(),
      enable_sso: config.ENABLE_SSO,
      previewTab: 'config',
    }
  },
  computed: {
    isDisabled() {
      return isFormDisabled();
    },
    previewText() {
      if (!this.settingsStore.preview) return '';
      return this.previewTab === 'config'
        ? this.settingsStore.preview.proposed.config
        : this.settingsStore.preview.proposed.inventory;
    },
    previewStatusText() {
      const preview = this.settingsStore.preview;
      if (!preview) return '';
      const hasCurrent = !!preview.current.config || !!preview.current.inventory;

      if (!hasCurrent) {
        return 'No deployed config was found. This preview shows what the first provision will write.';
      }

      return preview.changed
        ? 'The generated files differ from what is currently deployed.'
        : 'The generated files match what is currently deployed.';
    },
  },
  async mounted() {
    if (this.enable_sso) {
      await this.userStore.fetchUser();
    }
    await this.settingsStore.getSettings();
  },
  methods: {
    onToggle(e) {
      this.settingsStore.setAutoProvision(e.target.checked);
    },
    previewConfig() {
      this.settingsStore.previewConfig();
    },
    provisionNow() {
      this.settingsStore.provisionNow();
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
.settings-card-desc {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 0;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.85rem 0 0.35rem;
}
.setting-row.with-divider {
  border-top: 1px solid var(--border);
  margin-top: 0.75rem;
  padding-top: 1.1rem;
}
.setting-text {
  flex: 1;
  min-width: 0;
}
.setting-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
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
.status-chip {
  min-width: 42px;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 700;
  border: 1px solid var(--border);
}
.status-chip.on {
  background: #dcfce7;
  color: #166534;
  border-color: #bbf7d0;
}
.status-chip.off {
  background: #f1f5f9;
  color: #475569;
  border-color: #dbe2ea;
}
.switch {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
}
.switch.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.switch-track {
  width: 46px;
  height: 26px;
  border-radius: 13px;
  background: #cbd2dc;
  transition: background .18s ease;
  display: inline-block;
  position: relative;
}
.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.25);
  transition: transform .18s ease;
}
.switch input:checked + .switch-track {
  background: var(--primary);
}
.switch input:checked + .switch-track .switch-thumb {
  transform: translateX(20px);
}
.setting-callout {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-top: 0.85rem;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  line-height: 1.5;
  background: rgba(var(--primary-rgb), .06);
  color: var(--text);
  border: 1px solid rgba(var(--primary-rgb), .12);
}
.setting-callout.muted {
  background: rgba(100, 116, 139, .08);
  border-color: var(--border);
  color: var(--muted);
}
.setting-callout .material-icons {
  font-size: 1.1rem;
  color: var(--primary);
  flex-shrink: 0;
}
.setting-callout.muted .material-icons {
  color: var(--muted);
}
.readonly-banner {
  font-size: 0.82rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem 0.9rem;
  margin-bottom: 1rem;
}
.readonly-banner .material-icons {
  font-size: 1rem;
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
.preview-status.changed {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}
.preview-status.unchanged {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.preview-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: -1px;
}
.preview-tabs button {
  background: transparent;
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  padding: 0.35rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
}
.preview-tabs button.active {
  color: var(--primary);
  background: var(--surface);
  border-color: var(--border);
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

:global(:root[data-theme="dark"]) .status-chip.off {
  background: #182235;
  color: var(--muted);
  border-color: var(--border);
}
:global(:root[data-theme="dark"]) .setting-sub code {
  background: #0e1626;
}
:global(:root[data-theme="dark"]) .preview-status.changed {
  background: #341b0b;
  color: #fed7aa;
  border-color: #7c2d12;
}
:global(:root[data-theme="dark"]) .preview-status.unchanged,
:global(:root[data-theme="dark"]) .status-chip.on {
  background: #0f2f1c;
  color: #bbf7d0;
  border-color: #166534;
}

@media (max-width: 700px) {
  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .setting-control {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
