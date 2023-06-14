<template>
    <div class = 'host'>
        <h3> {{ host.title }}</h3>
        <!-- Insert an ICON or just change color when selected??? -->
        <div class = "icons">
            <i 
            class ="material-icons"
            @click="hostStore.deleteHost(host.id)"
            >delete</i>
            <i
            class ="material-icons"
            @click="hostStore.toggleHost(host.id)"
            >check_box_outline_blank
        </i>
        </div>
    </div>
</template>

<script>
import {useHostStore} from '../stores/hosts.store.ts'
    export default {
        // name of prop passed within for-loop in App.vue
        props: ['host'],
        setup() {
            const hostStore = useHostStore();
            return { hostStore } 
        }
    }
</script>

