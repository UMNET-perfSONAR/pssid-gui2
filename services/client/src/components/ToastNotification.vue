<template>
  <div class="snackbar-region" role="status" aria-live="polite" aria-atomic="false">
    <transition-group name="snackbar">
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="snackbar"
        :class="toast.type"
      >
        <span class="material-icons snackbar-icon" aria-hidden="true">{{ iconFor(toast.type) }}</span>
        <span class="sr-only">{{ labelFor(toast.type) }}:</span>
        <span class="snackbar-message">{{ toast.message }}</span>
        <button class="snackbar-close" @click="toastStore.dismiss(toast.id)" aria-label="Dismiss notification">
          <span class="material-icons" aria-hidden="true">close</span>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script>
import { useToastStore } from '../stores/toast.store'

export default {
  name: 'ToastNotification',
  setup() {
    return { toastStore: useToastStore() }
  },
  methods: {
    iconFor(type) {
      return { success: 'check_circle', error: 'error', info: 'info' }[type] || 'info'
    },
    // Spoken prefix so a screen-reader user hears the toast's kind even though
    // the visual cue is colour + icon (WCAG 1.4.1, never colour alone).
    labelFor(type) {
      return { success: 'Success', error: 'Error', info: 'Information' }[type] || 'Information'
    }
  }
}
</script>

<style scoped>
/* Feedback appears as a snackbar rising from the bottom centre of the page,
   out of the way of the header actions and the form being edited. */
.snackbar-region {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 0.5rem;
  width: min(480px, calc(100vw - 2rem));
  pointer-events: none;
}
.snackbar {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  width: 100%;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  background: #1f2937;
  color: #f3f4f6;
  font-size: 0.85rem;
  line-height: 1.45;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  pointer-events: all;
}
:root[data-theme="dark"] .snackbar {
  background: #2b3852;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}
.snackbar-icon {
  font-size: 1.15rem;
  flex-shrink: 0;
  margin-top: 0.05rem;
}
.snackbar.success .snackbar-icon { color: var(--toast-ok); }
.snackbar.error   .snackbar-icon { color: var(--toast-err); }
.snackbar.info    .snackbar-icon { color: var(--toast-info); }
.snackbar-message {
  flex: 1;
  white-space: pre-line;
  word-break: break-word;
}
.snackbar-close {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}
.snackbar-close .material-icons { font-size: 1rem; }
.snackbar-close:hover { color: #f3f4f6; }

.snackbar-enter-active { transition: opacity .18s ease, transform .18s ease; }
.snackbar-leave-active { transition: opacity .15s ease, transform .15s ease; }
.snackbar-enter-from,
.snackbar-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
