output "state_bucket_name" {
  description = "S3 bucket name for Terraform remote state."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking."
  value       = aws_dynamodb_table.terraform_locks.name
}

output "aws_region" {
  description = "AWS region containing the Terraform state resources."
  value       = var.aws_region
}
