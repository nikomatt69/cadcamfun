#!/usr/bin/env python3
"""Byte-level Three.js differential checks, paired CPU timings and allocation balance."""
import argparse
import json
from pathlib import Path
import platform
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent

RUNNER = r'''
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

struct Counted;
static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
fn allocated(size: usize) {
    let current = LIVE.fetch_add(size, Ordering::Relaxed) + size;
    PEAK.fetch_max(current, Ordering::Relaxed);
}
unsafe impl GlobalAlloc for Counted {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let result = System.alloc(layout);
        if !result.is_null() { allocated(layout.size()); }
        result
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let result = System.alloc_zeroed(layout);
        if !result.is_null() { allocated(layout.size()); }
        result
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        System.dealloc(pointer, layout);
        LIVE.fetch_sub(layout.size(), Ordering::Relaxed);
    }
    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        let result = System.realloc(pointer, layout, size);
        if !result.is_null() {
            LIVE.fetch_sub(layout.size(), Ordering::Relaxed);
            allocated(size);
        }
        result
    }
}
#[global_allocator]
static ALLOCATOR: Counted = Counted;

fn main() {
    for filename in std::env::args().skip(1) {
        let file = std::path::Path::new(&filename);
        let input = std::fs::read(file).unwrap();
        let expected = std::fs::read(file.with_extension("cel")).unwrap();
        let mut ms = [0.0; 5];
        let mut peak = 0;
        for elapsed in &mut ms {
            let before = LIVE.load(Ordering::Relaxed);
            PEAK.store(before, Ordering::Relaxed);
            let start = Instant::now();
            // Validation must still compare all output when this host is contended.
            // The production command keeps its independent three-second deadline.
            let output = viewport::prepare_edges_until(&input, Instant::now() + std::time::Duration::from_secs(120)).expect("native preparation");
            *elapsed = start.elapsed().as_secs_f64() * 1000.0;
            assert_eq!(output, expected, "Three.js mismatch: {}", filename);
            peak = peak.max(PEAK.load(Ordering::Relaxed) - before);
            drop(output);
            assert_eq!(LIVE.load(Ordering::Relaxed), before, "native request retained heap");
        }
        if input.len() > 24 && u32::from_le_bytes(input[8..12].try_into().unwrap()) > 0 {
            let mut invalid = input.clone();
            let last = invalid.len() - 4;
            invalid[last..].copy_from_slice(&u32::MAX.to_le_bytes());
            let before = LIVE.load(Ordering::Relaxed);
            assert!(viewport::prepare_edges(&invalid).is_err());
            assert_eq!(LIVE.load(Ordering::Relaxed), before, "failed native request retained heap");
        }
        ms.sort_by(f64::total_cmp);
        println!("{{\"id\":\"{}\",\"native_ms_p50\":{},\"native_ms_p95\":{},\"peak_job_bytes\":{},\"retained_job_bytes\":0}}",
            file.file_stem().unwrap().to_str().unwrap(), ms[2], ms[4], peak);
    }
    // Rejected inputs must not accumulate allocations either.
    let before = LIVE.load(Ordering::Relaxed);
    for _ in 0..10_000 { assert!(viewport::prepare_edges(b"invalid").is_err()); }
    assert_eq!(LIVE.load(Ordering::Relaxed), before);
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="cadcam-viewport-edges-") as directory:
        tmp = Path(directory)
        module = json.dumps(str(HERE.parent / "src" / "viewport_geometry.rs"))
        (tmp / "runner.rs").write_text(f"#[allow(dead_code)]\n#[path = {module}]\nmod viewport;\n" + RUNNER)
        subprocess.run(["rustc", "--edition=2021", "-C", "opt-level=s", "-C", "codegen-units=1", "-C", "lto=true", str(tmp / "runner.rs"), "-o", str(tmp / "runner")], check=True)
        subprocess.run(["bun", "--no-env-file", str(HERE / "reference-edges.ts"), directory], check=True)
        reference = json.loads((tmp / "manifest.json").read_text())
        output = subprocess.check_output([str(tmp / "runner"), *[str(tmp / f"{item['id']}.cge") for item in reference]], text=True)
        native = {item["id"]: item for item in map(json.loads, output.splitlines())}
        scenarios = [{**item, **native[item["id"]]} for item in reference]
    report = {
        "differential": "passed", "reference": "installed Three.js EdgesGeometry r180",
        "allocation_balance": "0 retained bytes per completed job; 10000 malformed requests balanced",
        "environment": {"os": platform.platform(), "architecture": platform.machine()},
        "profile": "opt-level=s, codegen-units=1, lto=true (desktop release settings)",
        "scope": "CPU edge preparation only; validation budget 120s under contention, production deadline stays 3s; excludes IPC, serialization, renderer installation and GPU frames",
        "scenarios": scenarios,
    }
    result = json.dumps(report, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(result)
    print(result, end="")


if __name__ == "__main__":
    main()
