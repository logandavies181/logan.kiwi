terraform {
  backend "s3" {
    bucket = "logan.kiwi.state"
    region = "ap-southeast-2"
  }
}

provider "aws" {
  region = "ap-southeast-2"
}
