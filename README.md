# pssid-gui2

Version 2.0 of the pSSID-GUI Web Application

Installation available via Ansible Playbook
* Requires Ansible to be installed locally.

To install via Ansible, follow the steps in this [repository](https://github.com/UMNET-perfSONAR/ansible_pssid_gui_2.0)
---
### Relevant Links in this Repository

[Steps to add fields to config file](https://github.com/UMNET-perfSONAR/pssid-gui2/blob/main/services/README.md)


----
### pSSID Web Application 
##### About the Config File

This web app is meant to simplfy the creation and modification of the configuration file that is pushed to Raspberry Pis to monitor WiFi networks via pSSID and perfSONAR. The configuration file is broken up into 8 components: hosts, host groups, archivers, schedules, ssid profiles, tests, jobs, and batches. See the breakdown below: 

<img width="700" alt="image" src="https://github.com/UMNET-perfSONAR/pssid-gui2/assets/74212084/384bb68b-aa29-432a-87b1-30528e921289">

Note that the web application produces a configuration file and an ansible inventory to represent the current state of the database. These files are then pushed to the probes. 

##### Graphical User Interface
The web application has eight separate tabs, one for each component of the configuration file. 

Each tab has the ability to create, read, update, and delete its own data. Each tab has the following:
* List of current objects in MongoDB collection
  * Includes Regex search bar to search through objects
* Add object form
* Edit object form that appears after clicking on the name of an object
  * Can delete objects from here

<img width="700" alt="Screenshot 2023-08-02 at 3 36 19 PM" src="https://github.com/UMNET-perfSONAR/pssid-gui2/assets/74212084/cf7bba5f-74f5-4303-926f-c17a0cd17b81">


