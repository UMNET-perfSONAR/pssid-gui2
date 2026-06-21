import { defineStore } from 'pinia'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[]
  }),
  actions: {
    show(message: string, type: 'success' | 'error' | 'info' = 'info') {
      const id = Date.now()
      this.toasts.push({ id, message, type })
      setTimeout(() => this.dismiss(id), 4500)
    },
    dismiss(id: number) {
      this.toasts = this.toasts.filter(t => t.id !== id)
    }
  }
})
