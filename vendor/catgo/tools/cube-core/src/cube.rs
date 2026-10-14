//! Gaussian cube file parser
//!
//! Format:
//!   Line 1: Comment
//!   Line 2: Comment
//!   Line 3: N_atoms  origin_x  origin_y  origin_z
//!   Line 4: N1  dv1_x  dv1_y  dv1_z   (voxel count + step vector for axis 1)
//!   Line 5: N2  dv2_x  dv2_y  dv2_z
//!   Line 6: N3  dv3_x  dv3_y  dv3_z
//!   Lines 7..7+N_atoms: Z  charge  x  y  z  (atom info)
//!   Remaining: volumetric data (N1*N2*N3 values, 6 per line)
//!
//! Coordinates are in Bohr (1 Bohr = 0.529177 Å)

use anyhow::{Context, Result};
#[cfg(feature = "parallel")]
use rayon::prelude::*;
use serde::Serialize;
use std::io::{BufRead, BufReader, Read};

pub const BOHR_TO_ANGSTROM: f64 = 0.529177210903;

#[cfg(feature = "parallel")]
const MIN_PARALLEL_CHUNK_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct Atom {
    pub atomic_number: i32,
    pub charge: f64,
    /// Position in Angstroms
    pub position: [f64; 3],
}

#[derive(Debug, Clone, Serialize)]
pub struct CubeHeader {
    pub comment1: String,
    pub comment2: String,
    pub n_atoms: usize,
    /// Origin in Angstroms
    pub origin: [f64; 3],
    /// Grid dimensions [nx, ny, nz]
    pub dims: [usize; 3],
    /// Voxel step vectors in Angstroms (3x3 matrix, row-major)
    pub voxel_axes: [[f64; 3]; 3],
    pub atoms: Vec<Atom>,
}

#[derive(Debug, Clone)]
pub struct CubeFile {
    pub header: CubeHeader,
    /// Volumetric data: flat array of shape [nx][ny][nz] in row-major order
    pub data: Vec<f32>,
    pub data_min: f32,
    pub data_max: f32,
}

impl CubeFile {
    /// Parse a cube file from a reader (supports streaming for large files)
    pub fn parse<R: Read>(reader: R) -> Result<Self> {
        let mut buf = BufReader::with_capacity(1 << 20, reader); // 1MB buffer
        let mut line = String::new();

        // Line 1-2: Comments
        buf.read_line(&mut line)?;
        let comment1 = line.trim().to_string();
        line.clear();
        buf.read_line(&mut line)?;
        let comment2 = line.trim().to_string();
        line.clear();

        // Line 3: N_atoms, origin
        // If N_atoms < 0, coordinates are already in Angstroms
        buf.read_line(&mut line)?;
        let parts: Vec<&str> = line.split_whitespace().collect();
        let n_atoms = parts[0].parse::<i32>().context("parsing n_atoms")?;
        let n_atoms_abs = n_atoms.unsigned_abs() as usize;
        let is_angstrom = n_atoms < 0;
        let scale = if is_angstrom { 1.0 } else { BOHR_TO_ANGSTROM };
        let origin = [
            parts[1].parse::<f64>()? * scale,
            parts[2].parse::<f64>()? * scale,
            parts[3].parse::<f64>()? * scale,
        ];
        line.clear();

        // Lines 4-6: Grid dimensions and step vectors
        let mut dims = [0usize; 3];
        let mut voxel_axes = [[0.0f64; 3]; 3];
        for i in 0..3 {
            buf.read_line(&mut line)?;
            let parts: Vec<&str> = line.split_whitespace().collect();
            dims[i] = parts[0].parse::<usize>().context("parsing grid dim")?;
            voxel_axes[i] = [
                parts[1].parse::<f64>()? * scale,
                parts[2].parse::<f64>()? * scale,
                parts[3].parse::<f64>()? * scale,
            ];
            line.clear();
        }

        // Lines 7..7+N_atoms: Atom data
        let mut atoms = Vec::with_capacity(n_atoms_abs);
        for _ in 0..n_atoms_abs {
            buf.read_line(&mut line)?;
            let parts: Vec<&str> = line.split_whitespace().collect();
            atoms.push(Atom {
                atomic_number: parts[0].parse()?,
                charge: parts[1].parse()?,
                position: [
                    parts[2].parse::<f64>()? * scale,
                    parts[3].parse::<f64>()? * scale,
                    parts[4].parse::<f64>()? * scale,
                ],
            });
            line.clear();
        }

        let header = CubeHeader {
            comment1,
            comment2,
            n_atoms: n_atoms_abs,
            origin,
            dims,
            voxel_axes,
            atoms,
        };

        // Volumetric data
        let total_voxels = dims[0] * dims[1] * dims[2];
        let mut data = Vec::with_capacity(total_voxels);
        let mut data_min = f32::MAX;
        let mut data_max = f32::MIN;

        // Read all remaining lines and parse float values
        for line_result in buf.lines() {
            let l = line_result?;
            for token in l.split_whitespace() {
                if data.len() >= total_voxels {
                    break;
                }
                let val: f32 = token.parse().context("parsing volumetric value")?;
                if val < data_min {
                    data_min = val;
                }
                if val > data_max {
                    data_max = val;
                }
                data.push(val);
            }
            if data.len() >= total_voxels {
                break;
            }
        }

        if data.len() != total_voxels {
            anyhow::bail!("Expected {} voxels but got {}", total_voxels, data.len());
        }

        Ok(CubeFile {
            header,
            data,
            data_min,
            data_max,
        })
    }

