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
            <button class="btn btn-success" @click="editCurItem"
            style="margin-right: 1em;"> Submit </button>
            <button class="btn btn-danger" @click.prevent="deleteCurItem"> Delete </button>
        </div>
        

</template>

<script>
import { onMounted } from 'vue';
import { ref } from 'vue'
import VueMultiselect from 'vue-multiselect';

    export default {
        emits: ['deleteItem', 'editItem'],
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
                console.log('edit cur item')
                this.$emit('editItem', this.input_fields)
            },

            setUpData() {
                // extract spec information 
                this.input_fields = [];

                console.log(this.current_item)
                if (!this.current_item) {
                    console.log('undefined')
                }


                const object = (this.current_item.archiver !== undefined) ? 
                            this.current_item.data : this.current_item.spec; 
                this.input_fields = Object.entries(object).map(([name,value]) => ({
                    name,
                    value
                }))
            },
        }, 
        props: {
            current_item: {
                required: true
            }
        }
      
        
    }
</script>