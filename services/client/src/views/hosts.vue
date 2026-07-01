<template>
  <div>
    <ConfirmModal
      :visible="showConfirm"
      :message="confirmMessage"
      @confirm="executeDeleteHost"
      @cancel="showConfirm = false"
    />

    <PageHeader
      title="Hosts"
      subtitle="Manage network probe hosts and their batch assignments"
      icon="computer"
      :can-add="!isDisabled"
      add-label="Add Host"
      @add="addHostComp"
    />

    <!-- buttons -->
    <div class="d-flex flex-wrap mb-3" style="gap: 0.5rem;">
      <button class="btn btn-warning" @click="hostStore.createConfig(currentItem);" :disabled="isDisabled || showAddHost">
        Configure selected host
      </button>
    </div>
    <div class="list row">
      <!-- List out the items -->
      <div class="col-md-6">
        <h3> Host list </h3>
        <item-list v-if="mounted==true" :itemArray="hostStore.hosts" :display="showAddHost"
          @updateActive="updateActiveHost" style="cursor: pointer;"></item-list>
      </div>
      <!--Add Host Form -->
      <div v-if="showAddHost===true" class="col-md-6">
        <form @submit.prevent="submitHost()">
          <h3> Add Host </h3>
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label for="hosts"> Hosts </label>
            <input
              type="text"
              placeholder="Enter hostname"
              v-model="hostname"
              required
              id="hosts"
              name="host form"
              class="form-control"
            >
          </div>
          <div class="form-group">
            <label> Batches </label>
            <VueMultiselect
              :multiple="true"
              :close-on-select="false"
              :options="batchStore.batches"
              v-model="selectedBatches"
              track-by="name"
              label="name"
            >
            </VueMultiselect>
          </div>
          <p> Metadata </p>
          <dynamic_add_data :addedData="addedOptionalData"></dynamic_add_data>
          <button class="btn btn-success"> Submit </button>
        </fieldset>
        </form>
      </div>

      <!-- Edit selected host form -->
      <div v-if="showAddHost===false" class="col-md-6">
        <form @submit.prevent="editHost">
          <h3> Edit Host </h3>
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label for="hosts"> Hosts </label>
            <input
              type="text"
              placeholder="Enter hostname"
              v-model="this.currentItem.name"
              required
              id="hosts"
              name="host form"
              class="form-control"
            >
          </div>
          <div class="form-group">
            <label> Batches </label>
            <VueMultiselect
              :multiple="true"
              :close-on-select="false"
              :options="batchStore.batches.map(item=> item.name)"
              v-model="currentItem.batches"
            >
            </VueMultiselect>
          </div>
          <dynamic_add_data :addedData="currOptionalData"></dynamic_add_data>
          <div class="d-flex flex-wrap mt-2" style="gap: 0.5rem;">
            <button class="btn btn-success"> Update </button>
            <button class="btn btn-danger" type="button" @click="requestDeleteHost"> Delete </button>
          </div>
        </fieldset>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
 import { useHostStore } from '/src/stores/host_store';
 import { useGroupStore } from '/src/stores/groups_stores';
 import { useBatchStore } from '../stores/batches.store';
 import { useUserStore } from '/src/stores/user.store';
 import { defineComponent } from 'vue';
 import itemList from '../components/list_items.vue';
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import VueMultiselect from 'vue-multiselect';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"

 export default defineComponent({
   components: { itemList, dynamic_add_data, VueMultiselect, ConfirmModal, PageHeader },
   data() {
     return {
       hostname: '',
       selectedBatches: [],
       addedOptionalData: [],

       showAddHost: true,

       currentItem: [],
       currentIndex: {},
       old_hostname: '',
       currOptionalData: [],

       showConfirm: false,
       confirmMessage: '',

       mounted: false,

       batchStore: useBatchStore(),
       hostStore: useHostStore(),
       groupStore: useGroupStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },

   async mounted() {
     await this.hostStore.getHosts();
     await this.batchStore.getBatches();
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     this.mounted = true;
   },

   computed: {
     isDisabled() {
       return isFormDisabled();
     }
   },

   methods: {
     updateActiveHost(indexArray) {
       this.currentItem = indexArray[0];
       this.currentIndex = indexArray[1];
       this.showAddHost = false;
       this.old_hostname = this.currentItem.name;
       this.currOptionalData = Object.entries(this.currentItem.data).map(([key, value]) => ({
         key,
         value
       }));
     },

     async editHost() {
       const new_host_obj = {
         "old_hostname": this.old_hostname,
         "new_hostname": this.currentItem.name,
         "batches": this.currentItem.batches,
         "data": this.currOptionalData.reduce((result, item) => {
           result[item.key] = item.value;
           return result;
         }, {})
       };
       await this.hostStore.editHost(new_host_obj);
       await this.hostStore.getHosts();
       this.currentItem = this.hostStore.hosts[this.currentIndex];
       this.updateActiveHost([this.currentItem, this.currentIndex]);
     },

     async submitHost() {
       const spec_object = this.addedOptionalData.reduce((result, item) => {
         result[item.key] = item.value;
         return result;
       }, {});
       await this.hostStore.addHost({
         name: this.hostname,
         batches: (this.selectedBatches.length == 0) ? [] :
           this.selectedBatches.map((item) => item.name),
         data: spec_object
       });
       this.hostname = '';
       this.selectedBatches = [];
       this.addedOptionalData = [];
     },

     addHostComp() {
       this.showAddHost = true;
       this.currentItem = [];
       this.currentIndex = {};
     },

     requestDeleteHost() {
       this.confirmMessage = `Delete host "${this.currentItem.name}"? This cannot be undone.`;
       this.showConfirm = true;
     },

     async executeDeleteHost() {
       this.showConfirm = false;
       const deleteIndex = this.currentIndex;
       this.hostStore.hosts.splice(deleteIndex, 1);
       await this.hostStore.deleteHost(this.currentItem);
       if (this.hostStore.hosts.length <= deleteIndex) {
         this.currOptionalData = [];
         this.addHostComp();
       } else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.hostStore.hosts[deleteIndex];
         this.updateActiveHost([this.currentItem, this.currentIndex]);
       }
     }
   }
 })
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
