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

variable "api_lambda_reserved_concurrency" {
  description = "Reserved concurrency limit for the API Lambda. Set null when the account concurrency quota is too low to reserve capacity."
  type        = number
  default     = null
  nullable    = true
}

variable "api_throttling_burst_limit" {
  description = "HTTP API burst request limit for the default stage."
  type        = number
  default     = 10
}

variable "api_throttling_rate_limit" {
  description = "HTTP API steady-state requests per second limit for the default stage."
  type        = number
  default     = 5
}

variable "admin_site_password" {
  description = "Password that grants full administrative access to the application."
  type        = string
  sensitive   = true
}

variable "viewer_site_password" {
  description = "Password that grants statistics-only access to the application."
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Random secret used to sign application session cookies. Must contain at least 32 characters."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.session_secret) >= 32
    error_message = "session_secret must contain at least 32 characters."
  }
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

variable "database_seconds_until_auto_pause" {
  description = "Seconds of inactivity before Aurora Serverless pauses when minimum capacity is 0."
  type        = number
  default     = 300
}

variable "database_enable_data_api" {
  description = "Whether to enable the Aurora Data API for controlled operational tasks like migrations."
  type        = bool
  default     = true
}
