<template>   

    <!-- loading -->
    <div class="loading" v-if="hostStore.isLoading"> Loading hosts...</div>


    <!-- individual hosts -->

      <div class="col-md-6">
        <h2> Hosts </h2>
        <div  v-for="(host, index ) in hostStore.hosts" 
        class="list-group-itme"
        :key="index"
        @click="setActiveHost(host, index)"
        :class="{active: index==currentIndex}"> 
          <!-- set up with component - set = to host each time -->
          <hostDetails :host="host" @click=" selected_host = host.name, temp_host = host"/>
        </div>
      </div>

    <!-- display selected host's information / edit information -->
    <div class="col-md-6">
      <h2> Add Host </h2>
      <div>
            <addHost />
        </div>
    </div>


</template>

<script>
 
    import  hostDetails  from '../components/hosts/hostDetails.vue'
    import addHost from '../components/hosts/addHost.vue'
    import hostExpand from '../components/hosts/hostExpand.vue'
    import editHost from '../components/hosts/editForm.vue'
    import { useHostStore } from '../stores/host_store.ts'
    import {ref} from 'vue'

    export default {
        components: { hostDetails, addHost, hostExpand, editHost },
            setup() {
              const hostStore = useHostStore();
              hostStore.getHosts();
              const selected_host = ref('add')
              const temp_host = {}
              return { hostStore, selected_host, temp_host }
            }
    }
</script>