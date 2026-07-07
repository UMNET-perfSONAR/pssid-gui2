<template>
  <div>
    <ConfirmModal
      :visible="showConfirm"
      :message="confirmMessage"
      @confirm="executeDeleteHost"
      @cancel="showConfirm = false"
    />

    <PageHeader
      title="Hosts"
      subtitle="Manage network probe hosts and their batch assignments"
      icon="computer"
      :can-add="true"
      :add-disabled="isDisabled || (showAddHost && !addHostValid)"
      add-label="Add Host"
      @add="onHeaderAdd"
    />

    <!-- buttons -->
    <div class="d-flex flex-wrap mb-3" style="gap: 0.5rem;">
      <button class="btn btn-warning" @click="configureHost" :disabled="isDisabled || showAddHost">
        Configure selected host
      </button>
    </div>
    <div class="list row">
      <!-- List out the items -->
      <div class="col-md-6">
        <h3> Host list </h3>
        <item-list v-if="mounted==true" :itemArray="hostStore.hosts" :display="showAddHost"
          @updateActive="updateActiveHost" style="cursor: pointer;"></item-list>
      </div>
      <!--Add Host Form -->
      <div v-if="showAddHost===true" class="col-md-6">
        <form @submit.prevent="submitHost()">
          <h3> Add Host </h3>
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label for="hosts"> Hosts </label>
            <input
              type="text"
              placeholder="Hostname or IP address"
              v-model="hostname"
              required
              id="hosts"
              name="host form"
              class="form-control"
            >
            <small v-if="hostnameError" class="text-danger">{{ hostnameError }}</small>
          </div>
          <div class="form-group">
            <label> Batches </label>
            <VueMultiselect
              :multiple="true"
              :close-on-select="false"
              :options="batchStore.batches"
              v-model="selectedBatches"
              track-by="name"
              label="name"
            >
            </VueMultiselect>
          </div>
          <p> Metadata </p>
          <dynamic_add_data :addedData="addedOptionalData"></dynamic_add_data>
        </fieldset>
        </form>
      </div>

      <!-- Edit selected host form -->
      <div v-if="showAddHost===false" class="col-md-6">
        <form @submit.prevent="editHost">
          <h3> Edit Host </h3>
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label for="hosts"> Hosts </label>
            <input
              type="text"
              placeholder="Hostname or IP address"
              v-model="this.currentItem.name"
              required
              id="hosts"
              name="host form"
              class="form-control"
            >
            <small v-if="editHostnameError" class="text-danger">{{ editHostnameError }}</small>
          </div>
          <div class="form-group">
            <label> Batches </label>
            <VueMultiselect
              :multiple="true"
              :close-on-select="false"
              :options="batchStore.batches.map(item=> item.name)"
              v-model="currentItem.batches"
            >
            </VueMultiselect>
          </div>
          <dynamic_add_data :addedData="currOptionalData"></dynamic_add_data>
          <div class="d-flex flex-wrap mt-2" style="gap: 0.5rem;">
            <button class="btn btn-success" :disabled="!editHostValid"> Update </button>
            <button class="btn btn-danger" type="button" @click="requestDeleteHost"> Delete </button>
          </div>
        </fieldset>
        </form>
      </div>
    </div>

    <!-- Effective configuration of the selected probe: the slice of
         pssid_config.json (the one file the daemon reads) this host acts on. -->
    <div v-if="showAddHost===false && currentItem && currentItem.name" class="probe-config">
      <h3 class="probe-config-title">Probe configuration</h3>
      <p class="probe-config-sub">
        Everything <strong>{{ currentItem.name }}</strong> will run, from the
        generated <code>pssid_config.json</code> the daemon receives.
      </p>

      <div v-if="hostStore.probeConfigLoading" class="loading-state">
        <div class="spinner"></div>
        <span>Building configuration…</span>
      </div>

      <p v-else-if="hostStore.probeConfigError" class="probe-config-error">
        <span class="material-icons">error</span>
        {{ hostStore.probeConfigError }}
      </p>

      <template v-else-if="hostStore.probeConfig">
        <p class="probe-config-summary">
          Groups: <strong>{{ hostStore.probeConfig.groups.join(', ') || 'none' }}</strong>
          &nbsp;·&nbsp; Batches: <strong>{{ hostStore.probeConfig.batches.map(b => b.name).join(', ') || 'none' }}</strong>
          &nbsp;·&nbsp; Config version {{ hostStore.probeConfig.config_version }}
        </p>
        <pre class="probe-config-pre">{{ JSON.stringify(hostStore.probeConfig, null, 2) }}</pre>
      </template>
    </div>

    <RecentActivity />
  </div>
</template>

