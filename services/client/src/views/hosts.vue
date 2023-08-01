<template>
  <!-- buttons -->
  <div style="margin-bottom:1em;">
    <button class="btn btn-primary" @click="addHostComp" style="margin-right: 1em;"> Add Hosts</button>
    <button class="btn btn-warning" @click="hostStore.createConfig(currentItem);"> Submit to probes </button>
  </div>
  <div class="list row">
     <!-- List out the items -->
     <div class="col-md-6">
         <h3> Host list </h3>
         <item-list v-if="mounted==true" :itemArray="hostStore.hosts"  :display="showAddHost"
         @updateActive="updateActiveHost" style="cursor: pointer;"></item-list>
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
        <dynamic_add_data :addedData="data"></dynamic_add_data>
      <div>
          <button class="btn btn-success" style="margin-right: 1em;" > Update </button>
          <button class="btn btn-danger" @click="deleteHost"> Delete </button>
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
     components: { addhost, itemList, dynamic_add_data, VueMultiselect, updateddynamicform},
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
        currentItem: [],
        currentIndex: {},
        showAddHost: true,
        batch: [],
        selectedBatches:'',
        hostname: '',
        old_hostname: '',
        data: [],
        mounted: false,

        // relevant stores 
        batchStore: useBatchStore(),
        hostStore: useHostStore(),
        groupStore: useGroupStore(),
      }        
     },
     async mounted() {
      await this.hostStore.getHosts();
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
      this.mounted=true;
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
        this.data=Object.entries(this.currentItem.data).map(([key,value]) => ({
                    key,
                    value
                }))
        console.log(this.data);
      },
      /**
       * edit host in database 
       */
      async editHost() {
        const new_host_obj = {
          "old_hostname": this.old_hostname,
          "new_hostname": this.currentItem.name,
          "batches": this.currentItem.batches,
          "data": this.data.reduce((result, item)=> {
                    result[item.key] = item.value
                    return result
        }, {})
        }
        console.log(new_host_obj);
        await this.hostStore.editHost(new_host_obj);
        await this.hostStore.getHosts();
      },
        // submit host information. reset info 
      async submitHost() {
        const spec_object = this.addedData.reduce((result, item)=> {
                    result[item.key] = item.value
                    return result
        }, {});
        await this.hostStore.addHost({
          name: this.hostname,
          batches: (this.selectedBatches.length==0)?[]:this.selectedBatches.map((item) => item.name),          
          data: spec_object
        });
        this.hostname='';
        this.selectedBatches=[];
        this.addedData=[];
      },
  
      addHostComp() {
          this.display='add'
          this.showAddHost=true;
          this.currentItem=[];
          this.currentIndex={}
       },
      async deleteHost() {
        this.hostStore.hosts.splice(this.currentIndex,1);
        await this.hostStore.deleteHost(this.currentItem);
        this.currentItem=[];
        this.currentIndex={};
        this.data=[];
        // await this.groupStore.getGroups();
       }
     }
     // updateSubmit function
 
 })
</script>
