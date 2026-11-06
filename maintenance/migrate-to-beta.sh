{
  printf '%s\n' '=== Nest Climate child-bridge migration START ==='
  nest_climate_migrate() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local package='homebridge-nest-climate-cntrl'
    local version='0.5.0-beta.1'
    local helper_ref='a108c4d1d80e1d9e2a3f79aced59ba4b07aa5dc0'
    local helper_sha='0486420172419ded0e969df7e2bf93a82fda0ef1e35a62e7edeb045e9a2af59b'
    local expected_count="${1:-}" work release helper stamp snapshot_result snapshot report
    local client_ip client_port server_ip server_port
    if [[ ! "$expected_count" =~ ^[1-9][0-9]*$ ]]; then
      printf '%s\n' 'Supply the reviewed accessory count. Run only after approving the local backup and cache migration.'
      return 1
    fi
    if [ ! -d "$project/.git" ]; then
      printf '%s\n' 'Expected the existing renamed development checkout.'
      return 1
    fi
    work="$project/maintenance/migration"
    release="$project/maintenance/releases/v$version"
    helper="$work/migrate-child-bridge.mjs"
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    snapshot_result="$work/snapshot-$stamp.json"
    report="$work/migration-$stamp.json"
    mkdir -p "$work" || return 1
    if [ ! -f "$release/$package-$version.tgz" ]; then
      printf '%s\n' 'The tested release tarball is missing. Homebridge has not been stopped.'
      return 1
    fi
    curl -fsSL --retry 3 --max-time 60 \
      "https://raw.githubusercontent.com/pponce/homebridge-nest-climate-cntrl/$helper_ref/maintenance/migrate-child-bridge.mjs" \
      -o "$helper" || return 1
    printf '%s  %s\n' "$helper_sha" "$helper" | sha256sum -c - || return 1
    sudo node "$helper" plan /var/lib/homebridge "$expected_count" || return 1
    printf '%s\n' 'Verifying the exact npm release before stopping Homebridge...'
    npm --cache "$release/npm-cache" view "$package@$version" dist.integrity --json --prefer-online \
      --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org > "$release/registry-integrity.json" || return 1
    node - "$release/$package-$version.tgz" "$release/registry-integrity.json" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const expected = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(process.argv[2])).digest('base64');
if (JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) !== expected) {
  console.error('The registry package differs from the tested release. Homebridge has not been stopped.');
  process.exitCode = 1;
}
NODE
    if [ "$?" -ne 0 ]; then return 1; fi
    sudo hb-service stop || return 1
    if ! (umask 077; sudo node "$helper" snapshot /var/lib/homebridge "$project" "$expected_count" > "$snapshot_result"); then
      printf '%s\n' 'Snapshot failed. Restoring the original service without changing its configuration.'
      sudo hb-service start
      return 1
    fi
    if ! snapshot=$(node -e "const fs = require('node:fs'); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).snapshot);" "$snapshot_result"); then
      printf '%s\n' 'Could not read the snapshot result. Restoring the original service.'
      sudo hb-service start
      return 1
    fi
    printf 'Private rollback snapshot: %s\n' "$snapshot"
    if sudo hb-service add "$package@$version" &&
      (umask 077; sudo node "$helper" apply "$snapshot" > "$report"); then
      if sudo hb-service start; then
        printf '%s\n' 'Migration applied. The original package remains installed for rollback.'
        printf 'Migration report: %s\n' "$report"
        read -r client_ip client_port server_ip server_port <<< "${SSH_CONNECTION:-}"
        if [ -n "$server_ip" ]; then
          printf 'Copy this report to your computer (keep the private snapshot on the server):\nrsync -P %s@%s:%s ~/Downloads/\n' "$(id -un)" "$server_ip" "$report"
        fi
        printf 'Check that all %s existing accessories respond in Apple Home and retain their rooms/scenes.\n' "$expected_count"
      else
        printf '%s\n' 'Migration was applied, but Homebridge did not start. Keep the snapshot and review /var/lib/homebridge/homebridge.log.'
        return 1
      fi
    else
      printf '%s\n' 'Installation or migration failed. Restoring the original configuration and cache...'
      if sudo node "$helper" rollback "$snapshot"; then
        if sudo hb-service start; then
          printf '%s\n' 'Original configuration restored. The beta package may remain installed but is not configured.'
        else
          printf '%s\n' 'Original configuration restored, but Homebridge did not start. Review /var/lib/homebridge/homebridge.log.'
        fi
      else
        printf '%s\n' 'Rollback did not complete. Homebridge remains stopped; retain the snapshot for recovery.'
      fi
      return 1
    fi
  }
  if nest_climate_migrate "${1:-}"; then
    printf '%s\n' '=== Nest Climate child-bridge migration END: SUCCESS ==='
  else
    printf '%s\n' '=== Nest Climate child-bridge migration END: STOPPED — review the message above ==='
  fi
  unset -f nest_climate_migrate
}
