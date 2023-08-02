### About each directory

#### Assets
Some initial styling. May be outdated.

#### Components
Contains more complex, reusable components in web application. 
* list_items.vue - Regex search bar and rendering for an arbitrary list of objects lives here. Each tab on the web page uses this.
* dynamic_add_data.vue - Arbitrary dynamic data addition. Used in Hosts, Host Groups, Archivers, and Tests.
* dynamicform.vue - Renders changing forms for archivers and tests


#### Stores
Pinia stores for each tab of the web app. Contains business logic for front end state management (makes API calls to backend, more complex data manipulation)

#### Views
Views contains a .vue file for each tab of the web application. 
