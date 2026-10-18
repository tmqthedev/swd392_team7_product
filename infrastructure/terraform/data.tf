# Interview session context (backend AwsSessionStore / sessionContextStore).
# The backend runs with SESSION_TABLE_AUTO_CREATE=false in prod, so this table
# must exist before the first interview.
resource "aws_dynamodb_table" "session" {
  name         = "${local.name}-session-context"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"

  attribute {
    name = "sessionId"
    type = "S"
  }

  ttl {
    attribute_name = var.session_ttl_attribute
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = false
  }
}
