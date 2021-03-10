resource "aws_s3_bucket" "main" {
  bucket = var.bucket_name

  versioning {
    enabled = true
  }
}

resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "Used to auth to s3 bucket ${var.bucket_name}"
}

data "aws_iam_policy_document" "main" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.main.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.main.iam_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "main" {
  bucket = aws_s3_bucket.main.id
  policy = data.aws_iam_policy_document.main.json
}

resource "aws_cloudfront_distribution" "main" {
  aliases = [var.site_domain]
  enabled = true

  origin {
    domain_name = aws_s3_bucket.main.bucket_regional_domain_name
    origin_id   = var.bucket_name
    
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "${var.bucket_name}"
    compress = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }


    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn = var.acm_certificate_arn
    minimum_protocol_version = "TLSv1.2_2019"
    ssl_support_method = "sni-only"
  }
}
