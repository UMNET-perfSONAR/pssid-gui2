import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useJobStore = defineStore('jobStore', {
  state: () => ({
    jobs: [{}],
    isLoading: false,
    isError: false
  }),

  actions: {
    async getJobs() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/jobs', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.jobs = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load jobs', 'error');
      }
    },

    async addJob(job:any) {
      try {
        this.isLoading = true;
        const response = await fetch(
          '/api/jobs/create-job',
          {
            method: 'POST',
            body: JSON.stringify(job),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );

        if (response.ok) {
          this.jobs.push(job);
          useToastStore().show('Job added successfully', 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add job', 'error');
        }

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add job', 'error');
      }
    },

    async deleteJob(job:any) {
      try {
        const response = await fetch(
          '/api/jobs/' + job.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Job "${job.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete job', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete job', 'error');
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/jobs', {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.jobs = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    async updateJob(updatedJobObj: any) {
      try {
        const response = await fetch(
          '/api/jobs/update-job',
          {
            method: "PUT",
            mode: "cors",
            body: JSON.stringify(updatedJobObj),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show('Job updated successfully', 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update job', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update job', 'error');
      }
    }
  }
})
