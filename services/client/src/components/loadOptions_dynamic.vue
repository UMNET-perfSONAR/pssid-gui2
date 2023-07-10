<template>
    <form @submit.prevent="handleFormSubmit()">
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
                    v-model="form_values[index].value"
                />
            </div>

            <div v-if="item.type==='multiselect'">
                <label> {{ item.name }}</label>
                <VueMultiselect
                    v-model="form_values[index].selected"
                    :multiple="true"
                    :close-on-select="false"
                    :options="item.options"
                >
                </VueMultiselect>
            </div>

            <div v-if="item.type==='singleselect'">
                <label> {{ item.name }}</label>
                <VueMultiselect
                    v-model="form_values[index].selected"
                    :multiple="false"
                    :close-on-select="true"
                    :options="singleOptions"
                    :searchable="false"
                    @select="sendFormType(form_values[index].selected)"
                >
                test 
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
                form_values: this.form_data.map((item) => ({
                    name: item.name,
                    value: '',
                    selected: []
                }))
            }
        },
        props: {
            form_data: {
                type: Array,
                required: true

            },
            singleOptions: {
                type: Array
            }
        },
        methods: {
            handleFormSubmit() {
                const form_data = this.form_values.map((item)=>({
                    name: item.name,
                    value: item.value,
                    selected:item.selected
                }))
                this.$emit('alert', form_data)
            },

            sendFormType(form_type) {
                this.$emit('render-dynamic-form', form_type)
            }

        },
        // initialize form_values with enough "slots" for data entry
        mounted() {
            this.form_values = this.form_data.map((item) => ({
                name: item.name,
                value: '',
                selected: []
            }))
        }

    }
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
