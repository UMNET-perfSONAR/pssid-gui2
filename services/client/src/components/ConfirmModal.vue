<template>
  <div v-if="visible" class="confirm-overlay" @click.self="onCancel">
    <div class="confirm-box" role="dialog" aria-modal="true">
      <div class="confirm-icon-wrap">
        <span class="material-icons confirm-warn-icon">warning_amber</span>
      </div>
      <p class="confirm-message">{{ message }}</p>
      <div class="confirm-buttons">
        <button class="btn btn-danger btn-sm" @click="onConfirm">Delete</button>
        <button class="btn btn-secondary btn-sm" @click="onCancel">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ConfirmModal',
  props: {
    visible:  { type: Boolean, required: true },
    message:  { type: String, default: 'Are you sure you want to delete this item? This cannot be undone.' }
  },
  emits: ['confirm', 'cancel'],
  methods: {
    onConfirm() { this.$emit('confirm') },
    onCancel()  { this.$emit('cancel') }
  }
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}
.confirm-box {
  background: #fff;
  border-radius: 12px;
  padding: 2rem 2.25rem;
  min-width: 320px;
  max-width: 440px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  text-align: center;
}
.confirm-icon-wrap {
  margin-bottom: 0.875rem;
}
.confirm-warn-icon {
  font-size: 2.75rem;
  color: #f59e0b;
}
.confirm-message {
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
  color: #374151;
  line-height: 1.5;
}
.confirm-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}
</style>
