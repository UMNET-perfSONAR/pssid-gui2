<header> 
    <h1> pSSID GUI 2.0 </h1>
  </header>

  <!-- navigation bar -->
  <div class="navbar">
    <a @click="filter='hosts'"> Hosts </a>
    <a @click="filter='host_groups'"> Host Groups </a>
    <a @click="filter='tests'"> Tests </a>
    <a @click="filter='jobs'"> Jobs </a>
    <a @click="filter='schedules'"> Schedules </a>
    <a @click="filter='archivers'"> Archivers </a>
    <a @click="filter='ssid_profiles'"> SSID Profiles </a>
    <a @click="filter='batches'"> Batches </a>
  </div>

  <!-------------- pssid gui application ---------------->
  
  <!-- hosts list-->
  <div class="host-list" v-if="filter === 'hosts'">
     <hostDisplay />
    <!-- information specific to each host -->
    <!-- TODO: Make selected_host === variable -->

  </div>

  <div class="host-list" v-if="filter === 'host_groups'">
    <p> host_groups </p>
   
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
  