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
          id="name"
          class="form-control"
          v-model="form_values[index].value"
        />
      </div>

      <div v-if="item.type==='number'">
        <label for="num"> {{ item.name }} </label>
        <input
          type="number"
          placeholder="0"
          id="num"
          class="form-control"
          v-model="form_values[index].value"
        />
      </div>

      <div v-if="item.type==='float'" >
        <label for="num"> {{ item.name }} </label>
        <input
          type="number"
          step="any"
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
        <label> {{ item.name }} </label>
        <VueMultiselect
          v-model="form_values[index].selected"
          :multiple="false"
          :close-on-select="true"
          :options="item.options"
          :searchable="false"
          track-by="name"
          label="name"
          @select="sendFormType(form_values[index].selected)"
        >
        </VueMultiselect>
      </div>

      <div v-if="item.type==='optional'">
        <label>Optional Data </label>
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
       // The following variables are initialized in setUpData
       copy_of_data: [],
       form_values: [],

       // Variables for validation
       /* form: {}, */
       errors: {}
     }
   },
   methods: {
     handleFormSubmit() {
       this.form_values.forEach((field) => {
         this.validateField(field);
       });
       if (Object.entries(this.errors).length > 0) {
         let errorMessage = "Please fix the following errors:\n";
         for (const [key, value] of Object.entries(this.errors)) {
           errorMessage += `${key}: ${value}\n`;
         }
         alert(errorMessage);
         this.errors = {};
         return;
       }
       // INFO: Filtering here is technically unnecessary since this.form_values
       // filters optional data out upon initialization.
       const organized_data = this.form_values.filter(item => item.type !== 'optional');
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
       // INFO: form_layout contains the item {type: 'optional', name: "Optional Data"},
       // which is correct since it is part of the form layout, namely
       // <div v-if="item.type==='optional'">. We need it to render optional data.
       // However, it should not be a part of the form_values array
       // since optional data values are stored separately in the optional_data array,
       // which is a reference to either addedOptionalData or currOptionalData in the
       // parent (archivers/tests) components.
       this.form_values = this.form_layout
         .filter(item => item.type !== 'optional')
         .map((item) => ({
           name: item.name,
           type: item.type,
           options: item.options,
           value: item.default,
           selected: item.hasOwnProperty('default') ? [item.default] : [],
           trueValue: item.trueValue,
           falseValue: item.falseValue,
           validator: item.hasOwnProperty('validator') ? item.validator : 'return true;',
           description: item.hasOwnProperty('description') ?
             item.description : 'Input is invalid'
         }));
       this.copy_of_data = this.form_layout;
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
     },

     validateField(field) {
       const value = field.value;
       const validator = new Function('input', field.validator);
       if (!validator(value)) {
         this.errors[field.name] = field.description;
       }
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
