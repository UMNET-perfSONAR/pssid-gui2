#!/bin/bash

echo "Current PATH: $PATH" >> log 2>&1

echo "Running tests on ${1}: ${2} at $(date)" >> log 2>&1

ansible-playbook \
    --inventory-file output/ansible.ini \
    --limit "${2}" \
    src/ansible/config-to-probes-playbook.yml >> log 2>&1
