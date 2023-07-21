<!-- List items dynamically. Emit click event back to local file -->
<template>
    <div v-if="itemArray.length === 0">
        List is empty
    </div>
    <div v-else>
        <!-- regex search bar-->
        <input style="margin-bottom: 1em"
          type="text"
          v-model="searchKey"
          placeholder="Search..."
          class="form-control"
        />
        <p> Click on an item to edit </p>
        <ul class="list-group" style="overflow: auto; height: 450px;">
            <li
                class="list-group-item"
                :class="{active: index == currentIndex}"
                v-for="(item, index) in filteredArray"
                :key="index"
                @click="setActiveItem(item, index)"
            >
            <p> {{ item.name }}</p>
            </li>
        </ul>

    </div>
</template>

<script>
import { watch } from 'vue';

    export default {
        emit: ['updateActive'],
        props: {    
            itemArray: {
                type: Array,
                required: true
            },
            display: {
                type: Boolean
            }
        },
        data() {
            return {
                searchKey: '',
                filteredArray: this.itemArray,
                currentItem: {},
                currentIndex: {}
            }
        },
        methods: {
            setActiveItem(item, index=1) {
                this.currentIndex=index;
                this.currentItem=item;
                this.$emit('updateActive', [item, this.currentIndex])
            }
        },
        mounted(){
            console.log('mount')
            this.filteredArray=this.itemArray;
        },
        watch: {
            display() {
                // when showAddBatch === true - don't need to highlight specific item
                if (this.display===true) {
                    this.currentIndex={};
                    this.currentItem={};
                }
            },
            searchKey() {
                try {
                    console.log('searchkey changed')
                    const regex = new RegExp(this.searchKey, 'uim');
                    this.filteredArray = this.itemArray.filter(item => regex.test(item.name))
                }
                catch(error) {
                    console.log(error);
                }
               
            }
        }
    }
</script>