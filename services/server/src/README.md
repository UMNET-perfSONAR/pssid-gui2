Collection Layouts in MongoDB:

HOSTS:
```
host: {
    host: "rp1",
    rp1: {
        batches: []
        data: {}
    }
}
```
HOST_GROUPS:
```
host_groups: {
    host_group: "chem_building",
    chem_building: {
        hosts: []
        batches: []
        data: {}
    }
}
```
SCHEDULES: 
```
schedules: {
    schedules: "schedule_every_1_min",
    schedule_every_1_min: {
        repeat: "*/1 * * * *"
    }
}
```