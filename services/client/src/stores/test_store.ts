import {defineStore} from 'pinia'

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
        const res = await fetch('http://'+ window.location.hostname +':8000/tests')
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
      const res = await fetch('http://'+ window.location.hostname +':8000/tests/test-files')
      const data = await res.json();
      this.listOfOptions = data;
      this.isLoading = false;
    },

    async getDesiredTest(test_name: string) {
      this.isLoading = true;
      const res = await fetch('http://'+ window.location.hostname +':8000/tests/read-test/'+test_name)
      const data = await res.json();

      // NOTE: this is the reason that global validation is not working
      this.test_options = data.parameters;
      
      this.isLoading = false;
    },

    // edit test through put request
    async editTest(test: any) {
      const response = await fetch(
        'http://'+ window.location.hostname +':8000/tests/update-test',
        {
          method: 'PUT',
          mode:'cors',
          body: JSON.stringify(test),
          headers: {
            "Content-Type":"application/json"
          }
        }
      );
      if (response.ok) {
	alert("Test updated successfully");
      }
      else {
	const errorData = await response.json();
	alert(errorData.message);
      }
    },

    // add test to an array. take a test object and add to array
    async addTest(test:any) {
      this.isLoading = true;
      
      const response = await fetch(
        'http://'+ window.location.hostname +':8000/tests/create-test',
        {
          method: 'POST',
          body: JSON.stringify(test),
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      if (response.ok) {
	this.tests.push(test);
      }
      else {
	const errorData = await response.json();
	alert(errorData.message);
      }

      this.isLoading=false;
    },

    async deleteTest(test:any) {
      await fetch(
        'http://'+ window.location.hostname +':8000/tests/'+test.name,
        {
          method: 'DELETE',
        }
      );
    },

    async deleteAll() {
      await fetch(
        'http://'+ window.location.hostname +':8000/tests',
        {
          method: 'DELETE',
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
