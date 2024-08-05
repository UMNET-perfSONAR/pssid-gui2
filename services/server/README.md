# Backend Initialization
Docker runs `entrypoint.sh` to start the backend service, in which files under
`starters/` are copied to the correct destinations within the container. The folder
worth mentioning is `staters/tests/`, which contains test templates that used to
define the rules for each test.

For instance, `rtt` is a test option on the frontend tests page with three input
fields - `dest`, `length`, and `protocol`. Correspondingly, `starters/tests/rtt.json`
contains entries for the three input fields along with input validation code. The
following is the content of `rtt.json`.
```
{
    "name": "rtt",
    "parameters": [
        {
            "name":"dest",
            "type":"text",
            "default": "",
            "validator": "return input && !/\\s/.test(input);",
            "description": "dest should be nonempty and free of whitespace"
        },
        {
            "name":"length",
            "type":"number",
            "default": 512,
            "validator": "return input > 0;",
            "description": "length should be a positive integer"
        },
        {
            "name":"protocol",
            "type":"singleselect",
            "options": [
                {"name": "TCP"},
                {"name": "UDP"}
            ],
            "default": { "name": "TCP" },
            "validator": "return true;",
            "description": "protocol should be either TCP or UDP"
        }
    ],
    "validator": "console.log('Global validator'); return true;"
}
```
Note that `validator` can be any string representing a piece of validation code, and
it will be converted into actual JavaScript code and will be run against user input.
After initialization, Docker mounts the template files to
`/var/lib/pssid/plugins/tests/` on the hosting machine.
