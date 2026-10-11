require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = "CompanionNet"
  s.version        = package["version"]
  s.summary        = "Pinned-TLS HTTP client for the CADCAMFUN companion gateway."
  s.description    = "Performs https requests against the paired desktop, accepting only the certificate whose SHA-256 fingerprint matches the pairing QR code."
  s.license        = "MIT"
  s.author         = "CADCAMFUN"
  s.homepage       = "https://cadcamfun.com"
  s.source         = { :git => "https://github.com/cadcamfun/cadcamfun.git" }
  s.platforms      = { :ios => "16.4" }
  s.source_files   = "ios/*.{swift,h,m}"
  s.swift_version  = "5.9"
  s.dependency "ExpoModulesCore"
end
