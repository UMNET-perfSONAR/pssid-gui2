<template>
    <div>
      <VueMultiselect
        v-model="selected"
        :options="options"
        :multiple="true"
        :searchable="searchable"
        :close-on-select="false"
        track-by="name"
    >
      </VueMultiselect>
    </div>
  </template>
  
  <script>
  import VueMultiselect from 'vue-multiselect'
  import { useHostStore } from '../stores/host_store.ts'
  export default {
    components: { VueMultiselect },
    data () {
        const hostStore = useHostStore();
        return {
            selected: null,
            options: hostStore.hosts
        }
    },

  }
  </script>
  
  <style src="vue-multiselect/dist/vue-multiselect.css"></style>