import {defineStore} from 'pinia'
import { useHostStore } from './host_store';
import config from '../shared/config' 

export const useGroupStore = defineStore('groupStore', {
  // create a state object -> can have different properties 
  state: () => ({
    host_groups: [{
      name:'',
      hosts: [''],
      batches: [''],
      data: [{}],
    }],
    filteredData: [{}],
    isLoading: false,
    filteredHostData: [{}],
    hostData: [],
    hostStore: useHostStore(),
    isError: false
  }),
  actions: {
    async getGroups() {
      try {
        this.isLoading = true;
        const res = await fetch(
          '/api/host-groups',
        {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        }
      );
        const data = await res.json();
        this.host_groups = data;
        this.filteredData = data; 
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },
    // add host_groups to an array. take a host_groups object and add to array
    async addGroup(host_group:any) {
      try {
        this.isLoading = true;
        
        const response = await fetch(
          '/api/host-groups/create-hostgroup',
          {
            method: 'POST',
            body: JSON.stringify(host_group),
            mode: 'cors',
            headers: {
              "Content-Type": "application/json"
            },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );

	if (response.ok) {
	  this.host_groups.push(host_group);
	}
	else {
	  const errorData = await response.json();
	  alert(errorData.message);
	}

        this.isLoading=false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    async editGroup(host_group: any) {
      try {
        const response = await fetch(
          '/api/host-groups/update-hostgroup',
          {
            method: 'PUT',
            mode:'cors',
            body: JSON.stringify(host_group),
            headers: {
              "Content-Type":"application/json"
            },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
	if (response.ok) {
	  alert("Group updated successfully!");
	}
	else {
	  const errorData = await response.json();
	  alert(errorData.message);
	}
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },
    /**
     * Delete host_groups from database and remove component from front end
     * @param host_groups - Host we want to delete 
     */
    async deleteGroup(host_group:any) {
      try {
        await fetch(
          '/api/host-groups/'+host_group.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          },
        );
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    async deleteAll() {
      try {
        await fetch(
          '/api/host-groups',
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          },
        );
        this.host_groups = [];
        this.filteredData = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    async createConfig(currentGroup: any) {
      try {
        await fetch(
          '/api/host-groups/config',
          {
            method: 'POST',
            body: JSON.stringify(currentGroup),
            mode: 'cors',
            headers: {
              "Content-Type": "application/json"
            },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        alert("Group submitted successfully!");
      }
      catch(error) {
        console.log(error);
        this.isError=true;
      }
    },
  }
})
