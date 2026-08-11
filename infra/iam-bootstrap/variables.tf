variable "aws_region" {
  description = "AWS region for IAM bootstrap provider configuration."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for IAM naming."
  type        = string
  default     = "colt-tracker"
}

variable "trusted_principal_arns" {
  description = "IAM user or role ARNs allowed to assume the dev deploy role."
  type        = list(string)
}

variable "dev_deploy_role_name" {
  description = "Name of the IAM role used for manual dev deployments."
  type        = string
  default     = "ColtTrackerDevDeployRole"
}

variable "attach_administrator_access" {
  description = "Attach AWS managed AdministratorAccess for initial dev bootstrap. Tighten this after the stack stabilizes."
  type        = bool
  default     = true
}
