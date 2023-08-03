### About each directory

#### Assets
Some initial styling. May be outdated.

#### Components
Contains more complex, reusable components in web application. 
* list_items.vue - Regex search bar and rendering for an arbitrary list of objects lives here. Each tab on the web page uses this.
* dynamic_add_data.vue - Arbitrary dynamic data addition. Used in Hosts, Host Groups, Archivers, and Tests.
* dynamicform.vue - Renders changing forms for archivers and tests


#### Stores
Pinia stores for each tab of the web app. Contains business logic for front end state management (makes API calls to backend, more complex data manipulation). 

Pinia is a state management library that keeps track of the current state of what's rendered in Vue. This allows a single state to be rendered across multiple web pages. Each configuration file tab has a corresponding state, which allows the app to quickly load the state of another object on a related page. For example, we quickly load the host store on the host groups web page because we need to access the name of all the hosts. This prevents a second HTTP GET request from being made to retrieve the hosts again. 

Read more about Pinia [here](https://pinia.vuejs.org/)

#### Views
Contains a .vue file for each tab of the web application. 
