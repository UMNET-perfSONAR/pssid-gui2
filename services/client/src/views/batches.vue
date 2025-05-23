<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="batchStore.isLoading===true">
      <p> Loading Batch page </p>
    </div>

    <!-- Add batch button -->
    <div>
      <button style="margin-bottom: 2em;" v-if="showAddBatch"></button>
      <button @click="addBatchForm" class="btn btn-primary" v-if="!showAddBatch"
        style="margin-bottom: 1em;">
        Add Batch 
      </button>
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
        <dynamicform @formData="addBatch" :form_layout="form_layout">
        </dynamicform>
        <div>
        </div>
      </div>
      <!-- Edit batch form -->
      <div class="col-md-6" v-else> 
        <h3> Edit Batch </h3>
        <form @submit.prevent="editBatch">
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
              placeholder="Enter here"
              v-model="currentItem.test_interface"
              class="form-control"
            />
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
          <!-- job selection (INACTIVE) -->
          <!-- <div class="form-group"> 
            <label> Job Selection </label>
            <VueMultiselect
              v-model="currentItem.jobs"
              :multiple="true"
              :close-on-select="false"
              :options="JobStore.jobs.map(item=>item.name)"
            >
            </VueMultiselect>
          </div> -->

          <!-- job selection-->
          <div class="form-group"> 
            <label> Test Selection </label>
            <VueMultiselect
              v-model="currentItem.tests"
              :multiple="true"
              :close-on-select="false"
              :options="TestStore.tests.map(item=>item.name)"
            >
            </VueMultiselect>
          </div>
          <!-- schedule selection -->
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
          <!-- priority-->
          <div class="form-group">
            <label> Priority </label>
            <input
              type="number"
              placeholder="0"
              class="form-control"
              required
              v-model="currentItem.priority"
            />
          </div>
          <!-- BUTTONS -->
          <div style="margin-bottom:2em">
            <button class="btn btn-success" style="margin-right:1em"> Update </button>
            <button class="btn btn-danger" @click="deleteBatch" type="button"> Delete </button>
          </div>

        </form> 
      </div>
    </div>
  </div>
</template>

<script>
 import { useBatchStore } from '../stores/batches.store';
 import itemList from '../components/list_items.vue';
 import dynamicform  from '../components/dynamicform.vue';
 import VueMultiselect from 'vue-multiselect'

 import { useSsidStore } from '../stores/ssid_profiles_stores';
//  import { useJobStore } from '../stores/job_store';
 import { useScheduleStore } from '../stores/schedule_store';
 import { useTestStore } from '../stores/test_store';
 
 export default {
   components: { itemList, dynamicform, VueMultiselect },
   data() {
     return {
       /*
        * Variables for the Add Batch page
        */
       batch_name: '',
       ssid_selection: [],


       /*
        * Variable that controls which page to display,
        * Add Batch or Edit Batch.
        */
       showAddBatch: true,

       /*
        * Variables for the Edit Batch page
        */
       currentItem: {},
       currentIndex: {},
       old_batchname: '',

       mount: false,
       form_layout: [],

       // Methods to access the store
       batchStore: useBatchStore(),
       SsidStore: useSsidStore(),
      //  JobStore: useJobStore(),
       TestStore: useTestStore(),
       scheduleStore: useScheduleStore(),
     }
   },
   async mounted() {
     await this.batchStore.getBatches();
     await this.SsidStore.getSsidProfiles();
    //  await this.JobStore.getJobs();
    await this.TestStore.getTests();
     await this.scheduleStore.getSchedules();
     // hardcode layout of batches form - edit this to add more fields
     this.form_layout = [
       {
         'type': 'text',
         'name': 'Batch Name'
       },
       {
         'type': 'text',
         'name': 'Test Interface'
       },
       {
         'type': 'multiselect',
         'name': 'SSID Profile',
         'options': this.SsidStore.ssid_profiles
       },
      //  {
      //    'type': 'multiselect',
      //    'name': 'Job Selection',
      //    'options': this.JobStore.jobs
      //  },
       {
         'type': 'multiselect',
         'name': 'Test Selection',
         'options': this.TestStore.tests
       },
       {
         'type': 'multiselect',
         'name': 'Schedule Selection',
         'options': this.scheduleStore.schedules
       },
       {
         'type': 'number',
         'name': 'Priority',
       },
     ];
     this.mount = true;
   },
   methods: {
     // render add batch form 
     addBatchForm() {
       this.showAddBatch=true;
       this.currentItem={};
       this.currentIndex={}
     },
     /**
      * Change active batch to match item and index from itemList component
      * @param {item, index} indexArray 
      */
     updateActiveBatch(indexArray) {
       this.currentItem=indexArray[0];
       this.currentIndex=indexArray[1];
       this.showAddBatch = false;
       this.old_batchname=this.currentItem.name;
     },
     
     /**
      * 
      * @param {name, ssid_profiles, tests, schedules, priority, TTL} form_data // replaced jobs with tests
      */
     async addBatch(form_data) {
       await this.batchStore.addBatch({
         name: form_data[0].value,
         test_interface: form_data[1].value,
         priority: form_data[5].value,
         ssid_profiles: (form_data[2].selected.length == 0)? [] : form_data[2].selected.map(obj => obj.name),
         schedules: (form_data[4].selected.length == 0)? [] : form_data[4].selected.map(obj => obj.name),
        //  jobs: (form_data[3].selected.length == 0)? [] : form_data[3].selected.map(obj => obj.name),
         tests: (form_data[3].selected.length == 0)? [] : form_data[3].selected.map(obj => obj.name),
       });
       this.addBatchForm();
     },

     // Edits a selected batch
     async editBatch() {
       const updated_batch = {
         "old_batchname":this.old_batchname,
         "new_batchname":this.currentItem.name,
         "priority": this.currentItem.priority,
         "ssid_profiles": this.currentItem.ssid_profiles,
         "schedules": this.currentItem.schedules,
        //  "jobs": this.currentItem.jobs,
         "tests": this.currentItem.tests,
         "test_interface": this.currentItem.test_interface
       };
       await this.batchStore.editBatch(updated_batch);
       await this.batchStore.getBatches();

       this.currentItem = this.batchStore.batches[this.currentIndex];
       this.updateActiveBatch([this.currentItem, this.currentIndex]);
     },

     // Deletes a batch
     async deleteBatch() {
       const deleteIndex = this.currentIndex;
       this.batchStore.batches.splice(deleteIndex, 1);
       await this.batchStore.deleteBatch(this.currentItem);
       if (this.batchStore.batches.length <= deleteIndex) {
         this.addBatchForm();
       }
       else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.batchStore.batches[deleteIndex];
         this.updateActiveBatch([this.currentItem, this.currentIndex]);
       }
     }
   }
 }
</script>
