<template>
  <div class="page-header">
    <div class="page-header-icon">
      <span class="material-icons">{{ icon }}</span>
    </div>
    <button
      v-if="canAdd"
      class="page-header-add"
      type="button"
      :disabled="addDisabled"
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
    // Pages with an Add form show a permanent "+ Add ..." button between the
    // icon and the title. It doubles as the submit control: the page keeps it
    // grey (addDisabled) until every field of the new item is valid, and a
    // click then saves it. When the page is showing an item instead, the
    // click switches back to a blank Add form.
    canAdd:      { type: Boolean, default: false },
    addDisabled: { type: Boolean, default: false },
    addLabel:    { type: String, default: 'Add' }
  },
  emits: ['add']
}
</script>

<style scoped>
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
