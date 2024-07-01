<template>
  <div
    v-for="(item, index) in input_fields"
    v-bind:key="index"
    class='form-group'>
    <div v-if="item.type==='text'">
      <label> {{ item.name }} </label>
      <input
        type="text"
        placeholder="Enter here"
        id="name"
        class="form-control"
        v-model="input_fields[index].value"
      />
    </div> <!-- end of text -->

    <div v-if="item.type==='number'">
      <label for="num"> {{ item.name }} </label>
      <input
        type="number"
        placeholder="0"
        id="num"
        class="form-control"
        v-model="input_fields[index].value"
      />
    </div> <!-- end of number -->

    <div v-if="item.type==='multiselect'">
      <label> {{ item.name }}</label>
      <VueMultiselect
        v-model="input_fields[index].selected"
        :multiple="true"
        :close-on-select="false"
        :options="item.options"
        label="name"
        track-by="name"
      >
      </VueMultiselect>
    </div> <!-- end of multiselect -->

    <div v-if="item.type==='singleselect'">
      <label> {{ item.name }} </label>
      <VueMultiselect
        v-model="input_fields[index].selected"
        :multiple="false"
        :close-on-select="true"
        :options="item.options"
        :searchable="false"
        track-by="name"
        label="name"
      >
      </VueMultiselect>
    </div> <!-- end of singleselect -->

  </div> <!-- end of form-group -->

  <div>
    <label>Additional Data</label>
    <dynamic_add_data :addedData="dynamic_options"></dynamic_add_data>
  </div> <!-- end of optional -->

  <div>
    <button class="btn btn-success" @click="editCurItem"
      style="margin-right: 1em;"> Submit </button>
    <button class="btn btn-danger" @click.prevent="deleteCurItem"> Delete </button>
  </div>
</template>

<script>
 import { onMounted } from 'vue';
 import { ref } from 'vue';
 import VueMultiselect from 'vue-multiselect';
 import dynamic_add_data from '/usr/src/app/client/src/components/dynamic_add_data.vue';

 export default {
   emits: ['deleteItem', 'editItem'],
   components: { VueMultiselect, dynamic_add_data },
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
       this.input_fields = this.current_item.spec;
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
