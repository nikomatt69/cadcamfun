//! Display-only edge buffers for both viewports. The reference is Three.js r180
//! EdgesGeometry (MIT, https://github.com/mrdoob/three.js). Keep its rounding,
//! winding, threshold and insertion order; this is not a CAD/CAM kernel.

use std::collections::HashMap;
use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_TRIANGLES: usize = 250_000;
const JOB_DEADLINE: Duration = Duration::from_secs(3);

/// Admission is bounded before copying a raw IPC body. A cancelled caller does
/// not release the slot while its blocking computation is still running.
#[derive(Default)]
pub struct ViewportPreparation {
    running: Arc<AtomicBool>,
}

pub struct PreparationPermit(Arc<AtomicBool>);

impl ViewportPreparation {
    pub fn try_admit(&self) -> Option<PreparationPermit> {
        self.running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| PreparationPermit(Arc::clone(&self.running)))
    }
}

impl Drop for PreparationPermit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum GeometryError {
    Invalid(&'static str),
    Limit,
    Deadline,
}

impl fmt::Display for GeometryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(message) => write!(f, "invalid viewport geometry: {message}"),
            Self::Limit => write!(f, "viewport geometry exceeds the native preparation limit"),
            Self::Deadline => write!(f, "native viewport preparation timed out"),
        }
    }
}

impl std::error::Error for GeometryError {}

type VertexKey = [i64; 3];
type EdgeKey = [VertexKey; 2];

struct Edge {
    indices: [usize; 2],
    normal: [f64; 3],
}

struct Mesh<'a> {
    positions: &'a [u8],
    indices: &'a [u8],
    vertices: usize,
    corners: usize,
    threshold: f64,
}

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("validated length"),
    )
}

impl<'a> Mesh<'a> {
    fn decode(bytes: &'a [u8]) -> Result<Self, GeometryError> {
        if bytes.len() > MAX_INPUT_BYTES {
            return Err(GeometryError::Limit);
        }
        if bytes.len() < 24 || &bytes[..4] != b"CGE1" {
            return Err(GeometryError::Invalid("missing CGE1 header"));
        }
        let vertices = u32_at(bytes, 4) as usize;
        let indices = u32_at(bytes, 8) as usize;
        let angle = f64::from_le_bytes(bytes[12..20].try_into().expect("validated header"));
        if !angle.is_finite() || !(0.0..=180.0).contains(&angle) || u32_at(bytes, 20) != 0 {
            return Err(GeometryError::Invalid("unsupported threshold or flags"));
        }
        let corners = if indices == 0 { vertices } else { indices };
        if corners % 3 != 0 {
            return Err(GeometryError::Invalid("incomplete triangle"));
        }
        if corners / 3 > MAX_TRIANGLES || vertices > MAX_TRIANGLES * 3 {
            return Err(GeometryError::Limit);
        }
        // Counts are bounded before doing arithmetic, including on 32-bit targets.
        let position_end = 24 + vertices * 12;
        if bytes.len() != position_end + indices * 4 {
            return Err(GeometryError::Invalid("body length does not match counts"));
        }
        Ok(Self {
            positions: &bytes[24..position_end],
            indices: &bytes[position_end..],
            vertices,
            corners,
            threshold: (std::f64::consts::PI / 180.0 * angle).cos(),
        })
    }

    fn point(&self, index: usize) -> [f64; 3] {
        std::array::from_fn(|axis| {
            f32::from_le_bytes(
                self.positions[index * 12 + axis * 4..index * 12 + axis * 4 + 4]
                    .try_into()
                    .expect("validated vertex"),
            ) as f64
        })
    }

    fn index(&self, corner: usize) -> Result<usize, GeometryError> {
        let index = if self.indices.is_empty() {
            corner
        } else {
            u32_at(self.indices, corner * 4) as usize
        };
        if index >= self.vertices {
            return Err(GeometryError::Invalid(
                "triangle index outside vertex buffer",
            ));
        }
        Ok(index)
    }
}

fn key(point: [f64; 3]) -> Result<VertexKey, GeometryError> {
    let mut out = [0; 3];
    for (axis, value) in point.into_iter().enumerate() {
        let scaled = value * 10_000.0;
        if !scaled.is_finite() || scaled.abs() > 9_007_199_254_740_991.0 {
            return Err(GeometryError::Invalid(
                "non-finite or unsupported coordinate",
            ));
        }
        // Math.round ties towards positive infinity, unlike Rust's f64::round.
        out[axis] = (scaled + 0.5).floor() as i64;
    }
    Ok(out)
}

fn normal(points: [[f64; 3]; 3]) -> [f64; 3] {
    // Same subtraction/cross-product order as Three.Triangle.getNormal.
    let cb: [f64; 3] = std::array::from_fn(|i| points[2][i] - points[1][i]);
    let ab: [f64; 3] = std::array::from_fn(|i| points[0][i] - points[1][i]);
    let n = [
        cb[1] * ab[2] - cb[2] * ab[1],
        cb[2] * ab[0] - cb[0] * ab[2],
        cb[0] * ab[1] - cb[1] * ab[0],
    ];
    let length_sq = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
    if length_sq > 0.0 {
        let inverse = 1.0 / length_sq.sqrt();
        n.map(|value| value * inverse)
    } else {
        [0.0; 3]
    }
}

fn append_edge(output: &mut Vec<u8>, mesh: &Mesh<'_>, indices: [usize; 2]) {
    for index in indices {
        output.extend_from_slice(&mesh.positions[index * 12..index * 12 + 12]);
    }
}

pub fn prepare_edges(bytes: &[u8]) -> Result<Vec<u8>, GeometryError> {
    prepare_edges_until(bytes, Instant::now() + JOB_DEADLINE)
}

