import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useTestStore = defineStore('test', {
  state: () => ({
    tests: [{}],
    isLoading: false,
    isError: false,
    listOfOptions: [],
    selectedTest:[],
    test_options:[],
    test_category: '',
    curr_data:[]
  }),

  actions: {

    async getTests() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/tests', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.tests = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load tests', 'error');
      }
    },

    async getTestNames() {
      this.isLoading = true;
      const res = await fetch('/api/tests/test-files',
        {...(config.ENABLE_SSO ? { credentials: 'include' } : {})}
      );
      const data = await res.json();
      this.listOfOptions = data;
      this.isLoading = false;
    },

    async getDesiredTest(test_name: string) {
      this.isLoading = true;
      const res = await fetch('/api/tests/read-test/' + test_name,
        {...(config.ENABLE_SSO ? { credentials: 'include' } : {})}
      );
      const data = await res.json();
      this.test_options = data.parameters;
      this.test_category = data.category || '';
      this.isLoading = false;
    },

    async editTest(test: any) {
      try {
        const response = await fetch(
          '/api/tests/update-test',
          {
            method: 'PUT',
            mode: 'cors',
            body: JSON.stringify(test),
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
            headers: { "Content-Type": "application/json" }
          }
        );
        if (response.ok) {
          useToastStore().show(`Test "${test.new_testname}" updated`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update test', 'error');
        }
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to update test', 'error');
      }
    },

    async addTest(test:any) {
      try {
        this.isLoading = true;
        const response = await fetch(
          '/api/tests/create-test',
          {
            method: 'POST',
            body: JSON.stringify(test),
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
            headers: { "Content-Type": "application/json" }
          }
        );

        if (response.ok) {
          this.tests.push(test);
          useToastStore().show(`Test "${test.name}" added`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add test', 'error');
        }

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to add test', 'error');
      }
    },

    async deleteTest(test:any) {
      try {
        const response = await fetch(
          '/api/tests/' + test.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Test "${test.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete test', 'error');
        }
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to delete test', 'error');
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/tests', {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.tests = [];
      }
      catch(error) {
        console.error(error);
      }
    },

    formatPostData(form_data: Array<any>, optional_data: Array<any>) {
      const concatenatedArray = form_data.concat(optional_data);
      return concatenatedArray;
    },
  }
})
