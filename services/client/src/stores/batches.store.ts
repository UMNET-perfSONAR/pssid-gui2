// allows us to make a store
import {defineStore} from 'pinia'


// defineStore(<unique-identifier-name>)
// return value is func itself - > will use in vue components
export const useBatchStore = defineStore('batchStore', {
    // create a state object -> can have different properties 
    state: () => ({
        batches: [{}],
        isLoading: false
    }),

    actions: {
        // TODO: Use Axios?? 
        async getBatches() {
            this.isLoading = true;
            const res = await fetch('http://localhost:8000/batches')
            const data = await res.json()
            this.batches = data;
            this.isLoading = false;
            console.log('here');
            console.log(data);
            return data;
        },

        // add batch to an array. take a batch object and add to array
        async addBatch(batch:any) {
            this.isLoading = true;
            
            await fetch(
                "http://localhost:8000/batches/create-batch",
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
                   // using json will include the batch's unique id 
        },

        async editBatch(updated_batch_obj: JSON) {
            await fetch(
                "http://localhost:8000/batches/update-batch",
                {
                    method: "PUT",
                    mode: "cors",
                    body: JSON.stringify(updated_batch_obj),
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            )
        },

        /**
         * Delete batch from database and remove component from front end
         * @param batch - Batch we want to delete 
         */
        async deleteBatch(batch:any) {
            await fetch(
                "http://localhost:8000/batches/"+batch.name,
                {
                    method: 'DELETE',
                }
            );
        },

        async deleteAll() {
            console.log('called function');
            await fetch(
                "http://localhost:8000/batches",
                {
                    method: 'DELETE',
                }
            );
            this.batches = [];
        },

        toggleBatch(_id:any) {
            const batch = this.batches.find(h => (h as any)._id == _id)
            if (batch !== undefined) {
                (batch as any).isFav = !(batch as any).isFav
            }
        }
    }
})

