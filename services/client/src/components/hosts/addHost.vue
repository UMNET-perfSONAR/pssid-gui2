<template>
        <form @submit.prevent="handleSubmit">

        <div class="add_to_col">
            <input
                type="text"
                placeholder="Enter hostname"
                v-model="newHost" 
            >
            <input 
                type="text"
                placeholder="Enter batches"
                v-model="newBatch"
            />
        </div>
        <button> Submit </button>
    </form>
</template>

<script>
import { useHostStore } from '../../stores/host_store.ts'
import { ref } from 'vue';

export default {
        setup() {
            const hostStore = useHostStore()

            const newHost = ref('')
            const newBatch = ref('')
            const handleSubmit = async () => {
                if (newHost.value.length > 0) {
                    hostStore.addHost({
                        name: newHost.value,
                        batches: newBatch.value,
                        data: '',
                        isFav: false,
                    })
                    newHost.value = ''
                }
            }
            return {handleSubmit, newHost, newBatch}
        }
    }
</script>