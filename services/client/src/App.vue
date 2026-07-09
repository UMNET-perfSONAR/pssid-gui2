<template>
  <div id="app">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <ToastNotification />
    <nav class="navbar navbar-expand-md navbar-dark" aria-label="Primary">
      <router-link class="navbar-brand" to="/" @click="navOpen = false">
        <span class="material-icons nav-brand-icon" aria-hidden="true">{{ edition.glyph }}</span>
        <span class="nav-brand-text">{{ edition.shortName }} <strong>{{ edition.emphasis }}</strong></span>
      </router-link>
      <button
        class="navbar-toggler"
        type="button"
        @click="navOpen = !navOpen"
        :aria-expanded="navOpen ? 'true' : 'false'"
        aria-controls="primary-nav"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon" aria-hidden="true"></span>
      </button>
      <div id="primary-nav" class="collapse navbar-collapse" :class="{ show: navOpen }">
        <ul class="navbar-nav mx-auto">
          <li class="nav-item" v-for="link in navLinks" :key="link.to">
            <router-link :to="link.to" class="nav-link" @click="navOpen = false">{{ link.label }}</router-link>
          </li>
        </ul>

        <!-- Appearance picker: a proper menu button rather than a blind toggle,
             so the current mode and the available modes are always announced.
             Fully keyboard-operable (Enter/Space/Arrows/Escape) and closes on
             outside click. -->
        <div class="theme-menu" ref="themeMenu" @focusout="onMenuFocusout">
          <button
            class="theme-toggle"
            type="button"
            aria-haspopup="true"
            :aria-expanded="themeMenuOpen ? 'true' : 'false'"
            :aria-label="`Appearance: ${currentTheme.label}. Change appearance`"
            :title="`Appearance: ${currentTheme.label}`"
            @click="toggleThemeMenu"
            @keydown.down.prevent="openThemeMenu(0)"
            @keydown.up.prevent="openThemeMenu(themeOptions.length - 1)"
          >
            <span class="material-icons" aria-hidden="true">{{ currentTheme.icon }}</span>
          </button>
          <ul
            v-show="themeMenuOpen"
            class="theme-menu-list"
            role="menu"
            aria-label="Appearance"
          >
            <li v-for="(opt, i) in themeOptions" :key="opt.value" role="none">
              <button
                type="button"
                role="menuitemradio"
                :aria-checked="theme === opt.value ? 'true' : 'false'"
                class="theme-menu-item"
                :class="{ active: theme === opt.value }"
                ref="themeItems"
                @click="chooseTheme(opt.value)"
                @keydown.down.prevent="focusItem(i + 1)"
                @keydown.up.prevent="focusItem(i - 1)"
                @keydown.home.prevent="focusItem(0)"
                @keydown.end.prevent="focusItem(themeOptions.length - 1)"
                @keydown.esc.prevent="closeThemeMenu(true)"
              >
                <span class="material-icons theme-menu-icon" aria-hidden="true">{{ opt.icon }}</span>
                <span class="theme-menu-text">
                  <span class="theme-menu-label">{{ opt.label }}</span>
                  <span class="theme-menu-desc">{{ opt.desc }}</span>
                </span>
                <span class="material-icons theme-menu-check" aria-hidden="true">{{ theme === opt.value ? 'check' : '' }}</span>
              </button>
            </li>
          </ul>
        </div>

        <span class="nav-version">{{ edition.version }}</span>
      </div>
    </nav>
    <main id="main-content" class="container mt-4" tabindex="-1">
      <router-view />
    </main>
    <!-- Screen-reader announcement of the active appearance. -->
    <div class="sr-only" role="status" aria-live="polite">{{ themeAnnouncement }}</div>
  </div>
</template>

<script>
import ToastNotification from './components/ToastNotification.vue'
import { activeEdition } from './edition'
import { getTheme, setTheme } from './theme'

// The three appearance modes, with the icon/label/description shown in the menu.
const THEME_OPTIONS = [
  { value: 'light',      icon: 'light_mode',         label: 'Light',      desc: 'Bright surfaces' },
  { value: 'dark',       icon: 'dark_mode',          label: 'Dark',       desc: 'Dim, low-light surfaces' },
  { value: 'colorblind', icon: 'accessibility_new',  label: 'High contrast', desc: 'Colour-blind-safe palette' },
];

