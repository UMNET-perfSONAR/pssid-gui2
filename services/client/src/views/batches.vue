<template>
    <div>
    <!-- Loading page feedback -->
    <div v-if="batchStore.isLoading===true">
        <p> Loading Batch page </p>
    </div>

    <div class="list row">
        <div class="col-md-6" v-if="batchStore.batches.length === 0">
            <h3> Batch List </h3>
            <p> Batch list is empty </p>
        </div>
        <!-- batch list and regex search bar -->
        <div class="col-md-6" v-else> 
            <h3> Batch List </h3>
            <itemList v-if="mount == true" :item-array="batchStore.batches" :display="showAddBatch"
                      @updateActive="updateActiveBatch"></itemList>
        </div>
        <!-- Add batch form -->
        <div class="col-md-6" v-if="showAddBatch===true"> 
            <h3> Add Batch </h3>
            <dynamicform @formData="addBatch" :form_layout="form_layout">
            </dynamicform>
            <div>
        </div>
        </div>
        <!-- Edit batch form -->
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
                    <label> BSSID Scan Interface </label>
                    <input
                        type="text"
                        placeholder="Enter here"
                        v-model="currentItem.bssid_scan"
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
                <!-- BUTTONS -->
                <div style="margin-bottom:2em">
                    <button class="btn btn-success" style="margin-right:1em"> Update </button>
                    <button class="btn btn-danger" @click="deleteBatch" type="button"> Delete </button>
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
                mount: false,

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
            // hardcode layout of batches form - edit this to add more fields
            this.form_layout = [
                {
                    'type': 'text',
                    'name': 'Batch Name'
                },
                {
                    'type': 'text',
                    'name': 'BSSID Scan Interface'
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
            ];
            this.mount = true;
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
            * 
            * @param {name, ssid_profiles, jobs, schedules, archivers, priority, TTL} form_data 
            */
            async addBatch(form_data) {
                await this.batchStore.addBatch({
                    name: form_data[0].value,
                    bssid_scan: form_data[1].value,
                    priority: form_data[6].value,
                    ssid_profiles: (form_data[2].selected.length == 0)? [] : form_data[2].selected.map(obj => obj.name),
                    schedules: (form_data[4].selected.length == 0)? [] : form_data[4].selected.map(obj => obj.name),
                    jobs: (form_data[3].selected.length == 0)? [] : form_data[3].selected.map(obj => obj.name),
                    archivers: (form_data[5].selected.length == 0)? [] : form_data[5].selected.map(obj => obj.name),
                })
            },

           // handle edit batch - send to editBatch in batches store
            async editBatch() {
                const updated_batch = {
                    "old_batchname":this.old_batchname,
                    "new_batchname":this.currentItem.name,
                    "priority": this.currentItem.priority,
                    "ssid_profiles": this.currentItem.ssid_profiles,
                    "schedules": this.currentItem.schedules,
                    "archivers": this.currentItem.archivers,
                    "jobs": this.currentItem.jobs,
                    "bssid_scan": this.currentItem.bssid_scan
                }
                console.log(updated_batch)
                await this.batchStore.editBatch(updated_batch);

            },

            // delete batch
            async deleteBatch() {
                this.batchStore.batches.splice(this.currentIndex, 1); 
                console.log(this.batchStore.batches);
                await this.batchStore.deleteBatch(this.currentItem);
            }
        }
     
        
    }
</script>
