<template>
  <div>
    <PageHeader
      title="Settings"
      subtitle="Inspect the configuration generated from your current setup"
      icon="settings"
    />

    <div v-if="settingsStore.isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading settings...</span>
    </div>

    <template v-else>
      <section class="settings-card" aria-labelledby="tools-title">
        <div class="settings-card-head">
          <span class="material-icons settings-card-icon" aria-hidden="true">cloud_upload</span>
          <div>
            <h3 id="tools-title" class="settings-card-title">Provisioning</h3>
            <p class="settings-card-desc">
              Inspect the current generated configuration.
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
            <span class="material-icons btn-icon" aria-hidden="true">visibility</span>
            {{ settingsStore.previewLoading ? 'Building...' : 'Preview' }}
          </button>
        </div>

        <div v-if="settingsStore.preview" class="preview-result" aria-live="polite">
          <div class="preview-status" :class="settingsStore.preview.changed ? 'changed' : 'unchanged'">
            <span class="material-icons" aria-hidden="true">{{ settingsStore.preview.changed ? 'sync_problem' : 'check_circle' }}</span>
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
    previewConfig() {
      this.settingsStore.previewConfig();
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
.preview-status.changed {
  background: var(--warn-soft-bg);
  color: var(--warn-soft-fg);
  border: 1px solid var(--warn-soft-bd);
}
.preview-status.unchanged {
  background: var(--ok-soft-bg);
  color: var(--ok-soft-fg);
  border: 1px solid var(--ok-soft-bd);
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

:global(:root[data-theme="dark"]) .setting-sub code {
  background: #0e1626;
}
/* Navy on dark is nearly black; the active preview tab uses the accent. */
:global(:root[data-theme="dark"]) .preview-tabs button.active {
  color: var(--accent);
}

@media (max-width: 700px) {
  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
}
</style>
