import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'
import { errorMessage } from '../utils/http'

export const useJobStore = defineStore('jobStore', {
  state: () => ({
    jobs: [] as any[],
    isLoading: false,
    isError: false
  }),

  // Every mutating action resolves to true on success and false on failure,
  // so a view can keep the user's typed input when the server says no.
  actions: {
    async getJobs(): Promise<boolean> {
      this.isLoading = true;
      try {
        const res = await fetch('/api/jobs', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load jobs'), 'error');
          return false;
        }
        this.jobs = await res.json();
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load jobs', 'error');
        return false;
      }
      finally {
        this.isLoading = false;
      }
    },

    async addJob(job: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/jobs/create-job',
          {
            method: 'POST',
            body: JSON.stringify(job),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to add job'), 'error');
          return false;
        }
        this.jobs.push(job);
        useToastStore().show(`Job "${job.name}" added`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add job', 'error');
        return false;
      }
    },

    async deleteJob(job: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/jobs/' + encodeURIComponent(job.name),
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to delete job'), 'error');
          return false;
        }
        useToastStore().show(`Job "${job.name}" deleted`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete job', 'error');
        return false;
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

    async updateJob(updatedJobObj: any): Promise<boolean> {
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
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to update job'), 'error');
          return false;
        }
        useToastStore().show(`Job "${updatedJobObj.new_job}" updated`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update job', 'error');
        return false;
      }
    }
  }
})
