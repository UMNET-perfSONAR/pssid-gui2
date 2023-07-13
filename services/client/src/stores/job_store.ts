// allows us to make a store
import {defineStore} from 'pinia'

export const useJobStore = defineStore('jobStore', {
    // create a state object -> can have different properties 
    state: () => ({
        // TODO: SET TASKS => HOSTS AND MAKE A GET REQUEST HERE TO SET = TO
        jobs: [{}],
        isLoading: false
    }),

    actions: {
        // TODO: Use Axios?? 
        async getJobs() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/jobs')
            const data = await res.json()
            this.jobs = data;
            this.isLoading = false;
        },

        // add job to an array. take a job object and add to array
        async addJob(job:any) {
            this.isLoading = true;
            
            await fetch(
                "http://localhost:8000/jobs/create-job",
                {
                    method: 'POST',
                    body: JSON.stringify(job),
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
            this.jobs.push(job);
            this.isLoading=false;
                   // using json will include the job's unique id 
        },

        /**
         * Delete job from database and remove component from front end
         * @param job - Job we want to delete 
         */
        async deleteJob(job:any) {
            console.log('hi');
            await fetch(
                "http://localhost:8000/jobs/"+job.name,
                {
                    method: 'DELETE',
                }
            );
                
        },

        async deleteAll() {
            await fetch(
                "http://localhost:8000/jobs",
                {
                    method: 'DELETE',
                }
            );
            this.jobs = [];
        },
        async updateJob(updatedJobObj) {
            await fetch(
                "http://localhost:8000/jobs/update-job",
                {
                    method: "PUT",
                    mode: "cors",
                    body: JSON.stringify(updatedJobObj),
                    headers: {
                        "Content-Type": "application/json"
                    }
 
                }
            )
        }
    }
})

