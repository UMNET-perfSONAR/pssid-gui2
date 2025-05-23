<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="jobStore.isLoading===true">
      <p> Loading Job page </p>
    </div>

    <!-- Add job button -->
    <div>
      <button style="margin-bottom: 2em;" v-if="showAddJob"></button>
      <button @click="addJobForm" class="btn btn-primary" v-if="!showAddJob"
        style="margin-bottom: 1em;"> Add Job </button>
    </div>
    <h3> Job List (INACTIVE)</h3>
    <div class="list row"> 
      <!-- job list and regex search bar-->
      <itemList v-if="mount ==true" :itemArray="jobStore.jobs" :display="showAddJob" 
        @updateActive="setActiveJob" style="cursor:pointer;"
        class="col-md-6"></itemList>

      <!-- Add Form -->
      <div class="col-md-6" v-if="showAddJob==true">
        <h3> Add Job </h3>
        <form @submit.prevent="submitJob"> 
          <div class="submit-form">
            <!-- Job name text box -->
            <div class="form-group">
              <label> Job Name </label>
              <input
                type="text"
                placeholder="Enter job name"
                required
                id="name"
                class="form-control"
                v-model="jobName"
              />
            </div>

            <!-- Test selection dropdown menu -->
            <div class="form-group"> 
              <label> Test Selection </label>
              <VueMultiselect
                v-model="selected_tests"
                :multiple="true"
                :close-on-select="false"
                :options="testStore.tests"
                track-by="name"
                label="name"
              >
              </VueMultiselect>
            </div>

            <!-- Continue -If radio buttons -->
            <div class="form-group">
              <label style="margin-right:1em"> Continue-If:</label>
              <input
                type="text"
                placeholder="Enter here"
                required
                id="name"
                class="form-control"
                v-model="continue_if"
              />
            </div>

            <!-- Backoff input field -->
            <div class="form-group">
              <label style="margin-right:1em"> Backoff:</label>
              <input
                type="text"
                placeholder="Enter here"
                required
                id="name"
                class="form-control"
                v-model="backoff"
              />
            </div>

            <button class="btn btn-success"
              style="margin-right: 1em;"> Submit </button>
          </div>
        </form>
      </div>

      <!-- Edit Job Form -->
      <div class="col-md-6" v-if="showAddJob==false">
        <h3> Edit Job </h3>
        <form @submit.prevent="editJob"> 
          <div class="submit-form">
            <!-- Job name text box -->
            <div class="form-group">
              <label> Job Name </label>
              <input
                type="text"
                placeholder="Enter job name"
                required
                id="name"
                class="form-control"
                v-model="currentItem.name"
              />
            </div>

            <!-- Test selection dropdown menu -->
            <div class="form-group"> 
              <label> Test Selection </label>
              <VueMultiselect
                v-model="currentItem.tests"
                :multiple="true"
                :close-on-select="false"
                :options="testStore.tests.map(item=>item.name)"
              >
              </VueMultiselect>
            </div>

            <!-- Continue -If radio buttons -->
            <div class="form-group">
              <label style="margin-right:1em"> Continue-If:</label>
              <input
                type="text"
                placeholder="Enter here"
                required
                id="name"
                class="form-control"
                v-model="currentItem['continue-if']"
              />
            </div>

            <!-- Backoff input field -->
            <div class="form-group">
              <label style="margin-right:1em"> Backoff:</label>
              <input
                type="text"
                placeholder="Enter here"
                required
                id="name"
                class="form-control"
                v-model="currentItem.backoff"
              />
            </div>

            <div>
              <button class="btn btn-success" style="margin-right: 1em;"> Update </button>
              <button class="btn btn-danger" @click.prevent="deleteJob"> Delete </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  </div>
</template>

<script>
 import { useJobStore } from '../stores/job_store.ts'
 import { useTestStore } from '../stores/test_store.ts';
 import VueMultiselect from 'vue-multiselect';
 import itemList from '../components/list_items.vue'

 export default {
   components: { VueMultiselect, itemList },
   data() {
     return {
       /*
        * Variables for the Add Job page
        */
       jobName: '',
       selected_tests: [],
       continue_if: 'true',
       backoff: "PT1S",

       /*
        * Variables that control which form is displayed,
        * Add Job or Edit Job.
        */
       showAddJob: true,

       /*
        * Variables for the Edit Job page
        */
       currentItem: {},
       currentIndex: {},
       old_job_name: '',

       mount: false,

       // Methods to access the store
       jobStore: useJobStore(),
       testStore: useTestStore(),
     }
   },

   // Loads jobs and tests ahead of time
   async mounted() {
     await this.jobStore.getJobs();
     await this.testStore.getTests();
     this.mount = true;
   },

   methods: {
     // Renders the Add Job form
     addJobForm() {
       this.showAddJob = true;

       this.jobName = '';
       this.selected_tests = [];
       this.continue_if = 'true';
       this.backoff = "PT1S";
     },

     // Renders the Edit Job form for a selected job
     setActiveJob(indexArray) {
       this.currentItem = indexArray[0];
       this.currentIndex = indexArray[1];
       this.showAddJob = false;
       this.old_job_name = this.currentItem.name;
     },

     // Creates a new job
     submitJob() {
       if (!this.validateNoWhitespace(this.backoff)) {
         alert("Backoff cannot contain whitespace");
         return;
       }
       if(this.jobName.length > 0) {
         this.jobStore.addJob({
           name: this.jobName,
           tests: (this.selected_tests.length == 0)? [] : this.selected_tests.map(obj => obj.name),
           "continue-if": this.continue_if,
           backoff: this.backoff
         })
         // Clear the form to allow users to add a new job.
         this.addJobForm();
       }
       else {
         alert("Please enter a job name");
       }
     },

     // Deletes a job
     async deleteJob() {
       const deleteIndex = this.currentIndex;
       this.jobStore.jobs.splice(deleteIndex, 1);
       await this.jobStore.deleteJob(this.currentItem);
       if (this.jobStore.jobs.length <= deleteIndex) {
         this.addJobForm();
       }
       else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.jobStore.jobs[deleteIndex];
         this.setActiveJob([this.currentItem, this.currentIndex]);
       }
     },

     // Edits a selected job
     async editJob() {
       if (!this.validateNoWhitespace(this.currentItem.backoff)) {
         alert("Backoff cannot contain whitespace");
         this.currentItem = this.jobStore.jobs[this.currentIndex];
         this.setActiveJob([this.currentItem, this.currentIndex]);
         return;
       }
       await this.jobStore.updateJob({
         old_job: this.old_job_name,
         new_job: this.currentItem.name,
         "continue-if": this.currentItem['continue-if'],
         tests: this.currentItem.tests,
         backoff: this.currentItem.backoff
       });
       await this.jobStore.getJobs();

       this.currentItem = this.jobStore.jobs[this.currentIndex];
       this.setActiveJob([this.currentItem, this.currentIndex]);
     },

     validateNoWhitespace(input) {
       const whitespace = /\s/;
       return !whitespace.test(input);
     }
   } 
 }
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
