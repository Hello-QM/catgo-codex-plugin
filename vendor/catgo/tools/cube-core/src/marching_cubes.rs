//! Improved Marching Cubes implementation
//!
//! Enhancements over the basic algorithm:
//! 1. Gradient-based vertex normals for smooth Phong shading
//! 2. Vertex welding to reduce mesh size (hash-based deduplication)
//! 3. Parallel chunk processing via Rayon
//! 4. Support for dual (±) isosurfaces

use crate::cube::CubeFile;
#[cfg(feature = "parallel")]
use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct Mesh {
    /// Vertex positions [x, y, z, x, y, z, ...] in Angstroms
    pub positions: Vec<f32>,
    /// Vertex normals [nx, ny, nz, ...]
    pub normals: Vec<f32>,
    /// Triangle indices
    pub indices: Vec<u32>,
}

impl Mesh {
    pub fn vertex_count(&self) -> usize {
        self.positions.len() / 3
    }

    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    /// Merge another mesh into this one
    pub fn merge(&mut self, other: &Mesh) {
        let offset = self.vertex_count() as u32;
        self.positions.extend_from_slice(&other.positions);
        self.normals.extend_from_slice(&other.normals);
        self.indices
            .extend(other.indices.iter().map(|i| i + offset));
    }
}

/// Extract isosurface from a cube file at the given isovalue.
///
/// Uses improved Marching Cubes with:
/// - Linear interpolation for vertex positions
/// - Central-difference gradient normals
/// - Vertex welding (deduplication by spatial hash)
/// - Parallel processing of grid slabs
pub fn extract_isosurface(cube: &CubeFile, isovalue: f32) -> Mesh {
    let [nx, ny, nz] = cube.header.dims;
    let inv_t = compute_inv_transpose(&cube.header.voxel_axes);

    #[cfg(feature = "parallel")]
    let slab_meshes: Vec<Mesh> = (0..nx - 1)
        .into_par_iter()
        .map(|ix| extract_slab(cube, ix, ny, nz, isovalue, &inv_t))
        .collect();

    #[cfg(feature = "scalar")]
    let slab_meshes: Vec<Mesh> = (0..nx - 1)
        .map(|ix| extract_slab(cube, ix, ny, nz, isovalue, &inv_t))
        .collect();

    // Slabs are collected in x order even under Rayon. A deterministic global
    // weld removes duplicate vertices on slab seams while retaining the same
    // first-seen vertex/index order as the scalar traversal.
    let mut merged = weld_slabs(&slab_meshes);
    smooth_mesh(&mut merged, 2);
    recompute_normals(&mut merged);

    merged
}

fn extract_slab(
    cube: &CubeFile,
    ix: usize,
    ny: usize,
    nz: usize,
    isovalue: f32,
    inv_t: &[[f64; 3]; 3],
) -> Mesh {
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    let mut vertex_map: HashMap<(i32, i32, i32), u32> = HashMap::new();

    for iy in 0..ny - 1 {
        for iz in 0..nz - 1 {
            process_cube(
                cube,
                ix,
                iy,
                iz,
                isovalue,
                &mut positions,
                &mut normals,
                &mut indices,
                &mut vertex_map,
                inv_t,
            );
        }
    }

    Mesh {
        positions,
        normals,
        indices,
    }
}

fn weld_slabs(slabs: &[Mesh]) -> Mesh {
    let total_vertices: usize = slabs.iter().map(Mesh::vertex_count).sum();
    let total_indices: usize = slabs.iter().map(|mesh| mesh.indices.len()).sum();
    let mut merged = Mesh {
        positions: Vec::with_capacity(total_vertices * 3),
        normals: Vec::with_capacity(total_vertices * 3),
        indices: Vec::with_capacity(total_indices),
    };
    let mut vertex_map: HashMap<(i32, i32, i32), u32> = HashMap::new();

    for slab in slabs {
        let mut remap = Vec::with_capacity(slab.vertex_count());
        for vertex in 0..slab.vertex_count() {
            let base = vertex * 3;
            remap.push(add_vertex_welded(
                slab.positions[base],
                slab.positions[base + 1],
                slab.positions[base + 2],
                slab.normals[base],
                slab.normals[base + 1],
                slab.normals[base + 2],
                &mut merged.positions,
                &mut merged.normals,
                &mut vertex_map,
            ));
        }
        merged
            .indices
            .extend(slab.indices.iter().map(|index| remap[*index as usize]));
    }
    merged
}

fn compute_inv_transpose(axes: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let a = axes;
    let det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
        - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
        + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    if det.abs() < 1e-30 {
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    }
    let inv_det = 1.0 / det;
    let inv = [
        [
            (a[1][1] * a[2][2] - a[1][2] * a[2][1]) * inv_det,
            (a[0][2] * a[2][1] - a[0][1] * a[2][2]) * inv_det,
            (a[0][1] * a[1][2] - a[0][2] * a[1][1]) * inv_det,
        ],
        [
            (a[1][2] * a[2][0] - a[1][0] * a[2][2]) * inv_det,
            (a[0][0] * a[2][2] - a[0][2] * a[2][0]) * inv_det,
            (a[0][2] * a[1][0] - a[0][0] * a[1][2]) * inv_det,
        ],
        [
            (a[1][0] * a[2][1] - a[1][1] * a[2][0]) * inv_det,
            (a[0][1] * a[2][0] - a[0][0] * a[2][1]) * inv_det,
            (a[0][0] * a[1][1] - a[0][1] * a[1][0]) * inv_det,
        ],
    ];
    // `voxel_axes` stores axis vectors as rows while grid_to_cart evaluates
    // cart = V^T grid. Therefore (V^T)^-T = V^-1.
    inv
}

