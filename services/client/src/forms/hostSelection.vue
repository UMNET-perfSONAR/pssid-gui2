<template>
  <!-- host selection-->
  <div class="form-group">
    <label for="host-selection"> Host Selection </label>
    <div id="host-selection">

      <!-- view and search all hosts-->
      <div v-if="view_host_options==true">
        <input 
          type="text"
          placeholder="Search hosts..."
          class="form-control"
          v-model="hostSearchKey"
        />
        <ul v-if="view_host_options==true" class="list-group" style="overflow: auto; height: 175px; margin-bottom=1em">
          <li 
            class="list-group-item"
            v-for="(host, index) in filteredHostData"
            :class="{active: host.selected === true}"
            :key="index"
            @click="host.selected = !host.selected"
          >
            <p> {{ host.name }}</p>
          </li>
        </ul>
      </div>

      <!-- view and search selected hosts -->
      <div v-if="view_host_options==false">
        <input 
          type="text"
          placeholder="Search selected hosts..."
          class="form-control"
          v-model="selectedSearchKey"
        />
        <ul class="list-group" style="overflow: auto; height: 175px">                  
          <li 
            class="list-group-item"
            v-for="(host,index) in filteredSelectedData"
            :key="index"
            @click="selectHost(host)"
          > 
            <p> {{ host.name }}</p>
          </li>
          
        </ul>
      </div>
      <!-- host buttons -->
      <div style="margin-top: 1em;">
        <button type="button" @click="selectAllHosts" class="btn btn-primary col-md-6" style="color:white">Select All</button>
        <button v-if="view_host_options===true" @click="viewSelectedHosts" class="btn btn-secondary col-md-6">See Selected Hosts</button>
        <button v-else @click="view_host_options=true" class="btn btn-secondary col-md-6">
          See Filtered Hosts  
        </button>
      </div>
    </div>
  </div>
</template>

<script>
 import { onMounted, ref, watch } from 'vue'
 export default {
   props: {
     copy_of_data: Array,
     required:true
   },
   data() {
     return {
       filteredHostData: this.copy_of_data,
       selected_hosts: [],
       hostSearchKey: '',
       selectedSearchKey: '',
       view_host_options: true,
       filteredSelectedData: []
     }
   },
   methods: {
     selectAllHosts() {
       this.view_host_options=true;
       for (const item of this.filteredHostData) {
         this.copy_of_data[item.index].selected=true;
       }
       this.filterHostData();
     },
     selectHost(host) {
       this.copy_of_data[host.index].selected=false;
       this.filterHostData();
       this.selected_hosts=this.selected_hosts.filter(item => item.name!=host.name)
       this.filterSelectedData();
     },
     filterHostData() {
       const regex = new RegExp(this.hostSearchKey, 'uim');
       this.filteredHostData = this.copy_of_data.filter(item => regex.test(item.name))
     },
     viewSelectedHosts() {
       this.selected_hosts=this.filteredHostData.filter(h => {
         return h.selected == true
       })
       this.filteredSelectedData = this.selected_hosts;
       this.view_host_options=false;
     },
     filterSelectedData() {
       const regex = new RegExp(this.selectedSearchKey, 'uim');
       this.filteredSelectedData = this.selected_hosts.filter(item => regex.test(item.name))
     }
   },
   watch: {
     hostSearchKey() {
       this.filterHostData();
     },
     selectedSearchKey() {
       this.filterSelectedData();
     },
     copy_of_data() {
       this.filteredHostData = this.copy_of_data;
     }
   }

 }
</script>

<style lang="scss" scoped>

</style>
