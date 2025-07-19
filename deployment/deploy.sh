#!/bin/bash

# Kenya Votes Live - Production Deployment Script
# This script deploys the application to production with all optimizations

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="kenya-votes-live"
DOCKER_REGISTRY="your-registry.com"
VERSION=$(git rev-parse --short HEAD)
ENVIRONMENT=${1:-production}

echo -e "${BLUE}🚀 Starting deployment of Kenya Votes Live to ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if environment file exists
    if [ ! -f ".env.${ENVIRONMENT}" ]; then
        print_error "Environment file .env.${ENVIRONMENT} not found"
        exit 1
    fi
    
    print_status "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    print_status "Loading environment variables..."
    export $(cat .env.${ENVIRONMENT} | grep -v '^#' | xargs)
    print_status "Environment variables loaded"
}

# Build Docker images
build_images() {
    print_status "Building Docker images..."
    
    # Build main application
    docker build -t ${DOCKER_REGISTRY}/${PROJECT_NAME}:${VERSION} -t ${DOCKER_REGISTRY}/${PROJECT_NAME}:latest .
    
    # Build nginx image with custom config
    docker build -t ${DOCKER_REGISTRY}/${PROJECT_NAME}-nginx:${VERSION} -t ${DOCKER_REGISTRY}/${PROJECT_NAME}-nginx:latest -f deployment/Dockerfile.nginx .
    
    print_status "Docker images built successfully"
}

# Run database migrations
run_migrations() {
    print_status "Running database migrations..."
    
    # Create migration container
    docker run --rm \
        --env-file .env.${ENVIRONMENT} \
        --network ${PROJECT_NAME}_kenya-votes-network \
        ${DOCKER_REGISTRY}/${PROJECT_NAME}:${VERSION} \
        npx prisma migrate deploy
    
    print_status "Database migrations completed"
}

# Deploy application
deploy_application() {
    print_status "Deploying application..."
    
    # Stop existing containers
    docker-compose -f deployment/docker-compose.prod.yml down
    
    # Start new deployment
    docker-compose -f deployment/docker-compose.prod.yml up -d
    
    # Wait for services to be healthy
    print_status "Waiting for services to be healthy..."
    sleep 30
    
    # Check health status
    check_health_status
    
    print_status "Application deployed successfully"
}

# Check health status
check_health_status() {
    print_status "Checking health status..."
    
    # Check main application
    if curl -f http://localhost/health > /dev/null 2>&1; then
        print_status "Main application is healthy"
    else
        print_error "Main application health check failed"
        exit 1
    fi
    
    # Check database
    if docker exec ${PROJECT_NAME}-postgres pg_isready -U ${POSTGRES_USER:-kenya_votes} > /dev/null 2>&1; then
        print_status "Database is healthy"
    else
        print_error "Database health check failed"
        exit 1
    fi
    
    # Check Redis
    if docker exec ${PROJECT_NAME}-redis-master redis-cli ping > /dev/null 2>&1; then
        print_status "Redis is healthy"
    else
        print_error "Redis health check failed"
        exit 1
    fi
}

# Setup monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."
    
    # Create Grafana dashboards
    if [ -d "deployment/grafana/dashboards" ]; then
        docker cp deployment/grafana/dashboards/. ${PROJECT_NAME}-grafana:/etc/grafana/provisioning/dashboards/
    fi
    
    # Create Grafana datasources
    if [ -d "deployment/grafana/datasources" ]; then
        docker cp deployment/grafana/datasources/. ${PROJECT_NAME}-grafana:/etc/grafana/provisioning/datasources/
    fi
    
    print_status "Monitoring setup completed"
}

# Setup SSL certificates
setup_ssl() {
    print_status "Setting up SSL certificates..."
    
    # Check if certificates exist
    if [ ! -f "deployment/ssl/kenya-votes-live.crt" ] || [ ! -f "deployment/ssl/kenya-votes-live.key" ]; then
        print_warning "SSL certificates not found. Using self-signed certificates for development."
        
        # Generate self-signed certificate
        mkdir -p deployment/ssl
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout deployment/ssl/kenya-votes-live.key \
            -out deployment/ssl/kenya-votes-live.crt \
            -subj "/C=KE/ST=Nairobi/L=Nairobi/O=Kenya Votes Live/CN=kenya-votes-live.com"
    fi
    
    print_status "SSL certificates configured"
}

# Setup backup
setup_backup() {
    print_status "Setting up backup configuration..."
    
    # Create backup script
    cat > deployment/backup-script.sh << 'EOF'
#!/bin/bash
set -e

# Backup database
pg_dump -h postgres -U $POSTGRES_USER -d $POSTGRES_DB > /backups/backup-$(date +%Y%m%d-%H%M%S).sql

# Upload to S3 if configured
if [ ! -z "$AWS_ACCESS_KEY_ID" ] && [ ! -z "$AWS_SECRET_ACCESS_KEY" ]; then
    aws s3 cp /backups/backup-$(date +%Y%m%d-%H%M%S).sql s3://kenya-votes-backups/
fi

# Clean old backups (keep last 7 days)
find /backups -name "backup-*.sql" -mtime +7 -delete
EOF
    
    chmod +x deployment/backup-script.sh
    print_status "Backup configuration completed"
}

# Run performance tests
run_performance_tests() {
    print_status "Running performance tests..."
    
    # Wait for application to be fully ready
    sleep 60
    
    # Run basic load test
    if command -v artillery &> /dev/null; then
        artillery run load-tests/simple-load-test.yml
        print_status "Performance tests completed"
    else
        print_warning "Artillery not installed, skipping performance tests"
    fi
}

# Setup auto-scaling
setup_autoscaling() {
    print_status "Setting up auto-scaling..."
    
    # Create auto-scaling configuration
    cat > deployment/autoscaling.yml << EOF
version: '3.8'
services:
  app:
    deploy:
      replicas: 4
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
        interval: 30s
        timeout: 10s
        retries: 3
        start_period: 40s
EOF
    
    print_status "Auto-scaling configuration created"
}

# Main deployment process
main() {
    echo -e "${BLUE}Starting deployment process...${NC}"
    
    check_prerequisites
    load_environment
    setup_ssl
    setup_backup
    build_images
    deploy_application
    run_migrations
    setup_monitoring
    setup_autoscaling
    run_performance_tests
    
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo -e "${BLUE}Application URL: https://kenya-votes-live.com${NC}"
    echo -e "${BLUE}Monitoring URL: http://localhost:3001${NC}"
    echo -e "${BLUE}Health Check: https://kenya-votes-live.com/health${NC}"
}

# Run main function
main "$@" 