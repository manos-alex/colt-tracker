# IAM Bootstrap

This stack creates the IAM role used for manual dev deployments:

- `ColtTrackerDevDeployRole`

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
