<template>
    <form @submit.prevent="handleSubmit">
        <div class="submit-form">
            <div class="form-group">
                <label for="hosts"> Hosts </label>
                <input
                    type="text"
                    placeholder="Enter hostname"
                    v-model="newHost" 
                    required
                    id="hosts"
                    name="host form"
                    class="form-control"
                >
            </div>
            <div class = "form-group">
                <label> Batches </label>
                <VueMultiselect 
                    :close-on-select="false"
                    v-model="newBatch"
                    :options="options"
                    :multiple="true"
                >
             </VueMultiselect>
            </div>
            <div class="form-group">
                <label for="data"> Data </label>
                <input
                    type="text"
                    placeholder="Optional data"
                    v-model="newData" 
                    id="data"
                    name="data form"
                    class="form-control"
                >
            </div>
            
        </div>
        <button class="btn btn-success"> Submit </button>
    </form>
</template>

<script>
import { useHostStore } from '../../stores/host_store.ts'
import VueMultiselect from 'vue-multiselect'

import { ref } from 'vue';

export default {
        components: { VueMultiselect },
        data () {
            return {
                selected: null,
                options: ['batch1', 'batch2'],
                newBatch: ref(''),
                newData: ref('')
            }
        },
        setup() {
            const hostStore = useHostStore()
            var submitted = false; 
            const newHost = ref('')
            const newBatch = ref('')
            const newData = ref('')
            const handleSubmit = async () => {
                if (newHost.value.length > 0) {
                    hostStore.addHost({
                        name: newHost.value,
                        batches: newBatch.value,
                        data: newData.value,
                        isFav: false,
                    })
                    newHost.value = ''
                    newBatch.value= ''
                    newData.value=''
                    submitted = true; 
                }
            }
            return {handleSubmit, newHost, newBatch, submitted}
        }
    }
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