fn smooth_mesh(mesh: &mut Mesh, iterations: usize) {
    let vertex_count = mesh.vertex_count();
    if vertex_count == 0 || iterations == 0 {
        return;
    }

    // A Vec with first-seen insertion order reproduces JS Set iteration while
    // avoiding randomized HashSet iteration in floating-point reductions.
    let mut neighbors = vec![Vec::<u32>::new(); vertex_count];
    for triangle in mesh.indices.chunks_exact(3) {
        let a = triangle[0];
        let b = triangle[1];
        let c = triangle[2];
        add_neighbor(&mut neighbors[a as usize], b);
        add_neighbor(&mut neighbors[a as usize], c);
        add_neighbor(&mut neighbors[b as usize], a);
        add_neighbor(&mut neighbors[b as usize], c);
        add_neighbor(&mut neighbors[c as usize], a);
        add_neighbor(&mut neighbors[c as usize], b);
    }

    let mut snapshot = vec![0.0f32; mesh.positions.len()];
    for _ in 0..iterations {
        laplacian_pass(&mut mesh.positions, &neighbors, 0.5, &mut snapshot);
        laplacian_pass(&mut mesh.positions, &neighbors, -0.53, &mut snapshot);
    }
}

fn add_neighbor(neighbors: &mut Vec<u32>, candidate: u32) {
    if !neighbors.contains(&candidate) {
        neighbors.push(candidate);
    }
}

fn laplacian_pass(
    positions: &mut [f32],
    neighbors: &[Vec<u32>],
    factor: f64,
    snapshot: &mut [f32],
) {
    snapshot.copy_from_slice(positions);
    for (vertex, adjacent) in neighbors.iter().enumerate() {
        if adjacent.is_empty() {
            continue;
        }
        let mut average = [0.0f64; 3];
        for &neighbor in adjacent {
            let base = neighbor as usize * 3;
            average[0] += snapshot[base] as f64;
            average[1] += snapshot[base + 1] as f64;
            average[2] += snapshot[base + 2] as f64;
        }
        let inverse = 1.0 / adjacent.len() as f64;
        let base = vertex * 3;
        for axis in 0..3 {
            let current = snapshot[base + axis] as f64;
            positions[base + axis] =
                (current + factor * (average[axis] * inverse - current)) as f32;
        }
    }
}

fn recompute_normals(mesh: &mut Mesh) {
    mesh.normals.fill(0.0);
    for triangle in mesh.indices.chunks_exact(3) {
        let ia = triangle[0] as usize;
        let ib = triangle[1] as usize;
        let ic = triangle[2] as usize;
        let a = vertex(&mesh.positions, ia);
        let b = vertex(&mesh.positions, ib);
        let c = vertex(&mesh.positions, ic);
        let e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        let e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let face = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];
        for index in [ia, ib, ic] {
            let base = index * 3;
            for axis in 0..3 {
                mesh.normals[base + axis] = (mesh.normals[base + axis] as f64 + face[axis]) as f32;
            }
        }
    }
    normalize_normals(mesh);
}

fn vertex(positions: &[f32], index: usize) -> [f64; 3] {
    let base = index * 3;
    [
        positions[base] as f64,
        positions[base + 1] as f64,
        positions[base + 2] as f64,
    ]
}

/// Extract dual isosurfaces (positive and negative) simultaneously
pub fn extract_dual_isosurface(cube: &CubeFile, isovalue: f32) -> (Mesh, Mesh) {
    let pos = extract_isosurface(cube, isovalue);
    let neg = extract_isosurface(cube, -isovalue);
    (pos, neg)
}

/// Quantize to the browser viewer's 0.001 Å welding grid.
#[inline]
fn quantize(v: f32) -> i32 {
    (v * 1000.0).round() as i32
}

/// Add a vertex with welding (deduplication)
#[inline]
fn add_vertex_welded(
    x: f32,
    y: f32,
    z: f32,
    nx: f32,
    ny: f32,
    nz: f32,
    positions: &mut Vec<f32>,
    normals: &mut Vec<f32>,
    vertex_map: &mut HashMap<(i32, i32, i32), u32>,
) -> u32 {
    let key = (quantize(x), quantize(y), quantize(z));
    if let Some(&idx) = vertex_map.get(&key) {
        // Average the normals for shared vertices (smoother shading)
        let base = idx as usize * 3;
        normals[base] += nx;
        normals[base + 1] += ny;
        normals[base + 2] += nz;
        return idx;
    }

    let idx = (positions.len() / 3) as u32;
    positions.extend_from_slice(&[x, y, z]);
    normals.extend_from_slice(&[nx, ny, nz]);
    vertex_map.insert(key, idx);
    idx
}

