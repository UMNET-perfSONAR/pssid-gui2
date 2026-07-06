// allows us to make a store
import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

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
        const res = await fetch('/api/archivers', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.archivers = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load archivers', 'error');
      }
    },

    // get name of all available archivers
    async getArchiverNames() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/archivers/archiver-files', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.listOfOptions = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    async getDesiredArchiver(archiver_name: string) {
      try {
        this.isLoading = true;
        const res = await fetch('/api/archivers/read-archiver/' + archiver_name, {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();

        this.archiver_options = data;

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    // add archiver to an array. take a archiver object and add to array
    async addArchiver(archiver:any) {
      try {
        this.isLoading = true;
        const response = await fetch(
          '/api/archivers/create-archiver',
          {
            method: 'POST',
            body: JSON.stringify(archiver),
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
            headers: {
              "Content-Type": "application/json"
            }
          }
        );

        if (response.ok) {
          this.archivers.push(archiver);
          useToastStore().show('Archiver added successfully', 'success');
        }
        else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add archiver', 'error');
        }

        this.isLoading=false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add archiver', 'error');
      }
    },

    // edit archiver through put request
    async editArchiver(archiver: any) {
      try {
        const response = await fetch(
          '/api/archivers/update-archiver',
          {
            method: 'PUT',
            mode:'cors',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
            body: JSON.stringify(archiver),
            headers: {
              "Content-Type":"application/json"
            }
          }
        );
        if (response.ok) {
          useToastStore().show("Archiver updated successfully", 'success');
        }
        else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update archiver', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update archiver', 'error');
      }
    },

    /**
     * Delete archiver from database and remove component from front end
     * @param archiver - Archiver we want to delete
     */
    async deleteArchiver(archiver:any) {
      try {
        const response = await fetch(
          '/api/archivers/' + archiver.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Archiver "${archiver?.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete archiver', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete archiver', 'error');
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/archivers', {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.archivers = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    }
  }
})
