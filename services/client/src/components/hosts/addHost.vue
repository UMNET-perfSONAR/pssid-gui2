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
            <!-- dynamic add data view -->
            <dynamic_add_data :addedData="addedData"></dynamic_add_data>

        </div>
        <button class="btn btn-success"> Submit </button>
    </form>
</template>

<script>
import { useHostStore } from '../../stores/host_store.ts'
import VueMultiselect from 'vue-multiselect'
import dynamic_add_data from '../dynamic_add_data.vue';

import { ref } from 'vue';

export default {
    components: { VueMultiselect, dynamic_add_data },
    emits: ['submitData'],
    data () {
        return {
            selected: null,
            options: ['batch1', 'batch2'],
            newBatch: '',
            newData: '',
            newHost: '',
            hostStore: useHostStore(),
            addedData: [{
                key:'',
                value:''

            }],            }
        },
    methods: {
        // functions for dynamic form
        addParameter() {
            this.addedData.push({
                key: '',
                value: ''
            })
        },
        deleteParameter(counter) {
            this.addedData.splice(counter,1);
        },
        async handleSubmit() {
            console.log(this.addedData)
            if(this.newHost.length > 0) {
                this.hostStore.addHost({
                    name: this.newHost,
                    batches: this.newBatch,
                    data: this.addedData
                 })   
            }
                this.newHost = ''
                this.newBatch= {}
                this.newData=''
        }
    },

    }
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
