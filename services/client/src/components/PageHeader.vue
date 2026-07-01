<template>
  <div class="page-header">
    <div class="page-header-icon">
      <span class="material-icons">{{ icon }}</span>
    </div>
    <button
      v-if="canAdd"
      class="page-header-add"
      type="button"
      :title="addLabel"
      @click="$emit('add')"
    >
      <span class="material-icons">add</span>
      <span>{{ addLabel }}</span>
    </button>
    <div class="page-header-content">
      <h2 class="page-header-title">{{ title }}</h2>
      <p class="page-header-subtitle" v-if="subtitle">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PageHeader',
  props: {
    title:    { type: String, required: true },
    subtitle: { type: String, default: '' },
    icon:     { type: String, default: 'settings' },
    // When canAdd is true a green "+ Add ..." button is shown between the icon
    // and the title; clicking it emits `add`. Pages gate this on write access.
    canAdd:   { type: Boolean, default: false },
    addLabel: { type: String, default: 'Add' }
  },
  emits: ['add']
}
</script>

<style scoped>
.page-header-add {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #22c55e;
  color: #0a0a0a;
  border: 1px solid #16a34a;
  border-radius: 8px;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background .12s;
}
.page-header-add:hover { background: #16a34a; color: #fff; }
.page-header-add .material-icons { font-size: 1.15rem; color: inherit; }
</style>
