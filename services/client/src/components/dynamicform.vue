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

      <div v-if="item.type==='optional'">
        <label>Additonal Data </label>
        <dynamic_add_data :addedData="optional_data"></dynamic_add_data>
      </div>

      <div v-if="item.type==='toggle' && shouldDisplay(item)">
        <div>
          <label> {{ item.name }} </label>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          @click.prevent="handleToggleClick(index)"
        >
          {{ form_values[index].value }}
        </button>
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
 import dynamic_add_data from './dynamic_add_data.vue';
 export default {
   components: { VueMultiselect, dynamic_add_data },
   props: {
     form_layout: {
       type: Array,
       required: true

     },
     current_item: {
       required:false
     },
     optional_data: {
       type: Array
     }
     
   },
   data() {
     return {
       current: {},
       SsidStore: useSsidStore(),
       
       copy_of_data: [],
       // INFO: form_layout contains the item {type: 'optional', name: "Optional Data"},
       // which is correct since it is part of the form layout, namely
       // <div v-if="item.type==='optional'">. We need it to render optional data.
       // However, it should not be a part of the form_values array
       // since optional data values are stored separately in the optional_data array,
       // which is a reference to either addedOptionalData or currOptionalData in the
       // parent (archivers/tests) components.
       form_values: this.form_layout
         .filter(item => item.type !== 'optional')
         .map((item) => ({
           name: item.name,
           value: '',
           selected: []
         }))
     }
   },
   methods: {
     handleFormSubmit() {
       const organized_data = this.form_values
         .filter(item => item.type !== 'optional')
         .map((item)=>({
           name: item.name,
           value: item.value,
           selected: item.selected
         }));
       this.$emit('formData', organized_data);
       // Clear the form after submission.
       this.setUpData();
     },

     handleToggleClick(index) {
       const currentValue = this.form_values[index].value;
       const trueValue = this.form_values[index].trueValue;
       const falseValue = this.form_values[index].falseValue;
       const newValue = currentValue === trueValue ? falseValue : trueValue;
       this.form_values[index].value = newValue;
     },

     sendFormType(form_type) {
       this.$emit('render-dynamic-form', form_type)
     },

     async setUpData() {
       this.form_values = this.form_layout
         .filter(item => item.type !== 'optional')
         .map((item) => ({
           name: item.name,
           value: item.hasOwnProperty('defaultValue') ? item.defaultValue : '',
           selected: [],
           trueValue: item.hasOwnProperty('trueValue') ? item.trueValue : 'NA',
           falseValue: item.hasOwnProperty('falseValue') ? item.falseValue : 'NA'
         }));
       this.copy_of_data=this.form_layout;
       //this.form_values=mapped;
       await this.SsidStore.getSsidProfiles();
     },

     /* Renders a button conditionally. */
     shouldDisplay(item) {
       if (item.dependsOn) {
         // Check if the dependency is satisfied.
         const dependency = this.form_values.find(i => i.name === item.dependsOn.name);
         return dependency.value === item.dependsOn.value;
       }
       // If no dependency is provided, the button is always displayed.
       return true;
     }

   },
   // initialize form_values with enough "slots" for data entry
   mounted() {
     this.setUpData();
   },
   watch: {
     form_layout() {
       this.setUpData();
     },
     current_item() {
       this.setUpData();
     }
   }
 }
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
