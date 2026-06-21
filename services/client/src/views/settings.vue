<template>
  <div>
    <PageHeader
      title="Settings"
      subtitle="Deployment-wide automation and provisioning controls"
      icon="settings"
    />

    <div v-if="settingsStore.isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading settings…</span>
    </div>

    <template v-else>
      <!-- Automation -->
      <section class="settings-card">
        <div class="settings-card-head">
          <span class="material-icons settings-card-icon">bolt</span>
          <div>
            <h3 class="settings-card-title">Automation</h3>
            <p class="settings-card-desc">
              Control how configuration changes reach your probes.
            </p>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Auto-provision on change</div>
            <div class="setting-sub">
              When enabled, saving a change to hosts, groups, schedules, SSID profiles,
              tests, jobs, or batches automatically regenerates the daemon config and
              pushes it to the probes — no manual “Configure” click required.
            </div>
          </div>
          <label class="switch" :class="{ disabled: isDisabled || settingsStore.isSaving }">
            <input
              type="checkbox"
              :checked="settingsStore.autoProvision"
              :disabled="isDisabled || settingsStore.isSaving"
              @change="onToggle($event)"
            />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>

        <div v-if="settingsStore.autoProvision" class="setting-callout">
          <span class="material-icons">info</span>
          <span>
            Auto-provision is <strong>on</strong>. Edits are pushed to the probes
            automatically (debounced, so a burst of edits results in a single run).
            Every run is recorded in <router-link to="/history">History</router-link>.
          </span>
        </div>
        <div v-else class="setting-callout muted">
          <span class="material-icons">shield</span>
          <span>
            Auto-provision is <strong>off</strong>. Changes only reach the probes when
            you click “Configure selected host/group” or “Provision now” below.
          </span>
        </div>
      </section>

      <!-- Manual provisioning -->
      <section class="settings-card">
        <div class="settings-card-head">
          <span class="material-icons settings-card-icon">cloud_upload</span>
          <div>
            <h3 class="settings-card-title">Manual provisioning</h3>
            <p class="settings-card-desc">
              Push the current configuration to all probes immediately.
            </p>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Provision now</div>
            <div class="setting-sub">
              Regenerates <code>hosts.ini</code> and <code>pssid_config.json</code> from the
              current state and runs the provision script for all hosts.
            </div>
          </div>
          <button class="btn btn-primary" :disabled="isDisabled" @click="provisionNow">
            <span class="material-icons" style="font-size:1rem; vertical-align:-3px; margin-right:.35rem;">play_arrow</span>
            Provision now
          </button>
        </div>
      </section>

      <p v-if="isDisabled" class="settings-readonly-note">
        <span class="material-icons" style="font-size:1rem; vertical-align:-3px;">lock</span>
        You have read-only access. Sign in with a write-enabled account to change these settings.
      </p>
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
    }
  },
  computed: {
    isDisabled() {
      return isFormDisabled();
    }
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
    provisionNow() {
      this.settingsStore.provisionNow();
    }
  }
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
  border-radius: 9px;
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
.setting-text { flex: 1; }
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
  max-width: 60ch;
}
.setting-sub code {
  background: #f1f3f6;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--text);
}

/* Toggle switch */
.switch { position: relative; display: inline-flex; flex-shrink: 0; cursor: pointer; }
.switch.disabled { cursor: not-allowed; opacity: 0.55; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
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

/* Callouts */
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
  background: #f6f8fa;
  border-color: var(--border);
  color: var(--muted);
}
.setting-callout .material-icons { font-size: 1.1rem; color: var(--primary); flex-shrink: 0; }
.setting-callout.muted .material-icons { color: var(--muted); }

.settings-readonly-note {
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

@media (max-width: 600px) {
  .setting-row { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
}
</style>
