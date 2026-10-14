//! Worker-friendly WASM bindings for Gaussian Cube parsing and isosurfaces.
//!
//! The scalar and threaded ferrox artifacts expose the same JavaScript API.
//! Their only behavioral difference is selected at compile time: scalar uses
//! the serial `cube-core` path, while threaded uses its Rayon path after the
//! caller awaits ferrox's exported `initThreadPool` function.

use cube_core::cube::{CubeFile, CubeHeader};
use cube_core::marching_cubes::{Mesh, extract_isosurface};
use wasm_bindgen::prelude::*;

/// Parsed Cube volume retained in WASM memory for one or more extractions.
#[wasm_bindgen]
pub struct WasmCubeVolume {
    inner: CubeFile,
}

#[wasm_bindgen]
impl WasmCubeVolume {
    /// Parse a complete Cube byte buffer.
    ///
    /// JavaScript callers should transfer an `ArrayBuffer` into their Worker,
    /// then pass its `Uint8Array` view here.
    pub fn parse(bytes: &[u8]) -> Result<WasmCubeVolume, JsValue> {
        CubeFile::parse_bytes(bytes)
            .map(|inner| WasmCubeVolume { inner })
            .map_err(js_error)
    }

    /// Construct a volume from an already parsed browser grid.
    ///
    /// `voxel_axes` is a flattened row-major 3x3 matrix. This bridge preserves
    /// the existing public TypeScript extraction API without re-serializing a
    /// synthetic Cube file in the Worker.
    pub fn from_grid(
        data: &[f32],
        dims: &[u32],
        origin: &[f64],
        voxel_axes: &[f64],
        data_min: f32,
        data_max: f32,
    ) -> Result<WasmCubeVolume, JsValue> {
        let dims = dims3(dims)?;
        let expected = dims
            .into_iter()
            .try_fold(1usize, |product, dim| product.checked_mul(dim))
            .ok_or_else(|| js_message("Cube grid dimensions overflow"))?;
        if data.len() != expected {
            return Err(js_message(&format!(
                "Cube grid has {} values; dimensions require {expected}",
                data.len()
            )));
        }
        if origin.len() != 3 {
            return Err(js_message(&format!(
                "Cube origin must contain 3 values, got {}",
                origin.len()
            )));
        }
        if voxel_axes.len() != 9 {
            return Err(js_message(&format!(
                "Cube voxel axes must contain 9 values, got {}",
                voxel_axes.len()
            )));
        }
        if !data_min.is_finite() || !data_max.is_finite() || data_min > data_max {
            return Err(js_message("Cube data range must be finite and ordered"));
        }

        let inner = CubeFile {
            header: CubeHeader {
                comment1: "CatGo VolumetricGrid".to_owned(),
                comment2: "Constructed in ferrox WASM".to_owned(),
                n_atoms: 0,
                origin: [origin[0], origin[1], origin[2]],
                dims,
                voxel_axes: [
                    [voxel_axes[0], voxel_axes[1], voxel_axes[2]],
                    [voxel_axes[3], voxel_axes[4], voxel_axes[5]],
                    [voxel_axes[6], voxel_axes[7], voxel_axes[8]],
                ],
                atoms: Vec::new(),
            },
            data: data.to_vec(),
            data_min,
            data_max,
        };
        Ok(WasmCubeVolume { inner })
    }

    /// Serialize comments, atoms, origin, dimensions, and voxel axes as JSON.
    pub fn header_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.header).map_err(js_error)
    }

    /// Number of scalar samples in the volume.
    pub fn voxel_count(&self) -> usize {
        self.inner.data.len()
    }

    /// Minimum scalar value reported by the Cube parser.
    pub fn value_min(&self) -> f32 {
        self.inner.data_min
    }

    /// Maximum scalar value reported by the Cube parser.
    pub fn value_max(&self) -> f32 {
        self.inner.data_max
    }

    /// Copy scalar samples into a JavaScript `Float32Array`.
    ///
    /// This is deliberately non-destructive: the Rust-owned volume remains
    /// available for later isosurface extraction.
    pub fn copy_data(&self) -> Vec<f32> {
        self.inner.data.clone()
    }

    /// Compatibility alias for callers that name the returned array as a grid.
    pub fn copy_grid_data(&self) -> Vec<f32> {
        self.copy_data()
    }

    /// Extract one smoothed isosurface with normalized face-area normals.
    ///
    /// The threaded artifact automatically enters cube-core's Rayon path; the
    /// scalar artifact runs the same deterministic algorithm serially.
    pub fn extract(&self, isovalue: f32) -> Result<WasmCubeMesh, JsValue> {
        if !isovalue.is_finite() {
            return Err(js_message("Cube isovalue must be finite"));
        }
        if self.inner.header.dims.into_iter().any(|dim| dim < 2) {
            return Err(js_message(
                "Cube isosurface extraction requires every grid dimension to be at least 2",
            ));
        }

        // cube-core recomputes and normalizes face-area-weighted normals after
        // Taubin smoothing, so the worker can return its buffers directly.
        Ok(WasmCubeMesh::from(extract_isosurface(
            &self.inner,
            isovalue,
        )))
    }
}