export default {
  name: 'app',
  components: { ToastNotification },
  data() {
    return {
      navOpen: false,
      edition: activeEdition,
      theme: getTheme(),
      themeOptions: THEME_OPTIONS,
      themeMenuOpen: false,
      themeAnnouncement: '',
      navLinks: [
        { to: '/',              label: 'Dashboard' },
        { to: '/hosts',         label: 'Hosts' },
        { to: '/host_groups',   label: 'Groups' },
        { to: '/schedules',     label: 'Schedules' },
        { to: '/ssid_profiles', label: 'SSID Profiles' },
        { to: '/tests',         label: 'Tests' },
        { to: '/jobs',          label: 'Jobs' },
        { to: '/batches',       label: 'Batches' },
        { to: '/settings',      label: 'Settings' },
      ]
    }
  },
  computed: {
    currentTheme() {
      return this.themeOptions.find(o => o.value === this.theme) || this.themeOptions[0];
    }
  },
  mounted() {
    document.addEventListener('click', this.onDocumentClick);
    document.addEventListener('keydown', this.onDocumentKeydown);
  },
  beforeUnmount() {
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('keydown', this.onDocumentKeydown);
  },
  methods: {
    toggleThemeMenu() {
      this.themeMenuOpen ? this.closeThemeMenu(false) : this.openThemeMenu();
    },
    openThemeMenu(index) {
      this.themeMenuOpen = true;
      // Focus the requested item (or the active one) once it is rendered.
      this.$nextTick(() => {
        const target = typeof index === 'number'
          ? index
          : Math.max(0, this.themeOptions.findIndex(o => o.value === this.theme));
        this.focusItem(target);
      });
    },
    closeThemeMenu(returnFocus) {
      this.themeMenuOpen = false;
      if (returnFocus) {
        this.$nextTick(() => {
          const btn = this.$refs.themeMenu && this.$refs.themeMenu.querySelector('.theme-toggle');
          if (btn) btn.focus();
        });
      }
    },
    focusItem(index) {
      const items = this.$refs.themeItems;
      if (!items || !items.length) return;
      const n = items.length;
      const i = ((index % n) + n) % n;   // wrap around both ends
      items[i].focus();
    },
    chooseTheme(value) {
      this.theme = value;
      setTheme(value);
      const opt = this.themeOptions.find(o => o.value === value);
      this.themeAnnouncement = `${opt ? opt.label : value} appearance enabled`;
      this.closeThemeMenu(true);
    },
    onDocumentClick(e) {
      if (this.themeMenuOpen && this.$refs.themeMenu && !this.$refs.themeMenu.contains(e.target)) {
        this.closeThemeMenu(false);
      }
    },
    onMenuFocusout(e) {
      // Close when focus leaves the menu entirely (e.g. tabbing out), but not
      // when it moves between the trigger and its own items.
      if (this.themeMenuOpen && this.$refs.themeMenu && !this.$refs.themeMenu.contains(e.relatedTarget)) {
        this.closeThemeMenu(false);
      }
    },
    onDocumentKeydown(e) {
      if (e.key === 'Escape' && this.themeMenuOpen) {
        this.closeThemeMenu(true);
      }
    }
  }
}
</script>

<style>
/* ─── Navbar ──────────────────────────────────────────────────── */
.navbar {
  background-color: var(--primary) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
  padding: 0 1.25rem;
  min-height: 60px;
}
.navbar-brand {
  display: flex !important;
  align-items: center;
  gap: 0.5rem;
  color: #fff !important;
  font-size: 1.1rem !important;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none !important;
  padding: 0;
}
.navbar-brand:hover { opacity: 0.9; }
.nav-brand-icon {
  font-size: 1.4rem;
  color: var(--accent);
}
.nav-brand-text strong {
  color: var(--accent);
}
.navbar .nav-link {
  font-size: 0.875rem !important;
  padding: 1.1rem 0.8rem !important;
  color: rgba(255, 255, 255, 0.78) !important;
  font-weight: 500;
  position: relative;
  transition: color 0.15s, background 0.15s;
}
.navbar .nav-link:hover {
  color: #fff !important;
  background-color: rgba(255, 255, 255, 0.08);
}
.navbar .nav-link.router-link-exact-active {
  color: #fff !important;
  font-weight: 600;
}
.navbar .nav-link.router-link-exact-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 3px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
}
.navbar-toggler {
  border-color: rgba(255, 255, 255, 0.3) !important;
}
.theme-menu {
  position: relative;
  margin-left: 0.5rem;
}
/* On the always-navy navbar a near-transparent button reads as a faint
   dark-blue lump that is easy to miss; give the resting state a clearly
   lighter fill and border so the appearance control is visible before you
   hover it, in every theme. */
.theme-toggle {
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #fff;
  border-radius: 8px;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.55);
}
.theme-toggle .material-icons { font-size: 1.15rem; }

/* The dropdown of appearance modes. Anchored to the trigger on desktop; on the
   collapsed mobile nav it sits inline within the menu column. */
.theme-menu-list {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1050;
  min-width: 260px;
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.theme-menu-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  color: var(--text);
}
.theme-menu-item:hover,
.theme-menu-item:focus-visible {
  background: rgba(var(--primary-rgb), 0.08);
}
.theme-menu-item.active {
  background: rgba(var(--primary-rgb), 0.06);
}
/* Match the icon colour to the menu's own label text so it is always exactly
   as legible as the label, in every theme (the deep-navy --primary was too
   dark to read on the panel in light and high-contrast modes). The active row
   is additionally marked with the check on the right, so colour isn't the cue. */
.theme-menu-icon {
  font-size: 1.25rem;
  color: var(--text);
  flex-shrink: 0;
}
.theme-menu-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.theme-menu-label {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
}
.theme-menu-desc {
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.3;
}
.theme-menu-check {
  font-size: 1.1rem;
  color: var(--ok);
  flex-shrink: 0;
  width: 1.1rem;
}
.nav-version {
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.65rem;
  border-radius: 12px;
  border: 1px solid rgba(var(--accent-rgb), 0.3);
  white-space: nowrap;
  margin-left: 0.5rem;
}

@media (max-width: 767px) {
  .navbar-collapse {
    background: var(--primary-dark);
    padding: 0.5rem 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 0 -1.25rem;
    padding: 0.5rem 1.25rem;
  }
  .navbar .nav-link {
    padding: 0.65rem 0.75rem !important;
  }
  .navbar .nav-link.router-link-exact-active::after {
    display: none;
  }
  .navbar .nav-link.router-link-exact-active {
    background: rgba(var(--accent-rgb), 0.12);
    border-left: 3px solid var(--accent);
  }
  .nav-version {
    margin: 0.5rem 0;
    display: inline-block;
  }
}
</style>
