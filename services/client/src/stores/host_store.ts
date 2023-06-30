// allows us to make a store
import {defineStore} from 'pinia'


// defineStore(<unique-identifier-name>)
// return value is func itself - > will use in vue components
export const useHostStore = defineStore('hostStore', {
    // create a state object -> can have different properties 
    state: () => ({
        // TODO: SET TASKS => HOSTS AND MAKE A GET REQUEST HERE TO SET = TO
        hosts: [{}],
        isLoading: false
    }),

    // use to extract any relevant information/ can manipulate slightly
    getters: {

    },

    actions: {
        // TODO: Use Axios?? 
        async getHosts() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/hosts')
            const data = await res.json()
            this.hosts = data;
            this.isLoading = false;
            console.log('here');
            console.log(data);
            return data;
        },

        // add host to an array. take a host object and add to array
        async addHost(host:any) {
            this.isLoading = true;
            
            await fetch(
                "http://localhost:8000/hosts/create-host",
                {
                    method: 'POST',
                    body: JSON.stringify(host),
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );

            this.hosts.push(host);
            console.log('added_host');
            this.isLoading=false;
                   // using json will include the host's unique id 
        },

        /**
         * Delete host from database and remove component from front end
         * @param host - Host we want to delete 
         */
        async deleteHost(host:any) {
            await fetch(
                "http://localhost:8000/hosts/"+host.name,
                {
                    method: 'DELETE',
                }
            );
            this.hosts = this.hosts.filter(h => {
                return (h as any)._id!== host._id
            })
        },

        async deleteAll() {
            console.log('called function');
            await fetch(
                "http://localhost:8000/hosts",
                {
                    method: 'DELETE',
                }
            );
            this.hosts = [];
        },

        toggleHost(_id:any) {
            const host = this.hosts.find(h => (h as any)._id == _id)
            if (host !== undefined) {
                (host as any).isFav = !(host as any).isFav
            }
        }
    }
})

