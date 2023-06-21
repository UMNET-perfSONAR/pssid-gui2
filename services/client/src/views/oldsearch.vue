<template>
    <div>
        <input 
            type="text"
            v-model="searchKey"
            placeholder="Search..."
        />
        <ul>
            <li v-for="item in filteredData">{{ item.name }}

            </li>
        </ul>
    </div>
</template>

<script>
import { defineComponent } from 'vue';
import { useHostStore } from '/src/stores/host_store';
    export default defineComponent ({
        props: {
            items: {
                type: Array,
                required: true
            },
        },

        data() {
            return {
                searchKey: '',
                filteredData: [],
            }
        },
        // what to watch for 

        watch: {
            searchKey() {
                this.filterData();
            },
            items() {
                this.filterData();
            }

        },
        mounted() {
            this.filterData();
        },
        methods: {
            // TODO: Add regex data filtering algorithm here
            filterData() {
                const regex = new RegExp(this.searchKey, 'i');
                this.filteredData = this.items.filter(item => regex.test(item.name))
            }
        }
    })
</script>