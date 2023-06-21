<template>
    <div class="col-md-6">
        <!-- regex search bar-->
        <input style="margin-bottom: 1em"
            type="text"
            v-model="searchKey"
            placeholder="Search..."
        />
        <ul class="list-group">
            <li 
            class="list-group-item"
            :class="{active: index == currentIndex}"
            v-for="(item, index) in filteredData"
            :key="index"
            @click="setActiveItem(item, index)"
            >{{ item.name }}
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
                currentItem: {},
                currentIndex: {}
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
            },
            setActiveItem(item, index=1) {
                this.currentItem = item,
                this.currentIndex = index
            }
        }
    })
</script>