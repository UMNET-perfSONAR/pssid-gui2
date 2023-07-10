<template>
<!-- regex search bar -->

  <button
    class="btn btn-primary"
    type="button"
    @click="addHostComp"
    style="margin-bottom: 1em;"
  >  
     Add Hosts
  </button>
  <div class="list row">
     <!-- List out the items -->
     <div class="col-md-6">
         <h3> Host list </h3>
         <item-list :item-array="hostStore.hosts"  :display="showAddHost"
         @updateActive="updateActiveHost" style="cursor: pointer;"> </item-list>
     </div>

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

        <!-- USE IF I WANT TO CLEAN CODE - PRODUCES MORE PROBLEMS
          <updateddynamicform
            :form_data="form_data"
            :form_values="form_vals"
          ></updateddynamicform>
          -->
          <p> Optional Data </p>
          <dynamic_add_data :addedData="addedData"></dynamic_add_data>

          <button class="btn btn-success"> Submit </button>

      </form>
     </div>
 
    <!-- Display selected host information -->
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
        <dynamic_add_data :addedData="this.currentItem.data"></dynamic_add_data>
      <div>
          <button class="btn btn-success" style="margin-right: 1em;" > Update </button>
          <button class="btn btn-danger" @click="deletegroup"> Delete </button>
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
 import addhost from '../components/hosts/addHost.vue'
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import VueMultiselect from 'vue-multiselect'
 import updateddynamicform from '../components/updated_dynamicform.vue'

 export default defineComponent({
     components: { addhost, itemList, dynamic_add_data, VueMultiselect, updateddynamicform },
     data() {    
      return {
        // for data binding and storage 
        form_data: [],
        form_vals: [],
        addedData: [{
          'key':'',
          'value': ''
        }],

        // rendering of subpages
        currentItem: {},
        currentIndex: {},
        showAddHost: true,
        batch: [],
        selectedBatches:'',
        hostname: '',
        old_hostname: '',

        // relevant stores 
        batchStore: useBatchStore(),
        hostStore: useHostStore(),
        groupStore: useGroupStore(),
      }        
     },
     async mounted() {
      await this.batchStore.getBatches();
      this.form_data=[{
          "type":"text",
          "name": "Host Name"
        },
         {
          "type": "multiselect",
          "name": "Select Batches",
          "options": this.batchStore.batches
         },
   
      ]
      this.form_vals=this.form_data.map((item) => ({
                name: item.name,
                value: '',
                selected: []
            }))
     },
     methods: {
      /**
       * update page to view selected host/ edit screen
       * @param {item, itemIndex} indexArray - holds currentItem and currentIndex
       */

      updateActiveHost(indexArray) {
        this.currentItem=indexArray[0];
        this.currentIndex=indexArray[1];
        this.showAddHost=false;
        this.old_hostname=this.currentItem.name
      },
      /**
       * edit host in database 
       */
      async editHost() {
        const new_host_obj = {
          "old_hostname": this.old_hostname,
          "new_hostname": this.currentItem.name,
          "batches": this.currentItem.batches,
          "data": this.currentItem.data
        }
        console.log(new_host_obj)
        await this.hostStore.editHost(new_host_obj);
      },
        // submit host information. reset info 
      async submitHost() {
        /*
        console.log(this.form_vals[0].name);
        const data = this.form_vals.map((item)=>({
                    name: item.name,
                    value: item.value,
                    selected:item.selected
              }))
        */
        await this.hostStore.addHost({
          name: this.hostname,
          batches: (this.selectedBatches.length==0)?[]:this.selectedBatches.map((item) => item.name),          
          data: this.addedData
        });
        this.hostname='';
        this.selectedBatches=[];
        this.addedData=[];
      },
  
         deleteAllHosts() {
          const h = useHostStore();
          h.deleteAll();
         },
         addHostComp() {
          this.display='add'
          this.showAddHost=true;
          this.currentItem={};
          this.currentIndex={}
         },
         async deleteHost(host) {
          const h = useHostStore();
          h.deleteHost(host);
          await this.groupStore.getGroups();
         }
     },
     setup() {
         const id = 0;
         const hostStore = useHostStore();
         hostStore.getHosts();

         return { id,  hostStore }
     }

     // updateSubmit function
 
 })
</script>
