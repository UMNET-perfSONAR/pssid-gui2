<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="ssidStore.isLoading===true"> 
            <p> Loading schedules page... </p>
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

            <div class = 'col-md-6' v-if="display==='add'">
                <h3> Add SSID Profile </h3>
                <dynamicform :form_data="formstuff"></dynamicform>
            </div>
        </div>

    </div>
</template>

<script>
import { useSsidStore } from '/src/stores/ssid_profiles_stores';
import dynamicform from '../components/dynamicform.vue'
    export default {
        components: { dynamicform },
        data() {
            return {
                ssidStore: useSsidStore(),
                currentIndex: {},
                currentItem: {},
                display: 'add',
                formstuff: [{
                    'type': 'text',
                    'name': 'SSID Profile Name'
                },{ 
                    'type': 'text',
                    'name': 'SSID'
                }, {
                    'type': 'text',
                    'name': 'Number'
                }]
            }
        },
        async mounted() {
            await this.ssidStore.getSsidProfiles();
        },
        methods: {
            addSsidForm() {

            },
            setActiveSsid() {

            }
        }
        
    }
</script>