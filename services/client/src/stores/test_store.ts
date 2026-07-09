import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'
import { errorMessage } from '../utils/http'

export const useTestStore = defineStore('test', {
  state: () => ({
    tests: [] as any[],
    isLoading: false,
    isError: false,
    listOfOptions: [],
    selectedTest: [],
    test_options: [] as any[],
    test_category: '',
    curr_data: []
  }),

  // Every mutating action resolves to true on success and false on failure,
  // so a view can keep the user's typed input when the server says no.
  actions: {

    async getTests(): Promise<boolean> {
      this.isLoading = true;
      try {
        const res = await fetch('/api/tests', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load tests'), 'error');
          return false;
        }
        this.tests = await res.json();
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load tests', 'error');
        return false;
      }
      finally {
        this.isLoading = false;
      }
    },

    async getTestNames() {
      this.isLoading = true;
      try {
        const res = await fetch('/api/tests/test-files',
          {...(config.ENABLE_SSO ? { credentials: 'include' } : {})}
        );
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load test types'), 'error');
          return;
        }
        this.listOfOptions = await res.json();
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to load test types', 'error');
      }
      finally {
        this.isLoading = false;
      }
    },

    async getDesiredTest(test_name: string) {
      this.isLoading = true;
      try {
        const res = await fetch('/api/tests/read-test/' + encodeURIComponent(test_name),
          {...(config.ENABLE_SSO ? { credentials: 'include' } : {})}
        );
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load the test template'), 'error');
          return;
        }
        const data = await res.json();
        this.test_options = data.parameters;
        this.test_category = data.category || '';
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to load the test template', 'error');
      }
      finally {
        this.isLoading = false;
      }
    },

    async editTest(test: any): Promise<boolean> {
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
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to update test'), 'error');
          return false;
        }
        useToastStore().show(`Test "${test.new_testname}" updated`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to update test', 'error');
        return false;
      }
    },

    async addTest(test: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/tests/create-test',
          {
            method: 'POST',
            body: JSON.stringify(test),
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
            headers: { "Content-Type": "application/json" }
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to add test'), 'error');
          return false;
        }
        this.tests.push(test);
        useToastStore().show(`Test "${test.name}" added`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to add test', 'error');
        return false;
      }
    },

    async deleteTest(test: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/tests/' + encodeURIComponent(test.name),
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to delete test'), 'error');
          return false;
        }
        useToastStore().show(`Test "${test.name}" deleted`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to delete test', 'error');
        return false;
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
