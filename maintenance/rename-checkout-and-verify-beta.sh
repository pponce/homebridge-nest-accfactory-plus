{
  printf '%s\n' '=== Nest Climate checkout rename + npm verification START ==='
  nest_climate_rename_and_verify() {
    local old_dir="$HOME/devProjects/homebridge-nest-accfactory-plus"
    local new_dir="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local checkout_dir origin_url release_dir attempt verified
    local package='homebridge-nest-climate-cntrl'
    local version='0.5.0-beta.1'
    if [ -e "$old_dir" ] && [ -e "$new_dir" ]; then
      printf '%s\n' 'Both directories exist. Nothing renamed; review the two folders first.'
      return 1
    fi
    if [ -d "$old_dir" ]; then checkout_dir="$old_dir"; else checkout_dir="$new_dir"; fi
    if [ ! -d "$checkout_dir/.git" ]; then
      printf '%s\n' 'Expected a regular Git checkout. Nothing renamed; a linked worktree needs git worktree move.'
      return 1
    fi
    git -C "$checkout_dir" rev-parse --show-toplevel >/dev/null || return 1
    origin_url=$(git -C "$checkout_dir" remote get-url origin) || return 1
    case "$origin_url" in
      https://github.com/pponce/homebridge-nest-accfactory-plus|https://github.com/pponce/homebridge-nest-accfactory-plus.git|https://github.com/pponce/homebridge-nest-climate-cntrl|https://github.com/pponce/homebridge-nest-climate-cntrl.git)
        origin_url='https://github.com/pponce/homebridge-nest-climate-cntrl.git' ;;
      git@github.com:pponce/homebridge-nest-accfactory-plus.git|git@github.com:pponce/homebridge-nest-climate-cntrl.git)
        origin_url='git@github.com:pponce/homebridge-nest-climate-cntrl.git' ;;
      *) printf '%s\n' 'Unexpected origin URL. Nothing renamed; review the checkout before continuing.'; return 1 ;;
    esac
    if [ "$checkout_dir" = "$old_dir" ]; then mv -T -- "$old_dir" "$new_dir" || return 1; fi
    git -C "$new_dir" remote set-url origin "$origin_url" || return 1
    printf 'Project directory: %s\nOrigin: %s\n' "$new_dir" "$origin_url"
    printf '%s\n' 'Git history, local changes and project files were retained. No checkout, reset or install was performed.'
    release_dir="$new_dir/maintenance/releases/v$version"
    if [ ! -f "$release_dir/$package-$version.tgz" ]; then
      printf '%s\n' 'The downloaded release tarball is missing. Rename is complete; npm verification was skipped.'
      return 1
    fi
    if ! command -v npm >/dev/null || ! command -v node >/dev/null; then
      printf '%s\n' 'Rename complete. npm and Node.js are required to verify the published package.'
      return 1
    fi
    verified=false
    for attempt in {1..30}; do
      printf 'Checking npm visibility (%s/30); no publish request will be sent...\n' "$attempt"
      if npm --cache "$release_dir/npm-cache" view "$package@$version" dist.integrity --json --prefer-online --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org > "$release_dir/registry-integrity.json" 2>/dev/null &&
        [ "$(npm --cache "$release_dir/npm-cache" view "$package@beta" version --prefer-online --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org 2>/dev/null)" = "$version" ]; then
        verified=true
        break
      fi
      if [ "$attempt" -lt 30 ]; then sleep 10; fi
    done
    if [ "$verified" != true ]; then
      printf '%s\n' 'Rename complete. npm is still not verifiable; do not republish the accepted version.'
      return 2
    fi
    node - "$release_dir/$package-$version.tgz" "$release_dir/registry-integrity.json" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const expected = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(process.argv[2])).digest('base64');
if (JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) !== expected) {
  console.error('Registry package differs from the downloaded release. Stop and review.');
  process.exitCode = 1;
}
NODE
    if [ "$?" -ne 0 ]; then return 1; fi
    printf '%s\n' "$package@$version" > "$release_dir/npm-upload-accepted" || return 1
    printf '%s\n' "Verified on npm: $package@$version, beta tag and package integrity match."
  }
  if nest_climate_rename_and_verify; then
    printf '%s\n' '=== Nest Climate checkout rename + npm verification END: SUCCESS ==='
  else
    case "$?" in
      2) printf '%s\n' '=== Nest Climate checkout rename + npm verification END: RENAMED, npm PENDING ===' ;;
      *) printf '%s\n' '=== Nest Climate checkout rename + npm verification END: STOPPED — review the message above ===' ;;
    esac
  fi
  unset -f nest_climate_rename_and_verify
  nest_climate_report=''
  for nest_climate_candidate in "$HOME/devProjects/homebridge-nest-climate-cntrl"/maintenance/migration/preflight-*.json; do
    if [ -f "$nest_climate_candidate" ]; then nest_climate_report="$nest_climate_candidate"; fi
  done
  if [ -n "$nest_climate_report" ]; then
    printf 'Migration report: %s\n' "$nest_climate_report"
    read -r nest_climate_client_ip nest_climate_client_port nest_climate_server_ip nest_climate_server_port <<< "${SSH_CONNECTION:-}"
    if [ -n "$nest_climate_server_ip" ]; then
      printf 'Copy to your Mac:\nrsync -P %s@%s:%s ~/Downloads/\n' "$(id -un)" "$nest_climate_server_ip" "$nest_climate_report"
    fi
  fi
  unset nest_climate_report nest_climate_candidate nest_climate_client_ip nest_climate_client_port nest_climate_server_ip nest_climate_server_port
}
