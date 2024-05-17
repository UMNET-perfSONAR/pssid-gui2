<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="testStore.isLoading===true"> 
            <p> Loading tests page... </p>
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
                            :form_layout="all_test_options"
                            :current_item="selected_test"
                            :optional_data="optional_data"
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
                <!-- Could have a v-if here - render either edit or add pending what dropdown value is currently selected -->
                <div v-if="viewType===test">
                    <editFormComp 
                              :current_item="currentItem"
                              @editItem="editTest"
                              @deleteItem="deleteTest"
                              :dynamic_options="curr_data"
                    > </editFormComp>
                </div>
                <div v-else>    
                    <dynamicform :form_layout="all_test_options"
                    @formData="editTest"
                    :optional_data="optional_data"
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
                // manage view of pages
                currentIndex: {},
                currentItem: {},
                display: 'add',
                showForm: false,
                old_test_name: '',

                optional_data: [{
                    "key": '',
                    "value": ''
                }],
                mount: false,

                test_name: '',
                selected_test: '',
                viewType: {},
                test: {},
                input_fields: [],
                showAddTest: true,

                // holds additional parameters for dynamic parts
                curr_data:[],

                // for dynamic form rendering 
                all_test_options: [],

                // stores 
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
            async updateActiveTest(itemArray) {
                const test = itemArray[0];
                const index = itemArray[1];
                let ind = 0; 
                const data = JSON.parse(JSON.stringify(test.spec));
                this.viewType = test.type;
                await this.testStore.getDesiredTest(test.type);
                const myJson = '{}';
                let json_object = JSON.parse(myJson);
                this.curr_data = []
          
                for (const [key,value] of Object.entries(data)) {
                    if (ind++ < this.testStore.test_options.length) {
                        json_object[key] = value;
                    }
                    else {
                        this.curr_data.push({'key':key, 'value':value})
                    }
                };
                this.currentIndex=index;
                this.currentItem= {
                    name: test.name,
                    spec: json_object,
                    type: test.type
                };

                this.test = test.type;
                this.old_test_name = test.name;
                this.showAddTest = false;
            },
            async renderForm(form_type) {
                this.viewType = form_type
                await this.testStore.getDesiredTest(form_type); 
                this.all_test_options = this.testStore.test_options
                this.all_test_options.push({'type':'optional', 'name': 'Optional Data'});
                this.showForm = true;
                console.log(this.optional_data);
            },  
            // form_data in this case will be the "spec" information 
            async handleSubmit (form_data) {
                if (this.test_name.length > 0) {
                    const obj = this.testStore.formatPostData(form_data, this.optional_data);
                    await this.testStore.addTest({
                        name: this.test_name,
                        type: this.selected_test,
                        spec: obj
                    });
                    this.test_name='';
                    this.selected_test='';
                }
                else {
                    alert('Please add a test name!');
                }
            },
            /**
             * update current test item using put request
             * 
             * @param {*} editFormInputs - contains data to update test with 
             */
            async editTest(editFormInputs) {
                if (this.currentItem.name.length === 0) {
                    alert('Please enter a test name!')
                    return
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
                    "old_testname" : this.old_test_name,
                    "new_testname" : this.currentItem.name,
                    "type" : this.currentItem.type,
                    "spec" : Object.assign(data, appended_data),
                }
                this.old_test_name = this.currentItem.name
                await this.testStore.editTest(object);
                await this.testStore.getTests();
            },
            /**
             * delete test specified by currentItem 
             */
            async deleteTest() {
                this.testStore.tests.splice(this.currentIndex, 1);
                await this.testStore.deleteTest(this.currentItem);
                this.currentItem={};
                this.currentIndex='';
                this.curr_data=[];
            }
        }
    }
</script>
