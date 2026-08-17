data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "dev_deploy_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.trusted_principal_arns
    }
  }
}

resource "aws_iam_role" "dev_deploy" {
  name               = var.dev_deploy_role_name
  description        = "Manual dev deployment role for Colt Tracker infrastructure."
  assume_role_policy = data.aws_iam_policy_document.dev_deploy_assume_role.json
}

resource "aws_iam_role_policy_attachment" "dev_deploy_admin" {
  count = var.attach_administrator_access ? 1 : 0

  role       = aws_iam_role.dev_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "prod_deploy_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "prod_deploy" {
  name                 = var.prod_deploy_role_name
  description          = "GitHub Actions production deployment role for Colt Tracker."
  assume_role_policy   = data.aws_iam_policy_document.prod_deploy_assume_role.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "prod_deploy_admin" {
  count = var.attach_prod_administrator_access ? 1 : 0

  role       = aws_iam_role.prod_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
