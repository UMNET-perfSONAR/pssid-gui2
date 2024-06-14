import {defineStore} from 'pinia'

export const useHostStore = defineStore('hostStore', {
  state: () => ({
    hosts: [{}],
    isLoading: false,
    isError: false
  }),

  actions: {

    /**
     * retrieve all host information from database
     */
    async getHosts() {
      try {
        this.isLoading = true;
        const res = await fetch('http://'+ window.location.hostname + ':8000/hosts');
        const data = await res.json();
        this.hosts = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    /**
     * Call on server to add to mongodb. Append host object to host array.
     * @param host - host info from user input
     */
    async addHost(host:any) {
      try {
        this.isLoading = true;
        const response = await fetch(
          'http://'+ window.location.hostname + ':8000/hosts/create-host',
          {
            method: 'POST',
            body: JSON.stringify(host),
            mode: 'cors',
            headers: {
              "Content-Type": "application/json"
            }
          }
        );

	if (response.ok) {
	  this.hosts.push(host);
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

    /**
     * Delete host from database and remove component from front end
     * @param host - Host we want to delete 
     */
    async deleteHost(host:any) {
      try {
        await fetch(
          'http://'+ window.location.hostname + ':8000/hosts/' +host?.name,
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
    
    /**
     * Call on server to update current host object
     * @param updateHostObj - includes all necessary information to update host 
     */
    async editHost(updateHostObj:any) {
      try {
        await fetch(
          'http://'+ window.location.hostname + ':8000/hosts/update-host',
          {
            method: "PUT",
            mode: "cors",
            body: JSON.stringify(updateHostObj),
            headers: {
              "Content-Type": "application/json"
            }
	    
          }
        )
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    /**
     * Call on server to  all hosts 
     */
    async deleteAll() {
      try {
        await fetch(
          'http://'+ window.location.hostname + ':8000/hosts',
          {
            method: 'DELETE',
          }
        );
        this.hosts = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    /**
     * Call on server to create config file and push probes to remote computers
     * @param currentHost - host, if any, that submit to probes button was pushed. provides context
     */
    async createConfig(currentHost: any) {
      if (currentHost.length === 0) {
	alert("Select a host probe to submit to.");
	return;
      }
      try {
        await fetch(
          'http://'+ window.location.hostname + ':8000/hosts/config',
          {
            method: 'POST',
            body: JSON.stringify(currentHost),
            mode: 'cors',
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
        alert("Host submitted successfully!");
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },
  }
})
