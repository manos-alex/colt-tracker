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

```sh
terraform init
terraform fmt -recursive
terraform validate
terraform plan
```

Use environment-specific variables for plans:

```sh
terraform plan -var-file=environments/dev.tfvars
terraform plan -var-file=environments/prod.tfvars
```

After a frontend build, upload `../dist` to the `frontend_bucket_name` output. The CloudFront
distribution serves `index.html` for missing paths so client-side routes work.

The Lambda currently responds to `/health` and returns `404` for other routes. Replace
`lambda-placeholder` with the real TypeScript backend packaging path once the API is implemented.

See `deployment.md` for dev/prod deployment guidance, security notes, and API/database boundaries.
