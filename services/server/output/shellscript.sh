#!/bin/sh
date >> log 
ansible-playbook --become-user sastec --inventory-file ../src/ansible/hosts.ini ../src/ansible/config-to-probes-playbook.yaml