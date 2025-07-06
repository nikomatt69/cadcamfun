use anyhow::{anyhow, Result};
use directories::ProjectDirs;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tracing::{info, warn};
use zip::write::{FileOptions, ZipWriter};
use zip::{CompressionMethod, ZipArchive};

#[derive(Debug)]
pub struct FileManager {
    app_data_dir: PathBuf,
    projects_dir: PathBuf,
    exports_dir: PathBuf,
    temp_dir: PathBuf,
}

impl FileManager {
    pub fn new() -> Self {
        let (app_data_dir, projects_dir, exports_dir, temp_dir) = Self::setup_directories();

        Self {
            app_data_dir,
            projects_dir,
            exports_dir,
            temp_dir,
        }
    }

    /// Setup application directories
    fn setup_directories() -> (PathBuf, PathBuf, PathBuf, PathBuf) {
        let app_data_dir =
            if let Some(proj_dirs) = ProjectDirs::from("com", "cadcamfun", "cadcamfun") {
                proj_dirs.data_dir().to_path_buf()
            } else {
                // Fallback to current directory
                warn!("Failed to get project directories, using fallback");
                PathBuf::from("./cadcamfun-data")
            };

        let projects_dir = app_data_dir.join("projects");
        let exports_dir = app_data_dir.join("exports");
        let temp_dir = app_data_dir.join("temp");

        // Create directories if they don't exist
        for dir in [&app_data_dir, &projects_dir, &exports_dir, &temp_dir] {
            if let Err(e) = fs::create_dir_all(dir) {
                warn!("Failed to create directory {:?}: {}", dir, e);
            }
        }

        info!("Application directories initialized");
        info!("  App Data: {:?}", app_data_dir);
        info!("  Projects: {:?}", projects_dir);
        info!("  Exports: {:?}", exports_dir);
        info!("  Temp: {:?}", temp_dir);

        (app_data_dir, projects_dir, exports_dir, temp_dir)
    }

    /// Get app data directory
    pub fn get_app_data_dir(&self) -> &Path {
        &self.app_data_dir
    }

    /// Get projects directory
    pub fn get_projects_dir(&self) -> &Path {
        &self.projects_dir
    }

    /// Get exports directory
    pub fn get_exports_dir(&self) -> &Path {
        &self.exports_dir
    }

    /// Get temp directory
    pub fn get_temp_dir(&self) -> &Path {
        &self.temp_dir
    }

    /// Save a project to disk
    pub fn save_project(&self, project_id: &str, data: &str) -> Result<PathBuf> {
        let project_dir = self.projects_dir.join(project_id);
        fs::create_dir_all(&project_dir)
            .map_err(|e| anyhow!("Failed to create project directory: {}", e))?;

        let project_file = project_dir.join("project.json");
        fs::write(&project_file, data)
            .map_err(|e| anyhow!("Failed to save project file: {}", e))?;

        info!("Project saved to: {:?}", project_file);
        Ok(project_file)
    }

    /// Load a project from disk
    pub fn load_project(&self, project_id: &str) -> Result<String> {
        let project_file = self.projects_dir.join(project_id).join("project.json");

        if !project_file.exists() {
            return Err(anyhow!("Project file not found"));
        }

        let data = fs::read_to_string(&project_file)
            .map_err(|e| anyhow!("Failed to read project file: {}", e))?;

        info!("Project loaded from: {:?}", project_file);
        Ok(data)
    }

    /// Delete a project from disk
    pub fn delete_project(&self, project_id: &str) -> Result<()> {
        let project_dir = self.projects_dir.join(project_id);

        if project_dir.exists() {
            fs::remove_dir_all(&project_dir)
                .map_err(|e| anyhow!("Failed to delete project directory: {}", e))?;
            info!("Project deleted: {:?}", project_dir);
        }

        Ok(())
    }

