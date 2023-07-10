<!-- List items dynamically. Emit click event back to local file -->
<template>
    <div>
        <ul class="list-group" style="overflow: auto; height: 400px;">
            <li
                class="list-group-item"
                :class="{active: index == currentIndex}"
                v-for="(item, index) in itemArray"
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
        watch: {
            display() {
                // when showAddBatch === true - don't need to highlight specific item
                if (this.display===true) {
                    this.currentIndex={};
                    this.currentItem={};
                }
            }
        }
    }
</script>