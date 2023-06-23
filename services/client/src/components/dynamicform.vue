<template>
    <form>
        <div 
            v-for="(item, index) in form_data"
            v-bind:key="index"
            class = 'form-group'>
            <div v-if="item.type==='text'">
                <label> {{ item.name }} </label>
                <input
                    type="text"
                    placeholder="Enter here"
                    required
                    id="name"
                    class="form-control"
                />
            </div>

            <div v-if="item.type==='multiselect'">
                <label> {{ item.name }}</label>
                <VueMultiselect
                    v-model="item.selected"
                    :multiple="true"
                    :close-on-select="false"
                    :options="item.options"
                >
                </VueMultiselect>
            </div>
           
        </div>
        <div>
            <button class="btn btn-success" style="margin-right: 1em;"> Submit </button>
        </div>
        
    </form>


</template>

<script>
import { ref } from 'vue'
import VueMultiselect from 'vue-multiselect';

    export default {
        components: { VueMultiselect },
        data() {
            return {
                newName: ref(''),
                selected: ref('')
            }
        },
        props: {
            form_data: {
                type: Array,
                required: true

            },
        }
    }
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
