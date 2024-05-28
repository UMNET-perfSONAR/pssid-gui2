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
      
      this.test_options = data; 
      
      this.isLoading = false;
    },

    // edit test through put request
    async editTest(test: any) {
      console.log(test);
      await fetch(
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
    },

    // add test to an array. take a test object and add to array
    async addTest(test:any) {
      this.isLoading = true;
      
      await fetch(
        'http://'+ window.location.hostname +':8000/tests/create-test',
        {
          method: 'POST',
          body: JSON.stringify(test),
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      this.tests.push(test);
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
      const spec_object = form_data.reduce((result, item)=> {
        if (item.name==="Optional Data") {
          return result;
        }
        result[item.name] = item.value
        return result
      }, {});
      const data_object = optional_data.reduce((result, item)=> {
        result[item.key] = item.value
        return result
      }, {});
      const obj = Object.assign(spec_object, data_object)
      return obj;
    },
  }
})
