<template>
    <div>
    <!-- Loading page feedback -->
    <div v-if="batchStore.isLoading===true">
        <p> Loading Batch page </p>
    </div>

    <!-- Add batch button -->
    <div>
        <button @click="addBatchForm" class="btn btn-primary" style="margin-bottom: 1em;"> 
           Add Batch 
        </button>
    </div>

    <div class="list row">
        <div class="col-md-6" v-if="batchStore.batches.length === 0">
            <h3> Batch List </h3>
            <p> Batch list is empty </p>
        </div>
        <div class="col-md-6" v-else> 
            <h3> Batch List </h3>
            <itemList :item-array="batchStore.batches" :display="showAddBatch"
                      @updateActive="updateActiveBatch"></itemList>
        </div>
        <!-- Add batch component -->
        <div class="col-md-6" v-if="showAddBatch===true"> 
            <h3> Add Batch </h3>
            <!-- 
            <form @submit.prevent="addBatch()">
                <div class="form-group">
                    <label> Batch Name </label>
                    <input
                        type="text"
                        placeholder="Enter batch name here"
                        v-model="batch_name"
                        class="form-control"
                    />
                </div>
                <div class="form-group"> 
                    <label> SSID Profile Selection </label>
                    <VueMultiselect
                        v-model="ssid_selection"
                        :multiple="true"
                        close-on-select="false"
                        :options="SsidStore.ssid_profiles"
                        track-by="name"
                        label="name"
                        >
                    </VueMultiselect>
                </div>
            </form>
            -->
            <dynamicform @formData="addBatch" :form_layout="form_layout">
            </dynamicform>
            <div>
            </div>
        </div>
        <div class="col-md-6" v-else> 
            <h3> Edit Batch </h3>
            <form @submit.prevent="editBatch">
                <div class="form-group">
                    <label> Batch Name </label>
                    <input
                        type="text"
                        placeholder="Enter batch name here"
                        v-model="currentItem.name"
                        class="form-control"
                    />
                </div>
                <div class="form-group"> 
                    <label> SSID Profile Selection </label>
                    <VueMultiselect
                        v-model="currentItem.ssid_profiles"
                        :multiple="true"
                        close-on-select="false"
                        :options="SsidStore.ssid_profiles.map(item=> item.name)"
                        >
                    </VueMultiselect>
                </div>
                <!-- job selection-->
                <div class="form-group"> 
                    <label> Job Selection </label>
                    <VueMultiselect
                        v-model="currentItem.jobs"
                        :multiple="true"
                        close-on-select="false"
                        :options="JobStore.jobs.map(item=>item.name)"
                        >
                    </VueMultiselect>
                </div>
                <!-- schedule selection -->
                <div class="form-group"> 
                    <label> Schedule Selection </label>
                    <VueMultiselect
                        v-model="currentItem.schedules"
                        :multiple="true"
                        close-on-select="false"
                        :options="scheduleStore.schedules.map(item=>item.name)"
                        >
                    </VueMultiselect>
                </div>
                <!-- archiver selection -->
                <div class="form-group"> 
                    <label> Archiver Selection </label>
                    <VueMultiselect
                        v-model="currentItem.archivers"
                        :multiple="true"
                        close-on-select="false"
                        :options="archiverStore.archivers.map(item=> item.name)"
                        >
                    </VueMultiselect>
                </div>
                <!-- priority-->
                <div class="form-group">
                    <label> Priority </label>
                    <input
                        type="number"
                        placeholder="0"
                        class="form-control"
                        required
                        v-model="currentItem.priority"
                    />
                </div>
                <!-- TTL -->
                <div class="form-group">
                    <label> TTL </label>
                    <input
                        type="number"
                        placeholder="0"
                        class="form-control"
                        required
                        v-model="currentItem.ttl"
                    />
                </div>
                <div style="margin-bottom:2em">
                    <button class="btn btn-success" style="margin-right:1em"> Update </button>
                    <button class="btn btn-danger" @click="deleteBatch"> Delete </button>
                </div>

            </form> 
        </div>
    </div>
  </div>
</template>

