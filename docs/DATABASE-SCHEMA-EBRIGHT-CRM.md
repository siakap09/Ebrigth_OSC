# `ebright_crm` — Database Build Sheet

**For:** the engineer creating the new database
**What this is:** the complete list of tables and columns to create for the CRM
system (including the ticketing system) in a brand-new PostgreSQL database called
**`ebright_crm`**.

## Read this first

- This is a **plain, normal PostgreSQL database.** Every item below is an
  ordinary table. **There are NO foreign tables, NO `postgres_fdw`, NO proxy
  views.** (The old server used FDW to read data from other databases — that is
  exactly what caused the outage, and we are not doing it here.)
- **Only the data the CRM actually uses is included.** HR operational tables
  (medical leave, attendance, leave transactions, manpower schedule, employee
  roster, staff directory) are **deliberately left out** — the CRM never reads
  them. See [What was removed and why](#what-was-removed-and-why).
- **44 tables total**, grouped into 4 sections.
- All tables go into **one schema** named `crm`.
- **This same sheet builds both PRODUCTION and STAGING.** Both environments use
  the **identical database name `ebright_crm` and identical table names**, on
  **two separate PostgreSQL instances** so they never touch each other (that
  separation is the whole point of the rebuild). See
  [Confirmed decisions](#confirmed-decisions).

---

## Step 0 — Create the database, schema, and enum types

```sql
-- 1. The database
CREATE DATABASE ebright_crm;

-- 2. The schema (all tables live here)
\connect ebright_crm
CREATE SCHEMA IF NOT EXISTS crm;

-- 3. Make the app's role default to this schema
ALTER ROLE <app_user> SET search_path = crm, public;

-- 4. The custom "enum" types used by some columns (create before the tables)
CREATE TYPE "CrmUserRole"           AS ENUM ('SUPER_ADMIN','AGENCY_ADMIN','REGIONAL_MANAGER','BRANCH_MANAGER','BRANCH_STAFF');
CREATE TYPE "TrialDay"              AS ENUM ('WED','THU','FRI','SAT','SUN');
CREATE TYPE "MessageChannel"        AS ENUM ('EMAIL','WHATSAPP','SMS');
CREATE TYPE "MessageDirection"      AS ENUM ('IN','OUT');
CREATE TYPE "CustomValueScope"      AS ENUM ('TENANT','BRANCH');
CREATE TYPE "AutomationTriggerType" AS ENUM ('NEW_LEAD','STAGE_CHANGED','TAG_ADDED','TAG_REMOVED','TIME_IN_STAGE','SCHEDULED','FORM_SUBMITTED','INCOMING_MESSAGE','CUSTOM_FIELD_CHANGED','APPOINTMENT_BOOKED','CONTACT_REPLIED','NO_REPLY_AFTER');
CREATE TYPE "AutomationRunStatus"   AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE "IntegrationType"       AS ENUM ('META','TIKTOK','WIX','GOOGLE_FORMS','GOOGLE_CALENDAR','OUTLOOK','WEBSITE_FORM');
CREATE TYPE "IntegrationStatus"     AS ENUM ('CONNECTED','DISCONNECTED','ERROR');
CREATE TYPE "WhatsAppProvider"      AS ENUM ('META_CLOUD','TWILIO');
```

### A couple of conventions used in the tables below

- **`id` column.** Most tables use `id TEXT PRIMARY KEY`. The application
  generates the ID (a UUID string), so the database needs **no default** on it.
  The one exception is the `User` table, whose `id` is an auto-incrementing
  integer (`SERIAL`).
- **Timestamps.** `createdAt` / `created_at` can default to `now()`.
  `updatedAt` / `updated_at` is set by the application on every change; at the
  database level just make it `NOT NULL` (a `DEFAULT now()` is fine).
- **"Null?" column** = is the field allowed to be empty. **No** = required.

---

## Quick reference — all 44 tables

### Section 1 — Login & access (6 tables)
| Table | What it stores |
|---|---|
| `User` | Login accounts (email + password) for signing in. Real table here — its **rows are imported from another database on the same server** (no FDW). See note. |
| `SessionRevocation` | Marks a user's old sessions invalid after a password change. |
| `crm_auth_user` | The CRM's own user identity (linked to login by email). |
| `crm_auth_session` | Active CRM login sessions. |
| `crm_auth_account` | Credential/OAuth records per CRM user. |
| `crm_auth_verification` | Email-verification tokens. |

### Section 2 — Shared (1 table)
| Table | What it stores |
|---|---|
| `core_audit_log` | "Who did what, when" history across the whole system. |

### Section 3 — CRM core (28 tables)
| Table | What it stores |
|---|---|
| `crm_tenant` | The top-level organisation. |
| `crm_branch` | Each branch/location. |
| `crm_user_branch` | Which user has which role at which branch. *(No row here = "awaiting access".)* |
| `crm_pipeline` | A sales pipeline. |
| `crm_stage` | The stages inside a pipeline. |
| `crm_contact` | Leads / contacts (and their children's details). |
| `crm_opportunity` | A deal moving through the pipeline. |
| `crm_stage_history` | Record of every stage change. |
| `crm_lead_source` | Named lead sources. |
| `crm_tag` | Tags. |
| `crm_contact_tag` | Links contacts to tags. |
| `crm_note` | Notes on a contact. |
| `crm_task` | Follow-up tasks. |
| `crm_message` | Emails / WhatsApp / SMS messages. |
| `crm_call` | Logged phone calls. |
| `crm_message_template` | Reusable message templates. |
| `crm_custom_value` | Settings (key/value) per tenant or branch. |
| `crm_automation` | Automation definitions. |
| `crm_automation_run` | Each time an automation ran. |
| `crm_integration` | Connected integrations (Meta, Wix, …). |
| `crm_integration_oauth_token` | OAuth tokens for those integrations. |
| `crm_website_form` | Hosted lead-capture forms. |
| `crm_appointment` | Booked appointments. |
| `crm_notification` | In-app notifications. |
| `crm_email_settings` | Outbound email config per branch. |
| `crm_whatsapp_settings` | WhatsApp config per branch. |
| `crm_api_key` | API keys. |
| `crm_push_subscription` | Web-push (browser notification) subscriptions. |

### Section 4 — Ticketing (9 tables)
| Table | What it stores |
|---|---|
| `tkt_platform` | A ticketable platform/product. |
| `tkt_branch` | Branches in the ticket system. |
| `tkt_user_profile` | A user's ticketing profile + preferences. |
| `tkt_user_platform` | Which platforms a user can handle. |
| `tkt_user_branch` | Which branches a user can handle. |
| `tkt_ticket` | A support ticket. |
| `tkt_ticket_attachment` | Files on a ticket. |
| `tkt_ticket_event` | A ticket's activity timeline. |
| `tkt_counter` | Counters for generating ticket numbers. |

---

## What was removed and why

These HR tables existed in the old `ebright_crm` **only** because the old server
used FDW to mirror them from the HR database (`ebright_hrfs`). The CRM and
ticketing code **never reads them.** They are **not** part of this build:

| Removed table | Why it's not needed |
|---|---|
| `MedicalLeave` | HR-only. The CRM has no feature that reads medical leave. |
| `LeaveTransaction` | HR-only (leave records). |
| `AttendanceLog` | HR-only (clock in/out). |
| `AttendanceLogST` | HR-only (clock in/out, second scanner). |
| `ManpowerSchedule` | HR-only (staff rota). |
| `Employee` | HR-only (coach/employee roster + pay rate). |
| `BranchStaff` | HR-only (staff directory). The CRM identifies its users through `crm_auth_user`, not this table. |

> These continue to live in the HR system's own database. They do not belong in
> the CRM database.

> **Why `User` is kept** (the one exception): signing in is checked against the
> `User` table (email + password). It is a **real, owned table in this
> database** — but its **rows are imported from another database on the same
> server** (a one-time or scheduled data copy, e.g. `pg_dump -t`/restore, a
> `dblink`/`INSERT … SELECT`, or an ETL job). **No FDW** — the table is not a
> live proxy; it physically holds the copied rows. Refresh the copy whenever the
> source user list changes.

---

# Detailed columns

> Type key: `TEXT` = string, `INTEGER` = whole number, `BOOLEAN` = true/false,
> `TIMESTAMP(3)` = date+time, `TIMESTAMPTZ` = date+time with timezone,
> `DATE` = date only, `TIME(6)` = time only, `DECIMAL(a,b)` = number with
> decimals, `JSONB` = JSON data, `TEXT[]` = list of strings. A type in
> "quotes" is one of the enum types from Step 0.

## Section 1 — Login & access

### `User`
Login accounts. Holds everyone who can sign in to this system. **Rows are
imported from another database on the same server (no FDW)** — see the note in
[What was removed and why](#what-was-removed-and-why).

| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | SERIAL | No | auto |
| email | TEXT | No | — *(unique)* |
| passwordHash | TEXT | No | — |
| role | TEXT | No | `'BRANCH_MANAGER'` |
| branchName | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| name | TEXT | Yes | — |
| status | TEXT | No | `'ACTIVE'` |
| lastLoggedInAt | TIMESTAMP(3) | Yes | — |
| dashboardOverrides | JSONB | Yes | — |

- **Primary key:** `id`  •  **Unique:** `email`

### `SessionRevocation`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| email | TEXT | No | — |
| revokedAfter | TIMESTAMP(3) | No | — |

- **Primary key:** `email`

### `crm_auth_user`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| email | TEXT | No | — *(unique)* |
| emailVerified | BOOLEAN | No | `false` |
| name | TEXT | Yes | — |
| image | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `email`

### `crm_auth_session`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| token | TEXT | No | — *(unique)* |
| expiresAt | TIMESTAMP(3) | No | — |
| ipAddress | TEXT | Yes | — |
| userAgent | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `token`
- **Links to:** `userId` → `crm_auth_user(id)`, delete the sessions when the user is deleted (ON DELETE CASCADE)

### `crm_auth_account`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| accountId | TEXT | No | — |
| providerId | TEXT | No | — |
| accessToken | TEXT | Yes | — |
| refreshToken | TEXT | Yes | — |
| idToken | TEXT | Yes | — |
| accessTokenExpiresAt | TIMESTAMP(3) | Yes | — |
| refreshTokenExpiresAt | TIMESTAMP(3) | Yes | — |
| scope | TEXT | Yes | — |
| password | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Links to:** `userId` → `crm_auth_user(id)` (ON DELETE CASCADE)

### `crm_auth_verification`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| identifier | TEXT | No | — |
| value | TEXT | No | — |
| expiresAt | TIMESTAMP(3) | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`

## Section 2 — Shared

### `core_audit_log`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | Yes | — |
| userId | TEXT | Yes | — |
| userEmail | TEXT | Yes | — |
| action | TEXT | No | — |
| entity | TEXT | No | — |
| entityId | TEXT | Yes | — |
| meta | JSONB | Yes | — |
| ipAddress | TEXT | Yes | — |
| userAgent | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Indexes:** (`tenantId`, `entity`, `createdAt`), (`userId`, `createdAt`)

## Section 3 — CRM core

### `crm_tenant`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| name | TEXT | No | — |
| slug | TEXT | No | — *(unique)* |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `slug`

### `crm_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| name | TEXT | No | — |
| code | TEXT | Yes | — *(short code, e.g. "AMP")* |
| region | TEXT | Yes | — *(A / B / C grouping)* |
| address | TEXT | Yes | — |
| phone | TEXT | Yes | — |
| email | TEXT | Yes | — |
| operatingHours | JSONB | Yes | — |
| timezone | TEXT | No | `'Asia/Kuala_Lumpur'` |
| branchManagerId | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `tenantId` → `crm_tenant(id)`

### `crm_user_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| branchId | TEXT | No | — |
| tenantId | TEXT | No | — |
| role | "CrmUserRole" | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`userId`, `branchId`)  •  **Index:** (`tenantId`)
- **Links to:** `userId` → `crm_auth_user(id)` (ON DELETE CASCADE); `branchId` → `crm_branch(id)` (ON DELETE CASCADE)

### `crm_pipeline`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| name | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `branchId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_stage`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| pipelineId | TEXT | No | — |
| name | TEXT | No | — |
| shortCode | TEXT | No | — |
| order | INTEGER | No | — |
| color | TEXT | No | `'blue'` |
| stuckHoursYellow | INTEGER | No | `24` |
| stuckHoursRed | INTEGER | No | `48` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `pipelineId`, `order`)
- **Links to:** `pipelineId` → `crm_pipeline(id)` (ON DELETE CASCADE)

### `crm_contact`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| firstName | TEXT | No | — |
| lastName | TEXT | Yes | — |
| email | TEXT | Yes | — |
| phone | TEXT | Yes | — |
| leadSourceId | TEXT | Yes | — |
| assignedUserId | TEXT | Yes | — |
| preferredBranchId | TEXT | Yes | — |
| preferredTrialDay | "TrialDay" | Yes | — |
| enrolledPackage | TEXT | Yes | — |
| parentFullName | TEXT | Yes | — *(parent's name when the row is a child)* |
| campaignName | TEXT | Yes | — *(marketing campaign, stored as-is)* |
| childName1 | TEXT | Yes | — |
| childAge1 | TEXT | Yes | — |
| childName2 | TEXT | Yes | — |
| childAge2 | TEXT | Yes | — |
| childName3 | TEXT | Yes | — |
| childAge3 | TEXT | Yes | — |
| childName4 | TEXT | Yes | — |
| childAge4 | TEXT | Yes | — |
| externalSourceTable | TEXT | Yes | — *(where the lead came from)* |
| externalSourceId | TEXT | Yes | — *(its id in that source)* |
| deletedAt | TIMESTAMP(3) | Yes | — *(soft delete)* |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Unique:** (`tenantId`, `externalSourceTable`, `externalSourceId`) — stops the same lead being imported twice
- **Indexes:** (`tenantId`, `branchId`), (`tenantId`, `email`), (`tenantId`, `phone`)
- **Links to:** `branchId` → `crm_branch(id)`; `leadSourceId` → `crm_lead_source(id)`; `assignedUserId` → `crm_auth_user(id)`

### `crm_opportunity`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | No | — |
| pipelineId | TEXT | No | — |
| stageId | TEXT | No | — |
| value | DECIMAL(12,2) | No | `0` |
| assignedUserId | TEXT | Yes | — |
| lastStageChangeAt | TIMESTAMP(3) | No | now() |
| deletedAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Indexes:** (`tenantId`, `branchId`, `stageId`), (`tenantId`, `pipelineId`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `pipelineId` → `crm_pipeline(id)`; `stageId` → `crm_stage(id)`; `assignedUserId` → `crm_auth_user(id)`

### `crm_stage_history`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| opportunityId | TEXT | No | — |
| fromStageId | TEXT | Yes | — |
| toStageId | TEXT | No | — |
| changedByUserId | TEXT | Yes | — |
| note | TEXT | Yes | — |
| changedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `opportunityId`)
- **Links to:** `opportunityId` → `crm_opportunity(id)` (ON DELETE CASCADE); `fromStageId` → `crm_stage(id)`; `toStageId` → `crm_stage(id)`; `changedByUserId` → `crm_auth_user(id)`

### `crm_lead_source`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| name | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)

### `crm_tag`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | Yes | — |
| name | TEXT | No | — |
| color | TEXT | No | `'#3b82f6'` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_contact_tag`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| contactId | TEXT | No | — |
| tagId | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`contactId`, `tagId`)
- **Links to:** `contactId` → `crm_contact(id)` (ON DELETE CASCADE); `tagId` → `crm_tag(id)` (ON DELETE CASCADE)

### `crm_note`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| body | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `contactId`)
- **Links to:** `contactId` → `crm_contact(id)` (ON DELETE CASCADE); `userId` → `crm_auth_user(id)`

### `crm_task`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | Yes | — |
| assignedUserId | TEXT | Yes | — |
| title | TEXT | No | — |
| dueAt | TIMESTAMP(3) | Yes | — |
| completedAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Indexes:** (`tenantId`, `branchId`), (`tenantId`, `assignedUserId`, `dueAt`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `assignedUserId` → `crm_auth_user(id)`

### `crm_message`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| channel | "MessageChannel" | No | — |
| direction | "MessageDirection" | No | — |
| body | TEXT | No | — |
| subject | TEXT | Yes | — |
| status | TEXT | No | `'pending'` |
| providerMessageId | TEXT | Yes | — |
| errorMessage | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `branchId`, `contactId`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `userId` → `crm_auth_user(id)`

### `crm_call`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| outcome | TEXT | Yes | — |
| notes | TEXT | Yes | — |
| duration | INTEGER | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `contactId`)
- **Links to:** `contactId` → `crm_contact(id)` (ON DELETE CASCADE); `userId` → `crm_auth_user(id)`

### `crm_message_template`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | Yes | — |
| name | TEXT | No | — |
| channel | "MessageChannel" | No | — |
| subject | TEXT | Yes | — |
| body | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_custom_value`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| key | TEXT | No | — |
| value | TEXT | No | — |
| scope | "CustomValueScope" | No | `'TENANT'` |
| scopeId | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenantId`, `scope`, `scopeId`, `key`)  •  **Index:** (`tenantId`)
- **Links to:** `scopeId` → `crm_branch(id)`

### `crm_automation`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | Yes | — |
| name | TEXT | No | — |
| triggerType | "AutomationTriggerType" | No | — |
| triggerConfig | JSONB | No | `'{}'` |
| graph | JSONB | No | `'{}'` |
| enabled | BOOLEAN | No | `false` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_automation_run`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| automationId | TEXT | No | — |
| contactId | TEXT | Yes | — |
| triggeredByUserId | TEXT | Yes | — |
| status | "AutomationRunStatus" | No | `'PENDING'` |
| startedAt | TIMESTAMP(3) | No | now() |
| completedAt | TIMESTAMP(3) | Yes | — |
| logs | JSONB | No | `'[]'` |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `automationId`)
- **Links to:** `automationId` → `crm_automation(id)` (ON DELETE CASCADE); `contactId` → `crm_contact(id)`; `triggeredByUserId` → `crm_auth_user(id)`

### `crm_integration`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| type | "IntegrationType" | No | — |
| credentials | TEXT | Yes | — |
| status | "IntegrationStatus" | No | `'DISCONNECTED'` |
| lastSyncAt | TIMESTAMP(3) | Yes | — |
| meta | JSONB | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`branchId`, `type`)  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_integration_oauth_token`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| integrationId | TEXT | No | — |
| accessToken | TEXT | No | — |
| refreshToken | TEXT | Yes | — |
| expiresAt | TIMESTAMP(3) | Yes | — |
| scope | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Links to:** `integrationId` → `crm_integration(id)` (ON DELETE CASCADE)

### `crm_website_form`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| name | TEXT | No | — |
| schema | JSONB | No | `'[]'` |
| publicSlug | TEXT | No | — *(unique)* |
| submissionsCount | INTEGER | No | `0` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `publicSlug`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_appointment`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| startAt | TIMESTAMP(3) | No | — |
| endAt | TIMESTAMP(3) | No | — |
| title | TEXT | Yes | — |
| notes | TEXT | Yes | — |
| calendarProvider | TEXT | Yes | — |
| externalId | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `branchId`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `userId` → `crm_auth_user(id)`

### `crm_notification`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| userId | TEXT | No | — |
| type | TEXT | No | — |
| title | TEXT | No | — |
| body | TEXT | No | — |
| link | TEXT | Yes | — |
| readAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `userId`, `readAt`)
- **Links to:** `userId` → `crm_auth_user(id)` (ON DELETE CASCADE)

