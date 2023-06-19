// allows us to make a store
import {defineStore} from 'pinia'
import http from "../http-common";


// defineStore(<unique-identifier-name>)
// return value is func itself - > will use in vue components
export const useHostStore = defineStore('hostStore', {
    // create a state object -> can have different properties 
    state: () => ({
        // TODO: SET TASKS => HOSTS AND MAKE A GET REQUEST HERE TO SET = TO
        hosts: [],
        isLoading: false
    }),

    // use to extract any relevant information/ can manipulate slightly
    getters: {
        favs(): any {
            // filter method is non destructive
            return this.hosts.filter(h => h['isFav'])
        },

        favCount(): any{
            return this.hosts.reduce((prev:any, cur:any) => {
                return cur.isFav ? prev + 1 : prev
            }, 0)
        },

        // arrow function. can't use "this" keyword. 
        totalCount: (state) => {
            return state.hosts.length
        }
    },

    actions: {
        // TODO: Use Axios?? 
        async getHosts() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/hosts')
            const data = await res.json()
            this.hosts = data;
            this.isLoading = false;
        },

        // add host to an array. take a host object and add to array
        async addHost(host:any) {
            this.isLoading = true;
            
            const response = await fetch(
                "http://localhost:8000/hosts/create-host",
                {
                    method: 'POST',
                    body: JSON.stringify(host),
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );

            console.log('hi');
            console.log(response.ok);
            if (!response.ok) {
                console.log('an error occurred');
            }
            this.isLoading=false;
       
            console.log('here');
            // using json will include the host's unique id 
            this.hosts.push(host);
         
        },

        /**
         * Delete host from database and remove component from front end
         * @param host - Host we want to delete 
         */
        async deleteHost(host:any) {
            const response = await fetch(
                "http://localhost:8000/hosts/"+host.name,
                {
                    method: 'DELETE',
                }
            );
            this.hosts = this.hosts.filter(h => {
                return (h as any)._id!== host._id
            })
        },

        toggleHost(_id:any) {
            const host = this.hosts.find(h => (h as any)._id == _id)
            if (host !== undefined) {
                (host as any).isFav = !(host as any).isFav
            }
        }
    }
})

