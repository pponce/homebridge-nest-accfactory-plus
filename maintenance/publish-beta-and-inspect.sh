{
  printf '%s\n' '=== Nest Climate Cntrl beta publish + inspection START ==='
  nest_climate_beta_tasks() {
    local project_dir release_dir report_dir report_file asset username server_ip client_ip client_port server_port candidate attempt verified
    local project_folders=()
    local version='0.5.0-beta.1'
    local package='homebridge-nest-climate-cntrl'
    local release_url='https://github.com/pponce/homebridge-nest-climate-cntrl/releases/download/v0.5.0-beta.1'
    for candidate in "$HOME/devProjects/homebridge-nest-climate-cntrl" "$HOME/devProjects/homebridge-nest-accfactory-plus" "$HOME/devProjects/homebridge-nest-accfactory"; do
      if [ -d "$candidate" ]; then project_folders+=("$candidate"); fi
    done
    if [ "${#project_folders[@]}" -gt 1 ]; then
      printf '%s\n' 'Multiple Nest project folders exist. Choose the active checkout before continuing.'
      return 1
    fi
    if [ "${#project_folders[@]}" -eq 1 ]; then
      project_dir="${project_folders[0]}"
    else
      project_dir="$HOME/devProjects/homebridge-nest-climate-cntrl"
    fi
    release_dir="$project_dir/maintenance/releases/v$version"
    report_dir="$project_dir/maintenance/migration"
    mkdir -p "$release_dir" "$report_dir" || return 1
    for asset in "$package-$version.tgz" nest-climate-migration-preflight.mjs SHA256SUMS; do
      curl --fail --location --silent --show-error "$release_url/$asset" --output "$release_dir/$asset" || return 1
    done
    (cd "$release_dir" && sha256sum --check --ignore-missing SHA256SUMS) || return 1
    report_file="$report_dir/preflight-$(date -u +%Y%m%dT%H%M%SZ).json"
    printf '%s\n' 'Inspecting Homebridge without changing configuration, caches or pairing data...'
    if sudo node "$release_dir/nest-climate-migration-preflight.mjs" --storage /var/lib/homebridge > "$report_file"; then
      chmod 600 "$report_file" || return 1
      printf 'Inspection report: %s\n' "$report_file"
      username=$(id -un)
      read -r client_ip client_port server_ip server_port <<< "${SSH_CONNECTION:-}"
      if [ -n "$server_ip" ]; then
        printf 'Copy to your Mac:\nrsync -P %s@%s:%s ~/Downloads/\n' "$username" "$server_ip" "$report_file"
      fi
    else
      printf 'Inspection could not read the installation. Report: %s\n' "$report_file"
      return 1
    fi
    printf '%s\n' 'Checking npm authentication. Complete npm login/2FA in this terminal if prompted.'
    npm --cache "$release_dir/npm-cache" whoami --registry=https://registry.npmjs.org >/dev/null 2>&1 ||
      npm --cache "$release_dir/npm-cache" login --registry=https://registry.npmjs.org || return 1
    if npm --cache "$release_dir/npm-cache" view "$package@$version" dist.integrity --json --prefer-online --registry=https://registry.npmjs.org > "$release_dir/registry-integrity.json" 2>/dev/null; then
      printf '%s\n' 'Version already exists. Verifying it matches the tested release package.'
    elif [ -f "$release_dir/npm-upload-accepted" ]; then
      printf '%s\n' 'A previous upload was accepted. Waiting for registry availability without publishing again.'
    else
      npm --cache "$release_dir/npm-cache" publish "$release_dir/$package-$version.tgz" --ignore-scripts --access public --tag beta --registry=https://registry.npmjs.org || return 1
      printf '%s\n' "$package@$version" > "$release_dir/npm-upload-accepted" || return 1
    fi
    verified=false
    for attempt in {1..30}; do
      printf 'Checking npm availability (%s/30)...\n' "$attempt"
      if npm --cache "$release_dir/npm-cache" view "$package@$version" dist.integrity --json --prefer-online --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org > "$release_dir/registry-integrity.json" 2>/dev/null &&
        [ "$(npm --cache "$release_dir/npm-cache" view "$package@beta" version --prefer-online --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org 2>/dev/null)" = "$version" ]; then
        verified=true
        break
      fi
      if [ "$attempt" -lt 30 ]; then sleep 10; fi
    done
    if [ "$verified" != true ]; then
      printf '%s\n' 'npm publication is not yet verifiable. Do not republish an accepted upload; retry verification later.'
      return 2
    fi
    node - "$release_dir/$package-$version.tgz" "$release_dir/registry-integrity.json" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const expected = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(process.argv[2])).digest('base64');
if (JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) !== expected) {
  console.error('Published package does not match the tested GitHub release. Stop and review.');
  process.exitCode = 1;
}
NODE
    if [ "$?" -ne 0 ]; then return 1; fi
    printf '%s\n' "Published and verified: $package@$version (beta)." 'The running Homebridge installation has not been changed. No backups were created.'
    printf 'Return this report for the migration plan: %s\n' "$report_file"
  }
  if nest_climate_beta_tasks; then
    printf '%s\n' '=== Nest Climate Cntrl beta publish + inspection END: SUCCESS ==='
  else
    case "$?" in
      2) printf '%s\n' '=== Nest Climate Cntrl beta publish + inspection END: PENDING registry verification ===' ;;
      *) printf '%s\n' '=== Nest Climate Cntrl beta publish + inspection END: FAILED — review the message above ===' ;;
    esac
  fi
  unset -f nest_climate_beta_tasks
}
