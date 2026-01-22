# pssid-gui2

Version 2.0 of the pSSID-GUI Web Application

## Installation
### Ansible
Follow the steps in this
[repository](https://github.com/UMNET-perfSONAR/ansible-playbook-pssid-GUI-deploy).

### Installing Docker
Following this [guide](https://docs.docker.com/engine/install/ubuntu/), run the following:
1. cd ~
2. ```for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done```
3. 
```
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
```
4. ```sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin```
5. ```sudo systemctl enable --now docker```
6. sudo usermod -aG docker ${USER} && newgrp docker
7. Verify Docker was installed successfully by running: ```sudo docker run hello-world```

### Source Code
Clone this repository in the same directory. You may need `sudo` access to run docker compose.

There are two ways to run:  
With Single-Sign On (MAKE SURE TO READ [Configuring Single-Sign On and user permissions](#configuring-single-sign-on-and-user-permissions))
```
docker-compose --profile sso -f docker-compose.yml up -d
```
This will run a Redis container in addition to the rest of the application.
* Make sure that ENABLE_SSO is set to true *

Without Single-Sign ON
```
docker-compose -f docker-compose.yml up -d
```
This will run the application without a Redis container.
* Make sure that ENABLE_SSO is set to false *  

### Configuring Single-Sign On and user permissions
In ~/pssid-gui2/shared, there are two files to configure authentication settings.

#### config.ts
- ENABLE_SSO: `true` to require users to login via an Identity Provider, `false` to proceed with application without logging in
- OPEN_WRITE: if ENABLE_SSO is `false`, then setting OPEN_WRITE to `true` will allow any users to have write access, `false` will only give users read access

#### auth-groups.config.json
- the `permissions` field contains list of groups that have certain permissions to the application (read or write). Add more or delete groups inside `permissions` to configure who has what permissions

---

## Important README Links in this Repository

[Steps to add fields to config file](https://github.com/UMNET-perfSONAR/pssid-gui2/blob/main/services/README.md)

[Ideas for future improvement](https://github.com/UMNET-perfSONAR/pssid-gui2/tree/main/services/client)

### Backend
[About Test Template Files](services/server/README.md)

[About the Backend Folders](https://github.com/UMNET-perfSONAR/pssid-gui2/tree/main/services/server/src/README.md)

[About Each Service File - In Server](https://github.com/UMNET-perfSONAR/pssid-gui2/tree/main/services/server/src/services/README.md)

### Frontend
[About each Frontend Directory](https://github.com/UMNET-perfSONAR/pssid-gui2/blob/main/services/client/src/README.md)

[About each Client Component](https://github.com/UMNET-perfSONAR/pssid-gui2/blob/main/services/client/src/components/README.md)

----
## pSSID GUI Web Application
### System Overview
The core application consists of three Docker containers, client, server, and MongoDB.
Users directly interact with the client container, which will in turn communicate with
the backend server and database containers. Test templates are files on disk that
define the rules for each test, i.e., what configuration fields should be provided
for each test type. Dynamics forms are then geneated on the frontend based on the
rules defined in the templates.

<p align="center">
<img width="80%" alt="config-file-anatomy" src="assets/gui-controller.png">
</p>

The web application outputs two files, `hosts.ini` and `pssid_conf.json`. The latter
is the pSSID daemon config file described below,
which essentially contains the batches to be scheduled. The
former, `hosts.ini`, is an Ansible inventory containing the list of hosts and groups
defined on the GUI. They provide information about what to do (`pssid_conf.json`) on
which probes (`hosts.ini`). The provisioning scripts will use Ansible to copy the
daemon config file onto the probes defined in `hosts.ini`,
and pSSID daemon on each probe will run accordingly.

### Output pSSID Daemon Config File
The output configuration file is broken up into 7 components: hosts, host groups,
schedules, SSID profiles, tests, jobs, and batches, each corresponding to a page
on the GUI dashboard. See the breakdown below:

<p align="center">
<img width="80%" alt="config-file-anatomy" src="assets/config-file-anatomy.png">
</p>

At a high level, we use template files **on disk** to define a test. We then use tests
to define a job. Eventually, we use SSID profiles, schedules, and jobs to define a
batch and run batches, not raw tests, on the probes.

### Graphical User Interface
The web application has seven separate tabs, one for each component of the
configuration file.

Each tab has the ability to create, read, update, and delete its own data.
Each tab has the following:
* List of current objects in the MongoDB collection
  * inclduing a regex search bar to search through objects
* Add object form
* Edit/delete object form that appears after clicking on the name of an object

<p align="center">
<img width="80%" alt="gui-screenshot" src="assets/gui-screenshot.png">
</p>

## Troubleshooting
In case the service is not available, a quick way to restart it is to directly run
the `up.sh` script on the VM.

First check if there are any lingering Docker containers still up and running
```
docker ps
```

When the service runs correctly, there should be three containers associated with it.
```
pssid-gui2_server_1
pssid-gui2_mongo_1
pssid-gui2_client_1

```

If the service is down, some of them might be missing from the list and some of them
might still be running. Stop all lingering containers.
```
docker stop <container ID/name>
```

Then free up used resources to prepare for a restart
```
sudo docker system prune -af
```

Finally run the script to start the service
```
sh ~/up.sh
```
