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

        <div class="list row"> 
            <!-- make separate component and emit active back to parent? -->
            <div class="col-md-6"> 
                <!-- job list -->
                <h3> Job List </h3>
                <ul class="list-group" style="overflow: auto; height: 400px;">
                        <li
                            class="list-group-item"
                            :class="{active: index == currentIndex}"
                            v-for="(item, index) in jobStore.jobs"
                            :key="index"
                            @click="setActiveJob(item, index)"
                            >
                            <p> {{ item.name }}</p>
                        </li>
                    </ul>
            </div>

            <!-- Add Form -->
            <div class="col-md-6" v-if="display==='add'">
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
            <div class="col-md-6" v-if="display!=='add'">
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
                                v-model="currentItem.continue_if"
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
    import { formToJSON } from 'axios';
    import { useJobStore } from '../stores/job_store.ts'
    import { useTestStore } from '../stores/test_store.ts';
    import dynamicform from '../components/dynamicform.vue';
    import VueMultiselect from 'vue-multiselect';

    export default {
        components: { dynamicform, VueMultiselect },
        data() {
            return {
                // input binding 
                parallel: '',
                job_name: '',
                continue_if: 'true',
                selected_tests: [],
                showAddForm: true,
                old_job_name: '',

                // select items/ switch from add to edit
                currentIndex: {},
                currentItem: {},
                currentJobName: '',
                display: 'add',

                // stores 
                jobStore: useJobStore(),
                testStore: useTestStore(),
            }
        },
        async mounted() {
            await this.jobStore.getJobs();
            await this.testStore.getTests();
            console.log(this.testStore.tests);
        },
        methods: {
            addJobForm() {
                this.display = 'add';
                this.currentIndex = {}; 
    
            },
            setActiveJob(job, index=1) {
                this.currentIndex = index;
                this.currentItem = job;
                this.old_job_name = job.name;
                this.display = '';
                console.log(job);
            },
            // submit job to backend 
            submitJob() {
                if(this.job_name.length > 0) {
                    this.jobStore.addJob({
                        name: this.job_name,
                        tests: (this.selected_tests.length == 0)? [] : this.selected_tests.map(obj => obj.name),
                        continue_if: this.continue_if,
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
                        continue_if: this.currentItem.continue_if,
                        tests: this.currentItem.tests
                })
            }
        }
        
    }
</script>