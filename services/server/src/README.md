# Backend Notes

To see final configuration file format, see [LINK](https://github.com/UMNET-perfSONAR/pSSID2/blob/main/pSSID_config.json)

Note that each component of the config file has its own:
* Collection in MongoDB
* Router
* Controller

This helps to separate our connections to the MongoDB database. 

Note that in general, heavier computations live in the backend. This is meant to improve the overall performance of the web application.

### Routers 
Based on the URL in the HTTP request from the frontend, the router will "route", or call the appropriate controller function. 
For instance, when a host is updated, an HTTP request i made to http://localhost:8000/hosts/update-host. The router then connects to the updateHost() function in the corresponding controller file. 

### Controllers
Function on the receiving end of an HTTP request. 
Talks to MongoDB to manipulate data. 
Sends a response back to the frontend to indicate that no errors were found.

