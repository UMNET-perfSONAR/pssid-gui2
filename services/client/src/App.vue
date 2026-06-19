<template>
  <div id="app">
    <h2 class="app-title">pSSID GUI 2.0</h2>
    <nav class="navbar navbar-expand-md navbar-dark">
      <button class="navbar-toggler" type="button" @click="navOpen = !navOpen" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse justify-content-center" :class="{ show: navOpen }">
        <ul class="navbar-nav">
          <li class="nav-item" v-for="link in navLinks" :key="link.to">
            <router-link :to="link.to" class="nav-link" @click="navOpen = false">{{ link.label }}</router-link>
          </li>
        </ul>
      </div>
    </nav>
    <div class="container mt-3">
      <router-view />
    </div>
  </div>
</template>

<script>
export default {
  name: 'app',
  data() {
    return {
      navOpen: false,
      navLinks: [
        { to: '/hosts',         label: 'Hosts' },
        { to: '/host_groups',   label: 'Groups' },
        { to: '/schedules',     label: 'Schedules' },
        { to: '/ssid_profiles', label: 'SSID Profiles' },
        { to: '/tests',         label: 'Tests' },
        { to: '/jobs',          label: 'Jobs' },
        { to: '/batches',       label: 'Batches' },
      ]
    }
  }
}
</script>

<style>
.app-title {
  text-align: center;
  margin: 0.75em 0;
}

.navbar {
  background-color: #706b6b;
}

.navbar .nav-link {
  font-size: 17px;
  padding: 10px 16px;
  color: #e7e7e7 !important;
}

.navbar .nav-link:hover {
  background-color: rgba(255, 255, 255, 0.12);
  color: #fff !important;
}

.navbar .nav-link.router-link-exact-active {
  text-decoration: underline;
  font-weight: 600;
  color: #fff !important;
}
</style>
