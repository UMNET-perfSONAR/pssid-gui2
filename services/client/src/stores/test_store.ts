import {defineStore} from 'pinia'
import config from '../shared/config' 

export const useTestStore = defineStore('test', {
  state: () => ({
    tests: [{}],
    isLoading: false,
    isError: false,
    listOfOptions: [],
    selectedTest:[],
    test_options:[],
    curr_data:[]
  }),

  actions: {

    async getTests() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/tests', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json()
        this.tests = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError=true;
      }
    },

    // get name of all available tests
    async getTestNames() {
      this.isLoading = true;
      const res = await fetch('/api/tests/test-files', 
        {...(config.ENABLE_SSO ? { credentials: 'include' } : {})}
      )
      const data = await res.json();
      this.listOfOptions = data;
      this.isLoading = false;
    },

    async getDesiredTest(test_name: string) {
      this.isLoading = true;
      const res = await fetch('/api/tests/read-test/'+test_name,
        {...(config.ENABLE_SSO ? { credentials: 'include' } : {})}
      )
      const data = await res.json();

      // NOTE: this is the reason that global validation is not working
      this.test_options = data.parameters;
      
      this.isLoading = false;
    },

    // edit test through put request
    async editTest(test: any) {
      const response = await fetch(
        '/api/tests/update-test',
        {
          method: 'PUT',
          mode:'cors',
          body: JSON.stringify(test),
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
          headers: {
            "Content-Type":"application/json"
          }
        }
      );
      if (response.ok) {
	alert("Test updated successfully");
      }
      else {
	// const errorData = await response.json();
  const text = await response.text();
  const errorData = text ? JSON.parse(text) : [];
	alert(errorData.message);
      }
    },

    // add test to an array. take a test object and add to array
    async addTest(test:any) {
      this.isLoading = true;
      
      const response = await fetch(
        '/api/tests/create-test',
        {
          method: 'POST',
          body: JSON.stringify(test),
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      if (response.ok) {
	this.tests.push(test);
      }
      else {
	// const errorData = await response.json();
  const text = await response.text();
  const errorData = text ? JSON.parse(text) : [];
	alert(errorData.message);
      }

      this.isLoading=false;
    },

    async deleteTest(test:any) {
      await fetch(
        '/api/tests/'+test.name,
        {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        }
      );
    },

    async deleteAll() {
      await fetch(
        '/api/tests',
        {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        }
      );
      this.tests = [];
    },

    formatPostData(form_data: Array<any>, optional_data: Array<any>) {
      const concatenatedArray = form_data.concat(optional_data);
      return concatenatedArray;
    },
  }
})