### `crm_email_settings`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — *(unique — one per branch)* |
| fromEmail | TEXT | No | — |
| fromName | TEXT | No | — |
| resendDomainVerified | BOOLEAN | No | `false` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `branchId`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_whatsapp_settings`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — *(unique — one per branch)* |
| provider | "WhatsAppProvider" | No | — |
| credentials | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `branchId`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_api_key`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| name | TEXT | No | — |
| hashedKey | TEXT | No | — *(unique)* |
| scopes | TEXT[] | No | `'{}'` (empty list) |
| lastUsedAt | TIMESTAMP(3) | Yes | — |
| createdByUserId | TEXT | Yes | — |
| revokedAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `hashedKey`  •  **Index:** (`tenantId`)
- **Links to:** `createdByUserId` → `crm_auth_user(id)`

### `crm_push_subscription`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| tenantId | TEXT | No | — |
| endpoint | TEXT | No | — |
| p256dh | TEXT | No | — |
| auth | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`userId`, `endpoint`)  •  **Index:** (`tenantId`, `userId`)

## Section 4 — Ticketing

### `tkt_platform`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenant_id | TEXT | No | — |
| name | TEXT | No | — |
| slug | TEXT | No | — |
| code | TEXT | No | — |
| accent_color | TEXT | No | `'#6b7280'` |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `slug`), (`tenant_id`, `name`)  •  **Index:** (`tenant_id`)