/// Compute gradient at a grid point using central differences
#[inline]
fn compute_gradient(cube: &CubeFile, ix: usize, iy: usize, iz: usize) -> [f32; 3] {
    let [nx, ny, nz] = cube.header.dims;

    let gx = if ix > 0 && ix < nx - 1 {
        (cube.get(ix + 1, iy, iz) - cube.get(ix - 1, iy, iz)) * 0.5
    } else if ix == 0 {
        cube.get(1, iy, iz) - cube.get(0, iy, iz)
    } else {
        cube.get(nx - 1, iy, iz) - cube.get(nx - 2, iy, iz)
    };

    let gy = if iy > 0 && iy < ny - 1 {
        (cube.get(ix, iy + 1, iz) - cube.get(ix, iy - 1, iz)) * 0.5
    } else if iy == 0 {
        cube.get(ix, 1, iz) - cube.get(ix, 0, iz)
    } else {
        cube.get(ix, ny - 1, iz) - cube.get(ix, ny - 2, iz)
    };

    let gz = if iz > 0 && iz < nz - 1 {
        (cube.get(ix, iy, iz + 1) - cube.get(ix, iy, iz - 1)) * 0.5
    } else if iz == 0 {
        cube.get(ix, iy, 1) - cube.get(ix, iy, 0)
    } else {
        cube.get(ix, iy, nz - 1) - cube.get(ix, iy, nz - 2)
    };

    // Negate gradient (normal points from high to low density)
    [-gx, -gy, -gz]
}

/// Process a single voxel cube (8 corner points)
fn process_cube(
    cube: &CubeFile,
    ix: usize,
    iy: usize,
    iz: usize,
    isovalue: f32,
    positions: &mut Vec<f32>,
    normals: &mut Vec<f32>,
    indices: &mut Vec<u32>,
    vertex_map: &mut HashMap<(i32, i32, i32), u32>,
    inv_t: &[[f64; 3]; 3],
) {
    // Get the 8 corner values
    let vals = [
        cube.get(ix, iy, iz),
        cube.get(ix + 1, iy, iz),
        cube.get(ix + 1, iy + 1, iz),
        cube.get(ix, iy + 1, iz),
        cube.get(ix, iy, iz + 1),
        cube.get(ix + 1, iy, iz + 1),
        cube.get(ix + 1, iy + 1, iz + 1),
        cube.get(ix, iy + 1, iz + 1),
    ];

    // Compute cube index (which corners are above/below the isovalue)
    let mut cube_index: u8 = 0;
    for i in 0..8 {
        if vals[i] >= isovalue {
            cube_index |= 1 << i;
        }
    }

    // Skip if entirely inside or outside
    let edge_bits = EDGE_TABLE[cube_index as usize];
    if edge_bits == 0 {
        return;
    }

    // Corner positions as grid indices [ix, iy, iz]
    let corners: [[usize; 3]; 8] = [
        [ix, iy, iz],
        [ix + 1, iy, iz],
        [ix + 1, iy + 1, iz],
        [ix, iy + 1, iz],
        [ix, iy, iz + 1],
        [ix + 1, iy, iz + 1],
        [ix + 1, iy + 1, iz + 1],
        [ix, iy + 1, iz + 1],
    ];

    // Compute gradients at corners (for normal interpolation)
    let grads: [[f32; 3]; 8] = std::array::from_fn(|i| {
        compute_gradient(cube, corners[i][0], corners[i][1], corners[i][2])
    });

    // Compute edge vertices (interpolated positions + normals)
    let edge_endpoints: [(usize, usize); 12] = [
        (0, 1),
        (1, 2),
        (2, 3),
        (3, 0),
        (4, 5),
        (5, 6),
        (6, 7),
        (7, 4),
        (0, 4),
        (1, 5),
        (2, 6),
        (3, 7),
    ];

    let mut edge_verts: [u32; 12] = [0; 12];
    for (edge_idx, &(a, b)) in edge_endpoints.iter().enumerate() {
        if edge_bits & (1 << edge_idx) == 0 {
            continue;
        }

        // Linear interpolation parameter
        let va = vals[a];
        let vb = vals[b];
        let t = if (vb - va).abs() < 1e-12 {
            0.5
        } else {
            ((isovalue - va) / (vb - va)).clamp(0.0, 1.0)
        };

        // Interpolate grid position
        let gx = corners[a][0] as f64 + t as f64 * (corners[b][0] as f64 - corners[a][0] as f64);
        let gy = corners[a][1] as f64 + t as f64 * (corners[b][1] as f64 - corners[a][1] as f64);
        let gz = corners[a][2] as f64 + t as f64 * (corners[b][2] as f64 - corners[a][2] as f64);

        // Convert to Cartesian (Angstroms)
        let cart = cube.grid_to_cart(gx, gy, gz);

        // Interpolate gradient for normal
        let nx = grads[a][0] + t * (grads[b][0] - grads[a][0]);
        let ny = grads[a][1] + t * (grads[b][1] - grads[a][1]);
        let nz = grads[a][2] + t * (grads[b][2] - grads[a][2]);

        // Grid gradients are covectors. Transform by A^-T so normals remain
        // correct for anisotropic and skew voxel axes.
        let nx = nx as f64;
        let ny = ny as f64;
        let nz = nz as f64;
        let tx = inv_t[0][0] * nx + inv_t[0][1] * ny + inv_t[0][2] * nz;
        let ty = inv_t[1][0] * nx + inv_t[1][1] * ny + inv_t[1][2] * nz;
        let tz = inv_t[2][0] * nx + inv_t[2][1] * ny + inv_t[2][2] * nz;
        let len = (tx * tx + ty * ty + tz * tz).sqrt();
        let (nx, ny, nz) = if len > 1e-8 {
            ((tx / len) as f32, (ty / len) as f32, (tz / len) as f32)
        } else {
            (0.0, 1.0, 0.0)
        };

        edge_verts[edge_idx] = add_vertex_welded(
            cart[0] as f32,
            cart[1] as f32,
            cart[2] as f32,
            nx,
            ny,
            nz,
            positions,
            normals,
            vertex_map,
        );
    }

    // Generate triangles from lookup table
    let tri_row = &TRI_TABLE[cube_index as usize];
    let mut i = 0;
    while i < tri_row.len() && tri_row[i] != -1 {
        indices.push(edge_verts[tri_row[i] as usize]);
        indices.push(edge_verts[tri_row[i + 1] as usize]);
        indices.push(edge_verts[tri_row[i + 2] as usize]);
        i += 3;
    }
}