    /// Save component data
    pub fn save_component(
        &self,
        project_id: &str,
        component_id: &str,
        data: &str,
    ) -> Result<PathBuf> {
        let project_dir = self.projects_dir.join(project_id);
        let components_dir = project_dir.join("components");
        fs::create_dir_all(&components_dir)
            .map_err(|e| anyhow!("Failed to create components directory: {}", e))?;

        let component_file = components_dir.join(format!("{}.json", component_id));
        fs::write(&component_file, data)
            .map_err(|e| anyhow!("Failed to save component file: {}", e))?;

        info!("Component saved to: {:?}", component_file);
        Ok(component_file)
    }

    /// Load component data
    pub fn load_component(&self, project_id: &str, component_id: &str) -> Result<String> {
        let component_file = self
            .projects_dir
            .join(project_id)
            .join("components")
            .join(format!("{}.json", component_id));

        if !component_file.exists() {
            return Err(anyhow!("Component file not found"));
        }

        let data = fs::read_to_string(&component_file)
            .map_err(|e| anyhow!("Failed to read component file: {}", e))?;

        info!("Component loaded from: {:?}", component_file);
        Ok(data)
    }

    /// Save G-code file
    pub fn save_gcode(&self, project_id: &str, toolpath_id: &str, gcode: &str) -> Result<PathBuf> {
        let project_dir = self.projects_dir.join(project_id);
        let gcode_dir = project_dir.join("gcode");
        fs::create_dir_all(&gcode_dir)
            .map_err(|e| anyhow!("Failed to create gcode directory: {}", e))?;

        let gcode_file = gcode_dir.join(format!("{}.gcode", toolpath_id));
        fs::write(&gcode_file, gcode).map_err(|e| anyhow!("Failed to save gcode file: {}", e))?;

        info!("G-code saved to: {:?}", gcode_file);
        Ok(gcode_file)
    }

    /// Load G-code file
    pub fn load_gcode(&self, project_id: &str, toolpath_id: &str) -> Result<String> {
        let gcode_file = self
            .projects_dir
            .join(project_id)
            .join("gcode")
            .join(format!("{}.gcode", toolpath_id));

        if !gcode_file.exists() {
            return Err(anyhow!("G-code file not found"));
        }

        let data = fs::read_to_string(&gcode_file)
            .map_err(|e| anyhow!("Failed to read gcode file: {}", e))?;

        info!("G-code loaded from: {:?}", gcode_file);
        Ok(data)
    }

    /// Export project as ZIP archive
    pub fn export_project_archive(&self, project_id: &str, include_gcode: bool) -> Result<PathBuf> {
        let project_dir = self.projects_dir.join(project_id);
        if !project_dir.exists() {
            return Err(anyhow!("Project directory not found"));
        }

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let archive_name = format!("{}_{}.zip", project_id, timestamp);
        let archive_path = self.exports_dir.join(&archive_name);

        let file = fs::File::create(&archive_path)
            .map_err(|e| anyhow!("Failed to create archive file: {}", e))?;

        let mut zip = ZipWriter::new(file);
        let options = FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);

        // Add project.json
        let project_file = project_dir.join("project.json");
        if project_file.exists() {
            let contents = fs::read(&project_file)
                .map_err(|e| anyhow!("Failed to read project file: {}", e))?;
            zip.start_file("project.json", options)
                .map_err(|e| anyhow!("Failed to start zip file: {}", e))?;
            zip.write_all(&contents)
                .map_err(|e| anyhow!("Failed to write to zip: {}", e))?;
        }

        // Add components
        let components_dir = project_dir.join("components");
        if components_dir.exists() {
            self.add_directory_to_zip(&mut zip, "components", &components_dir, options)?;
        }

        // Add G-code if requested
        if include_gcode {
            let gcode_dir = project_dir.join("gcode");
            if gcode_dir.exists() {
                self.add_directory_to_zip(&mut zip, "gcode", &gcode_dir, options)?;
            }
        }

        zip.finish()
            .map_err(|e| anyhow!("Failed to finish zip: {}", e))?;

