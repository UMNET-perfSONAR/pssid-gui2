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
            <item-list v-if="!mounted" :itemArray="hostStore.hosts"  :display="showAddHost"
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
  
  <script setup>
   import VueMultiselect from 'vue-multiselect'
   import itemList from '../components/list_items.vue';
   import dynamic_add_data from '../components/dynamic_add_data.vue';
   import { useHostStore } from '/src/stores/host_store';
   import { useGroupStore } from '/src/stores/groups_stores';
   import { useBatchStore } from '../stores/batches.store';
   import {onMounted} from 'vue';  
    // data binding and storage 
    let form_data = [];
    let form_vals = [];
    let addedData = [{
          'key':'',
          'value': ''
        }];

    // rendering of components
    let currentItem = [];
    let currentIndex = [];
    let showAddHost = true;
    let batch = [];
    let selectedBatches = ''; 
    let hostname = ''; let old_hostname = '';

    let data = [];
    let mounted = false;

    let batchStore = useBatchStore();
    let hostStore = useHostStore();
    let GroupStore = useGroupStore();

    onMounted(async () => {
        await hostStore.getHosts();
        await batchStore.getBatches();
        mounted = true;
        console.log(hostStore.hosts);
    })

    function updateActiveHost(indexArray) {
        this.currentItem=indexArray[0];
        this.currentIndex=indexArray[1];
        this.showAddHost=false;
        this.old_hostname=this.currentItem.name
        this.data=Object.entries(this.currentItem.data).map(([key,value]) => ({
                    key,
                    value
                }))
        console.log(this.data);
    }

    async function editHost() {
        const new_host_obj = {
          "old_hostname": this.old_hostname,
          "new_hostname": this.currentItem.name,
          "batches": this.currentItem.batches,
          "data": this.data.reduce((result, item)=> {
                    result[item.key] = item.value
                    return result
        }, {})
        }
        await this.hostStore.editHost(new_host_obj);
        await this.hostStore.getHosts();
    }

    async function submitHost() {
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
    }

    function addHostComp() {
          this.showAddHost=true;
          this.currentItem=[];
          this.currentIndex={}
    }

    async function deleteHost() {
        this.hostStore.hosts.splice(this.currentIndex,1);
        await this.hostStore.deleteHost(this.currentItem);
        this.currentItem=[];
        this.currentIndex={};
        this.data=[];
    }

  </script>
  
