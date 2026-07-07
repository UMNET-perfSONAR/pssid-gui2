<template>
  <section v-if="entries.length" class="recent-activity" aria-label="Recent activity">
    <h3 class="recent-activity-title">Recent activity</h3>
    <ul class="recent-activity-list">
      <li v-for="e in entries" :key="e.id">
        <span class="material-icons ra-icon" :class="e.type">{{ icon(e.type) }}</span>
        <span class="ra-msg">{{ e.message }}</span>
        <span class="ra-time">{{ timeOf(e.at) }}</span>
      </li>
    </ul>
  </section>
</template>

<script>
import { useToastStore } from '../stores/toast.store'

// Inline record of what was just performed (added, updated, deleted,
// provisioned). Fed automatically by every notification, so any page can drop
// this under its content with no extra wiring.
export default {
  name: 'RecentActivity',
  props: {
    count: { type: Number, default: 3 }
  },
  setup() {
    return { toastStore: useToastStore() }
  },
  computed: {
    entries() {
      return this.toastStore.history.slice(0, this.count)
    }
  },
  methods: {
    icon(type) {
      return { success: 'check_circle', error: 'error', info: 'info' }[type] || 'info'
    },
    timeOf(at) {
      return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  }
}
</script>

<style scoped>
.recent-activity {
  margin-top: 1.25rem;
}
.recent-activity-title {
  font-size: 0.72rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted) !important;
  margin: 0 0 0.5rem !important;
  border: none !important;
  padding: 0 !important;
}
.recent-activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.recent-activity-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
}
.ra-icon {
  font-size: 1rem;
  margin-top: 0.1rem;
  flex-shrink: 0;
}
.ra-icon.success { color: #16a34a; }
.ra-icon.error   { color: #dc2626; }
.ra-icon.info    { color: #2563eb; }
.ra-msg {
  color: var(--text);
  white-space: pre-line;
  word-break: break-word;
}
.ra-time {
  margin-left: auto;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
