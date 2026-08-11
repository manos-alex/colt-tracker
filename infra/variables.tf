variable "aws_region" {
  description = "AWS region for the application infrastructure."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming and tags."
  type        = string
  default     = "colt-tracker"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "frontend_bucket_name" {
  description = "Optional globally unique S3 bucket name for frontend assets. Leave blank to generate one."
  type        = string
  default     = ""
}

variable "api_cors_allowed_origins" {
  description = "Origins allowed to call the HTTP API. Tighten this after the frontend domain is stable."
  type        = list(string)
  default     = ["*"]
}

variable "lambda_runtime" {
  description = "Runtime for the serverless API Lambda placeholder."
  type        = string
  default     = "nodejs22.x"
}

variable "database_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "colttracker"
}

variable "database_master_username" {
  description = "PostgreSQL master username. Password is managed by AWS Secrets Manager."
  type        = string
  default     = "colt_tracker_admin"
}

variable "database_deletion_protection" {
  description = "Whether to enable deletion protection on the Aurora PostgreSQL cluster."
  type        = bool
  default     = false
}

variable "database_min_capacity" {
  description = "Aurora Serverless v2 minimum ACUs."
  type        = number
  default     = 0.5
}

variable "database_max_capacity" {
  description = "Aurora Serverless v2 maximum ACUs."
  type        = number
  default     = 2
}