### `tkt_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenant_id | TEXT | No | — |
| name | TEXT | No | — |
| code | TEXT | No | — |
| branch_number | TEXT | No | — *("01".."26")* |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `branch_number`), (`tenant_id`, `code`)  •  **Index:** (`tenant_id`)

### `tkt_user_profile`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| user_id | TEXT | No | — *(this IS the primary key; it equals a `crm_auth_user.id`)* |
| tenant_id | TEXT | No | — |
| role | TEXT | No | — *("super_admin" / "platform_admin" / "user")* |
| email_notifications | BOOLEAN | No | `true` |
| dark_theme | BOOLEAN | No | `true` |
| activity_updates | BOOLEAN | No | `true` |
| system_alerts | BOOLEAN | No | `false` |
| audit_logs | BOOLEAN | No | `false` |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `user_id`  •  **Indexes:** (`tenant_id`), (`tenant_id`, `role`)

### `tkt_user_platform`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| user_id | TEXT | No | — |
| platform_id | TEXT | No | — |

- **Primary key:** (`user_id`, `platform_id`) together
- **Links to:** `user_id` → `tkt_user_profile(user_id)` (ON DELETE CASCADE); `platform_id` → `tkt_platform(id)` (ON DELETE CASCADE)

### `tkt_user_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| user_id | TEXT | No | — |
| branch_id | TEXT | No | — |