pub(crate) fn prepare_edges_until(
    bytes: &[u8],
    deadline: Instant,
) -> Result<Vec<u8>, GeometryError> {
    let mesh = Mesh::decode(bytes)?;
    let mut lookup: HashMap<EdgeKey, usize> = HashMap::new();
    let mut edges: Vec<Option<Edge>> = Vec::new();
    let mut output = b"CEL1\0\0\0\0".to_vec();
    // Validate every vertex, including ones no triangle references.
    for vertex in 0..mesh.vertices {
        if vertex % 1024 == 0 && Instant::now() >= deadline {
            return Err(GeometryError::Deadline);
        }
        key(mesh.point(vertex))?;
    }
    for corner in (0..mesh.corners).step_by(3) {
        if corner % 3072 == 0 && Instant::now() >= deadline {
            return Err(GeometryError::Deadline);
        }
        let ids = [
            mesh.index(corner)?,
            mesh.index(corner + 1)?,
            mesh.index(corner + 2)?,
        ];
        let points = ids.map(|id| mesh.point(id));
        let hashes = [key(points[0])?, key(points[1])?, key(points[2])?];
        if hashes[0] == hashes[1] || hashes[1] == hashes[2] || hashes[2] == hashes[0] {
            continue;
        }
        let n = normal(points);
        for j in 0..3 {
            let next = (j + 1) % 3;
            let forward = [hashes[j], hashes[next]];
            let reverse = [hashes[next], hashes[j]];
            let sibling = lookup
                .get(&reverse)
                .and_then(|&index| edges[index].as_ref().map(|edge| (index, edge)));
            if let Some((index, edge)) = sibling {
                let dot = n[0] * edge.normal[0] + n[1] * edge.normal[1] + n[2] * edge.normal[2];
                if dot <= mesh.threshold {
                    append_edge(&mut output, &mesh, [ids[j], ids[next]]);
                }
                edges[index] = None;
            } else if let std::collections::hash_map::Entry::Vacant(entry) = lookup.entry(forward) {
                entry.insert(edges.len());
                edges.push(Some(Edge {
                    indices: [ids[j], ids[next]],
                    normal: n,
                }));
            }
        }
    }
    // A HashMap iteration would scramble boundary-edge order and break the wire reference.
    for (index, edge) in edges.into_iter().enumerate() {
        if index % 1024 == 0 && Instant::now() >= deadline {
            return Err(GeometryError::Deadline);
        }
        if let Some(edge) = edge {
            append_edge(&mut output, &mesh, edge.indices);
        }
    }
    let vertices = ((output.len() - 8) / 12) as u32;
    output[4..8].copy_from_slice(&vertices.to_le_bytes());
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(positions: &[f32], indices: &[u32]) -> Vec<u8> {
        let mut bytes = b"CGE1".to_vec();
        bytes.extend_from_slice(&((positions.len() / 3) as u32).to_le_bytes());
        bytes.extend_from_slice(&(indices.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&25.0_f64.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        for value in positions {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        for value in indices {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn planar_triangles_keep_boundaries_and_remove_the_diagonal() {
        let bytes = request(
            &[0., 0., 0., 1., 0., 0., 1., 1., 0., 0., 1., 0.],
            &[0, 1, 2, 0, 2, 3],
        );
        let output = prepare_edges(&bytes).expect("edges");
        assert_eq!(&output[..4], b"CEL1");
        assert_eq!(u32_at(&output, 4), 8);
        assert_eq!(output.len(), 8 + 8 * 12);
    }

    #[test]
    fn empty_mesh_and_nonindexed_triangle_are_supported() {
        assert_eq!(prepare_edges(&request(&[], &[])).unwrap(), b"CEL1\0\0\0\0");
        let triangle = request(&[0., 0., 0., 1., 0., 0., 0., 1., 0.], &[]);
        assert_eq!(u32_at(&prepare_edges(&triangle).unwrap(), 4), 6);
    }

    #[test]
    fn bad_data_is_rejected_before_it_can_index_or_allocate_from_counts() {
        let good = request(&[0., 0., 0., 1., 0., 0., 0., 1., 0.], &[]);
        for len in 0..good.len() {
            assert!(prepare_edges(&good[..len]).is_err());
        }
        let mut huge = good.clone();
        huge[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(prepare_edges(&huge), Err(GeometryError::Limit));
        let mut bad_flags = good.clone();
        bad_flags[20] = 1;
        assert!(prepare_edges(&bad_flags).is_err());
        let mut nan = good.clone();
        nan[24..28].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(prepare_edges(&nan).is_err());
        assert!(prepare_edges(&request(&[0., 0., 0.], &[1, 1, 1])).is_err());
        assert!(prepare_edges(&request(&[0., 0., 0., 1., 1., 1.], &[])).is_err());
    }

    #[test]
    fn deadline_is_cooperative_and_rounding_matches_javascript() {
        assert_eq!(key([-0.00005, 0.00005, -0.0]).unwrap(), [0, 1, 0]);
        let bytes = request(&[0., 0., 0., 1., 0., 0., 0., 1., 0.], &[]);
        assert_eq!(
            prepare_edges_until(&bytes, Instant::now()),
            Err(GeometryError::Deadline)
        );
    }

    #[test]
    fn admission_allows_one_job_and_recovers_after_the_worker_finishes() {
        let jobs = ViewportPreparation::default();
        let permit = jobs.try_admit().expect("first job");
        assert!(jobs.try_admit().is_none());
        let worker = std::thread::spawn(move || {
            let _permit = permit;
            assert!(prepare_edges(b"bad input").is_err());
        });
        worker.join().unwrap();
        assert!(jobs.try_admit().is_some());
    }
}
