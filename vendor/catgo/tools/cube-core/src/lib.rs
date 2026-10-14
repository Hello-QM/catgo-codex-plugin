//! Platform-neutral Cube parsing and isosurface algorithms.
//!
//! Native consumers normally enable `parallel`; browser/WASM consumers can
//! select `scalar` and provide concurrency at the Worker level.

#[cfg(all(feature = "parallel", feature = "scalar"))]
compile_error!("cube-core features `parallel` and `scalar` are mutually exclusive");

#[cfg(not(any(feature = "parallel", feature = "scalar")))]
compile_error!("cube-core requires either the `parallel` or `scalar` feature");

pub mod cube;
pub mod marching_cubes;
