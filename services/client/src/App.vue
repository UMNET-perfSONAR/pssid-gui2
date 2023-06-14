<template>
  <header> 
    <h1> pSSID GUI 2.0 </h1>
  </header>

  <!-- navigation bar -->
  <div class="navbar">
    <a @click="filter='all'"> Hosts </a>
    <a @click="filter='favs'"> Host Groups </a>
    <a @click="filter='tests'"> Tests </a>
    <a @click="filter='jobs'"> Jobs </a>
    <a @click="filter='schedules'"> Schedules </a>
    <a @click="filter='archivers'"> Archivers </a>
    <a @click="filter='ssid_profiles'"> SSID Profiles </a>
    <a @click="filter='batches'"> Batches </a>
  </div>

  <!-- pssid gui application -->

  <!-- hosts list-->
  <div class="host-list" v-if="filter === 'all'">
    <div class="new-form">
    <hostForm/>
  </div>
  <p> {{ hostStore.totalCount }} total hosts</p>

    <div v-for="host in hostStore.hosts" > 
      <!-- set up with component - set = to host each time -->
      <hostDetails :host="host"/>
    </div>
  </div>


  <div class="host-list" v-if="filter === 'favs'">
    <div v-for="host in hostStore.favs" > 
      <!-- set up with component - set = to host each time -->
      <hostDetails :host="host"/>
    </div>
  </div>
 
  <!-- tests -->
  <div v-if="filter === 'tests'">
    <p> Tests!</p>
  </div>

  <!-- jobs -->
  <div v-if="filter === 'jobs'">
    <p> Jobs!</p>
  </div>

  <!-- schedules -->
  <div v-if="filter === 'schedules'">
    <p> Schedules!</p>
  </div>

  <!-- archivers -->
  <div v-if="filter === 'archivers'">
    <p> Archivers!</p>
  </div>

  <!-- SSID Profiles -->
  <div v-if="filter === 'ssid_profiles'">
    <p> SSID Profiles!</p>
  </div>

  <!-- batches -->
  <div v-if="filter === 'batches'">
    <p> Batches!</p>
  </div>
  

</template>


<script >
import { useTaskStore } from './stores/store.ts'
import { useHostStore } from './stores/hosts.store.ts'
import  hostDetails  from './components/hostDetails.vue'
import hostForm from './components/hostForm.vue'
import { ref } from 'vue';


import formSchema from './json.schemas/host.schema.json'
 
  export default {
    // register component
    components: { hostDetails, hostForm },
    // setup = composition api in node.js
    setup() {
      // invokes store
      const taskStore = useTaskStore();
      const hostStore = useHostStore();

      const filter = ref('all')

      // makes available in template 
      return { hostStore, filter }
    }
  }

</script>