<script>
    import { useBatchStore } from '../stores/batches.store';
    import itemList from '../components/list_items.vue';
    import dynamicform  from '../components/dynamicform.vue';
    import VueMultiselect from 'vue-multiselect'

    import { useSsidStore } from '../stores/ssid_profiles_stores';
    import { useJobStore } from '../stores/job_store';
    import { useScheduleStore } from '../stores/schedule_store';
    import { useArchiverStore } from '../stores/archiver.store';
 
    export default {
        components: { itemList, dynamicform, VueMultiselect },
        data() {
            return {
                currentItem: {},
                currentIndex: {},
                showAddBatch: true,

                ssid_selection: [],
                batch_name: '',
                old_batchname: '',

                // relevant stores 
                batchStore: useBatchStore(),
                SsidStore: useSsidStore(),
                JobStore: useJobStore(),
                scheduleStore: useScheduleStore(),
                archiverStore: useArchiverStore(),
                form_layout: []
            }
        },
        async mounted() {
            await this.batchStore.getBatches();
            await this.SsidStore.getSsidProfiles();
            await this.JobStore.getJobs();
            await this.scheduleStore.getSchedules();
            await this.archiverStore.getArchivers();
            // TODO - Implement normally? Do we want this format? 
            this.form_layout = [
                {
                    'type': 'text',
                    'name': 'Batch Name'
                },
                {
                    'type': 'multiselect',
                    'name': 'SSID Profile',
                    'options': this.SsidStore.ssid_profiles
                },
                {
                    'type': 'multiselect',
                    'name': 'Job Selection',
                    'options': this.JobStore.jobs
                },
                {
                    'type': 'multiselect',
                    'name': 'Schedule Selection',
                    'options': this.scheduleStore.schedules
                },
                {
                    'type': 'multiselect',
                    'name': 'Archiver Selection',
                    'options': this.archiverStore.archivers
                },
                {
                    'type': 'number',
                    'name': 'Priority',
                }, 
                {
                    'type': 'number',
                    'name': 'TTL'
                }

            ]
        },
        methods: {
            /**
             * Change active batch to match item and index from itemList component
             * @param {item, index} indexArray 
             */
            updateActiveBatch(indexArray) {
                this.currentItem=indexArray[0];
                this.currentIndex=indexArray[1];
                this.showAddBatch = false;
                this.old_batchname=this.currentItem.name;
            },
            /**
             * Change local variables to view "Add Batch" sub-page
             */
            addBatchForm() {
                this.showAddBatch=true;
                this.currentItem={};
                this.currentIndex={}
            },
           /**
            * 
            * @param {name, ssid_profiles, jobs, schedules, archivers, priority, TTL} form_data 
            */
            async addBatch(form_data) {
                await this.batchStore.addBatch({
                    name: form_data[0].value,
                    priority: form_data[5].value,
                    ttl: form_data[6].value,
                    ssid_profiles: (form_data[1].selected.length == 0)? [] : form_data[1].selected.map(obj => obj.name),
                    schedules: (form_data[3].selected.length == 0)? [] : form_data[3].selected.map(obj => obj.name),
                    jobs: (form_data[2].selected.length == 0)? [] : form_data[2].selected.map(obj => obj.name),
                    archivers: (form_data[4].selected.length == 0)? [] : form_data[4].selected.map(obj => obj.name),
                })
            },

            /**
             * edit batch in mongodb - wired to server via PUT request
             */
            async editBatch() {
                const updated_batch = {
                    "old_batchname":this.old_batchname,
                    "new_batchname":this.currentItem.name,
                    "priority": this.currentItem.priority,
                    "ttl": this.currentItem.ttl,
                    "ssid_profiles": this.currentItem.ssid_profiles,
                    "schedules": this.currentItem.schedules,
                    "archivers": this.currentItem.archivers,
                    "jobs": this.currentItem.jobs
                }
                console.log(updated_batch)
                await this.batchStore.editBatch(updated_batch);

            },

            async deleteBatch() {
                this.batchStore.batches.splice(this.currentIndex, 1); 
                await this.batchStore.deleteBatch(this.currentItem);
            }
        }
     
        
    }
</script>