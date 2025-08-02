import { createWebHistory, createRouter } from "vue-router";
import config from "./shared/config"

const routes =  [
  // TODO: Add additional routes 
  {
    path: "/",
    name: "RootRedirect",
    component: {
      created() {
        if (config.ENABLE_SSO) {
          window.location.href = "https://pssid-web-dev.miserver.it.umich.edu:8000/login?returnTo=https://pssid-web-dev.miserver.it.umich.edu:8080/hosts";
        } else {
          window.location.href = "https://pssid-web-dev.miserver.it.umich.edu:8080/hosts";
        }
      },
      render() {
        return null;
      }
    }
  },
  {
    path: "/hosts",
    name: "host_page",
    component: () => import("./views/hosts.vue")
  },
  {
    path: "/host_groups",
    alias: "/host_groups",
    name: "host_group_page",
    component: () => import("./views/groups.vue")
  },
  {
    path: "/archivers",
    alias: "/archiver",
    name: "archiver_page",
    component: () => import("./views/archivers.vue")
  },
  {
    path: "/batches",
    alias: "/batch",
    name: "batch_page",
    component: () => import("./views/batches.vue")
  },
  {
    path: "/tests",
    alias: "/test",
    name: "test_page",
    component: () => import("./views/tests.vue")
  },
  // {
  //   path: "/jobs",
  //   alias: "/job",
  //   name: "job_page",
  //   component: () => import("./views/jobs.vue")
  // },
  {
    path: "/schedules",
    alias: "/schedule",
    name: "schedule_page",
    component: () => import("./views/schedules.vue")
  },
  {
    path: "/ssid_profiles",
    alias: "/ssid_profile",
    name: "ssid_profile_page",
    component: () => import("./views/ssid_profiles.vue")
  },
  {
    path: "/newform",
    alias: "/newform",
    name: "json_page",
    component: () => import("./forms/addForm.vue")
  },

];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
