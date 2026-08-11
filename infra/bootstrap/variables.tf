variable "aws_region" {
  description = "AWS region for the Terraform state resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for Terraform state resource naming."
  type        = string
  default     = "colt-tracker"
}

variable "state_bucket_name" {
  description = "Optional globally unique S3 bucket name for Terraform state. Leave blank to generate one."
  type        = string
  default     = ""
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "colt-tracker-terraform-locks"
}
