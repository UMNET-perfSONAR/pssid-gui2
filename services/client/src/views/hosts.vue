<template>
  <!-- buttons -->
  <div class="buttons" style="margin-bottom:1em;">
    <button class="btn btn-warning" @click="hostStore.createConfig(currentItem);">
      Submit to Probes
    </button>
    <button class="btn btn-primary" @click="addHostComp" v-if="!showAddHost"
      style="margin-left: 1em;"> Add Host
    </button>
  </div>
  <div class="list row">
    <!-- List out the items -->
    <div class="col-md-6">
      <h3> Host list </h3>
      <item-list v-if="mounted==true" :itemArray="hostStore.hosts"  :display="showAddHost"
        @updateActive="updateActiveHost" style="cursor: pointer;"></item-list>
    </div>
    <!--Add Host Form -->
    <div v-if="showAddHost===true" class="col-md-6">
      <form @submit.prevent="submitHost()">
        <h3> Add Host </h3>
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
        <div class = "form-group">
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
        <p> Optional Data </p>
        <dynamic_add_data :addedData="addedOptionalData"></dynamic_add_data>
        <button class="btn btn-success"> Submit </button>

      </form>
    </div>
    
    <!-- Edit selected host form -->
    <div v-if="showAddHost===false" class="col-md-6">
      <form @submit.prevent="editHost">
        <h3> Edit Host </h3>
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
        <div class = "form-group">
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
        <div>
          <button class="btn btn-success" style="margin-right: 1em;" > Update </button>
          <button class="btn btn-danger" @click.prevent="deleteHost"> Delete </button>
        </div>
      </form>
    </div>
  </div>

</template>

<script>
 import { useHostStore } from '/src/stores/host_store';
 import { useGroupStore } from '/src/stores/groups_stores';
 import { useBatchStore } from '../stores/batches.store';
 import { defineComponent } from 'vue';
 import itemList from '../components/list_items.vue';
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import VueMultiselect from 'vue-multiselect'

 export default defineComponent({
   components: {itemList, dynamic_add_data, VueMultiselect},
   data() {    
     return {
       /*
        * Variables for the Add Host form
        */
       hostname: '',
       selectedBatches: [],
       addedOptionalData: [],

       /*
        * Variable that controls which form is displayed,
        * Add Host or Edit Host.
        */
       showAddHost: true,

       /*
        * Variables for the Edit Host form
        */
       currentItem: [],
       currentIndex: {},
       old_hostname: '',
       currOptionalData: [],

       mounted: false,

       /*
        * Method(s) to access the store
        */
       batchStore: useBatchStore(),
       hostStore: useHostStore(),
       groupStore: useGroupStore(),
     }        
   },

   async mounted() {
     await this.hostStore.getHosts();
     await this.batchStore.getBatches();
     this.mounted=true;
   },

   methods: {
     /**
      * Updates page to view selected host/ edit screen
      * @param {item, itemIndex} indexArray - holds currentItem and currentIndex
      */
     updateActiveHost(indexArray) {
       this.currentItem=indexArray[0];
       this.currentIndex=indexArray[1];
       this.showAddHost=false;
       this.old_hostname=this.currentItem.name;
       this.currOptionalData=Object.entries(this.currentItem.data).map(([key,value]) => ({
         key,
         value
       }));
     },

     // Edits a selected host item
     async editHost() {
       const new_host_obj = {
         "old_hostname": this.old_hostname,
         "new_hostname": this.currentItem.name,
         "batches": this.currentItem.batches,
         "data": this.currOptionalData.reduce((result, item)=> {
           result[item.key] = item.value
           return result
         }, {})
       };
       await this.hostStore.editHost(new_host_obj);
       await this.hostStore.getHosts();

       // Update the currently selected item - this is to ensure correct display,
       // not correct DB storage, which is already handled by hostStore.editHost.
       this.currentItem = this.hostStore.hosts[this.currentIndex];
       // Reselect the current item - crucial for
       // consecutive edits of the same item.
       this.updateActiveHost([this.currentItem, this.currentIndex]);

       alert("Host updated successfully!");
     },

     // Submits host information and clears the Add Host form
     async submitHost() {
       const spec_object = this.addedOptionalData.reduce((result, item)=> {
         result[item.key] = item.value
         return result
       }, {});
       await this.hostStore.addHost({
         name: this.hostname,
         batches: (this.selectedBatches.length==0)?[]:
         this.selectedBatches.map((item) => item.name),
         data: spec_object
       });
       this.hostname='';
       this.selectedBatches=[];
       this.addedOptionalData=[];
     },
     
     // Renders Add Host form
     addHostComp() {
       this.showAddHost=true;
       this.currentItem=[];
       this.currentIndex={};
     },

     // Deletes a selected host item
     async deleteHost() {
       const deleteIndex = this.currentIndex;
       this.hostStore.hosts.splice(deleteIndex, 1);
       await this.hostStore.deleteHost(this.currentItem);
       // If the item deleted is the last one in the list, clear the selection.
       if (this.hostStore.hosts.length <= deleteIndex) {
         this.currOptionalData = [];
         // Show Add Host page.
         this.addHostComp();
       }
       // If the item deleted is *not* the last one, then keep the same index and update
       // the selection such that users can seamlessly delete items without reselection.
       else {
         this.currentIndex = deleteIndex;  // redundant but here for better clarity
         this.currentItem = this.hostStore.hosts[deleteIndex];  // update currentItem
         // Update the selection.
         this.updateActiveHost([this.currentItem, this.currentIndex]);
       }
     }
   }
 })
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
