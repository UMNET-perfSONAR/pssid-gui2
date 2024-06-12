<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="archiverStore.isLoading===true"> 
      <p> Loading archivers page... </p>
    </div>

    <!-- Add ssid_profile button -->
    <div>
      <button style="margin-bottom: 2em;" v-if="showAddArchiver"></button>
      <button @click="addArchiverForm" v-if="!showAddArchiver"
        class="btn btn-primary" style="margin-bottom: 1em;"> Add Archiver </button>
    </div>
    <h3>Archiver List</h3>
    <div class="list row"> 
      <!-- archiver list -->
      <itemList v-if="mount == true" :item-array="archiverStore.archivers" :display="showAddArchiver"
        @updateActive="updateActiveArchiver" style="cursor:pointer;" class="col-md-6"
      ></itemList>

      <!-- Add form page -->
      <div class="col-md-6" v-if="showAddArchiver == true">
        <h3> Add Archiver </h3>
        <form>
          <!-- Non-dynamic components -->
          <div style="margin-bottom: 1em;">
            <label> Archiver Name </label>
            <input
              type="text"
              placeholder="Enter name here"
              required
              id="name"
              class="form-control"
              v-model="archiverName"/>
          </div>          
          <!-- Archiver type selection-->
          <div style="margin-bottom: 1em;">
            <label> Archiver Type Selection </label>
            <VueMultiselect
              v-model="selectedArchiver"
              :multiple="false"
              :close-on-select="true"
              :options="archiverStore.listOfOptions"
              :searchable="false"
              @select="renderAddForm()"
            >
            </VueMultiselect>
          </div>
          <!-- Dynamically render add form information -->
          <div v-if="showForm===true">
            <dynamicForm @formData="handleSubmit"
              :form_layout="allArchiverOptions"
              :optional_data="addedOptionalData">
            </dynamicForm>
          </div>
        </form>
      </div>

      <!-- Edit form page -->
      <div class="col-md-6" v-if="showAddArchiver == false">
        <h3> Edit Archiver </h3>
        <!-- Non-dynamic componenets -->
        <div style="margin-bottom: 1em;">
          <label> Archiver Name </label>
          <input
            type="text"
            placeholder="Enter name here"
            required
            id="name"
            class="form-control"
            v-model="currentItem.name"/>
        </div>
        <div style="margin-bottom: 1em;">
          <label> Type Selection </label>
          <VueMultiselect
            v-model="currentItem.archiver"
            :multiple="false"
            :close-on-select="true"
            :options="archiverStore.listOfOptions"
            :searchable="false"
            @select="renderForm"
          >
          </VueMultiselect>
        </div>
        <!-- dynamic components -->
        <!-- render edit component if type of archiver remains the same -->
        <div v-if="formType === archiverType">
          <editFormComp :current_item="currentItem" 
            :dynamic_options="currOptionalData"
            @deleteItem="deleteArchiver"
            @editItem="editArchiver"> 
          </editFormComp> 
        </div>
        <div v-else> 
          <dynamicForm :form_layout="allArchiverOptions"
            @formData="editArchiver"
            :optional_data="currOptionalData"
          >
          </dynamicForm>
        </div>

      </div>
    </div>
  </div>
</template>

