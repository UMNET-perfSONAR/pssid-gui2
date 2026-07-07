<template>
  <div>
    <ConfirmModal
      :visible="showConfirm"
      :message="confirmMessage"
      @confirm="executeDeleteJob"
      @cancel="showConfirm = false"
    />

    <PageHeader
      title="Jobs"
      subtitle="Combine tests into reusable job configurations"
      icon="folder_copy"
      :can-add="true"
      :add-disabled="isDisabled || (showAddJob && !addJobValid)"
      add-label="Add Job"
      @add="onHeaderAdd"
    />

    <div v-if="jobStore.isLoading===true" class="loading-state">
      <div class="spinner"></div>
      <span>Loading jobs…</span>
    </div>

    <h3> Job List </h3>
    <div class="list row">
      <!-- job list and regex search bar-->
      <itemList v-if="mount ==true" :itemArray="jobStore.jobs" :display="showAddJob"
        @updateActive="setActiveJob" style="cursor:pointer;"
        class="col-md-6"></itemList>

      <!-- Add Form -->
      <div class="col-md-6" v-if="showAddJob==true">
        <h3> Add Job </h3>
        <form @submit.prevent="submitJob">
          <fieldset :disabled="isDisabled">
          <div class="submit-form">
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

            <div class="form-group">
              <label style="margin-right:1em"> Continue-If (jq):</label>
              <input
                type="text"
                placeholder="jq expression, e.g. true"
                required
                class="form-control"
                v-model="continue_if"
              />
              <small v-if="continueIfError" class="text-danger">{{ continueIfError }}</small>
            </div>

            <div class="form-group">
              <label style="margin-right:1em"> Backoff (ISO 8601 duration):</label>
              <input
                type="text"
                placeholder="e.g. PT1S, PT30S, PT5M"
                required
                class="form-control"
                v-model="backoff"
              />
              <small v-if="backoffError" class="text-danger">{{ backoffError }}</small>
            </div>
          </div>
          </fieldset>
        </form>
      </div>

      <!-- Edit Job Form -->
      <div class="col-md-6" v-if="showAddJob==false">
        <h3> Edit Job </h3>
        <form @submit.prevent="editJob">
          <fieldset :disabled="isDisabled">
          <div class="submit-form">
            <div class="form-group">
              <label> Job Name </label>
              <input
                type="text"
                placeholder="Enter job name"
                required
                class="form-control"
                v-model="currentItem.name"
              />
            </div>

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

            <div class="form-group">
              <label style="margin-right:1em"> Continue-If (jq):</label>
              <input
                type="text"
                placeholder="jq expression, e.g. true"
                required
                class="form-control"
                v-model="currentItem['continue-if']"
              />
              <small v-if="editContinueIfError" class="text-danger">{{ editContinueIfError }}</small>
            </div>

            <div class="form-group">
              <label style="margin-right:1em"> Backoff (ISO 8601 duration):</label>
              <input
                type="text"
                placeholder="e.g. PT1S, PT30S, PT5M"
                required
                class="form-control"
                v-model="currentItem.backoff"
              />
              <small v-if="editBackoffError" class="text-danger">{{ editBackoffError }}</small>
            </div>

            <div class="d-flex flex-wrap" style="gap: 0.5rem;">
              <button class="btn btn-success" :disabled="!editJobValid"> Update </button>
              <button class="btn btn-danger" type="button" @click="requestDeleteJob"> Delete </button>
            </div>
          </div>
          </fieldset>
        </form>
      </div>
    </div>

    <RecentActivity />
  </div>
</template>

<script>
 import { useJobStore } from '../stores/job_store.ts'
 import { useTestStore } from '../stores/test_store.ts';
 import { useUserStore } from '/src/stores/user.store';
 import VueMultiselect from 'vue-multiselect';
 import itemList from '../components/list_items.vue';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';
 import RecentActivity from '../components/RecentActivity.vue'
 import { useToastStore } from '../stores/toast.store';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName, validIso8601Duration, validJqClause } from "../utils/validators.ts"

 export default {
   components: { VueMultiselect, itemList, ConfirmModal, PageHeader, RecentActivity },
   data() {
     return {
       jobName: '',
       selected_tests: [],
       continue_if: 'true',
       backoff: "PT1S",

       showAddJob: true,

       currentItem: {},
       currentIndex: {},
       old_job_name: '',

       mount: false,

       showConfirm: false,
       confirmMessage: '',

       jobStore: useJobStore(),
       testStore: useTestStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },

   async mounted() {
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     await this.jobStore.getJobs();
     await this.testStore.getTests();
     this.mount = true;
   },

   computed: {
     isDisabled() {
       return isFormDisabled();
     },
     backoffError() {
       return this.backoff ? validIso8601Duration(this.backoff).error : '';
     },
     continueIfError() {
       return this.continue_if ? validJqClause(this.continue_if).error : '';
     },
     addJobValid() {
       return validName(this.jobName).valid &&
              validIso8601Duration(this.backoff).valid &&
              validJqClause(this.continue_if).valid;
     },
     editBackoffError() {
       return this.currentItem.backoff ? validIso8601Duration(this.currentItem.backoff).error : '';
     },
     editContinueIfError() {
       return this.currentItem['continue-if'] ? validJqClause(this.currentItem['continue-if']).error : '';
     },
     editJobValid() {
       return validName(this.currentItem.name || '').valid &&
              validIso8601Duration(this.currentItem.backoff || '').valid &&
              validJqClause(this.currentItem['continue-if'] || '').valid;
     }
   },

   methods: {
     addJobForm() {
       this.showAddJob = true;
       this.jobName = '';
       this.selected_tests = [];
       this.continue_if = 'true';
       this.backoff = "PT1S";
     },

     setActiveJob(indexArray) {
       this.currentItem = indexArray[0];
       this.currentIndex = indexArray[1];
       this.showAddJob = false;
       this.old_job_name = this.currentItem.name;
     },

     // The header "+ Add Job" button doubles as the submit control: it opens
     // a blank form when a job is shown, and saves the new job once every
     // field is valid.
     onHeaderAdd() {
       if (!this.showAddJob) {
         this.addJobForm();
       } else {
         this.submitJob();
       }
     },

     submitJob() {
       if (!this.addJobValid) {
         useToastStore().show('Please fix the highlighted fields', 'error');
         return;
       }
       if (this.jobName.length > 0) {
         this.jobStore.addJob({
           name: this.jobName,
           tests: (this.selected_tests.length == 0) ? [] : this.selected_tests.map(obj => obj.name),
           "continue-if": this.continue_if,
           backoff: this.backoff
         });
         this.addJobForm();
       } else {
         useToastStore().show("Please enter a job name", 'error');
       }
     },

     requestDeleteJob() {
       this.confirmMessage = `Delete job "${this.currentItem.name}"? This cannot be undone.`;
       this.showConfirm = true;
     },

     async executeDeleteJob() {
       this.showConfirm = false;
       const deleteIndex = this.currentIndex;
       this.jobStore.jobs.splice(deleteIndex, 1);
       await this.jobStore.deleteJob(this.currentItem);
       if (this.jobStore.jobs.length <= deleteIndex) {
         this.addJobForm();
       } else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.jobStore.jobs[deleteIndex];
         this.setActiveJob([this.currentItem, this.currentIndex]);
       }
     },

     async editJob() {
       if (!this.editJobValid) {
         useToastStore().show('Please fix the highlighted fields', 'error');
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
     }
   }
 }
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
