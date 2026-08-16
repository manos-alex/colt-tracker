data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "api_gateway" {
  name = "Managed-AllViewerExceptHostHeader"
}

locals {
  name_prefix        = substr(replace(lower("${var.project_name}-${var.environment}"), "/[^a-z0-9-]/", "-"), 0, 40)
  frontend_origin_id = "${local.name_prefix}-frontend"
  api_origin_id      = "${local.name_prefix}-api"
  az_names           = slice(data.aws_availability_zones.available.names, 0, 2)
  migration_files    = sort(fileset("${path.module}/migrations", "*.sql"))

  tags = {
    Application = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "random_id" "frontend_bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "frontend" {
  bucket = var.frontend_bucket_name != "" ? var.frontend_bucket_name : "${local.name_prefix}-frontend-${random_id.frontend_bucket_suffix.hex}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "OAC for Colt Tracker frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "${var.project_name} ${var.environment} frontend"
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
    origin_id                = local.frontend_origin_id
  }

  origin {
    domain_name = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
    origin_id   = local.api_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true
    target_origin_id       = local.frontend_origin_id
    viewer_protocol_policy = "redirect-to-https"
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    compress                 = true
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.api_gateway.id
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json
}

resource "aws_vpc" "app" {
  cidr_block           = "10.32.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.app.id
  cidr_block        = cidrsubnet(aws_vpc.app.cidr_block, 8, count.index + 1)
  availability_zone = local.az_names[count.index]
}

resource "aws_security_group" "database" {
  name        = "${local.name_prefix}-postgres"
  description = "Aurora PostgreSQL access from Lambda"
  vpc_id      = aws_vpc.app.id
}

resource "aws_vpc_security_group_egress_rule" "database_all" {
  security_group_id = aws_security_group.database.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_db_subnet_group" "database" {
  name       = "${local.name_prefix}-postgres"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_rds_cluster" "database" {
  cluster_identifier              = "${local.name_prefix}-postgres"
  engine                          = "aurora-postgresql"
  database_name                   = var.database_name
  enable_http_endpoint            = var.database_enable_data_api
  master_username                 = var.database_master_username
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.database.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  storage_encrypted               = true
  backup_retention_period         = 7
  deletion_protection             = var.database_deletion_protection
  skip_final_snapshot             = !var.database_deletion_protection
  copy_tags_to_snapshot           = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity             = var.database_min_capacity
    max_capacity             = var.database_max_capacity
    seconds_until_auto_pause = var.database_min_capacity == 0 ? var.database_seconds_until_auto_pause : null
  }
}

resource "aws_rds_cluster_instance" "database" {
  identifier          = "${local.name_prefix}-postgres-1"
  cluster_identifier  = aws_rds_cluster.database.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.database.engine
  publicly_accessible = false
}

data "archive_file" "api_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/dist/lambda"
  output_path = "${path.module}/.terraform-build/api.zip"
}

data "archive_file" "migration_runner" {
  type        = "zip"
  output_path = "${path.module}/.terraform-build/migration-runner.zip"

  source {
    content  = file("${path.module}/migration-runner/index.mjs")
    filename = "index.mjs"
  }

  dynamic "source" {
    for_each = local.migration_files

    content {
      content  = file("${path.module}/migrations/${source.value}")
      filename = "migrations/${source.value}"
    }
  }
}

resource "aws_iam_role" "api_lambda" {
  name = "${local.name_prefix}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_lambda_basic" {
  role       = aws_iam_role.api_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "api_lambda_database" {
  statement {
    actions = [
      "rds-data:BatchExecuteStatement",
      "rds-data:BeginTransaction",
      "rds-data:CommitTransaction",
      "rds-data:ExecuteStatement",
      "rds-data:RollbackTransaction",
    ]
    resources = [aws_rds_cluster.database.arn]
  }

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_rds_cluster.database.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "api_lambda_database" {
  name   = "${local.name_prefix}-api-lambda-database"
  role   = aws_iam_role.api_lambda.id
  policy = data.aws_iam_policy_document.api_lambda_database.json
}

resource "aws_cloudwatch_log_group" "api_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-api"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name                  = "${local.name_prefix}-api"
  role                           = aws_iam_role.api_lambda.arn
  handler                        = "index.handler"
  runtime                        = var.lambda_runtime
  filename                       = data.archive_file.api_lambda.output_path
  source_code_hash               = data.archive_file.api_lambda.output_base64sha256
  timeout                        = 15
  memory_size                    = 256
  reserved_concurrent_executions = var.api_lambda_reserved_concurrency

  environment {
    variables = {
      DB_CLUSTER_ARN = aws_rds_cluster.database.arn
      DB_NAME        = var.database_name
      DB_SECRET_ARN  = aws_rds_cluster.database.master_user_secret[0].secret_arn
      ENVIRONMENT    = var.environment
      PROJECT_NAME   = var.project_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api_lambda,
    aws_iam_role_policy_attachment.api_lambda_basic,
    aws_iam_role_policy.api_lambda_database,
  ]
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["content-type", "authorization"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_origins = var.api_cors_allowed_origins
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api_default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "api_default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.api_throttling_burst_limit
    throttling_rate_limit  = var.api_throttling_rate_limit
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_iam_role" "migration_runner" {
  name = "${local.name_prefix}-migration-runner"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "migration_runner_basic" {
  role       = aws_iam_role.migration_runner.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "migration_runner_database" {
  statement {
    actions = [
      "rds-data:BatchExecuteStatement",
      "rds-data:BeginTransaction",
      "rds-data:CommitTransaction",
      "rds-data:ExecuteStatement",
      "rds-data:RollbackTransaction",
    ]
    resources = [aws_rds_cluster.database.arn]
  }

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_rds_cluster.database.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "migration_runner_database" {
  name   = "${local.name_prefix}-migration-runner-database"
  role   = aws_iam_role.migration_runner.id
  policy = data.aws_iam_policy_document.migration_runner_database.json
}

resource "aws_cloudwatch_log_group" "migration_runner" {
  name              = "/aws/lambda/${local.name_prefix}-migration-runner"
  retention_in_days = 14
}

resource "aws_lambda_function" "migration_runner" {
  function_name    = "${local.name_prefix}-migration-runner"
  role             = aws_iam_role.migration_runner.arn
  handler          = "index.handler"
  runtime          = var.lambda_runtime
  filename         = data.archive_file.migration_runner.output_path
  source_code_hash = data.archive_file.migration_runner.output_base64sha256
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      DB_CLUSTER_ARN = aws_rds_cluster.database.arn
      DB_NAME        = var.database_name
      DB_SECRET_ARN  = aws_rds_cluster.database.master_user_secret[0].secret_arn
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.migration_runner,
    aws_iam_role_policy_attachment.migration_runner_basic,
    aws_iam_role_policy.migration_runner_database,
    aws_rds_cluster_instance.database,
  ]
}
