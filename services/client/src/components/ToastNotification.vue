<template>
  <div class="toast-container" aria-live="polite">
    <div
      v-for="toast in toastStore.toasts"
      :key="toast.id"
      class="toast-item"
      :class="toast.type"
    >
      <span class="toast-message">{{ toast.message }}</span>
      <button class="toast-close" @click="toastStore.dismiss(toast.id)" aria-label="Dismiss">&times;</button>
    </div>
  </div>
</template>

<script>
import { useToastStore } from '../stores/toast.store'
export default {
  name: 'ToastNotification',
  setup() {
    return { toastStore: useToastStore() }
  }
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 380px;
  pointer-events: none;
}
.toast-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  pointer-events: all;
  animation: toast-in 0.22s ease;
}
.toast-item.success { background: #28a745; }
.toast-item.error   { background: #dc3545; }
.toast-item.info    { background: #17a2b8; }
.toast-message { flex: 1; }
.toast-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.85);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  margin-left: 0.75rem;
  padding: 0;
}
.toast-close:hover { color: #fff; }
@keyframes toast-in {
  from { opacity: 0; transform: translateX(30px); }
  to   { opacity: 1; transform: translateX(0); }
}
</style>
