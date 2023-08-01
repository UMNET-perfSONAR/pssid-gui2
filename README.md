# pssid-gui2

Version 2.0 of the pSSID-GUI Web Application

Installation available via Ansible Playbook
* Requires Ansible to be installed locally.

TODO: Insert link to ansible file?

### Install on a virtual machine
Run the following code via terminal in the same directory as the playbook.yml file
```
ansible-playbook   --inventory inventory   --become   --become-method sudo   --become-user root   --ask-become-pass   --ask-pass   playbook.yml
```