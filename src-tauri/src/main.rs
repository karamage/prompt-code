// Windows のリリースビルドで、余計なコンソールウィンドウを出さない
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    prompt_code_lib::run();
}
