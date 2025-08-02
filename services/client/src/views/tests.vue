<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="testStore.isLoading===true"> 
      <p> Loading tests page... </p>
    </div>

    <!-- Add Test button -->
    <div>
      <button style="margin-bottom: 2em;" v-if="showAddTest"></button>
      <button
        @click="addTestForm"
        class="btn btn-primary"
        v-if="!showAddTest"
        style="margin-bottom: 1em;"
        :disabled="isDisabled"
        :title="!enable_sso ? 'Please sign in to add a test' : ''"> Add Test </button>
    </div>
    <h3> Test List </h3>
    <div class="list row"> 
      <!-- schedule list -->
      <itemList v-if="mount == true" :item-array="testStore.tests" :display="showAddTest"
        @updateActive="updateActiveTest" style="cursor:pointer;" class="col-md-6"
      ></itemList>

      <div class="col-md-6" v-if="showAddTest==true">
        <h3> Add Test </h3>
        <fieldset :disabled="isDisabled" :title="!enable_sso ? 'Please sign in to edit this form' : ''">
        <form>
          <!-- Non-dynamic components -->
          <div style="margin-bottom: 1em;">
            <label> Test Name </label>
            <input
              type="text"
              placeholder="Enter here"
              required
              id="name"
              class="form-control"
              v-model="test_name"/>
          </div>

          <div style="margin-bottom: 1em;">
            <label> Type Selection </label>
            <VueMultiselect
              v-model="selected_test"
              :multiple="false"
              :close-on-select="true"
              :options="testStore.listOfOptions"
              :searchable="false"
              @select="renderForm(selected_test)"
            >
            </VueMultiselect>
          </div>
          <!-- dynamic componnent-->
          <div v-if="showForm===true">
            <dynamicform
              @formData="handleSubmit"
              :form_layout="allTestOptions"
              :current_item="selected_test"
              :optional_data="addedOptionalData"
            >
            </dynamicform>
          </div>
        </form>
        </fieldset>
      </div>

      <div class = 'col-md-6' v-if="showAddTest==false">
        <h3> Edit Test </h3>
        <fieldset :disabled="isDisabled" :title="!enable_sso ? 'Please sign in to edit this form' : ''">
        <!-- Non-dynamic components -->
        <div style="margin-bottom: 1em;">
          <label> Test Name </label>
          <input
            type="text"
            placeholder="Enter here"
            required
            id="name"
            class="form-control"
            v-model="currentItem.name"/>
        </div>

        <div style="margin-bottom: 1em;">
          <label> Type Selection </label>
          <VueMultiselect
            v-model="currentItem.type"
            :multiple="false"
            :close-on-select="true"
            :options="testStore.listOfOptions"
            :searchable="false"
            @select="renderForm(currentItem.type)"
          >
          </VueMultiselect>
        </div>
        <!-- dynamic components -->
        <div v-if="viewType===test">
          <editFormComp 
            :current_item="currentItem"
            @editItem="editTest"
            @deleteItem="deleteTest"
            :dynamic_options="currOptionalData"
          > </editFormComp>
        </div>
        <div v-else>
          <dynamicform :form_layout="allTestOptions"
            @formData="editTest"
            :optional_data="currOptionalData"
          >
          </dynamicform>
        </div>
      </fieldset>
      </div>
    </div>
  </div>
</template>

