# RepoVista Distribution Downloads

## Latest Release: v1.0.0

### Download Options

#### Option 1: Direct Download
Due to file size limitations, the distribution package is not stored directly in Git.

**Package Details:**
- File: `repovista-v1.0.0.tar.gz`
- Size: 94MB
- SHA256: `c02e6fb4130440e54e7d165ddc0c6dc618166c3ba63040a4495984ded1405e9f`

#### Option 2: Build from Source
You can build the distribution package yourself:

```bash
# Clone the repository
git clone https://github.com/timberay/repovista.git
cd repovista

# Build distribution package
./build-dist.sh v1.0.0

# Package will be created in dist/
ls -la dist/repovista-v1.0.0.tar.gz
```

### Installation Instructions

Once you have the package:

```bash
# Extract the package
tar -xzf repovista-v1.0.0.tar.gz
cd repovista-v1.0.0

# Quick installation
./scripts/quick-install.sh

# Or manual installation
./scripts/deploy.sh install
cp config/.env.example config/.env
# Edit .env with your registry settings
./scripts/deploy.sh start
```

### Package Contents

The distribution package includes:
- Pre-built Docker images (backend: 74MB, frontend: 21MB)
- Deployment scripts (deploy.sh, health-check.sh, quick-install.sh)
- Configuration templates (.env.example, docker-compose.yml)
- Installation documentation (INSTALL.md)

### System Requirements

- Docker 20.10+ installed and running
- 2GB free disk space
- Access to a Docker Registry (v2 API)
- Ports 3033 and 8083 available (configurable)

### Support

For issues or questions:
- Check the installation guide in INSTALL.md (included in package)
- Review the main [README.md](../README.md)
- Open an issue on [GitHub](https://github.com/timberay/repovista/issues)