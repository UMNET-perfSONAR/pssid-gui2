# Steps to support additional config file fields

As pSSID evolves, our configuration file requirements will shift. Below are some general steps to modify the web application to support importatn changes to the config file. There are examples of each step below, which should help with file navigation. 

### When dynamicform.vue is not involved... 
### Frontend

1. Add desired field to both the add and edit forms on the GUI (Located in services/client/src/views/)
  * For the add form, declare a new variable in the data() section to keep track of user input. Be sure to add ``` v-model: variable``` to the added field to ensure the input is bound to this ``` variable ```.

  For instance, in the hosts.vue file, I added a text box to get the desired host name from the user. See add host example code below:
  ```
  <div class="form-group">
  <label for="hosts"> Hosts </label>
  <input
    type="text"
    placeholder="Enter hostname"
    v-model="hostname" 
    required
    id="hosts"
    name="host form"
    class="form-control"
  >  
  </div>
 ```
Note that this is bound to a variable called ```hostname```, which was declared in the ```data()``` option of the script as follows:

```
data() {
  hostname: ''
}
```

* For the edit form, be sure to add ```v-model:currentItem.key``` to the added field, where ```.key``` is the name of the key of this variable in MongoDB. Make sure this key is consistent with ```desired_key_name``` in step 3.
This will be very similar to the add host code above! Note that the ```v-model``` value changes to match the corresonding key value in MongoDB.

```
<div class="form-group">
 <label for="hosts"> Hosts </label>
 <input
  type="text"
  placeholder="Enter hostname"
  v-model="this.currentItem.name" 
  required
  id="hosts"
  name="host form"
  class="form-control"
 >  
</div>
```

--- 

2. Add support for new field in the submit and edit functions in the .vue file.
   
 * To do this, add ```desired_key_name : this.<variable>``` to json object sent to addObject or editObject (sometimes called updateObject) functions. Note that the ```<variable>``` in ```this.<variable>``` refers to whatever was chosen as the ```variable``` name in step 1.

  Adding support for this will look like as follows:
```
async submitHost() {
  await this.hostStore.addHost({
    name: this.hostname
  })
}
async editHost() {
  await this.hostStore.editHost({
    "new_hostname": this.currentItem.name
  })
}
```
Note that we called the hostname property ```name``` in MongoDB in step 3 below, hence why we extract the value in the editHost function as this.currentItem.name.

--- 
### Backend
3. Add support to post and update functions
* Similar to the frontend, add ```desired_key_name : req.body.key_name``` to the json objects sent to the collection.insertOne() function in the POST handler and collection.updateOne() in the PUT handler. This is located in the /services/server/src/controllers files.

Continuting with the above example, this may look like as follows:
```
const postHost = (async (req:Request, res:Response) => {
    try { 
        (await client).connect();
        var collection = (await client).db('gui').collection('hosts');
        let batch_ids = await get_batch_ids(client, req.body);
        await collection.insertOne({
            "name":req.body.name,
            "batches": req.body.batches,
            "batch_ids": batch_ids,
            "data": req.body.data
        });   
        console.log(req.body)
        res.json(req.body);
    }
    catch(error) {
        console.error(error);
        res.status(500).json({message:"Server Error"});
    }
})
```
Note that we wanted to add a ```name``` field to account for the ```hostname``` that users typed in the frontend. We called the key for the hostname ```name``` in the json object passed to the backend, which is why we are able to access that variable via ```req.body.name```

---
### When dynamicform.vue is involved...
Things change a bit when dynamicform.vue is used! This component is used to dynamically render forms, so if we want to add new fields to a form rendered using dynamicform.vue, we need to make sure it's compatible with the input of dynamicform.vue. 

Note that everything on the backend remains consistent with what is mentioned above! We only need to make slight modifications to our frontend process. 

To add a field to the add form component, we must first add details related to the field in the ```data()``` section of the script. For instance, the ssid_profiles view file uses this, which is hardcoded as follows:
```
data() {
return {
 formstuff: [{
   'type': 'text',
   'name': 'Profile Name'
 },{ 
     'type': 'text',
     'name': 'SSID'
 }, {
     'type': 'number',
     'name': 'RSSI'
  }],
 }
},
```

Be sure to add 'type' and 'name' fields. In the future, the 'required' field may be added!

Adding data to the edit form component should be the the same as above if it is not added dynamically. 

--- 

To submit data that users input, we must retrieve the data from the form_data array that is emitted from the dynamicform.vue file. The relative order of the objects of the array will match that of objects passed into "formstuff" in the ```data()``` section. So in ssid_profiles, this looks like the following:

```
receiveEmit(form_data) {
    if(form_data.length > 0) {
        this.ssidStore.addSsidProfile({
         name: form_data[0].value,
         ssid: form_data[1].value,
         min_signal: form_data[2].value
         })
       }
    },
```

The edit form should work the same, for both dynamic and non-dynamic components. Both rely on the information stored in ```this.currentItem```






 
