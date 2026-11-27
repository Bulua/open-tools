//! 导出 Rust -> TypeScript 强类型接口契约（`src/api/generated/*.ts`）。

fn main() {
    #[cfg(debug_assertions)]
    {
        if let Err(err) = open_tools_lib::export_ai_bindings() {
            eprintln!("{err}");
            std::process::exit(1);
        }
        println!("Exported TypeScript bindings to src/api/generated/ai.ts");
    }
}