    /// Parse a complete Cube byte buffer.
    ///
    /// The `parallel` feature partitions volumetric tokens across Rayon while
    /// preserving source order. The `scalar` feature performs the same parse
    /// sequentially and is suitable for a WASM Worker.
    pub fn parse_bytes(bytes: &[u8]) -> Result<Self> {
        let (header, header_end) = parse_header_bytes(bytes)?;
        let dims = header.dims;
        let total_voxels = dims[0] * dims[1] * dims[2];
        let (data, data_min, data_max) = parse_voxels(&bytes[header_end..], total_voxels)?;

        Ok(CubeFile {
            header,
            data,
            data_min,
            data_max,
        })
    }

    /// Get voxel value at grid indices (ix, iy, iz)
    #[inline]
    pub fn get(&self, ix: usize, iy: usize, iz: usize) -> f32 {
        let [_, ny, nz] = self.header.dims;
        self.data[ix * ny * nz + iy * nz + iz]
    }

    /// Convert grid indices to Cartesian coordinates (Angstroms)
    #[inline]
    pub fn grid_to_cart(&self, ix: f64, iy: f64, iz: f64) -> [f64; 3] {
        let o = &self.header.origin;
        let v = &self.header.voxel_axes;
        [
            o[0] + ix * v[0][0] + iy * v[1][0] + iz * v[2][0],
            o[1] + ix * v[0][1] + iy * v[1][1] + iz * v[2][1],
            o[2] + ix * v[0][2] + iy * v[1][2] + iz * v[2][2],
        ]
    }
}

