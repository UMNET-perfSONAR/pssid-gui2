# Ideas for Future Improvement

### General
Revamp the look and feel of this! Add some UMich branding? Talk to a UX expert? 

I think a facelift on this would make things look more professional and feel more intuitive for users.

### src/views/hosts.vue
Right now, the VueMultiselect dropdown doesn't load automatically on the hosts page. It works after first rendering another page. 

### dynamicform.vue
This could be cleaned up significantly! Could possibly swap this out for FormKit using the Schema option - I believe there is a dynamic way to use this. 

Even if FormKit isn't used, I could outsource each minor component out to a separate file (see src/forms) for a general idea on how to start this. Can then use these as components in cleaned_dynamicform.vue - Will significantly improve readability.

### Tests and Archivers

* Would be a good idea to store contents of each ../server/build/test_options and ../server/build/archiver_options in MongoDB for safekeeping. Can have a collection for both test_options and archiver_options, where each "page" in the collection would correspond to what is currently in the .json files.
* Add a "required" option to .json files (or DB if you go that route) - should be able to bind :required=item.required (or something like that) where the field is located in dynamicform.vue... Or in components if outsourcing the divs!

### src/views/. 

.vue files can be simplified significantly! If we take advantage of the src/components/dynamicform.vue and src/components/edit_dynamicform.vue files and retrofit these files accordingly, this will become MUCH cleaner. 
* Can actually create a MongoDB collection with a "page" for each .vue file! Pull formstuff/layout stuff from there and index by name!

