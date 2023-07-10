<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="ssidStore.isLoading===true"> 
            <p> Loading SSID Profiles page... </p>
        </div>
        
        <!-- Add ssid_profile button -->
        <div>
            <button @click="addSsidForm" class="btn btn-primary" style="margin-bottom: 1em;"> Add SSID Profile </button>
        </div>

        <div class="list row"> 
            <!-- schedule list -->
            <div class="col-md-6">
                <h3> SSID Profile List </h3>            
                <ul class="list-group" style="overflow: auto; height: 400px;">
                    <li
                        class="list-group-item"
                        :class="{active: index == currentIndex}"
                        v-for="(item, index) in ssidStore.ssid_profiles"
                        :key="index"
                        @click="setActiveSsid(item, index)"
                        >
                        <p> {{ item.name }}</p>
                    </li>
                </ul>

            </div>

            <!-- Add SSID profile -->
            <div class = 'col-md-6' v-if="display==='add'">
                <h3> Add SSID Profile </h3>
                <dynamicform  @formData="receiveEmit"
                 :form_data="formstuff" :add="true"></dynamicform>
            </div>

            <div class = 'col-md-6' v-if="display!=='add'">
                <h3> Edit SSID Profile </h3>
                <div style="margin-bottom:1em">
                    <label> SSID Profile Name </label>
                    <input
                        type="text"
                        placeholder="Enter ssid profile name here"
                        required
                        id="name"
                        class="form-control"
                        v-model="currentItem.name"
                    />
                </div>

                <!-- ssid enter here -->
                <div style="margin-bottom:1em">
                    <label> SSID </label>
                    <input
                        type="text"
                        placeholder="Enter ssid here"
                        required
                        id="name"
                        class="form-control"
                        v-model="currentItem.SSID"
                        />

                </div>
                
                <!-- Edit number -->
                <div>
                    <label for="num"> Number </label>
                    <input 
                        type="number" 
                        required
                        id="num"
                        class="form-control"
                        v-model="currentItem.min_signal"
                        style="margin-bottom: 1em;"
                    />
                </div>
                <button class="btn btn-success" @click="editCurItem"
                    style="margin-right: 1em;"> Submit </button>
                <button class="btn btn-danger" @click.prevent="deleteCurItem"> Delete </button>


            </div>
        </div>

    </div>
</template>

<script>
import { useSsidStore } from '/src/stores/ssid_profiles_stores';
import dynamicform from '../components/dynamicform.vue'
import editDynamicForm from '../components/edit_dynamic_form.vue'
import { number } from '@formkit/inputs';
    export default {
        components: { dynamicform, editDynamicForm },
        data() {
            return {
                ssidStore: useSsidStore(),
                currentIndex: {},
                currentItem: {},
                old_ssidName: {},
                value: {},
                display: 'add',
                formstuff: [{
                    'type': 'text',
                    'name': 'SSID Profile Name'
                },{ 
                    'type': 'text',
                    'name': 'ssid'
                }, {
                    'type': 'number',
                    'name': 'Number'
                }]
            }
        },
        async mounted() {
            await this.ssidStore.getSsidProfiles();
        },
        methods: {
            addSsidForm() {
                this.display = 'add';
                this.currentIndex = {};

            },
            setActiveSsid(ssid, index=1) {
                this.currentIndex = index;
                this.old_ssidName = ssid.name;
                this.currentItem = ssid; 
                this.display='';
            },
            receiveEmit(form_data) {
                if(form_data.length > 0) {
                    // TODO - template this to iterate over array and set name/ etc to be appropriate. will simplify tests file 
                    this.ssidStore.addSsidProfile({
                        name: form_data[0].value,
                        ssid: form_data[1].value,
                        min_signal: form_data[2].value
                    })
                }
            },
            async editCurItem() {
                const object = {   
                    old_ssid_name: this.old_ssidName,
                    new_ssid_name:  this.currentItem.name,
                    ssid:  this.currentItem.SSID,
                    min_signal: this.currentItem.min_signal
                }
                console.log(object)
                await this.ssidStore.editSsidProfile(object);
                await this.ssidStore.getSsidProfiles();

            },
            async deleteCurItem() {
                this.ssidStore.ssid_profiles.splice(this.currentIndex, 1);
                await this.ssidStore.deleteSsidProfile(this.currentItem);
                this.currentIndex = {};
                this.currentIndex = {};
            }
        }
    }
</script>