fn parse_header_bytes(bytes: &[u8]) -> Result<(CubeHeader, usize)> {
    let mut offset = 0usize;
    let comment1 = next_cube_line(bytes, &mut offset)?.trim().to_string();
    let comment2 = next_cube_line(bytes, &mut offset)?.trim().to_string();

    let atom_line = next_cube_line(bytes, &mut offset)?;
    let mut atom_fields = atom_line.split_whitespace();
    let n_atoms = atom_fields
        .next()
        .context("missing n_atoms")?
        .parse::<i32>()
        .context("parsing n_atoms")?;
    let n_atoms_abs = n_atoms.unsigned_abs() as usize;
    let scale = if n_atoms < 0 { 1.0 } else { BOHR_TO_ANGSTROM };
    let origin = [
        next_f64(&mut atom_fields, "origin x")? * scale,
        next_f64(&mut atom_fields, "origin y")? * scale,
        next_f64(&mut atom_fields, "origin z")? * scale,
    ];

    let mut dims = [0usize; 3];
    let mut voxel_axes = [[0.0f64; 3]; 3];
    for axis in 0..3 {
        let line = next_cube_line(bytes, &mut offset)?;
        let mut fields = line.split_whitespace();
        dims[axis] = fields
            .next()
            .context("missing grid dim")?
            .parse::<usize>()
            .context("parsing grid dim")?;
        voxel_axes[axis] = [
            next_f64(&mut fields, "voxel axis x")? * scale,
            next_f64(&mut fields, "voxel axis y")? * scale,
            next_f64(&mut fields, "voxel axis z")? * scale,
        ];
    }

    let mut atoms = Vec::with_capacity(n_atoms_abs);
    for _ in 0..n_atoms_abs {
        let line = next_cube_line(bytes, &mut offset)?;
        let mut fields = line.split_whitespace();
        atoms.push(Atom {
            atomic_number: fields.next().context("missing atomic number")?.parse()?,
            charge: next_f64(&mut fields, "atomic charge")?,
            position: [
                next_f64(&mut fields, "atom x")? * scale,
                next_f64(&mut fields, "atom y")? * scale,
                next_f64(&mut fields, "atom z")? * scale,
            ],
        });
    }

    Ok((
        CubeHeader {
            comment1,
            comment2,
            n_atoms: n_atoms_abs,
            origin,
            dims,
            voxel_axes,
            atoms,
        },
        offset,
    ))
}

fn next_cube_line<'a>(bytes: &'a [u8], offset: &mut usize) -> Result<&'a str> {
    if *offset >= bytes.len() {
        anyhow::bail!("Unexpected EOF while reading Cube header");
    }
    let remaining = &bytes[*offset..];
    let line_len = remaining
        .iter()
        .position(|byte| *byte == b'\n')
        .map_or(remaining.len(), |index| index + 1);
    let end = *offset + line_len;
    let line = std::str::from_utf8(&bytes[*offset..end]).context("reading Cube header as UTF-8")?;
    *offset = end;
    Ok(line)
}

fn next_f64<'a>(fields: &mut impl Iterator<Item = &'a str>, name: &str) -> Result<f64> {
    fields
        .next()
        .with_context(|| format!("missing {name}"))?
        .parse::<f64>()
        .with_context(|| format!("parsing {name}"))
}

#[derive(Debug)]
struct ParsedChunk {
    values: Vec<f32>,
    min: f32,
    max: f32,
}

fn parse_voxels(bytes: &[u8], total_voxels: usize) -> Result<(Vec<f32>, f32, f32)> {
    #[cfg(feature = "parallel")]
    {
        parse_voxels_parallel(bytes, total_voxels)
    }
    #[cfg(feature = "scalar")]
    {
        parse_voxels_scalar(bytes, total_voxels)
    }
}

#[cfg(feature = "parallel")]
fn parse_voxels_parallel(bytes: &[u8], total_voxels: usize) -> Result<(Vec<f32>, f32, f32)> {
    if total_voxels == 0 {
        return Ok((Vec::new(), f32::MAX, f32::MIN));
    }

    // Match the streaming parser: only the first expected values matter, so a
    // malformed token after the complete grid remains ignored.
    let parse_end = ascii_token_prefix_end(bytes, total_voxels);
    let prefix = &bytes[..parse_end];
    let text = std::str::from_utf8(prefix).context("reading volumetric data as UTF-8")?;
    let ranges = ascii_whitespace_chunk_ranges(prefix);

    // Resolve results in file order so Rayon scheduling cannot change which
    // parse error is reported first.
    let parsed_results: Vec<Result<ParsedChunk>> = ranges
        .par_iter()
        .map(|&(start, end)| parse_ascii_chunk(&text[start..end]))
        .collect();

    let mut data = Vec::with_capacity(total_voxels);
    let mut data_min = f32::MAX;
    let mut data_max = f32::MIN;
    for result in parsed_results {
        let chunk = result?;
        if chunk.min < data_min {
            data_min = chunk.min;
        }
        if chunk.max > data_max {
            data_max = chunk.max;
        }
        data.extend(chunk.values);
    }

    if data.len() != total_voxels {
        anyhow::bail!("Expected {} voxels but got {}", total_voxels, data.len());
    }
    Ok((data, data_min, data_max))
}

