<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="testStore.isLoading===true"> 
      <p> Loading tests page... </p>
    </div>

    <!-- Add ssid_profile button -->
    <div>
      <button style="margin-bottom: 2em;" v-if="showAddTest"></button>
      <button @click="addTestForm" class="btn btn-primary" v-if="!showAddTest"
                                          style="margin-bottom: 1em;"> Add Test </button>
    </div>
    <h3> Test List </h3>
    <div class="list row"> 
      <!-- schedule list -->
      <itemList v-if="mount == true" :item-array="testStore.tests" :display="showAddTest"
        @updateActive="updateActiveTest" style="cursor:pointer;" class="col-md-6"
      ></itemList>

      <div class="col-md-6" v-if="showAddTest==true">
        <h3> Add Test </h3>
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
      </div>
      

      <div class = 'col-md-6' v-if="showAddTest==false">
        <h3> Edit Test </h3>
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
      </div>
    </div>
  </div>
</template>

<script>
 import { useTestStore } from '/src/stores/test_store';
 import { useSsidStore } from '/src/stores/ssid_profiles_stores';
 import dynamicform from '../components/dynamicform.vue';
 import  VueMultiselect  from 'vue-multiselect';
 import editFormComp from '../components/edit_dynamic_form.vue';
 import itemList from '../components/list_items.vue'
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
       SsidStore: useSsidStore(),
     }
   },

   async mounted() {
     await this.testStore.getTests();
     await this.testStore.getTestNames();     
     this.mount = true;
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
       // 1. Determine which test in Test List is selected.
       const test = itemArray[0];
       const index = itemArray[1];
       let ind = 0; 
       const data = JSON.parse(JSON.stringify(test.spec));
       this.viewType = test.type;
       await this.testStore.getDesiredTest(test.type);

       // 2. Display the Edit Test form correctly.
       const myJson = '{}';
       let json_object = JSON.parse(myJson);
       this.currOptionalData = []
       for (const [key,value] of Object.entries(data)) {
         if (ind < this.testStore.test_options.length) {
           json_object[key] = value;
           ind += 1;
         }
         else {
           this.currOptionalData.push({'key':key, 'value':value})
         }
       };

       // 3. Update control variables.
       this.currentIndex=index;
       this.currentItem= {
         name: test.name,
         spec: json_object,
         type: test.type
       };
       this.old_test_name = test.name;
       this.test = test.type;
       this.showAddTest = false;
     },

     async renderForm(form_type) {
       this.viewType = form_type
       await this.testStore.getDesiredTest(form_type); 
       this.allTestOptions = this.testStore.test_options
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

     /**
      * Updates the current test item using put request
      * 
      * @param {*} editFormInputs - contains data to update test with 
      */
     async editTest(editFormInputs) {
       if (this.currentItem.name.length === 0) {
         alert('Please enter a test name!');
         return;
       }
       // Format *regular* dynamic data.
       const data = editFormInputs.reduce((result, item)=> {
         result[item.name] = item.value
         return result
       }, {});
       // Format *optional* dynamic data.
       const appended_data = this.currOptionalData.reduce((result, item)=> {
         result[item.key] = item.value
         return result
       }, {});

       const object = {
         "old_testname" : this.old_test_name,
         "new_testname" : this.currentItem.name,
         "type" : this.currentItem.type,
         "spec" : Object.assign(data, appended_data),
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
