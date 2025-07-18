// allows us to make a store
import {defineStore} from 'pinia'

export const useSsidStore = defineStore('ssidStore', {
  // create a state object -> can have different properties 
  state: () => ({
    // TODO: SET TASKS => HOSTS AND MAKE A GET REQUEST HERE TO SET = TO
    ssid_profiles: [{}],
    isLoading: false
  }),

  actions: {
    // TODO: Use Axios?? 
    async getSsidProfiles() {
      this.isLoading = true;
      const res = await fetch(
        'https://'+ window.location.hostname +':8000/ssid-profiles', {
          credentials: 'include'
        }
      );
      const data = await res.json()
      this.ssid_profiles = data;
      this.isLoading = false;
    },

    // add ssid_profile to an array. take a ssid_profile object and add to array
    async addSsidProfile(ssid_profile:any) {
      this.isLoading = true;
      
      const response = await fetch(
        'https://'+ window.location.hostname +':8000/ssid-profiles/create-ssidProfile',
        {
          method: 'POST',
          body: JSON.stringify(ssid_profile),
          headers: {
            "Content-Type": "application/json"
          },
          credentials: 'include'
        }
      );

      if (response.ok) {
	this.ssid_profiles.push(ssid_profile);
      }
      else {
	const errorData = await response.json();
	alert(errorData.message);
      }

      this.isLoading=false;
    },

    /**
     * Delete ssid_profile from database and remove component from front end
     * @param ssid_profile - SsidProfile we want to delete 
     */
    async deleteSsidProfile(ssid_profile:any) {
      await fetch(
        'https://'+ window.location.hostname +':8000/ssid-profiles/'+ssid_profile.name,
        {
          method: 'DELETE',
          credentials: 'include'
        },
      );
    },

    async editSsidProfile(ssid_profile:any) {
      const response = await fetch(
        'https://'+ window.location.hostname +':8000/ssid-profiles/update-ssidProfile',
        {
          method: "PUT",
          mode: "cors",
          body: JSON.stringify(ssid_profile),
          headers: {
            "Content-Type":"application/json"
          },
          credentials: 'include'
        }
      );
      if (response.ok) {
	alert("SsidProfile updated successfully");
      }
      else {
	const errorData = await response.json();
	alert(errorData.message);
      }
    },

    async deleteAll() {
      await fetch(
        'https://'+ window.location.hostname +':8000/ssid-profiles',
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );
      this.ssid_profiles = [];
    }
  }
})
