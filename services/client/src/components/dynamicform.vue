<template>
  <form @submit.prevent="handleFormSubmit()">
    <div
      v-for="(item, index) in copy_of_data"
      v-bind:key="index"
      class = 'form-group'>
      <div v-if="item.type==='text'">
        <label> {{ item.name }} <small class="text-muted">({{ item.type }})</small> </label>
        <input
          type="text"
          placeholder="Enter here"
          id="name"
          class="form-control"
          v-model="form_values[index].value"
        />
      </div>

      <div v-if="item.type==='number'">
        <label for="num"> {{ item.name }} <small class="text-muted">({{ item.type }})</small> </label>
        <input
          type="number"
          placeholder="0"
          id="num"
          class="form-control"
          v-model="form_values[index].value"
        />
      </div>

      <div v-if="item.type==='float'" >
        <label for="num"> {{ item.name }} <small class="text-muted">({{ item.type }})</small> </label>
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
        <label> {{ item.name }} <small class="text-muted">({{ item.type }})</small> </label>
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
          <label> {{ item.name }} <small class="text-muted">({{ item.type }})</small> </label>
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
    <div v-if="showSubmit">
      <button class="btn btn-success" type="submit" style="margin-right: 1em;" :disabled="submitDisabled">
        {{ submitLabel }}
      </button>
    </div>

  </form>
</template>

<script>
 import VueMultiselect from 'vue-multiselect';
 import dynamic_add_data from './dynamic_add_data.vue';
 import { useToastStore } from '../stores/toast.store';
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
     },
     submitLabel: {
       type: String,
       default: 'Save'
     },
     // Lets the parent keep the submit button grey until the fields it owns
     // (for example the item name) are valid.
     submitDisabled: {
       type: Boolean,
       default: false
     },
     // Hidden when the parent provides its own submit control (the header
     // "+ Add ..." button calls handleFormSubmit through a ref instead).
     showSubmit: {
       type: Boolean,
       default: true
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
       // Pressing Enter in a field submits the form even while the submit
       // button is greyed out; honour the disabled state either way.
       if (this.submitDisabled) return;
       this.form_values.forEach((field) => {
         this.validateField(field);
       });
       if (Object.entries(this.errors).length > 0) {
         let errorMessage = "Please fix the following errors:\n";
         for (const [key, value] of Object.entries(this.errors)) {
           errorMessage += `${key}: ${value}\n`;
         }
         useToastStore().show(errorMessage, 'error');
         this.errors = {};
         return;
       }
       // INFO: Filtering here is technically unnecessary since this.form_values
       // filters optional data out upon initialization.
       const organized_data = this.form_values.filter(item => item.type !== 'optional');
       // The parent resets the form when (and only when) the save succeeds, so
       // a rejected save (e.g. a duplicate name) keeps the typed values.
       this.$emit('formData', organized_data);
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
       // parent (tests) component.
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
