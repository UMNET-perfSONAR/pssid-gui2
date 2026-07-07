<template>
  <div>
    <ConfirmModal
      :visible="showConfirm"
      :message="confirmMessage"
      @confirm="executeDeleteBatch"
      @cancel="showConfirm = false"
    />

    <PageHeader
      title="Batches"
      subtitle="Group jobs, schedules, and SSID profiles into deployable probe configurations"
      icon="work_history"
      :can-add="!isDisabled && !showAddBatch"
      add-label="Add Batch"
      @add="addBatchForm"
    />

    <div v-if="batchStore.isLoading===true" class="loading-state">
      <div class="spinner"></div>
      <span>Loading batches…</span>
    </div>

    <div class="list row">
      <div class="col-md-6" v-if="batchStore.batches.length === 0">
        <h3> Batch List </h3>
        <p> Batch list is empty </p>
      </div>
      <!-- batch list and regex search bar -->
      <div class="col-md-6" v-else>
        <h3> Batch List </h3>
        <itemList v-if="mount === true" :item-array="batchStore.batches" :display="showAddBatch"
          @updateActive="updateActiveBatch"></itemList>
      </div>
      <!-- Add batch form -->
      <div class="col-md-6" v-if="showAddBatch===true">
        <h3> Add Batch </h3>
        <form @submit.prevent="addBatch">
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label> Batch Name </label>
            <input
              type="text"
              placeholder="Enter batch name here"
              v-model="add_name"
              class="form-control"
            />
          </div>
          <div class="form-group">
            <label> Test Interface </label>
            <input
              type="text"
              placeholder="e.g. wlan0"
              v-model="add_test_interface"
              class="form-control"
            />
            <small v-if="addInterfaceError" class="text-danger">{{ addInterfaceError }}</small>
          </div>
          <div class="form-group">
            <label> SSID Profile Selection </label>
            <VueMultiselect
              v-model="add_ssid_profiles"
              :multiple="true"
              :close-on-select="false"
              :options="SsidStore.ssid_profiles.map(item=> item.name)"
            >
            </VueMultiselect>
          </div>
          <div class="form-group">
            <label> Job Selection </label>
            <VueMultiselect
              v-model="add_jobs"
              :multiple="true"
              :close-on-select="false"
              :options="JobStore.jobs.map(item=>item.name)"
            >
            </VueMultiselect>
          </div>
          <div class="form-group">
            <label> Schedule Selection </label>
            <VueMultiselect
              v-model="add_schedules"
              :multiple="true"
              :close-on-select="false"
              :options="scheduleStore.schedules.map(item=>item.name)"
            >
            </VueMultiselect>
          </div>
          <div class="form-group">
            <label> Priority </label>
            <input
              type="number"
              placeholder="0"
              class="form-control"
              v-model="add_priority"
            />
            <small v-if="addPriorityError" class="text-danger">{{ addPriorityError }}</small>
          </div>
          <div class="mb-3">
            <button class="btn btn-success" :disabled="!addBatchValid"> Add Batch </button>
          </div>
          </fieldset>
        </form>
      </div>
      <!-- Edit batch form -->
      <div class="col-md-6" v-else>
        <h3> Edit Batch </h3>
        <form @submit.prevent="editBatch">
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label> Batch Name </label>
            <input
              type="text"
              placeholder="Enter batch name here"
              v-model="currentItem.name"
              class="form-control"
            />
          </div>
          <div class="form-group">
            <label> Test Interface </label>
            <input
              type="text"
              placeholder="e.g. wlan0"
              v-model="currentItem.test_interface"
              class="form-control"
            />
            <small v-if="editInterfaceError" class="text-danger">{{ editInterfaceError }}</small>
          </div>
          <div class="form-group">
            <label> SSID Profile Selection </label>
            <VueMultiselect
              v-model="currentItem.ssid_profiles"
              :multiple="true"
              :close-on-select="false"
              :options="SsidStore.ssid_profiles.map(item=> item.name)"
            >
            </VueMultiselect>
          </div>
          <div class="form-group">
            <label> Job Selection </label>
            <VueMultiselect
              v-model="currentItem.jobs"
              :multiple="true"
              :close-on-select="false"
              :options="JobStore.jobs.map(item=>item.name)"
            >
            </VueMultiselect>
          </div>
          <div class="form-group">
            <label> Schedule Selection </label>
            <VueMultiselect
              v-model="currentItem.schedules"
              :multiple="true"
              :close-on-select="false"
              :options="scheduleStore.schedules.map(item=>item.name)"
            >
            </VueMultiselect>
          </div>
          <div class="form-group">
            <label> Priority </label>
            <input
              type="number"
              placeholder="0"
              class="form-control"
              required
              v-model="currentItem.priority"
            />
            <small v-if="editPriorityError" class="text-danger">{{ editPriorityError }}</small>
          </div>
          <div class="d-flex flex-wrap mb-3" style="gap: 0.5rem;">
            <button class="btn btn-success" :disabled="!editBatchValid"> Update </button>
            <button class="btn btn-danger" type="button" @click="requestDeleteBatch"> Delete </button>
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
 import { useBatchStore } from '../stores/batches.store';
 import itemList from '../components/list_items.vue';
 import VueMultiselect from 'vue-multiselect';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';

 import { useSsidStore } from '../stores/ssid_profiles_stores';
 import { useJobStore } from '../stores/job_store';
 import { useScheduleStore } from '../stores/schedule_store';
 import { useUserStore } from '/src/stores/user.store';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName, validInterfaceName, validWholeNumber } from "../utils/validators.ts"

 export default {
   components: { itemList, VueMultiselect, ConfirmModal, PageHeader },
   data() {
     return {
       showAddBatch: true,

       currentItem: {},
       currentIndex: {},
       old_batchname: '',

       mount: false,

       // Add-batch form fields.
       add_name: '',
       add_test_interface: '',
       add_ssid_profiles: [],
       add_jobs: [],
       add_schedules: [],
       add_priority: 0,

       showConfirm: false,
       confirmMessage: '',

       batchStore: useBatchStore(),
       SsidStore: useSsidStore(),
       JobStore: useJobStore(),
       scheduleStore: useScheduleStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },
   async mounted() {
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }

     await this.batchStore.getBatches();
     await this.SsidStore.getSsidProfiles();
     await this.JobStore.getJobs();
     await this.scheduleStore.getSchedules();
     this.mount = true;
   },

   computed: {
     isDisabled() {
       return isFormDisabled();
     },
     addInterfaceError() {
       return this.add_test_interface ? validInterfaceName(this.add_test_interface).error : '';
     },
     addPriorityError() {
       return String(this.add_priority) !== '' ? validWholeNumber(this.add_priority).error : '';
     },
     addBatchValid() {
       return validName(this.add_name).valid &&
              validInterfaceName(this.add_test_interface).valid &&
              validWholeNumber(this.add_priority).valid;
     },
     editInterfaceError() {
       return this.currentItem.test_interface ? validInterfaceName(this.currentItem.test_interface).error : '';
     },
     editPriorityError() {
       return String(this.currentItem.priority ?? '') !== '' ? validWholeNumber(this.currentItem.priority).error : '';
     },
     editBatchValid() {
       return validName(this.currentItem.name || '').valid &&
              validInterfaceName(this.currentItem.test_interface || '').valid &&
              validWholeNumber(this.currentItem.priority).valid;
     }
   },

   methods: {
     addBatchForm() {
       this.showAddBatch = true;
       this.currentItem = {};
       this.currentIndex = {};
     },

     updateActiveBatch(indexArray) {
       this.currentItem = indexArray[0];
       this.currentIndex = indexArray[1];
       this.showAddBatch = false;
       this.old_batchname = this.currentItem.name;
     },

     async addBatch() {
       await this.batchStore.addBatch({
         name: this.add_name,
         test_interface: this.add_test_interface,
         priority: this.add_priority,
         ssid_profiles: this.add_ssid_profiles,
         jobs: this.add_jobs,
         schedules: this.add_schedules,
       });
       this.add_name = '';
       this.add_test_interface = '';
       this.add_ssid_profiles = [];
       this.add_jobs = [];
       this.add_schedules = [];
       this.add_priority = 0;
       this.addBatchForm();
     },

     async editBatch() {
       const updated_batch = {
         "old_batchname": this.old_batchname,
         "new_batchname": this.currentItem.name,
         "priority": this.currentItem.priority,
         "ssid_profiles": this.currentItem.ssid_profiles,
         "schedules": this.currentItem.schedules,
         "jobs": this.currentItem.jobs || [],
         "test_interface": this.currentItem.test_interface,
       };
       await this.batchStore.editBatch(updated_batch);
       await this.batchStore.getBatches();
       this.currentItem = this.batchStore.batches[this.currentIndex];
       this.updateActiveBatch([this.currentItem, this.currentIndex]);
     },

     requestDeleteBatch() {
       this.confirmMessage = `Delete batch "${this.currentItem.name}"? This cannot be undone.`;
       this.showConfirm = true;
     },

     async executeDeleteBatch() {
       this.showConfirm = false;
       const deleteIndex = this.currentIndex;
       this.batchStore.batches.splice(deleteIndex, 1);
       await this.batchStore.deleteBatch(this.currentItem);
       if (this.batchStore.batches.length <= deleteIndex) {
         this.addBatchForm();
       } else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.batchStore.batches[deleteIndex];
         this.updateActiveBatch([this.currentItem, this.currentIndex]);
       }
     }
   }
 }
</script>
