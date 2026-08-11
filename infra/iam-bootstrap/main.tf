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
