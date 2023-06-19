<template>
    <div class = 'host'>
        <h3> {{ host.name }}</h3>
        <!-- Insert an ICON or just change color when selected??? -->
        <div class = "icons">
            <i 
            class ="material-icons"
            @click="hostStore.deleteHost(host)"
            >delete</i>
            <i
            class ="material-icons"
            :class="{active: host.isFav}"
            @click="hostStore.toggleHost(host._id)"
            >check_box_outline_blank
        </i>
        </div>
    </div>
</template>

<script>
import {useHostStore} from '../../stores/host_store.ts'
    export default {
        // name of prop passed within for-loop in App.vue
        props: ['host'],
        setup() {
            const hostStore = useHostStore();
            return { hostStore } 
        }
    }
</script>

