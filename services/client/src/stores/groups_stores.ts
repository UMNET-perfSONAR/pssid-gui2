import {defineStore} from 'pinia'
import { useHostStore } from './host_store';

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
        const res = await fetch('http://'+ window.location.hostname +':8000/host-groups')
        const data = await res.json()
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
          'http://'+ window.location.hostname +':8000/host-groups/create-hostgroup',
          {
            method: 'POST',
            body: JSON.stringify(host_group),
            mode: 'cors',
            headers: {
              "Content-Type": "application/json"
            }
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
        await fetch(
          'http://'+ window.location.hostname +':8000/host-groups/update-hostgroup',
          {
            method: 'PUT',
            mode:'cors',
            body: JSON.stringify(host_group),
            headers: {
              "Content-Type":"application/json"
            }
          }
        );
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
          'http://'+ window.location.hostname +':8000/host-groups/'+host_group.name,
          {
            method: 'DELETE',
          }
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
          'http://'+ window.location.hostname +':8000/host-groups',
          {
            method: 'DELETE',
          }
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
          'http://'+ window.location.hostname + ':8000/host-groups/config',
          {
            method: 'POST',
            body: JSON.stringify(currentGroup),
            mode: 'cors',
            headers: {
              "Content-Type": "application/json"
            }
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
