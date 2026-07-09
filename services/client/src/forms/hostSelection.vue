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
          aria-label="Search hosts"
          class="form-control"
          v-model="hostSearchKey"
        />
        <p class="list-hint">Click a host to add it to (or remove it from) this group's selection.</p>
        <ul class="list-group" style="overflow: auto; height: 175px; margin-bottom: 1em;">
          <li
            class="list-group-item"
            v-for="host in filteredHostData"
            :class="{active: host.selected === true}"
            :key="host.name"
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
          aria-label="Search selected hosts"
          class="form-control"
          v-model="selectedSearchKey"
        />
        <p class="list-hint">These hosts are selected. Click a host to remove it from the selection.</p>
        <ul class="list-group" style="overflow: auto; height: 175px">
          <li
            class="list-group-item"
            v-for="host in filteredSelectedData"
            :key="host.name"
            @click="selectHost(host)"
          >
            <p> {{ host.name }}</p>
          </li>

        </ul>
      </div>
      <!-- host buttons -->
      <div style="margin-top: 1em;">
        <button type="button" @click="selectAllHosts" class="btn btn-primary col-md-6" style="color:white">Select All</button>
        <button type="button" v-if="view_host_options===true" @click="viewSelectedHosts" class="btn btn-secondary col-md-6">See Selected Hosts</button>
        <button type="button" v-else @click="view_host_options=true" class="btn btn-secondary col-md-6">
          See Filtered Hosts
        </button>
      </div>
    </div>
  </div>
</template>

<script>
 export default {
   props: {
     copy_of_data: {
       type: Array,
       required: true
     }
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
       let regex;
       try {
         regex = new RegExp(this.hostSearchKey, 'uim');
       } catch {
         return;   // partially typed pattern, keep the previous filter
       }
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
       let regex;
       try {
         regex = new RegExp(this.selectedSearchKey, 'uim');
       } catch {
         return;   // partially typed pattern, keep the previous filter
       }
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
     // The parent swaps in a fresh array when a different group is opened (or
     // the form switches between New and Edit); start over from the full-list
     // view so no stale "selected hosts" snapshot from the previous group shows.
     copy_of_data() {
       this.hostSearchKey = '';
       this.selectedSearchKey = '';
       this.view_host_options = true;
       this.selected_hosts = [];
       this.filteredSelectedData = [];
       this.filteredHostData = this.copy_of_data;
     }
   }

 }
</script>

<style lang="scss" scoped>

</style>
