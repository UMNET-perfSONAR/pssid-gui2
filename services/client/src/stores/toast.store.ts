import { defineStore } from 'pinia'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ActivityEntry extends Toast {
  at: Date
}

// Monotonic id: Date.now() collides when two toasts fire in the same
// millisecond, which made dismissing one dismiss both.
let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
    // Rolling log of past notifications, newest first. Pages render this as
    // "Recent activity" so feedback outlives the transient snackbar.
    history: [] as ActivityEntry[]
  }),
  actions: {
    show(message: string, type: 'success' | 'error' | 'info' = 'info') {
      const id = nextId++
      this.toasts.push({ id, message, type })
      this.history.unshift({ id, message, type, at: new Date() })
      if (this.history.length > 20) this.history.pop()
      setTimeout(() => this.dismiss(id), 4500)
    },
    dismiss(id: number) {
      this.toasts = this.toasts.filter(t => t.id !== id)
    }
  }
})
