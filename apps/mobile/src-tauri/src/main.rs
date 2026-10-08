// Prevents an extra console window on Windows desktop builds of the shell; irrelevant on iOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cadcamfun_mobile_lib::run()
}