- **Primary key:** (`user_id`, `branch_id`) together
- **Links to:** `user_id` → `tkt_user_profile(user_id)` (ON DELETE CASCADE); `branch_id` → `tkt_branch(id)` (ON DELETE CASCADE)

### `tkt_ticket`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| ticket_number | TEXT | No | — |
| tenant_id | TEXT | No | — |
| branch_id | TEXT | No | — |
| platform_id | TEXT | No | — |
| user_id | TEXT | No | — *(who submitted it)* |
| issue_context | TEXT | No | — |
| sub_type | TEXT | No | — |
| fields | JSONB | No | — |
| status | TEXT | No | `'received'` |
| admin_remark | TEXT | Yes | — |
| rejection_reason | TEXT | Yes | — |
| assigned_admin_id | TEXT | Yes | — |
| completed_at | TIMESTAMP(3) | Yes | — |
| visible_until | TIMESTAMP(3) | Yes | — |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `ticket_number`)
- **Indexes:** (`tenant_id`, `platform_id`, `status`), (`tenant_id`, `branch_id`), (`tenant_id`, `user_id`)
- **Links to:** `platform_id` → `tkt_platform(id)`; `branch_id` → `tkt_branch(id)`; `user_id` → `tkt_user_profile(user_id)`

### `tkt_ticket_attachment`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| ticket_id | TEXT | No | — |
| url | TEXT | No | — |
| filename | TEXT | No | — |
| size | INTEGER | No | — |
| mime_type | TEXT | No | — |
| created_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`ticket_id`)
- **Links to:** `ticket_id` → `tkt_ticket(id)` (ON DELETE CASCADE)

