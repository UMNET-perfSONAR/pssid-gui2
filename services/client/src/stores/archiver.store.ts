// allows us to make a store
import {defineStore} from 'pinia'

export const useArchiverStore = defineStore('archiver', {
    // create a state object -> can have different properties 
    state: () => ({
        archivers: [{}],
        isLoading: false,
        listOfOptions: [],
        selectedArchiver:[],
        archiver_options:[],
    }),

    actions: {
        async getArchivers() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/archivers')
            const data = await res.json()
            this.archivers = data;
            this.isLoading = false;
        },

        // get name of all available archivers
        async getArchiverNames() {
            this.isLoading = true;
      
            const res = await fetch('http://localhost:8000/archivers/archiver-files')
            const data = await res.json();
            this.listOfOptions = data;

            this.isLoading = false;
        },

        async getDesiredArchiver(archiver_name: string) {
            this.isLoading = true;
            console.log(archiver_name)
            const res = await fetch('http://localhost:8000/archivers/read-archiver/'+archiver_name)
            const data = await res.json();
     
            this.archiver_options = data; 
            
            this.isLoading = false;
        },

        // add archiver to an array. take a archiver object and add to array
        async addArchiver(archiver:any) {
            this.isLoading = true;
            
            await fetch(
                "http://localhost:8000/archivers/create-archiver",
                {
                    method: 'POST',
                    body: JSON.stringify(archiver),
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
            console.log('adding_archiver')
            this.archivers.push(archiver);
            this.isLoading=false;
                   // using json will include the archiver's unique id 
        },

        // edit archiver through put request
        async editArchiver(archiver: any) {
            await fetch(
                "http://localhost:8000/archivers/update-archiver",
                {
                    method: 'PUT',
                    mode:'cors',
                    body: JSON.stringify(archiver),
                    headers: {
                        "Content-Type":"application/json"
                    }
                }
            );
        },

        /**
         * Delete archiver from database and remove component from front end
         * @param archiver - Archiver we want to delete 
         */
        async deleteArchiver(archiver:any) {
            await fetch(
                "http://localhost:8000/archivers/"+archiver.name,
                {
                    method: 'DELETE',
                }
            );
        },

        async deleteAll() {
            console.log('called function');
            await fetch(
                "http://localhost:8000/archivers",
                {
                    method: 'DELETE',
                }
            );
            this.archivers = [];
        }
    }
})