<script>
 import { useTestStore } from '/src/stores/test_store';
 import { useUserStore } from '/src/stores/user.store';
 import dynamicform from '../components/dynamicform.vue';
 import  VueMultiselect  from 'vue-multiselect';
 import editFormComp from '../components/edit_dynamic_form.vue';
 import itemList from '../components/list_items.vue'
 import config from "../shared/config"
 import { isFormDisabled } from "../utils/formControl.ts"
 import { ref } from 'vue'

 export default {
   components: { dynamicform , VueMultiselect, editFormComp, itemList },
   data() {
     return {
       mount: false,

       /*
        * Variables for the Add Test form
        */
       test_name: '',
       selected_test: '',
       viewType: {},
       // Test options for the currently selected test type.
       allTestOptions: [],
       addedOptionalData: [],

       /*
        * Variables that control which form is displayed,
        * Add Test or Edit Test.
        */
       showAddTest: true,
       // Whether or not to render a dynamic form. Becomes true
       // when a test type is selected.
       showForm: false,

       /*
        * Variables for the Edit Test form
        */
       currentItem: {},
       currentIndex: {},
       test: {},
       old_test_name: '',
       currOptionalData:[],

       // Method(s) to access the store
       testStore: useTestStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO,
     }
   },

   async mounted() {
     await this.testStore.getTests();
     await this.testStore.getTestNames();   
     if (this.enable_sso) {
      await this.userStore.fetchUser();
     }  
     this.mount = true;
   },

   computed: {
      isDisabled() {
        return isFormDisabled();
      }
    },

   methods: {
     addTestForm() {
       // Set control variables.
       this.showAddTest = true;
       this.showForm = false;

       // Set variables related to the Add Test form.
       this.test_name = '';
       this.selected_test = '';
       this.viewType = {};
       this.allTestOptions = [];
       this.addedOptionalData = [];

       // Variables related to the Edit Test form are irrelevant
       // since they will be immediately updated when a test is selected
       // in method `updateActiveTest`.
     },

     async updateActiveTest(itemArray) {
        const test = itemArray[0];
        const index = itemArray[1];

        // Check if user clicked the already-selected test
        if (
          this.currentItem &&
          this.currentItem.name === test.name &&
          this.currentIndex === index
        ) {
          // Deselect
          this.currentItem = {};
          this.currentIndex = {};
          this.old_test_name = null;
          this.viewType = null;
          this.currOptionalData = [];
          this.test = null;
          this.showAddTest = true; // Show the Add Test form again
          return;
        }

        // Proceed as usual with selecting a test
        const data = JSON.parse(JSON.stringify(test.spec));
        this.viewType = test.type;
        await this.testStore.getDesiredTest(test.type);

        const myJson = '{}';
        let json_object = JSON.parse(myJson);
        this.currOptionalData = [];

        // First slice the required fields from the data array.
        const spec = data.slice(0, this.testStore.test_options.length);

        // Then add optional data, if any.
        let ind = this.testStore.test_options.length;
        for (; ind < Object.keys(data).length; ind++) {
          const itemKey = data[ind].key;
          const itemValue = data[ind].value;
          this.currOptionalData.push({ key: itemKey, value: itemValue });
        }

        // Update control variables.
        this.currentIndex = index;
        this.currentItem = {
          name: test.name,
          spec: spec,
          type: test.type
        };
        this.old_test_name = test.name;
        this.test = test.type;
        this.showAddTest = false;
     },

     async renderForm(form_type) {
       this.viewType = form_type;
       await this.testStore.getDesiredTest(form_type); 
       this.allTestOptions = this.testStore.test_options;
       this.allTestOptions.push({'type':'optional', 'name': 'Optional Data'});
       this.showForm = true;
     },

     // Creates a new test.
     async handleSubmit (form_data) {
       if (this.test_name.length > 0) {
         const obj = this.testStore.formatPostData(form_data, this.addedOptionalData);
         await this.testStore.addTest({
           name: this.test_name,
           type: this.selected_test,
           spec: obj
         });
         // Reset the form and allow users to add another test.
         this.addTestForm();
       }
       else {
         alert('Please add a test name!');
       }
     },

     async validateTest(data) {
       await this.testStore.getDesiredTest(this.currentItem.type);
       this.allTestOptions = this.testStore.test_options;

       let errorMessage = '';
       Object.entries(data).forEach(([key, value]) => {
         const testOption = this.allTestOptions.find(option => option.name === key);
         const validatorStr = testOption.hasOwnProperty('validator') ?
           testOption.validator : 'return true;';
         const description = testOption.hasOwnProperty('description') ?
           testOption.description : 'Invalid input for ' + key;
         const validator = new Function('input', validatorStr);
         if (!validator(value)) {
           errorMessage += description + '\n';
         }
       });

       return errorMessage;
     },

     /**
      * Updates the current test item using put request
      * 
      * @param {*} editFormInputs - an array where each entry is
      * an input field and its metadata (validation, etc.)
      */
     async editTest(editFormInputs) {
       // Validate that the name is not empty.
       if (this.currentItem.name.length === 0) {
         alert('Please enter a test name!');
         return;
       }

       // validateTest does not need the metadata of each field. It knows that
       // by calling getDesiredTest and it only needs the input value of each field.
       const dataToValidate = editFormInputs.reduce((result, item)=> {
         result[item.name] = item.value;
         return result;
       }, {});
       let errorMessage = await this.validateTest(dataToValidate);
       if (errorMessage.length > 0) {
         errorMessage = 'Please fix the following errors:\n' + errorMessage;
         alert(errorMessage);

         // Reselect the same item to allow users to edit it again.
         await this.testStore.getTests();
         this.currentItem = this.testStore.tests[this.currentIndex];
         this.updateActiveTest([this.currentItem, this.currentIndex]);

         return;
       }

       const object = {
         "old_testname" : this.old_test_name,
         "new_testname" : this.currentItem.name,
         "type" : this.currentItem.type,
         "spec" : editFormInputs.concat(this.currOptionalData),
       }
       this.old_test_name = this.currentItem.name
       await this.testStore.editTest(object);
       await this.testStore.getTests();

       // Reselect the same item to allow users to edit it again.
       this.currentItem = this.testStore.tests[this.currentIndex];
       this.updateActiveTest([this.currentItem, this.currentIndex]);
     },

     /**
      * Deletes a test specified by currentItem.
      */
     async deleteTest() {
       const deleteIndex = this.currentIndex;
       this.testStore.tests.splice(deleteIndex, 1);
       await this.testStore.deleteTest(this.currentItem);
       if (this.testStore.tests.length <= deleteIndex) {
         this.addTestForm();
       }
       else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.testStore.tests[deleteIndex];
         this.updateActiveTest([this.testStore.tests[deleteIndex], deleteIndex]);
       }
     }
   }
 }
</script>
