<template>
  <div class="page-header">
    <div class="page-header-icon">
      <span class="material-icons" aria-hidden="true">{{ icon }}</span>
    </div>
    <div class="page-header-content">
      <h1 class="page-header-title">{{ title }}</h1>
      <p class="page-header-subtitle" v-if="subtitle">{{ subtitle }}</p>
    </div>
    <button
      v-if="canAdd"
      class="page-header-add"
      type="button"
      :disabled="addDisabled"
      :title="addLabel"
      @click="$emit('add')"
    >
      <span class="material-icons" aria-hidden="true">add</span>
      <span>{{ addLabel }}</span>
    </button>
  </div>
</template>

<script>
export default {
  name: 'PageHeader',
  props: {
    title:    { type: String, required: true },
    subtitle: { type: String, default: '' },
    icon:     { type: String, default: 'settings' },
    // Pages with an editor panel show a "+ New ..." button on the right. It
    // does exactly one thing: open a blank "New <thing>" form (deselecting any
    // item being edited). Saving is always done with the form's own submit
    // button, never from here. Disabled only while writes are disabled.
    canAdd:      { type: Boolean, default: false },
    addDisabled: { type: Boolean, default: false },
    addLabel:    { type: String, default: 'New' }
  },
  emits: ['add']
}
</script>

<style scoped>
.page-header-content {
  flex: 1;
  min-width: 0;
}
.page-header-add {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--ok);
  color: var(--ok-contrast);
  border: 1px solid var(--ok-hover);
  border-radius: 8px;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background .12s, border-color .12s, color .12s;
}
.page-header-add:hover:not(:disabled) { background: var(--ok-hover); color: var(--ok-contrast); }
.page-header-add:disabled {
  background: var(--disabled-bg);
  border-color: var(--disabled-bg);
  color: var(--disabled-fg);
  cursor: not-allowed;
}
.page-header-add .material-icons { font-size: 1.15rem; color: inherit; }
</style>
