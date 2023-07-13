<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="scheduleStore.isLoading===true"> 
            <p> Loading schedules page... </p>
        </div>

        <!-- Add schedule button -->
        <div>
            <button @click="addScheduleForm" class="btn btn-primary" style="margin-bottom: 1em;"> Add Schedule </button>
        </div>

        <div class="list row"> 
            <!-- schedule list -->
            <div class="col-md-6">
                <h3> Schedule List </h3>            
                <ul class="list-group" style="overflow: auto; height: 400px;">
                    <li
                        class="list-group-item"
                        :class="{active: index == currentIndex}"
                        v-for="(schedule, index) in scheduleStore.schedules"
                        :key="index"
                        @click="setActiveSchedule(schedule, index)"
                        >
                        <p> {{ schedule.name }}</p>
                    </li>
                </ul>

            </div>

            <!-- Add Schedule Form -->
            <div class="col-lg-6" v-if="display==='add'">
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
            <div class="col-lg-6 col-md-6" v-if="display!=='add'">
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
  import cronstuff from '../views/searchbar.vue'
  export default {
    components: { VueMultiselect, cronstuff },
    data() {
        return {
            scheduleStore: useScheduleStore(),
            currentIndex: {},
            currentItem: {},
            display: 'add',
            old_schedule_name: '',

            // for input binding
            cronExpression: "* * * * *",
            schedule_name: '',
        }
    },
    async mounted() {
        await this.scheduleStore.getSchedules();
    },
    methods: {
        addScheduleForm() {
            this.display = 'add';
            this.currentIndex = {};
        },
        setActiveSchedule(schedule, index=1) {
            this.currentIndex = index;
            this.currentItem = schedule;
            this.old_schedule_name = schedule.name;
            this.display = 'edit';
        },
        updateCronExp(updatedCronExp) {
            this.cronExpression=updatedCronExp;
        },
        async submitSchedule() {
            await this.scheduleStore.addSchedule({
                "name": this.schedule_name,
                "repeat": this.cronExpression
            })
            this.schedule_name='';
            this.cronExpression='* * * * *'
        },
        async editSchedule() {
            await this.scheduleStore.updateSchedule({
                "old_schedule": this.old_schedule_name,
                "new_schedule": this.currentItem.name,
                "repeat": this.currentItem.repeat
            });
        },
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