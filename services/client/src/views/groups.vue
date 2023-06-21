<template>
  <div>

    
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
        />
        <ul class="list-group" style="overflow: auto; height: 400px;">
          <li
            class="list-group-item"
            :class="{active: index == currentIndex}"
            v-for="(group, index) in filteredData"
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

            <div class= "form-group">
              <label for="host-select"> Host Selection </label>
              <VueMultiselect
                v-model="newHosts"
                :options="host_options"
                :multiple="true"
                :close-on-select="false"
                track-by="name"
                label="name"
              >
              </VueMultiselect>
            </div>

            <div class= "form-group">
              <label for="batch-select"> Batch Selection </label>
              <VueMultiselect
                v-model="newBatch"
                :options="options"
                :multiple="true"
                :close-on-select="false"
              >
              </VueMultiselect>
            </div>
          </div>
          <button class="btn btn-success"> Submit </button>
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
                v-model="selectedHosts"
                :options="host_options"
                :multiple="true"
                :close-on-select="false"
              >
              </VueMultiselect>
            </div>

            <div class= "form-group">
              <label for="batch-select"> Batch Selection </label>
              <VueMultiselect
                v-model="selectedBatch"
                :options="options"
                :multiple="true"
                :close-on-select="false"
              >
              </VueMultiselect>
            </div>
          </div>
          <button class="btn btn-success"> Submit </button>
          <button class="btn btn-danger" @click="deletegroup"> Delete </button>
        </form>

      </div>
    </div>
  </div>
</template>

<script>
import { useGroupStore } from '/src/stores/groups_stores';
import { defineComponent } from 'vue';
import VueMultiselect from 'vue-multiselect'
import { ref } from 'vue'
import { useHostStore } from '/src/stores/host_store.ts';
import searchbar from './searchbar.vue';

  export default defineComponent({
    components: {VueMultiselect, searchbar},
    data() {
      return {
        selected:null,
        host_options: [],
        group_options: [],
        options: ['batch1'],
        currentGroup: {},
        currentIndex: {},
        newHosts: ref(''),
        newBatch: ref(''),
        newGroup: ref(''),
        hostStore: useHostStore(),
        hostGroup: useGroupStore(),
        display: ref('add'),
        selectedBatch: ref(''),
        selectedGroup: ref(''),
        selectedHosts: ref(''),

        searchKey: '',
        filteredData: [],
      }
    },
    watch: {
      searchKey() {
        this.filterData();
      },
      hostGroup() {
        this.filterData();
      }
    },
    async mounted() {
      await this.loadHosts();
      this.filterData();
    },

    methods: {
      filterData() {
        const regex = new RegExp(this.searchKey, 'i');
        this.filteredData = this.hostGroup.host_groups.filter(item => regex.test(item.name))
      },
      async handleSubmit() {
        if (this.newGroup.length > 0) {
          this.hostGroup.addGroup({
            name: this.newGroup,
            batches: this.newBatch,
            hosts: (this.newHosts.length == 0)? [] : this.newHosts.map(obj => obj.name)
          })
          this.newGroup = ref(''),
          this.newBatch = ref(''),
          this.newHosts = ref('')
          this.filterData();
        }
      },
      setActiveGroup(group, index=1) {
        this.currentGroup = group;
        this.currentIndex = index;
        this.selectedGroup = group.name;
        this.selectedBatch = group.batches;
        this.selectedHosts = group.hosts;
        this.display = '';
      },
      async loadHosts() {
        this.host_options = this.hostStore.hosts
        this.group_options = this.hostGroup.host_groups
      },
      addHostForm() {
        this.display = 'add',
        this.currentIndex = {};
      },
      async deletegroup() {
        await this.hostGroup.deleteGroup(this.currentGroup);
      }
    },
    setup() {
      const hostGroup = useGroupStore();
      hostGroup.getGroups();
      return { hostGroup }
    }
  })
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
