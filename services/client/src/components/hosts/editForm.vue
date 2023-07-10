<template>
  <!-- Set button text with label prop -->
  <form @submit.prevent="handleSubmit">
    <h1> Edit Host {{ host.name }}</h1>
    <input
            type="text"
            v-model="oldHost" 
        >
    
  </form>


</template>
  
  <script>
  import { useHostStore } from '/src/stores/host_store.ts';
  import { ref } from 'vue';
    
  export default {
      props: ['host'],
      setup() {
        const hostStore = useHostStore();
        const oldHost = ref('');
        oldHost.value = host.name;
        const handleSubmit = () => {
          oldHost.value = '';
        }

        return { handleSubmit, hostStore, oldHost }
      }
      
    }
  </script>