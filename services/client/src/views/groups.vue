<template>
  <div>
    <ConfirmModal
      :visible="showConfirm"
      :message="confirmMessage"
      @confirm="executeDeleteGroup"
      @cancel="showConfirm = false"
    />

    <PageHeader
      title="Host Groups"
      subtitle="Organize hosts into groups for bulk provisioning"
      icon="lan"
      :can-add="!isDisabled && !showAddGroup"
      add-label="Add Host Group"
      @add="addGroupForm"
    />

    <div v-if="hostGroup.isLoading===true" class="loading-state">
      <div class="spinner"></div>
      <span>Loading host groups…</span>
    </div>

    <div class="d-flex flex-wrap mb-3" style="gap: 0.5rem;">
      <button @click="hostGroup.createConfig(currentGroup)" class="btn btn-warning" :disabled="isDisabled || showAddGroup">Configure selected group</button>
    </div>
    <div class="list row">
      <!-- Host Group List -->
      <div class="col-md-6">
        <h3> Host Group List </h3>
        <item-list v-if="mounted==true" :itemArray="hostGroup.host_groups" :display="showAddGroup"
          @updateActive="updateActiveGroup" style="cursor: pointer;"
        ></item-list>
      </div>

      <!-- Add Group Form -->
      <div class="col-md-6" v-if="showAddGroup==true">
        <h3> Add Host Group </h3>
        <fieldset :disabled="isDisabled">
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
              <small v-if="addGroupNameError" class="text-danger">{{ addGroupNameError }}</small>
            </div>
            <hostSelection v-if="mounted == true"
             :copy_of_data="copyOfData"
            ></hostSelection>
            <div class="form-group">
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
            <div class="form-group">
              <label> Host Regex Input </label>
              <hostRegex :regex_array="regex"></hostRegex>
            </div>
            <label for="params"> Metadata </label>
            <dynamic_add_data :addedData="addedData"></dynamic_add_data>
          </div>
          <button class="btn btn-success" style="margin-bottom: 2em;" :disabled="!addGroupValid"> Add Host Group </button>
        </form>
      </fieldset>
      </div>

      <!-- Edit Group Form -->
      <div class="col-md-6" v-if="showAddGroup==false">
        <h3> Edit Host Group </h3>
        <fieldset :disabled="isDisabled">
        <form @submit.prevent="editGroup">
          <div class="submit-form">
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
              <small v-if="editGroupNameError" class="text-danger">{{ editGroupNameError }}</small>
            </div>
            <div class="form-group">
              <hostSelection :copy_of_data="hostsToEdit"></hostSelection>
            </div>
            <div class="form-group">
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
          <div class="form-group">
            <label> Host Regex Input </label>
            <hostRegex :regex_array="editRegex"></hostRegex>
          </div>
          <label for="params"> Metadata </label>
          <dynamic_add_data :addedData="editOptionalData"></dynamic_add_data>
          <div class="d-flex flex-wrap mt-2" style="gap: 0.5rem;">
            <button class="btn btn-success" :disabled="!editGroupValid"> Update </button>
            <button class="btn btn-danger" type="button" @click="requestDeleteGroup"> Delete </button>
          </div>
        </form>
      </fieldset>
      </div>
    </div>
  </div>
</template>

