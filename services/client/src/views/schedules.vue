<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="scheduleStore.isLoading===true"> 
            <p> Loading schedules page... </p>
        </div>

	<!-- Add schedule button -->
        <div>
	  <button v-if="showAddSchedule"
	    style="margin-bottom: 2em;"></button>
          <button @click="addScheduleForm" class="btn btn-primary" v-if="!showAddSchedule"
	    style="margin-bottom: 1em;"> Add Schedule </button>
        </div>
        <h3> Schedule List </h3>
        <div class="list row"> 
            <!-- schedule list and regex searchbar -->
            <item-list v-if="mount==true" class="col-md-6" :item-array="scheduleStore.schedules"  :display="showAddSchedule"
                @updateActive="updateActiveSchedule" style="cursor: pointer;"> 
            </item-list>

            <!-- Add Schedule Form -->
            <div class="col-lg-6" v-if="showAddSchedule==true">
                <h3> Add Schedule </h3>
                <form @submit.prevent="submitSchedule"> 
                    <div class="submit-form">
                        <div class="form-group">
                            <label for="name"> Schedule name</label>
                            <input 
                                type="text"
                                placeholder="Enter schedule name"
                                v-model="schedule_name"
                                required
                                id="name"
                                class="form-control"
                            />
                        </div>
                    </div>
                    <cronstuff :init="cronExpression" @update-cron="cronExpression=$event"></cronstuff>
                    <button class="btn btn-success"> Submit </button>
                </form>
            </div>
            <!-- Edit Schedule Form -->
            <div class="col-lg-6 col-md-6" v-if="showAddSchedule==false">
                <h3> Edit Schedule </h3>
                <form @submit.prevent="editSchedule"> 
                    <div class="submit-form">
                        <div class="form-group">
                            <label for="name"> Schedule name</label>
                            <input 
                                type="text"
                                placeholder="Enter schedule name"
                                v-model="currentItem.name"
                                required
                                id="name"
                                class="form-control"
                            />
                        </div>
                    </div>
                    <div>
                        <cronstuff :init="currentItem.repeat" @update-cron="currentItem.repeat=$event"></cronstuff>
                    </div>
                    <button class="btn btn-success" style="margin-right: 1em;"> Update </button>
                    <button class="btn btn-danger" @click="deleteSchedule"> Delete </button>
                </form>

            </div>
        </div>
    
    </div>
  </template>
  
  <script>
  import VueMultiselect from 'vue-multiselect'
  import { useScheduleStore } from '/src/stores/schedule_store';
  import cronstuff from '../components/cron.vue'
  import itemList from '../components/list_items.vue';
  export default {
    components: { VueMultiselect, cronstuff, itemList },
    data() {
        return {
            scheduleStore: useScheduleStore(),
            currentIndex: {},
            currentItem: {},
            old_schedule_name: '',
            showAddSchedule: true,
            mount: false,

            // for input binding
            cronExpression: "* * * * *",
            schedule_name: '',
        }
    },
    // load schedules 
    async mounted() {
        await this.scheduleStore.getSchedules();
        this.mount = true;
    },
    methods: {
        // render add schedule form 
        addScheduleForm() {
            this.showAddSchedule = true;
            this.currentIndex = {};
        },
        // render edit schedule form for selected schedule
        updateActiveSchedule(indexArray) {
            this.currentItem=indexArray[0];
            this.currentIndex=indexArray[1];
            this.old_schedule_name = this.currentItem.name;
            this.showAddSchedule = false;
        },
        // update cron expression - do this inline?
        updateCronExp(updatedCronExp) {
            this.cronExpression=updatedCronExp;
        },
        // submit schedule - pass along to addSchedule in schedule store 
        async submitSchedule() {
            await this.scheduleStore.addSchedule({
                "name": this.schedule_name,
                "repeat": this.cronExpression
            })
            this.schedule_name='';
            this.cronExpression='* * * * *'
        },
        // eddit schedule - pass along to editSchedule in schedule store 
        async editSchedule() {
            await this.scheduleStore.updateSchedule({
                "old_schedule": this.old_schedule_name,
                "new_schedule": this.currentItem.name,
                "repeat": this.currentItem.repeat
            });
        },
        // delete schedule - pass along to delete Schedule in schedule store
        async deleteSchedule() {
            this.scheduleStore.schedules.splice(this.currentIndex, 1); 
            await this.scheduleStore.deleteSchedule(this.currentItem)
            this.currentItem={};
            this.cronExpression='';
            this.currentIndex={};
        }
    }
  }
  </script>
  <style src="vue-multiselect/dist/vue-multiselect.css"></style>
