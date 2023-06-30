// allows us to make a store
import {defineStore} from 'pinia'

export const useTestStore = defineStore('test', {
    // create a state object -> can have different properties 
    state: () => ({
        // TODO: SET TASKS => HOSTS AND MAKE A GET REQUEST HERE TO SET = TO
        tests: [{}],
        isLoading: false,
        listOfOptions: [],
        selectedTest:[],
        test_options:[],
    }),

    actions: {
        // TODO: Use Axios?? 
        async getTests() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/tests')
            const data = await res.json()
            this.tests = data;
            this.isLoading = false;
        },

        // get name of all available tests
        async getTestNames() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/tests/test-files')
            const data = await res.json();
            this.listOfOptions = data;
            this.isLoading = false;
        },

        async getDesiredTest(test_name: string, test_to_update:string) {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/tests/read-test/'+test_name)
            const data = await res.json();
            if (test_to_update === 'selected') {
                this.selectedTest = data;
            }
            else {
                this.test_options = data; 
            }
            this.isLoading = false;
        },

        // add test to an array. take a test object and add to array
        async addTest(test:any) {
            this.isLoading = true;
            
            await fetch(
                "http://localhost:8000/tests/create-test",
                {
                    method: 'POST',
                    body: JSON.stringify(test),
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
            console.log('adding_test')
            this.tests.push(test);
            this.isLoading=false;
                   // using json will include the test's unique id 
        },

        /**
         * Delete test from database and remove component from front end
         * @param test - Test we want to delete 
         */
        async deleteTest(test:any) {
            await fetch(
                "http://localhost:8000/tests/"+test.name,
                {
                    method: 'DELETE',
                }
            );
            this.tests = this.tests.filter(h => {
                return (h as any)._id!== test._id
            })
        },

        async deleteAll() {
            console.log('called function');
            await fetch(
                "http://localhost:8000/tests",
                {
                    method: 'DELETE',
                }
            );
            this.tests = [];
        }
    }
})

