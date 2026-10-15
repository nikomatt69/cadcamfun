require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = "CadPreview"
  s.version        = package["version"]
  s.summary        = "Metal preview for CADCAMFUN meshes and toolpaths."
  s.description    = "Draws a bounded triangle mesh and coloured toolpath lines. The phone does not run the CAD kernel."
  s.license        = "MIT"
  s.author         = "CADCAMFUN"
  s.homepage       = "https://cadcamfun.com"
  s.source         = { :git => "https://github.com/cadcamfun/cadcamfun.git" }
  s.platforms      = { :ios => "16.4" }
  s.source_files   = "ios/*.{swift,h,m}"
  s.swift_version  = "5.9"
  s.frameworks     = "Metal", "MetalKit"
  s.dependency "ExpoModulesCore"
end