/// Normalize all vertex normals (after welding accumulation)
pub fn normalize_normals(mesh: &mut Mesh) {
    for i in (0..mesh.normals.len()).step_by(3) {
        let nx = mesh.normals[i];
        let ny = mesh.normals[i + 1];
        let nz = mesh.normals[i + 2];
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        if len > 1e-8 {
            mesh.normals[i] /= len;
            mesh.normals[i + 1] /= len;
            mesh.normals[i + 2] /= len;
        }
    }
}

/// Decimate a mesh by merging vertices within a tolerance.
/// Returns a new mesh with fewer vertices.
pub fn decimate_mesh(mesh: &Mesh, grid_size: f32) -> Mesh {
    let inv = 1.0 / grid_size;
    let mut bucket_map: HashMap<(i32, i32, i32), u32> = HashMap::new();
    let mut new_positions = Vec::new();
    let mut new_normals = Vec::new();
    let mut remap = Vec::with_capacity(mesh.vertex_count());

    for i in 0..mesh.vertex_count() {
        let x = mesh.positions[i * 3];
        let y = mesh.positions[i * 3 + 1];
        let z = mesh.positions[i * 3 + 2];

        let bx = (x * inv).round() as i32;
        let by = (y * inv).round() as i32;
        let bz = (z * inv).round() as i32;
        let key = (bx, by, bz);

        let new_idx = *bucket_map.entry(key).or_insert_with(|| {
            let idx = (new_positions.len() / 3) as u32;
            new_positions.extend_from_slice(&[x, y, z]);
            new_normals.extend_from_slice(&[
                mesh.normals[i * 3],
                mesh.normals[i * 3 + 1],
                mesh.normals[i * 3 + 2],
            ]);
            idx
        });
        remap.push(new_idx);
    }

    // Remap indices, skip degenerate triangles
    let mut new_indices = Vec::with_capacity(mesh.indices.len());
    for tri in mesh.indices.chunks(3) {
        let a = remap[tri[0] as usize];
        let b = remap[tri[1] as usize];
        let c = remap[tri[2] as usize];
        if a != b && b != c && a != c {
            new_indices.push(a);
            new_indices.push(b);
            new_indices.push(c);
        }
    }

    let mut result = Mesh {
        positions: new_positions,
        normals: new_normals,
        indices: new_indices,
    };
    normalize_normals(&mut result);

    result
}

// ─── Marching Cubes Lookup Tables ───────────────────────────────────────────
// Standard tables from Paul Bourke's implementation

/// Edge table: for each of 256 cube configurations, which edges are intersected
static EDGE_TABLE: [u16; 256] = [
    0x000, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c, 0x80c, 0x905, 0xa0f, 0xb06, 0xc0a,
    0xd03, 0xe09, 0xf00, 0x190, 0x099, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c, 0x99c, 0x895,
    0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90, 0x230, 0x339, 0x033, 0x13a, 0x636, 0x73f, 0x435,
    0x53c, 0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30, 0x3a0, 0x2a9, 0x1a3, 0x0aa,
    0x7a6, 0x6af, 0x5a5, 0x4ac, 0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0, 0x460,
    0x569, 0x663, 0x76a, 0x066, 0x16f, 0x265, 0x36c, 0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963,
    0xa69, 0xb60, 0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0x0ff, 0x3f5, 0x2fc, 0xdfc, 0xcf5, 0xfff,
    0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0, 0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x055, 0x15c,
    0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950, 0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6,
    0x2cf, 0x1c5, 0x0cc, 0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0, 0x8c0, 0x9c9,
    0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc, 0x0cc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9,
    0x7c0, 0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c, 0x15c, 0x055, 0x35f, 0x256,
    0x55a, 0x453, 0x759, 0x650, 0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc, 0x2fc,
    0x3f5, 0x0ff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0, 0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f,
    0xd65, 0xc6c, 0x36c, 0x265, 0x16f, 0x066, 0x76a, 0x663, 0x569, 0x460, 0xca0, 0xda9, 0xea3,
    0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac, 0x4ac, 0x5a5, 0x6af, 0x7a6, 0x0aa, 0x1a3, 0x2a9, 0x3a0,
    0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c, 0x53c, 0x435, 0x73f, 0x636, 0x13a,
    0x033, 0x339, 0x230, 0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c, 0x69c, 0x795,
    0x49f, 0x596, 0x29a, 0x393, 0x099, 0x190, 0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905,
    0x80c, 0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x000,
];

