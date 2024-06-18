<template>
  <div>

    <div v-if="hostGroup.isLoading===true">
      <p> Loading Host Group Page... </p>
    </div>

    <div style="margin-bottom:1em">
      <button @click="hostGroup.createConfig(currentGroup)" class="btn btn-warning"> Submit to probes </button>
      <button @click="addGroupForm" class="btn btn-primary" v-if="showAddGroup==false"
        style="margin-left: 1em;"> Add Host Group
      </button>
    </div>
    <div class="list row"> 
      <!-- Host Group List -->
      <div class="col-md-6">
        <h3> Host Group List </h3>
        <!-- regex search bar and list of groups -->
        <item-list v-if="mounted==true" :itemArray="hostGroup.host_groups" :display="showAddGroup"
          @updateActive="updateActiveGroup" style="cursor: pointer;"
        ></item-list>
      </div>

      <!-- Add Group Form -->
      <div class = "col-md-6" v-if="showAddGroup==true"> 
        <h3> Add Host Group </h3>
        <form @submit.prevent="handleSubmit">
          <div class="submit-form">
            <div class="form-group">
              <label for="groups"> Host Group </label>
              <input 
                type="text"
                placeholder="Enter host group name"
                v-model="newGroup"
                required
                id="groups"
                class="form-control"
              />
            </div>
            <!-- host selection -->
            <hostSelection v-if="mounted == true" :copy_of_data="copyOfData
                                 "></hostSelection>

            <!-- batch selection-->
            <div class= "form-group">
              <label for="batch-select"> Batch Selection </label>
              <VueMultiselect
                v-model="selectedBatches"
                :options="batchStore.batches"
                :multiple="true"
                :close-on-select="false"
                label="name"
                track-by="name"
              >
              </VueMultiselect>
            </div>
            <!-- Host Regex input -->
            <div class="form-group">
              <label> Host Regex Input </label>
              <hostRegex :regex_array="regex"></hostRegex>
            </div>

            <!-- dynamic data section -->
            <label for="params"> Optional Data </label>
            <dynamic_add_data :addedData="addedData"></dynamic_add_data>

          </div>
          <button class="btn btn-success" style="margin-bottom: 2em;"> Submit </button>
        </form>
      </div>

      <!-- Edit Group Form -->
      <div class = "col-md-6" v-if="showAddGroup==false">
        <h3> Edit Host Group </h3>
        <form @submit.prevent="handleUpdate">
          <div class="submit-form">
            <!-- host group -->
            <div class="form-group">
              <label for="groups"> Host Group </label>
              <input 
                type="text"
                placeholder="Enter host group name"
                v-model="currentGroup.name"
                required
                id="groups"
                class="form-control"
              />
            </div>

            <!-- host selection -->
            <div class= "form-group">
              <hostSelection :copy_of_data="hostsToEdit"></hostSelection>
            </div>
            <!-- batch selection -->
            <div class= "form-group">
              <label for="batch-select"> Batch Selection </label>
              <VueMultiselect
                v-model="currentGroup.batches"
                :options="batchStore.batches.map(item=>item.name)"
                :multiple="true"
                :close-on-select="false"
              >
              </VueMultiselect>
            </div>
          </div>
          <!-- hosts regex -->
          <div class="form-group">
            <label> Host Regex Input </label>
            <hostRegex :regex_array="editRegex"></hostRegex>
          </div>

          <!-- dynamic data section -->
          <label for="params"> Optional Data </label>
          <dynamic_add_data :addedData="editOptionalData"></dynamic_add_data>

          <!-- update and delete buttons-->
          <div>
            <button class="btn btn-success" @click="editGroup"
              style="margin-right: 1em;"> Update </button>
            <button class="btn btn-danger" @click="deletegroup"> Delete </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
 import { useGroupStore } from '/src/stores/groups_stores';
 import { useBatchStore } from '/src/stores/batches.store';
 import { useHostStore } from '/src/stores/host_store.ts';
 import { defineComponent } from 'vue';
 import hostRegex from '../components/hosts_regex.vue';
 import VueMultiselect from 'vue-multiselect'
 import itemList from '../components/list_items.vue'
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import hostSelection from '../forms/hostSelection.vue';
 export default defineComponent({
   components: {VueMultiselect, itemList, hostRegex, dynamic_add_data, hostSelection},
   data() {
     return {
       /*
        * Variables for the Add Host form
        */
       selectedGroup: '',
       selectedHosts: [],
       selectedBatches: [],
       regex: [],
       addedData: [],

       /*
        * Variable that controls which form is displayed,
        * Add Group or Edit Group.
        */
       showAddGroup: true,

       /*
        * Variables for the Edit Host form
        */
       currentGroup: [],
       currentIndex: {},
       newGroup: '',
       copyOfData: [],
       hostsToEdit: [],
       editRegex: [],
       editOptionalData: [],

       mounted: false,

       /*
        * Method(s) to access the store
        */
       hostStore: useHostStore(),
       hostGroup: useGroupStore(),
       batchStore: useBatchStore(),
     }
   },

   async mounted() {
     await this.hostStore.getHosts();
     await this.hostGroup.getGroups();
     await this.batchStore.getBatches();
     this.copyOfData = this.hostStore.hosts.map((item, index) => ({
       name: item.name,
       selected: false,
       index: index
     }))
     this.mounted = true;
   },

   methods: {
     // Renders a current active group
     updateActiveGroup(indexArray){
       this.currentGroup = indexArray[0];
       this.currentIndex = indexArray[1];
       this.selectedGroup = this.currentGroup.name;
       this.showAddGroup = false;
       this.editOptionalData = Object.entries(this.currentGroup.data).map(([key,value]) => ({
         key,
         value
       }));
       this.hostsToEdit = this.hostStore.hosts.map((item, index) => ({
         name: item.name,
         selected: false,
         index: index
       }));
       
       this.currentGroup.hosts.forEach(element => {
         const ind = this.hostsToEdit.findIndex((host) => element==host.name);
         this.hostsToEdit[ind].selected = true;
       });
       this.editRegex = this.currentGroup.hosts_regex.map(item => ({regex:item}));
     },

     // Submits a newly added group
     async handleSubmit() {
       this.selectedHosts = this.copyOfData.filter(h => {
         return h.selected == true
       })
       if (this.newGroup.length > 0) {
         const spec_object = this.addedData.reduce((result, item)=> {
           result[item.key] = item.value
           return result
         }, {});
         this.hostGroup.addGroup({
           name: this.newGroup,
           batches: (this.selectedBatches.length == 0) ? [] : this.selectedBatches.map(obj=>obj.name),
           hosts: (this.selectedHosts.length == 0)? [] : this.selectedHosts.map(obj => obj.name),
           data: spec_object,
           hosts_regex: (this.regex.length == 0)? [] : this.regex.map(obj => obj.regex)
         });
         this.selectedBatches = [];
         this.selectedHosts = [];
         this.newGroup = '';
         this.regex = [];
         this.copyOfData = this.copyOfData.map(item => ({
           name: item.name,
           selected: false, 
           index: item.index,
         }))
       }

       // Clear the form and show Add Group form again.
       this.addGroupForm();
     },

     // Edits a currently selected group
     async editGroup() {
       const new_selected_hosts = this.hostsToEdit.filter(h => {
         return h.selected == true
       })
       let object = {
         new_hostgroup: this.currentGroup.name,
         old_hostgroup: this.selectedGroup,
         hosts: (new_selected_hosts.length == 0) ?
           [] : new_selected_hosts.map(obj => obj.name),
         batches: this.currentGroup.batches,
         data: this.editOptionalData.reduce((result, item)=> {
           result[item.key] = item.value
           return result
         }, {}),
         hosts_regex: (this.editRegex.length == 0) ?
           [] : this.editRegex.map(obj => obj.regex)
       }
       await this.hostGroup.editGroup(object);
       await this.hostGroup.getGroups();

       this.currentGroup = this.hostGroup.host_groups[this.currentIndex];
       this.updateActiveGroup([this.currentGroup, this.currentIndex]);
     },

     // Renders Add Group form
     addGroupForm() {
       this.showAddGroup = true;
       this.currentIndex = {};
       this.currentGroup = [];

       this.selectedGroup = '';
       this.selectedHosts = [];
       this.selectedBatches = [];
       this.regex = [];
       this.addedData = [];
     },

     // Deletes a selected group
     async deletegroup() {
       const deleteIndex = this.currentIndex;
       this.hostGroup.host_groups.splice(deleteIndex, 1);
       await this.hostGroup.deleteGroup(this.currentGroup);
       // If the deleted group is the last one, clear the selection and show
       // the add group page.
       if (this.hostGroup.host_groups.length <= deleteIndex) {
         this.editRegex = [];
         this.addGroupForm();
       }
       // Otherwise, update the selection to the next group in the list,
       // allowing users to potentially keep deleting without reselection.
       else {
         this.currentIndex = deleteIndex;
         this.currentGroup = this.hostGroup.host_groups[deleteIndex];
         this.updateActiveGroup([this.currentGroup, deleteIndex]);
       }
     },
   }
   
 })
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
