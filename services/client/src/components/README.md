# About each file 

### dynamic_add_data.vue
Contains component to dynamically add optional data. Used in hosts, host groups, tests, and archivers. 
<img width="623" alt="Screenshot 2023-08-03 at 9 34 48 AM" src="https://github.com/UMNET-perfSONAR/pssid-gui2/assets/74212084/994097ae-a3d7-4e22-ae5e-056e3687dce0">

### dynamic_form.vue
Component that dynamically generates forms based on "type" selection for tests and archivers. 
* Iterates though a list of objects specifying name and type of form data, then conditionally adds and renders the corresponding form type.
* Created this file to make compatible with dynamic rendering of json files into form. Most obvious solution.
  
In the future, this file could possibly be implemented with formkit to simplify code. Look into formkit schemas.

<img width="700" alt="Screenshot 2023-08-03 at 9 48 06 AM" src="https://github.com/UMNET-perfSONAR/pssid-gui2/assets/74212084/123cb042-0f85-49e6-9aab-28831fb2ec24">

### edit_dynamic_form.vue

Component that dynamically generates forms based on type of selected object. Used in tests and archivers.

### list_items.vue

Component that lists arbitrary list of objects by name. Includes regex search bar. Used across all tabs. See image below.

<img width="800" alt="Screenshot 2023-08-03 at 1 42 35 PM" src="https://github.com/UMNET-perfSONAR/pssid-gui2/assets/74212084/2ad27f51-126e-4106-af32-007a25678a4c">


### cleaned_dynamic.vue

Same as dynamic_form.vue but much cleaner template. Not currently used but would recommend either this or something similar in the future to improve readability. 








