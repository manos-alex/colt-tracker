output "account_id" {
  description = "AWS account ID where the dev deploy role was created."
  value       = data.aws_caller_identity.current.account_id
}

output "dev_deploy_role_arn" {
  description = "ARN of the role to assume for manual dev deployments."
  value       = aws_iam_role.dev_deploy.arn
}

output "dev_deploy_role_name" {
  description = "Name of the role to assume for manual dev deployments."
  value       = aws_iam_role.dev_deploy.name
}
