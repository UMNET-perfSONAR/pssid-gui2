Collection Layouts in MongoDB:

Hosts:
```
host: { 
    [{
        name: "rp1",
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
Archivers:
```
archivers: {
    name: "example_rabbitmq_archie",
    archiver: "rabbitmq",
    "data": {
        _url: "amqp://elastic:elastic@pssid-elk.miserver.it.umich.edu",
        routing-key: "pscheduler_raw"  
    }
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
SSID Profiles:
```
ssid_profiles: {[
    {
        name: "MWireless_profile",
        SSID: "MWireless",
        min_signal: -73
    }
]}

```