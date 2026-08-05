# Documentation

Start with [`../README.md`](../README.md) for a project overview: what pSSID
GUI is, the system architecture, and the configuration file it produces.
Everything else is here or linked from here.

## Deployment

There is exactly one supported installation path — `bootstrap.sh` on a fresh
host, or `install.sh` from a checkout, which the Ansible playbooks and
`bootstrap.sh` also call internally. These three guides all describe that
same script; which one to read depends on how much detail you need:

| Guide | For |
|---|---|
| [Deploying without SSO](deployment-without-sso.md) | The fastest path: no identity provider, network-controlled access |
| [Deploying with SSO](deployment-with-sso.md) | OIDC sign-in, group membership decides read/write |
| [Full deployment reference](deployment.md) | Everything: disk sizing, TLS modes, editions, upgrades, backups, the provisioning pipeline, metadata and host-regex rules, provenance, the audit trail, and troubleshooting |
| [Ansible guide](../ansible/README.md) | The roles and playbooks both scripts above run, remote hosts, and every deploy-time variable |

## University of Michigan

Everything specific to this repository's own production deployment —
real values, not placeholders — lives under [`../umich/`](../umich/README.md):

| Guide | For |
|---|---|
| [`umich/README.md`](../umich/README.md) | Inventory, deploy/upgrade commands, and the QA dataset |
| [`umich/SSO.md`](../umich/SSO.md) | UMich's live Okta configuration, secret handling, and troubleshooting specific to that tenant |
| [`umich/QA/QA.md`](../umich/QA/QA.md) | QA dataset walkthrough and expected output |

## Working on the code

| Guide | For |
|---|---|
| [Adding fields to the config file](../services/README.md) | Extending a form on both the frontend and backend |
| [Backend folders](../services/server/src/README.md) | Server source layout |
| [Service files](../services/server/src/services/README.md) | What each service module owns |
| [Test templates](../services/server/README.md) | The on-disk test-type definitions dynamic forms render from |
| [Frontend directories](../services/client/src/README.md) | Client source layout |
| [Components](../services/client/src/components/README.md) | Shared Vue components |

## Security

[`../SECURITY.md`](../SECURITY.md) covers reporting a vulnerability, what is
in scope, and the security-relevant defaults this project ships closed.
