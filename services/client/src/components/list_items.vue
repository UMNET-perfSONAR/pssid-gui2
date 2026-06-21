<!-- List items dynamically with regex search bar. Used in all files -->
<template>
  <div v-if="itemArray.length === 0" class="list-empty-state">
    <span class="material-icons list-empty-icon">inbox</span>
    <p>No items yet</p>
  </div>
  <div v-else>
    <input
      type="text"
      v-model="searchKey"
      placeholder="Search..."
      class="form-control search-input"
    />
    <p class="list-hint">Click an item to select and edit</p>
    <ul class="list-group item-list" style="overflow-y: auto; max-height: min(450px, 55vh);">
      <li
        class="list-group-item"
        :class="{ active: index == currentIndex }"
        v-for="(item, index) in filteredArray"
        :key="index"
        @click="setActiveItem(item, index)"
      >
        <span>{{ item.name }}</span>
        <span class="material-icons list-chevron">chevron_right</span>
      </li>
    </ul>
  </div>
</template>

<script>
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
    setActiveItem(item, index = 1) {
      this.currentIndex = index;
      this.currentItem = item;
      this.$emit('updateActive', [item, this.currentIndex]);
    }
  },
  mounted() {
    this.filteredArray = this.itemArray;
  },
  watch: {
    display() {
      if (this.display === true) {
        this.currentIndex = {};
        this.currentItem = {};
      }
    },
    searchKey() {
      try {
        const regex = new RegExp(this.searchKey, 'uim');
        this.filteredArray = this.itemArray.filter(item => regex.test(item.name));
      } catch (error) {
        console.log(error);
      }
    },
    itemArray() {
      this.filteredArray = this.itemArray;
    }
  }
}
</script>
