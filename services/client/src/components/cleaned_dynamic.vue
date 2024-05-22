<template>
  <FormKit
    type="form"
  >
    <div v-for="(item, index) in copy_of_data"
      v-bind:key="index"
      class="form-group"
    >
      <label>{{ item.name }}</label>

      <!-- text box -->
      <FormKit v-if="item.type==='text'"
        type="text"
        placeholder="Enter here"
        validation="required"
        v-model="form_values[index].value"
      >
      </FormKit>
      <integer v-if="item.type==='integer'"></integer>
      <multiselect v-if="item.type==='multiselect'"> </multiselect>
      <singleselect v-if="item.type==='singleselect'"></singleselect>
    </div>
  </FormKit>

</template>

<script setup>
 import textBox from '../forms/textbox.vue'
 import multiselect from '../forms/multiselect.vue'
 import integer from '../forms/integer.vue'
 import singleselect from '../forms/singleselect.vue'

 const props = defineProps({
   form_layout: Array
 }, {
   optional_data: Array
 }, )
 const emits = defineEmits(['formData', 'render-dynamic-form'])

 copy_of_data= props.form_layout;
 form_values = props.form_layout.map((item) => ({
   name: item.name,
   value: '',
   selected: []
 }))


 function setUpData() {
   this.form_values = this.props.form_layout.map((item) => ({
     name: item.name,
     value: '',
     selected: []
   }))
   this.copy_of_data = this.props.form_layout;
 }

</script>

<style lang="scss" scoped>

</style>
