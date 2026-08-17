# IAM Bootstrap

This stack creates the IAM roles used for deployments:

- `ColtTrackerDevDeployRole`
- `ColtTrackerProdDeployRole`

It also creates the GitHub Actions OIDC provider. The production role trust policy accepts only
tokens for the Colt Tracker repository's immutable owner/repository IDs and its `production` GitHub
environment. GitHub receives short-lived AWS credentials; do not create access keys for CI/CD.

The role is Terraform-managed to avoid console-created drift. You still need to run this bootstrap
stack once with credentials that can create IAM roles and policies.

## Find Your Trusted Principal ARN

Run this with the admin or IAM Identity Center profile you will use to assume the dev deploy role:

```sh
aws sts get-caller-identity
```

Use the returned `Arn` in `trusted_principal_arns`.

For IAM Identity Center, the ARN often looks like:

```text
arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_AdministratorAccess_xxxxx/user@example.com
```

For the trust policy, use the corresponding IAM role ARN instead:

```text
arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_AdministratorAccess_xxxxx
```

## Apply

Create a local tfvars file:

```sh
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`, then apply:

```sh
terraform init
terraform plan
terraform apply
```

If this AWS account already has the GitHub OIDC provider, import it into this stack before applying:

```sh
terraform import \
  aws_iam_openid_connect_provider.github_actions \
  arn:aws:iam::YOUR_AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com
```

Record the values needed by GitHub:

```sh
terraform output -raw account_id
terraform output -raw prod_deploy_role_arn
```

The production role initially has `AdministratorAccess` because it must create and update the
application's IAM, Lambda, API Gateway, CloudFront, S3, VPC, and RDS resources. Its trust policy is
strictly limited to the protected GitHub environment. Replace this managed policy with a
least-privilege deployment policy once the production resource set stabilizes.

## Configure AWS CLI Profile

Add a profile like this to `~/.aws/config`:

```ini
[profile colt-dev-deploy]
role_arn = arn:aws:iam::123456789012:role/ColtTrackerDevDeployRole
source_profile = YOUR_ADMIN_OR_SSO_PROFILE
region = us-east-1
```

Then use:

```sh
AWS_PROFILE=colt-dev-deploy aws sts get-caller-identity
```

That should return an assumed-role ARN for `ColtTrackerDevDeployRole`.