<script>
 import { useArchiverStore } from '../stores/archiver.store.ts';
 import dynamicForm from '../components/dynamicform.vue';
 import editFormComp from '../components/edit_dynamic_form.vue';
 import VueMultiselect from 'vue-multiselect';
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import itemList from '../components/list_items.vue'
 export default {
   components: { dynamicForm, VueMultiselect, editFormComp, dynamic_add_data, itemList },
   data() {
     return {
       mount: false,

       /*
        *  Variables for the Add Archiver form
        */
       archiverName:'',
       // Which type of archiver is selected
       selectedArchiver: '',
       // All archiver options for the selected archiver type
       allArchiverOptions: [],
       // List of optional data added
       addedOptionalData: [],

       /*
        * Variables that control which form is displayed,
        * Add Archiver or Edit Archiver.
        */
       showAddArchiver:true,
       showForm: false,

       /*
        * Variables for the Edit Archiver form
        */
       currentIndex: {},
       currentItem: {},
       // List of optional data for the current selected archiver
       currOptionalData: [],
       // formType is the type of archiver form that is currently being displayed.
       // It is automatically managed by the form component. It may or may not be
       // the same as archiverType, which is the last saved/submitted archiver type.
       formType: '',
       // archiverType is the last saved/submitted archiver type
       archiverType: '',
       // Last saved/submitted archiver name
       oldArchiverName: '',

       /*
        * Method(s) to access the store
        */
       archiverStore: useArchiverStore()
     }
   },

   async mounted() {
     await this.archiverStore.getArchivers();
     await this.archiverStore.getArchiverNames();
     this.mount = true; 
   },

   methods: {
     // render add archiver form
     addArchiverForm() {
       this.showAddArchiver=true;
       this.currentItem={};
       this.currentIndex={};
     },

     /**
      * Update page to view selected host/ edit screen
      * @param {item, itemIndex} indexArray - holds currentItem and currentIndex
      */
     async updateActiveArchiver(indexArray) {
       // 1. Determine which archiver in Archiver List is selected.
       const archiver = indexArray[0];
       const index = indexArray[1];
       let ind = 0;
       const data = JSON.parse(JSON.stringify(archiver.data))
       // Obtain the structure of the selected archiver form.
       this.formType = archiver.archiver;
       await this.archiverStore.getDesiredArchiver(this.formType)
       
       // 2. Display the Edit Archiver form correctly.
       const myJson = '{}';
       let json_object = JSON.parse(myJson);
       let param_data = JSON.parse(myJson);
       this.currOptionalData = []
       for (const [key,value] of Object.entries(data)) {
         // First store REQUIRED data entries under the current selected archiver option.
         // (Different archiver options have different required data entries)
         if (ind < this.archiverStore.archiver_options.length) {
           json_object[key] = value;
           ind += 1;
         }
         // Anything that follows is OPTIONAL data. Store them in a separate array.
         else {
           this.currOptionalData.push({'key':key, 'value':value})
         }
       };

       // 3. Update control variables related to Archiver List.
       // (These are mainly used by the list, e.g. which item is selected and what the
       // current item is.)
       this.currentIndex=index;
       this.currentItem={
         name: archiver.name,
         data: json_object,
         archiver: archiver.archiver
       };
       this.oldArchiverName=archiver.name;
       this.archiverType = archiver.archiver;
       this.showAddArchiver=false;
     },

     // edit current item
     async editArchiver(editFormInputs) {
       if (this.currentItem.name.length === 0) {
         alert('Please enter an archiver name!');
         return;
       }
       const data = editFormInputs.reduce((result, item)=> {
         if (item.name !== "Optional Data" || item.value !== "") {
           result[item.name] = item.value;
         }
         return result;
       }, {});
       const appended_data=this.currOptionalData.reduce((result, item)=> {
         result[item.key] = item.value
         return result
       }, {})

       const object = {
         "old_arc_name" : this.oldArchiverName,
         "new_arc_name" : this.currentItem.name,
         "archiver" : this.currentItem.archiver,
         "data" : Object.assign(data, appended_data)
       }
       await this.archiverStore.editArchiver(object);
       await this.archiverStore.getArchivers();

       this.currentItem = this.archiverStore.archivers[this.currentIndex];
       this.updateActiveArchiver([this.currentItem, this.currentIndex]);
       alert('Archiver has been successfully edited!');
     },

     // render form information from server
     async renderForm() {
       this.formType=this.currentItem.archiver;
       await this.archiverStore.getDesiredArchiver(this.formType)
       this.allArchiverOptions = this.archiverStore.archiver_options;
       this.allArchiverOptions.push({'type':'optional', 'name': 'Optional Data'});
       this.showForm=true; 
     },

     // render add form information from server 
     async renderAddForm() {
       await this.archiverStore.getDesiredArchiver(this.selectedArchiver)
       this.allArchiverOptions = this.archiverStore.archiver_options;
       this.allArchiverOptions.push({'type':'optional', 'name': 'Optional Data'});
       this.showForm=true; 
     },

     // delete archiver
     async deleteArchiver() {
       const deleteIndex = this.currentIndex;
       this.archiverStore.archivers.splice(deleteIndex, 1);
       await this.archiverStore.deleteArchiver(this.currentItem);
       if (this.archiverStore.archivers.length <= deleteIndex) {
         this.addArchiverForm();
       }
       else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.archiverStore.archivers[deleteIndex];
         this.updateActiveArchiver([this.currentItem, this.currentIndex]);
       }
     },
     
     // submit archiver to database
     async handleSubmit(form_data) {
       if (this.archiverName.length==0) {
         alert('Please enter an archiver name!');
         return;
       }
       const spec_object = form_data.reduce((result, item)=> {
         if (item.name==="Optional Data") {
           return result;
         }
         result[item.name] = item.value
         return result;        
       }, {});

       const data_object = this.addedOptionalData.reduce((result, item)=> {
         result[item.key] = item.value
         return result
       }, {});

       const obj = Object.assign(spec_object, data_object)
       await this.archiverStore.addArchiver({
         name: this.archiverName,
         archiver: this.selectedArchiver,
         data: obj
       })
       this.clearAddFormSelection();
       this.addArchiverForm();
     },

     clearAddFormSelection() {
       this.selectedArchiver = '';
       this.archiverName = '';
       this.addedOptionalData = [];
       this.allArchiverOptions = [];
     }
   },
 }
</script>