### `tkt_ticket_event`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| ticket_id | TEXT | No | — |
| event_type | TEXT | No | — |
| description | TEXT | Yes | — |
| meta | JSONB | Yes | — |
| created_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`ticket_id`)
- **Links to:** `ticket_id` → `tkt_ticket(id)` (ON DELETE CASCADE)

### `tkt_counter`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenant_id | TEXT | No | — |
| platform_id | TEXT | No | — |
| branch_id | TEXT | Yes | — |
| counter_type | TEXT | No | — |
| year | INTEGER | No | — |
| month | INTEGER | Yes | — |
| day | INTEGER | Yes | — |
| current_count | INTEGER | No | `0` |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `platform_id`, `branch_id`, `counter_type`, `year`, `month`, `day`)  •  **Index:** (`tenant_id`)
- **Links to:** `platform_id` → `tkt_platform(id)`; `branch_id` → `tkt_branch(id)`

---

## Order to create tables (so the links don't fail)

Create tables that nothing points to first, then the rest:

1. **First:** `User`, `SessionRevocation`, `crm_auth_user`, `crm_auth_verification`,
   `core_audit_log`, `crm_tenant`, `crm_lead_source`, `tkt_platform`,
   `tkt_branch`, `tkt_user_profile`.
2. **Then:** `crm_auth_session`, `crm_auth_account`, `crm_branch`,
   `crm_user_branch`, `crm_pipeline`, `crm_stage`, `crm_tag`, `crm_contact`,
   `crm_opportunity`, `crm_stage_history`, `crm_contact_tag`, `crm_note`,
   `crm_task`, `crm_message`, `crm_call`, `crm_message_template`,
   `crm_custom_value`, `crm_automation`, `crm_automation_run`, `crm_integration`,
   `crm_integration_oauth_token`, `crm_website_form`, `crm_appointment`,
   `crm_notification`, `crm_email_settings`, `crm_whatsapp_settings`,
   `crm_api_key`, `crm_push_subscription`, `tkt_user_platform`,
   `tkt_user_branch`, `tkt_ticket`, `tkt_ticket_attachment`, `tkt_ticket_event`,
   `tkt_counter`.

**Easiest option:** the application uses Prisma. If you point Prisma at the empty
`ebright_crm` database and run its setup, it creates all of these in the right
order for you. (This is safe here because there are no foreign tables/views to
clobber.)

---

## Confirmed decisions

1. **`User` table — KEPT, populated by import (no FDW).** It is a real, owned
   table in `ebright_crm`. Its rows are **imported from another database on the
   same server** via a plain data copy (e.g. `pg_dump -t`/restore, a
   `dblink`/`INSERT … SELECT`, or an ETL job) — **not** a live FDW proxy. Refresh
   the copy whenever the source user list changes.
2. **Burnlist — OUT OF SCOPE.** The `burnlist_week` and `burnlist_entry` tables
   are **not** created. (Total is therefore **44 tables**.)
3. **Production + Staging — identical names, separate instances.** Both
   environments use the **same database name `ebright_crm`** and the **same table
   names**, built from this one sheet. They must live on **two separate
   PostgreSQL instances** (different host/port, or at minimum different clusters)
   so that work on one never affects the other — they must **not** be the same
   physical database (that shared setup is what caused the original outage). The
   app simply points at a different connection string per environment.
