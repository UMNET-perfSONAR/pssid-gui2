import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'
import { errorMessage } from '../utils/http'
import { describeCron } from '../utils/validators'

export const useScheduleStore = defineStore('scheduleStore', {
  state: () => ({
    schedules: [] as any[],
    // True only while the list itself is being (re)loaded. Add/update/delete
    // report their outcome via their return value and a toast instead of
    // flashing the page-level spinner.
    isLoading: false
  }),

  // Every mutating action resolves to true on success and false on failure,
  // so a view can keep the user's typed input when the server says no.
  actions: {
    async getSchedules(): Promise<boolean> {
      this.isLoading = true;
      try {
        const res = await fetch('/api/schedules', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load schedules'), 'error');
          return false;
        }
        this.schedules = await res.json();
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to load schedules', 'error');
        return false;
      }
      finally {
        this.isLoading = false;
      }
    },

    async addSchedule(schedule: any): Promise<boolean> {
      try {
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
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to add schedule'), 'error');
          return false;
        }
        this.schedules.push(schedule);
        useToastStore().show(`Schedule "${schedule.name}" added (runs ${describeCron(schedule.repeat)})`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to add schedule', 'error');
        return false;
      }
    },

    async updateSchedule(updateScheduleObj: any): Promise<boolean> {
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
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to update schedule'), 'error');
          return false;
        }
        useToastStore().show(`Schedule "${updateScheduleObj.new_schedule}" updated (runs ${describeCron(updateScheduleObj.repeat)})`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to update schedule', 'error');
        return false;
      }
    },

    async deleteSchedule(schedule: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/schedules/' + encodeURIComponent(schedule.name),
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to delete schedule'), 'error');
          return false;
        }
        useToastStore().show(`Schedule "${schedule.name}" deleted`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to delete schedule', 'error');
        return false;
      }
    }
  }
})
