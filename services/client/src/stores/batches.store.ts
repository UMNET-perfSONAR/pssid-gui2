import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useBatchStore = defineStore('batchStore', {
  state: () => ({
    batches: [{}],
    isLoading: false,
    isError: false
  }),

  actions: {
    async getBatches() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/batches', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.batches = data;
        this.isLoading = false;
        return data;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load batches', 'error');
      }
    },

    async addBatch(batch:any) {
      try {
        this.isLoading = true;
        const response = await fetch(
          '/api/batches/create-batch',
          {
            method: 'POST',
            body: JSON.stringify(batch),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );

        if (response.ok) {
          this.batches.push(batch);
          useToastStore().show('Batch added successfully', 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add batch', 'error');
        }

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add batch', 'error');
      }
    },

    async editBatch(updated_batch_obj: JSON) {
      try {
        const response = await fetch(
          '/api/batches/update-batch',
          {
            method: "PUT",
            mode: "cors",
            body: JSON.stringify(updated_batch_obj),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show('Batch updated successfully', 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update batch', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update batch', 'error');
      }
    },

    async deleteBatch(batch:any) {
      try {
        const response = await fetch(
          '/api/batches/' + batch.name,
          {
            method: 'DELETE',
            mode: 'cors',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Batch "${batch.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete batch', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete batch', 'error');
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/batches', {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.batches = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },
  }
})
