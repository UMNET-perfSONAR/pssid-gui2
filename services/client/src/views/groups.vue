<template>
  <div>

    <div v-if="hostGroup.isLoading===true">
      <p> Loading Host Group Page... </p>
    </div>
    <!-- Add Host Button -->
    <div>
      <button @click="addHostForm" class="btn btn-primary" style="margin-bottom: 1em; margin-top: 1em;"> Add Host Group</button>
    </div>
    <div class="list row"> 
      <!-- Host Group List -->
      <div class="col-md-6">
        <h3> Host Group List </h3>
        <!-- regex search bar-->
        <input style="margin-bottom: 1em"
          type="text"
          v-model="searchKey"
          placeholder="Search..."
          class="form-control"
        />
        <ul class="list-group" style="overflow: auto; height: 400px;">
          <li
            class="list-group-item"
            :class="{active: index == currentIndex}"
            v-for="(group, index) in hostGroup.filteredData"
            :key="index"
            @click="setActiveGroup(group, index)"
            >
              <p> {{ group.name }}</p>
          </li>
        </ul> 
      </div>

      <!-- Add Group Form -->
      <div class = "col-md-6" v-if="display==='add'"> 
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
            <!--
            <div class= "form-group">
              <label for="host-select"> Host Selection </label>
              <VueMultiselect
                v-model="newHosts"
                :options="hostStore.hosts"
                :multiple="true"
                :close-on-select="false"
                track-by="name"
                label="name"
              >
              </VueMultiselect>
            </div> -->
            <div class="form-group">
              <label for="host-selection"> Host Selection </label>
              <div id="host-selection">
                <input
                  type="text"
                  placeholder="Search hosts..."
                  class="form-control"
                  v-model="hostSearchKey"
                />
                  <ul class="list-group" style="overflow: auto; height: 175px;">
                    <li
                      class="list-group-item"
                      :class="{active: index == currentIndex}"
                      v-for="(host, index) in hostGroup.filteredHostData"
                      :key="index"
                      @click="selectHost"
                      >
                    <p> {{ host.name }}</p>
                    </li>
                  </ul>
                  <button @click="selectHosts" class="btn btn-primary col-md-6">Select All</button>
                  <button @click="seeSelected" class="btn btn-secondary col-md-6">See Selected Hosts</button>
              </div>

            </div>
            <div class= "form-group">
              <label for="batch-select"> Batch Selection </label>
              <VueMultiselect
                v-model="newBatch"
                :options="batchStore.batches"
                :multiple="true"
                :close-on-select="false"
                label="name"
                track-by="name"
              >
              </VueMultiselect>
            </div>

            <!-- dynamic data section -->
            <label for="params"> Optional Data </label>
            <div class="form-inline"
              v-for="(item, counter) in addedData"
              v-bind:key="counter"
              id="params"
              style="margin-bottom: 1em;">
              <input 
                type="text"
                placeholder="key"
                v-model="item.key"
                class="form-control"
              />
              <input 
                type="text"
                placeholder="value"
                v-model="item.value"
                class="form-control"
              />
              <i class ="material-icons" 
                @click="deleteParameter(counter)"
                style="cursor: pointer;">delete</i>
            </div>
            <button @click="addParameter()" class="btn btn-primary" 
            style="margin-top: 1em; margin-bottom: 1em;"> Add parameter </button>

          </div>
          <button class="btn btn-success" style="margin-bottom: 2em;"> Submit </button>
        </form>
      </div>

      <!-- Edit Group Form -->
      <div class = "col-md-6" v-if="display!=='add'">
        <h3> Edit Host Group </h3>
        <form @submit.prevent="handleUpdate">
          <div class="submit-form">
            <div class="form-group">
              <label for="groups"> Host Group </label>
              <input 
                type="text"
                placeholder="Enter host group name"
                v-model="selectedGroup"
                required
                id="groups"
                class="form-control"
              />
            </div>

            <div class= "form-group">
              <label for="host-select"> Host Selection </label>
              <VueMultiselect
                v-model="currentGroup.hosts"
                :options="hostStore.hosts.map(item=>item.name)"
                :multiple="true"
                :close-on-select="false"
              >
              </VueMultiselect>
            </div>

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

          <!-- dynamic data section -->
          <label for="params"> Optional Data </label>
            <div class="form-inline"
              v-for="(item, counter) in currentGroup.data"
              v-bind:key="counter"
              id="params"
              style="margin-bottom: 1em;">
              <input 
                type="text"
                placeholder="key"
                v-model="item.key"
                class="form-control"
              />
              <input 
                type="text"
                placeholder="value"
                v-model="item.value"
                class="form-control"

              />
              <i class ="material-icons" 
                @click="deleteParameter('group', counter)"
                style="cursor: pointer;">delete</i>
            </div>
            <button @click="addParameter('group')" class="btn btn-primary" 
            style="margin-top: 1em; margin-bottom: 1em;"> Add parameter </button>

          <div>
            <button class="btn btn-success" @click="editGroup"
            style="margin-right: 1em;"> Submit </button>
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
import { defineComponent } from 'vue';
import VueMultiselect from 'vue-multiselect'
import { ref } from 'vue'
import { useHostStore } from '/src/stores/host_store.ts';
import searchbar from './searchbar.vue';

  export default defineComponent({
    components: {VueMultiselect, searchbar},
    data() {
      return {
        currentGroup: {}, currentIndex: {},
        newHosts: '', newBatch: '', newGroup: '',

        display: 'add',
        selectedBatch: '', selectedGroup: '', selectedHosts: [],
        addedData: [{}],

        searchKey: '',
        filteredData: [],
        hostSearchKey: '',
        filteredHostData: [],
        copy_of_data: [],

        // relevant host stores
        hostStore: useHostStore(),
        hostGroup: useGroupStore(),
        batchStore: useBatchStore(),
        selected_hosts: []
      }
    },
    watch: {
      searchKey() {
        //this.filterData();
        this.hostGroup.filterData(this.searchKey);
      },
      hostGroup() {
        //this.filterData();
        this.hostGroup.filterData(this.searchKey);
      },
      hostSearchKey() {
        this.hostGroup.filterHostData(this.hostSearchKey);
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
      this.filteredHostData = this.copy_of_data;
      this.filterData();
      this.filterHostData();
    },

    methods: {
      setActiveGroup(group, index=1) {
        this.currentGroup = group;
        this.currentIndex = index;
        this.selectedGroup = group.name;
        this.selectedBatch = group.batches;
        this.selectedHosts = group.hosts;
        this.display = '';
      },
      async handleSubmit() {
        if (this.newGroup.length > 0) {
          this.hostGroup.addGroup({
            name: this.newGroup,
            batches: this.newBatch,
            hosts: (this.newHosts.length == 0)? [] : this.newHosts.map(obj => obj.name),
            data: this.addedData
          })
          this.newGroup = ref(''),
          this.newBatch = ref(''),
          this.newHosts = ref('')
          this.filterData();
        }
      },
      async editGroup() {
        let object = {
          new_hostgroup: this.selectedGroup,
          old_hostgroup: this.currentGroup.name,
          hosts: this.selectedHosts,
          batches: this.selectedBatch,
          data: this.currentGroup.data,
        }
        await this.hostGroup.editGroup(object);
        await this.hostGroup.getGroups();
      },
      // filter host group data
      filterData() {
        const regex = new RegExp(this.searchKey, 'img');
        this.filteredData = this.hostGroup.host_groups.filter(item => regex.test(item.name))
      },
      // filter host data 
      filterHostData() {
        const regex = new RegExp(this.hostSearchKey, 'img');
        this.filteredHostData = this.hostStore.hosts.filter(item => regex.test(item.name))
      },
      addHostForm() {
        this.display = 'add',
        this.currentIndex = {};
      },
      async deletegroup() {
        this.hostGroup.host_groups.splice(this.currentIndex,1);
        await this.hostGroup.deleteGroup(this.currentGroup);
      },
      // functions for dynamic form
      addParameter(group) {
        if (group === 'group') {
          this.currentGroup.data.push({
            key:'',
            value:''
          })
        }
        else {
          this.addedData.push({
            key: '',
            value: ''
          })
        }
      },
      deleteParameter(group, counter) {
        if (group === 'group') {
          this.currentGroup.data.splice(counter,1);
        }
        else {
          this.addedData.splice(counter,1);
        }
      },
      seeSelected() {
      },
      // add all selected hosts to selected arr
      selectHosts() {
        this.filteredHostData
      }
    }
  })
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
