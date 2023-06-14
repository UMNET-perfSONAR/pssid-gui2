// allows us to make a store
import { defineStore } from "pinia";

// defineStore(<unique-identifier-name>)
// return value is func itself - > will use in vue components
export const useHostStore = defineStore('hostStore', {
    // create a state object -> can have different properties 
    state: () => ({
        // TODO: SET TASKS => HOSTS AND MAKE A GET REQUEST HERE TO SET = TO
        hosts: [
            {id:1, title: "host 1", isFav:false},
            {id:2, title: "host 2", isFav:true}
        ],
    }),

    // use to extract any relevant information/ can manipulate slightly
    getters: {
        favs(): any {
            // filter method is non destructive
            return this.hosts.filter(h => h.isFav)
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
        // add host to an array. take a host object and add to array
        addHost(host:any) {
            // TODO - ASYNC ACTION TO PUSH TO DB 
            this.hosts.push(host); 
        },

        deleteHost(id:any) {
            this.hosts = this.hosts.filter(h => {
                return h.id !== id
            })
        },

        toggleHost(id:any) {
            const host = this.hosts.find(h => h.id === id)
            if (host !== undefined) {
                host.isFav = !host.isFav
            }
        }
    }
})


// watch async actions video #8 :p 
// make a GET request to localhost 8000 hosts collection :) 
const getHost = async() => {
    const response = await fetch(
        "http://localhost:8000/hosts",
        {
            method: "GET",
        }
    );
    const json = await response.json();
    console.log(json)
    return json
}