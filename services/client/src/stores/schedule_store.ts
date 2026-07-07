import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useScheduleStore = defineStore('scheduleStore', {
  state: () => ({
    schedules: [{}],
    isLoading: false
  }),

  actions: {
    async getSchedules() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/schedules', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.schedules = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to load schedules', 'error');
      }
    },

    async addSchedule(schedule:any) {
      try {
        this.isLoading = true;
        const response = await fetch(
          '/api/schedules/create-schedule',
          {
            method: 'POST',
            body: JSON.stringify(schedule),
            mode: 'cors',
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );

        if (response.ok) {
          this.schedules.push(schedule);
          useToastStore().show(`Schedule "${schedule.name}" added`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add schedule', 'error');
        }

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to add schedule', 'error');
      }
    },

    async deleteSchedule(schedule:any) {
      try {
        const response = await fetch(
          '/api/schedules/' + schedule.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Schedule "${schedule.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete schedule', 'error');
        }
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to delete schedule', 'error');
      }
    },

    async updateSchedule(updateScheduleObj:any) {
      try {
        const response = await fetch(
          '/api/schedules/update-schedule',
          {
            method: "PUT",
            mode: "cors",
            body: JSON.stringify(updateScheduleObj),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Schedule "${updateScheduleObj.new_schedule}" updated`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update schedule', 'error');
        }
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to update schedule', 'error');
      }
    }
  }
})
