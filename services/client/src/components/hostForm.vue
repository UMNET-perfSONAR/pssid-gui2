<template>
    <form @submit.prevent="handleSubmit">
    <input
        type="text"
        placeholder="hostname"
        v-model="newHost"
    >
    <button>Add</button>
    </form>
</template>

<script>
import { useHostStore } from '../stores/hosts.store';
import { ref } from 'vue';

export default {
        setup() {
            const hostStore = useHostStore()

            const newHost = ref('')
            const handleSubmit = () => {
                if (newHost.value.length > 0) {
                    hostStore.addHost({
                        title: newHost.value,
                        isFav: false,
                        id: Math.floor(Math.random() * 10000)
                    })
                    newHost.value = ''
                }
            }
            return {handleSubmit, newHost}
        }
    }
</script>