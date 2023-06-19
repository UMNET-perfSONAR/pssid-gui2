<template>
    <div class = 'host'>
        <p> name: {{ host.name }}</p>
        <p> _id : {{ host._id }}</p>
        <p> batches: {{ host.batches }}</p>
    </div>
</template>

<script>
import { useHostStore } from '../../stores/host_store.ts'

    export default {
        // name of prop passed within for-loop in App.vue
        props: ['host'],
        setup() {
            const hostStore = useHostStore();
            return { hostStore } 
        }
    }
</script>

