#!/usr/bin/env python3
"""Compare the actual Rust framer with a Git revision, using optimized standalone Rust."""
import argparse
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[4]
SOURCE = "apps/desktop/src-tauri/src/sidecar.rs"


def framer(source):
    start = source.index("#[derive(Default)]\nstruct LineBuffer")
    end = source.index("/// 32 random bytes", start)
    return ("const MAX_LINE_BYTES: usize = 16 * 1024;\n" + source[start:end]).replace(
        "struct LineBuffer", "pub struct LineBuffer"
    ).replace("fn push(", "pub fn push(")


HARNESS = r'''
use std::hint::black_box;
use std::time::Instant;

fn chunks(bytes: &[u8], size: usize) -> Vec<Vec<u8>> {
    bytes.chunks(size).map(|s| s.to_vec()).collect()
}

fn baseline_run(input: &[Vec<u8>]) -> usize {
    let mut buffer = baseline::LineBuffer::default();
    let mut lines = 0;
    for chunk in input {
        for line in buffer.push(black_box(chunk)) { lines += black_box(line).len() + 1; }
    }
    black_box(lines)
}

fn current_run(input: &[Vec<u8>]) -> usize {
    let mut buffer = current::LineBuffer::default();
    let mut lines = 0;
    for chunk in input {
        for line in buffer.push(black_box(chunk)) { lines += black_box(line).len() + 1; }
    }
    black_box(lines)
}

fn main() {
    // Full lines, fragmented multi-byte UTF-8, empty/CRLF lines and oversize recovery.
    let record = b"{\"level\":\"INFO\",\"message\":\"kernel progress\",\"percent\":50}\n";
    let logs = record.repeat(16_384);
    let mut oversized = vec![b'x'; 256 * 1024];
    oversized.extend_from_slice(b"\n{\"event\":\"ready\",\"port\":4242}\n");
    let exact = [vec![b'a'; 16 * 1024], b"\n\n\r\n".to_vec(), vec![b'b'; 16 * 1024 + 1], b"\nnext\n".to_vec()].concat();
    let utf8 = "é🙂\r\n\n{\"event\":\"ready\",\"port\":42}\n".as_bytes();
    for bytes in [&exact[..], utf8] {
        for split in 0..=bytes.len() {
            let mut a = baseline::LineBuffer::default();
            let mut b = current::LineBuffer::default();
            for chunk in [&bytes[..split], &bytes[split..], b"tail\n"] {
                assert_eq!(a.push(chunk), b.push(chunk), "split {split}");
            }
        }
    }
    let cases = [
        ("bulk_logs", chunks(&logs, 64 * 1024)),
        ("fragmented_logs", chunks(&logs, 97)),
        ("single_byte_utf8", chunks(&utf8.repeat(8192), 1)),
        ("oversized_recovery", chunks(&oversized, 4096)),
    ];
    print!("{{\"differential\":\"passed\",\"scenarios\":[");
    for (case, (name, input)) in cases.iter().enumerate() {
        let mut a = baseline::LineBuffer::default();
        let mut b = current::LineBuffer::default();
        for chunk in input { assert_eq!(a.push(chunk), b.push(chunk)); }
        assert_eq!(baseline_run(input), current_run(input));
        let rounds = 8;
        let samples = 15;
        let mut before = Vec::new();
        let mut after = Vec::new();
        for i in 0..samples + 2 {
            let mut measure = |old: bool| {
                let start = Instant::now();
                for _ in 0..rounds {
                    if old { baseline_run(input); } else { current_run(input); }
                }
                let elapsed = start.elapsed().as_secs_f64() * 1000.0 / f64::from(rounds);
                if i >= 2 { if old { before.push(elapsed); } else { after.push(elapsed); } }
            };
            // Alternate order to avoid giving one implementation all the warm runs.
            measure(i % 2 == 0);
            measure(i % 2 != 0);
        }
        before.sort_by(f64::total_cmp);
        after.sort_by(f64::total_cmp);
        if case > 0 { print!(","); }
        let bytes: usize = input.iter().map(Vec::len).sum();
        print!("{{\"name\":\"{name}\",\"bytes\":{bytes},\"samples\":{samples},\"baseline_ms\":{{\"p50\":{},\"p95\":{}}},\"current_ms\":{{\"p50\":{},\"p95\":{}}},\"speedup_p50\":{}}}",
            before[7], before[14], after[7], after[14], before[7] / after[7]);
    }
    println!("]}}");
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-ref", default="HEAD")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    old = subprocess.check_output(
        ["git", "show", f"{args.baseline_ref}:{SOURCE}"], cwd=ROOT, text=True
    )
    current = (ROOT / SOURCE).read_text()
    source = "mod baseline {\n" + framer(old) + "}\nmod current {\n" + framer(current) + "}\n" + HARNESS
    with tempfile.TemporaryDirectory(prefix="cadcam-rust-framing-") as directory:
        path = Path(directory)
        (path / "bench.rs").write_text(source)
        subprocess.run(["rustc", "--edition=2021", "-C", "opt-level=s", "-C", "codegen-units=1", "-C", "lto=true", str(path / "bench.rs"), "-o", str(path / "bench")], check=True)
        report = json.loads(subprocess.check_output([str(path / "bench")], text=True))
    report["environment"] = {
        "os": platform.platform(), "architecture": platform.machine(), "logical_cpus": os.cpu_count(),
        "rustc": subprocess.check_output(["rustc", "--version"], text=True).strip(),
    }
    report["baseline_commit"] = subprocess.check_output(["git", "rev-parse", args.baseline_ref], cwd=ROOT, text=True).strip()
    report["scope"] = "Optimized output framing only; excludes log redaction, JSON parsing, process IO, UI and GPU"
    report["profile"] = "opt-level=s, codegen-units=1, lto=true (desktop release settings)"
    output = json.dumps(report, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output)
    print(output, end="")


if __name__ == "__main__":
    main()
