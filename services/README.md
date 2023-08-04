# Steps to support additional config file fields

### Frontend

1. Add desired field to both the add and edit forms on the GUI (In the template)
  1. For the add form, declare a new variable in the data() section to keep track of user input. Be sure to add v-model: <variable> to the added field to ensure the input is bound to this variable.
  2. For the edit form, v-model to currentItem.key, where key is the name of the key of this variable in MongoDB. 

2. Add support for new field in the submit and edit functions in the .vue file.
  1. Add ```desired_key_name : this.variable``` to json object sent to addObject or editObject (sometimes called updateObject) functions


### Backend

3. Add support to post and update functions
  1. Similar to the frontend, add ```desired_key_name : req.body.key_name``` to the json objects sent to the collection.insertOne() function in the POST handler and collection.updateOne() in the PUT handler. 

 
