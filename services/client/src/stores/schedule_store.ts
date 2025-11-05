import {defineStore} from 'pinia'
import config from '../shared/config' 

export const useScheduleStore = defineStore('scheduleStore', {
  // create a state object -> can have different properties 
  state: () => ({
    schedules: [{}],
    isLoading: false
  }),

  actions: {
    async getSchedules() {
      this.isLoading = true;
      const res = await fetch(
        '/api/schedules',
        {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        }
      );
      const data = await res.json();
      this.schedules = data;
      this.isLoading = false;
    },

    async addSchedule(schedule:JSON) {
      this.isLoading = true;
      const response = await fetch(
        '/api/schedules/create-schedule',
        {
          method: 'POST',
          body: JSON.stringify(schedule),
          mode: 'cors',
          headers: {
            "Content-Type": "application/json"
          },
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        }
      );

      if (response.ok) {
	this.schedules.push(schedule);
      }
      else {
	const errorData = await response.json();
	alert(errorData.message);
      }

      this.isLoading=false;
    },

    async deleteSchedule(schedule:any) {
      await fetch(
        '/api/schedules/'+schedule.name,
        {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        }
      );
    },
    async updateSchedule(updateScheduleObj:any) {
      const response = await fetch(
        '/api/schedules/update-schedule',
        {
          method: "PUT",
          mode: "cors",
          body: JSON.stringify(updateScheduleObj),
          headers: {
            "Content-Type": "application/json"
          },
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        }
      );
      if (response.ok) {
	alert("Schedule updated successfully");
      }
      else {
	const errorData = await response.json();
	alert(errorData.message);
      }
    }

  }
})
