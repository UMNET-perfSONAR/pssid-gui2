<template>
<!-- regex search bar -->

  <button
    class="btn btn-primary"
    type="button"
    @click="addHostComp"
  >  
     Add Hosts
     </button>
  <div class="list row">
     <!-- Search button -->
     <!-- 
     <div class="col-md-7">
         <div class="input-group mb-3">
             <input
                 type="text"
                 class="form-control"
                 placeholder="Search by hostname"
                 v-model="newHost"
             />
         </div>

  
         <div>
             <button
                 class="btn btn-outline-secondary"
                 type="button">
                 Search
             </button>
         </div>
     </div>
    -->

     <!-- List out the items -->
     <div class="col-md-6">
         <h3> Host list </h3>
         <ul class="list-group" > 
             <li
                 class="list-group-item"
                 :class="{active: index == currentIndex}"
                 v-for="(host, index) in hostStore.hosts"
                 :key="index"
                 @click="setActiveHost(host, index)"
             >
            <div class="my_host">
              <p> {{ host.name }}</p>
        </div>
             </li>
         </ul>
     </div>
     <!-- TODO: Add conditional statement so this isn't always present :) -->
     <div v-if="display==='add'" class="col-md-6">
         <h3> Add Host </h3>
         <addhost />
     </div>

    <!-- Display selected host information -->
     <div v-if="display==='host'" class="col-md-6">
        <div v-if="currentHost">
          <h4> Host</h4>
            <div>
              <label><strong>Host : </strong></label> {{ currentHost.name }}
            </div>
            <div>
              <label><strong>Batches : </strong></label> {{ currentHost.batches }}
            </div>
            <div>
              <label><strong>Data : </strong></label> {{ currentHost.data }}
            </div>
          <router-link to="'/hosts/' + currentHost.name'" class="badge badge-warning">Edit</router-link>
          <button @click="deleteHost(currentHost)" class="badge badge-danger"> Delete </button>
        </div>

        <div v-else>
          <br/>
          <p> Please click on a Host ... </p>
        </div>
        
        <div class="col-md-6">
          <button class="m-3 btn btn-sm btn-danger" @click="deleteAllHosts">
           Remove All
          </button>
        </div>
     </div>
 </div>

</template>

<script>
 import {ref} from 'vue'
 import { useHostStore } from '/src/stores/host_store';
 import { useGroupStore } from '/src/stores/groups_stores';
 import addhost from '../components/hosts/addHost.vue'
 import { defineComponent } from 'vue';
 import searchbar from './searchbar.vue'

 export default defineComponent({
     components: {addhost, searchbar},
     data() {    
      return {
        adding: true,
        currentHost: {},
        currentIndex: {},
        newHost: ref(''),
        newData: ref(''),
        display: 'add',
        groupStore: useGroupStore()
      }        
     },
     methods: {
         setActiveHost(host, index=1) {
             this.currentHost = host;
             this.currentIndex = index;
             this.display = 'host';
         },
         deleteAllHosts() {
          const h = useHostStore();
          h.deleteAll();
         },
         addHostComp() {
          this.display='add'
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

         const filter = ref('add');
         return { id,  hostStore, filter }
     }

     // updateSubmit function
 
 })
</script>
