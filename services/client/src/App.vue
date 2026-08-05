<template>
  <div id="app">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <ToastNotification />
    <nav class="navbar navbar-expand-md navbar-dark" aria-label="Primary">
      <!-- Identity block: the product name and the version of it you are
           looking at, kept together as one unit so the version reads as part
           of the name rather than as another piece of navigation. -->
      <div class="nav-brand-group">
        <router-link class="navbar-brand" to="/" @click="navOpen = false">
          <span class="material-icons nav-brand-icon" aria-hidden="true">{{ edition.glyph }}</span>
          <span class="nav-brand-text">{{ edition.shortName }} <strong>{{ edition.emphasis }}</strong></span>
        </router-link>
        <span class="nav-version">{{ edition.version }}</span>
      </div>
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
        <ul class="navbar-nav">
          <li class="nav-item" v-for="link in navLinks" :key="link.to">
            <router-link :to="link.to" class="nav-link" @click="navOpen = false">{{ link.label }}</router-link>
          </li>
        </ul>

        <!-- Utility cluster, anchored to the right margin and ordered by how
             far each control reaches: appearance is a setting for this browser,
             the profile identifies the session, and Sign out ends it. -->
        <div class="nav-utilities">
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
              <span
                class="material-icons"
                :class="{ 'theme-toggle-icon-moon': theme === 'dark' }"
                aria-hidden="true"
              >{{ currentTheme.icon }}</span>
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
                  <span class="theme-menu-label">{{ opt.label }}</span>
                  <span class="material-icons theme-menu-check" aria-hidden="true">{{ theme === opt.value ? 'check' : '' }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Signed-in identity and the way out of it. Only rendered when single
               sign-on is actually in force: with SSO off there is no identity to
               show and no session to end, so a "Sign out" control would be a lie.
               Sign out sits outside .nav-account and behind a wider gap: it is the
               one control here that ends the session, and it should not be a
               near-miss for the profile it sits beside. -->
          <div v-if="showAccount" class="nav-identity">
            <div class="nav-account">
              <span
                v-if="accessLevel === 'read'"
                class="nav-readonly"
                title="Your group membership grants read access; edits are refused."
              >Read-only</span>
              <span class="nav-user" :title="accountTitle">
                <span class="material-icons nav-user-icon" aria-hidden="true">account_circle</span>
                <span class="nav-user-name">{{ accountName }}</span>
              </span>
            </div>
            <button type="button" class="nav-signout" @click="userStore.signOut()">Sign out</button>
          </div>
        </div>
      </div>
    </nav>
    <main id="main-content" class="container mt-4" tabindex="-1">
      <!-- Sign-in could not complete and retrying would loop. Surfaced here
           rather than in the console because the fix is an operator's, and the
           person seeing it is the one who will report it. -->
      <div v-if="userStore.authError" class="alert alert-danger" role="alert">
        <strong>Sign-in did not complete.</strong>
        {{ userStore.authError }}
        <a href="/login" class="alert-link">Try again</a>.
      </div>
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
import { useUserStore } from './stores/user.store'
import config from './shared/config'

// The three appearance modes, with the icon and label shown in the menu.
// 'contrast' (a circle with one half filled solid) is the standard high-contrast
// glyph, matching the "High contrast" label directly. 'tonality' is the photo
// filter icon (its unfilled half is broken into dashed arcs) and
// 'accessibility_new' (a person) reads as "accessibility settings" more broadly;
// both are a step removed from what this option does.
const THEME_OPTIONS = [
  { value: 'light',      icon: 'light_mode', label: 'Light' },
  { value: 'dark',       icon: 'dark_mode',  label: 'Dark' },
  { value: 'accessible', icon: 'contrast',   label: 'High contrast' },
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
    },
    userStore() {
      return useUserStore();
    },
    // The server's report wins over the value compiled into the bundle, for the
    // same reason it does everywhere else: ENABLE_SSO can be set in the
    // environment of a prebuilt image, and the bundle would not know.
    showAccount() {
      return (this.userStore.ssoEnabled ?? config.ENABLE_SSO) === true;
    },
    accessLevel() {
      return this.userStore.accessLevel;
    },
    accountName() {
      const user = this.userStore.user;
      if (!user) return 'Not signed in';
      return user.name || user.email || user.sub || 'Signed in';
    },
    accountTitle() {
      const user = this.userStore.user;
      if (!user) return 'Not signed in';
      const groups = (user.groups || []).join(', ');
      return groups ? `${this.accountName} - groups: ${groups}` : this.accountName;
    },
  },
  async mounted() {
    document.addEventListener('click', this.onDocumentClick);
    document.addEventListener('keydown', this.onDocumentKeydown);
    // Resolve the identity once for the whole application. Every page also calls
    // this on its own mount (they gate their forms on it), but doing it here too
    // means the navbar knows who is signed in on the very first paint, and an
    // unauthenticated visitor is sent to the provider from wherever they landed
    // rather than only from a page that happens to ask.
    await this.userStore.fetchUser();
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
/* flex-shrink: 0, not min-width: 0 -- the identity is the one thing that never
   gives. Allowed to shrink, it collapses under its own text in the narrower
   flex fallback and the wordmark runs under the first link. */
.nav-brand-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
/* Bootstrap gives .navbar-brand a 1rem right margin, which would add to the
   gap above and leave the version floating away from the name it labels. Two
   classes to outrank it -- see the note on .navbar.navbar-expand-md below. */
.nav-brand-group .navbar-brand {
  margin-right: 0;
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
/* ─── Right-side utility cluster ──────────────────────────────── */
/* Appearance, then profile, then Sign out. The gaps are graded rather than
   even: the appearance toggle and the profile are both settings and sit a
   normal gap apart, while Sign out is an exit and gets a wider one (see
   .nav-identity) so it is never a near-miss for the profile. */
.nav-utilities {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
}
.nav-identity {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-width: 0;
}
/* Everything in the cluster holds its size; the account name is the one thing
   that gives when the navbar runs short of room. */
.theme-menu {
  position: relative;
  flex-shrink: 0;
}
/* On the always-navy navbar any translucent white fill still composites to a
   dark slate tone that is easy to overlook. Use a SOLID near-white fill with the
   navy glyph on top, so the appearance control is unmistakable at rest in
   every theme (~13:1 against the navbar, glyph ~12:1 against the fill). */
.theme-toggle {
  background: #eef2f7;
  border: 1px solid #eef2f7;
  color: var(--primary);
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
  background: #ffffff;
  border-color: #ffffff;
}
.theme-toggle .material-icons { font-size: 1.15rem; }
/* The moon glyph (Dark appearance active) reads too close to the badge's own
   near-white fill when it inherits --primary, which is barely distinguishable
   from #eef2f7 at this size. Give it its own solid, edition-independent tone so
   it's unmistakably differentiated from the fill it sits on, in every edition.
   The badge fill/border above are untouched. */
.theme-toggle-icon-moon {
  color: #1e293b;
}

/* The dropdown of appearance modes. Anchored to the trigger on desktop; on the
   collapsed mobile nav it sits inline within the menu column. */
.theme-menu-list {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1050;
  /* Sized for one line (icon + label + check) since the per-mode descriptions
     were removed; 260px was left over from when a row wrapped onto a second
     line and needed the extra width. */
  min-width: 190px;
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
/* Match the icon color to the menu's own label text so it is always exactly
   as legible as the label, in every theme (the deep-navy --primary was too
   dark to read on the panel in light and high-contrast modes). The active row
   is additionally marked with the check on the right, so color isn't the cue. */
.theme-menu-icon {
  font-size: 1.25rem;
  color: var(--text);
  flex-shrink: 0;
}
.theme-menu-label {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
}
.theme-menu-check {
  font-size: 1.1rem;
  color: var(--ok);
  flex-shrink: 0;
  width: 1.1rem;
}
/* ─── Signed-in identity ──────────────────────────────────────── */
/* Avatar and name are one unit, so they are tighter than any gap around them. */
.nav-account {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.nav-user {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  /* 0.78 white on the navy navbar is the same tone the inactive nav links use,
     which clears AA at this size; the name is supplementary to the Sign out
     control beside it, never the only cue. */
  color: rgba(255, 255, 255, 0.86);
  font-size: 0.8rem;
  font-weight: 500;
  max-width: 14rem;
  min-width: 0;
}
.nav-user-icon { font-size: 1.1rem; flex-shrink: 0; }
.nav-user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Read-only is a state the operator needs to notice before spending time in a
   form that will refuse to save, so it is a badge rather than a tooltip. */
.nav-readonly {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
/* Qualified with .navbar to reach specificity 0-2-0. A reset later in the
   bundle -- button, [type="button"], ... { color: inherit } -- matches this
   button through its type attribute, which carries class-level specificity and
   so ties a bare .nav-signout. The reset wins the tie on order, and inherit
   resolves to body's var(--text): near-black in the light and high-contrast
   themes, near-white in dark. Hence white letters in dark mode only, on a
   navbar that is navy in all three. */
.navbar .nav-signout {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
}
.nav-signout:hover,
.nav-signout:focus-visible {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.6);
}
/* The version labels the product name, so it is quieter than the name and
   quieter than the links: a muted chip rather than the accent pill it used to
   be, which competed with the accent in the wordmark right beside it. Still
   >= 5:1 on the navbar -- muted, not decorative. */
.nav-version {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.15rem 0.45rem;
  border-radius: 10px;
  white-space: nowrap;
}

/* Centering the links on the page means the two side columns must be equal,
   which in turn caps the utility cluster at whatever the brand's side gets.
   Below about 1400px the nine links plus both side groups no longer fit under
   that constraint, and equal columns would drive the cluster into the links.
   So the grid applies only where it fits; narrower desktops fall back to the
   auto margins below, which center the links within the space left over --
   not on the page, but never overlapping. */
.navbar .navbar-nav {
  margin-left: auto;
  margin-right: auto;
}

/* Three columns, with the side columns sharing the leftover space equally so
   the link row is centered on the page rather than in the gap between the
   brand and the cluster (which are different widths, so an auto margin lands
   it off center). minmax(0, 1fr) lets a side column shrink below its content
   -- the account name is set to ellipsis -- rather than shoving the links off
   center when a long name comes through. */
@media (min-width: 1400px) {
  /* Both classes, not just .navbar: main.ts imports App.vue before Bootstrap,
     so this stylesheet is emitted first and loses every specificity tie to
     Bootstrap's own .navbar rule, which sets display: flex. (The !important
     scattered through the rest of this file is the same fight.) */
  .navbar.navbar-expand-md {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    column-gap: 1rem;
  }
  /* The collapse wrapper exists for the mobile toggle only. At this width its
     children have to be grid items of the navbar itself, or the links and the
     cluster would be centered as one block within a single column. */
  .navbar #primary-nav {
    display: contents !important;
  }
  /* Right-aligned by justifying content inside a stretched grid item, not by
     justify-self: end. An end-justified item is sized to its content and, when
     that content is wider than the column, overhangs to the left and collides
     with the centered links. Stretched, the item is exactly the column's width
     and the account name -- the only thing here allowed to shrink -- ellipses
     instead. */
  .nav-utilities {
    justify-content: flex-end;
  }
}

/* Users who ask for more contrast get the version at full strength; it is
   deliberately muted, but muted should not mean unreadable. */
@media (prefers-contrast: more) {
  .nav-version {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
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
  /* Stacked under the links in the open menu. Wraps rather than compressing,
     so the Sign out gap survives on a narrow screen -- that separation matters
     most where taps are least precise. */
  .nav-utilities {
    flex-wrap: wrap;
    row-gap: 0.75rem;
    padding: 0.65rem 0.75rem 0.25rem;
  }
}
</style>
