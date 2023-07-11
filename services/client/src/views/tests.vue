<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="testStore.isLoading===true"> 
            <p> Loading tests page... </p>
        </div>

        <!-- Add ssid_profile button -->
        <div>
            <button @click="addTestForm" class="btn btn-primary" style="margin-bottom: 1em;"> Add Test </button>
        </div>

        <div class="list row"> 
            <!-- schedule list -->
            <div class="col-md-6">
                <h3> Test List </h3>            
                <ul class="list-group" style="overflow: auto; height: 400px;">
                    <li
                        class="list-group-item"
                        :class="{active: index == currentIndex}"
                        v-for="(item, index) in testStore.tests"
                        :key="index"
                        @click="setActiveTest(item, index)"
                        >
                        <p> {{ item.name }}</p>
                    </li>
                </ul>
            </div>

            <div class="col-md-6" v-if="display==='add'">
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
                            :form_layout="testStore.test_options"
                            :current_item="selected_test"
                            :optional_data="optional_data"
                             >
                        </dynamicform>
                    </div>
                </form>
            </div>
   

            <div class = 'col-md-6' v-if="display!=='add'">
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
                    <dynamicform :form_layout="testStore.test_options"
                    @formData="editTest"
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
    import { ref } from 'vue'

    export default {
        components: { dynamicform , VueMultiselect, editFormComp },
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

                test_name: '',
                selected_test: '',
                viewType: {},
                test: {},
                input_fields: [],

                // holds additional parameters for dynamic parts
                curr_data:[],

                // stores 
                testStore: useTestStore(),
                SsidStore: useSsidStore(),
            }
        },  
        async mounted() {
            await this.testStore.getTests();
            await this.testStore.getTestNames();            
        },
        methods: {
            addTestForm() {
                this.display = 'add';
                this.currentIndex = {};
                this.test_name = '';
                this.selected_test = '';
                
                this.showForm = false;
                this.test = {}
               
                this.input_fields = {}
            },
            async setActiveTest(test, index=1) {

                let ind = 0; 
                const data = JSON.parse(JSON.stringify(test.spec));
                this.viewType = test.type;
                await this.testStore.getDesiredTest(test.type, 'selected');

                const myJson = '{}';
                let json_object = JSON.parse(myJson);
                let param_data = JSON.parse(myJson);
                this.curr_data = []

                for (const [key,value] of Object.entries(data)) {
                    if (ind++ < this.testStore.selectedTest.length-1) {
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
                
                this.display='';
            },
            async renderForm(form_type) {
                this.viewType = form_type
                await this.testStore.getDesiredTest(form_type, ''); 
                this.showForm = true;
            },  
            // form_data in this case will be the "spec" information 
            async handleSubmit (form_data) {
                const spec_object = form_data.reduce((result, item)=> {
                    if (item.name==="Optional Data") {
                        return result;
                    }
                    result[item.name] = item.value
                    return result
                }, {});
                const data_object = this.optional_data.reduce((result, item)=> {
                    result[item.key] = item.value
                    return result
                    }, {});
                const obj = Object.assign(spec_object, data_object)

                await this.testStore.addTest({
                    name: this.test_name,
                    type: this.selected_test,
                    spec: obj
                });
                this.test_name='';
                this.selected_test='';
            },

            /**
             * update current test item using put request
             * 
             * @param {*} editFormInputs - contains data to update test with 
             */
            async editTest(editFormInputs) {
                console.log('editing test')
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
                console.log('delete test')
                this.testStore.tests.splice(this.currentIndex, 1);
                await this.testStore.deleteTest(this.currentItem);
                this.currentItem={};
                this.currentIndex='';
            }
        }
    }
</script>