# Colt Tracker Infrastructure

Terraform for the initial AWS deployment path:

- Private S3 bucket for built frontend assets.
- CloudFront distribution in front of the frontend bucket.
- HTTP API Gateway with the TypeScript backend Lambda.
- Aurora PostgreSQL Serverless v2 cluster and generated credentials in Secrets Manager.
- Private VPC networking for Lambda-to-database access.
- VPC endpoints for AWS APIs used from private Lambda subnets.

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

Build the app before applying infrastructure. Terraform packages `../backend/dist/lambda` into the
API Lambda deployment artifact:

```sh
cd ..
npm run build
cd infra
terraform apply -var-file=environments/dev.tfvars
```

Use environment-specific variables for plans:

```sh
terraform plan -var-file=environments/dev.tfvars
terraform plan -var-file=environments/prod.tfvars
```

After applying infrastructure, run database migrations through the migration runner Lambda:

```sh
AWS_PROFILE=colt-dev-deploy AWS_REGION=us-east-1 aws lambda invoke \
  --function-name "$(terraform output -raw migration_runner_function_name)" \
  /tmp/colt-tracker-migrations.json
```

Smoke test the deployed API:

```sh
curl "$(terraform output -raw api_endpoint)/api/health"
curl "$(terraform output -raw api_endpoint)/api/bootstrap"
```

After a frontend build, upload `../dist` to the `frontend_bucket_name` output. The CloudFront
distribution serves `index.html` for missing paths so client-side routes work.

See `deployment.md` for dev/prod deployment guidance, security notes, and API/database boundaries.
See `local-dev.md` for connecting local backend development to the deployed dev database.