<script>
 import { useGroupStore } from '/src/stores/groups_stores';
 import { useBatchStore } from '/src/stores/batches.store';
 import { useHostStore } from '/src/stores/host_store.ts';
 import { useUserStore } from '/src/stores/user.store';
 import { defineComponent } from 'vue';
 import hostRegex from '../components/hosts_regex.vue';
 import VueMultiselect from 'vue-multiselect';
 import itemList from '../components/list_items.vue';
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import hostSelection from '../forms/hostSelection.vue';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName } from "../utils/validators.ts"

 export default defineComponent({
   components: { VueMultiselect, itemList, hostRegex, dynamic_add_data, hostSelection, ConfirmModal, PageHeader },
   data() {
     return {
       selectedGroup: '',
       selectedHosts: [],
       selectedBatches: [],
       regex: [],
       addedData: [],

       showAddGroup: true,

       currentGroup: [],
       currentIndex: {},
       newGroup: '',
       copyOfData: [],
       hostsToEdit: [],
       editRegex: [],
       editOptionalData: [],

       mounted: false,

       showConfirm: false,
       confirmMessage: '',

       hostStore: useHostStore(),
       hostGroup: useGroupStore(),
       batchStore: useBatchStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO,
     }
   },

   async mounted() {
     await this.hostStore.getHosts();
     await this.hostGroup.getGroups();
     await this.batchStore.getBatches();
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     this.copyOfData = this.hostStore.hosts.map((item, index) => ({
       name: item.name,
       selected: false,
       index: index
     }));
     this.mounted = true;
   },

   computed: {
     isDisabled() {
       return isFormDisabled();
     },
     addGroupNameError() {
       return this.newGroup ? validName(this.newGroup).error : '';
     },
     addGroupValid() {
       return validName(this.newGroup).valid;
     },
     editGroupNameError() {
       return this.currentGroup && this.currentGroup.name ? validName(this.currentGroup.name).error : '';
     },
     editGroupValid() {
       return validName((this.currentGroup && this.currentGroup.name) || '').valid;
     }
   },

   methods: {
     updateActiveGroup(indexArray) {
       this.currentGroup = indexArray[0];
       this.currentIndex = indexArray[1];
       this.selectedGroup = this.currentGroup.name;
       this.showAddGroup = false;
       this.editOptionalData = Object.entries(this.currentGroup.data).map(([key, value]) => ({
         key,
         value
       }));
       this.hostsToEdit = this.hostStore.hosts.map((item, index) => ({
         name: item.name,
         selected: false,
         index: index
       }));
       this.currentGroup.hosts.forEach(element => {
         const ind = this.hostsToEdit.findIndex((host) => element == host.name);
         this.hostsToEdit[ind].selected = true;
       });
       this.editRegex = this.currentGroup.hosts_regex.map(item => ({ regex: item }));
     },

     async handleSubmit() {
       this.selectedHosts = this.copyOfData.filter(h => h.selected == true);
       if (this.newGroup.length > 0) {
         const spec_object = this.addedData.reduce((result, item) => {
           result[item.key] = item.value;
           return result;
         }, {});
         this.hostGroup.addGroup({
           name: this.newGroup,
           batches: (this.selectedBatches.length == 0) ? [] : this.selectedBatches.map(obj => obj.name),
           hosts: (this.selectedHosts.length == 0) ? [] : this.selectedHosts.map(obj => obj.name),
           data: spec_object,
           hosts_regex: (this.regex.length == 0) ? [] : this.regex.map(obj => obj.regex)
         });
         this.selectedBatches = [];
         this.selectedHosts = [];
         this.newGroup = '';
         this.regex = [];
         this.copyOfData = this.copyOfData.map(item => ({
           name: item.name,
           selected: false,
           index: item.index,
         }));
       }
       this.addGroupForm();
     },

     async editGroup() {
       const new_selected_hosts = this.hostsToEdit.filter(h => h.selected == true);
       let object = {
         new_hostgroup: this.currentGroup.name,
         old_hostgroup: this.selectedGroup,
         hosts: (new_selected_hosts.length == 0) ?
           [] : new_selected_hosts.map(obj => obj.name),
         batches: this.currentGroup.batches,
         data: this.editOptionalData.reduce((result, item) => {
           result[item.key] = item.value;
           return result;
         }, {}),
         hosts_regex: (this.editRegex.length == 0) ?
           [] : this.editRegex.map(obj => obj.regex)
       };
       await this.hostGroup.editGroup(object);
       await this.hostGroup.getGroups();
       this.currentGroup = this.hostGroup.host_groups[this.currentIndex];
       this.updateActiveGroup([this.currentGroup, this.currentIndex]);
     },

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

     requestDeleteGroup() {
       this.confirmMessage = `Delete group "${this.currentGroup.name}"? This cannot be undone.`;
       this.showConfirm = true;
     },

     async executeDeleteGroup() {
       this.showConfirm = false;
       const deleteIndex = this.currentIndex;
       this.hostGroup.host_groups.splice(deleteIndex, 1);
       await this.hostGroup.deleteGroup(this.currentGroup);
       if (this.hostGroup.host_groups.length <= deleteIndex) {
         this.editRegex = [];
         this.addGroupForm();
       } else {
         this.currentIndex = deleteIndex;
         this.currentGroup = this.hostGroup.host_groups[deleteIndex];
         this.updateActiveGroup([this.currentGroup, deleteIndex]);
       }
     },
   }
 })
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
