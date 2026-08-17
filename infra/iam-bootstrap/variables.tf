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

variable "github_repository" {
  description = "GitHub repository subject allowed to assume the production deploy role, including immutable owner and repository IDs when configured."
  type        = string
  default     = "manos-alex@142343937/colt-tracker@1311105686"
}

variable "github_environment" {
  description = "GitHub Actions environment allowed to assume the production deploy role."
  type        = string
  default     = "production"
}

variable "prod_deploy_role_name" {
  description = "Name of the GitHub Actions role used for production deployments."
  type        = string
  default     = "ColtTrackerProdDeployRole"
}

variable "attach_prod_administrator_access" {
  description = "Attach AdministratorAccess to the production deploy role while the Terraform stack is being established."
  type        = bool
  default     = true
}
