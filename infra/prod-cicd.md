# Production CI/CD Setup

Production deploys run through `.github/workflows/deploy-prod.yml`. A push to `main` or a manual
workflow dispatch first builds the frontend and backend and validates Terraform. The deployment job
then waits on the protected GitHub `production` environment, assumes an AWS role through OIDC,
plans and applies Terraform, runs database migrations, publishes the frontend, invalidates
CloudFront, and smoke-tests the deployed app.

No long-lived AWS access key belongs in GitHub.

## 1. Confirm The Production Values

The committed `environments/prod.tfvars` controls production sizing. The current defaults are:

- AWS region: `us-east-1`
- Lambda reserved concurrency: `20`
- API throttling: `50` requests/second with a burst of `100`
- Aurora Serverless v2: `0` minimum and `1` maximum ACUs, with auto-pause after 5 idle minutes
- Database deletion protection: enabled

The first deployment uses the generated CloudFront domain. After that deployment, replace
`REPLACE_WITH_PROD_FRONTEND_DOMAIN` in `environments/prod.tfvars` with the reported domain, for
example `https://d123example.cloudfront.net`, commit the change, and deploy again. Browser API calls
already use the same CloudFront origin; this follow-up also makes the API Gateway CORS configuration
match the real frontend origin.

Custom DNS is not part of the current Terraform stack. Adding a domain requires an ACM certificate
in `us-east-1`, a CloudFront alias, and DNS validation/records (usually Route 53).

## 2. Bootstrap Remote Terraform State In AWS

Run this once using an AWS administrator or IAM Identity Center profile:

```sh
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan
terraform -chdir=infra/bootstrap apply
terraform -chdir=infra/bootstrap output -raw state_bucket_name
terraform -chdir=infra/bootstrap output -raw lock_table_name
```

If the dev environment already uses remote state, do not create another state stack. Reuse the
existing bucket and lock table. Production uses a separate key, `prod/terraform.tfstate`, in that
bucket.

## 3. Bootstrap GitHub OIDC And The Production Role In AWS

Create or update `infra/iam-bootstrap/terraform.tfvars` (it is gitignored):

```hcl
trusted_principal_arns = [
  "arn:aws:iam::123456789012:role/YOUR_ADMIN_OR_IDENTITY_CENTER_ROLE"
]

github_repository  = "manos-alex/colt-tracker"
github_environment = "production"
```

Then apply it with credentials allowed to manage IAM:

```sh
terraform -chdir=infra/iam-bootstrap init
terraform -chdir=infra/iam-bootstrap plan
terraform -chdir=infra/iam-bootstrap apply
terraform -chdir=infra/iam-bootstrap output -raw account_id
terraform -chdir=infra/iam-bootstrap output -raw prod_deploy_role_arn
```

If AWS reports that `token.actions.githubusercontent.com` already exists, import it as described in
`infra/iam-bootstrap/README.md` and apply again.

## 4. Configure GitHub

In `manos-alex/colt-tracker`, open **Settings > Environments** and create an environment named
exactly `production`. The name is part of the AWS trust policy and is case-sensitive.

Configure these protection rules when the repository's GitHub plan supports them:

- Allow deployments only from `main`.
- Add the person or team that must approve production deployments as a required reviewer.
- Enable “prevent self-review” if someone other than the workflow initiator can approve.

Add these environment variables under the `production` environment:

| GitHub variable | Value | Where to get it |
| --- | --- | --- |
| `AWS_ACCOUNT_ID` | `123456789012` | `iam-bootstrap` output `account_id` |
| `AWS_REGION` | `us-east-1` | Must match the Terraform region |
| `AWS_ROLE_ARN` | `arn:aws:iam::123456789012:role/ColtTrackerProdDeployRole` | `iam-bootstrap` output `prod_deploy_role_arn` |
| `TF_STATE_BUCKET` | generated S3 bucket name | `bootstrap` output `state_bucket_name` |
| `TF_LOCK_TABLE` | `colt-tracker-terraform-locks` | `bootstrap` output `lock_table_name` |

Add these environment secrets:

| GitHub secret | Value |
| --- | --- |
| `ADMIN_SITE_PASSWORD` | A unique strong password for full app access |
| `VIEWER_SITE_PASSWORD` | A different unique password for statistics-only access |
| `SESSION_SECRET` | At least 32 random characters; use 64 random bytes |

Generate suitable values locally without printing them into a shell history:

```sh
openssl rand -base64 36
openssl rand -base64 36
openssl rand -hex 64
```

Store the first two outputs as the two passwords and the third as `SESSION_SECRET`. Do not add these
values to `prod.tfvars`, a committed file, or repository-level variables. Terraform marks them as
sensitive, but they are necessarily present in encrypted remote Terraform state because the current
Lambda configuration uses environment variables. Restrict access to the state bucket accordingly.

In **Settings > Branches** (or Rulesets), protect `main` and require the `CI / verify` status check
before merging. Also require pull requests if production changes should always receive code review.

## 5. Run The First Deployment

Merge these workflow changes into `main`, or open **Actions > Deploy Production > Run workflow**.
The build/validation job runs first. Approve the `production` deployment when GitHub prompts.

The first Aurora and CloudFront creation can take several minutes. At completion, the workflow
summary reports a URL like:

```text
https://d123example.cloudfront.net
```

Open it and test both passwords. Then update the production CORS origin as described in step 1 and
run the workflow once more.

## Failure And Recovery Notes

- A failed Terraform apply can be safely rerun; state locking prevents concurrent mutation.
- Migrations are versioned and skip versions already recorded in `schema_migrations`.
- Frontend publishing happens only after infrastructure and migrations succeed.
- Production database deletion protection is enabled, so destroying the stack requires an explicit
  configuration change before Terraform can delete Aurora.
- CloudFront/S3 retain prior object versions, but the current workflow does not automate rollback.