        info!("Project archive exported to: {:?}", archive_path);
        Ok(archive_path)
    }

    /// Add directory to ZIP archive recursively
    fn add_directory_to_zip<W: Write + std::io::Seek>(
        &self,
        zip: &mut ZipWriter<W>,
        prefix: &str,
        dir: &Path,
        options: FileOptions<()>,
    ) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name();
            let zip_path = format!("{}/{}", prefix, name.to_string_lossy());

            if path.is_file() {
                let contents = fs::read(&path)?;
                zip.start_file(&zip_path, options)
                    .map_err(|e| anyhow!("Failed to start zip file: {}", e))?;
                zip.write_all(&contents)?;
            } else if path.is_dir() {
                self.add_directory_to_zip(zip, &zip_path, &path, options)?;
            }
        }

        Ok(())
    }

    /// Import project from ZIP archive
    pub fn import_project_archive(&self, archive_path: &Path, project_id: &str) -> Result<()> {
        let project_dir = self.projects_dir.join(project_id);
        fs::create_dir_all(&project_dir)
            .map_err(|e| anyhow!("Failed to create project directory: {}", e))?;

        let file = fs::File::open(archive_path)
            .map_err(|e| anyhow!("Failed to open archive file: {}", e))?;

        let mut archive =
            ZipArchive::new(file).map_err(|e| anyhow!("Failed to read archive: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| anyhow!("Failed to get file from archive: {}", e))?;

            let file_path = project_dir.join(file.mangled_name());

            if let Some(p) = file_path.parent() {
                if !p.exists() {
                    fs::create_dir_all(&p)
                        .map_err(|e| anyhow!("Failed to create directory: {}", e))?;
                }
            }

            if file.is_dir() {
                fs::create_dir_all(&file_path)
                    .map_err(|e| anyhow!("Failed to create directory from archive: {}", e))?;
            } else {
                let mut outfile = fs::File::create(&file_path)
                    .map_err(|e| anyhow!("Failed to create file from archive: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| anyhow!("Failed to copy file from archive: {}", e))?;
            }
        }

        info!("Project archive imported to: {:?}", project_dir);
        Ok(())
    }

    /// Clean up temporary files
    pub fn cleanup_temp_files(&self, max_age_hours: u64) -> Result<()> {
        let max_age = std::time::Duration::from_secs(max_age_hours * 3600);
        let now = std::time::SystemTime::now();

        let entries = fs::read_dir(&self.temp_dir)
            .map_err(|e| anyhow!("Failed to read temp directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| anyhow!("Failed to read temp entry: {}", e))?;
            let path = entry.path();

            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(age) = now.duration_since(modified) {
                        if age > max_age {
                            if path.is_file() {
                                let _ = fs::remove_file(&path);
                            } else if path.is_dir() {
                                let _ = fs::remove_dir_all(&path);
                            }
                        }
                    }
                }
            }
        }

        info!("Temporary files cleanup completed");
        Ok(())
    }

    /// Get project list from disk
    pub fn list_projects(&self) -> Result<Vec<String>> {
        let entries = fs::read_dir(&self.projects_dir)
            .map_err(|e| anyhow!("Failed to read projects directory: {}", e))?;

        let mut projects = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|e| anyhow!("Failed to read project entry: {}", e))?;
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    projects.push(name.to_string());
                }
            }
        }

        Ok(projects)
    }

    /// Generate unique temporary file path
    pub fn get_temp_file_path(&self, extension: &str) -> PathBuf {
        let filename = format!("{}.{}", uuid::Uuid::new_v4(), extension);
        self.temp_dir.join(filename)
    }

    /// Save file with unique name
    pub fn save_temp_file(&self, data: &[u8], extension: &str) -> Result<PathBuf> {
        let file_path = self.get_temp_file_path(extension);
        fs::write(&file_path, data).map_err(|e| anyhow!("Failed to save temp file: {}", e))?;

        info!("Temporary file saved: {:?}", file_path);
        Ok(file_path)
    }
}