#[cfg(feature = "scalar")]
fn parse_voxels_scalar(bytes: &[u8], total_voxels: usize) -> Result<(Vec<f32>, f32, f32)> {
    if total_voxels == 0 {
        return Ok((Vec::new(), f32::MAX, f32::MIN));
    }

    let parse_end = ascii_token_prefix_end(bytes, total_voxels);
    let text =
        std::str::from_utf8(&bytes[..parse_end]).context("reading volumetric data as UTF-8")?;
    let chunk = parse_ascii_chunk(text)?;
    if chunk.values.len() != total_voxels {
        anyhow::bail!(
            "Expected {} voxels but got {}",
            total_voxels,
            chunk.values.len()
        );
    }
    Ok((chunk.values, chunk.min, chunk.max))
}

fn parse_ascii_chunk(text: &str) -> Result<ParsedChunk> {
    let mut values = Vec::new();
    let mut min = f32::MAX;
    let mut max = f32::MIN;
    for token in text.split_ascii_whitespace() {
        let value: f32 = token.parse().context("parsing volumetric value")?;
        if value < min {
            min = value;
        }
        if value > max {
            max = value;
        }
        values.push(value);
    }
    Ok(ParsedChunk { values, min, max })
}

fn ascii_token_prefix_end(bytes: &[u8], wanted: usize) -> usize {
    let mut in_token = false;
    let mut count = 0usize;
    for (index, byte) in bytes.iter().enumerate() {
        if byte.is_ascii_whitespace() {
            if in_token {
                count += 1;
                in_token = false;
                if count == wanted {
                    return index;
                }
            }
        } else {
            in_token = true;
        }
    }
    bytes.len()
}

