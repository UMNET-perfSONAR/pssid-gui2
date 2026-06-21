<template>
  <div id="app">
    <ToastNotification />
    <nav class="navbar navbar-expand-md navbar-dark">
      <a class="navbar-brand" href="#" @click.prevent>
        <span class="material-icons nav-brand-icon">{{ brand.glyph }}</span>
        <span class="nav-brand-text">{{ brand.shortName }} <strong>{{ brand.emphasis }}</strong></span>
      </a>
      <button class="navbar-toggler" type="button" @click="navOpen = !navOpen" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" :class="{ show: navOpen }">
        <ul class="navbar-nav mx-auto">
          <li class="nav-item" v-for="link in navLinks" :key="link.to">
            <router-link :to="link.to" class="nav-link" @click="navOpen = false">{{ link.label }}</router-link>
          </li>
        </ul>
        <span class="nav-version">{{ brand.version }}</span>
      </div>
    </nav>
    <div class="container mt-4">
      <router-view />
    </div>
  </div>
</template>

<script>
import ToastNotification from './components/ToastNotification.vue'
import { activeBrand } from './brand'

export default {
  name: 'app',
  components: { ToastNotification },
  data() {
    return {
      navOpen: false,
      brand: activeBrand,
      navLinks: [
        { to: '/hosts',         label: 'Hosts' },
        { to: '/host_groups',   label: 'Groups' },
        { to: '/schedules',     label: 'Schedules' },
        { to: '/ssid_profiles', label: 'SSID Profiles' },
        { to: '/tests',         label: 'Tests' },
        { to: '/jobs',          label: 'Jobs' },
        { to: '/batches',       label: 'Batches' },
        { to: '/history',       label: 'History' },
        { to: '/settings',      label: 'Settings' },
      ]
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
