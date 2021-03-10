module "static-site" {
  source = "./modules/aws-static-site"

  site_domain = "logan.kiwi"
  bucket_name = "logan.kiwi"
  acm_certificate_arn = "arn:aws:acm:us-east-1:016219264466:certificate/9535b906-b6ee-42a6-884c-63239d0c0f75"
}
