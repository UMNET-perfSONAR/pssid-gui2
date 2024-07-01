<template>
  <div id="app" class="header">
    <h2 style="text-align: center; margin-bottom: 1em; margin-top: 1em;"> pSSID GUI 2.0 </h2>

    <!-- navbar -->
    <nav class="navbar navbar-expand navbar-dark">

      <router-link to="/hosts" class="navbar-brand">Hosts</router-link>
      <div class="navbar-nav" >
        <li class="nav-item">
          <router-link to="/host_groups" class="navbar-brand">Groups</router-link>
        </li>
        <!-- <li class="nav-item">
             <router-link to="/archivers" class="navbar-brand">Archivers</router-link>
             </li> -->
        <li class="nav-item">
          <router-link to="/schedules" class="navbar-brand">Schedules</router-link>
        </li>
        <li class="nav-item">
          <router-link to="/ssid_profiles" class="navbar-brand">SSID Profiles</router-link>
        </li>
        <li class="nav-item">
          <router-link to="/tests" class="navbar-brand">Tests</router-link>
        </li>
        <li class="nav-item">
          <router-link to="/jobs" class="navbar-brand">Jobs</router-link>
        </li>
        <li class="nav-item">
          <router-link to="/batches" class="navbar-brand">Batches</router-link>
        </li>
      </div>
    </nav>

    <div class="container mt-3">
      <router-view />
    </div>
  </div>

</template>


<script >
 import { ref } from 'vue';
 export default {
   name:"app"
 }

</script>
