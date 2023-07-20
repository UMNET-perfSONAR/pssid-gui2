<template>
  <div>
      <!-- Loading page feedback -->
      <div v-if="archiverStore.isLoading===true"> 
        <p> Loading archivers page... </p>
      </div>

      <!-- Add ssid_profile button -->
      <div>
        <button @click="addArchiverForm" 
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
                    v-model="archiver_name"/>
            </div>          
            <!-- Archiver type selection-->
            <div style="margin-bottom: 1em;">
              <label> Archiver Type Selection </label>
                <VueMultiselect
                  v-model="selected_archiver"
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
              :form_layout="all_archiver_options"
              :optional_data="optional_data">
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
          <div v-if="formType === archiver_type"> 
            <editFormComp :current_item="currentItem" 
                :dynamic_options="curr_data"
                @deleteItem="deleteArchiver"
                @editItem="editArchiver"> 
            </editFormComp> 
          </div>
          <div v-else> 
            <dynamicForm :form_layout="all_archiver_options"
                @formData="editArchiver"
                :optional_data="optional_data"
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
        // variables cor add form
        selected_archiver: '',
        archiver_name:'',
        optional_data: [],
        mount: false, 

        all_archiver_options: [],

        // manage view of pages 
        showAddArchiver:true,
        showForm: false,
        currentIndex: {},
        currentItem: {},
        
        curr_data: [],
        // rendering of dynamic edit form 
        formType: '',
        archiver_type: '',
        old_archiver_name: '',

        // relevant stores
        archiverStore: useArchiverStore()
      }
    },
    async mounted() {
      await this.archiverStore.getArchivers();
      await this.archiverStore.getArchiverNames();
      this.mount = true; 
    },
    methods: {
       /**
       * update page to view selected host/ edit screen
       * @param {item, itemIndex} indexArray - holds currentItem and currentIndex
       */
      async updateActiveArchiver(indexArray) {
        const archiver = indexArray[0];
        const index = indexArray[1];
        let ind=0;
        const data = JSON.parse(JSON.stringify(archiver.data))
        // load num 
        this.formType = archiver.archiver;
        await this.archiverStore.getDesiredArchiver(this.formType)
        
        // use to extract data from archivers.data
        const myJson = '{}';
        let json_object = JSON.parse(myJson);
        let param_data = JSON.parse(myJson);
        this.curr_data = []

        for (const [key,value] of Object.entries(data)) {
          if (ind++ < this.archiverStore.archiver_options.length-1) {
             console.log((`${key}:${value}`));
             json_object[key] = value;
          }
          else {
            this.curr_data.push({'key':key, 'value':value})
          }
        };

        this.currentIndex=index;
        this.currentItem={
          name: archiver.name,
          data: json_object,
          archiver: archiver.archiver
        };
        // set display related variables 
        this.old_archiver_name=archiver.name;
        this.archiver_type = archiver.archiver;
        this.showAddArchiver=false;
      },
      addArchiverForm() {
        this.showAddArchiver=true;
        this.currentIndex={};

      },
      // edit current item
      async editArchiver(editFormInputs) {
        if (this.currentItem.name.length === 0) {
          alert('Please enter an archiver name!');
          return;
        }
        const data = editFormInputs.reduce((result, item)=> {
                    result[item.name] = item.value
                    return result
                    }, {});
        const appended_data=this.curr_data.reduce((result, item)=> {
                              result[item.key] = item.value
                              return result
                            }, {})

        const object = {
          "old_arc_name" : this.old_archiver_name,
          "new_arc_name" : this.currentItem.name,
          "archiver" : this.currentItem.archiver,
          "data" : Object.assign(data, appended_data)
        }
        await this.archiverStore.editArchiver(object);
        await this.archiverStore.getArchivers();
      },
      // render form information from server
      async renderForm() {
        this.formType=this.currentItem.archiver;
        await this.archiverStore.getDesiredArchiver(this.formType)
        this.all_archiver_options = this.archiverStore.archiver_options;
        this.all_archiver_options.push({'type':'optional', 'name': 'Optional Data'});
        this.showForm=true; 
      },

      async renderAddForm() {
        await this.archiverStore.getDesiredArchiver(this.selected_archiver)
        this.all_archiver_options = this.archiverStore.archiver_options;
        this.all_archiver_options.push({'type':'optional', 'name': 'Optional Data'});
        this.showForm=true; 
      },

      async deleteArchiver() {
        this.archiverStore.archivers.splice(this.currentIndex, 1); 
        await this.archiverStore.deleteArchiver(this.currentItem);
        this.currentItem={};
        this.currentIndex='';
      },
      // format and submit data to DB
      // TODO - Move most of this to the store. too much going on here
      async handleSubmit(form_data) {
        if (this.archiver_name.length==0) {
            alert('Please enter an archiver name!');
            return;
        }
        const spec_object = form_data.reduce((result, item)=> {
          console.log(item.name);
          if (item.name==="Optional Data") {
            return result;
          }
          result[item.name] = item.value
          return result;        
        }, {});

        const data_object = this.optional_data.reduce((result, item)=> {
          result[item.key] = item.value
          return result
        }, {});

        const obj = Object.assign(spec_object, data_object)
        await this.archiverStore.addArchiver({
          name: this.archiver_name,
          archiver: this.selected_archiver,
          data: obj
        })
        this.archiver_name = '';
        this.archiver = '';
      },
    },
  }
</script>