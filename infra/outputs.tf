output "frontend_bucket_name" {
  description = "S3 bucket for built frontend assets."
  value       = aws_s3_bucket.frontend.bucket
}

output "frontend_cloudfront_domain_name" {
  description = "CloudFront domain for the frontend."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidations."
  value       = aws_cloudfront_distribution.frontend.id
}

output "api_endpoint" {
  description = "HTTP API Gateway endpoint."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "database_endpoint" {
  description = "Aurora PostgreSQL writer endpoint."
  value       = aws_rds_cluster.database.endpoint
}

output "database_secret_arn" {
  description = "Secrets Manager ARN for the generated database credentials."
  value       = aws_rds_cluster.database.master_user_secret[0].secret_arn
  sensitive   = true
}

output "migration_runner_function_name" {
  description = "Lambda function name used to apply database migrations."
  value       = aws_lambda_function.migration_runner.function_name
}
