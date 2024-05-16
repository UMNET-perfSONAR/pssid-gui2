#!/bin/bash

echo "Running tests on ${1}: ${2} at $(date)" >> log

ansible-playbook --become-user sastec --inventory-file ../src/ansible/hosts.ini ../src/ansible/config-to-probes-playbook.yaml
