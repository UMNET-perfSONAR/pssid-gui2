<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="jobStore.isLoading===true">
            <p> Loading Job page </p>
        </div>
        
        <!-- Add job button -->
        <div>
            <button @click="addJobForm" class="btn btn-primary" style="margin-bottom: 1em;"> Add Job </button>
        </div>
        <h3> Job List </h3>
        <div class="list row"> 
            <itemList v-if="mount ==true" :itemArray="jobStore.jobs" :display="showAddJob" 
                @updateActive="setActiveJob" style="cursor:pointer;"
                class="col-md-6"></itemList>

            <!-- Add Form -->
            <div class="col-md-6" v-if="showAddJob==true">
                <h3> Add Job </h3>
                <form @submit.prevent="submitJob"> 
                    <div class="submit-form">
                        <!-- Job name text box -->
                        <div class="form-group">
                            <label> Job Name </label>
                            <input
                                type="text"
                                placeholder="Enter job name"
                                required
                                id="name"
                                class="form-control"
                                v-model="job_name"
                            />
                        </div>
                        <!-- Test selection dropdown menu -->
                        <div class="form-group"> 
                            <label> Test Selection </label>
                            <VueMultiselect
                                v-model="selected_tests"
                                :multiple="true"
                                :close-on-select="false"
                                :options="testStore.tests"
                                track-by="name"
                                label="name"
                            >
                            </VueMultiselect>
                        </div>
                        <!-- Continue -If radio buttons -->
                        <div class="form-group">
                            <label style="margin-right:1em"> Continue-If:</label>
                            <input
                                type="text"
                                placeholder="Enter here"
                                required
                                id="name"
                                class="form-control"
                                v-model="continue_if"
                            />
                        </div>
                        <!-- Parallel radio buttons -->
                        <div class="form-group">
                            <label style="margin-right:1em"> Parallel:</label>
                            <section>
                                <input
                                    type="radio"
                                    v-model="parallel"
                                    class="radio-button"
                                    value="True"/> True 
                                <input
                                    type="radio"
                                    v-model="parallel"
                                    class="radio-button"
                                    value="False"/> False
                            </section>
                        </div>
                        <button class="btn btn-success"
                        style="margin-right: 1em;"> Submit </button>
                    </div>
                </form>
            </div>

            <!-- Edit Job Form -->
            <div class="col-md-6" v-if="showAddJob==false">
                <h3> Edit Job </h3>
                <form @submit.prevent="editJob"> 
                    <div class="submit-form">
                        <!-- Job name text box -->
                        <div class="form-group">
                            <label> Job Name </label>
                            <input
                                type="text"
                                placeholder="Enter job name"
                                required
                                id="name"
                                class="form-control"
                                v-model="currentItem.name"
                            />
                        </div>
                        <!-- Test selection dropdown menu -->
                        <div class="form-group"> 
                            <label> Test Selection </label>
                            <VueMultiselect
                                v-model="currentItem.tests"
                                :multiple="true"
                                :close-on-select="false"
                                :options="testStore.tests.map(item=>item.name)"
                            >
                            </VueMultiselect>
                        </div>
                        <!-- Continue -If radio buttons -->
                        <div class="form-group">
                            <label style="margin-right:1em"> Continue-If:</label>
                            <input
                                type="text"
                                placeholder="Enter here"
                                required
                                id="name"
                                class="form-control"
                                v-model="currentItem['continue-if']"
                            />
                        </div>
                        <!-- Parallel radio buttons -->
                        <div class="form-group">
                            <label style="margin-right:1em"> Parallel:</label>
                            <section>
                                <input
                                    type="radio"
                                    v-model="currentItem.parallel"
                                    class="radio-button"
                                    value="True"/> True 
                                <input
                                    type="radio"
                                    v-model="currentItem.parallel"
                                    class="radio-button"
                                    value="False"/> False
                            </section>
                        </div>
                        <div>
                            <button class="btn btn-success" style="margin-right: 1em;"> Update </button>
                            <button class="btn btn-danger" @click.prevent="deleteJob"> Delete </button>
                        </div>
                    </div>
                </form>

            </div>
        </div>
    </div>
</template>

<script>
    import { useJobStore } from '../stores/job_store.ts'
    import { useTestStore } from '../stores/test_store.ts';
    import dynamicform from '../components/dynamicform.vue';
    import VueMultiselect from 'vue-multiselect';
    import itemList from '../components/list_items.vue'

    export default {
        components: { dynamicform, VueMultiselect, itemList },
        data() {
            return {
                // input binding 
                parallel: '',
                job_name: '',
                continue_if: 'true',
                selected_tests: [],
                showAddForm: true,
                old_job_name: '',
                mount:false,

                // select items/ switch from add to edit
                currentIndex: {},
                currentItem: {},
                currentJobName: '',
                showAddJob: true,

                // stores 
                jobStore: useJobStore(),
                testStore: useTestStore(),
            }
        },
        async mounted() {
            await this.jobStore.getJobs();
            await this.testStore.getTests();
            this.mount = true;
        },
        methods: {
            addJobForm() {
                this.showAddJob = true;
                this.currentIndex = {}; 
    
            },
            setActiveJob(indexArray) {
                this.currentItem = indexArray[0];
                this.currentIndex = indexArray[1];
                this.showAddJob = false;
                this.old_job_name = this.currentItem.name;
            },
            // submit job to backend 
            submitJob() {
                if(this.job_name.length > 0) {
                    this.jobStore.addJob({
                        name: this.job_name,
                        tests: (this.selected_tests.length == 0)? [] : this.selected_tests.map(obj => obj.name),
                        "continue-if": this.continue_if,
                        parallel: this.parallel
                    }) 
                    // reset values
                    this.job_name='';
                    this.parallel='';
                    this.continue_if='true';
                    this.selected_tests=[]
                }
            },
            async deleteJob() {
                this.jobStore.jobs.splice(this.currentIndex,1);
                await this.jobStore.deleteJob(this.currentItem);
            },
            async editJob() {
                await this.jobStore.updateJob({
                        old_job: this.old_job_name,
                        new_job: this.currentItem.name,
                        parallel: this.currentItem.parallel,
                        "continue-if": this.currentItem['continue-if'],
                        tests: this.currentItem.tests
                })
            }
        }
        
    }
</script>