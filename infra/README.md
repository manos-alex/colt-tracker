# Colt Tracker Infrastructure

Terraform for the initial AWS deployment path:

- Private S3 bucket for built frontend assets.
- CloudFront distribution in front of the frontend bucket.
- HTTP API Gateway with a Lambda placeholder backend.
- Aurora PostgreSQL Serverless v2 cluster and generated credentials in Secrets Manager.
- Private VPC networking for Lambda-to-database access.

SQL tables live in `migrations/001_initial_schema.sql`. Terraform creates the database
infrastructure; migrations create and evolve database tables.

## Commands

Bootstrap the remote state resources once per AWS account:

```sh
cd infra/bootstrap
terraform init
terraform apply
```

Then write backend config files from the bootstrap output:

```sh
cd ..
./scripts/write-backend-configs.sh "$(terraform -chdir=bootstrap output -raw state_bucket_name)"
```

Initialize the app infrastructure against the dev state:

```sh
terraform init -backend-config=backend/dev.hcl
terraform fmt -recursive
terraform validate
terraform plan -var-file=environments/dev.tfvars
```

Use environment-specific variables for plans:

```sh
terraform plan -var-file=environments/dev.tfvars
terraform plan -var-file=environments/prod.tfvars
```

After applying infrastructure, run database migrations through the migration runner Lambda:

```sh
aws lambda invoke \
  --function-name "$(terraform output -raw migration_runner_function_name)" \
  /tmp/colt-tracker-migrations.json
```

After a frontend build, upload `../dist` to the `frontend_bucket_name` output. The CloudFront
distribution serves `index.html` for missing paths so client-side routes work.

The Lambda currently responds to `/health` and returns `404` for other routes. Replace
`lambda-placeholder` with the real TypeScript backend packaging path once the API is implemented.

See `deployment.md` for dev/prod deployment guidance, security notes, and API/database boundaries.
See `local-dev.md` for connecting local backend development to the deployed dev database.
