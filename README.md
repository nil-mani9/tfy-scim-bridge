# tfy-scim-bridge

Customer-run process that **pulls** Google Workspace Directory and **pushes** users/groups to TrueFoundry SCIM. Google never calls this process. No public port.

```
Google Admin SDK  →  this container  →  TrueFoundry /scim/v2/:tenant/:ssoId
```

## What it syncs

- Workspace **users** → SCIM Users (`userName` = email)
- Workspace **groups** → SCIM Groups / TFY teams
- Group **members** → team membership

Team names must match TrueFoundry's pattern (letter, then `A-Za-z0-9_-`, max 50). The bridge uses the group email local part, e.g. `bay-team@acme.com` → `bay-team`.

## Google setup (once)

1. GCP: enable **Admin SDK API**, create a service account (no project IAM role required).
2. Local/dev: download a JSON key. GKE: bind the pod's Kubernetes SA to this GCP SA with Workload Identity (no key). The GCP SA needs `roles/iam.serviceAccountTokenCreator` **on itself**.
3. Admin Console → Security → API controls → Domain-wide delegation. Client ID = the SA **Unique ID**. Scopes (exact URLs):

```
https://www.googleapis.com/auth/admin.directory.user.readonly,https://www.googleapis.com/auth/admin.directory.group.readonly,https://www.googleapis.com/auth/admin.directory.group.member.readonly
```

4. Impersonate a real Workspace **user** admin (the account you use on admin.google.com), not a group address.

## TrueFoundry setup

Enable SCIM on the Google SSO config. Set:

- `SCIM_BASE_URL` — `https://<host>/api/svc/v1/scim/v2/<tenantName>/<ssoId>`
- `SCIM_TOKEN` — JWT of the SCIM service account TrueFoundry created

## Run

```bash
cp .env.example .env
mkdir -p credentials
# copy the SA json to credentials/sa.json
docker compose up --build
```

Start with `DRY_RUN=true` and `GOOGLE_GROUP_EMAILS` set to one group (e.g. `aigateway@truefoundry.com`) so you do not provision the whole directory.

Without `GOOGLE_GROUP_EMAILS`, every user and group in the Workspace is synced.

## Local without Docker

```bash
npm ci
cp .env.example .env
# export vars or use a tool that loads .env
npx tsx src/index.ts
```

Load env yourself (`export $(grep -v '^#' .env | xargs)`). Local runs need `GOOGLE_APPLICATION_CREDENTIALS` pointing at the key file.

## GKE Workload Identity

Do not set `GOOGLE_APPLICATION_CREDENTIALS`. The pod uses ADC from the metadata server.

- Annotate the Kubernetes SA: `iam.gke.io/gcp-service-account=<dwd-sa>@<project>.iam.gserviceaccount.com`
- Bind that K8s SA to the GCP SA (`roles/iam.workloadIdentityUser`)
- Grant the GCP SA `roles/iam.serviceAccountTokenCreator` on itself (needed to `signJwt` for Domain-wide delegation)
- Set `GOOGLE_ADMIN_EMAIL` (Workspace admin to impersonate)
- Optionally set `GOOGLE_SERVICE_ACCOUNT_EMAIL` if metadata cannot resolve the SA email