<script>
 import { useHostStore } from '/src/stores/host_store';
 import { useGroupStore } from '/src/stores/groups_stores';
 import { useBatchStore } from '../stores/batches.store';
 import { useUserStore } from '/src/stores/user.store';
 import { defineComponent } from 'vue';
 import itemList from '../components/list_items.vue';
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import VueMultiselect from 'vue-multiselect';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';
 import RecentActivity from '../components/RecentActivity.vue';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validHostOrIp } from "../utils/validators.ts"

 export default defineComponent({
   components: { itemList, dynamic_add_data, VueMultiselect, ConfirmModal, PageHeader, RecentActivity },
   data() {
     return {
       hostname: '',
       selectedBatches: [],
       addedOptionalData: [],

       showAddHost: true,

       currentItem: [],
       currentIndex: {},
       old_hostname: '',
       currOptionalData: [],

       showConfirm: false,
       confirmMessage: '',

       mounted: false,

       batchStore: useBatchStore(),
       hostStore: useHostStore(),
       groupStore: useGroupStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },

   async mounted() {
     await this.hostStore.getHosts();
     await this.batchStore.getBatches();
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     this.mounted = true;
   },

   computed: {
     isDisabled() {
       return isFormDisabled();
     },
     hostnameError() {
       return this.hostname ? validHostOrIp(this.hostname).error : '';
     },
     addHostValid() {
       return validHostOrIp(this.hostname).valid;
     },
     editHostnameError() {
       return this.currentItem && this.currentItem.name ? validHostOrIp(this.currentItem.name).error : '';
     },
     editHostValid() {
       return validHostOrIp((this.currentItem && this.currentItem.name) || '').valid;
     }
   },

   methods: {
     updateActiveHost(indexArray) {
       this.currentItem = indexArray[0];
       this.currentIndex = indexArray[1];
       this.showAddHost = false;
       this.old_hostname = this.currentItem.name;
       this.currOptionalData = Object.entries(this.currentItem.data).map(([key, value]) => ({
         key,
         value
       }));
       this.hostStore.getHostConfig(this.currentItem.name);
     },

     // Provision the selected probe, then reload its effective configuration
     // so the panel below shows exactly what was just sent.
     async configureHost() {
       await this.hostStore.createConfig(this.currentItem);
       if (this.currentItem && this.currentItem.name) {
         await this.hostStore.getHostConfig(this.currentItem.name);
       }
     },

     async editHost() {
       const new_host_obj = {
         "old_hostname": this.old_hostname,
         "new_hostname": this.currentItem.name,
         "batches": this.currentItem.batches,
         "data": this.currOptionalData.reduce((result, item) => {
           result[item.key] = item.value;
           return result;
         }, {})
       };
       await this.hostStore.editHost(new_host_obj);
       await this.hostStore.getHosts();
       this.currentItem = this.hostStore.hosts[this.currentIndex];
       this.updateActiveHost([this.currentItem, this.currentIndex]);
     },

     // The header "+ Add Host" button doubles as the submit control: it opens
     // a blank form when an item is shown, and saves the new host once every
     // field is valid.
     onHeaderAdd() {
       if (!this.showAddHost) {
         this.addHostComp();
       } else {
         this.submitHost();
       }
     },

     async submitHost() {
       if (!this.addHostValid) return;   // also guards Enter-key submission
       const spec_object = this.addedOptionalData.reduce((result, item) => {
         result[item.key] = item.value;
         return result;
       }, {});
       await this.hostStore.addHost({
         name: this.hostname,
         batches: (this.selectedBatches.length == 0) ? [] :
           this.selectedBatches.map((item) => item.name),
         data: spec_object
       });
       this.hostname = '';
       this.selectedBatches = [];
       this.addedOptionalData = [];
     },

     addHostComp() {
       this.showAddHost = true;
       this.currentItem = [];
       this.currentIndex = {};
     },

     requestDeleteHost() {
       this.confirmMessage = `Delete host "${this.currentItem.name}"? This cannot be undone.`;
       this.showConfirm = true;
     },

     async executeDeleteHost() {
       this.showConfirm = false;
       const deleteIndex = this.currentIndex;
       this.hostStore.hosts.splice(deleteIndex, 1);
       await this.hostStore.deleteHost(this.currentItem);
       if (this.hostStore.hosts.length <= deleteIndex) {
         this.currOptionalData = [];
         this.addHostComp();
       } else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.hostStore.hosts[deleteIndex];
         this.updateActiveHost([this.currentItem, this.currentIndex]);
       }
     }
   }
 })
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>

<style scoped>
.probe-config {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.1rem 1.25rem;
  margin-top: 1.25rem;
}
.probe-config-title {
  font-size: 0.72rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted) !important;
  margin: 0 0 0.35rem !important;
  border: none !important;
  padding: 0 !important;
}
.probe-config-sub {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 0 0 0.75rem;
}
.probe-config-sub code {
  background: rgba(var(--primary-rgb), .08);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--text);
}
.probe-config-summary {
  font-size: 0.82rem;
  color: var(--text);
  margin: 0 0 0.6rem;
}
.probe-config-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.9rem;
  margin: 0;
  white-space: pre-line;
}
.probe-config-error .material-icons {
  font-size: 1.1rem;
  flex-shrink: 0;
}
.probe-config-pre {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  line-height: 1.5;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre;
}
:global(:root[data-theme="dark"]) .probe-config-error {
  background: #341b0b;
  color: #fed7aa;
  border-color: #7c2d12;
}
:global(:root[data-theme="dark"]) .probe-config-sub code {
  background: #0e1626;
}
</style>