/// Triangle table: for each cube configuration, list of edge indices forming triangles
/// -1 terminates the list
#[rustfmt::skip]
static TRI_TABLE: [[i8; 16]; 256] = [
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,1,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,8,3,9,8,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,8,3,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [9,2,10,0,2,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [2,8,3,2,10,8,10,9,8,-1,-1,-1,-1,-1,-1,-1],
    [3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,11,2,8,11,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,9,0,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,11,2,1,9,11,9,8,11,-1,-1,-1,-1,-1,-1,-1],
    [3,10,1,11,10,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,10,1,0,8,10,8,11,10,-1,-1,-1,-1,-1,-1,-1],
    [3,9,0,3,11,9,11,10,9,-1,-1,-1,-1,-1,-1,-1],
    [9,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,3,0,7,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,1,9,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,1,9,4,7,1,7,3,1,-1,-1,-1,-1,-1,-1,-1],
    [1,2,10,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [3,4,7,3,0,4,1,2,10,-1,-1,-1,-1,-1,-1,-1],
    [9,2,10,9,0,2,8,4,7,-1,-1,-1,-1,-1,-1,-1],
    [2,10,9,2,9,7,2,7,3,7,9,4,-1,-1,-1,-1],
    [8,4,7,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [11,4,7,11,2,4,2,0,4,-1,-1,-1,-1,-1,-1,-1],
    [9,0,1,8,4,7,2,3,11,-1,-1,-1,-1,-1,-1,-1],
    [4,7,11,9,4,11,9,11,2,9,2,1,-1,-1,-1,-1],
    [3,10,1,3,11,10,7,8,4,-1,-1,-1,-1,-1,-1,-1],
    [1,11,10,1,4,11,1,0,4,7,11,4,-1,-1,-1,-1],
    [4,7,8,9,0,11,9,11,10,11,0,3,-1,-1,-1,-1],
    [4,7,11,4,11,9,9,11,10,-1,-1,-1,-1,-1,-1,-1],
    [9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [9,5,4,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,5,4,1,5,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [8,5,4,8,3,5,3,1,5,-1,-1,-1,-1,-1,-1,-1],
    [1,2,10,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [3,0,8,1,2,10,4,9,5,-1,-1,-1,-1,-1,-1,-1],
    [5,2,10,5,4,2,4,0,2,-1,-1,-1,-1,-1,-1,-1],
    [2,10,5,3,2,5,3,5,4,3,4,8,-1,-1,-1,-1],
    [9,5,4,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,11,2,0,8,11,4,9,5,-1,-1,-1,-1,-1,-1,-1],
    [0,5,4,0,1,5,2,3,11,-1,-1,-1,-1,-1,-1,-1],
    [2,1,5,2,5,8,2,8,11,4,8,5,-1,-1,-1,-1],
    [10,3,11,10,1,3,9,5,4,-1,-1,-1,-1,-1,-1,-1],
    [4,9,5,0,8,1,8,10,1,8,11,10,-1,-1,-1,-1],
    [5,4,0,5,0,11,5,11,10,11,0,3,-1,-1,-1,-1],
    [5,4,8,5,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1],
    [9,7,8,5,7,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [9,3,0,9,5,3,5,7,3,-1,-1,-1,-1,-1,-1,-1],
    [0,7,8,0,1,7,1,5,7,-1,-1,-1,-1,-1,-1,-1],
    [1,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [9,7,8,9,5,7,10,1,2,-1,-1,-1,-1,-1,-1,-1],
    [10,1,2,9,5,0,5,3,0,5,7,3,-1,-1,-1,-1],
    [8,0,2,8,2,5,8,5,7,10,5,2,-1,-1,-1,-1],
    [2,10,5,2,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1],
    [7,9,5,7,8,9,3,11,2,-1,-1,-1,-1,-1,-1,-1],
    [9,5,7,9,7,2,9,2,0,2,7,11,-1,-1,-1,-1],
    [2,3,11,0,1,8,1,7,8,1,5,7,-1,-1,-1,-1],
    [11,2,1,11,1,7,7,1,5,-1,-1,-1,-1,-1,-1,-1],
    [9,5,8,8,5,7,10,1,3,10,3,11,-1,-1,-1,-1],
    [5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1],
    [11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1],
    [11,10,5,7,11,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,8,3,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [9,0,1,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,8,3,1,9,8,5,10,6,-1,-1,-1,-1,-1,-1,-1],
    [1,6,5,2,6,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,6,5,1,2,6,3,0,8,-1,-1,-1,-1,-1,-1,-1],
    [9,6,5,9,0,6,0,2,6,-1,-1,-1,-1,-1,-1,-1],
    [5,9,8,5,8,2,5,2,6,3,2,8,-1,-1,-1,-1],
    [2,3,11,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [11,0,8,11,2,0,10,6,5,-1,-1,-1,-1,-1,-1,-1],
    [0,1,9,2,3,11,5,10,6,-1,-1,-1,-1,-1,-1,-1],
    [5,10,6,1,9,2,9,11,2,9,8,11,-1,-1,-1,-1],
    [6,3,11,6,5,3,5,1,3,-1,-1,-1,-1,-1,-1,-1],
    [0,8,11,0,11,5,0,5,1,5,11,6,-1,-1,-1,-1],
    [3,11,6,0,3,6,0,6,5,0,5,9,-1,-1,-1,-1],
    [6,5,9,6,9,11,11,9,8,-1,-1,-1,-1,-1,-1,-1],
    [5,10,6,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,3,0,4,7,3,6,5,10,-1,-1,-1,-1,-1,-1,-1],
    [1,9,0,5,10,6,8,4,7,-1,-1,-1,-1,-1,-1,-1],
    [10,6,5,1,9,7,1,7,3,7,9,4,-1,-1,-1,-1],
    [6,1,2,6,5,1,4,7,8,-1,-1,-1,-1,-1,-1,-1],
    [1,2,5,5,2,6,3,0,4,3,4,7,-1,-1,-1,-1],
    [8,4,7,9,0,5,0,6,5,0,2,6,-1,-1,-1,-1],
    [7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1],
    [3,11,2,7,8,4,10,6,5,-1,-1,-1,-1,-1,-1,-1],
    [5,10,6,4,7,2,4,2,0,2,7,11,-1,-1,-1,-1],
    [0,1,9,4,7,8,2,3,11,5,10,6,-1,-1,-1,-1],
    [9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1],
    [8,4,7,3,11,5,3,5,1,5,11,6,-1,-1,-1,-1],
    [5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1],
    [0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1],
    [6,5,9,6,9,11,4,7,9,7,11,9,-1,-1,-1,-1],
    [10,4,9,6,4,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,10,6,4,9,10,0,8,3,-1,-1,-1,-1,-1,-1,-1],
    [10,0,1,10,6,0,6,4,0,-1,-1,-1,-1,-1,-1,-1],
    [8,3,1,8,1,6,8,6,4,6,1,10,-1,-1,-1,-1],
    [1,4,9,1,2,4,2,6,4,-1,-1,-1,-1,-1,-1,-1],
    [3,0,8,1,2,9,2,4,9,2,6,4,-1,-1,-1,-1],
    [0,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [8,3,2,8,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1],
    [10,4,9,10,6,4,11,2,3,-1,-1,-1,-1,-1,-1,-1],
    [0,8,2,2,8,11,4,9,10,4,10,6,-1,-1,-1,-1],
    [3,11,2,0,1,6,0,6,4,6,1,10,-1,-1,-1,-1],
    [6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1],
    [9,6,4,9,3,6,9,1,3,11,6,3,-1,-1,-1,-1],
    [8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1],
    [3,11,6,3,6,0,0,6,4,-1,-1,-1,-1,-1,-1,-1],
    [6,4,8,11,6,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [7,10,6,7,8,10,8,9,10,-1,-1,-1,-1,-1,-1,-1],
    [0,7,3,0,10,7,0,9,10,6,7,10,-1,-1,-1,-1],
    [10,6,7,1,10,7,1,7,8,1,8,0,-1,-1,-1,-1],
    [10,6,7,10,7,1,1,7,3,-1,-1,-1,-1,-1,-1,-1],
    [1,2,6,1,6,8,1,8,9,8,6,7,-1,-1,-1,-1],
    [2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1],
    [7,8,0,7,0,6,6,0,2,-1,-1,-1,-1,-1,-1,-1],
    [7,3,2,6,7,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [2,3,11,10,6,8,10,8,9,8,6,7,-1,-1,-1,-1],
    [2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1],
    [1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1],
    [11,2,1,11,1,7,10,6,1,6,7,1,-1,-1,-1,-1],
    [8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1],
    [0,9,1,11,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [7,8,0,7,0,6,3,11,0,11,6,0,-1,-1,-1,-1],
    [7,11,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [3,0,8,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,1,9,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [8,1,9,8,3,1,11,7,6,-1,-1,-1,-1,-1,-1,-1],
    [10,1,2,6,11,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,2,10,3,0,8,6,11,7,-1,-1,-1,-1,-1,-1,-1],
    [2,9,0,2,10,9,6,11,7,-1,-1,-1,-1,-1,-1,-1],
    [6,11,7,2,10,3,10,8,3,10,9,8,-1,-1,-1,-1],
    [7,2,3,6,2,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [7,0,8,7,6,0,6,2,0,-1,-1,-1,-1,-1,-1,-1],
    [2,7,6,2,3,7,0,1,9,-1,-1,-1,-1,-1,-1,-1],
    [1,6,2,1,8,6,1,9,8,8,7,6,-1,-1,-1,-1],
    [10,7,6,10,1,7,1,3,7,-1,-1,-1,-1,-1,-1,-1],
    [10,7,6,1,7,10,1,8,7,1,0,8,-1,-1,-1,-1],
    [0,3,7,0,7,10,0,10,9,6,10,7,-1,-1,-1,-1],
    [7,6,10,7,10,8,8,10,9,-1,-1,-1,-1,-1,-1,-1],
    [6,8,4,11,8,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [3,6,11,3,0,6,0,4,6,-1,-1,-1,-1,-1,-1,-1],
    [8,6,11,8,4,6,9,0,1,-1,-1,-1,-1,-1,-1,-1],
    [9,4,6,9,6,3,9,3,1,11,3,6,-1,-1,-1,-1],
    [6,8,4,6,11,8,2,10,1,-1,-1,-1,-1,-1,-1,-1],
    [1,2,10,3,0,11,0,6,11,0,4,6,-1,-1,-1,-1],
    [4,11,8,4,6,11,0,2,9,2,10,9,-1,-1,-1,-1],
    [10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1],
    [8,2,3,8,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1],
    [0,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,9,0,2,3,4,2,4,6,4,3,8,-1,-1,-1,-1],
    [1,9,4,1,4,2,2,4,6,-1,-1,-1,-1,-1,-1,-1],
    [8,1,3,8,6,1,8,4,6,6,10,1,-1,-1,-1,-1],
    [10,1,0,10,0,6,6,0,4,-1,-1,-1,-1,-1,-1,-1],
    [4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1],
    [10,9,4,6,10,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,9,5,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,8,3,4,9,5,11,7,6,-1,-1,-1,-1,-1,-1,-1],
    [5,0,1,5,4,0,7,6,11,-1,-1,-1,-1,-1,-1,-1],
    [11,7,6,8,3,4,3,5,4,3,1,5,-1,-1,-1,-1],
    [9,5,4,10,1,2,7,6,11,-1,-1,-1,-1,-1,-1,-1],
    [6,11,7,1,2,10,0,8,3,4,9,5,-1,-1,-1,-1],
    [7,6,11,5,4,10,4,2,10,4,0,2,-1,-1,-1,-1],
    [3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1],
    [7,2,3,7,6,2,5,4,9,-1,-1,-1,-1,-1,-1,-1],
    [9,5,4,0,8,6,0,6,2,6,8,7,-1,-1,-1,-1],
    [3,6,2,3,7,6,1,5,0,5,4,0,-1,-1,-1,-1],
    [6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1],
    [9,5,4,10,1,6,1,7,6,1,3,7,-1,-1,-1,-1],
    [1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1],
    [4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1],
    [7,6,10,7,10,8,5,4,10,4,8,10,-1,-1,-1,-1],
    [6,9,5,6,11,9,11,8,9,-1,-1,-1,-1,-1,-1,-1],
    [3,6,11,0,6,3,0,5,6,0,9,5,-1,-1,-1,-1],
    [0,11,8,0,5,11,0,1,5,5,6,11,-1,-1,-1,-1],
    [6,11,3,6,3,5,5,3,1,-1,-1,-1,-1,-1,-1,-1],
    [1,2,10,9,5,11,9,11,8,11,5,6,-1,-1,-1,-1],
    [0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1],
    [11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1],
    [6,11,3,6,3,5,2,10,3,10,5,3,-1,-1,-1,-1],
    [5,8,9,5,2,8,5,6,2,3,8,2,-1,-1,-1,-1],
    [9,5,6,9,6,0,0,6,2,-1,-1,-1,-1,-1,-1,-1],
    [1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1],
    [1,5,6,2,1,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1],
    [10,1,0,10,0,6,9,5,0,5,6,0,-1,-1,-1,-1],
    [0,3,8,5,6,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [10,5,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [11,5,10,7,5,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [11,5,10,11,7,5,8,3,0,-1,-1,-1,-1,-1,-1,-1],
    [5,11,7,5,10,11,1,9,0,-1,-1,-1,-1,-1,-1,-1],
    [10,7,5,10,11,7,9,8,1,8,3,1,-1,-1,-1,-1],
    [11,1,2,11,7,1,7,5,1,-1,-1,-1,-1,-1,-1,-1],
    [0,8,3,1,2,7,1,7,5,7,2,11,-1,-1,-1,-1],
    [9,7,5,9,2,7,9,0,2,2,11,7,-1,-1,-1,-1],
    [7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1],
    [2,5,10,2,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1],
    [8,2,0,8,5,2,8,7,5,10,2,5,-1,-1,-1,-1],
    [9,0,1,5,10,3,5,3,7,3,10,2,-1,-1,-1,-1],
    [9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1],
    [1,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,8,7,0,7,1,1,7,5,-1,-1,-1,-1,-1,-1,-1],
    [9,0,3,9,3,5,5,3,7,-1,-1,-1,-1,-1,-1,-1],
    [9,8,7,5,9,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [5,8,4,5,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1],
    [5,0,4,5,11,0,5,10,11,11,3,0,-1,-1,-1,-1],
    [0,1,9,8,4,10,8,10,11,10,4,5,-1,-1,-1,-1],
    [10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1],
    [2,5,1,2,8,5,2,11,8,4,5,8,-1,-1,-1,-1],
    [0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1],
    [0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1],
    [9,4,5,2,11,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [2,5,10,3,5,2,3,4,5,3,8,4,-1,-1,-1,-1],
    [5,10,2,5,2,4,4,2,0,-1,-1,-1,-1,-1,-1,-1],
    [3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1],
    [5,10,2,5,2,4,1,9,2,9,4,2,-1,-1,-1,-1],
    [8,4,5,8,5,3,3,5,1,-1,-1,-1,-1,-1,-1,-1],
    [0,4,5,1,0,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [8,4,5,8,5,3,9,0,5,0,3,5,-1,-1,-1,-1],
    [9,4,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,11,7,4,9,11,9,10,11,-1,-1,-1,-1,-1,-1,-1],
    [0,8,3,4,9,7,9,11,7,9,10,11,-1,-1,-1,-1],
    [1,10,11,1,11,4,1,4,0,7,4,11,-1,-1,-1,-1],
    [3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1],
    [4,11,7,9,11,4,9,2,11,9,1,2,-1,-1,-1,-1],
    [9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1],
    [11,7,4,11,4,2,2,4,0,-1,-1,-1,-1,-1,-1,-1],
    [11,7,4,11,4,2,8,3,4,3,2,4,-1,-1,-1,-1],
    [2,9,10,2,7,9,2,3,7,7,4,9,-1,-1,-1,-1],
    [9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1],
    [3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1],
    [1,10,2,8,7,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,9,1,4,1,7,7,1,3,-1,-1,-1,-1,-1,-1,-1],
    [4,9,1,4,1,7,0,8,1,8,7,1,-1,-1,-1,-1],
    [4,0,3,7,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [4,8,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [9,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [3,0,9,3,9,11,11,9,10,-1,-1,-1,-1,-1,-1,-1],
    [0,1,10,0,10,8,8,10,11,-1,-1,-1,-1,-1,-1,-1],
    [3,1,10,11,3,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,2,11,1,11,9,9,11,8,-1,-1,-1,-1,-1,-1,-1],
    [3,0,9,3,9,11,1,2,9,2,11,9,-1,-1,-1,-1],
    [0,2,11,8,0,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [3,2,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [2,3,8,2,8,10,10,8,9,-1,-1,-1,-1,-1,-1,-1],
    [9,10,2,0,9,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [2,3,8,2,8,10,0,1,8,1,10,8,-1,-1,-1,-1],
    [1,10,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [1,3,8,9,1,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,9,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [0,3,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cube::{CubeFile, CubeHeader};

    fn fixture_cube() -> CubeFile {
        let dims = [3, 3, 3];
        let mut data = Vec::new();
        for x in 0..dims[0] {
            for y in 0..dims[1] {
                for z in 0..dims[2] {
                    data.push(x as f32 + y as f32 + z as f32 - 2.75);
                }
            }
        }
        CubeFile {
            header: CubeHeader {
                comment1: "behavior fixture".into(),
                comment2: "marching cubes".into(),
                n_atoms: 0,
                origin: [0.25, -0.5, 1.0],
                dims,
                voxel_axes: [[0.5, 0.0, 0.0], [0.0, 0.75, 0.0], [0.0, 0.0, 1.25]],
                atoms: Vec::new(),
            },
            data,
            data_min: -2.75,
            data_max: 3.25,
        }
    }

    fn hash_mesh(mesh: &Mesh) -> u64 {
        let mut hash = 0xcbf29ce484222325u64;
        for bits in mesh
            .positions
            .iter()
            .chain(&mesh.normals)
            .map(|value| value.to_bits())
            .chain(mesh.indices.iter().copied())
        {
            hash ^= bits as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    }

    #[test]
    fn frozen_isosurface_geometry_order_and_normals() {
        let mut mesh = extract_isosurface(&fixture_cube(), 0.0);
        normalize_normals(&mut mesh);
        assert_eq!(mesh.vertex_count(), 15);
        assert_eq!(mesh.triangle_count(), 16);
        assert_eq!(hash_mesh(&mesh), 4_958_029_446_315_945_367);
    }

    #[test]
    fn skew_anisotropic_axes_use_the_cartesian_covector_transform() {
        let axes = [[2.0, 0.0, 0.0], [1.0, 3.0, 0.0], [0.5, 0.25, 4.0]];
        let transform = compute_inv_transpose(&axes);
        let grid_gradient = [-1.0, 0.0, 0.0];
        let cart_gradient = [
            transform[0][0] * grid_gradient[0]
                + transform[0][1] * grid_gradient[1]
                + transform[0][2] * grid_gradient[2],
            transform[1][0] * grid_gradient[0]
                + transform[1][1] * grid_gradient[1]
                + transform[1][2] * grid_gradient[2],
            transform[2][0] * grid_gradient[0]
                + transform[2][1] * grid_gradient[1]
                + transform[2][2] * grid_gradient[2],
        ];

        // A grid-x isosurface is spanned by Cartesian voxel axes y and z.
        for tangent in [&axes[1], &axes[2]] {
            let dot = cart_gradient[0] * tangent[0]
                + cart_gradient[1] * tangent[1]
                + cart_gradient[2] * tangent[2];
            assert!(
                dot.abs() < 1e-12,
                "normal must be orthogonal to {tangent:?}"
            );
        }
    }

    #[test]
    fn real_cube_matches_browser_topology_baseline() {
        let fixture =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/test.cube");
        let bytes = std::fs::read(fixture).unwrap();
        let cube = CubeFile::parse_bytes(&bytes).unwrap();
        let positive = extract_isosurface(&cube, 0.05);
        let negative = extract_isosurface(&cube, -0.05);

        assert_eq!(
            (positive.vertex_count(), positive.triangle_count()),
            (570, 1136)
        );
        assert_eq!(
            (negative.vertex_count(), negative.triangle_count()),
            (570, 1136)
        );
        for mesh in [&positive, &negative] {
            assert!(mesh
                .positions
                .iter()
                .chain(&mesh.normals)
                .all(|value| value.is_finite()));
            assert!(mesh
                .indices
                .iter()
                .all(|index| (*index as usize) < mesh.vertex_count()));
        }
    }
}