/// Isosurface buffers returned by [`WasmCubeVolume::extract`].
///
/// Buffer getters are intentionally one-shot. Each `take_*` call transfers a
/// typed-array copy to JavaScript and releases the corresponding Rust buffer.
#[wasm_bindgen]
pub struct WasmCubeMesh {
    positions: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u32>,
    vertex_count: usize,
    triangle_count: usize,
}

impl From<Mesh> for WasmCubeMesh {
    fn from(mesh: Mesh) -> Self {
        let vertex_count = mesh.vertex_count();
        let triangle_count = mesh.triangle_count();
        Self {
            positions: mesh.positions,
            normals: mesh.normals,
            indices: mesh.indices,
            vertex_count,
            triangle_count,
        }
    }
}

#[wasm_bindgen]
impl WasmCubeMesh {
    /// Original vertex count, retained after buffers are taken.
    pub fn vertex_count(&self) -> usize {
        self.vertex_count
    }

    /// Original triangle count, retained after buffers are taken.
    pub fn triangle_count(&self) -> usize {
        self.triangle_count
    }

    /// Take vertex positions as a JavaScript `Float32Array`.
    pub fn take_positions(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.positions)
    }

    /// Take vertex normals as a JavaScript `Float32Array`.
    pub fn take_normals(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.normals)
    }

    /// Take triangle indices as a JavaScript `Uint32Array`.
    pub fn take_indices(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.indices)
    }
}

/// Compile-time Cube execution backend for diagnostics and integration tests.
#[wasm_bindgen]
pub fn cube_backend() -> String {
    #[cfg(feature = "wasm-threaded")]
    {
        "parallel".to_owned()
    }
    #[cfg(feature = "wasm-scalar")]
    {
        "scalar".to_owned()
    }
}

fn dims3(dims: &[u32]) -> Result<[usize; 3], JsValue> {
    if dims.len() != 3 {
        return Err(js_message(&format!(
            "Cube dimensions must contain 3 values, got {}",
            dims.len()
        )));
    }
    Ok([dims[0] as usize, dims[1] as usize, dims[2] as usize])
}

fn js_error(error: impl std::fmt::Display) -> JsValue {
    js_message(&error.to_string())
}

fn js_message(message: &str) -> JsValue {
    JsValue::from_str(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_bytes() -> Vec<u8> {
        let mut text = String::from(
            "WASM Cube fixture\n\
             Scalar and threaded parity\n\
             -0 0 0 0\n\
             3 0.5 0 0\n\
             3 0 0.5 0\n\
             3 0 0 0.5\n",
        );
        for x in 0..3 {
            for y in 0..3 {
                for z in 0..3 {
                    text.push_str(&format!("{} ", x as f32 + y as f32 + z as f32 - 2.75));
                }
            }
        }
        text.into_bytes()
    }

    #[test]
    fn parses_copies_and_extracts_with_one_shot_mesh_buffers() {
        #[cfg(feature = "wasm-scalar")]
        assert_eq!(cube_backend(), "scalar");
        #[cfg(feature = "wasm-threaded")]
        assert_eq!(cube_backend(), "parallel");

        let volume = WasmCubeVolume::parse(&fixture_bytes()).unwrap();
        assert_eq!(volume.voxel_count(), 27);
        assert_eq!(volume.copy_data(), volume.copy_grid_data());
        assert!(volume.header_json().unwrap().contains("WASM Cube fixture"));

        let mut mesh = volume.extract(0.0).unwrap();
        let vertex_count = mesh.vertex_count();
        let triangle_count = mesh.triangle_count();
        assert!(vertex_count > 0);
        assert!(triangle_count > 0);
        assert_eq!(mesh.take_positions().len(), vertex_count * 3);
        assert_eq!(mesh.take_normals().len(), vertex_count * 3);
        assert_eq!(mesh.take_indices().len(), triangle_count * 3);
        assert!(mesh.take_positions().is_empty());
        assert_eq!(mesh.vertex_count(), vertex_count);
        assert_eq!(mesh.triangle_count(), triangle_count);
    }

    #[test]
    fn constructs_from_browser_grid_without_consuming_data() {
        let parsed = CubeFile::parse_bytes(&fixture_bytes()).unwrap();
        let dims = parsed.header.dims.map(|value| value as u32);
        let axes: Vec<f64> = parsed.header.voxel_axes.into_iter().flatten().collect();
        let volume = WasmCubeVolume::from_grid(
            &parsed.data,
            &dims,
            &parsed.header.origin,
            &axes,
            parsed.data_min,
            parsed.data_max,
        )
        .unwrap();
        assert_eq!(volume.copy_data(), parsed.data);
        assert_eq!(volume.voxel_count(), 27);
        assert!(volume.extract(0.0).unwrap().triangle_count() > 0);
    }
}
