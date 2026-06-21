<template>
  <div class="page-header">
    <div class="page-header-icon">
      <span class="material-icons">{{ icon }}</span>
    </div>
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
    icon:     { type: String, default: 'settings' }
  }
}
</script>
