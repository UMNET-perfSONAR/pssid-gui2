<template>
  <div v-if="visible" class="confirm-overlay" @click.self="onCancel">
    <div
      ref="box"
      class="confirm-box"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-message"
      @keydown.esc.prevent="onCancel"
      @keydown.tab="onTab"
    >
      <div class="confirm-icon-wrap">
        <span class="material-icons confirm-warn-icon" aria-hidden="true">warning_amber</span>
      </div>
      <p id="confirm-modal-message" class="confirm-message">{{ message }}</p>
      <div class="confirm-buttons">
        <button class="btn btn-danger btn-sm" @click="onConfirm">Delete</button>
        <button ref="cancelBtn" class="btn btn-secondary btn-sm" @click="onCancel">Cancel</button>
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
  data() {
    return {
      // The element focused before the dialog opened, so we can restore focus to
      // it on close (WCAG 2.4.3 Focus Order) — e.g. back to the Delete button.
      lastFocused: null
    }
  },
  watch: {
    // Move keyboard focus into the dialog when it opens so keyboard and screen
    // reader users land on a safe default (Cancel), and Escape can close it.
    visible(open) {
      if (open) {
        this.lastFocused = document.activeElement;
        this.$nextTick(() => {
          const btn = this.$refs.cancelBtn;
          if (btn) btn.focus();
        });
      } else {
        this.restoreFocus();
      }
    }
  },
  methods: {
    onConfirm() { this.$emit('confirm') },
    onCancel()  { this.$emit('cancel') },
    restoreFocus() {
      const el = this.lastFocused;
      this.lastFocused = null;
      if (el && typeof el.focus === 'function' && document.contains(el)) {
        el.focus();
      }
    },
    // Keep Tab focus inside the dialog while it is open (focus trap): the dialog
    // is modal, so focus must not escape to the (inert) page behind it.
    onTab(e) {
      const box = this.$refs.box;
      if (!box) return;
      const focusable = box.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
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
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
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
  color: var(--warn);
}
.confirm-message {
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
  color: var(--text);
  line-height: 1.5;
}
.confirm-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}
</style>
