<template>
        <div 
            v-for="(item, index) in input_fields"
            v-bind:key="index"
            class = 'form-group'>
                <label> {{ item.name }} </label>
                <input
                    type="text"
                    v-model= "input_fields[index].value"
                    required
                    id="name"
                    class="form-control"
                />
        </div>
        <div>
            <label>Optional Data</label>
            <dynamic_add_data :addedData="dynamic_options"></dynamic_add_data>
        </div>
        <div>
            <button class="btn btn-success" @click="editCurItem"
            style="margin-right: 1em;"> Submit </button>
            <button class="btn btn-danger" @click.prevent="deleteCurItem"> Delete </button>
        </div>
</template>

<script>
import { onMounted } from 'vue';
import { ref } from 'vue'
import VueMultiselect from 'vue-multiselect';
import dynamic_add_data from '../components/dynamic_add_data.vue';

    export default {
        emits: ['deleteItem', 'editItem'],
        components: { dynamic_add_data },
        data() {
            return {
                input_fields: [],
            }
        },   
        watch: {
            current_item() {
                this.setUpData();
            }
        },
        mounted() {
            this.setUpData();
        }, 
        methods: {
            deleteCurItem() {
                this.$emit('deleteItem')
            },

            editCurItem() {
                this.$emit('editItem', this.input_fields)
            },

            setUpData() {
                // extract spec information 
                this.input_fields = [];

                const object = (this.current_item.archiver !== undefined) ? 
                            this.current_item.data : this.current_item.spec; 
                if (object) {
                    this.input_fields = Object.entries(object).map(([name,value]) => ({
                         name,
                        value
                }))
                }
                else {
                    this.input_fields = [];
                }
            },
        }, 
        props: {
            current_item: {
                required: true
            },
            dynamic_options: {
                type: Array,
                required: false,
            }
        }
      
        
    }
</script>