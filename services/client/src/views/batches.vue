<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="batchStore.isLoading===true">
      <p> Loading Batch page </p>
    </div>

    <!-- Add batch button -->
    <div class="mb-3">
      <button @click="addBatchForm" class="btn btn-primary" v-if="!showAddBatch" :disabled="isDisabled">
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
        <fieldset :disabled="isDisabled">
        <div class="form-group">
          <label> Layer 2 Script </label>
          <select v-model="add_layer2_script" class="form-control">
            <option value="">-- Select Layer 2 Script --</option>
            <option v-for="script in layerScriptsStore.layer2_scripts" :key="script" :value="script">{{ script }}</option>
          </select>
        </div>
        <div class="form-group">
          <label> Layer 3 Script </label>
          <select v-model="add_layer3_script" class="form-control">
            <option value="">-- Select Layer 3 Script --</option>
            <option v-for="script in layerScriptsStore.layer3_scripts" :key="script" :value="script">{{ script }}</option>
          </select>
        </div>
        <div class="form-group">
          <label> Script </label>
          <select v-model="add_script" class="form-control">
            <option value="">-- Select Script --</option>
            <option v-for="script in scriptsStore.scripts" :key="script" :value="script">{{ script }}</option>
          </select>
        </div>
        <dynamicform @formData="addBatch" :form_layout="form_layout">
        </dynamicform>
      </fieldset>
        <div>
        </div>
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
          <!-- job selection -->
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
          <!-- layer 2 script selection -->
          <div class="form-group">
            <label> Layer 2 Script </label>
            <select v-model="currentItem.layer2_script" class="form-control">
              <option value="">-- Select Layer 2 Script --</option>
              <option v-for="script in layerScriptsStore.layer2_scripts" :key="script" :value="script">{{ script }}</option>
            </select>
          </div>
          <!-- layer 3 script selection -->
          <div class="form-group">
            <label> Layer 3 Script </label>
            <select v-model="currentItem.layer3_script" class="form-control">
              <option value="">-- Select Layer 3 Script --</option>
              <option v-for="script in layerScriptsStore.layer3_scripts" :key="script" :value="script">{{ script }}</option>
            </select>
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
          </fieldset>
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
 import { useJobStore } from '../stores/job_store';
 import { useScheduleStore } from '../stores/schedule_store';
 import { useLayerScriptsStore } from '../stores/layer_scripts_store';
 import { useScriptsStore } from '../stores/scripts_store';
 import { useUserStore } from '/src/stores/user.store';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 
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

       // Selections for the Add Batch form (tracked separately from dynamicform)
       add_layer2_script: '',
       add_layer3_script: '',
       add_script: '',

       // Methods to access the store
       batchStore: useBatchStore(),
       SsidStore: useSsidStore(),
       JobStore: useJobStore(),
       scheduleStore: useScheduleStore(),
       layerScriptsStore: useLayerScriptsStore(),
       scriptsStore: useScriptsStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },
   async mounted() {
    if (this.enable_sso) {
      await this.userStore.fetchUser();
     }

     await this.batchStore.getBatches();
    //  console.log(this.batchStore.getBatches())
     await this.SsidStore.getSsidProfiles();
    //  console.log(this.SsidStore.getSsidProfiles());
     await this.JobStore.getJobs();
    //  console.log(this.JobStore.getJobs());
     await this.scheduleStore.getSchedules();
     await this.layerScriptsStore.getLayer2Scripts();
     await this.layerScriptsStore.getLayer3Scripts();
     await this.layerScriptsStore.getDefaults();
     await this.scriptsStore.getScripts();
     this.add_layer2_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer2_scripts, 'default_layer2');
     this.add_layer3_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer3_scripts, 'default_layer3');
     this.add_script = this.scriptsStore.scripts.length === 1 ? this.scriptsStore.scripts[0] : '';
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
       {
         'type': 'multiselect',
         'name': 'Job Selection',
         'options': this.JobStore.jobs
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

   computed: {
      isDisabled() {
        return isFormDisabled();
      }
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
      * @param {name, ssid_profiles, jobs, schedules, priority, TTL} form_data // replaced jobs with tests
      */
     async addBatch(form_data) {
       await this.batchStore.addBatch({
         name: form_data[0].value,
         test_interface: form_data[1].value,
         priority: form_data[5].value,
         ssid_profiles: (form_data[2].selected.length == 0)? [] : form_data[2].selected.map(obj => obj.name),
         jobs: (form_data[3].selected.length == 0)? [] : form_data[3].selected.map(obj => obj.name),
         schedules: (form_data[4].selected.length == 0)? [] : form_data[4].selected.map(obj => obj.name),
         layer2_script: this.add_layer2_script,
         layer3_script: this.add_layer3_script,
         script: this.add_script,
       });
       this.add_layer2_script = '';
       this.add_layer3_script = '';
       this.add_script = '';
       this.addBatchForm();
     },

     // Edits a selected batch
     async editBatch() {
       const updated_batch = {
         "old_batchname": this.old_batchname,
         "new_batchname": this.currentItem.name,
         "priority": this.currentItem.priority,
         "ssid_profiles": this.currentItem.ssid_profiles,
         "schedules": this.currentItem.schedules,
         "jobs": this.currentItem.jobs || [],
         "test_interface": this.currentItem.test_interface,
         "layer2_script": this.currentItem.layer2_script || '',
         "layer3_script": this.currentItem.layer3_script || '',
         "script": this.currentItem.script || ''
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
