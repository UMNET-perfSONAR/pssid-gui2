// allows us to make a store
import {defineStore} from 'pinia'


// defineStore(<unique-identifier-name>)
// return value is func itself - > will use in vue components
export const useBatchStore = defineStore('batchStore', {
    // create a state object -> can have different properties 
    state: () => ({
        batches: [{}],
        isLoading: false,
        isError: false
    }),

    actions: {
        async getBatches() {
            try {
                this.isLoading = true;
                const res = await fetch('http://'+ window.location.hostname +':8000/batches')
                const data = await res.json()
                this.batches = data;
                this.isLoading = false;
                return data;
            }
            catch(error) {
                console.error(error);
                this.isError = true;
            }
        },

        // add batch to an array. take a batch object and add to array
        async addBatch(batch:any) {
            try {
                this.isLoading = true;
                await fetch(
                    'http://'+ window.location.hostname +':8000/batches/create-batch',
                    {
                        method: 'POST',
                        body: JSON.stringify(batch),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
                this.batches.push(batch);
                console.log('added_batch');
                this.isLoading=false;
            }
            catch(error) {
                console.error(error);
                this.isError = true;
            }
        },

        async editBatch(updated_batch_obj: JSON) {
            try {
                await fetch(
                    'http://'+ window.location.hostname +':8000/batches/update-batch',
                    {
                        method: "PUT",
                        mode: "cors",
                        body: JSON.stringify(updated_batch_obj),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                )
            }
            catch(error) {
                console.error(error);
                this.isError = true;
            }
        },

        /**
         * Delete batch from database and remove component from front end
         * @param batch - Batch we want to delete 
         */
        async deleteBatch(batch:any) {
            try {
                await fetch(
                    'http://'+ window.location.hostname +':8000/batches/'+batch.name,
                    {
                        method: 'DELETE',
                        mode: 'cors'
                    }
                );
            }
            catch(error) {
                console.error(error);
                this.isError = true;
            }
        },

        async deleteAll() {
            try {
                await fetch(
                    'http://'+ window.location.hostname +':8000/batches',
                    {
                        method: 'DELETE',
                    }
                );
                this.batches = [];
            }
            catch(error) {
                console.error(error);
                this.isError = true;
            }
        },
    }
})

