import {defineStore} from 'pinia'

export const useJobStore = defineStore('jobStore', {
  state: () => ({
    jobs: [{}],
    isLoading: false,
    isError: false
  }),

  actions: {
    /**
     * Retrive all jobs from database
     */
    async getJobs() {
      try {
        this.isLoading = true;
        const res = await fetch('http://'+ window.location.hostname +':8000/jobs')
        const data = await res.json()
        this.jobs = data;
        this.isLoading = false;
        // return data;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        // return [];
      }
    },

    /**
     * Call on server to add to mongodb. Append job object to host array.
     * @param job - job info from user input
     */
    async addJob(job:any) {
      try {
        this.isLoading = true;
        console.log(job);
        const response = await fetch(
          'http://'+ window.location.hostname +':8000/jobs/create-job',
          {
            method: 'POST',
            body: JSON.stringify(job),
            headers: {
              "Content-Type": "application/json"
            }
          }
        );

	if (response.ok) {
          this.jobs.push(job);
	}
	else {
	  const errorData = await response.json();
	  alert(errorData.message);
	}

        this.isLoading=false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    /**
     * Delete job from database and remove component from front end
     * @param job - Job we want to delete 
     */
    async deleteJob(job:any) {
      try {
        await fetch(
          'http://'+ window.location.hostname +':8000/jobs/'+job.name,
          {
            method: 'DELETE',
          }
        );
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    /**
     * delete all jobs from database 
     */
    async deleteAll() {
      try {
        await fetch(
          'http://'+ window.location.hostname +':8000/jobs',
          {
            method: 'DELETE',
          }
        );
        this.jobs = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },
    
    /** 
     * Call on server to update current job object
     * @param updateJobObj - includes all necessary information to update job
     */
    async updateJob(updatedJobObj) {
      try {
        const response = await fetch(
          'http://'+ window.location.hostname +':8000/jobs/update-job',
          {
            method: "PUT",
            mode: "cors",
            body: JSON.stringify(updatedJobObj),
            headers: {
              "Content-Type": "application/json"
            }
	    
          }
        );
	if (response.ok) {
	  alert("Job updated successfully!");
	}
	else {
	  const errorData = await response.json();
	  alert(errorData.message);
	}
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    }
  }
})
