import {defineStore} from 'pinia'

export const useScheduleStore = defineStore('scheduleStore', {
    // create a state object -> can have different properties 
    state: () => ({
        schedules: [{}],
        isLoading: false
    }),

    actions: {
        async getSchedules() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/schedules')
            const data = await res.json()
            this.schedules = data;
            this.isLoading = false;
        },

        async addSchedule(schedule:JSON) {
            this.isLoading = true;
            await fetch(
                "http://localhost:8000/schedules/create-schedule",
                {
                    method: 'POST',
                    body: JSON.stringify(schedule),
                    mode: 'cors',
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
            this.schedules.push(schedule);
            // TODO - Add to filtered data?? refilter data? - yes 
            this.isLoading=false;
        },

        async deleteSchedule(schedule:any) {
            await fetch(
                "http://localhost:8000/schedules/"+schedule.name,
                {
                    method: 'DELETE',
                }
            );
        },

    }
})