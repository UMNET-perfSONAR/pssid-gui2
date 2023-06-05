Collection Layouts in MongoDB:

Hosts:
```
host: { 
    [{
        host: "rp1",
        batches: []
        data: {}
    }] 
}
```
Host Groups:
```
host_groups: {
    [{
        name: "chem_building",
        hosts: []
        batches: []
        data: {}
    }]
}
```
Schedules: 
```
schedules: {
    [{
        name: "schedule_every_1_min",
        repeat: "*/1 * * * *"
    }]
}
```