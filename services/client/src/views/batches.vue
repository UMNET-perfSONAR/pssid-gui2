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
        <div class="col-md-6"> 
            <h3> Batch List </h3>
            <itemList :item-array="batchStore.batches" :display="showAddBatch"
                      @updateActive="updateActiveBatch"></itemList>
        </div>
        <div class="col-md-6" v-if="showAddBatch===true"> 
            <h3> Add Batch </h3>
            <!-- ssid profiles -->
            <dynamicform :form_data="formStuff" :add="true">

            </dynamicform>
            <div>
            </div>



        </div>
        <div class="col-md-6" v-else> 
            <h3> Edit Batch </h3>
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
                batchStore: useBatchStore(),
                SsidStore: useSsidStore(),
                JobStore: useJobStore(),
                scheduleStore: useScheduleStore(),
                archiverStore: useArchiverStore(),
                formStuff: []
            }
        },
        setup() {

        },
        async mounted() {
            await this.batchStore.getBatches();
            await this.SsidStore.getSsidProfiles();
            await this.JobStore.getJobs();
            await this.scheduleStore.getSchedules();
            await this.archiverStore.getArchivers();
            console.log(this.archiverStore.archivers);

            console.log(this.SsidStore.ssid_profiles);
            this.formStuff = [
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
                    'type': 'text',
                    'name': 'priority',
                }, 
                {
                    'type': 'text',
                    'name': 'TTL'
                }

            ]
            console.log(this.formStuff)
        },
        methods: {
            // indexArray = [item, index]
            updateActiveBatch(indexArray) {
                this.currentItem=indexArray[0];
                this.currentIndex=indexArray[1];
                this.showAddBatch = false;
            },
            addBatchForm() {
                this.showAddBatch=true;
            }
        }
     
        
    }
</script>