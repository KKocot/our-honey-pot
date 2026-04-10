#!/usr/bin/env bash
# deploy-community-image.sh
# Buduje obraz Docker our-honey-pot na VPS i konfiguruje hive-blog-service.
#
# Uruchomienie:
#   1. Skopiuj cale repozytorium our-honey-pot na VPS:
#      scp -r ./our-honey-pot/ barddev@82.208.20.77:/home/barddev/our-honey-pot/
#      lub: git clone https://github.com/KKocot/our-honey-pot.git na VPS
#
#   2. SSH na VPS i uruchom:
#      cd /home/barddev/our-honey-pot
#      chmod +x deploy-community-image.sh
#      ./deploy-community-image.sh
#
#   3. Zrestartuj hive-blog-service (jesli dziala jako kontener):
#      cd /home/barddev/hive-blog-service
#      docker build -t hive-blog-service:latest .
#      docker stop hive-blog-service && docker rm hive-blog-service
#      <uruchom kontener ponownie z nowym .env>

set -euo pipefail

# --- Konfiguracja ---
IMAGE_NAME="our-honey-pot"
IMAGE_TAG="latest"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
HIVE_BLOG_SERVICE_DIR="/home/barddev/hive-blog-service"
HIVE_BLOG_SERVICE_ENV="${HIVE_BLOG_SERVICE_DIR}/.env"
ENV_VAR_NAME="COMMUNITY_BLOG_IMAGE_NAME"

# --- Kolory ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- Sprawdzenie wymaganych narzedzi ---
if ! command -v docker &> /dev/null; then
    log_error "Docker nie jest zainstalowany lub niedostepny w PATH."
    exit 1
fi

# --- Krok 1: Budowanie obrazu Docker ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log_info "Budowanie obrazu Docker: ${FULL_IMAGE}"
log_info "Kontekst budowania: ${SCRIPT_DIR}"

docker build -t "${FULL_IMAGE}" "${SCRIPT_DIR}"

if [ $? -eq 0 ]; then
    log_info "Obraz ${FULL_IMAGE} zbudowany pomyslnie."
else
    log_error "Budowanie obrazu nie powiodlo sie."
    exit 1
fi

# --- Krok 2: Weryfikacja obrazu ---
log_info "Weryfikacja obrazu..."
IMAGE_ID=$(docker images -q "${FULL_IMAGE}" 2>/dev/null)
if [ -z "${IMAGE_ID}" ]; then
    log_error "Obraz ${FULL_IMAGE} nie zostal znaleziony po budowaniu."
    exit 1
fi
log_info "Obraz ID: ${IMAGE_ID}"
docker images "${IMAGE_NAME}" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

# --- Krok 3: Aktualizacja .env hive-blog-service ---
if [ ! -d "${HIVE_BLOG_SERVICE_DIR}" ]; then
    log_warn "Katalog ${HIVE_BLOG_SERVICE_DIR} nie istnieje."
    log_warn "Pominięto aktualizację .env — dodaj ręcznie:"
    log_warn "  ${ENV_VAR_NAME}=${FULL_IMAGE}"
else
    if [ ! -f "${HIVE_BLOG_SERVICE_ENV}" ]; then
        log_warn "Plik ${HIVE_BLOG_SERVICE_ENV} nie istnieje. Tworzenie..."
        touch "${HIVE_BLOG_SERVICE_ENV}"
    fi

    if grep -q "^${ENV_VAR_NAME}=" "${HIVE_BLOG_SERVICE_ENV}"; then
        # Zmienna juz istnieje — aktualizuj
        OLD_VALUE=$(grep "^${ENV_VAR_NAME}=" "${HIVE_BLOG_SERVICE_ENV}" | cut -d'=' -f2-)
        sed -i "s|^${ENV_VAR_NAME}=.*|${ENV_VAR_NAME}=${FULL_IMAGE}|" "${HIVE_BLOG_SERVICE_ENV}"
        log_info "Zaktualizowano ${ENV_VAR_NAME}: ${OLD_VALUE} -> ${FULL_IMAGE}"
    else
        # Zmienna nie istnieje — dodaj
        echo "${ENV_VAR_NAME}=${FULL_IMAGE}" >> "${HIVE_BLOG_SERVICE_ENV}"
        log_info "Dodano ${ENV_VAR_NAME}=${FULL_IMAGE} do ${HIVE_BLOG_SERVICE_ENV}"
    fi
fi

# --- Krok 4: Podsumowanie ---
echo ""
echo "=========================================="
echo "  Deploy our-honey-pot zakonczony"
echo "=========================================="
echo ""
echo "  Obraz:     ${FULL_IMAGE}"
echo "  Image ID:  ${IMAGE_ID}"
echo ""
echo "  Nastepne kroki:"
echo "  1. Upewnij sie, ze hive-blog-service ma ${ENV_VAR_NAME}=${FULL_IMAGE} w .env"
echo "  2. Zrestartuj hive-blog-service, zeby podbil nowy .env"
echo "  3. Nowe community blogi beda uzywac obrazu ${FULL_IMAGE}"
echo ""
echo "  Aby przetestowac obraz reczne:"
echo "    docker run --rm -p 4321:4321 -e HIVE_USERNAME=hive-123456 -e HOST=0.0.0.0 -e PORT=4321 ${FULL_IMAGE}"
echo ""
