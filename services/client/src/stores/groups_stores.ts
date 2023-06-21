import {defineStore} from 'pinia'

export const useGroupStore = defineStore('groupStore', {
    // create a state object -> can have different properties 
    state: () => ({
        host_groups: [],
        isLoading: false
    }),

    // use to extract any relevant information/ can manipulate slightly
    getters: {
        favs(): any {
            // filter method is non destructive
            return this.host_groups.filter(h => h['isFav'])
        },
        // arrow function. can't use "this" keyword. 
        totalCount: (state) => {
            return state.host_groups.length
        }
    },

    actions: {
        // TODO: Use Axios?? 
        async getGroups() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/host-groups')
            const data = await res.json()
            this.host_groups = data;
            this.isLoading = false;
        },

        // add host_groups to an array. take a host_groups object and add to array
        async addGroup(host_group:any) {
            this.isLoading = true;
            
            await fetch(
                "http://localhost:8000/host-groups/create-hostgroup",
                {
                    method: 'POST',
                    body: JSON.stringify(host_group),
                    mode: 'cors',
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );

            this.host_groups.push(host_group);
            this.isLoading=false;
        },

        /**
         * Delete host_groups from database and remove component from front end
         * @param host_groups - Host we want to delete 
         */
        async deleteGroup(host_group:any) {
            await fetch(
                "http://localhost:8000/host-groups/"+host_group.name,
                {
                    method: 'DELETE',
                }
            );
            this.host_groups = this.host_groups.filter(h => {
                return (h as any)._id!== host_group._id
            })
        },

        async deleteAll() {
            console.log('called function');
            await fetch(
                "http://localhost_groups:8000/host-groups",
                {
                    method: 'DELETE',
                }
            );
            this.host_groups = [];
        },

        toggleHost(_id:any) {
            const host_groups = this.host_groups.find(h => (h as any)._id == _id)
            if (host_groups !== undefined) {
                (host_groups as any).isFav = !(host_groups as any).isFav
            }
        }
    }
})

