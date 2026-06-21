<template>
  <div>
    <PageHeader
      title="Provision History"
      subtitle="Last 100 provisioning events, most recent first"
      icon="history"
    />

    <div v-if="store.isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading history…</span>
    </div>

    <div v-else-if="store.history.length === 0" class="list-empty-state">
      <span class="material-icons list-empty-icon">history_toggle_off</span>
      <p style="font-weight: 600; margin-bottom: 0.35rem;">No events recorded yet</p>
      <p style="font-size: 0.8rem; color: var(--muted); max-width: 360px; margin: 0 auto;">
        Click "Configure selected host" or "Configure selected group" to trigger provisioning.
      </p>
    </div>

    <div v-else class="table-responsive">
      <table class="table table-sm table-bordered table-hover">
        <thead>
          <tr>
            <th>Time</th>
            <th>Target</th>
            <th>Context</th>
            <th>Caller</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in store.history" :key="i" :class="row.success ? '' : 'table-danger'">
            <td style="white-space: nowrap; font-size: 0.82rem;">{{ formatTime(row.timestamp) }}</td>
            <td><code style="font-size: 0.82rem; background: none; color: inherit;">{{ row.target_name }}</code></td>
            <td style="font-size: 0.82rem;">{{ row.click_context }}</td>
            <td style="font-size: 0.82rem;">{{ row.caller }}</td>
            <td>
              <span v-if="row.success" class="badge badge-success">Success</span>
              <span v-else class="badge badge-danger" :title="row.error">Failed</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import { useProvisionHistoryStore } from '../stores/provision_history.store'
import PageHeader from '../components/PageHeader.vue'

export default {
  name: 'ProvisionHistory',
  components: { PageHeader },
  data() {
    return {
      store: useProvisionHistoryStore()
    }
  },
  async mounted() {
    await this.store.getHistory()
  },
  methods: {
    formatTime(ts) {
      if (!ts) return '—'
      return new Date(ts).toLocaleString()
    }
  }
}
</script>
