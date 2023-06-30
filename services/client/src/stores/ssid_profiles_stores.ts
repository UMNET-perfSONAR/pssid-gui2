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
            const res = await fetch('http://localhost:8000/ssid-profiles')
            const data = await res.json()
            this.ssid_profiles = data;
            this.isLoading = false;
        },

        // add ssid_profile to an array. take a ssid_profile object and add to array
        async addSsidProfile(ssid_profile:any) {
            this.isLoading = true;
            
            await fetch(
                "http://localhost:8000/ssid-profiles/create-ssidProfile",
                {
                    method: 'POST',
                    body: JSON.stringify(ssid_profile),
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );

            this.ssid_profiles.push(ssid_profile);
            this.isLoading=false;
                   // using json will include the ssid_profile's unique id 
        },

        /**
         * Delete ssid_profile from database and remove component from front end
         * @param ssid_profile - SsidProfile we want to delete 
         */
        async deleteSsidProfile(ssid_profile:any) {
            await fetch(
                "http://localhost:8000/ssid-profiles/"+ssid_profile.name,
                {
                    method: 'DELETE',
                }
            );
            this.ssid_profiles = this.ssid_profiles.filter(h => {
                return (h as any)._id!== ssid_profile._id
            })
        },

        async deleteAll() {
            console.log('called function');
            await fetch(
                "http://localhost:8000/ssid-profiles",
                {
                    method: 'DELETE',
                }
            );
            this.ssid_profiles = [];
        }
    }
})

