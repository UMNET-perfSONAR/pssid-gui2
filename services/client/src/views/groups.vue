<template>
  <div>

    <div v-if="hostGroup.isLoading===true">
      <p> Loading Host Group Page... </p>
    </div>

    <div style="margin-bottom:1em">
      <button @click="hostGroup.createConfig(currentGroup)" class="btn btn-warning"> Submit to probes </button>
      <button @click="addHostForm" class="btn btn-primary" v-if="showAddGroup==false"
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
            <hostSelection v-if="mounted == true" :copy_of_data="copy_of_data
				 "></hostSelection>

            <!-- batch selection-->
            <div class= "form-group">
              <label for="batch-select"> Batch Selection </label>
              <VueMultiselect
                v-model="selected_batches"
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
              <hostSelection :copy_of_data="hosts_to_edit"></hostSelection>
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
            <hostRegex :regex_array="edit_regex"></hostRegex>
          </div>

          <!-- dynamic data section -->
          <label for="params"> Optional Data </label>
          <dynamic_add_data :addedData="edit_optional_data"></dynamic_add_data>

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
       currentGroup: [], currentIndex: {},
       newHosts: '', selected_batches: '', newGroup: '',
       showAddGroup: true,
       selectedGroup: '', 
       addedData: [{}],
       copy_of_data: [],
       hosts_to_edit: [],

       edit_regex: [],
       regex: [],
       edit_optional_data: [],
       selected_hosts: [],
       mounted: false,

       // relevant host stores
       hostStore: useHostStore(),
       hostGroup: useGroupStore(),
       batchStore: useBatchStore(),
     }
   },
   async mounted() {
     await this.hostStore.getHosts();
     await this.hostGroup.getGroups();
     await this.batchStore.getBatches();
     this.copy_of_data = this.hostStore.hosts.map((item, index) => ({
       name: item.name,
       selected: false,
       index: index
     }))
     this.mounted = true;
   },

   methods: {
     // render current active group
     updateActiveGroup(indexArray){
       this.currentGroup = indexArray[0];
       this.currentIndex = indexArray[1];
       this.selectedGroup = this.currentGroup.name;
       this.showAddGroup = false;
       this.edit_optional_data = Object.entries(this.currentGroup.data).map(([key,value]) => ({
         key,
         value
       }));
       this.hosts_to_edit = this.hostStore.hosts.map((item, index) => ({
         name: item.name,
         selected: false,
         index: index
       }));
       
       this.currentGroup.hosts.forEach(element => {
         const ind = this.hosts_to_edit.findIndex((host) => element==host.name);
         this.hosts_to_edit[ind].selected = true;
       });
       this.edit_regex = this.currentGroup.hosts_regex.map(item => ({regex:item}));
     },

     // submit group = send to addGroup store function
     async handleSubmit() {
       this.selected_hosts = this.copy_of_data.filter(h => {
         return h.selected == true
       })
       if (this.newGroup.length > 0) {
         const spec_object = this.addedData.reduce((result, item)=> {
           result[item.key] = item.value
           return result
         }, {});
         this.hostGroup.addGroup({
           name: this.newGroup,
           batches: (this.selected_batches.length == 0) ? [] : this.selected_batches.map(obj=>obj.name),
           hosts: (this.selected_hosts.length == 0)? [] : this.selected_hosts.map(obj => obj.name),
           data: spec_object,
           hosts_regex: (this.regex.length == 0)? [] : this.regex.map(obj => obj.regex)
         })
         this.selected_batches = [],
           this.selected_hosts = [];
         this.newGroup = '';
         this.regex = [];
         this.copy_of_data = this.copy_of_data.map(item => ({
           name: item.name,
           selected: false, 
           index: item.index,
         }))
       }
     },

     // edit group - send to editGroup store function
     async editGroup() {
       const new_selected_hosts = this.hosts_to_edit.filter(h => {
         return h.selected == true
       })
       let object = {
         new_hostgroup: this.currentGroup.name,
         old_hostgroup: this.selectedGroup,
         hosts: (new_selected_hosts.length == 0) ? [] : new_selected_hosts.map(obj => obj.name),
         batches: this.currentGroup.batches,
         data: this.edit_optional_data.reduce((result, item)=> {
           result[item.key] = item.value
           return result
         }, {}),
         hosts_regex: (this.edit_regex.length == 0)? [] : this.edit_regex.map(obj => obj.regex)
       }
       console.log(object);
       await this.hostGroup.editGroup(object);
       await this.hostGroup.getGroups();
     },

     // display addGroup form
     addHostForm() {
       this.showAddGroup = true;
       this.currentIndex = {};
       this.selected_hosts = [];
     },

     // delete host group
     async deletegroup() {
       const deleteIndex = this.currentIndex;
       this.hostGroup.host_groups.splice(deleteIndex, 1);
       await this.hostGroup.deleteGroup(this.currentGroup);
       // If the deleted group is the last one, clear the selection and show
       // the add group page.
       if (this.hostGroup.host_groups.length <= deleteIndex) {
         this.edit_regex = [];
         this.addHostForm();
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
