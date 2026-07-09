<!-- List items dynamically with regex search bar. Used in all files.
     Implemented as an ARIA listbox: fully keyboard-operable (Up/Down/Home/End to
     move, Enter/Space to select) with a roving tabindex, so keyboard and screen
     reader users can select an item to edit, not just mouse users.

     Selection is controlled by the parent: it passes the selected item's name
     via :selected-name and reacts to the 'select' event (fired with the clicked
     item, including a click on the already-selected row, which parents treat as
     "close the editor"). Tracking selection by name (never by list position)
     keeps the highlight and the editor in sync even while the list is filtered
     or refetched. -->
<template>
  <div v-if="itemArray.length === 0" class="list-empty-state">
    <span class="material-icons list-empty-icon" aria-hidden="true">inbox</span>
    <p>No items yet</p>
  </div>
  <div v-else>
    <label :for="searchId" class="sr-only">{{ label }}: filter list</label>
    <input
      :id="searchId"
      type="text"
      v-model="searchKey"
      placeholder="Search..."
      class="form-control search-input"
      :aria-describedby="hintId"
    />
    <p class="list-hint" :id="hintId">Click an item (or use the arrow keys and Enter) to edit it; click it again to close the editor.</p>

    <div
      v-if="filteredArray.length"
      class="list-scroll-wrap"
      :class="{ 'is-scrollable': isScrollable, 'at-bottom': isAtBottom }"
    >
      <ul
        ref="listEl"
        class="list-group item-list"
        role="listbox"
        :aria-label="label"
        @scroll="checkScrollState"
      >
        <li
          class="list-group-item"
          :class="{ active: isSelected(item) }"
          v-for="(item, index) in filteredArray"
          :key="item.name"
          :id="optionId(index)"
          ref="options"
          role="option"
          :aria-selected="isSelected(item) ? 'true' : 'false'"
          :tabindex="index === focusIndex ? 0 : -1"
          @click="setActiveItem(item, index)"
          @keydown="onKeydown($event, index)"
        >
          <span>{{ item.name }}</span>
          <span class="material-icons list-chevron" aria-hidden="true">chevron_right</span>
        </li>
      </ul>
      <!-- Visible only while there is unseen content below the fold; fades out
           once scrolled to the bottom, so the affordance never lingers once
           it's no longer true. Purely visual: aria-hidden, decorative only. -->
      <div class="list-scroll-fade" aria-hidden="true"></div>
      <div class="list-scroll-more" aria-hidden="true">
        <span class="material-icons" aria-hidden="true">expand_more</span>
        Scroll for more
      </div>
    </div>
    <p v-else class="list-hint" role="status">No items match your search.</p>

    <!-- Screen-reader-only running count of the filtered results. -->
    <div class="sr-only" role="status" aria-live="polite">{{ resultAnnouncement }}</div>
  </div>
</template>

<script>
let uidSeq = 0;

export default {
  emits: ['select'],
  props: {
    itemArray: {
      type: Array,
      required: true
    },
    // Name of the item currently open in the editor, or null when the parent
    // is showing its "New ..." form. Drives the highlighted row.
    selectedName: {
      type: String,
      default: null
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
      // The last pattern that compiled; a partially typed one (e.g. an
      // unclosed "[") keeps the previous filter until it becomes valid.
      activePattern: '',
      // Which row currently owns the tab stop (roving tabindex). The first row is
      // reachable with a single Tab; arrows then move the tab stop between rows.
      focusIndex: 0,
      // Whether the list is currently taller than its scroll box (drives the
      // "Scroll for more" affordance), and whether it's scrolled to the bottom
      // (hides that affordance once there's nothing further to see).
      isScrollable: false,
      isAtBottom: true
    }
  },
  computed: {
    searchId() { return `${this.uid}-search`; },
    hintId()   { return `${this.uid}-hint`; },
    // Computed (rather than a cached copy) so items added or removed while a
    // search is active still appear/disappear immediately.
    filteredArray() {
      if (!this.activePattern) return this.itemArray;
      let regex;
      try {
        regex = new RegExp(this.activePattern, 'uim');
      } catch {
        return this.itemArray;
      }
      return this.itemArray.filter(item => regex.test(item.name));
    },
    resultAnnouncement() {
      const n = this.filteredArray.length;
      if (this.searchKey === '') return '';
      return `${n} ${n === 1 ? 'item' : 'items'} found`;
    }
  },
  mounted() {
    this.$nextTick(this.checkScrollState);
    window.addEventListener('resize', this.checkScrollState);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.checkScrollState);
  },
  methods: {
    optionId(index) { return `${this.uid}-opt-${index}`; },
    // Recomputes whether the list overflows its box and whether it's scrolled
    // to the bottom, driving the scroll affordance. Called on scroll, on
    // mount, whenever the filtered list changes size, and on window resize
    // (the box height is a viewport-relative max-height).
    checkScrollState() {
      const el = this.$refs.listEl;
      if (!el) return;
      this.isScrollable = el.scrollHeight > el.clientHeight + 1;
      this.isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
    },
    isSelected(item) {
      return this.selectedName !== null && item.name === this.selectedName;
    },
    setActiveItem(item, index) {
      this.focusIndex = index;
      this.$emit('select', item);
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
  watch: {
    searchKey(value) {
      try {
        new RegExp(value, 'uim');
        this.activePattern = value;
      } catch {
        // Keep the previous (valid) pattern while the user is mid-typing.
      }
    },
    // Keep the roving tab stop within the (possibly shorter) filtered list.
    filteredArray(list) {
      if (this.focusIndex > list.length - 1) {
        this.focusIndex = Math.max(0, list.length - 1);
      }
      // The list just changed size (search filter, add/remove, refetch): the
      // scroll box may now overflow when it didn't before, or vice versa.
      this.$nextTick(this.checkScrollState);
    }
  }
}
</script>