#[cfg(feature = "parallel")]
fn ascii_whitespace_chunk_ranges(bytes: &[u8]) -> Vec<(usize, usize)> {
    if bytes.is_empty() {
        return Vec::new();
    }

    let target_chunks = rayon::current_num_threads().max(1) * 4;
    let chunk_size = (bytes.len() / target_chunks).max(MIN_PARALLEL_CHUNK_BYTES);
    let mut ranges = Vec::new();
    let mut start = 0usize;
    while start < bytes.len() {
        let mut end = (start + chunk_size).min(bytes.len());
        while end < bytes.len() && !bytes[end].is_ascii_whitespace() {
            end += 1;
        }
        ranges.push((start, end));
        start = end;
    }
    ranges
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    const HEADER: &str = "Comment 1\nComment 2\n  1   0.000000   0.000000   0.000000\n  2   1.000000   0.000000   0.000000\n  2   0.000000   1.000000   0.000000\n  2   0.000000   0.000000   1.000000\n  6   6.000000   0.000000   0.000000   0.000000\n";

    fn cube_text(values: &str) -> String {
        format!("{HEADER}{values}\n")
    }

    fn assert_equivalent(left: &CubeFile, right: &CubeFile) {
        assert_eq!(left.header.comment1, right.header.comment1);
        assert_eq!(left.header.comment2, right.header.comment2);
        assert_eq!(left.header.n_atoms, right.header.n_atoms);
        assert_eq!(left.header.dims, right.header.dims);
        assert_eq!(left.header.origin, right.header.origin);
        assert_eq!(left.header.voxel_axes, right.header.voxel_axes);
        assert_eq!(left.header.atoms.len(), right.header.atoms.len());
        for (left_atom, right_atom) in left.header.atoms.iter().zip(&right.header.atoms) {
            assert_eq!(left_atom.atomic_number, right_atom.atomic_number);
            assert_eq!(left_atom.charge, right_atom.charge);
            assert_eq!(left_atom.position, right_atom.position);
        }
        assert_eq!(left.data_min.to_bits(), right.data_min.to_bits());
        assert_eq!(left.data_max.to_bits(), right.data_max.to_bits());
        assert_eq!(
            left.data
                .iter()
                .map(|value| value.to_bits())
                .collect::<Vec<_>>(),
            right
                .data
                .iter()
                .map(|value| value.to_bits())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_parse_minimal() {
        let cube_text = "\
Comment 1
Comment 2
  1   0.000000   0.000000   0.000000
  2   1.000000   0.000000   0.000000
  2   0.000000   1.000000   0.000000
  2   0.000000   0.000000   1.000000
  6   6.000000   0.000000   0.000000   0.000000
 1.0 2.0 3.0 4.0 5.0 6.0
 7.0 8.0
";
        let cube = CubeFile::parse(Cursor::new(cube_text)).unwrap();
        assert_eq!(cube.header.dims, [2, 2, 2]);
        assert_eq!(cube.header.n_atoms, 1);
        assert_eq!(cube.data.len(), 8);
        assert!((cube.data[0] - 1.0).abs() < 1e-6);
        assert!((cube.data[7] - 8.0).abs() < 1e-6);
    }

    #[test]
    fn mapped_parser_matches_streaming_order_range_and_trailing_behavior() {
        let text = cube_text("-0.0 1e-4 -2.5 7 4.25 9.5 -8 3 invalid-trailing-token");
        let streaming = CubeFile::parse(Cursor::new(text.as_bytes())).unwrap();
        let mapped = CubeFile::parse_bytes(text.as_bytes()).unwrap();
        assert_equivalent(&streaming, &mapped);
    }

    #[test]
    fn mapped_parallel_chunks_match_streaming_value_order() {
        const VALUE_COUNT: usize = 100_000;
        let mut text = format!(
            "Large parallel fixture\nGenerated\n  0 0 0 0\n  1 1 0 0\n  1 0 1 0\n  {VALUE_COUNT} 0 0 1\n"
        );
        for index in 0..VALUE_COUNT {
            text.push_str(&format!(
                "{}{}",
                index,
                if index % 6 == 5 { '\n' } else { ' ' }
            ));
        }

        #[cfg(feature = "parallel")]
        assert!(text.len() > MIN_PARALLEL_CHUNK_BYTES * 2);
        let streaming = CubeFile::parse(Cursor::new(text.as_bytes())).unwrap();
        let mapped = CubeFile::parse_bytes(text.as_bytes()).unwrap();
        assert_equivalent(&streaming, &mapped);
    }

    #[test]
    fn mapped_parser_matches_streaming_truncation_error() {
        let text = cube_text("1 2 3 4 5 6 7");
        let streaming_error = CubeFile::parse(Cursor::new(text.as_bytes()))
            .unwrap_err()
            .to_string();
        let mapped_error = CubeFile::parse_bytes(text.as_bytes())
            .unwrap_err()
            .to_string();
        assert_eq!(streaming_error, "Expected 8 voxels but got 7");
        assert_eq!(mapped_error, streaming_error);
    }

    #[test]
    fn mapped_parser_matches_streaming_value_error() {
        let text = cube_text("1 2 3 broken 5 6 7 8");
        let streaming_error = CubeFile::parse(Cursor::new(text.as_bytes()))
            .unwrap_err()
            .to_string();
        let mapped_error = CubeFile::parse_bytes(text.as_bytes())
            .unwrap_err()
            .to_string();
        assert_eq!(streaming_error, "parsing volumetric value");
        assert_eq!(mapped_error, streaming_error);
    }
}
