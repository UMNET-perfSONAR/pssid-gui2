// allows us to make a store
import { defineStore } from "pinia";

// defineStore(<unique-identifier-name>)
// return value is func itself - > will use in vue components
export const useTaskStore = defineStore('taskStore', {
    // create a state object -> can have different properties 
    state: () => ({
        // TODO: SET TASKS => HOSTS AND MAKE A GET REQUEST HERE TO SET = TO
        tasks: [
            {id:1, title: "buy some milk", isFav:false},
            {id:2, title: "go to store", isFav:true}
        ],
    })
})