<template>
    <form @submit.prevent="handleFormSubmit()">
        <div 
            v-for="(item, index) in copy_of_data"
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
            <div v-if="item.type==='number'">
                <label for="num"> {{ item.name }} </label>
                <input
                    type="number"
                    required
                    placeholder="0"
                    id="num"
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
                    label="name"
                    track-by="name"
                >
                </VueMultiselect>
            </div>

            <div v-if="item.type==='singleselect'">
                <label> {{ item.name }}</label>
                <VueMultiselect
                    v-model="form_values[index].selected"
                    :multiple="false"
                    :close-on-select="true"
                    :options="SsidStore.ssid_profiles"
                    :searchable="false"
                    track-by="name"
                    label="name"
                    @select="sendFormType(form_values[index].selected)"
                >
                </VueMultiselect>
            </div>
           
        </div>
        <div>
            <button class="btn btn-success" @onclick="handleFormSubmit"
            style="margin-right: 1em;"> Submit </button>
        </div>
        
    </form>
</template>

<script>
import { ref } from 'vue'
import VueMultiselect from 'vue-multiselect';
import { useSsidStore } from '/src/stores/ssid_profiles_stores';
    export default {
        components: { VueMultiselect },
        props: {
            form_data: {
                type: Array,
                required: true

            },
            current_item: {
                required:false
            }
        },
        data() {
            return {
                current: {},
                SsidStore: useSsidStore(),
                copy_of_data: [],
                form_values: this.form_data.map((item) => ({
                    name: item.name,
                    value: '',
                    selected: []
                }))
            }
        },
        methods: {
            handleFormSubmit() {
                const form_data = this.form_values.map((item)=>({
                    name: item.name,
                    value: item.value,
                    selected:item.selected
                }))
                this.$emit('formData', form_data)
            },

            sendFormType(form_type) {
                this.$emit('render-dynamic-form', form_type)
            },

            async setUpData() {
                this.form_values = this.form_data.map((item) => ({
                    name: item.name,
                    value: '',
                    selected: []
                }))
                this.copy_of_data=this.form_data
            //this.form_values=mapped;
            await this.SsidStore.getSsidProfiles();
        }

        },
        // initialize form_values with enough "slots" for data entry
        mounted() {
            this.setUpData();
        },
        watch: {
            form_data() {
                this.setUpData();
            },
            current_item() {
                this.setUpData();
            }
        }
    }
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
