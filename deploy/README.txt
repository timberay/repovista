================================================================================
                        RepoVista - Docker Registry Web UI
                            Deployment Package v1.0.0
================================================================================

This package contains everything needed to deploy RepoVista on an intranet
server without internet access (offline installation).

================================================================================
PREREQUISITES
================================================================================

Before installation, ensure your server has:

1. Docker Engine (version 20.10 or higher)
   - Check: docker --version
   
2. Docker Compose (version 2.0 or higher)
   - Check: docker-compose --version
   OR
   - Check: docker compose version

3. Available ports:
   - Port 80 (or custom) for Web UI
   - Port 8000 (or custom) for API

4. Minimum system requirements:
   - RAM: 2GB
   - Disk: 5GB free space
   - CPU: 2 cores

================================================================================
QUICK INSTALLATION
================================================================================

1. Extract the package:
   tar -xzf repovista-deploy-v1.0.tar.gz

2. Enter the directory:
   cd repovista

3. Run the installer:
   ./scripts/install.sh

4. Follow the prompts to configure:
   - Docker Registry URL
   - Registry credentials (if needed)
   - Service ports

5. Access RepoVista:
   - Web UI: http://YOUR_SERVER_IP
   - API: http://YOUR_SERVER_IP:8000
   - API Docs: http://YOUR_SERVER_IP:8000/api/docs

================================================================================
PACKAGE CONTENTS
================================================================================

repovista/
├── images/                 # Pre-built Docker images
│   ├── repovista-backend.tar   # Backend API service
│   └── repovista-frontend.tar  # Frontend web interface
│
├── scripts/               # Management scripts
│   ├── install.sh        # One-step installer
│   ├── start.sh         # Start services
│   ├── stop.sh          # Stop services
│   ├── status.sh        # Check service status
│   ├── logs.sh          # View logs
│   └── uninstall.sh     # Uninstall RepoVista
│
├── config/               # Configuration files
│   ├── .env.template    # Environment variables template
│   └── nginx.conf       # Nginx configuration
│
├── docker-compose.yml    # Docker Compose configuration
└── README.txt           # This file

================================================================================
CONFIGURATION
================================================================================

The main configuration file is .env (created from .env.template during install).

Key settings:
- REGISTRY_URL: Your Docker Registry URL (e.g., http://registry.local:5000)
- REGISTRY_USERNAME: Registry username (optional)
- REGISTRY_PASSWORD: Registry password (optional)
- FRONTEND_PORT: Web UI port (default: 80)
- API_PORT: API port (default: 8000)

To modify settings after installation:
1. Edit .env file
2. Restart services: ./scripts/stop.sh && ./scripts/start.sh

================================================================================
MANAGEMENT COMMANDS
================================================================================

All management scripts are in the scripts/ directory:

Start services:
  ./scripts/start.sh

Stop services:
  ./scripts/stop.sh

Check status:
  ./scripts/status.sh

View logs (all services):
  ./scripts/logs.sh

View specific service logs:
  ./scripts/logs.sh backend
  ./scripts/logs.sh frontend

Follow logs in real-time:
  ./scripts/logs.sh -f

Uninstall RepoVista:
  ./scripts/uninstall.sh

================================================================================
TROUBLESHOOTING
================================================================================

1. Services won't start:
   - Check Docker is running: docker info
   - Check ports are free: netstat -tlnp | grep :80
   - Review logs: ./scripts/logs.sh

2. Cannot connect to Registry:
   - Verify REGISTRY_URL in .env file
   - Test connection: curl http://YOUR_REGISTRY/v2/
   - Check Registry authentication if required

3. Web UI not accessible:
   - Check frontend status: ./scripts/status.sh
   - Verify FRONTEND_PORT in .env file
   - Check firewall rules

4. API errors:
   - Check backend logs: ./scripts/logs.sh backend
   - Verify API_PORT in .env file
   - Check CORS_ORIGINS includes your client URL

================================================================================
SECURITY NOTES
================================================================================

1. The service runs with non-root users inside containers
2. Configure firewall rules to restrict access as needed
3. Use HTTPS proxy (nginx/apache) for production
4. Regularly update Docker images for security patches
5. Store Registry credentials securely

================================================================================
SUPPORT
================================================================================

For issues or questions:
- GitHub: https://github.com/your-org/repovista
- Documentation: See project README.md
- Logs: Always check ./scripts/logs.sh for error details

================================================================================

RepoVista - Making Docker Registry management simple and efficient!

================================================================================