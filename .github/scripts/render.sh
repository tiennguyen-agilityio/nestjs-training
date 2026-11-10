# shellcheck shell=bash
# Render API helpers. Sourced, not run, by deploy-api.yml (jobs deploy and preview) and
# preview-cleanup.yml, so they check the same settings and find the API preview by the same name.
# Needs RENDER_API_KEY in the environment.

# require_env NAME...: fails when one of the variables is empty.
require_env() {
  local name
  for name in "$@"; do
    if [ -z "${!name}" ]; then
      echo "$name is empty: set it in environment develop-deploy" >&2; return 1
    fi
  done
}

# Name of the API preview of pull request $1 (a preview of the Render develop service).
api_preview_name() {
  echo "nestjs-training-api-preview-pull-request-$1"
}

# render METHOD PATH [JSON BODY]: calls the Render API and prints the response body.
render() {
  local method=$1 path=$2 body=${3:-}
  local args=(-sS --fail-with-body -X "$method" "https://api.render.com/v1$path"
    -H "Authorization: Bearer $RENDER_API_KEY" -H 'Accept: application/json')
  # GETs are safe to repeat, so ride out a brief Render 5xx/429.
  if [ "$method" = GET ]; then args+=(--retry 3 --retry-delay 5 --retry-all-errors); fi
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  curl "${args[@]}"
}

# shellcheck disable=SC2016 # $name is a jq variable
find_service='[.[] | .service | select(.name == $name) | .id][0] // empty'

# find_api_preview NAME: prints the id of the service named NAME, or nothing.
find_api_preview() {
  render GET "/services?name=$1&includePreviews=true&limit=100" | jq -r --arg name "$1" "$find_service"
}
