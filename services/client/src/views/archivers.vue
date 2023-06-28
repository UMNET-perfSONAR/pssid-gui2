<template>
  <div>
      <!-- Loading page feedback -->
      <div v-if="archiverStore.isLoading===true"> 
        <p> Loading archivers page... </p>
      </div>

      <!-- Add ssid_profile button -->
      <div>
        <button @click="addArchiverForm" 
        class="btn btn-primary" style="margin-bottom: 1em;"> Add Archiver </button>
      </div>

      <div class="list row"> 
        <!-- archiver list -->
        <div class="col-md-6">
          <h3> Archiver List </h3>
          <ul class="list-group" style="overflow: auto; height: 400px;">
                    <li
                        class="list-group-item"
                        :class="{active: index == currentIndex}"
                        v-for="(item, index) in archiverStore.archivers"
                        :key="index"
                        @click="setActiveArchiver(item, index)"
                        >
                        <p> {{ item.name }}</p>
                    </li>
                </ul>

        </div>
 



      </div>





  </div>
</template>

<script>
import { useArchiverStore } from '../stores/archiver.store.ts';
  export default {
    data() {
      return {
        archiverStore: useArchiverStore()
      }
    },
    async mounted() {
      this.archiverStore.getArchivers();
    },
    methods: {
      setActiveArchiver() {

      }
    }
    
  }
</script>