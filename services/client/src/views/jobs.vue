<template>
    <div>
        <input 
            type="text"
            v-model="searchTerm"
            @input="filterData"
            placeholder="search for hosts"
        />
        <ul>
            <li v-for="item in filteredData" ></li>
        </ul>

    </div>
</template>

<script>
import { defineComponent } from 'vue';
import { useHostStore } from '/src/stores/host_store';
    export default  {
        data() {
            return {
                searchTerm: '',
                filteredData: [],
                data: ['rp1', 'rp2', 'test', 'my_host']
            }
        },
        methods: {
            // TODO: Add regex data filtering algorithm here
            filterData() {

            }
        }
    }
</script>