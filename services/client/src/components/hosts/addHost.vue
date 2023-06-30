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
            <!-- dynamic data section -->
            <div class="form-inline"
            v-for="(item, counter) in addedData"
            v-bind:key="counter">
              <input 
                type="text"
                placeholder="key"
                v-model="item.key"
                class="form-control"
          
              />
              <input 
                type="text"
                placeholder="value"
                v-model="item.value"
                class="form-control"

              />
              <i class ="material-icons" 
                @click="deleteParameter(counter)"
                style="cursor: pointer;">delete</i>
            </div>
            <button @click="addParameter()" class="btn btn-primary" 
            style="margin-top: 1em; margin-bottom: 1em;"> Add parameter </button>

            
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
                newData: ref(''),
                addedData: [{
                    key:'',
                    value:''
                }],
            }
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
