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
    isError: false,
  }),

  actions: {
    async getArchivers() {
      try {
        this.isLoading = true;
        const res = await fetch('http://' + window.location.hostname + ':8000/archivers')
        const data = await res.json()
        this.archivers = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    // get name of all available archivers
    async getArchiverNames() {
      try {
        this.isLoading = true;
        const res = await fetch('http://'+ window.location.hostname +':8000/archivers/archiver-files')
        const data = await res.json();
        this.listOfOptions = data;
        this.isLoading = false;
      }
      catch(error) {
        console.log(error);
        this.isError = true;
      }
    },

    async getDesiredArchiver(archiver_name: string) {
      try {
        this.isLoading = true;
        console.log(archiver_name)
        const res = await fetch('http://'+ window.location.hostname +':8000/archivers/read-archiver/'+archiver_name)
        const data = await res.json();
        
        this.archiver_options = data; 
        
        this.isLoading = false;
      }
      catch(error) {
        console.log(error);
        this.isError = true;
      }
    },

    // add archiver to an array. take a archiver object and add to array
    async addArchiver(archiver:any) {
      try {
        this.isLoading = true;
        await fetch(
          'http://'+ window.location.hostname +":8000/archivers/create-archiver",
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
      }
      catch(error) {
        console.log(error);
        this.isError = true;
      }
    },

    // edit archiver through put request
    async editArchiver(archiver: any) {
      try {
        await fetch(
          'http://'+ window.location.hostname +':8000/archivers/update-archiver',
          {
            method: 'PUT',
            mode:'cors',
            body: JSON.stringify(archiver),
            headers: {
              "Content-Type":"application/json"
            }
          }
        );
      }
      catch(error) {
        console.log(error);
        this.isError = true;
      }
    },

    /**
     * Delete archiver from database and remove component from front end
     * @param archiver - Archiver we want to delete 
     */
    async deleteArchiver(archiver:any) {
      try {
        await fetch(
          'http://'+ window.location.hostname +':8000/archivers/'+archiver.name,
          {
            method: 'DELETE',
          }
        );
      }
      catch(error) {
        console.log(error);
        this.isError = true;
      }
    },

    async deleteAll() {
      try {
        console.log('called function');
        await fetch(
          'http://'+ window.location.hostname +':8000/archivers',
          {
            method: 'DELETE',
          }
        );
        this.archivers = [];
      }
      catch(error) {
        console.log(error);
        this.isError = true;
      }
    }
  }
})
