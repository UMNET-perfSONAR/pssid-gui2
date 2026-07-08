<!-- List items dynamically with regex search bar. Used in all files.
     Implemented as an ARIA listbox: fully keyboard-operable (Up/Down/Home/End to
     move, Enter/Space to select) with a roving tabindex, so keyboard and screen
     reader users can select an item to edit — not just mouse users. -->
<template>
  <div v-if="itemArray.length === 0" class="list-empty-state">
    <span class="material-icons list-empty-icon" aria-hidden="true">inbox</span>
    <p>No items yet</p>
  </div>
  <div v-else>
    <label :for="searchId" class="sr-only">{{ label }} — filter list</label>
    <input
      :id="searchId"
      type="text"
      v-model="searchKey"
      placeholder="Search..."
      class="form-control search-input"
      :aria-describedby="hintId"
    />
    <p class="list-hint" :id="hintId">Click an item, or use the arrow keys and Enter, to select and edit.</p>

    <ul
      v-if="filteredArray.length"
      class="list-group item-list"
      role="listbox"
      :aria-label="label"
      style="overflow-y: auto; max-height: min(450px, 55vh);"
    >
      <li
        class="list-group-item"
        :class="{ active: index == currentIndex }"
        v-for="(item, index) in filteredArray"
        :key="index"
        :id="optionId(index)"
        ref="options"
        role="option"
        :aria-selected="index == currentIndex ? 'true' : 'false'"
        :tabindex="index === focusIndex ? 0 : -1"
        @click="setActiveItem(item, index)"
        @keydown="onKeydown($event, index)"
      >
        <span>{{ item.name }}</span>
        <span class="material-icons list-chevron" aria-hidden="true">chevron_right</span>
      </li>
    </ul>
    <p v-else class="list-hint" role="status">No items match your search.</p>

    <!-- Screen-reader-only running count of the filtered results. -->
    <div class="sr-only" role="status" aria-live="polite">{{ resultAnnouncement }}</div>
  </div>
</template>

<script>
let uidSeq = 0;

export default {
  emits: ['updateActive'],
  props: {
    itemArray: {
      type: Array,
      required: true
    },
    display: {
      type: Boolean
    },
    // Accessible name for the listbox, announced by screen readers. Defaults to
    // a generic label; pages can pass a specific one (e.g. "Hosts").
    label: {
      type: String,
      default: 'Items'
    }
  },
  data() {
    return {
      uid: `itemlist-${uidSeq++}`,
      searchKey: '',
      filteredArray: this.itemArray,
      currentItem: {},
      currentIndex: {},
      // Which row currently owns the tab stop (roving tabindex). The first row is
      // reachable with a single Tab; arrows then move the tab stop between rows.
      focusIndex: 0
    }
  },
  computed: {
    searchId() { return `${this.uid}-search`; },
    hintId()   { return `${this.uid}-hint`; },
    resultAnnouncement() {
      const n = this.filteredArray.length;
      if (this.searchKey === '') return '';
      return `${n} ${n === 1 ? 'item' : 'items'} found`;
    }
  },
  methods: {
    optionId(index) { return `${this.uid}-opt-${index}`; },
    setActiveItem(item, index = 1) {
      this.currentIndex = index;
      this.currentItem = item;
      this.focusIndex = index;
      this.$emit('updateActive', [item, this.currentIndex]);
    },
    // Move the roving tab stop to a row and put keyboard focus on it.
    focusAt(index) {
      const n = this.filteredArray.length;
      if (!n) return;
      const i = Math.max(0, Math.min(index, n - 1));
      this.focusIndex = i;
      this.$nextTick(() => {
        const els = this.$refs.options;
        if (els && els[i]) els[i].focus();
      });
    },
    onKeydown(e, index) {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault(); this.focusAt(index + 1); break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault(); this.focusAt(index - 1); break;
        case 'Home':
          e.preventDefault(); this.focusAt(0); break;
        case 'End':
          e.preventDefault(); this.focusAt(this.filteredArray.length - 1); break;
        case 'Enter':
        case ' ':
          e.preventDefault(); this.setActiveItem(this.filteredArray[index], index); break;
      }
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
        this.focusIndex = 0;
      }
    },
    searchKey() {
      try {
        const regex = new RegExp(this.searchKey, 'uim');
        this.filteredArray = this.itemArray.filter(item => regex.test(item.name));
      } catch {
        // A partially typed pattern (e.g. an unclosed "[") is not an error;
        // keep the previous filter until the expression becomes valid.
      }
      // Keep the roving tab stop within the (possibly shorter) filtered list.
      if (this.focusIndex > this.filteredArray.length - 1) {
        this.focusIndex = Math.max(0, this.filteredArray.length - 1);
      }
    },
    itemArray() {
      this.filteredArray = this.itemArray;
      if (this.focusIndex > this.filteredArray.length - 1) {
        this.focusIndex = Math.max(0, this.filteredArray.length - 1);
      }
    }
  }
}
</script>
